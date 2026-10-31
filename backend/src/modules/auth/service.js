import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { hashToken, newFamilyId, newOpaqueToken, signAccessToken } from '../../lib/tokens.js';
import { assertPasswordPolicy, DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';
import { enqueueEmail, findUserByEmail } from './repository.js';

const refreshDays = 14;
const publicUser = user => ({
  id: user.id,
  email: user.email,
  full_name: user.full_name,
  role: user.role,
  is_active: user.is_active,
  must_change_password: user.must_change_password,
  email_verified_at: user.email_verified_at,
  last_login_at: user.last_login_at,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

function sessionCookies(res, refreshToken) {
  const common = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/api/v1/auth',
  };
  res.cookie(config.REFRESH_COOKIE_NAME, refreshToken, {
    ...common,
    maxAge: refreshDays * 24 * 60 * 60 * 1000,
  });
  // Double-submit CSRF token. It is not an authentication credential.
  res.cookie('brightloop_csrf', randomUUID(), {
    ...common,
    httpOnly: false,
    maxAge: refreshDays * 24 * 60 * 60 * 1000,
  });
}

export async function signup(input) {
  const email = input.email.trim().toLowerCase();
  assertPasswordPolicy(input.password, [email, input.full_name]);
  const passwordHash = await hashPassword(input.password);
  const rawToken = newOpaqueToken();
  let result;
  try {
    result = await withTransaction(async db => {
      const existing = await findUserByEmail(db, email);
      if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');

      const { rows: userRows } = await db.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, 'customer')
         RETURNING id, email, full_name, role, is_active, must_change_password, email_verified_at, last_login_at, created_at, updated_at`,
        [email, passwordHash, input.full_name.trim()],
      );
      const user = userRows[0];

      // Existing staff-created customer records are linked only after verification.
      const { rows: customers } = await db.query(
        `SELECT id FROM customers WHERE lower(email) = $1 AND user_id IS NULL ORDER BY id LIMIT 2 FOR UPDATE`,
        [email],
      );
      if (customers.length > 1) {
        throw new AppError(409, 'CUSTOMER_LINK_AMBIGUOUS', 'Contact support to verify this email before creating an account.');
      }
      if (!customers.length) {
        await db.query(
          `INSERT INTO customers (user_id, name, email) VALUES ($1, $2, $3)`,
          [user.id, user.full_name, user.email],
        );
      }

      await db.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '24 hours')`,
        [user.id, hashToken(rawToken)],
      );
      await enqueueEmail(db, {
        to: email,
        template: 'email_verification',
        payload: { full_name: user.full_name, url: `${config.API_BASE_URL}/api/v1/auth/verify-email?token=${encodeURIComponent(rawToken)}` },
        dedupeKey: `verify:${user.id}:${hashToken(rawToken)}`,
      });
      return user;
    });
  } catch (error) {
    if (error.code === '23505') throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    throw error;
  }
  return publicUser(result);
}

export async function verifyEmail(rawToken) {
  const tokenHash = hashToken(rawToken);
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE email_verification_tokens
          SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [tokenHash],
    );
    if (!rows[0]) throw new AppError(422, 'INVALID_OR_EXPIRED_TOKEN', 'The verification link is invalid or expired.');
    await db.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [rows[0].user_id]);
    await db.query(
      `WITH customer_to_link AS (
         SELECT id FROM customers
          WHERE lower(email) = (SELECT lower(email) FROM users WHERE id = $1)
            AND user_id IS NULL
          ORDER BY id LIMIT 1 FOR UPDATE
       )
       UPDATE customers c SET user_id=$1 FROM customer_to_link match
        WHERE c.id=match.id`,
      [rows[0].user_id],
    );
    return { verified: true };
  });
}

