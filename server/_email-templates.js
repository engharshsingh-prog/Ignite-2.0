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
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
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
  footerNote = 'If this email is not visible in your inbox, please check Spam and Promotions folders.',
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
    `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${safePreheader}</div>` +
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
      `${preheader}\n${heading}\n${subheading}\n${message}\n` +
      `${Array.isArray(highlights) ? highlights.join('\n') : ''}\n` +
      `${Array.isArray(meta) ? meta.map((row) => `${row?.label}: ${row?.value}`).join('\n') : ''}\n` +
      `${footerNote}`
    ),
  };
}

export function otpTemplate({ otp }) {
  const safeOtp = escapeHtml(otp);
  const { html, text } = renderThemedEmail({
    type: 'otp',
    preheader: 'Ignite 2.O OTP Verification',
    heading: 'Verify Your Email',
    subheading: 'Use this OTP to continue your Ignite 2.O registration.',
    message: `Your one-time password is: ${safeOtp}\nThis OTP will expire in 10 minutes.`,
    highlights: ['OTP is valid for one registration flow only.', 'Do not share this OTP with anyone.'],
    footerNote: 'Mandatory email verification is enabled. If not in inbox, check Spam and Promotions folders.',
  });

  return {
    html: html.replace(
      safeOtp,
      `<span style="display:inline-block; font-size:28px; letter-spacing:5px; font-weight:700; color:#3b82f6;">${safeOtp}</span>`
    ),
    text,
  };
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
