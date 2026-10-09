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
import paymentVerification from './payment-verification.js';
import publicParticipants from './public-participants.js';
import registrationControl from './registration-control.js';
import sheetSync from './sheet-sync.js';
import stats from './stats.js';
import validationHandlerAccess from './validation-handler-access.js';
import validationHandler from './validation-handler.js';
import winners from './winners.js';
import login from './auth/login.js';
import me from './auth/me.js';
import signout from './auth/signout.js';

const routeHandlers = new Map([
  ['/activities', activities],
  ['/auth/login', login],
  ['/auth/me', me],
  ['/auth/signout', signout],
  ['/checkin', checkin],
  ['/email-otp', emailOtp],
  ['/event-settings', eventSettings],
  ['/management-team', managementTeam],
  ['/media', media],
  ['/participant-lookup', participantLookup],
  ['/participant-confirmation-email', participantConfirmationEmail],
  ['/participants', participants],
  ['/participants-share', participantsShare],
  ['/participants-transfer', participantsTransfer],
  ['/payment-verification', paymentVerification],
  ['/public-participants', publicParticipants],
  ['/registration-control', registrationControl],
  ['/sheet-sync', sheetSync],
  ['/stats', stats],
  ['/validation-handler', validationHandler],
  ['/validation-handler-access', validationHandlerAccess],
  ['/winners', winners],
]);

function normalizeApiPath(req) {
  const rewrittenPath = req?.query?.path;
  if (typeof rewrittenPath === 'string' && rewrittenPath) {
    return `/${rewrittenPath.replace(/^\/+|\/+$/g, '')}`;
  }

  if (Array.isArray(rewrittenPath) && rewrittenPath.length > 0) {
    return `/${rewrittenPath.join('/').replace(/^\/+|\/+$/g, '')}`;
  }

  if (req.baseUrl === '/api' && typeof req.path === 'string') {
    const path = req.path || '/';
    return path === '/' ? '/' : path.replace(/\/+$/, '') || '/';
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname.replace(/^\/api/, '') || '/';
  return pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
}

export default async function dispatchApiRequest(req, res) {
  const path = normalizeApiPath(req);
  const handler = routeHandlers.get(path);

  if (!handler) {
    return res.status(404).json({ error: 'API route not found' });
  }

  return handler(req, res);
}
