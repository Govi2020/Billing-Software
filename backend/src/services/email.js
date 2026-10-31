import nodemailer from 'nodemailer';
import { config } from '../config.js';

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
  };
  const subject = subjects[template];
  if (!subject) throw new Error(`Unsupported email template: ${template}`);
  const action = template === 'email_verification' ? 'verify your email' : 'reset your password';
  await getTransporter().sendMail({
    from: config.SMTP_FROM,
    to: message.to_email,
    subject,
    text: `Hello${payload.full_name ? ` ${payload.full_name}` : ''},\n\nUse this link to ${action}:\n${payload.url}\n\nIf you did not request this, you can ignore this email.`,
  });
}
