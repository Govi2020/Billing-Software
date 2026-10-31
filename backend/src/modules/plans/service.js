import { pool } from '../../db/pool.js';

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
