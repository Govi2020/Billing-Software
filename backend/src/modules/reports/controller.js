import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { config } from '../../config.js';
import { dateInTimezone, isValidDateOnly } from '../../lib/clock.js';

function filters(req) {
  const { from, to } = req.query;
  for (const date of [from, to].filter(Boolean)) {
    if (!isValidDateOnly(date)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Date filters must be YYYY-MM-DD.');
    }
  }
  if (from && to && from > to) throw new AppError(422, 'VALIDATION_FAILED', 'from must not be after to.');
  return { from: from ?? null, to: to ?? null, csv: req.query.format === 'csv' };
}

function send(res, rows, csv) {
  if (!csv) return res.json({ data: rows });
  const values = rows;
  const columns = values[0] ? Object.keys(values[0]) : [];
  const escape = value => {
    let text = value === null || value === undefined ? '' : String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  res.type('text/csv').send([columns.map(escape).join(','), ...values.map(row => columns.map(column => escape(row[column])).join(','))].join('\r\n'));
}

export async function dashboard(req, res) {
  const { from, to } = filters(req);
  const today = dateInTimezone(config.BUSINESS_TZ);
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM subscriptions WHERE status='active') AS active_subscriptions,
       (SELECT COALESCE(sum(mrr),0) FROM v_subscription_mrr) AS mrr,
       (SELECT COALESCE(sum(amount),0) FROM payments WHERE ($1::date IS NULL OR payment_date >= $1)
          AND ($2::date IS NULL OR payment_date <= $2)) AS revenue_collected,
       (SELECT COALESCE(sum(total-amount_paid),0) FROM invoices WHERE status='confirmed') AS outstanding_amount,
       (SELECT count(*)::int FROM invoices WHERE status='confirmed' AND due_date < $3::date) AS overdue_invoices,
       (SELECT COALESCE(sum(total-amount_paid),0) FROM invoices WHERE status='confirmed' AND due_date < $3::date) AS overdue_amount`,
    [from, to, today],
  );
  res.json({ data: result.rows[0] });
}

export async function activeSubscriptions(req, res) {
  const { csv } = filters(req);
  const result = await pool.query(
    `SELECT s.id, s.number, c.name AS customer_name, p.name AS plan_name,
            s.start_date, s.expiry_date, s.next_invoice_date
       FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN plans p ON p.id=s.plan_id
      WHERE s.status='active' ORDER BY s.expiry_date, s.id`,
  );
  send(res, result.rows, csv);
}

export async function revenue(req, res) {
  const { csv, from, to } = filters(req);
  const groupBy = req.query.groupBy ?? 'month';
  if (!['month', 'plan', 'method'].includes(groupBy)) throw new AppError(422, 'VALIDATION_FAILED', 'groupBy must be month, plan, or method.');
  const select = {
    month: `date_trunc('month', payment_date)::date AS group_key`,
    method: `method::text AS group_key`,
    plan: `p.name AS group_key`,
  }[groupBy];
  const joins = groupBy === 'plan' ? 'JOIN invoices i ON i.id=payments.invoice_id JOIN subscriptions s ON s.id=i.subscription_id JOIN plans p ON p.id=s.plan_id' : '';
  const result = await pool.query(
    `SELECT ${select}, sum(amount) AS collected, count(*)::int AS payment_count
       FROM payments ${joins}
      WHERE ($1::date IS NULL OR payment_date >= $1) AND ($2::date IS NULL OR payment_date <= $2)
      GROUP BY group_key ORDER BY group_key`,
    [from, to],
  );
  send(res, result.rows, csv);
}

export async function overdue(req, res) {
  const { csv } = filters(req);
  const today = dateInTimezone(config.BUSINESS_TZ);
  const result = await pool.query(
    `SELECT i.id, i.number, i.customer_id, c.name AS customer_name,
            i.due_date, ($1::date-i.due_date) AS days_overdue, i.total, i.amount_paid,
            (i.total-i.amount_paid) AS amount_due
       FROM invoices i JOIN customers c ON c.id=i.customer_id
      WHERE i.status='confirmed' AND i.due_date < $1::date ORDER BY i.due_date`,
    [today],
  );
  send(res, result.rows, csv);
}

export async function aging(req, res) {
  const { csv } = filters(req);
  const today = dateInTimezone(config.BUSINESS_TZ);
  const result = await pool.query(
    `SELECT CASE
        WHEN $1::date-due_date BETWEEN 1 AND 30 THEN '1-30'
        WHEN $1::date-due_date BETWEEN 31 AND 60 THEN '31-60'
        WHEN $1::date-due_date BETWEEN 61 AND 90 THEN '61-90'
        ELSE '90+'
      END AS age_bucket, count(*)::int AS invoice_count,
      sum(total-amount_paid) AS amount_due
       FROM invoices WHERE status='confirmed' AND due_date < $1::date
      GROUP BY age_bucket ORDER BY min($1::date-due_date)`,
    [today],
  );
  send(res, result.rows, csv);
}

export async function mrrTrend(req, res) {
  const { csv, from, to } = filters(req);
  const today = dateInTimezone(config.BUSINESS_TZ);
  const result = await pool.query(
    `WITH bounds AS (
       SELECT COALESCE(date_trunc('month',$1::date), date_trunc('month',min(changed_at)), date_trunc('month',$3::date))::date AS first_month,
              COALESCE(date_trunc('month',$2::date), date_trunc('month',$3::date))::date AS last_month
         FROM subscription_status_history
     ), months AS (
       SELECT generate_series(first_month,last_month,interval '1 month')::date AS month FROM bounds
     ), state_at_month AS (
       SELECT m.month, s.id, s.customer_id, p.billing_period,
              sum(sl.line_subtotal) AS subtotal,
              COALESCE((SELECT h.to_status FROM subscription_status_history h
                WHERE h.subscription_id=s.id
                  AND h.changed_at < (m.month + interval '1 month')
                ORDER BY h.changed_at DESC, h.id DESC LIMIT 1),
                CASE WHEN s.status='active' THEN 'active'::subscription_status END) AS status_at_month_end
         FROM months m CROSS JOIN subscriptions s
         JOIN plans p ON p.id=s.plan_id
         JOIN subscription_lines sl ON sl.subscription_id=s.id
        WHERE s.start_date < (m.month + interval '1 month')
        GROUP BY m.month,s.id,s.customer_id,p.billing_period
     )
     SELECT month, sum(subtotal * CASE billing_period
       WHEN 'daily' THEN 30 WHEN 'weekly' THEN 52.0/12 WHEN 'monthly' THEN 1
       WHEN 'yearly' THEN 1.0/12 ELSE NULL END) FILTER (WHERE status_at_month_end='active') AS mrr
       FROM state_at_month GROUP BY month ORDER BY month`,
    [from, to, today],
  );
  send(res, result.rows, csv);
}

export async function churn(req, res) {
  const { csv, from, to } = filters(req);
  const result = await pool.query(
    `SELECT date_trunc('month', changed_at)::date AS month,
            count(*)::int AS closed_subscriptions
       FROM subscription_status_history
      WHERE to_status='closed' AND ($1::date IS NULL OR changed_at::date >= $1)
        AND ($2::date IS NULL OR changed_at::date <= $2)
      GROUP BY 1 ORDER BY 1`,
    [from, to],
  );
  send(res, result.rows, csv);
}

export async function auditLog(req, res) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Invalid pagination parameters.');
  }
  const result = await pool.query(
    `SELECT id, actor_id, action, entity_type, entity_id, details, created_at
       FROM audit_log ORDER BY id DESC LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit],
  );
  res.json({ data: result.rows, meta: { page, limit } });
}