export async function login(input, req, res) {
  const email = input.email.trim().toLowerCase();
  const user = await findUserByEmail(pool, email);
  const passwordMatches = await verifyPassword(user?.password_hash ?? DUMMY_PASSWORD_HASH, input.password);
  const locked = user?.locked_until && new Date(user.locked_until) > new Date();
  if (!user || !passwordMatches || !user.is_active || locked) {
    if (user && user.is_active && !locked && !passwordMatches) {
      await pool.query(
        `UPDATE users
            SET failed_login_count = CASE WHEN failed_login_count + 1 >= 5 THEN 0 ELSE failed_login_count + 1 END,
                locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
          WHERE id = $1`,
        [user.id],
      );
    }
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  if (!user.email_verified_at) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in.');
  }

  const rawRefresh = newOpaqueToken();
  const familyId = newFamilyId();
  const updated = await withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
        WHERE id = $1 AND is_active
        RETURNING id, email, full_name, role, is_active, must_change_password, email_verified_at, last_login_at, created_at, updated_at`,
      [user.id],
    );
    if (!rows[0]) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    if (['admin', 'staff'].includes(user.role)) {
      await db.query(
        `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
         VALUES ($1, 'auth.login', 'user', $1, '{}'::jsonb)`,
        [user.id],
      );
    }
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, now() + interval '14 days', $4, $5)`,
      [user.id, hashToken(rawRefresh), familyId, req.get('user-agent') ?? null, req.ip],
    );
    return rows[0];
  });
  sessionCookies(res, rawRefresh);
  return { accessToken: signAccessToken(updated), user: publicUser(updated) };
}

export async function refresh(rawToken, req, res) {
  if (!rawToken) throw new AppError(401, 'UNAUTHENTICATED', 'Refresh session is required.');
  const tokenHash = hashToken(rawToken);
  const nextRaw = newOpaqueToken();
  const result = await withTransaction(async db => {
    const { rows } = await db.query(
      `SELECT rt.id, rt.user_id, rt.family_id, rt.revoked_at, rt.expires_at,
              u.id AS uid, u.email, u.full_name, u.role, u.is_active,
              u.must_change_password, u.email_verified_at, u.last_login_at, u.created_at, u.updated_at
         FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1 FOR UPDATE OF rt, u`,
      [tokenHash],
    );
    const token = rows[0];
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Refresh session is invalid or expired.');
    if (token.revoked_at) {
      await db.query(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1`, [token.family_id]);
      return { reuseDetected: true };
    }
    if (new Date(token.expires_at) <= new Date() || !token.is_active) {
      await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [token.id]);
      return { invalid: true };
    }
    await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [token.id]);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, now() + interval '14 days', $4, $5)`,
      [token.user_id, hashToken(nextRaw), token.family_id, req.get('user-agent') ?? null, req.ip],
    );
    return {
      reuseDetected: false,
      invalid: false,
      accessToken: signAccessToken({
        id: token.uid,
        role: token.role,
        must_change_password: token.must_change_password,
      }),
      user: publicUser({
        id: token.uid, email: token.email, full_name: token.full_name, role: token.role,
        is_active: token.is_active, must_change_password: token.must_change_password,
        email_verified_at: token.email_verified_at, last_login_at: token.last_login_at, created_at: token.created_at, updated_at: token.updated_at,
      }),
    };
  });
  if (result.reuseDetected) {
    clearSessionCookies(res);
    throw new AppError(401, 'REFRESH_TOKEN_REUSE', 'Refresh session reuse detected. Sign in again.');
  }
  if (result.invalid) {
    clearSessionCookies(res);
    throw new AppError(401, 'UNAUTHENTICATED', 'Refresh session is invalid or expired.');
  }
  sessionCookies(res, nextRaw);
  const { reuseDetected: _reuseDetected, invalid: _invalid, ...session } = result;
  return session;
}

export async function logout(rawToken, res) {
  if (rawToken) {
    await pool.query(
      `UPDATE refresh_tokens
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
      [hashToken(rawToken)],
    );
  }
  clearSessionCookies(res);
}

export function clearSessionCookies(res) {
  const options = { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/api/v1/auth' };
  res.clearCookie(config.REFRESH_COOKIE_NAME, options);
  res.clearCookie('brightloop_csrf', { ...options, httpOnly: false });
}

export async function requestPasswordReset(emailAddress) {
  const email = emailAddress.trim().toLowerCase();
  const user = await findUserByEmail(pool, email);
  if (!user || !user.is_active) return;
  const rawToken = newOpaqueToken();
  await withTransaction(async db => {
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 minutes')`,
      [user.id, hashToken(rawToken)],
    );
    await enqueueEmail(db, {
      to: user.email,
      template: 'password_reset',
      payload: { full_name: user.full_name, url: `${config.APP_BASE_URL}/reset?token=${encodeURIComponent(rawToken)}` },
      dedupeKey: `reset:${user.id}:${Math.floor(Date.now() / 60_000)}`,
    });
  });
}

