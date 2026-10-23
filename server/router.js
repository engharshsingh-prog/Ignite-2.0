import 'dotenv/config';
import activities from './activities.js';
import checkin from './checkin.js';
import emailOtp from './email-otp.js';
import eventSettings from './event-settings.js';
import managementTeam from './management-team.js';
import media from './media.js';
import participantLookup from './participant-lookup.js';
import participantConfirmationEmail from './participant-confirmation-email.js';
import participantsShare from './participants-share.js';
import participantsTransfer from './participants-transfer.js';
import participants from './participants.js';
import paymentSummary from './payment-summary.js';
import paymentVerification from './payment-verification.js';
import publicParticipants from './public-participants.js';
import publicMediaControl from './public-media-control.js';
import registrationControl from './registration-control.js';
import sheetSync from './sheet-sync.js';
import stats from './stats.js';
import validationHandlerAccess from './validation-handler-access.js';
import validationHandler from './validation-handler.js';
import winners from './winners.js';
import login from './auth/login.js';
import me from './auth/me.js';
import signout from './auth/signout.js';
import approvalStatus from './auth/approval-status.js';
import approvalCancel from './auth/approval-cancel.js';
import approvals from './auth/approvals.js';
import approvalResolve from './auth/approval-resolve.js';
import controlData from './control/data.js';
import controlAdmins from './control/admins.js';
import controlSessions from './control/sessions.js';
import {
  handleGetRegistrationApprovals,
  handleResolveRegistrationApproval,
  handleResendApprovalEmail,
  handleVerifyStep2Access,
  handleSubmitStep2Payment,
  handleGetRegistrationStatus,
} from './registration-flow.js';
import {
  handleGetRegistrationLockStatus,
  handleSuperAdminGetLocks,
  handleSuperAdminToggleLock,
  handleSuperAdminGetLockAuditLogs,
  handleSuperAdminGetYearRegistrationControl,
  handleSuperAdminSetYearRegistrationControl,
} from './registration-locks.js';
import { getAdminFromRequest, requireSuperAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';

const routeHandlers = new Map([
  ['/activities', activities],
  ['/auth/login', login],
  ['/auth/me', me],
  ['/auth/signout', signout],
  ['/auth/approval-status', approvalStatus],
  ['/auth/approval-cancel', approvalCancel],
  ['/auth/approvals', approvals],
  ['/auth/approval-resolve', approvalResolve],
  ['/checkin', checkin],
  ['/control/data', controlData],
  ['/control/admins', controlAdmins],
  ['/control/sessions', controlSessions],
  ['/email-otp', emailOtp],
  ['/event-settings', eventSettings],
  ['/management-team', managementTeam],
  ['/media', media],
  ['/participant-lookup', participantLookup],
  ['/participant-confirmation-email', participantConfirmationEmail],
  ['/participants', participants],
  ['/participants-share', participantsShare],
  ['/participants-transfer', participantsTransfer],
  ['/payment-summary', paymentSummary],
  ['/admin/payment-summary', paymentSummary],
  ['/payment-verification', paymentVerification],
  ['/public-participants', publicParticipants],
  ['/public-media-control', publicMediaControl],
  ['/registration-control', registrationControl],
  ['/registration-locks/status', handleGetRegistrationLockStatus],
  ['/registration-approvals', handleGetRegistrationApprovals],
  ['/registration-approvals/resolve', handleResolveRegistrationApproval],
  ['/registration-approvals/resend-email', handleResendApprovalEmail],
  ['/registration-step2/verify', handleVerifyStep2Access],
  ['/registration-step2/submit-payment', handleSubmitStep2Payment],
  ['/registration-status', handleGetRegistrationStatus],
  ['/sheet-sync', sheetSync],
  ['/stats', stats],
  ['/validation-handler', validationHandler],
  ['/validation-handler-access', validationHandlerAccess],
  ['/winners', winners],
  ['/super-admin/data', controlData],
  ['/super-admin/admins', controlAdmins],
  ['/super-admin/sessions', controlSessions],
  ['/super-admin/approvals', approvals],
  ['/super-admin/approval-resolve', approvalResolve],
  ['/super-admin/control', controlData],
  ['/super-admin/registration-locks', handleSuperAdminGetLocks],
  ['/super-admin/registration-locks/toggle', handleSuperAdminToggleLock],
  ['/super-admin/registration-locks/audit-logs', handleSuperAdminGetLockAuditLogs],
  ['/super-admin/year-registration-control', async (req, res) => {
    if (req.method === 'GET') return handleSuperAdminGetYearRegistrationControl(req, res);
    if (req.method === 'PUT') return handleSuperAdminSetYearRegistrationControl(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  }],
]);

async function genericSuperAdminHandler(req, res) {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;
  return res.status(200).json({ ok: true, message: 'Super admin endpoint' });
}

function normalizeApiPath(req) {
  let rewrittenPath = req?.query?.path;
  if (Array.isArray(rewrittenPath) && rewrittenPath.length > 0) {
    rewrittenPath = rewrittenPath[0];
  }
  if (typeof rewrittenPath === 'string' && rewrittenPath) {
    const clean = rewrittenPath.split('?')[0].replace(/^\/+|\/+$/g, '');
    return `/${clean}`;
  }

  if (req.baseUrl === '/api' && typeof req.path === 'string') {
    const path = (req.path || '/').split('?')[0];
    return path === '/' ? '/' : path.replace(/\/+$/, '') || '/';
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = (url.pathname.replace(/^\/api/, '') || '/').split('?')[0];
  return pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
}

export default async function dispatchApiRequest(req, res) {
  const path = normalizeApiPath(req);

  // Policy check: No UI or API may create, promote or demote a super_admin.
  // Any request trying to set role='super_admin' through any API must fail with 403 and be written to activity_logs.
  if (req.body?.role === 'super_admin' || req.query?.role === 'super_admin') {
    const admin = await getAdminFromRequest(req);
    const actorEmail = admin?.email || 'unauthenticated';
    await writeActivity({
      entity_type: 'security_violation',
      entity_id: admin?.id || 0,
      action: 'forbidden_super_admin_role_change_attempt',
      actor_email: actorEmail,
      details: {
        path,
        method: req.method,
        ip: req.ip || req.headers?.['x-forwarded-for'] || '',
        message: 'No UI or API may create, promote or assign super_admin role.',
        attempted_role: 'super_admin',
      },
    }).catch(() => {});
    return res.status(403).json({
      error: 'Forbidden: No UI or API may create, promote or assign super_admin role. Super admin privileges are derived solely from SUPER_ADMIN_EMAILS in server environment.'
    });
  }

  let handler = routeHandlers.get(path);

  // If path starts with /super-admin or /control and no specific handler was found, route to genericSuperAdminHandler
  if (!handler && (path.startsWith('/super-admin') || path.startsWith('/control'))) {
    handler = genericSuperAdminHandler;
  }

  if (!handler) {
    console.warn(`[api-router] 404 Not Found: ${req.method} "${path}" (originalUrl: ${req.originalUrl})`);
    return res.status(404).json({ error: `API route not found: ${path}` });
  }

  try {
    return await handler(req, res);
  } catch (err) {
    console.error(`[api-router] Error handling ${req.method} ${path}:`, err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || 'Internal server error occurred' });
    }
  }
}
