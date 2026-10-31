import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
const settingsSchema = z.object({
  auto_confirm_invoices: z.boolean().optional(),
  pause_policy: z.enum(['shift', 'skip']).optional(),
  company_name: z.string().trim().min(1).max(160).optional(),
  invoice_footer: z.string().trim().max(2000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one setting is required.');

router.use(requireAuth, requireRole('admin'));

router.get('/health', async (_req, res) => {
  const checks = await Promise.all([
    pool.query('SELECT 1').then(() => ({ status: 'ok' })).catch(error => ({ status: 'error', code: error.code ?? error.name })),
    redis.ping().then(() => ({ status: 'ok' })).catch(error => ({ status: 'error', code: error.code ?? error.name })),
  ]);
  const [database, redisStatus] = checks;
  const status = database.status === 'ok' && redisStatus.status === 'ok' ? 'healthy' : 'degraded';
  res.status(status === 'healthy' ? 200 : 503).json({
    data: { status, checked_at: new Date().toISOString(), dependencies: { database, redis: redisStatus } },
  });
});

router.get('/audit-log', validate({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).strict(),
}), async (req, res) => {
  const { page, limit } = req.validated.query;
  const { rows } = await pool.query(
    `SELECT a.id, a.actor_id, u.full_name AS actor, a.action, a.entity_type,
            a.entity_id, a.details, a.created_at
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit],
  );
  const { rows: count } = await pool.query(`SELECT count(*)::int AS total FROM audit_log`);
  res.json({ data: rows, meta: { page, limit, total: count[0].total } });
});

router.get('/settings', async (_req, res) => {
  const { rows } = await pool.query(`SELECT key, value, updated_at FROM workspace_settings ORDER BY key`);
  res.json({ data: Object.fromEntries(rows.map(row => [row.key, row.value])) });
});

router.patch('/settings', validate({ body: settingsSchema }), async (req, res) => {
  const entries = Object.entries(req.validated.body);
  const result = await withTransaction(async db => {
    for (const [key, value] of entries) {
      await db.query(
        `INSERT INTO workspace_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), req.auth.userId],
      );
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, details)
       VALUES ($1, 'workspace.settings.update', 'workspace', $2::jsonb)`,
      [req.auth.userId, JSON.stringify({ keys: entries.map(([key]) => key) })],
    );
    const { rows } = await db.query(`SELECT key, value FROM workspace_settings ORDER BY key`);
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
  });
  res.json({ data: result });
});

export default router;
