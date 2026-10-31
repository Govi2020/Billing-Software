import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { pool } from '../../db/pool.js';
import { runBilling } from './service.js';

const router = Router();

router.post('/runs', requireAuth, requireRole('admin'), validate({
  body: z.object({ as_of_date: z.iso.date().optional() }).strict(),
}), async (req, res) => {
  const result = await runBilling({
    asOfDate: req.validated.body.as_of_date,
    runType: 'manual',
    requestedBy: req.auth.userId,
  });
  res.status(201).json({ data: result });
});

router.get('/runs', requireAuth, requireRole('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, run_date, started_at, finished_at, due_count, invoiced_count,
            failed_count, status, run_type, errors
       FROM billing_runs
      ORDER BY started_at DESC, id DESC
      LIMIT 100`,
  );
  res.json({ data: rows });
});

router.get('/reconciliation', requireAuth, requireRole('admin'), async (_req, res) => {
  const [invoiceTotals, paymentTotals, dueSubscriptions] = await Promise.all([
    pool.query(
      `SELECT i.id, i.number, i.total,
              COALESCE(sum(il.line_total), 0) AS lines_total
         FROM invoices i LEFT JOIN invoice_lines il ON il.invoice_id = i.id
        WHERE i.status <> 'cancelled'
        GROUP BY i.id
       HAVING abs(i.total - COALESCE(sum(il.line_total), 0)) > 0.01
        ORDER BY i.id DESC LIMIT 100`,
    ),
    pool.query(
      `SELECT i.id, i.number, i.amount_paid, COALESCE(sum(p.amount), 0) AS payments_total
         FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id
        GROUP BY i.id
       HAVING abs(i.amount_paid - COALESCE(sum(p.amount), 0)) > 0.01
        ORDER BY i.id DESC LIMIT 100`,
    ),
    pool.query(
      `SELECT s.id, s.number, s.next_invoice_date::text AS expected_date,
              c.name AS customer, p.name AS plan
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'active' AND s.next_invoice_date <= current_date
          AND (NOT p.auto_close OR s.next_invoice_date <= s.expiry_date)
          AND NOT EXISTS (
            SELECT 1 FROM invoices i WHERE i.subscription_id = s.id
              AND i.period_start = s.next_invoice_date AND i.status <> 'cancelled'
          )
        ORDER BY s.next_invoice_date, s.id LIMIT 100`,
    ),
  ]);
  res.json({
    data: {
      invoiceTotals: invoiceTotals.rows,
      paymentTotals: paymentTotals.rows,
      dueSubscriptions: dueSubscriptions.rows,
    },
  });
});

export default router;
