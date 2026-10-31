import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { renderInvoicePdf } from './invoice-pdf.js';

let transporter;

function getTransporter() {
  if (!config.SMTP_HOST || !config.SMTP_FROM) {
    throw new Error('SMTP_HOST and SMTP_FROM are required to send email.');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.smtpSecure,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export async function sendOutboxMessage(message) {
  const { template, payload } = message;
  const subjects = {
    email_verification: 'Verify your Brightloop account',
    password_reset: 'Reset your Brightloop password',
    staff_invite: 'Your Brightloop staff account',
    invoice_sent: `Invoice from Brightloop`,
    renewal_reminder: 'Your Brightloop subscription is expiring soon',
  };
  const subject = subjects[template];
  if (!subject) throw new Error(`Unsupported email template: ${template}`);
  const action = template === 'email_verification' ? 'verify your email'
    : template === 'invoice_sent' ? `view invoice ${payload.invoice_number}`
      : template === 'renewal_reminder' ? `review subscription ${payload.subscription_number}, which expires on ${payload.expiry_date}`
      : 'reset your password';
  const url = template === 'invoice_sent'
    ? `${config.APP_BASE_URL}/invoices/${payload.invoice_id}`
    : template === 'renewal_reminder'
      ? `${config.APP_BASE_URL}/subscriptions/${payload.subscription_id}`
      : payload.url;
  const attachments = [];
  if (template === 'invoice_sent') {
    const header = await pool.query(
      `SELECT number, status, invoice_date, due_date, bill_to_name, bill_to_address,
              subtotal, discount_total, tax_total, total
         FROM invoices WHERE id=$1`,
      [payload.invoice_id],
    );
    if (!header.rowCount) throw new Error('Invoice for email was not found.');
    const lines = await pool.query(
      `SELECT description, quantity, unit_price, discount_amount, tax_amount, line_total
         FROM invoice_lines WHERE invoice_id=$1 ORDER BY id`,
      [payload.invoice_id],
    );
    attachments.push({
      filename: `${header.rows[0].number}.pdf`,
      content: await renderInvoicePdf({ ...header.rows[0], lines: lines.rows }),
      contentType: 'application/pdf',
    });
  }
  await getTransporter().sendMail({
    from: config.SMTP_FROM,
    to: message.to_email,
    subject,
    text: `Hello${payload.full_name ? ` ${payload.full_name}` : ''},\n\nUse this link to ${action}:\n${url}\n\nIf you did not request this, you can ignore this email.`,
    attachments,
  });
}
