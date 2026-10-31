import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { redis } from './db/redis.js';
import { AppError, mapDatabaseError } from './lib/errors.js';
import { globalRateLimit } from './middleware/global-rate-limit.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './modules/auth/routes.js';
import userRoutes from './modules/users/routes.js';
import catalogRoutes from './modules/catalog/routes.js';
import customerRoutes from './modules/customers/routes.js';
import subscriptionRoutes from './modules/subscriptions/routes.js';
import billingRoutes from './modules/billing/routes.js';
import invoiceRoutes from './modules/invoices/routes.js';
import reportRoutes from './modules/reports/routes.js';
import * as authController from './modules/auth/controller.js';

export function createApp(logger) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : false);
  app.use(helmet());
  app.use(pinoHttp({
    logger,
    genReqId: req => req.get('x-request-id')?.slice(0, 128) || randomUUID(),
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url.split('?')[0],
          remoteAddress: req.remoteAddress,
        };
      },
    },
    customProps: req => ({ requestId: req.id }),
  }));
  app.use(cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match', 'X-CSRF-Token'],
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api/v1', globalRateLimit);

  // Spec §18.2; operational health status visible in the admin system-health view (§14.3).
  app.get('/healthz', (_req, res) => res.json({ data: { status: 'ok' } }));
  // Spec §18.2; operational dependency status for the admin system-health view (§14.3).
  app.get('/readyz', async (_req, res, next) => {
    try {
      await pool.query('SELECT 1');
      await redis.ping();
      res.json({ data: { status: 'ready' } });
    } catch (error) {
      next(error);
    }
  });

  // Spec §4.4; unknown paths share the API's standard error envelope.
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1', catalogRoutes);
  app.use('/api/v1', customerRoutes);
  app.use('/api/v1', subscriptionRoutes);
  app.use('/api/v1', billingRoutes);
  app.use('/api/v1', invoiceRoutes);
  app.use('/api/v1', reportRoutes);
  // Spec §11.1; profile and role-aware navigation in §14.1–14.3.
  app.get('/api/v1/me', requireAuth, async (req, res) => {
    await authController.me(req, res);
  });
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found.')));
  app.use((error, req, res, _next) => {
    const mapped = mapDatabaseError(error);
    const status = mapped.status ?? 500;
    if (status >= 500) logger.error({ errorCode: error.code ?? error.name, requestId: req.id }, 'Request failed');
    res.status(status).json({
      error: {
        code: mapped.code ?? 'INTERNAL_ERROR',
        message: status >= 500 ? 'An unexpected error occurred.' : mapped.message,
        ...(mapped.details === undefined ? {} : { details: mapped.details }),
        requestId: req.id ?? null,
      },
    });
  });
  return app;
}
