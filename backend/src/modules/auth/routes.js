import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../../db/redis.js';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  changePasswordSchema, createStaffSchema, emailSchema, listUsersSchema, loginSchema,
  patchUserSchema, resetSchema, signupSchema, userIdSchema,
} from './schemas.js';

const router = Router();

function rateLimiter({ windowMs, limit, keyPrefix, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `rate-limit:${keyPrefix}:`,
    }),
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  });
}

const signupLimit = rateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyPrefix: 'signup',
  keyGenerator: req => ipKeyGenerator(req.ip),
});
const loginLimit = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyPrefix: 'login',
  keyGenerator: req => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? '').trim().toLowerCase()}`,
});
const forgotLimit = rateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyPrefix: 'forgot',
  keyGenerator: req => String(req.body?.email ?? '').trim().toLowerCase(),
});
const forgotIpLimit = rateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyPrefix: 'forgot-ip',
  keyGenerator: req => ipKeyGenerator(req.ip),
});

function requireCsrf(req, _res, next) {
  const cookie = req.cookies?.brightloop_csrf;
  const header = req.get('x-csrf-token');
  if (!cookie || !header) return next(new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.'));
  const left = createHash('sha256').update(cookie).digest();
  const right = createHash('sha256').update(header).digest();
  if (!timingSafeEqual(left, right)) return next(new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.'));
  next();
}

// Customer sign-up and profile routes.
router.post('/signup', signupLimit, validate({ body: signupSchema }), async (req, res) => {
  await controller.signup(req, res);
});

// Spec §11.1; login screen and role-specific entry points in §13–14.
router.post('/login', loginLimit, validate({ body: loginSchema }), async (req, res) => {
  await controller.login(req, res);
});

// Spec §11.1; session renewal used by all authenticated pages (§14).
router.post('/refresh', requireCsrf, async (req, res) => {
  await controller.refresh(req, res);
});

// Spec §11.1; sign-out control in the customer/staff/admin navigation (§14.1–14.3).
router.post('/logout', requireAuth, async (req, res) => {
  await controller.logout(req, res);
});

// Spec §11.1 / §6.1; forgot-password screen and non-enumerating recovery flow (§13.1).
router.post('/forgot-password', forgotIpLimit, forgotLimit, validate({ body: emailSchema }), async (req, res) => {
  await controller.forgotPassword(req, res);
});

// Spec §11.1 / §6.1; reset-password screen (§13.1).
router.post('/reset-password', validate({ body: resetSchema }), async (req, res) => {
  await controller.resetPassword(req, res);
});

// Spec §11.1 / §6.1; change-password control in profile (§14.1).
router.post('/change-password', requireAuth, validate({ body: changePasswordSchema }), async (req, res) => {
  await controller.changePassword(req, res);
});

export default router;
