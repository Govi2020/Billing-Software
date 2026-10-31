import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';

const migrationTable = `
  CREATE TABLE IF NOT EXISTS backend_schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

async function apply(name, sql, transactional = true) {
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('brightloop_backend_migrations'))`);
    const alreadyApplied = await client.query('SELECT 1 FROM backend_schema_migrations WHERE name = $1', [name]);
    if (alreadyApplied.rowCount) {
      console.info(`Migration already applied: ${name}`);
      return;
    }
    if (transactional) await client.query('BEGIN');
    await client.query(sql);
    if (transactional) {
      await client.query('INSERT INTO backend_schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
    } else {
      // schema_new.sql owns its transaction boundary.
      await client.query('INSERT INTO backend_schema_migrations (name) VALUES ($1)', [name]);
    }
    console.info(`Applied migration: ${name}`);
  } catch (error) {
    if (transactional) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtext('brightloop_backend_migrations'))`);
    client.release();
  }
}

try {
  await pool.query(migrationTable);
  const baseline = await readFile(fileURLToPath(new URL('../../../schema_new.sql', import.meta.url)), 'utf8');
  const authHardening = await readFile(fileURLToPath(new URL('../../sql/0002_auth_hardening.sql', import.meta.url)), 'utf8');
  await apply('0001_schema_new', baseline, false);
  await apply('0002_auth_hardening', authHardening);
} catch (error) {
  console.error('Database migration failed:', error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await pool.end();
}
