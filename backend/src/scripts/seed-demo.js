import argon2 from 'argon2';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/pool.js';

if (config.NODE_ENV === 'production') {
  console.error('Demo seeding is disabled in production.');
  process.exit(1);
}

if (!config.DEMO_SEED_PASSWORD) {
  console.error('Set DEMO_SEED_PASSWORD in the local environment before seeding demo accounts.');
  process.exit(1);
}

if (config.DEMO_SEED_PASSWORD.length < 9
    || !/[A-Z]/.test(config.DEMO_SEED_PASSWORD)
    || !/[a-z]/.test(config.DEMO_SEED_PASSWORD)
    || !/[^A-Za-z0-9]/.test(config.DEMO_SEED_PASSWORD)) {
  console.error('DEMO_SEED_PASSWORD does not meet the password policy.');
  process.exit(1);
}

const hash = await argon2.hash(config.DEMO_SEED_PASSWORD, { type: argon2.argon2id });
const demoUsers = [
  { email: 'admin@brightloop.test', name: 'Anika Rao', role: 'admin' },
  { email: 'staff@brightloop.test', name: 'Rohan Mehta', role: 'staff' },
  { email: 'customer@brightloop.test', name: 'Priya Shah', role: 'customer' },
];
const legacyDemoCustomerEmails = Array.from({ length: 10 }, (_, index) =>
  `demo.customer${String(index + 1).padStart(2, '0')}@brightloop.test`);
