import { config } from '../../config.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { enqueueEmail } from '../auth/repository.js';

export async function requestSubscription(userId, planId) {
  return withTransaction(async db => {
    const { rows: customerRows } = await db.query(
      `SELECT id, name, email, address_line1, address_line2, city, state, postal_code, country, tax_number
         FROM customers
        WHERE user_id = $1
        FOR UPDATE`,
      [userId],
    );
    const customer = customerRows[0];
    if (!customer) throw new AppError(409, 'CUSTOMER_PROFILE_REQUIRED', 'A customer profile is required before requesting a subscription.');

    const { rows: planRows } = await db.query(
      `SELECT id, name, price, billing_period, min_quantity
         FROM plans
        WHERE id = $1 AND is_active
          AND available_from <= current_date
          AND (available_to IS NULL OR available_to >= current_date)
        FOR SHARE`,
      [planId],
    );
    const plan = planRows[0];
    if (!plan) throw new AppError(404, 'PLAN_UNAVAILABLE', 'This plan is no longer available.');

    const { rows: termsRows } = await db.query(
      `SELECT id, due_days
         FROM payment_terms
        WHERE name IN ('Net 15', 'Immediate') AND is_active
        ORDER BY CASE name WHEN 'Net 15' THEN 0 ELSE 1 END
        LIMIT 1`,
    );
    const paymentTerms = termsRows[0];
    if (!paymentTerms) throw new AppError(503, 'PAYMENT_TERMS_UNAVAILABLE', 'No active invoice payment terms are configured.');

    const { rows: subscriptionRows } = await db.query(
      `INSERT INTO subscriptions (
         customer_id, plan_id, payment_term_id, status, start_date, expiry_date, created_by
       )
       SELECT $1, $2, $3, 'draft', current_date,
              CASE p.billing_period
                WHEN 'daily' THEN current_date + 1
                WHEN 'weekly' THEN current_date + 7
                WHEN 'monthly' THEN (current_date + interval '1 month')::date
                WHEN 'yearly' THEN (current_date + interval '1 year')::date
              END,
              $4
         FROM plans p
        WHERE p.id = $2
       RETURNING id, number`,
      [customer.id, plan.id, paymentTerms.id, userId],
    );
    if (!subscriptionRows[0]) throw new AppError(404, 'PLAN_UNAVAILABLE', 'This plan is no longer available.');
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    await db.query(
      `UPDATE subscriptions SET status = 'quotation' WHERE id = $1`,
      [subscriptionRows[0].id],
    );
    const { rows: confirmedSubscriptionRows } = await db.query(
      `UPDATE subscriptions SET status = 'confirmed' WHERE id = $1 RETURNING id, number`,
      [subscriptionRows[0].id],
    );
    const subscription = confirmedSubscriptionRows[0];
    if (!subscription) throw new AppError(404, 'PLAN_UNAVAILABLE', 'This plan is no longer available.');

    const { rows: invoiceRows } = await db.query(
      `INSERT INTO invoices (
         subscription_id, customer_id, status, invoice_date, due_date, period_start, period_end,
         bill_to_name, bill_to_address, bill_to_tax_number, subtotal, tax_total, total,
         confirmed_at, sent_at, created_by
       )
       SELECT $1, $2, 'draft', current_date, current_date + $3::int, current_date,
              s.expiry_date, $4, NULLIF(concat_ws(', ', $5::text, $6::text, $7::text, $8::text, $9::text), ''),
              $10, $11, 0, $11, NULL, NULL, $12
         FROM subscriptions s
        WHERE s.id = $1
       RETURNING id, number, total, due_date`,
      [
        subscription.id,
        customer.id,
        paymentTerms.due_days,
        customer.name,
        customer.address_line1,
        customer.address_line2,
        customer.city,
        customer.state,
        [customer.postal_code, customer.country].filter(Boolean).join(' '),
        customer.tax_number,
        Number(plan.price) * plan.min_quantity,
        userId,
      ],
    );
    const invoice = invoiceRows[0];

    await db.query(
      `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price)
       VALUES ($1, $2, $3, $4)`,
      [invoice.id, plan.name, plan.min_quantity, plan.price],
    );
    const { rows: confirmedInvoiceRows } = await db.query(
      `UPDATE invoices
          SET status = 'confirmed', confirmed_at = now(), sent_at = now()
        WHERE id = $1
       RETURNING id, number, total, due_date`,
      [invoice.id],
    );
    const confirmedInvoice = confirmedInvoiceRows[0];
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'marketplace.subscribe', 'subscription', $2, $3::jsonb)`,
      [userId, subscription.id, JSON.stringify({ plan_id: plan.id, invoice_id: confirmedInvoice.id })],
    );

    const paymentText = config.PAYMENT_UPI_ID
      ? `Pay by UPI to ${config.PAYMENT_PAYEE_NAME || 'Brightloop Software'} (${config.PAYMENT_UPI_ID}) and include invoice ${invoice.number} in the payment note.`
      : 'Please contact Brightloop billing for UPI or bank-transfer instructions and include your invoice number as the payment reference.';
    await enqueueEmail(db, {
      to: customer.email,
      template: 'invoice_created',
      payload: {
        full_name: customer.name,
        invoice_number: confirmedInvoice.number,
        plan_name: plan.name,
        amount: confirmedInvoice.total,
        due_date: confirmedInvoice.due_date,
        payment_instructions: paymentText,
        url: `${config.APP_BASE_URL}/`,
      },
      dedupeKey: `invoice:${confirmedInvoice.id}:created`,
    });

    return {
      subscription: { id: subscription.id, number: subscription.number, status: 'Confirmed' },
      invoice: {
        id: confirmedInvoice.id,
        number: confirmedInvoice.number,
        amount: confirmedInvoice.total,
        due_date: confirmedInvoice.due_date,
      },
    };
  });
}
