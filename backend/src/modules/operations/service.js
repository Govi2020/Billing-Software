import { config } from '../../config.js';
import { withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { enqueueEmail } from '../auth/repository.js';

export async function createCustomer(details, userId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `INSERT INTO customers (name, email, company_name, phone, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, company_name AS company, phone`,
      [details.name, details.email, details.company_name || null, details.phone || null, userId],
    );
    const customer = rows[0];
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'customer.create', 'customer', $2, $3::jsonb)`,
      [userId, customer.id, JSON.stringify({ email: customer.email })],
    );
    return customer;
  });
}

export async function createProduct(details, userId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `INSERT INTO products (name, type, sales_price, cost_price, tax_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, type, sales_price AS price, cost_price AS cost, tax_id, notes`,
      [details.name, details.type, details.sales_price, details.cost_price, details.tax_id, details.notes, userId],
    );
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'product.create', 'product', $2, $3::jsonb)`,
      [userId, rows[0].id, JSON.stringify({ name: rows[0].name })],
    );
    return rows[0];
  });
}

export async function createTax(details, userId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `INSERT INTO taxes (name, kind, rate) VALUES ($1, $2, $3)
       RETURNING id, name, kind, rate`,
      [details.name, details.kind, details.rate],
    );
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'tax.create', 'tax', $2, $3::jsonb)`,
      [userId, rows[0].id, JSON.stringify({ name: rows[0].name })],
    );
    return rows[0];
  });
}

export async function createDiscount(details, userId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `INSERT INTO discount_rules (
         name, kind, value, scope, min_purchase_amount, min_quantity,
         start_date, end_date, usage_limit, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, kind, value, scope, usage_limit`,
      [
        details.name,
        details.kind,
        details.value,
        details.scope,
        details.min_purchase_amount,
        details.min_quantity,
        details.start_date,
        details.end_date,
        details.usage_limit,
        userId,
      ],
    );
    if (details.scope === 'product') {
      for (const productId of details.product_ids) {
        await db.query(
          `INSERT INTO discount_products (discount_id, product_id) VALUES ($1, $2)`,
          [rows[0].id, productId],
        );
      }
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'discount.create', 'discount', $2, $3::jsonb)`,
      [userId, rows[0].id, JSON.stringify({ name: rows[0].name, scope: rows[0].scope })],
    );
    return rows[0];
  });
}

export async function updateCustomerProfile(userId, details) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE customers
          SET name = $2, company_name = $3, phone = $4, address_line1 = $5,
              address_line2 = $6, city = $7, state = $8, postal_code = $9, country = $10
        WHERE user_id = $1
        RETURNING id, name, company_name AS company, email, phone, address_line1,
                  address_line2, city, state, postal_code, country`,
      [
        userId,
        details.name,
        details.company_name,
        details.phone,
        details.address_line1,
        details.address_line2,
        details.city,
        details.state,
        details.postal_code,
        details.country,
      ],
    );
    if (!rows[0]) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'No customer profile is linked to this account.');
    await db.query(`UPDATE users SET full_name = $2 WHERE id = $1`, [userId, details.name]);
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'customer.profile.update', 'customer', $2, '{}'::jsonb)`,
      [userId, rows[0].id],
    );
    return rows[0];
  });
}

