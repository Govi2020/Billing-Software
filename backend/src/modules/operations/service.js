import { config } from '../../config.js';
import { withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { enqueueEmail } from '../auth/repository.js';
import { businessDate, loadEligibleDiscounts, loadLines } from '../billing/service.js';
import { addBillingPeriods, calculateInvoiceLines, centsToMoney } from '../billing/math.js';

const maxPauseSkipPeriods = 400;

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

export async function updateProduct(productId, details, userId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE products
          SET name = $2, type = $3, sales_price = $4, cost_price = $5, tax_id = $6,
              notes = $7, updated_at = now()
        WHERE id = $1
        RETURNING id, name, type, sales_price AS price, cost_price AS cost, tax_id, notes`,
      [productId, details.name, details.type, details.sales_price, details.cost_price, details.tax_id, details.notes],
    );
    if (!rows[0]) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'The product does not exist.');
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'product.update', 'product', $2, $3::jsonb)`,
      [userId, productId, JSON.stringify({ name: rows[0].name })],
    );
    return rows[0];
  });
}

export async function updateTax(taxId, details, userId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE taxes SET name = $2, kind = $3, rate = $4 WHERE id = $1
       RETURNING id, name, kind, rate`,
      [taxId, details.name, details.kind, details.rate],
    );
    if (!rows[0]) throw new AppError(404, 'TAX_NOT_FOUND', 'The tax does not exist.');
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'tax.update', 'tax', $2, $3::jsonb)`,
      [userId, taxId, JSON.stringify({ name: rows[0].name })],
    );
    return rows[0];
  });
}

