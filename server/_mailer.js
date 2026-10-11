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
  const config = readSmtpConfig();
  if (!config || !config.auth.pass || config.auth.pass.startsWith('your-') || config.auth.pass.startsWith('YOUR_')) {
    console.log(`\n======================================================`);
    console.log(`[SMTP DEV MODE] Registration OTP for ${email}: ${otp}`);
    console.log(`(Real emails require a valid 16-character Google App Password in .env)`);
    console.log(`======================================================\n`);
    return;
  }

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
  const config = readSmtpConfig();
  if (!config || !config.auth.pass || config.auth.pass.startsWith('your-') || config.auth.pass.startsWith('YOUR_')) {
    console.log(`\n======================================================`);
    console.log(`[SMTP DEV MODE] Confirmation email simulated for: ${participant?.email}`);
    console.log(`======================================================\n`);
    return;
  }

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

  const config = readSmtpConfig();
  if (!config || !config.auth.pass || config.auth.pass.startsWith('your-') || config.auth.pass.startsWith('YOUR_')) {
    console.log(`\n======================================================`);
    console.log(`[SMTP DEV MODE] Email simulated for: ${to} | Subject: ${subject}`);
    console.log(`======================================================\n`);
    return;
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

export async function sendLoginApprovalNotification({ adminEmail, ip, userAgent, requestedAt, requestId, superAdminEmails }) {
  const recipients = Array.from(superAdminEmails || []);
  if (recipients.length === 0) return;

  const config = readSmtpConfig();
  if (!config || !config.auth.pass || config.auth.pass.startsWith('your-') || config.auth.pass.startsWith('YOUR_')) {
    console.log(`\n======================================================`);
    console.log(`[SMTP DEV MODE] Login Approval Notification for Super Admins:`);
    console.log(`Admin Email: ${adminEmail}`);
    console.log(`IP: ${ip} | User-Agent: ${userAgent}`);
    console.log(`Request ID: ${requestId} | Time: ${requestedAt}`);
    console.log(`Recipients: ${recipients.join(', ')}`);
    console.log(`======================================================\n`);
    return;
  }

  const { transport, from } = getTransport();
  const subject = `[Ignite 2.O] Admin Login Approval Required: ${adminEmail}`;
  const html = `
    <div style="font-family: sans-serif; background: #111411; color: #ffffff; padding: 24px; border-radius: 12px;">
      <h2 style="color: #60a5fa; margin-top: 0;">Ignite 2.O — Admin Login Approval Request</h2>
      <p style="color: #e5e7eb; font-size: 15px;">An admin has attempted to log in and is waiting for your authorization:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #191e1b; border-radius: 8px; overflow: hidden;">
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #303a32; color: #9ca3af;">Admin Email:</td><td style="padding: 10px 14px; border-bottom: 1px solid #303a32; color: #ffffff; font-weight: bold;">${adminEmail}</td></tr>
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #303a32; color: #9ca3af;">IP Address:</td><td style="padding: 10px 14px; border-bottom: 1px solid #303a32; color: #ffffff;">${ip || 'Unknown'}</td></tr>
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #303a32; color: #9ca3af;">Time:</td><td style="padding: 10px 14px; border-bottom: 1px solid #303a32; color: #ffffff;">${requestedAt}</td></tr>
        <tr><td style="padding: 10px 14px; color: #9ca3af;">Request ID:</td><td style="padding: 10px 14px; color: #a3e635; font-family: monospace;">${requestId}</td></tr>
      </table>
      <p style="color: #d1d5db; font-size: 14px;">Please open the <strong>Ignite 2.O Super Admin Control Center</strong> to approve or reject this session.</p>
    </div>
  `;

  for (const recipient of recipients) {
    try {
      await transport.sendMail({
        from,
        to: recipient,
        subject,
        html,
        text: `Admin Login Approval Request:\nEmail: ${adminEmail}\nIP: ${ip}\nTime: ${requestedAt}\nRequest ID: ${requestId}\nApprove via Super Admin Control Center.`,
      });
    } catch (e) {
      console.error(`Failed to send approval email to ${recipient}:`, e?.message);
    }
  }
}
