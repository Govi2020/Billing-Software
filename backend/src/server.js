import pino from 'pino';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { redis } from './db/redis.js';
import { createApp } from './app.js';
import { drainEmailOutbox } from './jobs/email-outbox.js';

const logger = pino({
  level: config.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
});
pool.on('error', error => logger.error({ errorCode: error.code ?? error.name }, 'Unexpected idle PostgreSQL client error'));
redis.on('error', error => logger.error({ errorCode: error.code ?? error.name }, 'Redis connection error'));
const app = createApp(logger);

const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'Brightloop API listening'));

const outboxTimer = setInterval(() => {
  drainEmailOutbox(logger).catch(error => logger.error({ err: error }, 'Email outbox drain failed'));
}, 10_000);
outboxTimer.unref();

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  clearInterval(outboxTimer);
  server.close(async () => {
    await Promise.allSettled([pool.end(), redis.quit()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
