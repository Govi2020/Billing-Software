export async function findUserByEmail(db, normalizedEmail) {
  const { rows } = await db.query(
    `SELECT id, email, password_hash, full_name, role, is_active, failed_login_count,
            locked_until, must_change_password, email_verified_at, last_login_at, created_by, created_at, updated_at
       FROM users WHERE lower(email) = $1`,
    [normalizedEmail],
  );
  return rows[0] ?? null;
}

export async function enqueueEmail(db, { to, template, payload, dedupeKey }) {
  await db.query(
    `INSERT INTO email_outbox (to_email, template, payload, dedupe_key)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [to, template, JSON.stringify(payload), dedupeKey],
  );
}
