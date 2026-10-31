import { config } from '../../config.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { enqueueEmail } from '../auth/repository.js';
import {
  addBillingPeriods, addDays, calculateInvoiceLines, centsToMoney,
} from './math.js';

const billingLockKey = 804221;
const maxCatchUpPeriods = 400;

export function businessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function applyLifecycleChanges(db, asOfDate) {
  await db.query(`SELECT set_config('app.user_id', '', true)`);
  const expiredQuotes = await db.query(
    `UPDATE subscriptions
        SET status = 'closed', closed_at = now(), close_reason = 'Quotation expired',
            next_invoice_date = NULL
      WHERE status = 'quotation' AND quotation_valid_until < $1::date`,
    [asOfDate],
  );
  const autoClosed = await db.query(
    `UPDATE subscriptions s
        SET status = 'closed', closed_at = now(), close_reason = 'Plan expired',
            next_invoice_date = NULL
       FROM plans p
      WHERE s.plan_id = p.id AND p.auto_close
        AND s.status IN ('active', 'paused') AND s.expiry_date < $1::date
        AND (s.next_invoice_date IS NULL OR s.next_invoice_date > s.expiry_date)`,
    [asOfDate],
  );
  return { expiredQuotes: expiredQuotes.rowCount, autoClosed: autoClosed.rowCount };
}

export async function loadLines(db, subscriptionId) {
  const { rows } = await db.query(
    `SELECT sl.id, sl.product_id, sl.quantity, sl.unit_price, sl.tax_id,
            sl.sort_order,
            COALESCE(t.name, '') AS tax_name, t.kind AS tax_kind, t.rate AS tax_rate,
            concat_ws(' — ', p.name, CASE WHEN v.id IS NOT NULL THEN v.attribute || ': ' || v.value END) AS description
       FROM subscription_lines sl
       JOIN products p ON p.id = sl.product_id
       LEFT JOIN product_variants v ON v.id = sl.variant_id
       LEFT JOIN taxes t ON t.id = COALESCE(sl.tax_id, p.tax_id)
      WHERE sl.subscription_id = $1
      ORDER BY sl.sort_order, sl.id`,
    [subscriptionId],
  );
  if (rows.length) return rows;
  const { rows: fallback } = await db.query(
    `SELECT NULL::bigint AS id, NULL::bigint AS product_id, p.min_quantity AS quantity,
            p.price AS unit_price, NULL::bigint AS tax_id, 0 AS sort_order,
            ''::text AS tax_name, NULL::tax_kind AS tax_kind, NULL::numeric AS tax_rate,
            p.name AS description
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.id = $1`,
    [subscriptionId],
  );
  return fallback;
}

export async function loadEligibleDiscounts(db, subscriptionId, asOfDate) {
  const { rows } = await db.query(
    `SELECT d.id, d.name, d.kind, d.value, d.scope, d.min_purchase_amount,
            d.min_quantity, d.usage_limit, d.times_used
       FROM discount_rules d
      WHERE d.is_active
        AND (
          NOT EXISTS (
            SELECT 1 FROM subscription_discounts assigned WHERE assigned.discount_id = d.id
          )
          OR EXISTS (
            SELECT 1 FROM subscription_discounts assigned
             WHERE assigned.discount_id = d.id AND assigned.subscription_id = $1
          )
        )
        AND d.start_date <= $2::date AND (d.end_date IS NULL OR d.end_date >= $2::date)
      ORDER BY d.id
      FOR UPDATE OF d`,
    [subscriptionId, asOfDate],
  );
  for (const discount of rows) {
    const { rows: productRows } = await db.query(
      `SELECT product_id::text FROM discount_products WHERE discount_id = $1 ORDER BY product_id`,
      [discount.id],
    );
    discount.product_ids = productRows.map(row => row.product_id);
  }
  return rows.filter(discount => discount.usage_limit === null
    || Number(discount.times_used) < Number(discount.usage_limit));
}

