import db from './_db.js';
import { requireAdmin } from './_auth.js';

export function formatInr(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export async function calculatePaymentSummary() {
  let fee1stYear = 599;
  let fee2ndYear = 699;
  try {
    const settings = await db.prepare('SELECT fee_1st_year, fee_2nd_year FROM event_settings WHERE id = 1').get();
    if (settings) {
      if (settings.fee_1st_year != null) fee1stYear = Number(settings.fee_1st_year);
      if (settings.fee_2nd_year != null) fee2ndYear = Number(settings.fee_2nd_year);
    }
  } catch (_) {}

  const participants = await db.prepare(`
    SELECT id, email, roll_number, year, payment_id, payment_amount, payment_status, payment_verified, approval_status
    FROM participants
  `).all();

  const seenPaymentIds = new Set();
  const seenParticipantKeys = new Set();

  let firstYearTotal = 0;
  let firstYearCount = 0;
  let secondYearTotal = 0;
  let secondYearCount = 0;

  let pendingCount = 0;
  let rejectedCount = 0;
  let recordsNeedingReview = 0;
  let duplicatePaymentsCount = 0;

  for (const p of participants) {
    // Only confirmed/successful payments
    const isApproved = p.payment_status === 'approved' || (p.payment_status === undefined && Boolean(p.payment_verified));
    const isPending = p.payment_status === 'pending_verification' && !p.payment_verified;
    const isRejected = p.payment_status === 'rejected';

    if (isPending) pendingCount++;
    if (isRejected) rejectedCount++;

    if (!isApproved) continue;

    // Check plan / academic year
    const rawYear = String(p.year || '').trim();
    const isFirstYear = rawYear === '1st Year' || rawYear === '1-Year' || rawYear === '1st';
    const isSecondYear = rawYear === '2nd Year' || rawYear === '2-Year' || rawYear === '2nd';

    if (!isFirstYear && !isSecondYear) {
      recordsNeedingReview++;
      continue;
    }

    // Deduplicate duplicate transaction IDs if provided
    const pid = String(p.payment_id || '').trim().toLowerCase();
    if (pid && seenPaymentIds.has(pid)) {
      duplicatePaymentsCount++;
      continue;
    }
    if (pid) seenPaymentIds.add(pid);

    // Deduplicate participant per plan (avoid double counting same student in same plan)
    const normEmail = String(p.email || '').trim().toLowerCase();
    const normRoll = String(p.roll_number || '').trim().toLowerCase();
    const participantKey = `${normEmail || normRoll}_${isSecondYear ? '2nd' : '1st'}`;
    if (seenParticipantKeys.has(participantKey)) {
      duplicatePaymentsCount++;
      continue;
    }
    seenParticipantKeys.add(participantKey);

    // Calculate actual amount paid with fallback to event settings fee
    const amount = (p.payment_amount != null && !isNaN(Number(p.payment_amount)) && Number(p.payment_amount) > 0)
      ? Number(p.payment_amount)
      : (isSecondYear ? fee2ndYear : fee1stYear);

    if (isFirstYear) {
      firstYearTotal += amount;
      firstYearCount++;
    } else if (isSecondYear) {
      secondYearTotal += amount;
      secondYearCount++;
    }
  }

  const grandTotal = firstYearTotal + secondYearTotal;
  const grandCount = firstYearCount + secondYearCount;

  return {
    currency: 'INR',
    currencySymbol: '₹',
    firstYear: {
      planName: '1-Year Plan',
      academicYear: '1st Year',
      totalAmount: firstYearTotal,
      totalAmountFormatted: formatInr(firstYearTotal),
      successfulCount: firstYearCount,
      configuredFee: fee1stYear,
    },
    secondYear: {
      planName: '2-Year Plan',
      academicYear: '2nd Year',
      totalAmount: secondYearTotal,
      totalAmountFormatted: formatInr(secondYearTotal),
      successfulCount: secondYearCount,
      configuredFee: fee2ndYear,
    },
    grandTotal: {
      totalAmount: grandTotal,
      totalAmountFormatted: formatInr(grandTotal),
      successfulCount: grandCount,
    },
    metrics: {
      pendingCount,
      rejectedCount,
      recordsNeedingReview,
      duplicatePaymentsCount,
    },
    lastUpdated: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const summary = await calculatePaymentSummary();
    return res.status(200).json({ success: true, ...summary });
  } catch (err) {
    console.error('Payment Summary API error:', err);
    return res.status(500).json({ error: 'Failed to calculate payment summary: ' + (err?.message || err) });
  }
}