const demoProducts = [
  ['Brightloop CRM', 'software', 1299, 390],
  ['Brightloop Cloud Storage', 'service', 499, 120],
  ['Brightloop Team Chat', 'software', 299, 80],
  ['Brightloop Analytics', 'software', 1899, 540],
  ['Brightloop Helpdesk', 'service', 799, 210],
  ['Brightloop Email Suite', 'software', 399, 110],
  ['Brightloop Video Meetings', 'service', 599, 170],
  ['Brightloop Project Board', 'software', 699, 190],
  ['Brightloop Security Monitor', 'service', 999, 300],
  ['Brightloop Backup Vault', 'service', 349, 95],
  ['Brightloop Forms', 'software', 249, 70],
  ['Brightloop API Access', 'add_on', 899, 250],
  ['Brightloop Commerce Tools', 'software', 1599, 460],
  ['Brightloop HR Desk', 'service', 1199, 340],
  ['Brightloop Developer Tools', 'software', 1399, 400],
];
const demoPlans = [
  ['CRM Starter', 499, 'monthly', 1],
  ['CRM Growth', 1299, 'monthly', 1],
  ['CRM Business', 3499, 'monthly', 1],
  ['Cloud Storage 100 GB', 199, 'monthly', 1],
  ['Cloud Storage 1 TB', 799, 'monthly', 1],
  ['Team Chat Essentials', 149, 'monthly', 1],
  ['Team Chat Business', 549, 'monthly', 1],
  ['Analytics Pro', 1899, 'monthly', 1],
  ['Helpdesk Team', 799, 'monthly', 1],
  ['Email Suite Annual', 3999, 'yearly', 1],
  ['Video Meetings Plus', 599, 'monthly', 1],
  ['Project Board Team', 699, 'monthly', 1],
  ['Security Monitor', 999, 'monthly', 1],
  ['Backup Vault 500 GB', 349, 'monthly', 1],
  ['Forms Starter', 249, 'monthly', 1],
  ['API Access Pack', 899, 'monthly', 1],
  ['Commerce Growth', 1599, 'monthly', 1],
  ['HR Desk Team', 1199, 'monthly', 1],
  ['Developer Tools Annual', 13999, 'yearly', 1],
  ['All-in-One Workspace', 4999, 'monthly', 1],
];
try {
  await withTransaction(async db => {
    for (const user of demoUsers) {
      await db.query(
        `INSERT INTO users (email, password_hash, full_name, role, email_verified_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT ((lower(email))) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               full_name = EXCLUDED.full_name,
               role = EXCLUDED.role,
               is_active = TRUE,
               email_verified_at = now()`,
        [user.email, hash, user.name, user.role],
      );
    }
    const { rows: adminRows } = await db.query(
      `SELECT id FROM users WHERE lower(email) = lower('admin@brightloop.test')`,
    );
    if (!adminRows[0]) throw new Error('Could not create or find the demo admin account.');
    const adminId = adminRows[0].id;
    const { rows: termsRows } = await db.query(
      `SELECT id FROM payment_terms WHERE name = 'Net 15' AND is_active LIMIT 1`,
    );
    if (!termsRows[0]) throw new Error('An active Net 15 payment term is required for demo subscriptions.');
    const paymentTermId = termsRows[0].id;
    await db.query(
      `INSERT INTO customers (user_id, name, company_name, email)
       SELECT id, 'Priya Shah', 'Shah & Co.', email
         FROM users
        WHERE lower(email) = lower('customer@brightloop.test')
       ON CONFLICT (user_id) DO NOTHING`,
    );

    await db.query(
      `INSERT INTO taxes (name, kind, rate)
       VALUES ('Demo GST 18%', 'percentage', 18), ('Demo GST 5%', 'percentage', 5)
       ON CONFLICT (name) DO NOTHING`,
    );

    const products = [];
    for (const [name, type, salesPrice, costPrice] of demoProducts) {
      const { rows: existing } = await db.query(`SELECT id FROM products WHERE name = $1 LIMIT 1`, [name]);
      if (existing[0]) {
        products.push(existing[0]);
        continue;
      }
      const { rows } = await db.query(
        `INSERT INTO products (name, type, sales_price, cost_price, notes, created_by)
         VALUES ($1, $2, $3, $4, 'Seeded Brightloop demo service.', $5)
         RETURNING id`,
        [name, type, salesPrice, costPrice, adminId],
      );
      products.push(rows[0]);
    }

    const plans = [];
    for (const [name, price, period, quantity] of demoPlans) {
      const { rows: existing } = await db.query(`SELECT id FROM plans WHERE name = $1 LIMIT 1`, [name]);
      if (existing[0]) {
        plans.push(existing[0]);
        continue;
      }
      const { rows } = await db.query(
        `INSERT INTO plans (
           name, price, billing_period, min_quantity, available_from,
           auto_close, is_closable, is_pausable, is_renewable, created_by
         )
         VALUES ($1, $2, $3, $4, current_date - 30, FALSE, TRUE, TRUE, TRUE, $5)
         RETURNING id`,
        [name, price, period, quantity, adminId],
      );
      plans.push(rows[0]);
    }

    const { rows: portalCustomerRows } = await db.query(
      `SELECT id FROM customers WHERE lower(email) = lower('customer@brightloop.test') ORDER BY id LIMIT 1`,
    );
    if (!portalCustomerRows[0]) throw new Error('Could not create or find the demo customer profile.');
    const portalCustomer = portalCustomerRows[0];
    const fixtureCustomerIds = [portalCustomer.id];
    if (legacyDemoCustomerEmails.length) {
      const { rows: legacyCustomers } = await db.query(
        `SELECT id FROM customers WHERE lower(email) = ANY($1::text[])`,
        [legacyDemoCustomerEmails],
      );
      fixtureCustomerIds.push(...legacyCustomers.map(customer => customer.id));
    }

    const { rows: fixtureSubscriptions } = await db.query(
      `SELECT s.id
         FROM subscriptions s
         LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.customer_id = ANY($1::bigint[])
          AND (
            s.customer_id <> $2
            OR p.name = ANY($3::text[])
          )`,
      [fixtureCustomerIds, portalCustomer.id, demoPlans.map(([name]) => name)],
    );
    const fixtureSubscriptionIds = fixtureSubscriptions.map(subscription => subscription.id);
    if (fixtureSubscriptionIds.length) {
      await db.query(
        `DELETE FROM payments
          WHERE invoice_id IN (
            SELECT id FROM invoices WHERE subscription_id = ANY($1::bigint[])
          )`,
        [fixtureSubscriptionIds],
      );
      await db.query(
        `DELETE FROM discount_redemptions WHERE subscription_id = ANY($1::bigint[])`,
        [fixtureSubscriptionIds],
      );
      await db.query(
        `DELETE FROM invoices WHERE subscription_id = ANY($1::bigint[])`,
        [fixtureSubscriptionIds],
      );
      await db.query(
        `DELETE FROM subscriptions WHERE id = ANY($1::bigint[])`,
        [fixtureSubscriptionIds],
      );
    }
    if (fixtureCustomerIds.length > 1) {
      await db.query(
        `DELETE FROM customers WHERE id = ANY($1::bigint[]) AND id <> $2`,
        [fixtureCustomerIds, portalCustomer.id],
      );
    }

    await db.query(`SELECT set_config('app.user_id', $1, true)`, [String(adminId)]);
    for (let index = 0; index < plans.length; index += 1) {
      const customer = portalCustomer;
      const plan = plans[index];

      const { rows: planRows } = await db.query(
        `SELECT p.price, p.billing_period, p.min_quantity FROM plans p WHERE p.id = $1`,
        [plan.id],
      );
      const planDetails = planRows[0];
      const desiredStatus = [0, 8, 17].includes(index)
        ? 'quotation'
        : index % 4 === 0 ? 'confirmed' : 'active';
      const { rows: subscriptionRows } = await db.query(
        `INSERT INTO subscriptions (
           customer_id, plan_id, payment_term_id, status, start_date, expiry_date,
           next_invoice_date, created_by
         )
         VALUES ($1, $2, $3, 'draft', current_date - $4::int,
                 CASE $5
                   WHEN 'daily' THEN current_date + 1
                   WHEN 'weekly' THEN current_date + 7
                   WHEN 'monthly' THEN (current_date + interval '1 month')::date
                   ELSE (current_date + interval '1 year')::date
                 END,
                 CASE WHEN $6 = 'active' THEN current_date + 30 ELSE NULL END,
                 $7)
         RETURNING id`,
        [customer.id, plan.id, paymentTermId, 10 + index * 3, planDetails.billing_period, desiredStatus, adminId],
      );
      const subscriptionId = subscriptionRows[0].id;
      const progress = desiredStatus === 'quotation' ? ['quotation'] : desiredStatus === 'confirmed' ? ['quotation', 'confirmed'] : ['quotation', 'confirmed', 'active'];
      for (const status of progress) {
        await db.query(`UPDATE subscriptions SET status = $2 WHERE id = $1`, [subscriptionId, status]);
      }

      const product = products[index % products.length];
      await db.query(
        `INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [subscriptionId, product.id, planDetails.min_quantity, planDetails.price],
      );
      if (desiredStatus === 'quotation') continue;

      const amount = Number(planDetails.price) * planDetails.min_quantity;
      const monthsAgo = Math.floor(index / 3);
      const { rows: invoiceRows } = await db.query(
        `INSERT INTO invoices (
           subscription_id, customer_id, status, invoice_date, due_date, period_start, period_end,
           bill_to_name, subtotal, tax_total, total, created_by
         )
         SELECT $1, c.id, 'draft',
                current_date - ($3::int * interval '1 month') - interval '3 days',
                current_date - ($3::int * interval '1 month') + interval '12 days',
                current_date - ($3::int * interval '1 month') - interval '3 days',
                current_date - ($3::int * interval '1 month') + interval '27 days',
                c.name, $4, 0, $4, $5
           FROM customers c WHERE c.id = $2
         RETURNING id`,
        [subscriptionId, customer.id, String(monthsAgo), amount, adminId],
      );
      const invoiceId = invoiceRows[0].id;
      await db.query(
        `INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, product.id, demoPlans[index][0], planDetails.min_quantity, planDetails.price],
      );
      await db.query(
        `UPDATE invoices SET status = 'confirmed', confirmed_at = now(), sent_at = now()
          WHERE id = $1`,
        [invoiceId],
      );
      if ([1, 4, 7, 10, 13, 16].includes(index)) {
        await db.query(
          `INSERT INTO payments (invoice_id, method, amount, payment_date, reference, recorded_by)
           VALUES ($1, 'upi', $2, current_date - ($3::int * interval '1 month') - interval '1 day', $4, $5)`,
          [invoiceId, amount, String(monthsAgo), `DEMO-UPI-${String(index + 1).padStart(3, '0')}`, adminId],
        );
      } else if (index === 2) {
        await db.query(
          `INSERT INTO payments (invoice_id, method, amount, payment_date, reference, recorded_by)
           VALUES ($1, 'upi', $2, current_date - 1, 'DEMO-UPI-PARTIAL', $3)`,
          [invoiceId, Number((amount * 0.4).toFixed(2)), adminId],
        );
      }
    }

    const { rows: discounts } = await db.query(
      `SELECT id FROM discount_rules WHERE name = 'Demo welcome offer' LIMIT 1`,
    );
    if (!discounts[0]) {
      await db.query(
        `INSERT INTO discount_rules (
           name, kind, value, scope, min_purchase_amount, min_quantity, start_date,
           end_date, usage_limit, created_by
         )
         VALUES
           ('Demo welcome offer', 'percentage', 10, 'subscription', 0, 0, current_date - 30, current_date + 90, 100, $1),
           ('Demo annual saving', 'fixed', 500, 'subscription', 5000, 1, current_date - 10, current_date + 120, 50, $1)`,
        [adminId],
      );
    }
  });
  console.info('Demo accounts, catalog, subscriptions, invoices, and payments seeded for the three judge accounts. Credentials were not printed.');
} finally {
  await pool.end();
}
