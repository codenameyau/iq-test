import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { Pool } from 'pg';
import { ensureDatabase } from './database.ts';
import { parseSubmission, type SubmissionRecord } from './payload.ts';

const PORT = Number(process.env.PORT ?? 3300);
const STATIC_DIR = process.env.STATIC_DIR;
const MAX_BODY = 48 * 1024;
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 20;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS submissions (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  submitted_at timestamptz NOT NULL,
  consented_at timestamptz NOT NULL,
  full_name text NOT NULL,
  dob date NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  country text NOT NULL,
  country_of_birth text NOT NULL,
  postal_code text NOT NULL,
  mode text NOT NULL,
  nonverbal boolean NOT NULL,
  age integer,
  age_normed boolean NOT NULL,
  age_adjustment_points integer NOT NULL,
  fsiq integer NOT NULL,
  ci_low integer NOT NULL,
  ci_high integer NOT NULL,
  sem double precision NOT NULL,
  reliability double precision NOT NULL,
  percentile integer NOT NULL,
  rarity text NOT NULL,
  classification_label text NOT NULL,
  classification_range text NOT NULL,
  index_spread integer NOT NULL,
  confidence text NOT NULL,
  total_correct integer NOT NULL,
  total_administered integer NOT NULL,
  duration_ms integer NOT NULL,
  active_ms integer NOT NULL,
  domains jsonb NOT NULL,
  types jsonb NOT NULL,
  flags jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions (created_at);
CREATE INDEX IF NOT EXISTS submissions_email_idx ON submissions (email);
`;

const hits = new Map<string, number[]>();

/** Read-only check. A hit is only recorded once a new submission is actually stored, so
 *  failed attempts and retries of the same finished test never exhaust a visitor's budget. */
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length === 0) hits.delete(ip);
  else hits.set(ip, recent);
  return recent.length >= MAX_PER_WINDOW;
}

function recordHit(ip: string): void {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(json);
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function insertSubmission(record: SubmissionRecord): Promise<'created' | 'exists'> {
  const result = await pool.query(
    `INSERT INTO submissions (
      session_id, submitted_at, consented_at, full_name, dob, email, phone, country, country_of_birth,
      postal_code, mode, nonverbal, age, age_normed, age_adjustment_points, fsiq, ci_low, ci_high, sem,
      reliability, percentile, rarity, classification_label, classification_range, index_spread, confidence,
      total_correct, total_administered, duration_ms, active_ms, domains, types, flags
    ) VALUES (
      $1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb,$31::jsonb,$32::jsonb
    ) ON CONFLICT (session_id) DO NOTHING`,
    [
      record.sessionId, record.submittedAt, record.fullName, record.dob, record.email, record.phone,
      record.country, record.countryOfBirth, record.postalCode, record.mode, record.nonverbal, record.age,
      record.ageNormed, record.ageAdjustmentPoints, record.fsiq, record.ciLow, record.ciHigh, record.sem,
      record.reliability, record.percentile, record.rarity, record.classificationLabel, record.classificationRange,
      record.indexSpread, record.confidence, record.totalCorrect, record.totalAdministered, record.durationMs,
      record.activeMs, JSON.stringify(record.domains), JSON.stringify(record.types), JSON.stringify(record.flags),
    ],
  );
  return result.rowCount === 1 ? 'created' : 'exists';
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  if (!STATIC_DIR) {
    send(res, 404, { error: 'Not found.' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const requested = normalize(decodeURIComponent(url.pathname));
  const relative = requested === '/' ? 'index.html' : requested.replace(/^[/\\]+/, '');
  if (relative.includes('..')) {
    send(res, 404, { error: 'Not found.' });
    return;
  }
  let file = join(STATIC_DIR, relative);
  if (!file.startsWith(STATIC_DIR) || !existsSync(file) || !statSync(file).isFile()) file = join(STATIC_DIR, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      await pool.query('SELECT 1');
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/submissions') {
      const ip = clientIp(req);
      if (limited(ip)) {
        send(res, 429, { error: 'Too many submissions. Try again later.' });
        return;
      }
      const raw = await readBody(req);
      if (raw === null) {
        send(res, 413, { error: 'Submission is too large.' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        send(res, 400, { error: 'Expected JSON.' });
        return;
      }
      const result = parseSubmission(parsed);
      if (!result.ok) {
        send(res, 400, { error: result.error });
        return;
      }
      const stored = await insertSubmission(result.value);
      if (stored === 'created') recordHit(ip);
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === 'GET') {
      serveStatic(req, res);
      return;
    }
    send(res, 404, { error: 'Not found.' });
  } catch (err) {
    console.error('request failed', err instanceof Error ? err.message : 'unknown');
    if (!res.headersSent) send(res, 500, { error: 'Could not save your results.' });
  }
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
await ensureDatabase(databaseUrl);
await pool.query(SCHEMA);
server.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
