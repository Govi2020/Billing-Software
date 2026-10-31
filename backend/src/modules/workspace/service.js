import { pool } from '../../db/pool.js';
import { config } from '../../config.js';

const scopedFilter = `($2 <> 'customer' OR c.user_id = $1)`;

export async function getWorkspace(userId, role) {
  const params = [userId, role];
  const [
    customers,
    subscriptions,
    invoices,
    payments,
    products,
    plans,
    taxes,
    discounts,
    staff,
    summary,
    monthlyRevenue,
    billingRuns,
  ] = await Promise.all([
    pool.query(
      `SELECT c.id, c.name, COALESCE(c.company_name, '') AS company, c.email, c.phone,
              c.address_line1, c.address_line2, c.city, c.state, c.postal_code, c.country,
              (SELECT count(*)::int FROM subscriptions s WHERE s.customer_id = c.id) AS subscriptions,
              (SELECT COALESCE(sum(i.total - i.amount_paid), 0)
                 FROM invoices i
                WHERE i.customer_id = c.id AND i.status = 'confirmed') AS balance
         FROM customers c
        WHERE $2 <> 'customer' OR c.user_id = $1
        ORDER BY c.name`,
      params,
    ),
    pool.query(
      `SELECT s.id AS record_id, s.number AS id, c.name AS customer, p.name AS plan,
              p.is_pausable, p.is_closable,
              initcap(replace(s.status::text, '_', ' ')) AS status,
              COALESCE(sum(sl.line_subtotal), p.price * p.min_quantity) AS amount,
              COALESCE(to_char(s.next_invoice_date, 'DD Mon YYYY'), '—') AS date
         FROM subscriptions s
         JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
         LEFT JOIN subscription_lines sl ON sl.subscription_id = s.id
        WHERE ${scopedFilter}
        GROUP BY s.id, c.name, p.name, p.price, p.min_quantity, p.is_pausable, p.is_closable
        ORDER BY s.created_at DESC`,
      params,
    ),
    pool.query(
      `SELECT i.id AS record_id, i.number AS id, c.name AS customer,
              to_char(i.invoice_date, 'DD Mon YYYY') AS date,
              to_char(i.due_date, 'DD Mon YYYY') AS due,
              i.total AS amount,
              initcap(replace(i.status::text, '_', ' ')) AS status,
              (i.status = 'confirmed' AND i.due_date < current_date) AS is_overdue,
              CASE WHEN i.status = 'confirmed' AND i.due_date < current_date
                   THEN current_date - i.due_date ELSE 0 END AS days_overdue,
              i.total - i.amount_paid AS amount_due
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
        WHERE ${scopedFilter}
        ORDER BY i.invoice_date DESC, i.id DESC`,
      params,
    ),
    pool.query(
      `SELECT 'PAY-' || lpad(pay.id::text, 6, '0') AS id, i.number AS invoice,
              c.name AS customer, to_char(pay.payment_date, 'DD Mon YYYY') AS date,
              initcap(replace(pay.method::text, '_', ' ')) AS method,
              pay.amount
         FROM payments pay
         JOIN invoices i ON i.id = pay.invoice_id
         JOIN customers c ON c.id = i.customer_id
        WHERE ${scopedFilter}
        ORDER BY pay.payment_date DESC, pay.id DESC`,
      params,
    ),
    pool.query(
      `SELECT p.id, p.name, initcap(replace(p.type::text, '_', ' ')) AS type,
              p.sales_price AS price,
              CASE WHEN $1 = 'admin' THEN p.cost_price ELSE NULL END AS cost,
              COALESCE((
                SELECT string_agg(
                         v.attribute || ': ' || v.value
                           || CASE WHEN v.extra_price > 0 THEN ' (+' || v.extra_price || ')' ELSE '' END,
                         ', ' ORDER BY v.id
                       )
                  FROM product_variants v
                 WHERE v.product_id = p.id AND v.is_active
              ), 'No variants') AS variant,
              CASE WHEN p.is_active THEN 'Active' ELSE 'Inactive' END AS status
         FROM products p
        WHERE $1 <> 'customer'
        ORDER BY p.name`,
      [role],
    ),
    pool.query(
      `SELECT id, name, price, initcap(replace(billing_period::text, '_', ' ')) AS period,
              min_quantity, to_char(available_from, 'DD Mon YYYY') AS available_from,
              to_char(available_to, 'DD Mon YYYY') AS available_to,
              CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END AS status
         FROM plans
        WHERE $1 <> 'customer'
           OR (is_active AND available_from <= current_date
               AND (available_to IS NULL OR available_to >= current_date))
        ORDER BY name`,
      [role],
    ),
    pool.query(
      `SELECT id, name, initcap(kind::text) AS kind, rate,
              CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END AS status
         FROM taxes
        WHERE $1 <> 'customer'
        ORDER BY name`,
      [role],
    ),
    pool.query(
      `SELECT d.id, d.name, initcap(d.kind::text) AS kind, d.value,
              CASE WHEN d.scope = 'product' THEN COALESCE((
                SELECT string_agg(p.name, ', ' ORDER BY p.name)
                  FROM discount_products dp
                  JOIN products p ON p.id = dp.product_id
                 WHERE dp.discount_id = d.id
              ), 'Products') ELSE 'Subscription' END AS scope,
              to_char(d.start_date, 'DD Mon YYYY') AS start_date,
              to_char(d.end_date, 'DD Mon YYYY') AS end_date,
              d.times_used, d.usage_limit,
              CASE
                WHEN NOT d.is_active OR (d.end_date IS NOT NULL AND d.end_date < current_date) THEN 'Expired'
                WHEN d.start_date > current_date THEN 'Scheduled'
                WHEN d.usage_limit IS NOT NULL AND d.times_used >= d.usage_limit THEN 'Exhausted'
                ELSE 'Active'
              END AS status
         FROM discount_rules d
        WHERE $1 <> 'customer'
        ORDER BY d.created_at DESC`,
      [role],
    ),
    pool.query(
      `SELECT id, full_name AS name, email, initcap(role::text) AS role,
              last_login_at, CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END AS status
         FROM users
        WHERE role IN ('admin', 'staff') AND $1 = 'admin'
        ORDER BY full_name`,
      [role],
    ),
    pool.query(
      `SELECT
         (SELECT count(*)::int
            FROM subscriptions s JOIN customers c ON c.id = s.customer_id
           WHERE s.status = 'active' AND ${scopedFilter}) AS active_subscriptions,
         (SELECT COALESCE(sum(mrr.mrr), 0)
            FROM v_subscription_mrr mrr JOIN customers c ON c.id = mrr.customer_id
           WHERE ${scopedFilter}) AS mrr,
         (SELECT COALESCE(sum(pay.amount), 0)
            FROM payments pay JOIN invoices i ON i.id = pay.invoice_id
            JOIN customers c ON c.id = i.customer_id
           WHERE ${scopedFilter}
             AND pay.payment_date >= date_trunc('month', current_date)::date
             AND pay.payment_date < (date_trunc('month', current_date) + interval '1 month')::date) AS revenue_this_month,
         (SELECT COALESCE(sum(i.total - i.amount_paid), 0)
            FROM invoices i JOIN customers c ON c.id = i.customer_id
           WHERE i.status = 'confirmed' AND ${scopedFilter}) AS outstanding_amount,
         (SELECT count(*)::int
            FROM v_overdue_invoices overdue JOIN customers c ON c.id = overdue.customer_id
           WHERE ${scopedFilter}) AS overdue_invoices,
         (SELECT COALESCE(sum(overdue.amount_due), 0)
            FROM v_overdue_invoices overdue JOIN customers c ON c.id = overdue.customer_id
           WHERE ${scopedFilter}) AS overdue_amount`,
      params,
    ),
    pool.query(
      `SELECT to_char(months.month, 'Mon') AS month,
              COALESCE(revenue.collected, 0) AS amount
         FROM generate_series(
                date_trunc('month', current_date) - interval '5 months',
                date_trunc('month', current_date),
                interval '1 month'
              ) AS months(month)
         LEFT JOIN (
           SELECT date_trunc('month', pay.payment_date) AS month, sum(pay.amount) AS collected
             FROM payments pay
             JOIN invoices i ON i.id = pay.invoice_id
             JOIN customers c ON c.id = i.customer_id
            WHERE ${scopedFilter}
            GROUP BY 1
         ) revenue ON revenue.month = months.month
        ORDER BY months.month`,
      params,
    ),
    pool.query(
      `SELECT run_date, started_at, finished_at, due_count, invoiced_count, failed_count
         FROM billing_runs
        WHERE $1 = 'admin'
        ORDER BY started_at DESC
        LIMIT 1`,
      [role],
    ),
  ]);

  return {
    customers: customers.rows,
    subscriptions: subscriptions.rows,
    invoices: invoices.rows,
    payments: payments.rows,
    products: products.rows,
    plans: plans.rows,
    taxes: taxes.rows,
    discounts: discounts.rows,
    staff: staff.rows,
    summary: summary.rows[0],
    monthlyRevenue: monthlyRevenue.rows,
    latestBillingRun: billingRuns.rows[0] ?? null,
    paymentInstructions: {
      upiId: config.PAYMENT_UPI_ID ?? null,
      payeeName: config.PAYMENT_PAYEE_NAME || 'Brightloop Software',
    },
  };
}
