import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { pool } from '../db/pool.js';

export async function requireAuth(req, _res, next) {
  const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') ?? '');
  if (!match) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
  let claims;
  try {
    claims = verifyAccessToken(match[1]);
  } catch {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
  }
  const { rows } = await pool.query(
    `SELECT role, is_active, must_change_password FROM users WHERE id = $1`,
    [claims.sub],
  );
  const user = rows[0];
  if (!user?.is_active) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
  try {
    req.auth = {
      userId: claims.sub,
      role: user.role,
      mustChangePassword: Boolean(user.must_change_password),
    };
    const requestPath = `${req.baseUrl}${req.path}`;
    if (req.auth.mustChangePassword
        && !['/api/v1/auth/change-password', '/api/v1/auth/logout'].includes(requestPath)) {
      return next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing.'));
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    if (!roles.includes(req.auth.role)) return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    next();
  };
}