export async function billOne(subscriptionId, asOfDate, billingRunId = null) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `SELECT s.id, s.number, s.customer_id, s.plan_id, s.payment_term_id, s.start_date,
              s.expiry_date, s.next_invoice_date, c.name AS customer_name, c.email AS customer_email,
              c.company_name, c.address_line1, c.address_line2, c.city, c.state,
              c.postal_code, c.country, c.tax_number, p.name AS plan_name,
              p.price AS plan_price, p.min_quantity, p.billing_period, p.auto_close,
              pt.due_days,
              (SELECT count(*)::int FROM invoices existing
                WHERE existing.subscription_id = s.id
                  AND existing.period_start < s.next_invoice_date) AS completed_periods
         FROM subscriptions s
         JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
         JOIN payment_terms pt ON pt.id = s.payment_term_id AND pt.is_active
        WHERE s.id = $1 AND s.status = 'active' AND s.next_invoice_date <= $2::date
        FOR UPDATE OF s SKIP LOCKED`,
      [subscriptionId, asOfDate],
    );
    const subscription = rows[0];
    if (!subscription) return { status: 'skipped' };
    if (subscription.auto_close && subscription.next_invoice_date > subscription.expiry_date) {
      await db.query(
        `UPDATE subscriptions SET status = 'closed', closed_at = now(),
                close_reason = 'Plan expired', next_invoice_date = NULL WHERE id = $1`,
        [subscription.id],
      );
      return { status: 'expired' };
    }

    const periodCount = Number(subscription.completed_periods);
    const anchoredStart = addBillingPeriods(subscription.start_date, subscription.billing_period, periodCount);
    const periodStart = anchoredStart === String(subscription.next_invoice_date).slice(0, 10)
      ? anchoredStart
      : String(subscription.next_invoice_date).slice(0, 10);
    const nextAnchoredStart = addBillingPeriods(subscription.start_date, subscription.billing_period, periodCount + 1);
    const nextFromCursor = addBillingPeriods(periodStart, subscription.billing_period, 1);
    const followingPeriodStart = anchoredStart === periodStart ? nextAnchoredStart : nextFromCursor;
    const naturalPeriodEnd = addDays(followingPeriodStart, -1);
    const periodEnd = subscription.auto_close
      ? [naturalPeriodEnd, String(subscription.expiry_date).slice(0, 10)].sort()[0]
      : naturalPeriodEnd;

    const sourceLines = await loadLines(db, subscription.id);
    const discounts = await loadEligibleDiscounts(db, subscription.id, asOfDate);
    const calculation = calculateInvoiceLines(sourceLines, discounts);
    const existingPeriod = await db.query(
      `SELECT id, period_end FROM invoices
        WHERE subscription_id = $1 AND period_start = $2::date AND period_end = $3::date
          AND status <> 'cancelled'
        LIMIT 1`,
      [subscription.id, periodStart, periodEnd],
    );
    if (existingPeriod.rows[0]) {
      const followingDate = addDays(periodEnd, 1);
      const closes = subscription.auto_close && followingDate > String(subscription.expiry_date).slice(0, 10);
      await db.query(
        `UPDATE subscriptions
            SET next_invoice_date = CASE WHEN $2 THEN NULL ELSE $3::date END,
                expiry_date = CASE WHEN NOT $2 THEN GREATEST(expiry_date, $4::date) ELSE expiry_date END,
                status = CASE WHEN $2 THEN 'closed'::subscription_status ELSE status END,
                closed_at = CASE WHEN $2 THEN now() ELSE closed_at END,
                close_reason = CASE WHEN $2 THEN 'Plan expired' ELSE close_reason END
          WHERE id = $1`,
        [subscription.id, closes, followingDate, existingPeriod.rows[0].period_end],
      );
      return { status: 'already_billed', invoice_id: existingPeriod.rows[0].id };
    }
    const { rows: settings } = await db.query(
      `SELECT value FROM workspace_settings WHERE key = 'auto_confirm_invoices'`,
    );
    const autoConfirm = settings[0]?.value !== false;
    const { rows: invoiceRows } = await db.query(
      `INSERT INTO invoices (
         subscription_id, customer_id, status, invoice_date, due_date, period_start, period_end,
         bill_to_name, bill_to_address, bill_to_tax_number, subtotal, discount_total, tax_total,
         total, confirmed_at, billing_run_id, created_by
       )
       VALUES ($1, $2, 'draft', $3::date, $3::date + $4::int, $5::date, $6::date,
               $7, NULLIF(concat_ws(', ', $8::text, $9::text, $10::text, $11::text, $12::text), ''),
               $13, $14, $15, $16, $17, CASE WHEN $18 THEN now() END, $19, NULL)
       RETURNING id, number, total, due_date`,
      [
        subscription.id, subscription.customer_id, asOfDate, subscription.due_days,
        periodStart, periodEnd, subscription.company_name || subscription.customer_name,
        subscription.address_line1, subscription.address_line2, subscription.city,
        subscription.state, [subscription.postal_code, subscription.country].filter(Boolean).join(' '),
        subscription.tax_number, centsToMoney(calculation.subtotalCents),
        centsToMoney(calculation.discountTotalCents), centsToMoney(calculation.taxTotalCents),
        centsToMoney(calculation.totalCents), autoConfirm, billingRunId,
      ],
    );
    const invoice = invoiceRows[0];
    for (const line of calculation.invoiceLines) {
      await db.query(
        `INSERT INTO invoice_lines (
           invoice_id, subscription_line_id, product_id, description, quantity, unit_price,
           discount_amount, tax_id, tax_name, tax_rate, tax_kind, tax_amount
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10, $11, $12)`,
        [
          invoice.id, line.source.id, line.source.product_id, line.source.description,
          line.source.quantity, line.source.unit_price, centsToMoney(line.discountCents),
          line.source.tax_id, line.source.tax_name, line.source.tax_rate, line.source.tax_kind,
          centsToMoney(line.taxCents),
        ],
      );
    }
    if (autoConfirm) {
      await db.query(
        `UPDATE invoices SET status = 'confirmed', sent_to = $2 WHERE id = $1`,
        [invoice.id, subscription.customer_email],
      );
    }
    for (const discount of calculation.appliedDiscounts) {
      await db.query(
        `INSERT INTO discount_redemptions (discount_id, subscription_id, invoice_id, amount)
         VALUES ($1, $2, $3, $4)`,
        [discount.id, subscription.id, invoice.id, centsToMoney(discount.amountCents)],
      );
      await db.query(
        `UPDATE discount_rules SET times_used = times_used + 1 WHERE id = $1`,
        [discount.id],
      );
    }

    const followingDate = addDays(periodEnd, 1);
    const closes = subscription.auto_close && followingDate > String(subscription.expiry_date).slice(0, 10);
    await db.query(
      `UPDATE subscriptions
          SET next_invoice_date = CASE WHEN $2 THEN NULL ELSE $3::date END,
              expiry_date = CASE WHEN NOT $2 THEN GREATEST(expiry_date, $4::date) ELSE expiry_date END,
              status = CASE WHEN $2 THEN 'closed'::subscription_status ELSE status END,
              closed_at = CASE WHEN $2 THEN now() ELSE closed_at END,
              close_reason = CASE WHEN $2 THEN 'Plan expired' ELSE close_reason END
        WHERE id = $1`,
      [subscription.id, closes, followingDate, periodEnd],
    );

    if (autoConfirm) {
      const paymentInstructions = config.PAYMENT_UPI_ID
        ? `Pay by UPI to ${config.PAYMENT_PAYEE_NAME || 'Brightloop Software'} (${config.PAYMENT_UPI_ID}) and include invoice ${invoice.number} in the payment note.`
        : 'Please contact Brightloop billing and include the invoice number as your payment reference.';
      await enqueueEmail(db, {
        to: subscription.customer_email,
        template: 'invoice_created',
        payload: {
          full_name: subscription.customer_name,
          invoice_number: invoice.number,
          plan_name: subscription.plan_name,
          amount: invoice.total,
          due_date: invoice.due_date,
          payment_instructions: paymentInstructions,
          url: `${config.APP_BASE_URL}/`,
        },
        dedupeKey: `invoice:${invoice.id}:created`,
      });
    }
    await db.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES ('invoice.generate', 'invoice', $1, $2::jsonb)`,
      [invoice.id, JSON.stringify({
        subscription_id: subscription.id,
        period_start: periodStart,
        period_end: periodEnd,
        total: invoice.total,
      })],
    );
    return { status: 'invoiced', invoice };
  });
}

export async function runBilling({ asOfDate = businessDate(), runType = 'manual', requestedBy = null } = {}) {
  const lockClient = await pool.connect();
  let runId;
  try {
    const { rows: lockRows } = await lockClient.query(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [billingLockKey],
    );
    if (!lockRows[0].acquired) {
      throw new AppError(409, 'BILLING_ALREADY_RUNNING', 'A billing run is already in progress.');
    }
    const { rows: runRows } = await lockClient.query(
      `INSERT INTO billing_runs (run_date, run_type, requested_by, status)
       VALUES ($1::date, $2, $3, 'running') RETURNING id`,
      [asOfDate, runType, requestedBy],
    );
    runId = runRows[0].id;
    const lifecycle = await withTransaction(db => applyLifecycleChanges(db, asOfDate));
    const { rows: dueRows } = await pool.query(
      `SELECT count(*)::int AS count FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'active' AND s.next_invoice_date <= $1::date
          AND (NOT p.auto_close OR s.next_invoice_date <= s.expiry_date)`,
      [asOfDate],
    );
    let invoicedCount = 0;
    let failedCount = 0;
    const errors = [];
    const blockedSubscriptions = new Set();
    for (;;) {
      const { rows: due } = await pool.query(
        `SELECT s.id FROM subscriptions s
          JOIN plans p ON p.id = s.plan_id
          WHERE s.status = 'active' AND s.next_invoice_date <= $1::date
            AND (NOT p.auto_close OR s.next_invoice_date <= s.expiry_date)
          ORDER BY s.next_invoice_date, s.id LIMIT 100`,
        [asOfDate],
      );
      if (!due.length) break;
      let madeProgress = false;
      for (const { id } of due) {
        if (blockedSubscriptions.has(String(id))) continue;
        let iterations = 0;
        try {
          while (iterations < maxCatchUpPeriods) {
            const result = await billOne(id, asOfDate, runId);
            if (result.status === 'invoiced') invoicedCount += 1;
            else if (result.status !== 'already_billed') break;
            iterations += 1;
            madeProgress = true;
          }
          if (iterations === maxCatchUpPeriods) {
            throw new AppError(422, 'BILLING_CATCHUP_LIMIT', `Subscription ${id} exceeded the catch-up limit.`);
          }
        } catch (error) {
          blockedSubscriptions.add(String(id));
          failedCount += 1;
          errors.push({
            subscription_id: String(id),
            code: error.code ?? error.name,
            message: String(error.message).slice(0, 300),
          });
        }
      }
      if (!madeProgress) break;
    }
    const { rows: remainingRows } = await pool.query(
      `SELECT s.id::text FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'active' AND s.next_invoice_date <= $1::date
          AND (NOT p.auto_close OR s.next_invoice_date <= s.expiry_date)
        ORDER BY s.id LIMIT 100`,
      [asOfDate],
    );
    for (const remaining of remainingRows) {
      if (!errors.some(error => error.subscription_id === remaining.id)) {
        failedCount += 1;
        errors.push({ subscription_id: remaining.id, code: 'BILLING_REMAINS_DUE', message: 'The due subscription was not billed.' });
      }
    }
    const status = failedCount === 0 ? 'succeeded' : invoicedCount > 0 ? 'partial' : 'failed';
    const { rows: completed } = await lockClient.query(
      `UPDATE billing_runs
          SET finished_at = now(), due_count = $2, invoiced_count = $3,
              failed_count = $4, errors = $5::jsonb, status = $6
        WHERE id = $1
       RETURNING id, run_date, started_at, finished_at, due_count, invoiced_count, failed_count, status, run_type, errors`,
      [runId, dueRows[0].count, invoicedCount, failedCount, JSON.stringify(errors), status],
    );
    return { ...completed[0], lifecycle };
  } catch (error) {
    if (runId) {
      await lockClient.query(
        `UPDATE billing_runs SET finished_at = now(), status = 'failed',
                failed_count = failed_count + 1,
                errors = COALESCE(errors, '[]'::jsonb) || $2::jsonb
          WHERE id = $1 AND status = 'running'`,
        [runId, JSON.stringify([{ code: error.code ?? error.name, message: String(error.message).slice(0, 300) }])],
      );
    }
    throw error;
  } finally {
    await lockClient.query(`SELECT pg_advisory_unlock($1)`, [billingLockKey]).catch(() => {});
    lockClient.release();
  }
}

export async function runScheduledBillingIfNeeded() {
  const { rows } = await pool.query(
    `SELECT started_at FROM billing_runs
      WHERE run_date = $1::date AND run_type = 'scheduled'
      ORDER BY id DESC LIMIT 1`,
    [businessDate()],
  );
  if (rows[0]) return null;
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: config.BUSINESS_TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
  if (hour < 2) return null;
  return runBilling({ asOfDate: businessDate(), runType: 'scheduled' });
}

export async function enqueueDailyReminders(asOfDate = businessDate()) {
  return withTransaction(async db => {
    let queued = 0;
    for (const daysBeforeExpiry of [30, 7, 1]) {
      const { rows } = await db.query(
        `SELECT s.id, s.number, s.expiry_date, c.name AS customer_name, c.email AS customer_email,
                p.name AS plan_name
           FROM subscriptions s JOIN customers c ON c.id = s.customer_id
           JOIN plans p ON p.id = s.plan_id
          WHERE s.status = 'active' AND p.is_renewable
            AND s.expiry_date = $1::date + $2::int`,
        [asOfDate, daysBeforeExpiry],
      );
      for (const subscription of rows) {
        const result = await db.query(
          `INSERT INTO email_outbox (to_email, template, payload, dedupe_key)
           VALUES ($1, 'renewal_reminder', $2::jsonb, $3)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            subscription.customer_email,
            JSON.stringify({
              full_name: subscription.customer_name,
              subscription_number: subscription.number,
              plan_name: subscription.plan_name,
              expiry_date: subscription.expiry_date,
              url: `${config.APP_BASE_URL}/`,
            }),
            `renewal:${subscription.id}:${daysBeforeExpiry}`,
          ],
        );
        queued += result.rowCount;
      }
    }

    const { rows: overdue } = await db.query(
      `SELECT i.id, i.number, i.total - i.amount_paid AS amount_due, i.due_date,
              c.name AS customer_name, c.email AS customer_email, p.name AS plan_name
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         JOIN subscriptions s ON s.id = i.subscription_id JOIN plans p ON p.id = s.plan_id
        WHERE i.status = 'confirmed' AND i.due_date < $1::date AND i.amount_paid < i.total`,
      [asOfDate],
    );
    for (const invoice of overdue) {
      const result = await db.query(
        `INSERT INTO email_outbox (to_email, template, payload, dedupe_key)
         VALUES ($1, 'invoice_reminder', $2::jsonb, $3)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          invoice.customer_email,
          JSON.stringify({
            full_name: invoice.customer_name,
            invoice_number: invoice.number,
            amount: invoice.amount_due,
            due_date: invoice.due_date,
            plan_name: invoice.plan_name,
            url: `${config.APP_BASE_URL}/`,
          }),
          `invoice:${invoice.id}:reminder:${asOfDate}`,
        ],
      );
      queued += result.rowCount;
    }
    return { queued };
  });
}

export async function enqueueScheduledRemindersIfNeeded() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: config.BUSINESS_TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
  if (hour < 9) return null;
  return enqueueDailyReminders();
}
