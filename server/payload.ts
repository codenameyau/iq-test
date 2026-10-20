/** Fields accepted from the browser. Question text and per-question answers are not among them. */

const MODES = new Set(['quick', 'standard', 'comprehensive']);
const DOMAINS = new Set(['matrices', 'verbal', 'spatial', 'series', 'memory']);
const RELATIVE = new Set(['strength', 'weakness', 'consistent']);
const VERDICTS = new Set(['above', 'below', 'expected']);
const SEVERITIES = new Set(['info', 'warning']);
const CONFIDENCE = new Set(['high', 'moderate', 'low']);

export interface DomainBreakdown {
  domain: string;
  iq: number;
  ciLow: number;
  ciHigh: number;
  percentile: number;
  correct: number;
  administered: number;
  medianSeconds: number;
  relative: string;
}

export interface TypeBreakdown {
  key: string;
  domain: string;
  name: string;
  correct: number;
  total: number;
  expected: number;
  z: number;
  verdict: string;
  averageDifficulty: number;
  hardestSolved: number | null;
  medianSeconds: number;
}

export interface FlagBreakdown {
  severity: string;
  title: string;
  detail: string;
}

export interface SubmissionRecord {
  sessionId: string;
  submittedAt: Date;
  fullName: string;
  dob: string;
  email: string;
  phone: string;
  country: string;
  countryOfBirth: string;
  postalCode: string;
  mode: string;
  nonverbal: boolean;
  age: number | null;
  ageNormed: boolean;
  ageAdjustmentPoints: number;
  fsiq: number;
  ciLow: number;
  ciHigh: number;
  sem: number;
  reliability: number;
  percentile: number;
  rarity: string;
  classificationLabel: string;
  classificationRange: string;
  indexSpread: number;
  confidence: string;
  totalCorrect: number;
  totalAdministered: number;
  durationMs: number;
  activeMs: number;
  domains: DomainBreakdown[];
  types: TypeBreakdown[];
  flags: FlagBreakdown[];
}

export type ParseResult = { ok: true; value: SubmissionRecord } | { ok: false; error: string };

export function parseSubmission(body: unknown): ParseResult {
  if (!isRecord(body)) return fail('Expected an object.');
  const sessionId = str(body.sessionId, 8, 80);
  if (!sessionId || !/^[A-Za-z0-9-]+$/.test(sessionId)) return fail('Invalid session.');
  const submittedAt = date(body.submittedAt);
  if (!submittedAt) return fail('Invalid submission time.');
  const fullName = str(body.fullName, 1, 200);
  if (!fullName) return fail('Enter your full name.');
  const dob = str(body.dob, 10, 10);
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(`${dob}T00:00:00Z`))) {
    return fail('Enter a valid date of birth.');
  }
  const email = str(body.email, 3, 320)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) return fail('Enter a valid email address.');
  const phone = str(body.phone, 8, 20);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) return fail('Enter a valid phone number.');
  const country = str(body.country, 2, 2);
  const countryOfBirth = str(body.countryOfBirth, 2, 2);
  if (!country || !/^[A-Z]{2}$/.test(country) || !countryOfBirth || !/^[A-Z]{2}$/.test(countryOfBirth)) {
    return fail('Select a country.');
  }
  const postalCode = str(body.postalCode, 2, 12);
  if (!postalCode) return fail('Enter a postal code.');
  const mode = str(body.mode, 1, 20);
  if (!mode || !MODES.has(mode)) return fail('Invalid test length.');
  if (typeof body.nonverbal !== 'boolean') return fail('Invalid test version.');
  const age = body.age === null ? null : int(body.age, 0, 130);
  if (age === undefined) return fail('Invalid age.');
  if (typeof body.ageNormed !== 'boolean') return fail('Invalid age norm.');
  const ageAdjustmentPoints = int(body.ageAdjustmentPoints, -80, 80);
  const fsiq = int(body.fsiq, 1, 250);
  const ciLow = int(body.ciLow, 1, 250);
  const ciHigh = int(body.ciHigh, 1, 250);
  const sem = num(body.sem, 0, 50);
  const reliability = num(body.reliability, 0, 1);
  const percentile = int(body.percentile, 0, 100);
  const rarity = str(body.rarity, 1, 120);
  const classificationLabel = str(body.classificationLabel, 1, 40);
  const classificationRange = str(body.classificationRange, 1, 20);
  const indexSpread = int(body.indexSpread, 0, 200);
  const confidence = str(body.confidence, 1, 20);
  const totalCorrect = int(body.totalCorrect, 0, 500);
  const totalAdministered = int(body.totalAdministered, 0, 500);
  const durationMs = int(body.durationMs, 0, 86_400_000);
  const activeMs = int(body.activeMs, 0, 86_400_000);
  if (
    ageAdjustmentPoints === undefined || fsiq === undefined || ciLow === undefined || ciHigh === undefined ||
    sem === undefined || reliability === undefined || percentile === undefined || !rarity ||
    !classificationLabel || !classificationRange || indexSpread === undefined ||
    !confidence || !CONFIDENCE.has(confidence) || totalCorrect === undefined ||
    totalAdministered === undefined || durationMs === undefined || activeMs === undefined
  ) {
    return fail('Invalid score.');
  }
  const domains = domainList(body.domains);
  const types = typeList(body.types);
  const flags = flagList(body.flags);
  if (!domains || !types || !flags) return fail('Invalid score breakdown.');

  return {
    ok: true,
    value: {
      sessionId, submittedAt, fullName, dob, email, phone, country, countryOfBirth, postalCode,
      mode, nonverbal: body.nonverbal, age, ageNormed: body.ageNormed, ageAdjustmentPoints,
      fsiq, ciLow, ciHigh, sem, reliability, percentile, rarity, classificationLabel, classificationRange,
      indexSpread, confidence, totalCorrect, totalAdministered, durationMs, activeMs,
      domains, types, flags,
    },
  };
}