export async function resetPassword(rawToken, newPassword) {
  const tokenHash = hashToken(rawToken);
  const found = await pool.query(
    `SELECT u.email, u.full_name FROM password_reset_tokens rt JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1 AND rt.used_at IS NULL AND rt.expires_at > now()`,
    [tokenHash],
  );
  if (!found.rows[0]) throw new AppError(422, 'INVALID_OR_EXPIRED_TOKEN', 'The reset link is invalid or expired.');
  assertPasswordPolicy(newPassword, [found.rows[0].email, found.rows[0].full_name]);
  const newHash = await hashPassword(newPassword);
  await withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [tokenHash],
    );
    if (!rows[0]) throw new AppError(422, 'INVALID_OR_EXPIRED_TOKEN', 'The reset link is invalid or expired.');
    const userId = rows[0].user_id;
    await db.query(`UPDATE users
                       SET password_hash = $2, failed_login_count = 0, locked_until = NULL,
                           must_change_password = false,
                           email_verified_at = COALESCE(email_verified_at, CASE WHEN role = 'staff' THEN now() ELSE NULL END)
                     WHERE id = $1`, [userId, newHash]);
    await db.query(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1`, [userId]);
    await db.query(`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  });
}

export async function changePassword(userId, currentPassword, newPassword) {
  const { rows } = await pool.query(`SELECT email, full_name, password_hash FROM users WHERE id = $1 AND is_active`, [userId]);
  const user = rows[0];
  if (!user || !(await verifyPassword(user.password_hash, currentPassword))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }
  assertPasswordPolicy(newPassword, [user.email, user.full_name]);
  const hash = await hashPassword(newPassword);
  await withTransaction(async db => {
    await db.query(`UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1`, [userId, hash]);
    await db.query(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1`, [userId]);
  });
}

export async function me(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.must_change_password,
            u.email_verified_at, u.last_login_at, u.created_at, u.updated_at,
            c.id AS customer_id, c.name AS customer_name
       FROM users u LEFT JOIN customers c ON c.user_id = u.id
      WHERE u.id = $1 AND u.is_active`,
    [userId],
  );
  if (!rows[0]) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  const { customer_id, customer_name, ...user } = rows[0];
  return { ...user, customer: customer_id ? { id: customer_id, name: customer_name } : null };
}

export async function listUsers({ page, limit, q }) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT id, email, full_name, role, is_active, must_change_password, last_login_at, created_by, created_at, updated_at
       FROM users
      WHERE ($1::text IS NULL OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [q ?? null, limit, offset],
  );
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM users
      WHERE ($1::text IS NULL OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')`,
    [q ?? null],
  );
  return { data: rows, meta: { page, limit, total: count.rows[0].total } };
}

export async function createStaff({ full_name, email }, actorId) {
  const normalizedEmail = email.trim().toLowerCase();
  const provisionalPassword = newOpaqueToken();
  const passwordHash = await hashPassword(provisionalPassword);
  const inviteToken = newOpaqueToken();
  const user = await withTransaction(async db => {
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password, created_by)
       VALUES ($1, $2, $3, 'staff', TRUE, $4)
       RETURNING id, email, full_name, role, is_active, must_change_password, last_login_at, created_by, created_at, updated_at`,
      [normalizedEmail, passwordHash, full_name.trim(), actorId],
    );
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '7 days')`,
      [rows[0].id, hashToken(inviteToken)],
    );
    await enqueueEmail(db, {
      to: normalizedEmail,
      template: 'staff_invite',
      payload: { full_name: full_name.trim(), url: `${config.APP_BASE_URL}/reset?token=${encodeURIComponent(inviteToken)}` },
      dedupeKey: `invite:${rows[0].id}:${hashToken(inviteToken)}`,
    });
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'user.create', 'user', $2, $3::jsonb)`,
      [actorId, rows[0].id, JSON.stringify({ role: 'staff', email: normalizedEmail })],
    );
    return rows[0];
  });
  return user;
}

export async function getUser(id) {
  const { rows } = await pool.query(
    `SELECT id, email, full_name, role, is_active, must_change_password, email_verified_at, last_login_at, created_by, created_at, updated_at
       FROM users WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'User not found.');
  return rows[0];
}

