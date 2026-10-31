import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { config } from '../../config.js';
import { dateInTimezone } from '../../lib/clock.js';
import { runBilling } from './service.js';

const dateQuery = z.object({ asOf: z.iso.date().optional(), subscriptionId: z.string().regex(/^[1-9]\d*$/).optional() }).strict();
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const idParams = z.object({ id: z.string().regex(/^[1-9]\d*$/) });

export async function run(req, res) {
  const parsed = dateQuery.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid billing run request.');
  const asOf = parsed.data.asOf ?? dateInTimezone(config.BUSINESS_TZ);
  res.json({ data: await runBilling({ ...parsed.data, asOf, trigger: 'manual', actorId: req.auth.userId }) });
}

export async function listRuns(req, res) {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid pagination parameters.');
  const { page, limit } = parsed.data;
  const result = await pool.query(
    `SELECT id, run_date, started_at, finished_at, due_count, invoiced_count,
            failed_count, status, trigger FROM billing_runs
      ORDER BY id DESC LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit],
  );
  const count = await pool.query('SELECT count(*)::int AS total FROM billing_runs');
  res.json({ data: result.rows, meta: { page, limit, total: count.rows[0].total } });
}

export async function getRun(req, res) {
  const params = idParams.safeParse(req.params);
  if (!params.success) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid billing run id.');
  const result = await pool.query('SELECT * FROM billing_runs WHERE id=$1', [params.data.id]);
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Billing run not found.');
  res.json({ data: result.rows[0] });
}

export async function health(_req, res) {
  const today = dateInTimezone(config.BUSINESS_TZ);
  const [due, failures, integrity] = await Promise.all([
    pool.query(`SELECT count(*)::int AS count FROM subscriptions WHERE status='active' AND next_invoice_date <= $1::date`, [today]),
    pool.query(`SELECT id, run_date, failed_count, errors FROM billing_runs WHERE status IN ('partial','failed') ORDER BY id DESC LIMIT 20`),
    pool.query(
      `SELECT
         (SELECT count(*)::int FROM invoices i
           LEFT JOIN (SELECT invoice_id, sum(line_total) AS total FROM invoice_lines GROUP BY invoice_id) l
             ON l.invoice_id=i.id
          WHERE i.status <> 'cancelled' AND COALESCE(l.total,0) <> i.total) AS invoice_total_mismatches,
         (SELECT count(*)::int FROM invoices i
           LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM payments GROUP BY invoice_id) p
             ON p.invoice_id=i.id
          WHERE COALESCE(p.paid,0) <> i.amount_paid) AS payment_total_mismatches`,
    ),
  ]);
  res.json({ data: { overdue_cursors: due.rows[0].count, recent_failures: failures.rows, integrity: integrity.rows[0] } });
}
