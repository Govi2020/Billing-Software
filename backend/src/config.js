import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url(),
  APP_BASE_URL: z.string().url(),
  BUSINESS_TIMEZONE: z.string().min(1).default('Asia/Kolkata'),
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
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().max(160).default('Brightloop Software'),
  PAYMENT_UPI_ID: z.string().max(100).optional(),
  PAYMENT_PAYEE_NAME: z.string().max(160).optional(),
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
  previousJwtKeys,
  cookieSecure: parsed.data.COOKIE_SECURE === undefined
    ? parsed.data.NODE_ENV === 'production'
    : parsed.data.COOKIE_SECURE === 'true',
  smtpSecure: parsed.data.SMTP_SECURE === 'true',
});
