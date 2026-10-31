import pino from 'pino';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { drainEmailOutbox } from './jobs/email-outbox.js';
import { dateInTimezone } from './lib/clock.js';
import { runBilling } from './modules/billing/service.js';

const logger = pino({
  level: config.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
const connection = new IORedis(config.REDIS_QUEUE_URL, { maxRetriesPerRequest: null });
const queueName = 'brightloop-billing';
const queue = new Queue(queueName, { connection });
const worker = new Worker(queueName, async job => {
  if (job.name !== 'billing-run') throw new Error(`Unsupported worker job: ${job.name}`);
  const asOf = dateInTimezone(config.BUSINESS_TZ);
  logger.info({ jobId: job.id, asOf }, 'Scheduled billing started');
  const result = await runBilling({ asOf, trigger: 'schedule' });
  logger.info({ jobId: job.id, asOf, status: result.status, runId: result.runId }, 'Scheduled billing finished');
  return result;
}, {
  connection,
  concurrency: 1,
});

worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, errorCode: error.code ?? error.name }, 'Background job failed');
});

await queue.add('billing-run', {}, {
  repeat: { pattern: config.BILLING_CRON, tz: config.BUSINESS_TZ },
  removeOnComplete: true,
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
});

const outboxTimer = setInterval(() => {
  drainEmailOutbox(logger).catch(error => logger.error({ errorCode: error.code ?? error.name }, 'Email outbox drain failed'));
}, 10_000);
outboxTimer.unref();
const idempotencyCleanupTimer = setInterval(() => {
  pool.query(`DELETE FROM idempotency_keys WHERE created_at < now() - interval '48 hours'`)
    .catch(error => logger.error({ errorCode: error.code ?? error.name }, 'Idempotency cleanup failed'));
}, 60 * 60 * 1000);
idempotencyCleanupTimer.unref();
logger.info({ queueName, cron: config.BILLING_CRON, timeZone: config.BUSINESS_TZ }, 'Background worker started');

async function shutdown(signal) {
  logger.info({ signal }, 'Worker shutting down');
  clearInterval(outboxTimer);
  clearInterval(idempotencyCleanupTimer);
  await Promise.allSettled([worker.close(), queue.close(), pool.end(), connection.quit()]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