export async function deactivateCatalogRecord(type, recordId, userId) {
  const records = {
    product: { table: 'products', action: 'product.deactivate' },
    tax: { table: 'taxes', action: 'tax.deactivate' },
    discount: { table: 'discount_rules', action: 'discount.deactivate' },
  };
  const record = records[type];
  if (!record) throw new AppError(400, 'INVALID_RECORD_TYPE', 'This catalog record cannot be deactivated.');
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE ${record.table} SET is_active = FALSE${record.table === 'taxes' ? '' : ', updated_at = now()'}
        WHERE id = $1 AND is_active
        RETURNING id`,
      [recordId],
    );
    if (!rows[0]) throw new AppError(404, 'RECORD_NOT_FOUND', 'The active record does not exist.');
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, '{}'::jsonb)`,
      [userId, record.action, type, recordId],
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

export async function updateDiscount(discountId, details, userId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE discount_rules
          SET name = $2, kind = $3, value = $4, scope = $5, min_purchase_amount = $6,
              min_quantity = $7, start_date = $8, end_date = $9, usage_limit = $10,
              updated_at = now()
        WHERE id = $1
        RETURNING id, name, kind, value, scope, usage_limit`,
      [
        discountId, details.name, details.kind, details.value, details.scope,
        details.min_purchase_amount, details.min_quantity, details.start_date,
        details.end_date, details.usage_limit,
      ],
    );
    if (!rows[0]) throw new AppError(404, 'DISCOUNT_NOT_FOUND', 'The discount does not exist.');
    await db.query(`DELETE FROM discount_products WHERE discount_id = $1`, [discountId]);
    if (details.scope === 'product') {
      for (const productId of details.product_ids) {
        await db.query(
          `INSERT INTO discount_products (discount_id, product_id) VALUES ($1, $2)`,
          [discountId, productId],
        );
      }
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'discount.update', 'discount', $2, $3::jsonb)`,
      [userId, discountId, JSON.stringify({ name: rows[0].name, scope: rows[0].scope })],
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

export async function createQuotation({ customer_id: customerId, plan_id: planId, template_id: templateId = null }, userId) {
  return withTransaction(async db => {
    const { rows: customerRows } = await db.query(
      `SELECT id FROM customers WHERE id = $1`,
      [customerId],
    );
    if (!customerRows[0]) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'The selected customer does not exist.');

    const { rows: planRows } = await db.query(
      `SELECT id, billing_period, min_quantity FROM plans
        WHERE id = $1 AND is_active AND available_from <= current_date
          AND (available_to IS NULL OR available_to >= current_date)`,
      [planId],
    );
    if (!planRows[0]) throw new AppError(404, 'PLAN_UNAVAILABLE', 'The selected plan is not currently available.');

    let validityDays = 30;
    if (templateId) {
      const { rows: templates } = await db.query(
        `SELECT id, plan_id, validity_days FROM quotation_templates WHERE id = $1 AND is_active`,
        [templateId],
      );
      if (!templates[0] || String(templates[0].plan_id) !== String(planId)) {
        throw new AppError(422, 'INVALID_QUOTATION_TEMPLATE', 'The selected template does not match the plan.');
      }
      validityDays = templates[0].validity_days;
    }

    const { rows: termRows } = await db.query(
      `SELECT id FROM payment_terms WHERE name = 'Net 15' AND is_active LIMIT 1`,
    );
    if (!termRows[0]) throw new AppError(503, 'PAYMENT_TERMS_UNAVAILABLE', 'No active invoice payment terms are configured.');

    const { rows } = await db.query(
      `INSERT INTO subscriptions (
         customer_id, plan_id, template_id, payment_term_id, status, start_date,
         expiry_date, quotation_valid_until, created_by
       )
       SELECT $1, p.id, $3, $4, 'draft', current_date,
              CASE p.billing_period
                WHEN 'daily' THEN current_date
                WHEN 'weekly' THEN current_date + 6
                WHEN 'monthly' THEN (current_date + interval '1 month')::date - 1
                WHEN 'yearly' THEN (current_date + interval '1 year')::date - 1
              END,
              current_date + $5::int, $6
         FROM plans p WHERE p.id = $2
       RETURNING id, number, status`,
      [customerId, planId, templateId, termRows[0].id, validityDays, userId],
    );
    if (templateId) {
      const { rows: copiedLines } = await db.query(
        `INSERT INTO subscription_lines (
           subscription_id, product_id, variant_id, quantity, unit_price, tax_id, sort_order
         )
         SELECT $1, qtl.product_id, qtl.variant_id, qtl.quantity,
                p.sales_price + COALESCE(v.extra_price, 0), COALESCE(p.tax_id, NULL), qtl.sort_order
           FROM quotation_template_lines qtl
           JOIN products p ON p.id = qtl.product_id AND p.is_active
           LEFT JOIN product_variants v ON v.id = qtl.variant_id AND v.is_active
          WHERE qtl.template_id = $2
         RETURNING id`,
        [rows[0].id, templateId],
      );
      if (!copiedLines.length) {
        throw new AppError(422, 'EMPTY_QUOTATION_TEMPLATE', 'The quotation template must contain at least one active product line.');
      }
    }
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    const { rows: quotationRows } = await db.query(
      `UPDATE subscriptions SET status = 'quotation' WHERE id = $1 RETURNING id, number, status`,
      [rows[0].id],
    );
    const quotation = quotationRows[0];
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'subscription.quotation.create', 'subscription', $2, $3::jsonb)`,
      [userId, quotation.id, JSON.stringify({ customer_id: customerId, plan_id: planId, template_id: templateId })],
    );
    return quotation;
  });
}

export async function confirmQuotation(subscriptionId, userId, role = 'staff') {
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
        WHERE s.id = $1 AND ($3 <> 'customer' OR c.user_id = $2)
        FOR UPDATE OF s`,
      [subscriptionId, userId, role],
    );
    const subscription = rows[0];
    if (!subscription) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'The subscription does not exist.');
    if (subscription.status !== 'quotation') {
      throw new AppError(409, 'INVALID_TRANSITION', 'Only quotations can be confirmed.');
    }
    const validity = await db.query(
      `SELECT quotation_valid_until >= $2::date AS valid
         FROM subscriptions WHERE id = $1`,
      [subscription.id, businessDate()],
    );
    if (validity.rows[0]?.valid === false) {
      throw new AppError(409, 'QUOTATION_EXPIRED', 'This quotation has expired and cannot be accepted.');
    }

    const { rows: termsRows } = await db.query(
      `SELECT due_days FROM payment_terms WHERE id = $1 AND is_active`,
      [subscription.payment_term_id],
    );
    const terms = termsRows[0];
    if (!terms) throw new AppError(503, 'PAYMENT_TERMS_UNAVAILABLE', 'The subscription payment terms are unavailable.');

    const lines = await loadLines(db, subscription.id);
    const discounts = await loadEligibleDiscounts(db, subscription.id, businessDate());
    const calculation = calculateInvoiceLines(lines, discounts);
    const { rows: invoiceRows } = await db.query(
      `INSERT INTO invoices (
         subscription_id, customer_id, status, invoice_date, due_date, period_start, period_end,
         bill_to_name, bill_to_address, bill_to_tax_number, subtotal, discount_total, tax_total, total, created_by
       )
       VALUES ($1, $2, 'draft', current_date, current_date + $3::int, current_date, $4,
               $5, NULLIF(concat_ws(', ', $6::text, $7::text, $8::text, $9::text, $10::text), ''),
             $11, $12, $13, $14, $15, $16)
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
        centsToMoney(calculation.subtotalCents),
        centsToMoney(calculation.discountTotalCents),
        centsToMoney(calculation.taxTotalCents),
        centsToMoney(calculation.totalCents),
        userId,
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
    const { rows: confirmedRows } = await db.query(
      `UPDATE invoices SET status = 'confirmed', confirmed_at = now(), sent_to = $2
        WHERE id = $1
       RETURNING id, number, total, due_date`,
      [invoice.id, subscription.customer_email],
    );
    await db.query(
      `UPDATE subscriptions SET status = 'confirmed' WHERE id = $1`,
      [subscription.id],
    );
    for (const discount of calculation.appliedDiscounts) {
      await db.query(
        `INSERT INTO discount_redemptions (discount_id, subscription_id, invoice_id, amount)
         VALUES ($1, $2, $3, $4)`,
        [discount.id, subscription.id, invoice.id, centsToMoney(discount.amountCents)],
      );
      await db.query(`UPDATE discount_rules SET times_used = times_used + 1 WHERE id = $1`, [discount.id]);
    }

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
      `SELECT s.id, s.number, s.status, s.paused_at, s.start_date, s.expiry_date,
              s.next_invoice_date, p.is_pausable, p.is_closable, p.billing_period
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
    let updateParams = [subscription.id];
    if (action === 'pause' && subscription.status === 'active' && subscription.is_pausable) {
      update = `UPDATE subscriptions SET status = 'paused', paused_at = now() WHERE id = $1`;
    } else if (action === 'resume' && subscription.status === 'paused' && subscription.is_pausable) {
      const { rows: policyRows } = await db.query(
        `SELECT value FROM workspace_settings WHERE key = 'pause_policy'`,
      );
      const pausePolicy = policyRows[0]?.value === 'skip' ? 'skip' : 'shift';
      const asOfDate = businessDate();
      if (pausePolicy === 'shift') {
        update = `UPDATE subscriptions SET status = 'active', paused_at = NULL,
                    expiry_date = expiry_date + GREATEST(
                      $2::date - (paused_at AT TIME ZONE $3)::date, 0
                    ),
                    next_invoice_date = next_invoice_date + GREATEST(
                      $2::date - (paused_at AT TIME ZONE $3)::date, 0
                    )
                  WHERE id = $1`;
        updateParams = [subscription.id, asOfDate, config.BUSINESS_TIMEZONE];
      } else {
        let nextInvoiceDate = subscription.next_invoice_date
          ? String(subscription.next_invoice_date).slice(0, 10)
          : null;
        if (nextInvoiceDate) {
          const { rows: periodRows } = await db.query(
            `SELECT count(*)::int AS completed_periods FROM invoices
              WHERE subscription_id = $1 AND period_start < $2::date`,
            [subscription.id, nextInvoiceDate],
          );
          let periodCount = Number(periodRows[0].completed_periods);
          const startDate = String(subscription.start_date).slice(0, 10);
          const anchoredDate = addBillingPeriods(startDate, subscription.billing_period, periodCount);
          let iterations = 0;
          if (anchoredDate === nextInvoiceDate) {
            nextInvoiceDate = anchoredDate;
            while (nextInvoiceDate <= asOfDate && iterations < maxPauseSkipPeriods) {
              periodCount += 1;
              nextInvoiceDate = addBillingPeriods(startDate, subscription.billing_period, periodCount);
              iterations += 1;
            }
          } else {
            while (nextInvoiceDate <= asOfDate && iterations < maxPauseSkipPeriods) {
              nextInvoiceDate = addBillingPeriods(nextInvoiceDate, subscription.billing_period, 1);
              iterations += 1;
            }
          }
          if (nextInvoiceDate <= asOfDate) {
            throw new AppError(422, 'PAUSE_SKIP_LIMIT', 'The paused subscription exceeds the period skip limit.');
          }
        }
        update = `UPDATE subscriptions SET status = 'active', paused_at = NULL,
                    next_invoice_date = $2::date WHERE id = $1`;
        updateParams = [subscription.id, nextInvoiceDate];
      }
    } else if (action === 'close' && ['draft', 'quotation', 'confirmed', 'active', 'paused'].includes(subscription.status)
               && subscription.is_closable) {
      update = `UPDATE subscriptions SET status = 'closed', closed_at = now(),
                close_reason = $2 WHERE id = $1`;
    } else {
      throw new AppError(409, 'ACTION_NOT_ALLOWED', "This action is not available for the subscription's current status or plan.");
    }

    if (action === 'close') {
      updateParams = [
        subscription.id,
        role === 'admin' ? 'Cancelled by admin' : role === 'staff' ? 'Closed by staff' : 'Closed by customer',
      ];
    }
    await db.query(update, updateParams);
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
              c.name AS customer_name, c.email AS customer_email,
              s.status AS subscription_status, i.period_end
         FROM invoices i
         JOIN subscriptions s ON s.id = i.subscription_id
         JOIN customers c ON c.id = i.customer_id
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
    const balance = Number(invoice.total) - Number(updatedInvoiceRows[0].amount_paid);
    await enqueueEmail(db, {
      to: invoice.customer_email,
      template: 'payment_receipt',
      payload: {
        full_name: invoice.customer_name,
        invoice_number: invoice.number,
        payment_amount: details.amount,
        payment_date: details.payment_date,
        payment_method: details.method,
        balance,
        url: `${config.APP_BASE_URL}/`,
      },
      dedupeKey: `payment:${payment.id}:receipt`,
    });
    if (updatedInvoiceRows[0].status === 'paid' && invoice.subscription_status === 'confirmed') {
      await db.query(
        `UPDATE subscriptions SET status = 'active', next_invoice_date = $2::date + 1
          WHERE id = $1 AND status = 'confirmed'`,
        [invoice.subscription_id, invoice.period_end],
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
