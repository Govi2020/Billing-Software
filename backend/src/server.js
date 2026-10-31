import pino from 'pino';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { redis } from './db/redis.js';
import { createApp } from './app.js';

const logger = pino({
  level: config.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
});
pool.on('error', error => logger.error({ errorCode: error.code ?? error.name }, 'Unexpected idle PostgreSQL client error'));
redis.on('error', error => logger.error({ errorCode: error.code ?? error.name }, 'Redis connection error'));
const app = createApp(logger);

await redis.ping();
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'Brightloop API listening'));

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await Promise.allSettled([pool.end(), redis.quit()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
