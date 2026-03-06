const nodemailer = require('nodemailer');

/**
 * Create a reusable SMTP transporter from environment variables.
 * Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * Optional: SMTP_SECURE (default: false, uses STARTTLS on port 587)
 */
function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10) || 587,
    secure: SMTP_SECURE === 'true', // true = SSL on 465, false = STARTTLS on 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
}

/**
 * Send an email.
 * @param {Object} opts - { to, subject, text, html }
 * @returns {Promise<Object>} nodemailer info object
 * @throws {Error} if SMTP is not configured or sending fails
 */
async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    throw new Error('SMTP non configuré. Vérifiez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const info = await t.sendMail({
    from,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });

  return info;
}

/**
 * Verify SMTP connection (useful for health checks).
 * @returns {Promise<boolean>}
 */
async function verifyConnection() {
  const t = getTransporter();
  if (!t) {
    throw new Error('SMTP non configuré. Vérifiez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env');
  }
  await t.verify();
  return true;
}

module.exports = { sendEmail, verifyConnection };
