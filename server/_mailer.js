import nodemailer from 'nodemailer';
import {
  announcementTemplate,
  infoTemplate,
  messageTemplate,
  notificationTemplate,
  otpTemplate,
  registrationConfirmationTemplate,
  renderThemedEmail,
} from './_email-templates.js';

function readSmtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const from = (process.env.SMTP_FROM || user || '').trim();

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from,
  };
}

let cachedTransport = null;
let cachedFrom = null;

function getTransport() {
  if (cachedTransport && cachedFrom) {
    return { transport: cachedTransport, from: cachedFrom };
  }

  const config = readSmtpConfig();
  if (!config) {
    throw new Error('SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.');
  }

  cachedFrom = config.from;
  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  return { transport: cachedTransport, from: cachedFrom };
}

export async function sendOtpEmail(email, otp) {
  const { transport, from } = getTransport();
  const content = otpTemplate({ otp });

  await transport.sendMail({
    from,
    to: email,
    subject: 'Ignite 2.O Registration OTP Verification',
    text: content.text,
    html: content.html,
  });
}

export async function sendRegistrationConfirmationEmail(participant) {
  const { transport, from } = getTransport();
  const content = registrationConfirmationTemplate(participant);

  await transport.sendMail({
    from,
    to: participant.email,
    subject: 'Ignite 2.O Registration Confirmed',
    text: content.text,
    html: content.html,
  });
}

export async function sendTemplatedEmail({ to, subject, template = 'notification', payload = {} }) {
  if (!to || !subject) {
    throw new Error('to and subject are required');
  }

  const { transport, from } = getTransport();

  let content;
  if (template === 'announcement') content = announcementTemplate(payload);
  else if (template === 'info') content = infoTemplate(payload);
  else if (template === 'message') content = messageTemplate(payload);
  else if (template === 'notification') content = notificationTemplate(payload);
  else content = renderThemedEmail({ type: template, ...payload });

  await transport.sendMail({
    from,
    to,
    subject,
    text: content.text,
    html: content.html,
  });
}