export async function createQuotation({ customer_id: customerId, plan_id: planId }, userId) {
  return withTransaction(async db => {
    const { rows: customerRows } = await db.query(
      `SELECT id FROM customers WHERE id = $1`,
      [customerId],
    );
    if (!customerRows[0]) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'The selected customer does not exist.');

    const { rows: planRows } = await db.query(
      `SELECT id, billing_period FROM plans
        WHERE id = $1 AND is_active AND available_from <= current_date
          AND (available_to IS NULL OR available_to >= current_date)`,
      [planId],
    );
    if (!planRows[0]) throw new AppError(404, 'PLAN_UNAVAILABLE', 'The selected plan is not currently available.');

    const { rows: termRows } = await db.query(
      `SELECT id FROM payment_terms WHERE name = 'Net 15' AND is_active LIMIT 1`,
    );
    if (!termRows[0]) throw new AppError(503, 'PAYMENT_TERMS_UNAVAILABLE', 'No active invoice payment terms are configured.');

    const { rows } = await db.query(
      `INSERT INTO subscriptions (customer_id, plan_id, payment_term_id, status, start_date, expiry_date, created_by)
       SELECT $1, p.id, $3, 'draft', current_date,
              CASE p.billing_period
                WHEN 'daily' THEN current_date + 1
                WHEN 'weekly' THEN current_date + 7
                WHEN 'monthly' THEN (current_date + interval '1 month')::date
                WHEN 'yearly' THEN (current_date + interval '1 year')::date
              END,
              $4
         FROM plans p WHERE p.id = $2
       RETURNING id, number, status`,
      [customerId, planId, termRows[0].id, userId],
    );
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    const { rows: quotationRows } = await db.query(
      `UPDATE subscriptions SET status = 'quotation' WHERE id = $1 RETURNING id, number, status`,
      [rows[0].id],
    );
    const quotation = quotationRows[0];
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'subscription.quotation.create', 'subscription', $2, $3::jsonb)`,
      [userId, quotation.id, JSON.stringify({ customer_id: customerId, plan_id: planId })],
    );
    return quotation;
  });
}

export async function confirmQuotation(subscriptionId, userId) {
  return withTransaction(async db => {
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    const { rows } = await db.query(
      `SELECT s.id, s.number, s.status, s.expiry_date, s.payment_term_id,
              c.id AS customer_id, c.name AS customer_name, c.email AS customer_email,
              c.address_line1, c.address_line2, c.city, c.state, c.postal_code, c.country, c.tax_number,
              p.id AS plan_id, p.name AS plan_name, p.price, p.min_quantity
         FROM subscriptions s
         JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
        WHERE s.id = $1
        FOR UPDATE OF s`,
      [subscriptionId],
    );
    const subscription = rows[0];
    if (!subscription) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'The subscription does not exist.');
    if (subscription.status !== 'quotation') {
      throw new AppError(409, 'INVALID_TRANSITION', 'Only quotations can be confirmed.');
    }

    const { rows: termsRows } = await db.query(
      `SELECT due_days FROM payment_terms WHERE id = $1 AND is_active`,
      [subscription.payment_term_id],
    );
    const terms = termsRows[0];
    if (!terms) throw new AppError(503, 'PAYMENT_TERMS_UNAVAILABLE', 'The subscription payment terms are unavailable.');

    const amount = Number(subscription.price) * subscription.min_quantity;
    const { rows: invoiceRows } = await db.query(
      `INSERT INTO invoices (
         subscription_id, customer_id, status, invoice_date, due_date, period_start, period_end,
         bill_to_name, bill_to_address, bill_to_tax_number, subtotal, tax_total, total, created_by
       )
       VALUES ($1, $2, 'draft', current_date, current_date + $3::int, current_date, $4,
               $5, NULLIF(concat_ws(', ', $6::text, $7::text, $8::text, $9::text, $10::text), ''), $11, $12, 0, $12, $13)
       RETURNING id, number, total, due_date`,
      [
        subscription.id,
        subscription.customer_id,
        terms.due_days,
        subscription.expiry_date,
        subscription.customer_name,
        subscription.address_line1,
        subscription.address_line2,
        subscription.city,
        subscription.state,
        [subscription.postal_code, subscription.country].filter(Boolean).join(' '),
        subscription.tax_number,
        amount,
        userId,
      ],
    );
    const invoice = invoiceRows[0];
    await db.query(
      `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price)
       VALUES ($1, $2, $3, $4)`,
      [invoice.id, subscription.plan_name, subscription.min_quantity, subscription.price],
    );
    const { rows: confirmedRows } = await db.query(
      `UPDATE invoices SET status = 'confirmed', confirmed_at = now(), sent_at = now()
        WHERE id = $1
       RETURNING id, number, total, due_date`,
      [invoice.id],
    );
    await db.query(
      `UPDATE subscriptions SET status = 'confirmed' WHERE id = $1`,
      [subscription.id],
    );

    const paymentInstructions = config.PAYMENT_UPI_ID
      ? `Pay by UPI to ${config.PAYMENT_PAYEE_NAME || 'Brightloop Software'} (${config.PAYMENT_UPI_ID}) and include invoice ${invoice.number} in the payment note.`
      : 'Please contact Brightloop billing for UPI or bank-transfer instructions and include your invoice number as the payment reference.';
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
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'subscription.confirm', 'subscription', $2, $3::jsonb)`,
      [userId, subscription.id, JSON.stringify({ invoice_id: invoice.id })],
    );
    return {
      subscription: { id: subscription.id, number: subscription.number, status: 'Confirmed' },
      invoice: confirmedRows[0],
    };
  });
}

