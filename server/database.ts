import { Client } from 'pg';

/** Database name taken from a postgres URL. Only a plain identifier is accepted. */
export function databaseName(connectionString: string): string {
  const name = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error('DATABASE_URL must use a plain database name.');
  }
  return name;
}

/** Creates the application database when the login is allowed to, then returns. */
export async function ensureDatabase(connectionString: string): Promise<void> {
  const name = databaseName(connectionString);
  const admin = new URL(connectionString);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
}
