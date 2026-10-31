import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter;

function getSmtpTransporter() {
  if (!config.SMTP_HOST || !config.SMTP_FROM) {
    throw new Error('Configure BREVO_API_KEY and BREVO_SENDER_EMAIL, or SMTP_HOST and SMTP_FROM.');
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

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function emailContent(template, payload) {
  const greeting = `Hello${payload.full_name ? ` ${payload.full_name}` : ''},`;
  if (template === 'invoice_created') {
    const text = `${greeting}\n\nYour subscription request for ${payload.plan_name} is confirmed.\nInvoice: ${payload.invoice_number}\nAmount due: INR ${payload.amount}\nDue date: ${payload.due_date}\n\n${payload.payment_instructions}\n\nView your Brightloop account: ${payload.url}`;
    return {
      subject: `Your Brightloop invoice ${payload.invoice_number}`,
      text,
      html: `<p>${escapeHtml(greeting)}</p><p>Your subscription request for <b>${escapeHtml(payload.plan_name)}</b> is confirmed.</p><p>Invoice: <b>${escapeHtml(payload.invoice_number)}</b><br>Amount due: INR ${escapeHtml(payload.amount)}<br>Due date: ${escapeHtml(payload.due_date)}</p><p>${escapeHtml(payload.payment_instructions)}</p><p><a href="${escapeHtml(payload.url)}">View your Brightloop account</a></p>`,
    };
  }

  if (template === 'invoice_reminder') {
    const text = `${greeting}\n\nInvoice ${payload.invoice_number} for ${payload.plan_name} has an outstanding balance of INR ${payload.amount}, due ${payload.due_date}.\n\nView your Brightloop account: ${payload.url}`;
    return {
      subject: `Payment reminder: Brightloop invoice ${payload.invoice_number}`,
      text,
      html: `<p>${escapeHtml(greeting)}</p><p>Invoice <b>${escapeHtml(payload.invoice_number)}</b> for ${escapeHtml(payload.plan_name)} has an outstanding balance of INR ${escapeHtml(payload.amount)}, due ${escapeHtml(payload.due_date)}.</p><p><a href="${escapeHtml(payload.url)}">View your Brightloop account</a></p>`,
    };
  }

  if (template === 'payment_receipt') {
    const text = `${greeting}\n\nWe received INR ${payload.payment_amount} for invoice ${payload.invoice_number} on ${payload.payment_date} via ${payload.payment_method}. Remaining balance: INR ${payload.balance}.\n\nView your Brightloop account: ${payload.url}`;
    return {
      subject: `Payment receipt for Brightloop invoice ${payload.invoice_number}`,
      text,
      html: `<p>${escapeHtml(greeting)}</p><p>We received INR ${escapeHtml(payload.payment_amount)} for invoice <b>${escapeHtml(payload.invoice_number)}</b> on ${escapeHtml(payload.payment_date)} via ${escapeHtml(payload.payment_method)}.</p><p>Remaining balance: INR ${escapeHtml(payload.balance)}.</p><p><a href="${escapeHtml(payload.url)}">View your Brightloop account</a></p>`,
    };
  }

  if (template === 'renewal_reminder') {
    const text = `${greeting}\n\nYour Brightloop subscription ${payload.subscription_number} for ${payload.plan_name} expires on ${payload.expiry_date}. You can renew from your account.\n\nView your Brightloop account: ${payload.url}`;
    return {
      subject: `Renewal reminder: ${payload.subscription_number}`,
      text,
      html: `<p>${escapeHtml(greeting)}</p><p>Your Brightloop subscription <b>${escapeHtml(payload.subscription_number)}</b> for ${escapeHtml(payload.plan_name)} expires on ${escapeHtml(payload.expiry_date)}. You can renew from your account.</p><p><a href="${escapeHtml(payload.url)}">View your Brightloop account</a></p>`,
    };
  }

  const templates = {
    email_verification: ['Verify your Brightloop account', 'verify your email'],
    password_reset: ['Reset your Brightloop password', 'reset your password'],
    staff_invite: ['Your Brightloop staff account', 'set your password and activate your staff account'],
  };
  const entry = templates[template];
  if (!entry) throw new Error(`Unsupported email template: ${template}`);
  const [subject, action] = entry;
  const text = `${greeting}\n\nUse this link to ${action}:\n${payload.url}\n\nIf you did not request this, you can ignore this email.`;
  return {
    subject,
    text,
    html: `<p>${escapeHtml(greeting)}</p><p>Use the link below to ${escapeHtml(action)}:</p><p><a href="${escapeHtml(payload.url)}">${escapeHtml(payload.url)}</a></p><p>If you did not request this, you can ignore this email.</p>`,
  };
}

async function sendWithBrevo(message, content) {
  if (!config.BREVO_API_KEY || !config.BREVO_SENDER_EMAIL) {
    throw new Error('BREVO_API_KEY and BREVO_SENDER_EMAIL are required to send email with Brevo.');
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': config.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: config.BREVO_SENDER_NAME, email: config.BREVO_SENDER_EMAIL },
      to: [{ email: message.to_email }],
      subject: content.subject,
      textContent: content.text,
      htmlContent: content.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Brevo transactional email request failed with HTTP ${response.status}.`);
  }
}

export async function sendOutboxMessage(message) {
  const content = emailContent(message.template, message.payload);
  if (config.BREVO_API_KEY || config.BREVO_SENDER_EMAIL) {
    await sendWithBrevo(message, content);
    return;
  }
  await getSmtpTransporter().sendMail({
    from: config.SMTP_FROM,
    to: message.to_email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}