export async function manageSubscription(subscriptionId, action, userId, role) {
  return withTransaction(async db => {
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    const { rows } = await db.query(
      `SELECT s.id, s.number, s.status, p.is_pausable, p.is_closable
         FROM subscriptions s
         JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
        WHERE s.id = $1 AND ($3 <> 'customer' OR c.user_id = $2)
        FOR UPDATE OF s`,
      [subscriptionId, userId, role],
    );
    const subscription = rows[0];
    if (!subscription) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'The subscription does not exist.');

    let update;
    if (action === 'pause' && subscription.status === 'active' && subscription.is_pausable) {
      update = `UPDATE subscriptions SET status = 'paused', paused_at = now() WHERE id = $1`;
    } else if (action === 'resume' && subscription.status === 'paused' && subscription.is_pausable) {
      update = `UPDATE subscriptions SET status = 'active', paused_at = NULL,
                next_invoice_date = GREATEST(COALESCE(next_invoice_date, current_date), current_date)
                WHERE id = $1`;
    } else if (action === 'close' && ['draft', 'quotation', 'confirmed', 'active', 'paused'].includes(subscription.status)
               && subscription.is_closable) {
      update = `UPDATE subscriptions SET status = 'closed', closed_at = now(),
                close_reason = 'Closed by customer' WHERE id = $1`;
    } else {
      throw new AppError(409, 'ACTION_NOT_ALLOWED', "This action is not available for the subscription's current status or plan.");
    }

    await db.query(update, [subscription.id]);
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'subscription', $3, $4::jsonb)`,
      [userId, `subscription.${action}`, subscription.id, JSON.stringify({ from_status: subscription.status })],
    );
    return { id: subscription.id, number: subscription.number, status: action === 'pause' ? 'Paused' : action === 'close' ? 'Closed' : 'Active' };
  });
}

export async function recordPayment(invoiceId, details, userId) {
  return withTransaction(async db => {
    const { rows: dateRows } = await db.query(
      `SELECT $1::date <= current_date AS allowed`,
      [details.payment_date],
    );
    if (!dateRows[0].allowed) {
      throw new AppError(422, 'FUTURE_PAYMENT_DATE', 'Payment date cannot be in the future.');
    }
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    const { rows } = await db.query(
      `SELECT i.id, i.number, i.status, i.total, i.amount_paid, i.subscription_id,
              s.status AS subscription_status
         FROM invoices i
         JOIN subscriptions s ON s.id = i.subscription_id
        WHERE i.id = $1
        FOR UPDATE OF i`,
      [invoiceId],
    );
    const invoice = rows[0];
    if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'The invoice does not exist.');
    if (invoice.status !== 'confirmed') {
      throw new AppError(409, 'INVOICE_NOT_PAYABLE', 'Only confirmed, unpaid invoices can receive a payment.');
    }
    if (details.amount > Number(invoice.total) - Number(invoice.amount_paid)) {
      throw new AppError(422, 'OVERPAYMENT', 'Payment amount cannot exceed the invoice balance.');
    }

    const { rows: paymentRows } = await db.query(
      `INSERT INTO payments (invoice_id, method, amount, payment_date, reference, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, invoice_id, method, amount, payment_date`,
      [
        invoice.id,
        details.method,
        details.amount,
        details.payment_date,
        details.reference || null,
        details.note || null,
        userId,
      ],
    );
    const payment = paymentRows[0];
    const { rows: updatedInvoiceRows } = await db.query(
      `SELECT status, amount_paid FROM invoices WHERE id = $1`,
      [invoice.id],
    );
    if (updatedInvoiceRows[0].status === 'paid' && invoice.subscription_status === 'confirmed') {
      await db.query(
        `UPDATE subscriptions SET status = 'active', next_invoice_date = expiry_date
          WHERE id = $1 AND status = 'confirmed'`,
        [invoice.subscription_id],
      );
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'payment.create', 'payment', $2, $3::jsonb)`,
      [userId, payment.id, JSON.stringify({ invoice_id: invoice.id, amount: details.amount, method: details.method })],
    );
    return { ...payment, invoice_status: updatedInvoiceRows[0].status, amount_paid: updatedInvoiceRows[0].amount_paid };
  });
}
