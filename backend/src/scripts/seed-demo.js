import argon2 from 'argon2';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/pool.js';

if (config.NODE_ENV === 'production') {
  console.error('Demo seeding is disabled in production.');
  process.exit(1);
}

if (!config.DEMO_SEED_PASSWORD) {
  console.error('Set DEMO_SEED_PASSWORD in the local environment before seeding demo accounts.');
  process.exit(1);
}

if (config.DEMO_SEED_PASSWORD.length < 9
    || !/[A-Z]/.test(config.DEMO_SEED_PASSWORD)
    || !/[a-z]/.test(config.DEMO_SEED_PASSWORD)
    || !/[^A-Za-z0-9]/.test(config.DEMO_SEED_PASSWORD)) {
  console.error('DEMO_SEED_PASSWORD does not meet the password policy.');
  process.exit(1);
}

const hash = await argon2.hash(config.DEMO_SEED_PASSWORD, { type: argon2.argon2id });
const demoUsers = [
  { email: 'admin@brightloop.test', name: 'Anika Rao', role: 'admin' },
  { email: 'staff@brightloop.test', name: 'Rohan Mehta', role: 'staff' },
  { email: 'customer@brightloop.test', name: 'Priya Shah', role: 'customer' },
];

try {
  await withTransaction(async db => {
    for (const user of demoUsers) {
      await db.query(
        `INSERT INTO users (email, password_hash, full_name, role, email_verified_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT ((lower(email))) DO NOTHING`,
        [user.email, hash, user.name, user.role],
      );
    }
    await db.query(
      `INSERT INTO customers (user_id, name, company_name, email)
       SELECT id, 'Priya Shah', 'Shah & Co.', email
         FROM users
        WHERE lower(email) = lower('customer@brightloop.test')
       ON CONFLICT (user_id) DO NOTHING`,
    );
  });
  console.info('Demo accounts seeded. Credentials were not printed.');
} finally {
  await pool.end();
}
