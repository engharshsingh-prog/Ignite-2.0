import db from './_db.js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const participants = await db.prepare('SELECT id, check_in_status, payment_verified, approval_status, branch, year FROM participants').all();

    const total = participants.length;
    const pendingApprovals = participants.filter(p => p.approval_status === 'pending_approval').length;
    const approvedRegistrations = participants.filter(p => p.approval_status === 'approved').length;
    const rejectedRegistrations = participants.filter(p => p.approval_status === 'rejected').length;
    const checkedIn = participants.filter(p => Boolean(p.check_in_status)).length;
    const paymentsVerified = participants.filter(p => Boolean(p.payment_verified)).length;
    const paymentsPending = participants.filter(p => p.approval_status === 'approved' && !p.payment_verified).length;
    const branchCounts = participants.reduce((acc, p) => { acc[p.branch] = (acc[p.branch] || 0) + 1; return acc; }, {});
    const yearCounts = participants.reduce((acc, p) => { acc[p.year] = (acc[p.year] || 0) + 1; return acc; }, {});

    return res.status(200).json({
      total,
      pendingApprovals,
      approvedRegistrations,
      rejectedRegistrations,
      checkedIn,
      notCheckedIn: total - checkedIn,
      paymentsVerified,
      paymentsPending,
      branchCounts,
      yearCounts,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
