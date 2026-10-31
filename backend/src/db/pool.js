import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'brightloop-api',
});

export async function withTransaction(callback, { retries = 0 } = {}) {
  let attempt = 0;
  for (;;) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // A broken connection may no longer be able to roll the transaction back.
      }
      if (attempt >= retries || !['40001', '40P01'].includes(error.code)) throw error;
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 20 * attempt));
    } finally {
      client.release();
    }
  }
}
