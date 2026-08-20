import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

const directory = join(process.cwd(), 'database', 'migrations');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

let lockAcquired = false;
try {
  await client.query("SELECT pg_advisory_lock(hashtext('jogo-clube:schema-migrations'))");
  lockAcquired = true;
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(directory)).filter(file => /^\d{4,}_[a-z0-9][a-z0-9_-]*\.sql$/i.test(file)).sort();
  for (const file of files) {
    const version = file.split('_', 1)[0];
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
    if (applied.rowCount) continue;
    const sql = await readFile(join(directory, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.log(`Migração aplicada: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
} finally {
  if (lockAcquired) {
    await client.query("SELECT pg_advisory_unlock(hashtext('jogo-clube:schema-migrations'))").catch(() => undefined);
  }
  client.release();
  await pool.end();
}
