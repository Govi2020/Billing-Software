import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  REDIS_QUEUE_URL: z.string().min(1).optional(),
  FRONTEND_ORIGIN: z.string().url(),
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_KEY_ID: z.string().min(1).default('primary'),
  JWT_PREVIOUS_KEYS: z.string().default('{}'),
  JWT_ISSUER: z.string().default('brightloop-api'),
  JWT_AUDIENCE: z.string().default('brightloop-client'),
  REFRESH_COOKIE_NAME: z.string().default('brightloop_refresh'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  BUSINESS_TZ: z.string().default('Asia/Kolkata').refine(value => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  BILLING_CRON: z.string().default('0 2 * * *').refine(value => {
    const parts = value.trim().split(/\s+/);
    return parts.length === 5 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])
      && parts[2] === '*' && parts[3] === '*' && parts[4] === '*'
      && Number(parts[0]) <= 59 && Number(parts[1]) <= 23;
  }),
  PAUSE_POLICY: z.enum(['shift', 'skip']).default('shift'),
  AUTO_CONFIRM_INVOICES: z.enum(['true', 'false']).default('false'),
  AUTO_SEND_INVOICES: z.enum(['true', 'false']).default('false'),
  DISCOUNT_STACKING: z.enum(['sequential', 'best_only']).default('sequential'),
  DEMO_SEED_PASSWORD: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Do not print values: configuration errors can include credentials.
  console.error('Invalid backend environment configuration:', parsed.error.issues.map(issue => issue.path.join('.')).join(', '));
  process.exit(1);
}

let previousJwtKeys;
try {
  previousJwtKeys = JSON.parse(parsed.data.JWT_PREVIOUS_KEYS);
  if (!previousJwtKeys || Array.isArray(previousJwtKeys) || typeof previousJwtKeys !== 'object'
      || Object.values(previousJwtKeys).some(secret => typeof secret !== 'string' || secret.length < 32)) {
    throw new Error('JWT_PREVIOUS_KEYS must map key IDs to secrets of at least 32 characters.');
  }
} catch {
  console.error('Invalid backend environment configuration: JWT_PREVIOUS_KEYS');
  process.exit(1);
}

export const config = Object.freeze({
  ...parsed.data,
  REDIS_QUEUE_URL: parsed.data.REDIS_QUEUE_URL ?? parsed.data.REDIS_URL,
  previousJwtKeys,
  cookieSecure: parsed.data.COOKIE_SECURE === undefined
    ? parsed.data.NODE_ENV === 'production'
    : parsed.data.COOKIE_SECURE === 'true',
  smtpSecure: parsed.data.SMTP_SECURE === 'true',
  autoConfirmInvoices: parsed.data.AUTO_CONFIRM_INVOICES === 'true',
  autoSendInvoices: parsed.data.AUTO_SEND_INVOICES === 'true',
});
