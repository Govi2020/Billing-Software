import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

export async function createPlan(userId, plan) {
  const { rows } = await pool.query(
    `INSERT INTO plans (
       name, price, billing_period, min_quantity, available_from, available_to,
       auto_close, is_closable, is_pausable, is_renewable, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, name, price, billing_period, min_quantity, available_from, available_to,
               auto_close, is_closable, is_pausable, is_renewable, is_active`,
    [
      plan.name,
      plan.price,
      plan.billing_period,
      plan.min_quantity,
      plan.available_from,
      plan.available_to,
      plan.auto_close,
      plan.is_closable,
      plan.is_pausable,
      plan.is_renewable,
      userId,
    ],
  );
  return rows[0];
}

export async function updatePlan(userId, planId, plan) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE plans
        SET name = $2, price = $3, billing_period = $4, min_quantity = $5,
            available_from = $6, available_to = $7, auto_close = $8,
            is_closable = $9, is_pausable = $10, is_renewable = $11, updated_at = now()
      WHERE id = $1
      RETURNING id, name, price, billing_period, min_quantity, available_from, available_to,
                auto_close, is_closable, is_pausable, is_renewable, is_active`,
      [
        planId, plan.name, plan.price, plan.billing_period, plan.min_quantity,
        plan.available_from, plan.available_to, plan.auto_close, plan.is_closable,
        plan.is_pausable, plan.is_renewable,
      ],
    );
    if (!rows[0]) throw new AppError(404, 'PLAN_NOT_FOUND', 'The plan does not exist.');
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'plan.update', 'plan', $2, $3::jsonb)`,
      [userId, planId, JSON.stringify({ name: rows[0].name })],
    );
    return rows[0];
  });
}

export async function deactivatePlan(userId, planId) {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `UPDATE plans SET is_active = FALSE, updated_at = now()
        WHERE id = $1 AND is_active
        RETURNING id`,
      [planId],
    );
    if (!rows[0]) throw new AppError(404, 'PLAN_NOT_FOUND', 'The active plan does not exist.');
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'plan.deactivate', 'plan', $2, '{}'::jsonb)`,
      [userId, planId],
    );
    return rows[0];
  });
}