function domainList(value: unknown): DomainBreakdown[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const out: DomainBreakdown[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const domain = str(item.domain, 1, 20);
    const iq = int(item.iq, 1, 250);
    const ciLow = int(item.ciLow, 1, 250);
    const ciHigh = int(item.ciHigh, 1, 250);
    const percentile = int(item.percentile, 0, 100);
    const correct = int(item.correct, 0, 500);
    const administered = int(item.administered, 0, 500);
    const medianSeconds = num(item.medianSeconds, 0, 3600);
    const relative = str(item.relative, 1, 20);
    if (!domain || !DOMAINS.has(domain) || iq === undefined || ciLow === undefined || ciHigh === undefined ||
      percentile === undefined || correct === undefined || administered === undefined ||
      medianSeconds === undefined || !relative || !RELATIVE.has(relative)) return null;
    out.push({ domain, iq, ciLow, ciHigh, percentile, correct, administered, medianSeconds, relative });
  }
  return out;
}

function typeList(value: unknown): TypeBreakdown[] | null {
  if (!Array.isArray(value) || value.length > 40) return null;
  const out: TypeBreakdown[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const key = str(item.key, 1, 64);
    const domain = str(item.domain, 1, 20);
    const name = str(item.name, 1, 80);
    const correct = int(item.correct, 0, 500);
    const total = int(item.total, 0, 500);
    const expected = num(item.expected, 0, 500);
    const z = num(item.z, -20, 20);
    const verdict = str(item.verdict, 1, 20);
    const averageDifficulty = num(item.averageDifficulty, -10, 10);
    const hardestSolved = item.hardestSolved === null ? null : num(item.hardestSolved, -10, 10);
    const medianSeconds = num(item.medianSeconds, 0, 3600);
    if (!key || !domain || !DOMAINS.has(domain) || !name || correct === undefined || total === undefined ||
      expected === undefined || z === undefined || !verdict || !VERDICTS.has(verdict) ||
      averageDifficulty === undefined || hardestSolved === undefined || medianSeconds === undefined) return null;
    out.push({ key, domain, name, correct, total, expected, z, verdict, averageDifficulty, hardestSolved, medianSeconds });
  }
  return out;
}

function flagList(value: unknown): FlagBreakdown[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const out: FlagBreakdown[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const severity = str(item.severity, 1, 20);
    const title = str(item.title, 1, 120);
    const detail = str(item.detail, 0, 500);
    if (!severity || !SEVERITIES.has(severity) || !title || detail === undefined) return null;
    out.push({ severity, title, detail });
  }
  return out;
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, min: number, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return undefined;
  return trimmed;
}

function int(value: unknown, min: number, max: number): number | undefined {
  const n = num(value, min, max);
  return n === undefined ? undefined : Math.round(n);
}

function num(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

function date(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const skew = parsed.getTime() - Date.now();
  if (skew > 5 * 60_000 || skew < -7 * 24 * 60 * 60_000) return undefined;
  return parsed;
}
