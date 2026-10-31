import { withTransaction } from '../db/pool.js';
import { sendOutboxMessage } from '../services/email.js';

let draining = false;

export async function drainEmailOutbox(logger) {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const result = await withTransaction(async client => {
        const { rows } = await client.query(
          `SELECT id, to_email, template, payload
             FROM email_outbox WHERE status = 'pending'
             ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        );
        const message = rows[0];
        if (!message) return 'empty';
        await client.query(`UPDATE email_outbox SET attempts = attempts + 1 WHERE id = $1`, [message.id]);
        try {
          // Keep the row lock while sending so another worker cannot send it concurrently.
          await sendOutboxMessage(message);
          await client.query(
            `UPDATE email_outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1`,
            [message.id],
          );
          return 'sent';
        } catch (error) {
          logger.error({ errorCode: error.code ?? error.name, outboxId: message.id }, 'Email delivery failed');
          await client.query(
            `UPDATE email_outbox
                SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
                    last_error = $2
              WHERE id = $1`,
            [message.id, String(error.message).slice(0, 1000)],
          );
          return 'failed';
        }
      });
      if (result !== 'sent') break;
    }
  } finally {
    draining = false;
  }
}