export async function patchUser(id, changes, actorId, ifMatch) {
  const fields = [];
  const values = [id, ifMatch];
  for (const key of ['full_name', 'email']) {
    if (changes[key] === undefined) continue;
    values.push(key === 'email' ? changes[key].trim().toLowerCase() : changes[key]);
    fields.push(`${key} = $${values.length}`);
  }
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $1 AND updated_at = $2::timestamptz
       RETURNING id, email, full_name, role, is_active, must_change_password, email_verified_at, last_login_at, created_by, created_at, updated_at`,
      values,
    );
    if (!rows[0]) {
      const { rows: exists } = await db.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
      if (!exists[0]) throw new AppError(404, 'NOT_FOUND', 'User not found.');
      throw new AppError(409, 'STALE_WRITE', 'This user was changed by someone else. Reload and try again.');
    }
    if (changes.email !== undefined || changes.full_name !== undefined) {
      await db.query(
        `UPDATE customers
            SET email = $2, name = $3
          WHERE user_id = $1`,
        [id, rows[0].email, rows[0].full_name],
      );
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'user.update', 'user', $2, $3::jsonb)`,
      [actorId, id, JSON.stringify({ fields: Object.keys(changes) })],
    );
    return rows[0];
  });
}

export async function setUserActive(id, active, actorId, ifMatch) {
  if (String(id) === String(actorId) && !active) throw new AppError(422, 'INVALID_REQUEST', 'You cannot deactivate your own account.');
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE users SET is_active = $2 WHERE id = $1 AND updated_at = $3::timestamptz
       RETURNING id, email, full_name, role, is_active, must_change_password, last_login_at, created_by, created_at, updated_at`,
      [id, active, ifMatch],
    );
    if (!rows[0]) {
      const { rows: exists } = await db.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
      if (!exists[0]) throw new AppError(404, 'NOT_FOUND', 'User not found.');
      throw new AppError(409, 'STALE_WRITE', 'This user was changed by someone else. Reload and try again.');
    }
    if (!active) await db.query(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1`, [id]);
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'user', $3, '{}'::jsonb)`,
      [actorId, active ? 'user.reactivate' : 'user.deactivate', id],
    );
    return rows[0];
  });
}

export async function sendStaffResetLink(id, actorId) {
  const user = await getUser(id);
  if (user.role !== 'staff') throw new AppError(422, 'INVALID_REQUEST', 'Reset links from this action are only for staff accounts.');
  const rawToken = newOpaqueToken();
  await withTransaction(async db => {
    await db.query(`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [id]);
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '7 days')`,
      [id, hashToken(rawToken)],
    );
    await enqueueEmail(db, {
      to: user.email,
      template: 'staff_invite',
      payload: { full_name: user.full_name, url: `${config.APP_BASE_URL}/reset?token=${encodeURIComponent(rawToken)}` },
      dedupeKey: `invite:${id}:${hashToken(rawToken)}`,
    });
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'user.reset_password_link', 'user', $2, '{}'::jsonb)`,
      [actorId, id],
    );
  });
}
