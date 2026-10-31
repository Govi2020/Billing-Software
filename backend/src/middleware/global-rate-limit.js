import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../db/redis.js';
import { verifyAccessToken } from '../lib/tokens.js';

export const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator(req) {
    const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') ?? '');
    if (match) {
      try {
        return `user:${verifyAccessToken(match[1]).sub}`;
      } catch {
        // Invalid tokens are limited by source IP until authentication rejects them.
      }
    }
    return `ip:${ipKeyGenerator(req.ip)}`;
  },
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rate-limit:global:',
  }),
  handler(_req, _res, next) {
    next(Object.assign(new Error('Too many requests. Try again later.'), {
      status: 429,
      code: 'RATE_LIMITED',
    }));
  },
});
