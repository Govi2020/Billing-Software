import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { config } from '../../config.js';
import { addPeriod, computeInvoice, periodIndex } from './math.js';

export async function billOne(subscriptionId, asOf, billingRunId = null, reissuePeriod = null, actorId = null) {
  try {
    return await withTransaction(async client => {
      const locked = reissuePeriod
        ? await client.query(
          `SELECT s.*, p.billing_period, p.auto_close, pt.due_days
             FROM subscriptions s JOIN plans p ON p.id=s.plan_id
             JOIN payment_terms pt ON pt.id=s.payment_term_id
            WHERE s.id=$1 FOR UPDATE OF s`,
          [subscriptionId],
        )
        : await client.query(
          `SELECT s.*, p.billing_period, p.auto_close, pt.due_days
             FROM subscriptions s JOIN plans p ON p.id=s.plan_id
             JOIN payment_terms pt ON pt.id=s.payment_term_id
            WHERE s.id=$1 AND s.status='active' AND s.next_invoice_date <= $2::date
            FOR UPDATE OF s SKIP LOCKED`,
          [subscriptionId, asOf],
        );
      if (!locked.rowCount) return { status: 'skipped' };
      const sub = locked.rows[0];
      if (!reissuePeriod && sub.next_invoice_date > sub.expiry_date) return { status: 'past_expiry' };
      const start = reissuePeriod?.periodStart
        ?? (sub.next_invoice_date.toISOString?.().slice(0, 10) ?? String(sub.next_invoice_date).slice(0, 10));
      const expiry = sub.expiry_date.toISOString?.().slice(0, 10) ?? String(sub.expiry_date).slice(0, 10);
      let periodEnd;
      if (reissuePeriod) {
        periodEnd = reissuePeriod.periodEnd;
      } else {
        const anchor = sub.start_date.toISOString?.().slice(0, 10) ?? String(sub.start_date).slice(0, 10);
        const index = periodIndex(anchor, start, sub.billing_period);
        const nextStart = addPeriod(anchor, index + 1, sub.billing_period);
        const endDate = new Date(`${nextStart}T00:00:00.000Z`);
        endDate.setUTCDate(endDate.getUTCDate() - 1);
        periodEnd = endDate.toISOString().slice(0, 10) > expiry ? expiry : endDate.toISOString().slice(0, 10);
      }
      const customerResult = await client.query(
        `SELECT c.id, c.name, c.email, c.company_name, c.address_line1, c.address_line2,
                c.city, c.state, c.postal_code, c.country, c.tax_number
           FROM customers c WHERE c.id=$1`,
        [sub.customer_id],
      );
      const customer = customerResult.rows[0];
      if (!customer) throw new AppError(422, 'CUSTOMER_MISSING', 'Subscription customer no longer exists.');
      const linesResult = await client.query(
        `SELECT sl.id AS subscription_line_id, sl.product_id,
                CASE WHEN v.id IS NULL THEN p.name ELSE p.name || ' — ' || v.attribute || ': ' || v.value END AS description,
                sl.quantity, sl.unit_price, sl.tax_id, t.name AS tax_name, t.kind AS tax_kind,
                t.rate AS tax_rate, sl.line_subtotal, sl.sort_order
           FROM subscription_lines sl
           JOIN products p ON p.id=sl.product_id
           LEFT JOIN product_variants v ON v.id=sl.variant_id AND v.product_id=sl.product_id
           LEFT JOIN taxes t ON t.id=sl.tax_id
          WHERE sl.subscription_id=$1 ORDER BY sl.sort_order, sl.id`,
        [subscriptionId],
      );
      if (!linesResult.rowCount) throw new AppError(422, 'NO_LINES', 'Cannot bill a subscription without lines.');
      const discountResult = await client.query(
        `SELECT d.id, d.kind, d.value, d.scope, d.min_purchase_amount, d.min_quantity,
                COALESCE(array_agg(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '{}') AS product_ids
           FROM subscription_discounts sd JOIN discount_rules d ON d.id=sd.discount_id
           LEFT JOIN discount_products dp ON dp.discount_id=d.id
          WHERE sd.subscription_id=$1 AND d.is_active
            AND d.start_date <= $2::date AND (d.end_date IS NULL OR d.end_date >= $2::date)
            AND (d.usage_limit IS NULL OR d.times_used < d.usage_limit)
          GROUP BY d.id ORDER BY d.id`,
        [subscriptionId, asOf],
      );
      const totals = computeInvoice(linesResult.rows, discountResult.rows, config.DISCOUNT_STACKING);
      const invoiceInsert = await client.query(
        `INSERT INTO invoices
          (subscription_id, customer_id, status, invoice_date, due_date, period_start, period_end,
           bill_to_name, bill_to_address, bill_to_tax_number, subtotal, discount_total, tax_total,
           total, created_by, billing_run_id)
         VALUES ($1,$2,'draft',$3::date,($3::date + $4),$5::date,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id, number`,
        [subscriptionId, sub.customer_id, asOf, sub.due_days, start, periodEnd,
          customer.company_name || customer.name,
          [customer.address_line1, customer.address_line2, customer.city, customer.state, customer.postal_code, customer.country].filter(Boolean).join(', ') || null,
          customer.tax_number, totals.subtotal, totals.discount_total, totals.tax_total, totals.total, actorId, billingRunId],
      );
      const invoice = invoiceInsert.rows[0];
      for (const line of totals.lines) {
        await client.query(
          `INSERT INTO invoice_lines
            (invoice_id, subscription_line_id, product_id, description, quantity, unit_price,
             discount_amount, tax_id, tax_name, tax_rate, tax_kind, tax_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [invoice.id, line.subscription_line_id, line.product_id, line.description, line.quantity,
            line.unit_price, line.discount_amount, line.tax_id, line.tax_name, line.tax_rate,
            line.tax_kind, line.tax_amount],
        );
      }
      for (const redemption of totals.redemptions) {
        const claim = await client.query(
          `UPDATE discount_rules SET times_used=times_used+1
            WHERE id=$1 AND is_active AND start_date <= $2::date
              AND (end_date IS NULL OR end_date >= $2::date)
              AND (usage_limit IS NULL OR times_used < usage_limit)
            RETURNING id`,
          [redemption.discount_id, asOf],
        );
        if (!claim.rowCount) throw new AppError(409, 'DISCOUNT_EXHAUSTED', 'Discount usage limit was reached during billing.');
        await client.query(
          `INSERT INTO discount_redemptions (discount_id, subscription_id, invoice_id, amount)
           VALUES ($1,$2,$3,$4)`,
          [redemption.discount_id, subscriptionId, invoice.id, redemption.amount],
        );
      }
      const autoConfirm = config.autoConfirmInvoices || config.autoSendInvoices;
      if (autoConfirm) {
        await client.query(
          `UPDATE invoices SET status='confirmed', confirmed_at=now() WHERE id=$1`,
          [invoice.id],
        );
      }
      if (config.autoSendInvoices) {
        await client.query(
          `INSERT INTO email_outbox (to_email, template, payload, dedupe_key)
           VALUES ($1,'invoice_sent',$2::jsonb,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
          [customer.email, JSON.stringify({ invoice_id: invoice.id, invoice_number: invoice.number }), `invoice.sent:${invoice.id}`],
        );
        await client.query('UPDATE invoices SET sent_to=$2 WHERE id=$1', [invoice.id, customer.email]);
      }
      const cursor = new Date(new Date(`${periodEnd}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
      if (!reissuePeriod && cursor > expiry && sub.auto_close) {
        await client.query("SELECT set_config('app.user_id', '', true)");
        await client.query("SELECT set_config('app.status_note', 'AUTO_EXPIRED', true)");
        await client.query(
          `UPDATE subscriptions SET status='closed', closed_at=now(), close_reason='AUTO_EXPIRED', next_invoice_date=NULL
            WHERE id=$1 AND status='active'`,
          [subscriptionId],
        );
      } else if (!reissuePeriod) {
        await client.query(
          `UPDATE subscriptions SET next_invoice_date=$1::date WHERE id=$2`,
          [cursor, subscriptionId],
        );
      }
      await client.query(
        `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
         VALUES ($1,'invoice.generate','invoice',$2,$3::jsonb)`,
        [actorId, invoice.id, JSON.stringify({ subscriptionId, periodStart: start, periodEnd })],
      );
      return { status: 'billed', invoiceId: invoice.id, number: invoice.number };
    }, { retries: 3 });
  } catch (error) {
    if (error.code === '23505') return { status: 'already_billed' };
    throw error;
  }
}

export async function runBilling({ asOf, subscriptionId = null, trigger = 'manual', actorId = null }) {
  const lockClient = await pool.connect();
  let lockAcquired = false;
  let runId;
  try {
    const lock = await lockClient.query('SELECT pg_try_advisory_lock(712347891) AS acquired');
    lockAcquired = lock.rows[0].acquired;
    if (!lockAcquired) return { status: 'already_running' };
    if (trigger === 'schedule') {
      const existing = await lockClient.query(
        `SELECT id,status FROM billing_runs WHERE run_date=$1::date AND trigger='schedule' ORDER BY id DESC LIMIT 1`,
        [asOf],
      );
      if (existing.rowCount && existing.rows[0].status === 'succeeded') {
        return { status: 'already_completed', runId: existing.rows[0].id };
      }
      if (existing.rowCount) {
        runId = existing.rows[0].id;
        await lockClient.query(
          `UPDATE billing_runs SET status='running', started_at=now(), finished_at=NULL,
            due_count=0, invoiced_count=0, failed_count=0, errors=NULL WHERE id=$1`,
          [runId],
        );
      }
    }
    if (!runId) {
      const run = await lockClient.query(
        `INSERT INTO billing_runs (run_date, trigger, status) VALUES ($1::date,$2,'running') RETURNING id`,
        [asOf, trigger],
      );
      runId = run.rows[0].id;
    }
    await withTransaction(async client => {
      await client.query("SELECT set_config('app.user_id', '', true)");
      await client.query("SELECT set_config('app.status_note', 'AUTO_ACTIVATED', true)");
      await client.query(
        `UPDATE subscriptions s SET status='active', next_invoice_date=s.start_date
          FROM plans p WHERE p.id=s.plan_id AND s.status='confirmed' AND s.start_date <= $1::date`,
        [asOf],
      );
      await client.query("SELECT set_config('app.status_note', 'AUTO_EXPIRED', true)");
      await client.query(
        `UPDATE subscriptions s SET status='closed', closed_at=now(),
           close_reason='AUTO_EXPIRED', next_invoice_date=NULL
          FROM plans p WHERE p.id=s.plan_id AND s.status='active' AND p.auto_close
            AND s.expiry_date < $1::date`,
        [asOf],
      );
      await client.query(
        `UPDATE invoices i SET status='cancelled', cancelled_at=now(), cancel_reason='SUBSCRIPTION_AUTO_EXPIRED'
          FROM subscriptions s
          WHERE i.subscription_id=s.id AND s.status='closed' AND s.close_reason='AUTO_EXPIRED'
            AND i.status='draft' AND i.period_start > $1::date`,
        [asOf],
      );
      await client.query("SELECT set_config('app.status_note', 'QUOTATION_EXPIRED', true)");
      await client.query(
        `UPDATE subscriptions SET status='closed', closed_at=now(),
           close_reason='QUOTATION_EXPIRED', next_invoice_date=NULL
          WHERE status='quotation' AND quotation_valid_until < $1::date`,
        [asOf],
      );
      for (const days of [30, 7, 1]) {
        await client.query(
          `INSERT INTO email_outbox (to_email, template, payload, dedupe_key)
           SELECT c.email, 'renewal_reminder',
                  jsonb_build_object('subscription_id',s.id,'subscription_number',s.number,'expiry_date',s.expiry_date),
                  'renewal:' || s.id::text || ':' || $2::int::text
             FROM subscriptions s JOIN plans p ON p.id=s.plan_id
             JOIN customers c ON c.id=s.customer_id
            WHERE s.status='active' AND p.is_renewable AND s.expiry_date=$1::date + $2::int
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [asOf, days],
        );
      }
    }, { retries: 3 });
    const processed = new Set();
    const failures = [];
    let dueCount = 0;
    let invoicedCount = 0;
    for (;;) {
      const ids = await pool.query(
        `SELECT id FROM subscriptions
          WHERE status='active' AND next_invoice_date <= $1::date
            AND ($2::bigint IS NULL OR id=$2)
            AND NOT (id = ANY($3::bigint[]))
          ORDER BY next_invoice_date, id LIMIT 100`,
        [asOf, subscriptionId, [...processed]],
      );
      if (!ids.rowCount) break;
      for (const row of ids.rows) {
        dueCount++;
        try {
          for (let iteration = 0; iteration < 400; iteration++) {
            const result = await billOne(row.id, asOf, runId, null, actorId);
            if (result.status === 'billed') {
              invoicedCount++;
              continue;
            }
            break;
          }
        } catch (error) {
          failures.push({
            subscriptionId: String(row.id),
            code: error.code ?? error.name,
            message: error.message,
          });
        }
        processed.add(String(row.id));
      }
    }
    const remaining = await pool.query(
      `SELECT count(*)::int AS count FROM subscriptions
        WHERE status='active' AND next_invoice_date <= $1::date AND ($2::bigint IS NULL OR id=$2)`,
      [asOf, subscriptionId],
    );
    const reconciliation = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM invoices i
           LEFT JOIN (SELECT invoice_id, sum(line_total) AS total FROM invoice_lines GROUP BY invoice_id) l
             ON l.invoice_id=i.id
          WHERE i.status <> 'cancelled' AND COALESCE(l.total,0) <> i.total) AS invoice_total_mismatches,
         (SELECT count(*)::int FROM invoices i
           LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM payments GROUP BY invoice_id) p
             ON p.invoice_id=i.id
          WHERE COALESCE(p.paid,0) <> i.amount_paid) AS payment_total_mismatches`,
    );
    const reconciliationIssue = Object.values(reconciliation.rows[0]).some(count => count > 0);
    if (reconciliationIssue) {
      failures.push({
        code: 'RECONCILIATION_MISMATCH',
        message: 'Invoice line totals or payment totals do not match their headers.',
        details: reconciliation.rows[0],
      });
    }
    const status = failures.length ? (invoicedCount ? 'partial' : 'failed') : 'succeeded';
    const failedCount = Math.max(failures.length, remaining.rows[0].count);
    await pool.query(
      `UPDATE billing_runs SET finished_at=now(), due_count=$1, invoiced_count=$2,
        failed_count=$3, errors=$4::jsonb, status=$5 WHERE id=$6`,
      [dueCount, invoicedCount, failedCount,
        JSON.stringify(failures), remaining.rows[0].count ? 'partial' : status, runId],
    );
    return { status: remaining.rows[0].count ? 'partial' : status, runId, dueCount, invoicedCount, failures };
  } finally {
    if (lockAcquired) await lockClient.query('SELECT pg_advisory_unlock(712347891)');
    lockClient.release();
  }
}

export async function previewInvoice(subscriptionId, asOf) {
  const subResult = await pool.query(
    `SELECT s.id, s.status, s.start_date, s.expiry_date, s.next_invoice_date,
            p.billing_period, pt.due_days
       FROM subscriptions s JOIN plans p ON p.id=s.plan_id
       JOIN payment_terms pt ON pt.id=s.payment_term_id WHERE s.id=$1`,
    [subscriptionId],
  );
  if (!subResult.rowCount) throw new AppError(404, 'NOT_FOUND', 'Subscription not found.');
  const sub = subResult.rows[0];
  if (sub.status !== 'active') throw new AppError(409, 'NOT_ACTIVE', 'Only active subscriptions can be previewed for billing.');
  const start = String(sub.next_invoice_date).slice(0, 10);
  const anchor = String(sub.start_date).slice(0, 10);
  const index = periodIndex(anchor, start, sub.billing_period);
  const nextStart = addPeriod(anchor, index + 1, sub.billing_period);
  const endDate = new Date(`${nextStart}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const expiry = String(sub.expiry_date).slice(0, 10);
  const periodEnd = endDate.toISOString().slice(0, 10) > expiry ? expiry : endDate.toISOString().slice(0, 10);
  const lines = await pool.query(
    `SELECT sl.id AS subscription_line_id, sl.product_id,
            CASE WHEN v.id IS NULL THEN p.name ELSE p.name || ' — ' || v.attribute || ': ' || v.value END AS description,
            sl.quantity, sl.unit_price, sl.tax_id, t.name AS tax_name, t.kind AS tax_kind,
            t.rate AS tax_rate, sl.line_subtotal, sl.sort_order
       FROM subscription_lines sl JOIN products p ON p.id=sl.product_id
       LEFT JOIN product_variants v ON v.id=sl.variant_id AND v.product_id=sl.product_id
       LEFT JOIN taxes t ON t.id=sl.tax_id
      WHERE sl.subscription_id=$1 ORDER BY sl.sort_order, sl.id`,
    [subscriptionId],
  );
  const discounts = await pool.query(
    `SELECT d.id, d.kind, d.value, d.scope, d.min_purchase_amount, d.min_quantity,
            COALESCE(array_agg(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '{}') AS product_ids
       FROM subscription_discounts sd JOIN discount_rules d ON d.id=sd.discount_id
       LEFT JOIN discount_products dp ON dp.discount_id=d.id
      WHERE sd.subscription_id=$1 AND d.is_active AND d.start_date <= $2::date
        AND (d.end_date IS NULL OR d.end_date >= $2::date)
        AND (d.usage_limit IS NULL OR d.times_used < d.usage_limit)
      GROUP BY d.id ORDER BY d.id`,
    [subscriptionId, asOf],
  );
  const totals = computeInvoice(lines.rows, discounts.rows, config.DISCOUNT_STACKING);
  return {
    asOf, periodStart: start, periodEnd,
    dueDate: new Date(new Date(`${asOf}T00:00:00.000Z`).getTime() + Number(sub.due_days) * 86400000).toISOString().slice(0, 10),
    ...totals,
  };
}
