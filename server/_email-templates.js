const BRAND = 'Ignite 2.O';
const CAMPUS = 'Engineering Department, Institute of Engineering and Technology';
const UNIVERSITY = 'Deen Dayal Upadhyaya Gorakhpur University, Gorakhpur';

const toneMap = {
  info: { accent: '#3b82f6', soft: 'rgba(59,130,246,0.12)', badge: 'Information' },
  announcement: { accent: '#a3b46a', soft: 'rgba(163,180,106,0.14)', badge: 'Announcement' },
  message: { accent: '#718044', soft: 'rgba(113,128,68,0.14)', badge: 'Message' },
  notification: { accent: '#3b82f6', soft: 'rgba(59,130,246,0.14)', badge: 'Notification' },
  warning: { accent: '#f59e0b', soft: 'rgba(245,158,11,0.16)', badge: 'Important' },
  success: { accent: '#22c55e', soft: 'rgba(34,197,94,0.14)', badge: 'Confirmed' },
  otp: { accent: '#3b82f6', soft: 'rgba(59,130,246,0.16)', badge: 'OTP Verification' },
  confirmation: { accent: '#22c55e', soft: 'rgba(34,197,94,0.16)', badge: 'Registration Confirmed' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function renderHighlights(highlights) {
  if (!Array.isArray(highlights) || highlights.length === 0) return '';
  const items = highlights
    .map((item) => `<li style="margin:0 0 8px 0; color:#d2d8ee; font-size:14px; line-height:1.5;">${escapeHtml(item)}</li>`)
    .join('');
  return `<ul style="margin:14px 0 2px 16px; padding:0;">${items}</ul>`;
}

function renderMetaRows(meta) {
  if (!Array.isArray(meta) || meta.length === 0) return '';
  const rows = meta
    .map((row) => {
      const label = escapeHtml(row?.label || '');
      const value = escapeHtml(row?.value || '');
      return (
        `<tr>` +
        `<td style="padding:8px 0; color:#9ca8cb; font-size:13px; vertical-align:top;">${label}</td>` +
        `<td style="padding:8px 0; color:#ffffff; font-size:14px; font-weight:600; vertical-align:top; text-align:right;">${value}</td>` +
        `</tr>`
      );
    })
    .join('');

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px; border-top:1px solid rgba(255,255,255,0.12);">` +
    rows +
    `</table>`
  );
}

export function renderThemedEmail({
  type = 'notification',
  preheader = `${BRAND} Update`,
  heading = `${BRAND} Update`,
  subheading = '',
  message = '',
  highlights = [],
  meta = [],
  cta,
  footerNote = 'This is an official communication from Ignite 2.O. Please do not reply directly to this automated email.',
  badge,
}) {
  const tone = toneMap[type] || toneMap.notification;
  const safeHeading = escapeHtml(heading);
  const safeSubheading = escapeHtml(subheading);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const safeBadge = escapeHtml(badge || tone.badge);
  const safePreheader = escapeHtml(preheader);
  const safeFooter = escapeHtml(footerNote);

  const ctaHtml = cta?.url && cta?.label
    ? `<a href="${escapeHtml(cta.url)}" style="display:inline-block; margin-top:18px; padding:11px 18px; border-radius:12px; background:${tone.accent}; color:#050510; text-decoration:none; font-weight:700; font-size:14px;">${escapeHtml(cta.label)}</a>`
    : '';

  const html =
    `<!doctype html>` +
    `<html>` +
    `<head>` +
    `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>${safePreheader}</title>` +
    `</head>` +
    `<body style="margin:0; padding:0; background:#050510; color:#ffffff; font-family:Rajdhani, 'Segoe UI', Tahoma, Arial, sans-serif;">` +
    `<div style="display:none; max-height:0px; max-width:0px; font-size:1px; line-height:1px; color:#ffffff; overflow:hidden; mso-hide:all;">${safePreheader}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#050510; padding:24px 10px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px; border:1px solid rgba(255,255,255,0.14); border-radius:20px; overflow:hidden; background:#0d0d1f;">` +
    `<tr><td style="padding:0; background:linear-gradient(135deg, ${tone.soft}, rgba(113,128,68,0.09));">` +
    `<div style="padding:26px 24px 20px 24px;">` +
    `<p style="margin:0 0 12px 0;"><span style="display:inline-block; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${tone.accent}; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.16); padding:6px 10px; border-radius:999px;">${safeBadge}</span></p>` +
    `<h1 style="margin:0; font-size:32px; line-height:1.15; color:#ffffff;">${safeHeading}</h1>` +
    (safeSubheading ? `<p style="margin:8px 0 0 0; font-size:15px; color:#b5bfdc; line-height:1.5;">${safeSubheading}</p>` : '') +
    `</div>` +
    `</td></tr>` +
    `<tr><td style="padding:22px 24px 16px 24px;">` +
    `<p style="margin:0; color:#e7ecff; font-size:15px; line-height:1.7;">${safeMessage}</p>` +
    renderHighlights(highlights) +
    ctaHtml +
    renderMetaRows(meta) +
    `</td></tr>` +
    `<tr><td style="padding:14px 24px 24px 24px; border-top:1px solid rgba(255,255,255,0.09);">` +
    `<p style="margin:0; color:#8f9abb; font-size:12px; line-height:1.6;">${safeFooter}</p>` +
    `<p style="margin:8px 0 0 0; color:#6e7aa1; font-size:11px; line-height:1.5;">${BRAND} | ${CAMPUS}<br />${UNIVERSITY}</p>` +
    `</td></tr>` +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`;

  return {
    html,
    text: stripTags(
      `${preheader}\n\n${heading}\n${subheading}\n\n${message}\n\n` +
      `${Array.isArray(highlights) ? highlights.join('\n') : ''}\n\n` +
      `${Array.isArray(meta) ? meta.map((row) => `${row?.label}: ${row?.value}`).join('\n') : ''}\n\n` +
      `${safeFooter}\n${BRAND} | ${CAMPUS}\n${UNIVERSITY}`
    ),
  };
}

export function otpTemplate({ otp }) {
  const safeOtp = escapeHtml(otp);
  const html =
    `<!doctype html>` +
    `<html>` +
    `<head>` +
    `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<title>Ignite 2.O — Email Verification Code</title>` +
    `</head>` +
    `<body style="margin:0; padding:0; background:#0b0f19; color:#e2e8f0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">` +
    `<div style="display:none; max-height:0px; max-width:0px; font-size:1px; line-height:1px; color:#ffffff; overflow:hidden; mso-hide:all;">Your verification code is ${safeOtp}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0f19; padding:32px 12px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:540px; border:1px solid #1e293b; border-radius:16px; overflow:hidden; background:#0f172a; box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);">` +
    `<tr><td style="padding:28px 28px 20px 28px; background:linear-gradient(135deg, rgba(59,130,246,0.12), rgba(30,41,59,0.5)); border-bottom:1px solid #1e293b;">` +
    `<div style="display:inline-block; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#60a5fa; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); padding:4px 10px; border-radius:999px; font-weight:600; margin-bottom:12px;">OTP Verification</div>` +
    `<h1 style="margin:0; font-size:24px; font-weight:700; color:#ffffff; letter-spacing:-0.02em;">Verify Your Email Address</h1>` +
    `<p style="margin:8px 0 0 0; font-size:14px; color:#94a3b8; line-height:1.5;">Use the one-time verification code below to complete your registration for Ignite 2.O.</p>` +
    `</td></tr>` +
    `<tr><td style="padding:32px 28px; text-align:center;">` +
    `<p style="margin:0 0 14px 0; font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; font-weight:600;">One-Time Verification Code</p>` +
    `<div style="display:inline-block; background:#1e293b; border:2px solid #3b82f6; border-radius:12px; padding:14px 32px; letter-spacing:8px; font-size:32px; font-weight:700; color:#60a5fa; font-family:'Courier New', Courier, monospace;">` +
    `${safeOtp}` +
    `</div>` +
    `<p style="margin:16px 0 0 0; font-size:13px; color:#cbd5e1;">This code is valid for <strong>10 minutes</strong> and can only be used once.</p>` +
    `<div style="margin-top:24px; padding:12px 16px; background:rgba(30,41,59,0.7); border-radius:8px; border-left:3px solid #3b82f6; text-align:left;">` +
    `<p style="margin:0; font-size:13px; color:#94a3b8; line-height:1.5;">Security reminder: Never share this verification code with anyone. Our team will never ask for your code.</p>` +
    `</div>` +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px 24px 28px; border-top:1px solid #1e293b; background:#0b0f19;">` +
    `<p style="margin:0; color:#64748b; font-size:12px; line-height:1.5;">This is an automated verification code from Ignite 2.O. If you did not request this, you can safely ignore this email.</p>` +
    `<p style="margin:8px 0 0 0; color:#475569; font-size:11px; line-height:1.5;">Ignite 2.O | ${CAMPUS}<br />${UNIVERSITY}</p>` +
    `</td></tr>` +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`;

  const text =
    `Ignite 2.O — Email Verification\n\n` +
    `Your verification code is: ${otp}\n\n` +
    `This code will expire in 10 minutes.\n` +
    `Use this code to verify your email address on the Ignite 2.O registration page.\n\n` +
    `Do not share this code with anyone.\n` +
    `If you did not request this verification code, please ignore this email.\n\n` +
    `Ignite 2.O | ${CAMPUS}\n${UNIVERSITY}`;

  return { html, text };
}

export function registrationConfirmationTemplate(participant) {
  const skillsValue = Array.isArray(participant?.skills) ? participant.skills.join(', ') : '';

  return renderThemedEmail({
    type: 'confirmation',
    preheader: 'Ignite 2.O Registration Confirmed',
    heading: 'Registration Successful',
    subheading: `Hi ${participant?.full_name || 'Participant'}, your registration has been recorded.`,
    message: "You're all set for Ignite 2.O. Keep this email for your records and event desk verification.",
    meta: [
      { label: 'Name', value: participant?.full_name || '' },
      { label: 'Email', value: participant?.email || '' },
      { label: 'Roll Number', value: participant?.roll_number || '' },
      { label: 'Branch', value: participant?.branch || '' },
      { label: 'Year', value: participant?.year || '' },
      { label: 'Skills', value: skillsValue || '-' },
      { label: 'Payment ID', value: participant?.payment_id || '' },
      { label: 'WhatsApp', value: participant?.whatsapp_number || '' },
    ],
    footerNote: 'If this mail appears outside inbox, check Spam and Promotions folders.',
  });
}

export function announcementTemplate(payload = {}) {
  return renderThemedEmail({ type: 'announcement', ...payload });
}

export function infoTemplate(payload = {}) {
  return renderThemedEmail({ type: 'info', ...payload });
}

export function messageTemplate(payload = {}) {
  return renderThemedEmail({ type: 'message', ...payload });
}

export function notificationTemplate(payload = {}) {
  return renderThemedEmail({ type: 'notification', ...payload });
}

export function participantApprovalRequestToAdminTemplate({ participant, reviewUrl }) {
  const skillsValue = Array.isArray(participant?.skills) ? participant.skills.join(', ') : '-';

  return renderThemedEmail({
    type: 'notification',
    preheader: `Registration Approval Required: ${participant?.full_name || 'Participant'} (${participant?.registration_id || 'ID'})`,
    heading: 'New Participant Registration Submitted',
    subheading: 'A new participant has completed Step 1 registration and requires admin verification.',
    message: 'Please review the participant information below. You can approve or reject this registration request in the Admin Dashboard.',
    cta: {
      url: reviewUrl,
      label: 'Review Request in Admin Dashboard',
    },
    meta: [
      { label: 'Registration ID', value: participant?.registration_id || '-' },
      { label: 'Full Name', value: participant?.full_name || '-' },
      { label: 'Email', value: participant?.email || '-' },
      { label: 'WhatsApp Number', value: participant?.whatsapp_number || '-' },
      { label: 'Roll / Enrolment No', value: participant?.roll_number || '-' },
      { label: 'Branch', value: participant?.branch || '-' },
      { label: 'Year', value: participant?.year || '-' },
      { label: 'Skills', value: skillsValue },
      { label: 'Submitted Date', value: participant?.registered_at || new Date().toISOString() },
      { label: 'Current Status', value: 'Pending Admin Verification' },
    ],
    footerNote: 'Only authorized administrators can approve or reject participant registrations.',
  });
}

export function participantRegistrationApprovedTemplate({ participant, step2Url }) {
  return renderThemedEmail({
    type: 'success',
    badge: 'Registration Approved',
    preheader: 'Ignite 2.O — Your Registration Has Been Approved!',
    heading: 'Registration Approved!',
    subheading: `Hello ${participant?.full_name || 'Participant'},`,
    message: `Congratulations! Your Step 1 registration for Ignite 2.O has been successfully verified and approved by our admin team.\n\nYou can now proceed to Step 2 and complete the payment process.\n\nClick the secure button below to continue:`,
    cta: {
      url: step2Url,
      label: 'Proceed to Step 2 & Payment',
    },
    meta: [
      { label: 'Your Registration ID', value: participant?.registration_id || '-' },
      { label: 'Full Name', value: participant?.full_name || '-' },
      { label: 'Roll Number', value: participant?.roll_number || '-' },
      { label: 'Branch & Year', value: `${participant?.branch || '-'} (${participant?.year || '-'})` },
      { label: 'Approval Status', value: 'Approved' },
    ],
    footerNote: 'Please do not share this continuation link with others. If not in your inbox, check Spam and Promotions folders.',
  });
}

export function participantRegistrationRejectedTemplate({ participant, reason }) {
  return renderThemedEmail({
    type: 'warning',
    badge: 'Registration Update',
    preheader: 'Ignite 2.O — Registration Status Update',
    heading: 'Registration Status Update',
    subheading: `Hello ${participant?.full_name || 'Participant'},`,
    message: `We reviewed your Step 1 registration submission for Ignite 2.O. Unfortunately, our admin team was unable to approve your registration at this time.${reason ? `\n\nReason: ${reason}` : ''}\n\nIf you believe this was an error, please verify your details and register again.`,
    meta: [
      { label: 'Registration ID', value: participant?.registration_id || '-' },
      { label: 'Full Name', value: participant?.full_name || '-' },
      { label: 'Roll Number', value: participant?.roll_number || '-' },
      { label: 'Status', value: 'Rejected' },
      { label: 'Reason', value: reason || 'Details could not be verified' },
    ],
    footerNote: 'Ignite 2.O Team — Engineering Dept, IET, DDU Gorakhpur University',
  });
}
