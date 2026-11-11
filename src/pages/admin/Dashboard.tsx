import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserCheck,
  Search,
  Mail,
  AlertCircle,
  Upload,
  Trophy,
  RefreshCw,
  ChevronDown,
  Pencil,
  Trash2,
  ShieldCheck,
  X,
  Download,
  FileUp,
  Link2,
  Power,
  QrCode,
  MoreVertical,
  CalendarClock,
  ShieldAlert,
  Crown,
  Check,
  Eye,
  Clock,
  Send,
  Phone,
  CheckCircle2,
  XCircle,
  Image,
  ExternalLink,
  Wallet,
  IndianRupee,
  TrendingUp,
  GraduationCap,
  Building2,
  Copy,
  Layers,
} from 'lucide-react';import { authHeaders, checkAdminAuth, type AdminUser } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';
import QrCheckinScannerModal from '../../components/QrCheckinScannerModal';
import { getErrorMessage, readJsonSafe } from '../../lib/http';

interface Participant {
  id: number;
  registration_id?: string;
  full_name: string;
  roll_number: string;
  branch: string;
  email: string;
  year: string;
  payment_amount?: number | null;
  whatsapp_number: string;
  skills: string[];
  payment_id: string | null;
  payment_verified: boolean;
  account_holder_name?: string | null;
  payment_screenshot_url?: string | null;
  payment_status?: 'pending_verification' | 'approved' | 'rejected';
  payment_rejected_reason?: string | null;
  payment_verified_at?: string | null;
  payment_verified_by?: string | null;
  check_in_status: boolean;
  check_in_time: string | null;
  registered_at: string;
  approval_status?: 'pending_approval' | 'approved' | 'rejected';
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;
  approval_email_sent?: boolean;
  approval_email_error?: string | null;
}

interface Stats {
  total: number;
  checkedIn: number;
  notCheckedIn: number;
  pendingApprovals?: number;
  approvedRegistrations?: number;
  rejectedRegistrations?: number;
  paymentsVerified?: number;
  paymentsPending?: number;
  branchCounts: Record<string, number>;
  yearCounts: Record<string, number>;
}

export interface BranchYearSummaryItem {
  branch: string;
  firstYearCount: number;
  firstYearPaid: number;
  secondYearCount: number;
  secondYearPaid: number;
  totalCount: number;
  totalPaid: number;
  totalAmount: number;
  totalAmountFormatted: string;
  percentageOfTotal: number;
}

interface PaymentCollectionSummary {
  currency: string;
  currencySymbol: string;
  firstYear: {
    planName: string;
    academicYear: string;
    totalAmount: number;
    totalAmountFormatted: string;
    successfulCount: number;
    configuredFee: number;
  };
  secondYear: {
    planName: string;
    academicYear: string;
    totalAmount: number;
    totalAmountFormatted: string;
    successfulCount: number;
    configuredFee: number;
  };
  grandTotal: {
    totalAmount: number;
    totalAmountFormatted: string;
    successfulCount: number;
  };
  registrationTotals?: {
    firstYearTotal: number;
    firstYearPaid: number;
    secondYearTotal: number;
    secondYearPaid: number;
    grandTotalRegistrations: number;
    grandTotalPaid: number;
  };
  branchBreakdown?: BranchYearSummaryItem[];
  metrics: {
    pendingCount: number;
    rejectedCount: number;
    recordsNeedingReview: number;
    duplicatePaymentsCount: number;
  };
  lastUpdated: string;
}

interface RegistrationControl {
  enabled: boolean;
  updated_at: string | null;
}

interface ActionMenuState {
  participantId: number;
  top: number;
  left: number;
  openUp: boolean;
}

interface PanelMenuState {
  menu: 'shortcuts' | 'data';
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

interface StatusDialogState {
  title: string;
  message: string;
  tone: 'loading' | 'success' | 'error';
}

interface ParticipantForm {
  email: string;
  full_name: string;
  roll_number: string;
  branch: string;
  year: string;
  skills: string;
  payment_id: string;
  whatsapp_number: string;
  account_holder_name: string;
}

function toFormData(participant: Participant): ParticipantForm {
  return {
    email: participant.email,
    full_name: participant.full_name,
    roll_number: participant.roll_number,
    branch: participant.branch,
    year: participant.year,
    skills: participant.skills.join(', '),
    payment_id: participant.payment_id || '',
    whatsapp_number: participant.whatsapp_number,
    account_holder_name: participant.account_holder_name || '',
  };
}

function parseSkills(raw: string): string[] {
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function AdminDashboard() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('all');
  const [checkingIn, setCheckingIn] = useState<number | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState<number | null>(null);
  const [sendingConfirmationId, setSendingConfirmationId] = useState<number | null>(null);
  const [branches, setBranches] = useState<string[]>([]);

  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [editForm, setEditForm] = useState<ParticipantForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editError, setEditError] = useState('');
  const [transferLoading, setTransferLoading] = useState<'csv' | 'xlsx' | 'import' | null>(null);
  const [transferMessage, setTransferMessage] = useState('');
  const [paymentSummary, setPaymentSummary] = useState<PaymentCollectionSummary | null>(null);
  const [paymentSummaryLoading, setPaymentSummaryLoading] = useState(false);
  const [paymentSummaryError, setPaymentSummaryError] = useState('');
  const [registrationControl, setRegistrationControl] = useState<RegistrationControl | null>(null);
  const [registrationToggleLoading, setRegistrationToggleLoading] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<ActionMenuState | null>(null);
  const [openPanelMenu, setOpenPanelMenu] = useState<PanelMenuState | null>(null);
  const [qrModal, setQrModal] = useState<{ title: string; value: string } | null>(null);
  const [statusDialog, setStatusDialog] = useState<StatusDialogState | null>(null);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // V2 UI Navigation & Workspace Switcher
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'verified' | 'step1' | 'step2' | 'all'>('verified');
  const [isBranchBreakdownOpen, setIsBranchBreakdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'workspace' | 'classic'>('workspace');

  // Participant Registration Approval States (Step 1 -> Step 2)
  const [approvalTab, setApprovalTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reviewingParticipant, setReviewingParticipant] = useState<Participant | null>(null);
  const [rejectModalParticipant, setRejectModalParticipant] = useState<Participant | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [resolvingApprovalId, setResolvingApprovalId] = useState<number | null>(null);
  const [resendingApprovalId, setResendingApprovalId] = useState<number | null>(null);

  // Payment Verification States (Step 2)
  const [paymentVerificationTab, setPaymentVerificationTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [screenshotModal, setScreenshotModal] = useState<{ url: string; title: string; participant?: Participant } | null>(null);
  const [rejectPaymentModalParticipant, setRejectPaymentModalParticipant] = useState<Participant | null>(null);
  const [rejectPaymentReasonInput, setRejectPaymentReasonInput] = useState('');
  const [resolvingPaymentId, setResolvingPaymentId] = useState<number | null>(null);

  // Dedicated Verified Payments Table States
  const [verifiedSearch, setVerifiedSearch] = useState('');
  const [verifiedYearFilter, setVerifiedYearFilter] = useState<'all' | '1st Year' | '2nd Year'>('all');
  const [verifiedBranchFilter, setVerifiedBranchFilter] = useState('all');
  const [verifiedCheckinFilter, setVerifiedCheckinFilter] = useState<'all' | 'checked_in' | 'pending'>('all');
  const [verifiedCopiedId, setVerifiedCopiedId] = useState<string | null>(null);

  // Main Directory Filter
  const [mainTableFilter, setMainTableFilter] = useState<'unverified' | 'all' | 'verified'>('unverified');

  // Live QR Pass Scanner Modal
  const [scannerModalOpen, setScannerModalOpen] = useState(false);

  useEffect(() => {
    let intervalId: number | undefined;

    checkAdminAuth().then((user) => {
      setCurrentUser(user);
      if (user?.role === 'super_admin') {
        const fetchApprovals = () => {
          fetch('/api/auth/approvals', { headers: authHeaders() })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setPendingApprovalCount(data?.pending?.length || 0))
            .catch(() => {});
        };

        fetchApprovals();
        intervalId = window.setInterval(fetchApprovals, 8000);
      }
    });

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const fetchPaymentSummary = useCallback(async () => {
    try {
      setPaymentSummaryLoading(true);
      setPaymentSummaryError('');
      const res = await fetch('/api/payment-summary', { headers: authHeaders() });
      const data = await readJsonSafe<PaymentCollectionSummary & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to load payment collection summary'));
      setPaymentSummary(data);
    } catch (err) {
      console.error('Fetch payment summary error:', err);
      setPaymentSummaryError(err instanceof Error ? err.message : 'Failed to load payment collection summary');
    } finally {
      setPaymentSummaryLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (branch !== 'all') params.set('branch', branch);
      const [pRes, sRes] = await Promise.all([
        fetch(`/api/participants?${params}`, { headers: authHeaders() }),
        fetch('/api/stats', { headers: authHeaders() }),
      ]);
      const pData = await readJsonSafe<Participant[]>(pRes);
      const sData = await readJsonSafe<Stats>(sRes);
      setParticipants(Array.isArray(pData) ? pData : []);
      setStats(sData ?? null);
      if (!branches.length && sData?.branchCounts) setBranches(Object.keys(sData.branchCounts));
      fetchPaymentSummary();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, branch, branches.length, fetchPaymentSummary]);

  const fetchRegistrationControl = useCallback(async () => {
    try {
      const res = await fetch('/api/registration-control', { headers: authHeaders() });
      const data = await readJsonSafe<RegistrationControl & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to load registration control'));
      setRegistrationControl(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchPaymentSummary();
    fetchRegistrationControl();
  }, [fetchData, fetchPaymentSummary, fetchRegistrationControl]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-actions-menu="true"]')) return;
      if (target.closest('[data-dashboard-menu="true"]')) return;
      if (target.closest('[data-action-trigger="true"]')) return;
      if (target.closest('[data-menu-trigger="true"]')) return;
      setOpenActionMenu(null);
      setOpenPanelMenu(null);
    };

    const onScroll = () => {
      setOpenActionMenu(null);
      setOpenPanelMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const handleCheckIn = async (id: number, currentStatus: boolean) => {
    setCheckingIn(id);
    try {
      const res = await fetch('/api/checkin', {
        method: 'PUT',
        headers: { ...authHeaders() },
        body: JSON.stringify({ id, check_in_status: !currentStatus }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingIn(null);
    }
  };

  const handlePaymentVerification = async (id: number, currentStatus: boolean) => {
    setVerifyingPayment(id);
    try {
      const res = await fetch('/api/payment-verification', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id, payment_verified: !currentStatus }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setVerifyingPayment(null);
    }
  };

  const handleApprovePayment = async (participant: Participant) => {
    setResolvingPaymentId(participant.id);
    try {
      const res = await fetch('/api/payment-verification', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          id: participant.id,
          payment_status: 'approved',
        }),
      });
      const data = await readJsonSafe<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to approve payment'));

      setStatusDialog({
        title: 'Payment Approved',
        message: data?.message || `Payment for ${participant.full_name} has been verified and approved.`,
        tone: 'success',
      });
      if (screenshotModal?.participant?.id === participant.id) {
        setScreenshotModal(null);
      }
      if (reviewingParticipant?.id === participant.id) {
        setReviewingParticipant(prev => (prev ? { ...prev, payment_status: 'approved', payment_verified: true } : null));
      }
      fetchData();
    } catch (err) {
      setStatusDialog({
        title: 'Payment Approval Failed',
        message: err instanceof Error ? err.message : 'Failed to approve payment',
        tone: 'error',
      });
    } finally {
      setResolvingPaymentId(null);
    }
  };

  const handleOpenRejectPaymentModal = (participant: Participant) => {
    setRejectPaymentModalParticipant(participant);
    setRejectPaymentReasonInput('');
  };

  const handleRejectPayment = async () => {
    if (!rejectPaymentModalParticipant) return;
    const participant = rejectPaymentModalParticipant;
    setResolvingPaymentId(participant.id);
    try {
      const res = await fetch('/api/payment-verification', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          id: participant.id,
          payment_status: 'rejected',
          reason: rejectPaymentReasonInput.trim() || undefined,
        }),
      });
      const data = await readJsonSafe<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to reject payment'));

      setStatusDialog({
        title: 'Payment Rejected',
        message: data?.message || `Payment for ${participant.full_name} was marked as rejected.`,
        tone: 'success',
      });
      setRejectPaymentModalParticipant(null);
      if (screenshotModal?.participant?.id === participant.id) {
        setScreenshotModal(null);
      }
      if (reviewingParticipant?.id === participant.id) {
        setReviewingParticipant(prev =>
          prev
            ? {
                ...prev,
                payment_status: 'rejected',
                payment_verified: false,
                payment_rejected_reason: rejectPaymentReasonInput.trim() || null,
              }
            : null
        );
      }
      fetchData();
    } catch (err) {
      setStatusDialog({
        title: 'Payment Rejection Failed',
        message: err instanceof Error ? err.message : 'Failed to reject payment',
        tone: 'error',
      });
    } finally {
      setResolvingPaymentId(null);
    }
  };

  const openEdit = (participant: Participant) => {
    setEditingParticipant(participant);
    setEditForm(toFormData(participant));
    setEditError('');
  };

  const closeEdit = () => {
    setEditingParticipant(null);
    setEditForm(null);
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParticipant || !editForm) return;

    setSavingEdit(true);
    setEditError('');

    try {
      const payload = {
        id: editingParticipant.id,
        ...editForm,
        skills: parseSkills(editForm.skills),
      };
      const res = await fetch('/api/participants', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update registration'));
      closeEdit();
      fetchData();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update registration');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (participant: Participant) => {
    const isVerified = participant.payment_status === 'approved' || Boolean(participant.payment_verified);
    const confirmMessage = isVerified
      ? `WARNING: ${participant.full_name} has a VERIFIED PAYMENT of ₹${participant.payment_amount || (participant.year === '2nd Year' ? 699 : 599)}. Deleting will permanently remove their registration and verified payment record.\n\nAre you sure you want to delete this participant?`
      : `Delete registration for ${participant.full_name}? This cannot be undone.`;

    const confirmDelete = window.confirm(confirmMessage);
    if (!confirmDelete) return;

    setDeletingId(participant.id);
    try {
      const res = await fetch('/api/participants', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id: participant.id }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendRegistrationDetails = async (participant: Participant) => {
    setSendingConfirmationId(participant.id);
    setStatusDialog({
      title: 'Sending Registration Details',
      message: `Sending confirmation mail to ${participant.email}...`,
      tone: 'loading',
    });
    try {
      const res = await fetch('/api/participant-confirmation-email', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: participant.id }),
      });
      const data = await readJsonSafe<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to send registration details'));
      setStatusDialog({
        title: 'Registration Details Sent',
        message: data?.message || `Registration details sent to ${participant.email}`,
        tone: 'success',
      });
    } catch (err) {
      setStatusDialog({
        title: 'Email Send Failed',
        message: err instanceof Error ? err.message : 'Failed to send registration details',
        tone: 'error',
      });
    } finally {
      setSendingConfirmationId(null);
    }
  };

  const handleApproveRegistration = async (participant: Participant) => {
    setResolvingApprovalId(participant.id);
    try {
      const res = await fetch('/api/registration-approvals/resolve', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          participant_id: participant.id,
          action: 'approve',
        }),
      });
      const data = await readJsonSafe<{ error?: string; message?: string; email_sent?: boolean }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to approve registration'));

      setStatusDialog({
        title: 'Registration Approved',
        message: data?.message || `${participant.full_name}'s registration has been approved. Approval email with Step 2 continuation link was sent.`,
        tone: 'success',
      });
      if (reviewingParticipant?.id === participant.id) {
        setReviewingParticipant(null);
      }
      fetchData();
    } catch (err) {
      setStatusDialog({
        title: 'Approval Failed',
        message: err instanceof Error ? err.message : 'Failed to approve registration',
        tone: 'error',
      });
    } finally {
      setResolvingApprovalId(null);
    }
  };

  const handleOpenRejectModal = (participant: Participant) => {
    setRejectModalParticipant(participant);
    setRejectionReasonInput('');
  };

  const handleRejectRegistration = async () => {
    if (!rejectModalParticipant) return;
    const participant = rejectModalParticipant;
    setResolvingApprovalId(participant.id);
    try {
      const res = await fetch('/api/registration-approvals/resolve', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          participant_id: participant.id,
          action: 'reject',
          reason: rejectionReasonInput.trim() || undefined,
        }),
      });
      const data = await readJsonSafe<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to reject registration'));

      setStatusDialog({
        title: 'Registration Rejected',
        message: data?.message || `${participant.full_name}'s registration was marked as rejected.`,
        tone: 'success',
      });
      setRejectModalParticipant(null);
      if (reviewingParticipant?.id === participant.id) {
        setReviewingParticipant(null);
      }
      fetchData();
    } catch (err) {
      setStatusDialog({
        title: 'Rejection Failed',
        message: err instanceof Error ? err.message : 'Failed to reject registration',
        tone: 'error',
      });
    } finally {
      setResolvingApprovalId(null);
    }
  };

  const handleResendApprovalEmail = async (participant: Participant) => {
    setResendingApprovalId(participant.id);
    setStatusDialog({
      title: 'Resending Approval Email',
      message: `Sending Step 2 continuation link to ${participant.email}...`,
      tone: 'loading',
    });
    try {
      const res = await fetch('/api/registration-approvals/resend-email', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ participant_id: participant.id }),
      });
      const data = await readJsonSafe<{ error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to resend approval email'));

      setStatusDialog({
        title: 'Approval Email Sent',
        message: data?.message || `Step 2 continuation link sent to ${participant.email}`,
        tone: 'success',
      });
      fetchData();
    } catch (err) {
      setStatusDialog({
        title: 'Resend Failed',
        message: err instanceof Error ? err.message : 'Failed to resend approval email',
        tone: 'error',
      });
    } finally {
      setResendingApprovalId(null);
    }
  };

  const checkinPct = stats ? Math.round((stats.checkedIn / (stats.total || 1)) * 100) : 0;

  const downloadBlob = (blob: Blob, fallbackName: string, contentDisposition: string | null) => {
    const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
    const fileName = match?.[1] || fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setTransferLoading(format);
    setTransferMessage('');
    try {
      const res = await fetch(`/api/participants-transfer?format=${format}`, {
        method: 'GET',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await readJsonSafe<{ error?: string }>(res);
        throw new Error(getErrorMessage(data, 'Failed to export registrations'));
      }
      const blob = await res.blob();
      downloadBlob(blob, `ignite26-participants.${format}`, res.headers.get('content-disposition'));
      setTransferMessage(`Exported registrations as ${format.toUpperCase()}.`);
    } catch (err) {
      setTransferMessage(err instanceof Error ? err.message : 'Failed to export registrations');
    } finally {
      setTransferLoading(null);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setTransferMessage('Please select a CSV or Excel file (.csv, .xlsx, .xls).');
      return;
    }

    setTransferLoading('import');
    setTransferMessage('');
    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      const res = await fetch('/api/participants-transfer', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          file_name: file.name,
          file_data_url: fileDataUrl,
        }),
      });
      const data = await readJsonSafe<{ error?: string; total?: number; created?: number; updated?: number; failed_count?: number }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to import registrations'));

      setTransferMessage(
        `Imported ${data?.total ?? 0} rows: ${data?.created ?? 0} created, ${data?.updated ?? 0} updated, ${data?.failed_count ?? 0} failed.`
      );
      fetchData();
    } catch (err) {
      setTransferMessage(err instanceof Error ? err.message : 'Failed to import registrations');
    } finally {
      setTransferLoading(null);
    }
  };

  const openParticipantQr = (participant: Participant) => {
    const payload = JSON.stringify({
      id: participant.id,
      roll_number: participant.roll_number,
      payment_id: participant.payment_id,
      email: participant.email,
      whatsapp_number: participant.whatsapp_number,
    });
    setQrModal({ title: `QR - ${participant.full_name}`, value: payload });
  };

  const toggleActionMenu = (event: React.MouseEvent, participantId: number) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedHeight = 220;
    const estimatedWidth = 176;
    const padding = 12;

    const openUp = rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;
    const left = clamp(rect.right, padding + estimatedWidth, window.innerWidth - padding);
    const top = openUp
      ? clamp(rect.top - 8, padding + estimatedHeight, window.innerHeight - padding)
      : clamp(rect.bottom + 8, padding, window.innerHeight - padding - estimatedHeight);

    setOpenActionMenu((prev) => {
      if (prev?.participantId === participantId) return null;
      return { participantId, top, left, openUp };
    });
    setOpenPanelMenu(null);
  };

  const togglePanelMenu = (
    event: React.MouseEvent,
    menu: PanelMenuState['menu'],
    estimatedHeight: number
  ) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const padding = 12;

    const maxWidth = Math.max(180, window.innerWidth - padding * 2);
    const estimatedWidth = Math.min(224, maxWidth);

    const openUp = rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;
    const desiredLeft = rect.right - estimatedWidth;
    const left = clamp(desiredLeft, padding, window.innerWidth - padding - estimatedWidth);
    const top = openUp
      ? clamp(rect.top - 8, padding + estimatedHeight, window.innerHeight - padding)
      : clamp(rect.bottom + 8, padding, window.innerHeight - padding - estimatedHeight);

    setOpenPanelMenu((prev) => {
      if (prev?.menu === menu) return null;
      return { menu, top, left, width: estimatedWidth, openUp };
    });
    setOpenActionMenu(null);
  };

  const toggleRegistrations = async () => {
    if (!registrationControl) return;
    setRegistrationToggleLoading(true);
    try {
      const nextEnabled = !registrationControl.enabled;
      const res = await fetch('/api/registration-control', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await readJsonSafe<RegistrationControl & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update registration status'));
      setRegistrationControl(data);
    } catch (err) {
      setTransferMessage(err instanceof Error ? err.message : 'Failed to update registration status');
    } finally {
      setRegistrationToggleLoading(false);
    }
  };

  const verifiedParticipants = useMemo(() => {
    const seenIds = new Set<number>();
    return participants.filter((p) => {
      const isPaid = p.payment_status === 'approved' || Boolean(p.payment_verified);
      if (!isPaid) return false;
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
  }, [participants]);

  const displayedMainParticipants = useMemo(() => {
    const seenIds = new Set<number>();
    return participants.filter((p) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      const isPaid = p.payment_status === 'approved' || Boolean(p.payment_verified);
      if (mainTableFilter === 'unverified') return !isPaid;
      if (mainTableFilter === 'verified') return isPaid;
      return true; // 'all'
    });
  }, [participants, mainTableFilter]);

  const filteredVerifiedParticipants = useMemo(() => {
    return verifiedParticipants.filter((p) => {
      if (verifiedYearFilter !== 'all' && p.year !== verifiedYearFilter) return false;
      if (verifiedBranchFilter !== 'all' && p.branch !== verifiedBranchFilter) return false;
      if (verifiedCheckinFilter === 'checked_in' && !p.check_in_status) return false;
      if (verifiedCheckinFilter === 'pending' && p.check_in_status) return false;

      if (verifiedSearch.trim()) {
        const q = verifiedSearch.toLowerCase().trim();
        const matchName = (p.full_name || '').toLowerCase().includes(q);
        const matchEmail = (p.email || '').toLowerCase().includes(q);
        const matchRoll = (p.roll_number || '').toLowerCase().includes(q);
        const matchRegId = (p.registration_id || '').toLowerCase().includes(q);
        const matchPayId = (p.payment_id || '').toLowerCase().includes(q);
        const matchHolder = (p.account_holder_name || '').toLowerCase().includes(q);
        const matchPhone = (p.whatsapp_number || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchRoll && !matchRegId && !matchPayId && !matchHolder && !matchPhone) {
          return false;
        }
      }
      return true;
    });
  }, [verifiedParticipants, verifiedYearFilter, verifiedBranchFilter, verifiedCheckinFilter, verifiedSearch]);

  const verifiedStats = useMemo(() => {
    let firstYearCount = 0;
    let secondYearCount = 0;
    let totalAmount = 0;
    let checkedInCount = 0;

    for (const p of verifiedParticipants) {
      const isSecondYear = p.year === '2nd Year' || p.year === '2-Year' || p.year === '2nd';
      const isFirstYear = p.year === '1st Year' || p.year === '1-Year' || p.year === '1st';
      const fee = isSecondYear ? (paymentSummary?.secondYear?.configuredFee ?? 699) : (paymentSummary?.firstYear?.configuredFee ?? 599);
      const amount = (p.payment_amount != null && !isNaN(Number(p.payment_amount)) && Number(p.payment_amount) > 0)
        ? Number(p.payment_amount)
        : fee;

      totalAmount += amount;
      if (isFirstYear) firstYearCount++;
      if (isSecondYear) secondYearCount++;
      if (p.check_in_status) checkedInCount++;
    }

    return {
      totalCount: verifiedParticipants.length,
      firstYearCount,
      secondYearCount,
      totalAmount,
      totalAmountFormatted: new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(totalAmount),
      checkedInCount,
    };
  }, [verifiedParticipants, paymentSummary]);

  // Step 2: Payment Verification Items & Pending Count
  const paymentVerificationItems = useMemo(() => {
    return participants.filter((p) => {
      const hasPaymentInfo = Boolean(p.payment_screenshot_url || p.account_holder_name || p.payment_id || p.payment_status || p.payment_verified);
      if (!hasPaymentInfo) return false;

      const isPending =
        p.payment_status === 'pending_verification' ||
        (!p.payment_verified && p.payment_status !== 'rejected' && Boolean(p.payment_screenshot_url || p.account_holder_name || p.payment_id));
      const isApproved = p.payment_status === 'approved' || Boolean(p.payment_verified);
      const isRejected = p.payment_status === 'rejected';

      if (paymentVerificationTab === 'pending') return isPending;
      if (paymentVerificationTab === 'approved') return isApproved;
      if (paymentVerificationTab === 'rejected') return isRejected;
      return true;
    });
  }, [participants, paymentVerificationTab]);

  const paymentPendingCount = useMemo(() => {
    return participants.filter((p) => {
      return (
        p.payment_status === 'pending_verification' ||
        (!p.payment_verified && p.payment_status !== 'rejected' && Boolean(p.payment_screenshot_url || p.account_holder_name || p.payment_id))
      );
    }).length;
  }, [participants]);

  const copyPaymentId = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setVerifiedCopiedId(id);
    setTimeout(() => setVerifiedCopiedId(null), 2000);
  };

  const exportVerifiedCsv = () => {
    if (!filteredVerifiedParticipants.length) return;
    const headers = [
      'Registration ID',
      'Full Name',
      'Roll / Enrolment No',
      'Branch',
      'Academic Year',
      'Amount (INR)',
      'Payment ID',
      'Account Holder Name',
      'Payment Verified By',
      'Payment Verified At',
      'WhatsApp Number',
      'Email',
      'Check-in Status',
      'Check-in Time',
    ];

    const escapeCsv = (str: any) => {
      if (str == null) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = filteredVerifiedParticipants.map((p) => {
      const isSecondYear = p.year === '2nd Year' || p.year === '2-Year' || p.year === '2nd';
      const fee = isSecondYear ? 699 : 599;
      const amount = (p.payment_amount != null && !isNaN(Number(p.payment_amount)) && Number(p.payment_amount) > 0)
        ? Number(p.payment_amount)
        : fee;

      return [
        escapeCsv(p.registration_id || `IGN-${p.id}`),
        escapeCsv(p.full_name),
        escapeCsv(p.roll_number),
        escapeCsv(p.branch),
        escapeCsv(p.year),
        escapeCsv(amount),
        escapeCsv(p.payment_id || ''),
        escapeCsv(p.account_holder_name || ''),
        escapeCsv(p.payment_verified_by || ''),
        escapeCsv(p.payment_verified_at ? new Date(p.payment_verified_at).toLocaleString() : ''),
        escapeCsv(p.whatsapp_number),
        escapeCsv(p.email),
        escapeCsv(p.check_in_status ? 'Checked In' : 'Not Checked In'),
        escapeCsv(p.check_in_time ? new Date(p.check_in_time).toLocaleString() : ''),
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ignite20_verified_payments_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen text-slate-900 pt-24 pb-20 selection:bg-sky-500/20 selection:text-sky-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* ============================================================== */}
        {/* EXECUTIVE V2 TOPBAR & COMMAND HEADER                          */}
        {/* ============================================================== */}
        <header className="mb-8 p-5 sm:p-6 rounded-3xl liquid-glass-strong relative overflow-hidden">
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-sky-500/12 rounded-full blur-3xl pointer-events-none -translate-y-1/2" />
          <div className="absolute top-1/2 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 relative z-10">
            {/* Title & Status Badges */}
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="liquid-icon-bubble !w-10 !h-10 !rounded-2xl text-sky-700">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                      Admin Command Center
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-500/12 text-sky-800 border border-sky-500/35 backdrop-blur-md">
                      UI V2
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>Ignite 2.O • Live Operations & Registration Hub</span>
                  </p>
                </div>
              </div>

              {/* Live Status Indicators */}
              <div className="mt-3.5 flex items-center gap-2.5 flex-wrap text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-700 border border-emerald-500/35 font-medium backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync Online
                </span>

                {currentUser && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/[0.04] text-slate-700 border border-slate-900/15 font-medium backdrop-blur-md">
                    <Crown size={12} className={currentUser.role === 'super_admin' ? 'text-amber-600' : 'text-sky-600'} />
                    {currentUser.role === 'super_admin' ? 'Super Admin' : 'Admin'}: <strong className="text-slate-900">{currentUser.email}</strong>
                  </span>
                )}

                {paymentSummary?.lastUpdated && (
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock size={11} />
                    Updated: {new Date(paymentSummary.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Action Hub */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Live QR Scanner Quick Button */}
              <button
                type="button"
                onClick={() => setScannerModalOpen(true)}
                className="px-4 py-2.5 rounded-2xl border border-sky-500/40 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-teal-500/15 text-sky-900 text-xs sm:text-sm font-bold inline-flex items-center gap-2 hover:from-sky-500/25 hover:to-teal-500/25 transition-all shadow-sm shadow-sky-500/10 backdrop-blur-md cursor-pointer active:scale-95"
                title="Launch Live Camera QR Pass Scanner"
              >
                <QrCode size={16} className="text-sky-600" />
                Live Pass Scanner
              </button>

              {/* Super Admin Control Link */}
              {currentUser?.role === 'super_admin' && (
                <Link
                  to="/admin/super"
                  aria-label="Super Admin control"
                  title="Super Admin control"
                  className="group relative flex items-center justify-center min-w-[42px] min-h-[42px] w-[42px] h-[42px] rounded-2xl bg-amber-500/12 border border-amber-500/35 text-amber-700 hover:text-amber-900 hover:bg-amber-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-amber-400/50 backdrop-blur-md"
                >
                  <Crown size={19} className="transition-transform group-hover:scale-110" />

                  {pendingApprovalCount > 0 && (
                    <span
                      aria-label={`${pendingApprovalCount} pending requests`}
                      className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 flex items-center justify-center border-2 border-white animate-pulse"
                    >
                      {pendingApprovalCount > 9 ? '9+' : pendingApprovalCount}
                    </span>
                  )}
                </Link>
              )}

              {/* Quick Links Menu */}
              <button
                data-menu-trigger="true"
                onClick={(event) => togglePanelMenu(event, 'shortcuts', 220)}
                className="liquid-btn-glass px-3.5 py-2.5 !rounded-2xl text-xs sm:text-sm inline-flex items-center gap-1.5"
              >
                <Link2 size={15} className="text-violet-600" />
                <span>Quick Tools</span>
                <ChevronDown size={14} className={`text-slate-500 transition-transform ${openPanelMenu?.menu === 'shortcuts' ? 'rotate-180' : ''}`} />
              </button>

              {/* Data Tools Menu */}
              <button
                data-menu-trigger="true"
                onClick={(event) => togglePanelMenu(event, 'data', 200)}
                disabled={transferLoading !== null}
                className="liquid-btn-glass px-3.5 py-2.5 !rounded-2xl text-xs sm:text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download size={15} className="text-sky-600" />
                <span>{transferLoading ? 'Processing...' : 'Data Hub'}</span>
                <ChevronDown size={14} className={`text-slate-500 transition-transform ${openPanelMenu?.menu === 'data' ? 'rotate-180' : ''}`} />
              </button>

              {/* Refresh Data Button */}
              <button
                onClick={() => {
                  fetchData();
                  fetchPaymentSummary();
                }}
                disabled={loading || paymentSummaryLoading}
                className="liquid-btn-glass p-2.5 !rounded-2xl text-slate-700 hover:text-slate-900 disabled:opacity-50"
                title="Refresh All Data"
              >
                <RefreshCw size={15} className={(loading || paymentSummaryLoading) ? 'animate-spin text-sky-600' : ''} />
              </button>
            </div>
          </div>
        </header>

        {/* Hidden File Input for CSV/Excel Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleImportFile}
        />

        {transferMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-sky-500/12 border border-sky-500/35 text-xs sm:text-sm text-sky-900 flex items-center justify-between backdrop-blur-md">
            <span>{transferMessage}</span>
            <button onClick={() => setTransferMessage('')} className="text-sky-700 hover:text-sky-950">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* V2 METRICS & CHECK-IN PROGRESS DECK                           */}
        {/* ============================================================== */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-8">
            {/* Card 1: Total Registered */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="liquid-glass-card p-4 sm:p-5 rounded-2xl flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Registered</span>
                <div className="w-8 h-8 rounded-xl bg-blue-500/12 border border-blue-500/30 flex items-center justify-center text-blue-700">
                  <Users size={16} />
                </div>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-slate-900">{stats.total}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Ignite 2.0 Attendees</p>
              </div>
            </motion.div>

            {/* Card 2: Step 1 Approvals */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              onClick={() => setActiveWorkspaceTab('step1')}
              className={`liquid-glass-card p-4 sm:p-5 rounded-2xl cursor-pointer flex flex-col justify-between ${
                ((stats.pendingApprovals ?? 0) > 0)
                  ? '!border-amber-500/45 shadow-lg shadow-amber-500/10'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Step 1 Approvals</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/12 border border-amber-500/35 flex items-center justify-center text-amber-700">
                  <Clock size={16} />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className={`text-2xl sm:text-3xl font-black ${((stats.pendingApprovals ?? 0) > 0) ? 'text-amber-700' : 'text-slate-900'}`}>
                    {stats.pendingApprovals ?? 0}
                  </p>
                  {(stats.pendingApprovals ?? 0) > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950 animate-pulse">
                      Pending
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {(stats.pendingApprovals ?? 0) > 0 ? 'Click to review queue' : 'All registrations verified'}
                </p>
              </div>
            </motion.div>

            {/* Card 3: Payments Verified */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              onClick={() => setActiveWorkspaceTab('verified')}
              className="liquid-glass-card p-4 sm:p-5 rounded-2xl cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Payments Verified</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/12 border border-emerald-500/35 flex items-center justify-center text-emerald-700">
                  <ShieldCheck size={16} />
                </div>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-emerald-700">{stats.paymentsVerified ?? 0}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {paymentPendingCount > 0 ? (
                    <span className="text-amber-700 font-semibold">{paymentPendingCount} pending review</span>
                  ) : (
                    'Confirmed & verified'
                  )}
                </p>
              </div>
            </motion.div>

            {/* Card 4: Venue Check-in */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="liquid-glass-card p-4 sm:p-5 rounded-2xl flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Venue Check-in</span>
                <div className="w-8 h-8 rounded-xl bg-sky-500/12 border border-sky-500/35 flex items-center justify-center text-sky-700">
                  <UserCheck size={16} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-2xl sm:text-3xl font-black text-sky-700">{stats.checkedIn}</p>
                  <span className="text-xs text-slate-500">/ {stats.total}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{stats.notCheckedIn} awaiting arrival</p>
              </div>
            </motion.div>

            {/* Card 5: Registration Portal Status */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="col-span-2 lg:col-span-1 liquid-glass-card p-4 sm:p-5 rounded-2xl flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Registration Gate</span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  registrationControl?.enabled ? 'bg-emerald-500/12 border border-emerald-500/35 text-emerald-700' : 'bg-red-500/12 border border-red-400/35 text-red-700'
                }`}>
                  <Power size={16} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xl sm:text-2xl font-black ${registrationControl?.enabled ? 'text-emerald-700' : 'text-red-700'}`}>
                    {registrationControl?.enabled ? 'Open' : 'Closed'}
                  </span>
                  <button
                    onClick={toggleRegistrations}
                    disabled={registrationToggleLoading}
                    className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all disabled:opacity-50 ${
                      registrationControl?.enabled
                        ? 'bg-red-500/12 border-red-400/35 text-red-700 hover:bg-red-500/20'
                        : 'bg-emerald-500/12 border-emerald-500/35 text-emerald-700 hover:bg-emerald-500/20'
                    }`}
                  >
                    {registrationToggleLoading ? '...' : registrationControl?.enabled ? 'Close Gate' : 'Open Gate'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Public form acceptance</p>
              </div>
            </motion.div>
          </div>
        )}

        {/* Live Venue Arrival Progress Bar */}
        {stats && (
          <div className="mb-8 p-4 sm:p-5 rounded-2xl liquid-glass-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm mb-2.5">
              <span className="text-slate-800 font-semibold flex items-center gap-2">
                <UserCheck size={15} className="text-sky-600" />
                Live Venue Attendance Progress
              </span>
              <span className="text-slate-600">
                <strong className="text-sky-700 font-bold">{stats.checkedIn}</strong> arrived ({checkinPct}%) •{' '}
                <strong className="text-slate-900">{stats.notCheckedIn}</strong> awaiting arrival
              </span>
            </div>
            <div className="h-3 bg-slate-900/10 rounded-full overflow-hidden border border-slate-900/10 p-0.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${checkinPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-500 rounded-full shadow-sm"
              />
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* FINANCIAL COLLECTIONS & REVENUE INTELLIGENCE HUB              */}
        {/* ============================================================== */}
        <section className="mb-8 p-5 sm:p-6 rounded-3xl liquid-glass-strong relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-slate-900/10">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/12 border border-emerald-500/35 flex items-center justify-center text-emerald-700">
                  <Wallet size={18} />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Payment Collection & Revenue Intelligence
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/12 text-emerald-800 border border-emerald-500/35">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Verified Only
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Reconciled in real-time from verified payment records. Excludes pending, unverified, and rejected submissions.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsBranchBreakdownOpen(!isBranchBreakdownOpen)}
                className="liquid-btn-glass px-3.5 py-2 text-xs inline-flex items-center gap-1.5"
              >
                <Building2 size={13} className="text-sky-600" />
                <span>{isBranchBreakdownOpen ? 'Hide' : 'View'} Branch Breakdown</span>
                <ChevronDown size={13} className={`transition-transform ${isBranchBreakdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                onClick={fetchPaymentSummary}
                disabled={paymentSummaryLoading}
                className="liquid-btn-glass p-2 disabled:opacity-50"
                title="Recalculate payment totals"
              >
                <RefreshCw size={13} className={paymentSummaryLoading ? 'animate-spin text-sky-600' : ''} />
              </button>
            </div>
          </div>

          {paymentSummaryError && (
            <div className="mb-5 p-4 rounded-xl bg-red-500/12 border border-red-400/35 text-red-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-600 shrink-0" />
                <span>{paymentSummaryError}</span>
              </div>
              <button
                onClick={fetchPaymentSummary}
                className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-900 text-xs font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* 3 Executive Financial Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1st Year Plan */}
            <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-sky-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-sky-500/15 transition-colors" />
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/12 text-blue-700 flex items-center justify-center">
                      <IndianRupee size={15} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      1-Year Plan Collections
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/12 text-blue-800 border border-blue-500/30">
                    1st Year (₹{paymentSummary?.firstYear?.configuredFee ?? 599})
                  </span>
                </div>

                <div className="mt-2">
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {paymentSummaryLoading ? '...' : (paymentSummary?.firstYear?.totalAmountFormatted ?? '₹0.00')}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-900/10 flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Users size={13} className="text-blue-600" />
                  <strong className="text-slate-900 font-semibold">
                    {paymentSummary?.firstYear?.successfulCount ?? 0}
                  </strong> Paid Participants
                </span>
                <span className="text-[11px] text-slate-500">Confirmed</span>
              </div>
            </div>

            {/* 2nd Year Plan */}
            <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-amber-500/15 transition-colors" />
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/12 text-amber-700 flex items-center justify-center">
                      <IndianRupee size={15} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      2-Year Plan Collections
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/12 text-amber-800 border border-amber-500/30">
                    2nd Year (₹{paymentSummary?.secondYear?.configuredFee ?? 699})
                  </span>
                </div>

                <div className="mt-2">
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {paymentSummaryLoading ? '...' : (paymentSummary?.secondYear?.totalAmountFormatted ?? '₹0.00')}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-900/10 flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Crown size={13} className="text-amber-600" />
                  <strong className="text-slate-900 font-semibold">
                    {paymentSummary?.secondYear?.successfulCount ?? 0}
                  </strong> Paid Participants
                </span>
                <span className="text-[11px] text-slate-500">Confirmed</span>
              </div>
            </div>

            {/* Grand Total Collections */}
            <div className="liquid-glass-card p-5 rounded-2xl bg-gradient-to-br from-emerald-500/12 via-sky-500/10 to-blue-500/10 !border-emerald-500/35 shadow-lg shadow-emerald-500/10 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-400/15 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-400/25 transition-colors" />
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-700 flex items-center justify-center">
                      <TrendingUp size={15} />
                    </div>
                    <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                      Grand Total Collections
                    </span>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-800 border border-emerald-500/35">
                    All Plans
                  </span>
                </div>

                <div className="mt-2">
                  <p className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight">
                    {paymentSummaryLoading ? '...' : (paymentSummary?.grandTotal?.totalAmountFormatted ?? '₹0.00')}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-emerald-500/20 flex items-center justify-between text-xs text-slate-700">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-emerald-700" />
                  <strong className="text-slate-900 font-semibold">
                    {paymentSummary?.grandTotal?.successfulCount ?? 0}
                  </strong> Total Confirmed Paid
                </span>
                <span className="text-[11px] text-emerald-700 font-mono">
                  1-Year + 2-Year
                </span>
              </div>
            </div>
          </div>

          {/* Collapsible Branch & Year Registration Breakdown Section */}
          <AnimatePresence>
            {isBranchBreakdownOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 pt-6 border-t border-slate-900/10 overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-wide flex items-center gap-2">
                      <Building2 size={16} className="text-emerald-600" />
                      Branch & Academic Year Breakdown
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Registration volume and verified payment breakdown by engineering branch and academic year.
                    </p>
                  </div>

                  {paymentSummary?.registrationTotals && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-500/12 border border-blue-500/30 text-blue-800 font-medium flex items-center gap-1.5">
                        <GraduationCap size={13} className="text-blue-600" />
                        1st Year: <strong className="text-slate-900 font-bold">{paymentSummary.registrationTotals.firstYearTotal}</strong>
                        <span className="text-[10px] text-blue-700">({paymentSummary.registrationTotals.firstYearPaid} paid)</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/12 border border-amber-500/30 text-amber-800 font-medium flex items-center gap-1.5">
                        <Crown size={13} className="text-amber-600" />
                        2nd Year: <strong className="text-slate-900 font-bold">{paymentSummary.registrationTotals.secondYearTotal}</strong>
                        <span className="text-[10px] text-amber-700">({paymentSummary.registrationTotals.secondYearPaid} paid)</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Breakdown Table */}
                <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55 backdrop-blur-md">
                  <table className="w-full text-left text-xs min-w-[640px]">
                    <thead>
                      <tr className="border-b border-slate-900/10 bg-slate-900/[0.04] text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Branch</th>
                        <th className="py-3 px-4 text-center">1st Year</th>
                        <th className="py-3 px-4 text-center">2nd Year</th>
                        <th className="py-3 px-4 text-center">Total Registered</th>
                        <th className="py-3 px-4 text-right">Collections</th>
                        <th className="py-3 px-4 text-center hidden md:table-cell">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/10">
                      {paymentSummaryLoading && !paymentSummary?.branchBreakdown?.length ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            <LoadingSpinner text="Loading branch & year distribution..." />
                          </td>
                        </tr>
                      ) : paymentSummary?.branchBreakdown?.length ? (
                        paymentSummary.branchBreakdown.map((item) => (
                          <tr key={item.branch} className="hover:bg-slate-900/[0.03] transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                                <span className="font-semibold text-slate-900">{item.branch}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/12 border border-blue-500/30 text-blue-800 font-semibold">
                                <span>{item.firstYearCount}</span>
                                <span className="text-[10px] text-blue-700 font-normal">
                                  ({item.firstYearPaid} paid)
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/12 border border-amber-500/30 text-amber-800 font-semibold">
                                <span>{item.secondYearCount}</span>
                                <span className="text-[10px] text-amber-700 font-normal">
                                  ({item.secondYearPaid} paid)
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="font-bold text-slate-900 text-sm">{item.totalCount}</span>
                              <span className="text-[10px] text-slate-500 block font-normal">
                                {item.totalPaid} confirmed paid
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-bold text-emerald-700 font-mono text-sm">
                                {item.totalAmountFormatted}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center hidden md:table-cell">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-slate-900/10 overflow-hidden">
                                  <div
                                    className="h-full bg-sky-500 rounded-full"
                                    style={{ width: `${Math.min(item.percentageOfTotal, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[11px] text-slate-600 w-9 text-right font-mono">
                                  {item.percentageOfTotal}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-500">
                            No registrations recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {paymentSummary?.registrationTotals && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-900/15 bg-slate-900/[0.04] font-bold text-slate-900">
                          <td className="py-3 px-4">
                            <span className="uppercase text-[11px] tracking-wider text-sky-700">
                              Total Across All Branches
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-blue-700 font-black text-sm">
                              {paymentSummary.registrationTotals.firstYearTotal}
                            </span>
                            <span className="text-[10px] text-blue-700/80 font-normal block">
                              ({paymentSummary.registrationTotals.firstYearPaid} paid)
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-amber-700 font-black text-sm">
                              {paymentSummary.registrationTotals.secondYearTotal}
                            </span>
                            <span className="text-[10px] text-amber-700/80 font-normal block">
                              ({paymentSummary.registrationTotals.secondYearPaid} paid)
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-emerald-700 font-black text-base">
                              {paymentSummary.registrationTotals.grandTotalRegistrations}
                            </span>
                            <span className="text-[10px] text-emerald-700/85 font-normal block">
                              ({paymentSummary.registrationTotals.grandTotalPaid} paid)
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-emerald-700 font-black text-base font-mono">
                              {paymentSummary.grandTotal.totalAmountFormatted}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center hidden md:table-cell text-slate-600 font-mono text-[11px]">
                            100%
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ============================================================== */}
        {/* V2 WORKSPACE NAVIGATOR (SEGMENTED TABS)                        */}
        {/* ============================================================== */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Main Workspace Segment Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl liquid-glass-card">
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab('verified')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeWorkspaceTab === 'verified'
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-md shadow-emerald-500/25 border border-white/40'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
              }`}
            >
              <ShieldCheck size={16} className={activeWorkspaceTab === 'verified' ? 'text-white' : 'text-emerald-600'} />
              <span>Verified Paid List</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeWorkspaceTab === 'verified' ? 'bg-black/20 text-white' : 'bg-emerald-500/12 text-emerald-700 border border-emerald-500/35'
              }`}>
                {verifiedParticipants.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveWorkspaceTab('step1')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeWorkspaceTab === 'step1'
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/25'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
              }`}
            >
              <Clock size={16} className={activeWorkspaceTab === 'step1' ? 'text-slate-950' : 'text-amber-600'} />
              <span>Step 1 Approvals</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeWorkspaceTab === 'step1'
                  ? 'bg-black/15 text-slate-950'
                  : (stats?.pendingApprovals ?? 0) > 0
                    ? 'bg-amber-400 text-slate-950 animate-pulse'
                    : 'bg-slate-900/10 text-slate-700'
              }`}>
                {stats?.pendingApprovals ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveWorkspaceTab('step2')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeWorkspaceTab === 'step2'
                  ? 'liquid-btn-primary'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
              }`}
            >
              <Wallet size={16} className={activeWorkspaceTab === 'step2' ? 'text-white' : 'text-sky-600'} />
              <span>Step 2 Payments</span>
              {paymentPendingCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-300 text-slate-950 animate-pulse">
                  {paymentPendingCount}
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${activeWorkspaceTab === 'step2' ? 'bg-white/20 text-white' : 'bg-slate-900/10 text-slate-700'}`}>
                  {paymentVerificationItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveWorkspaceTab('all')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeWorkspaceTab === 'all'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
              }`}
            >
              <Users size={16} className={activeWorkspaceTab === 'all' ? 'text-white' : 'text-slate-600'} />
              <span>All Registrations</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${activeWorkspaceTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-900/10 text-slate-700'}`}>
                {participants.length}
              </span>
            </button>
          </div>

          {/* View Mode Toggle: Workspace Tabs vs All Sections (Classic Stack) */}
          <div className="flex items-center gap-2 self-end md:self-auto text-xs text-slate-600">
            <span className="text-[11px] hidden sm:inline">Layout:</span>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'workspace' ? 'classic' : 'workspace')}
              className="liquid-btn-glass px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
            >
              <Layers size={13} className="text-sky-600" />
              {viewMode === 'workspace' ? 'Workspace Tabbed' : 'Classic All-in-One'}
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: VERIFIED PAID PARTICIPANTS TABLE                       */}
        {/* ============================================================== */}
        {(viewMode === 'classic' || activeWorkspaceTab === 'verified') && (
          <section className="mb-8 p-6 rounded-3xl liquid-glass-strong !border-emerald-500/35 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

            {/* Section Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 relative">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/12 border border-emerald-500/35 flex items-center justify-center text-emerald-700 shrink-0">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        Verified Paid Participants
                      </h2>
                      <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-emerald-600 text-white shadow-sm">
                        {verifiedParticipants.length} Verified
                      </span>
                      <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/12 text-emerald-800 border border-emerald-500/35 font-mono">
                        {verifiedStats.totalAmountFormatted}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Confirmed attendees with verified registration, payment confirmation, and entry pass authorization.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Metrics Badges & Export */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-blue-500/12 border border-blue-500/30 text-blue-800 text-xs font-medium flex items-center gap-1.5 backdrop-blur-md">
                  <GraduationCap size={13} className="text-blue-600" />
                  1st Year: <strong className="text-slate-900">{verifiedStats.firstYearCount}</strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-amber-500/12 border border-amber-500/30 text-amber-800 text-xs font-medium flex items-center gap-1.5 backdrop-blur-md">
                  <Crown size={13} className="text-amber-600" />
                  2nd Year: <strong className="text-slate-900">{verifiedStats.secondYearCount}</strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-slate-900/[0.04] border border-slate-900/15 text-slate-700 text-xs font-medium flex items-center gap-1.5 backdrop-blur-md">
                  <UserCheck size={13} className="text-emerald-600" />
                  Arrived: <strong className="text-slate-900">{verifiedStats.checkedInCount} / {verifiedStats.totalCount}</strong>
                </span>

                <button
                  type="button"
                  onClick={exportVerifiedCsv}
                  disabled={!filteredVerifiedParticipants.length}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/35 text-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 backdrop-blur-md"
                  title="Download CSV of verified participants"
                >
                  <Download size={13} />
                  Export CSV ({filteredVerifiedParticipants.length})
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={verifiedSearch}
                  onChange={(e) => setVerifiedSearch(e.target.value)}
                  placeholder="Search by name, roll, email, payment ID, holder..."
                  className="liquid-input w-full pl-9 pr-3 py-2.5 text-xs"
                />
                {verifiedSearch && (
                  <button
                    onClick={() => setVerifiedSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 text-xs"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="relative">
                <select
                  value={verifiedYearFilter}
                  onChange={(e) => setVerifiedYearFilter(e.target.value as any)}
                  className="liquid-input w-full px-3 py-2.5 pr-8 text-xs appearance-none"
                >
                  <option value="all" className="bg-white text-slate-900">All Academic Years</option>
                  <option value="1st Year" className="bg-white text-slate-900">1st Year (₹599)</option>
                  <option value="2nd Year" className="bg-white text-slate-900">2nd Year (₹699)</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <select
                  value={verifiedBranchFilter}
                  onChange={(e) => setVerifiedBranchFilter(e.target.value)}
                  className="liquid-input w-full px-3 py-2.5 pr-8 text-xs appearance-none truncate"
                >
                  <option value="all" className="bg-white text-slate-900">All Branches</option>
                  {branches.map((b) => (
                    <option key={b} value={b} className="bg-white text-slate-900">
                      {b}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <select
                  value={verifiedCheckinFilter}
                  onChange={(e) => setVerifiedCheckinFilter(e.target.value as any)}
                  className="liquid-input w-full px-3 py-2.5 pr-8 text-xs appearance-none"
                >
                  <option value="all" className="bg-white text-slate-900">All Check-in Status</option>
                  <option value="checked_in" className="bg-white text-slate-900">Checked In Only</option>
                  <option value="pending" className="bg-white text-slate-900">Awaiting Check-in</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Verified Participants Table */}
            <div className="overflow-x-auto rounded-2xl border border-emerald-500/25 bg-white/55 backdrop-blur-md">
              <table className="w-full text-left text-xs min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-900/10 bg-slate-900/[0.04] text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 text-center w-12">#</th>
                    <th className="py-3 px-3">Participant & Reg ID</th>
                    <th className="py-3 px-3">Roll / Enrolment No</th>
                    <th className="py-3 px-3">Branch & Year</th>
                    <th className="py-3 px-3">Payment Details</th>
                    <th className="py-3 px-3">WhatsApp</th>
                    <th className="py-3 px-3 text-center">Event Check-in</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/10">
                  {filteredVerifiedParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <ShieldCheck size={36} className="mx-auto mb-2 text-emerald-600/50" />
                        <p className="font-semibold text-slate-900 text-sm">No verified participants found</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {verifiedSearch || verifiedYearFilter !== 'all' || verifiedBranchFilter !== 'all' || verifiedCheckinFilter !== 'all'
                            ? 'Try adjusting or clearing your search filters above.'
                            : 'No payments have been verified yet.'}
                        </p>
                        {(verifiedSearch || verifiedYearFilter !== 'all' || verifiedBranchFilter !== 'all' || verifiedCheckinFilter !== 'all') && (
                          <button
                            onClick={() => {
                              setVerifiedSearch('');
                              setVerifiedYearFilter('all');
                              setVerifiedBranchFilter('all');
                              setVerifiedCheckinFilter('all');
                            }}
                            className="mt-3 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-800 border border-emerald-500/35 text-xs font-semibold hover:bg-emerald-500/25 transition-colors"
                          >
                            Reset Filters
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredVerifiedParticipants.map((p, idx) => {
                      const isSecondYear = p.year === '2nd Year' || p.year === '2-Year' || p.year === '2nd';
                      const fee = isSecondYear ? (paymentSummary?.secondYear?.configuredFee ?? 699) : (paymentSummary?.firstYear?.configuredFee ?? 599);
                      const amount = (p.payment_amount != null && !isNaN(Number(p.payment_amount)) && Number(p.payment_amount) > 0)
                        ? Number(p.payment_amount)
                        : fee;
                      const formattedAmount = new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(amount);

                      return (
                        <tr key={p.id} className="hover:bg-slate-900/[0.03] transition-colors">
                          {/* Index */}
                          <td className="py-3.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Participant & Reg ID */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-800 shrink-0">
                                {p.full_name?.charAt(0) || '?'}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-slate-900 text-xs truncate max-w-[180px]">
                                    {p.full_name}
                                  </span>
                                  {p.registration_id && (
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-800 font-bold border border-emerald-500/30">
                                      {p.registration_id}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 truncate max-w-[200px]" title={p.email}>
                                  {p.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Roll Number */}
                          <td className="py-3.5 px-3 font-mono text-xs text-slate-700">
                            {p.roll_number}
                          </td>

                          {/* Branch & Year */}
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/12 text-blue-800 text-[11px] font-medium border border-blue-500/25 block truncate max-w-[170px]" title={p.branch}>
                              {p.branch}
                            </span>
                            <div className="mt-1">
                              {isSecondYear ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-800 text-[10px] font-bold border border-amber-500/30">
                                  <Crown size={10} /> 2nd Year
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/12 text-blue-800 text-[10px] font-bold border border-blue-500/30">
                                  <GraduationCap size={10} /> 1st Year
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Payment Details */}
                          <td className="py-3.5 px-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-emerald-700 font-mono text-xs">
                                  {formattedAmount}
                                </span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/12 text-emerald-800 text-[10px] font-semibold border border-emerald-500/35">
                                  <CheckCircle2 size={10} /> Verified
                                </span>
                              </div>

                              {p.payment_id && (
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[10px] text-slate-600 truncate max-w-[120px]" title={p.payment_id}>
                                    ID: {p.payment_id}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => copyPaymentId(p.payment_id!, `pid-${p.id}`)}
                                    className="text-slate-500 hover:text-emerald-700 transition-colors p-0.5"
                                    title="Copy transaction ID"
                                  >
                                    {verifiedCopiedId === `pid-${p.id}` ? (
                                      <Check size={11} className="text-emerald-600" />
                                    ) : (
                                      <Copy size={11} />
                                    )}
                                  </button>
                                </div>
                              )}

                              {p.account_holder_name && (
                                <p className="text-[10px] text-slate-500 truncate max-w-[140px]" title={p.account_holder_name}>
                                  Holder: <span className="text-slate-800">{p.account_holder_name}</span>
                                </p>
                              )}

                              {p.payment_screenshot_url && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setScreenshotModal({
                                      url: p.payment_screenshot_url!,
                                      title: `${p.full_name} - Payment Screenshot`,
                                      participant: p,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-[10px] text-emerald-800 hover:text-emerald-950 font-medium bg-emerald-500/12 hover:bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/35 transition-colors"
                                >
                                  <Image size={10} /> Screenshot
                                </button>
                              )}
                            </div>
                          </td>

                          {/* WhatsApp Contact */}
                          <td className="py-3.5 px-3">
                            <a
                              href={`https://wa.me/${p.whatsapp_number.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-emerald-800 hover:text-emerald-950 font-mono bg-emerald-500/12 px-2 py-1 rounded-lg border border-emerald-500/30 transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <Phone size={12} />
                              {p.whatsapp_number}
                            </a>
                          </td>

                          {/* Event Check-in */}
                          <td className="py-3.5 px-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {p.check_in_status ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-800 border border-emerald-500/35 text-[10px] font-bold">
                                  <CheckCircle2 size={10} /> Checked In
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/10 text-slate-600 border border-slate-900/15 text-[10px] font-medium">
                                  <Clock size={10} /> Awaiting
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleCheckIn(p.id, p.check_in_status)}
                                disabled={checkingIn === p.id}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                                  p.check_in_status
                                    ? 'bg-red-500/12 text-red-700 hover:bg-red-500/20 border border-red-400/30'
                                    : 'bg-emerald-500/12 text-emerald-800 hover:bg-emerald-500/20 border border-emerald-500/35'
                                }`}
                              >
                                {checkingIn === p.id ? '...' : p.check_in_status ? 'Undo' : 'Check In'}
                              </button>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openParticipantQr(p)}
                                className="px-2 py-1 rounded-lg bg-violet-500/12 hover:bg-violet-500/20 text-violet-700 border border-violet-500/30 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                                title="View QR Pass"
                              >
                                <QrCode size={12} />
                                QR Pass
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingParticipant(p);
                                  setEditForm(toFormData(p));
                                  setEditError('');
                                }}
                                className="p-1.5 rounded-lg bg-slate-900/[0.04] hover:bg-slate-900/10 text-slate-600 hover:text-slate-900 transition-colors"
                                title="Edit Participant"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(p)}
                                disabled={deletingId === p.id}
                                className="p-1.5 rounded-lg bg-red-500/12 hover:bg-red-500/20 text-red-700 border border-red-400/30 transition-colors disabled:opacity-50"
                                title="Delete Registration"
                              >
                                <Trash2 size={12} className={deletingId === p.id ? 'animate-pulse' : ''} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredVerifiedParticipants.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-emerald-500/25 bg-emerald-500/[0.06] font-bold text-slate-900 text-xs">
                      <td colSpan={4} className="py-3.5 px-3 text-emerald-800 uppercase tracking-wider text-[11px]">
                        Showing {filteredVerifiedParticipants.length} of {verifiedParticipants.length} Verified Participants
                      </td>
                      <td className="py-3.5 px-3 font-mono text-emerald-700 font-black text-sm">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(
                          filteredVerifiedParticipants.reduce((sum, p) => {
                            const isSecondYear = p.year === '2nd Year' || p.year === '2-Year' || p.year === '2nd';
                            const fee = isSecondYear ? (paymentSummary?.secondYear?.configuredFee ?? 699) : (paymentSummary?.firstYear?.configuredFee ?? 599);
                            const amount = (p.payment_amount != null && !isNaN(Number(p.payment_amount)) && Number(p.payment_amount) > 0)
                              ? Number(p.payment_amount)
                              : fee;
                            return sum + amount;
                          }, 0)
                        )}
                      </td>
                      <td colSpan={3} className="py-3.5 px-3 text-right text-slate-600 font-normal">
                        {filteredVerifiedParticipants.filter((p) => p.check_in_status).length} Checked In •{' '}
                        {filteredVerifiedParticipants.filter((p) => !p.check_in_status).length} Awaiting Check-in
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB 2: STEP 1 REGISTRATION APPROVALS QUEUE                     */}
        {/* ============================================================== */}
        {(viewMode === 'classic' || activeWorkspaceTab === 'step1') && (
          <section className="mb-8 p-6 rounded-3xl liquid-glass-strong relative">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/12 border border-amber-500/35 flex items-center justify-center text-amber-700">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      Step 1 Registration Approvals Queue
                      {(stats?.pendingApprovals ?? 0) > 0 && (
                        <span className="px-2 py-0.5 text-xs font-black rounded-full bg-amber-400 text-slate-950 animate-pulse">
                          {stats?.pendingApprovals} Pending
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Verify participant identity & WhatsApp community membership before unlocking Step 2 payment access.
                    </p>
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-900/[0.04] border border-slate-900/10 backdrop-blur-md">
                <button
                  onClick={() => setApprovalTab('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    approvalTab === 'pending'
                      ? 'bg-amber-400 text-slate-950 font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Clock size={12} />
                  Pending
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${approvalTab === 'pending' ? 'bg-black/15 text-slate-950' : 'bg-slate-900/10 text-slate-700'}`}>
                    {stats?.pendingApprovals ?? 0}
                  </span>
                </button>
                <button
                  onClick={() => setApprovalTab('approved')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    approvalTab === 'approved'
                      ? 'bg-emerald-600 text-white font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <CheckCircle2 size={12} />
                  Approved
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${approvalTab === 'approved' ? 'bg-black/20 text-white' : 'bg-slate-900/10 text-slate-700'}`}>
                    {stats?.approvedRegistrations ?? 0}
                  </span>
                </button>
                <button
                  onClick={() => setApprovalTab('rejected')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    approvalTab === 'rejected'
                      ? 'bg-red-600 text-white font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <XCircle size={12} />
                  Rejected
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${approvalTab === 'rejected' ? 'bg-black/20 text-white' : 'bg-slate-900/10 text-slate-700'}`}>
                    {stats?.rejectedRegistrations ?? 0}
                  </span>
                </button>
                <button
                  onClick={() => setApprovalTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    approvalTab === 'all'
                      ? 'bg-slate-900 text-white font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  All ({participants.length})
                </button>
              </div>
            </div>

            {/* Approval Table */}
            {(() => {
              const queueItems = participants.filter((p) => {
                const status = p.approval_status || 'approved';
                if (approvalTab === 'pending') return status === 'pending_approval';
                if (approvalTab === 'approved') return status === 'approved';
                if (approvalTab === 'rejected') return status === 'rejected';
                return true;
              });

              if (queueItems.length === 0) {
                return (
                  <div className="py-10 text-center text-slate-500 bg-white/55 rounded-2xl border border-slate-900/10">
                    <ShieldCheck size={32} className="mx-auto mb-2 opacity-50 text-emerald-600" />
                    <p className="text-sm font-semibold text-slate-700">No registrations found in this tab.</p>
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55 backdrop-blur-md">
                  <table className="w-full text-left text-xs min-w-[750px]">
                    <thead>
                      <tr className="border-b border-slate-900/10 bg-slate-900/[0.04] text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-3">Reg ID & Participant</th>
                        <th className="py-3 px-3">WhatsApp / Phone</th>
                        <th className="py-3 px-3 hidden md:table-cell">Roll / Enrolment</th>
                        <th className="py-3 px-3 hidden lg:table-cell">Branch & Year</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/10">
                      {queueItems.map((p) => {
                        const isPending = (p.approval_status || 'approved') === 'pending_approval';
                        const isApproved = (p.approval_status || 'approved') === 'approved';
                        const isRejected = p.approval_status === 'rejected';

                        return (
                          <tr key={p.id} className="hover:bg-slate-900/[0.03] transition-colors">
                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/12 text-emerald-800 font-bold border border-emerald-500/30">
                                  {p.registration_id || `ID-${p.id}`}
                                </span>
                                <div>
                                  <p className="font-semibold text-slate-900 text-sm">{p.full_name}</p>
                                  <p className="text-xs text-slate-500">{p.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-3">
                              <a
                                href={`https://wa.me/${p.whatsapp_number.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-emerald-800 hover:text-emerald-950 font-mono bg-emerald-500/12 px-2 py-1 rounded-lg border border-emerald-500/30"
                                title="Chat on WhatsApp"
                              >
                                <Phone size={12} />
                                {p.whatsapp_number}
                              </a>
                            </td>
                            <td className="py-3.5 px-3 hidden md:table-cell">
                              <span className="font-mono text-xs text-slate-700">{p.roll_number}</span>
                            </td>
                            <td className="py-3.5 px-3 hidden lg:table-cell">
                              <span className="text-xs text-slate-700">{p.branch} • {p.year}</span>
                            </td>
                            <td className="py-3.5 px-3">
                              {isPending ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 border border-amber-500/35 text-amber-800">
                                  <Clock size={11} /> Pending Review
                                </span>
                              ) : isApproved ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/35 text-emerald-700">
                                    <CheckCircle2 size={11} /> Approved
                                  </span>
                                  {p.approval_email_sent === false && (
                                    <p className="text-[10px] text-amber-700 mt-0.5">Email failed</p>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/12 border border-red-400/35 text-red-700">
                                    <XCircle size={11} /> Rejected
                                  </span>
                                  {p.rejection_reason && (
                                    <p className="text-[10px] text-slate-500 max-w-[150px] truncate mt-0.5" title={p.rejection_reason}>
                                      {p.rejection_reason}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setReviewingParticipant(p)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-900/[0.04] hover:bg-slate-900/10 text-slate-700 text-xs font-medium inline-flex items-center gap-1 border border-slate-900/15"
                                  title="Review Full Form"
                                >
                                  <Eye size={13} />
                                  Review
                                </button>

                                {isPending && (
                                  <>
                                    <button
                                      onClick={() => handleApproveRegistration(p)}
                                      disabled={resolvingApprovalId === p.id}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1 shadow-sm disabled:opacity-50"
                                      title="Approve & Send Step 2 Email"
                                    >
                                      <Check size={13} />
                                      {resolvingApprovalId === p.id ? 'Approving...' : 'Approve'}
                                    </button>
                                    <button
                                      onClick={() => handleOpenRejectModal(p)}
                                      disabled={resolvingApprovalId === p.id}
                                      className="px-2.5 py-1.5 rounded-lg bg-red-500/12 hover:bg-red-500/20 text-red-700 border border-red-400/35 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                                      title="Reject Registration"
                                    >
                                      <X size={13} />
                                      Reject
                                    </button>
                                  </>
                                )}

                                {isApproved && (
                                  <button
                                    onClick={() => handleResendApprovalEmail(p)}
                                    disabled={resendingApprovalId === p.id}
                                    className="px-2.5 py-1.5 rounded-lg bg-blue-500/12 hover:bg-blue-500/20 text-blue-700 border border-blue-500/35 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                                    title="Resend Step 2 Continuation Email"
                                  >
                                    <Send size={12} />
                                    {resendingApprovalId === p.id ? 'Sending...' : 'Resend Link'}
                                  </button>
                                )}

                                {isRejected && (
                                  <button
                                    onClick={() => handleApproveRegistration(p)}
                                    disabled={resolvingApprovalId === p.id}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-800 border border-emerald-500/35 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                                    title="Reverse Rejection & Approve"
                                  >
                                    <Check size={12} />
                                    Re-approve
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB 3: STEP 2 PAYMENT VERIFICATION QUEUE                       */}
        {/* ============================================================== */}
        {(viewMode === 'classic' || activeWorkspaceTab === 'step2') && (
          <section className="mb-8 p-6 rounded-3xl liquid-glass-strong !border-sky-500/30 relative">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <div className="liquid-icon-bubble !rounded-2xl !w-10 !h-10 text-sky-700 border-sky-500/35">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      Step 2 Payment & Screenshot Verification
                      {paymentPendingCount > 0 && (
                        <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-sky-500 text-white animate-pulse shadow-sm">
                          {paymentPendingCount} Needs Review
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Verify transaction reference (UTR ID), bank account holder name, and uploaded receipt screenshots.
                    </p>
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-900/[0.04] backdrop-blur-md border border-slate-900/10">
                <button
                  onClick={() => setPaymentVerificationTab('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    paymentVerificationTab === 'pending'
                      ? 'liquid-btn-primary text-white font-bold'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
                  }`}
                >
                  <Clock size={12} />
                  Pending Verification
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${paymentVerificationTab === 'pending' ? 'bg-black/20 text-white' : 'bg-slate-900/10 text-slate-700'}`}>
                    {paymentPendingCount}
                  </span>
                </button>
                <button
                  onClick={() => setPaymentVerificationTab('approved')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    paymentVerificationTab === 'approved'
                      ? 'bg-emerald-600 text-white font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
                  }`}
                >
                  <CheckCircle2 size={12} />
                  Approved
                </button>
                <button
                  onClick={() => setPaymentVerificationTab('rejected')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    paymentVerificationTab === 'rejected'
                      ? 'bg-red-600 text-white font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
                  }`}
                >
                  <XCircle size={12} />
                  Rejected
                </button>
                <button
                  onClick={() => setPaymentVerificationTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    paymentVerificationTab === 'all'
                      ? 'bg-slate-900 text-white font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
                  }`}
                >
                  All Submissions
                </button>
              </div>
            </div>

            {/* Payment Verification Table */}
            {paymentVerificationItems.length === 0 ? (
              <div className="py-10 text-center text-slate-500 bg-white/55 backdrop-blur-md rounded-2xl border border-slate-900/10">
                <Wallet size={32} className="mx-auto mb-2 opacity-50 text-sky-600" />
                <p className="text-sm font-semibold text-slate-700">No payment submissions found in this tab.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55 backdrop-blur-md">
                <table className="w-full text-left text-xs min-w-[800px]">
                  <thead>
                    <tr className="border-b border-slate-900/10 bg-slate-900/[0.04] text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3">Participant</th>
                      <th className="py-3 px-3">Academic Year & Plan</th>
                      <th className="py-3 px-3">UTR / Transaction ID</th>
                      <th className="py-3 px-3">Account Holder</th>
                      <th className="py-3 px-3">Screenshot</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/10">
                    {paymentVerificationItems.map((p) => {
                      const isApproved = p.payment_status === 'approved' || Boolean(p.payment_verified);
                      const isRejected = p.payment_status === 'rejected';
                      const fee = p.year === '2nd Year' ? (paymentSummary?.secondYear?.configuredFee ?? 699) : (paymentSummary?.firstYear?.configuredFee ?? 599);

                      return (
                        <tr key={p.id} className="hover:bg-slate-900/[0.03] transition-colors">
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-semibold text-slate-900 text-sm">{p.full_name}</p>
                                <p className="text-xs text-slate-500">{p.email}</p>
                                <span className="font-mono text-[10px] text-slate-500">{p.roll_number} • {p.branch}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <span className="font-bold text-slate-900 text-xs">{p.year}</span>
                            <span className="block text-[11px] text-emerald-700 font-mono">
                              ₹{p.payment_amount ?? fee}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            {p.payment_id ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-blue-700 font-semibold">{p.payment_id}</span>
                                <button
                                  type="button"
                                  onClick={() => copyPaymentId(p.payment_id!, `step2-${p.id}`)}
                                  className="text-slate-500 hover:text-blue-700 transition-colors p-0.5"
                                  title="Copy UTR ID"
                                >
                                  {verifiedCopiedId === `step2-${p.id}` ? (
                                    <Check size={12} className="text-emerald-600" />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Not provided</span>
                            )}
                          </td>

                          <td className="py-3.5 px-3">
                            <span className="text-slate-800 text-xs font-medium">
                              {p.account_holder_name || <span className="text-slate-500 italic text-[11px]">Not provided</span>}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            {p.payment_screenshot_url ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setScreenshotModal({
                                    url: p.payment_screenshot_url!,
                                    title: `${p.full_name} - Payment Screenshot`,
                                    participant: p,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/12 hover:bg-blue-500/20 text-blue-700 border border-blue-500/35 text-xs font-semibold transition-colors"
                              >
                                <Image size={12} />
                                View Image
                              </button>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">No upload</span>
                            )}
                          </td>

                          <td className="py-3.5 px-3">
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/35 text-emerald-700 text-[11px] font-bold">
                                <CheckCircle2 size={11} /> Approved
                              </span>
                            ) : isRejected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/12 border border-red-400/35 text-red-700 text-[11px] font-bold" title={p.payment_rejected_reason || ''}>
                                <XCircle size={11} /> Rejected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/12 border border-amber-500/35 text-amber-800 text-[11px] font-bold animate-pulse">
                                <Clock size={11} /> Pending
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isApproved && (
                                <button
                                  type="button"
                                  onClick={() => handleApprovePayment(p)}
                                  disabled={resolvingPaymentId === p.id}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1 shadow-sm disabled:opacity-50"
                                >
                                  <Check size={12} />
                                  Approve
                                </button>
                              )}

                              {!isRejected && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRejectPaymentModal(p)}
                                  disabled={resolvingPaymentId === p.id}
                                  className="px-2.5 py-1 rounded-lg bg-red-500/12 hover:bg-red-500/20 text-red-700 border border-red-400/35 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                  <X size={12} />
                                  Reject
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB 4: ALL REGISTRATIONS DIRECTORY & CHECK-IN                  */}
        {/* ============================================================== */}
        {(viewMode === 'classic' || activeWorkspaceTab === 'all') && (
          <section className="mb-8 p-6 rounded-3xl liquid-glass-strong relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Users size={20} className="text-sky-600" />
                  Registration Master Directory
                  <span className="text-xs font-normal text-slate-600">
                    ({displayedMainParticipants.length} students)
                  </span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Full registration index with venue check-in controls, Step 1 & 2 indicators, and participant editing.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-900/[0.04] backdrop-blur-md border border-slate-900/10">
                <button
                  type="button"
                  onClick={() => setMainTableFilter('unverified')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    mainTableFilter === 'unverified'
                      ? 'bg-amber-400 text-slate-950 font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
                  }`}
                >
                  <Clock size={12} />
                  Awaiting Payment / Unverified
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${mainTableFilter === 'unverified' ? 'bg-black/15 text-slate-950' : 'bg-slate-900/10 text-slate-700'}`}>
                    {participants.filter(p => !(p.payment_status === 'approved' || Boolean(p.payment_verified))).length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainTableFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    mainTableFilter === 'all'
                      ? 'bg-slate-900 text-white font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
                  }`}
                >
                  <Users size={12} />
                  All ({participants.length})
                </button>

                <button
                  type="button"
                  onClick={() => setMainTableFilter('verified')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    mainTableFilter === 'verified'
                      ? 'bg-emerald-600 text-white font-bold shadow'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.05]'
                  }`}
                >
                  <ShieldCheck size={12} />
                  Verified Only ({verifiedParticipants.length})
                </button>
              </div>
            </div>

            {/* Search and Branch Selector */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by participant name, roll / enrolment no, or email..."
                  className="liquid-input w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <div className="relative">
                <select
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  className="liquid-input px-4 py-2.5 pr-10 text-xs sm:text-sm appearance-none"
                >
                  <option value="all" className="bg-white text-slate-900">All Branches</option>
                  {branches.map(b => (
                    <option key={b} value={b} className="bg-white text-slate-900">
                      {b}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {loading ? (
              <LoadingSpinner text="Loading participant directory..." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55 backdrop-blur-md">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead>
                    <tr className="border-b border-slate-900/10 bg-slate-900/[0.04] text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3">Participant</th>
                      <th className="py-3 px-3 hidden sm:table-cell">Roll / Enrolment No</th>
                      <th className="py-3 px-3 hidden md:table-cell">Branch</th>
                      <th className="py-3 px-3 hidden lg:table-cell">Year</th>
                      <th className="py-3 px-3">Step 1 Approval</th>
                      <th className="py-3 px-3 hidden md:table-cell">Payment</th>
                      <th className="py-3 px-3">Event Check-in</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/10">
                    {displayedMainParticipants.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <Users size={32} className="mx-auto mb-2 opacity-40 text-blue-600" />
                          <p className="text-sm font-semibold text-slate-900">No registrations found in this view.</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {mainTableFilter === 'unverified'
                              ? 'All participants are verified, or no unverified participants match your search.'
                              : 'Try adjusting your search query or filters.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      displayedMainParticipants.map(p => (
                        <tr key={p.id} className="hover:bg-slate-900/[0.03] transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                {p.full_name.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-semibold text-slate-900 text-xs sm:text-sm">{p.full_name}</p>
                                  {p.registration_id && (
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-800 font-semibold border border-emerald-500/30">
                                      {p.registration_id}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-500 text-xs">{p.email}</p>
                                <p className="text-slate-500 text-[11px] sm:hidden flex items-center gap-1 mt-0.5">
                                  <Phone size={10} /> {p.whatsapp_number}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 hidden sm:table-cell">
                            <span className="font-mono text-xs text-slate-700">{p.roll_number}</span>
                          </td>
                          <td className="py-3 px-3 hidden md:table-cell">
                            <span className="px-2 py-0.5 rounded-lg bg-blue-500/12 text-blue-800 text-xs font-medium">{p.branch}</span>
                          </td>
                          <td className="py-3 px-3 hidden lg:table-cell">
                            <span className="text-slate-700 text-xs">{p.year}</span>
                          </td>
                          <td className="py-3 px-3">
                            {(p.approval_status === 'approved' || !p.approval_status) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/12 border border-emerald-500/35 text-emerald-700 text-[11px] font-semibold">
                                <CheckCircle2 size={11} /> Approved
                              </span>
                            ) : p.approval_status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/12 border border-red-400/35 text-red-700 text-[11px] font-semibold" title={p.rejection_reason || 'Rejected'}>
                                <XCircle size={11} /> Rejected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/12 border border-amber-500/35 text-amber-800 text-[11px] font-semibold animate-pulse">
                                <Clock size={11} /> Pending
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 hidden md:table-cell">
                            <div className="space-y-1">
                              {p.payment_status === 'approved' || p.payment_verified ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/12 border border-emerald-500/35 text-emerald-700 text-[11px] font-semibold">
                                  <CheckCircle2 size={11} /> Approved
                                </span>
                              ) : p.payment_status === 'rejected' ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/12 border border-red-400/35 text-red-700 text-[11px] font-semibold cursor-help"
                                  title={p.payment_rejected_reason || 'Payment rejected'}
                                >
                                  <XCircle size={11} /> Rejected
                                </span>
                              ) : (p.payment_screenshot_url || p.account_holder_name || p.payment_id) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/12 border border-amber-500/35 text-amber-800 text-[11px] font-semibold animate-pulse">
                                  <Clock size={11} /> Pending Verification
                                </span>
                              ) : p.approval_status === 'pending_approval' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-900/10 border border-slate-900/15 text-slate-600 text-[11px] font-semibold">
                                  Locked (Step 1)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-blue-500/12 border border-blue-500/30 text-blue-800 text-[11px] font-semibold">
                                  Awaiting Pay
                                </span>
                              )}

                              {p.account_holder_name && (
                                <p className="text-[10px] text-slate-500 truncate max-w-[140px]" title={p.account_holder_name}>
                                  Holder: <span className="text-slate-800">{p.account_holder_name}</span>
                                </p>
                              )}

                              {p.payment_screenshot_url && (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setScreenshotModal({
                                        url: p.payment_screenshot_url!,
                                        title: `${p.full_name} - Payment Screenshot`,
                                        participant: p,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:text-blue-900 font-medium bg-blue-500/12 hover:bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/35 transition-colors"
                                  >
                                    <Image size={10} /> Screenshot
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-1">
                              {p.check_in_status ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Checked In
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  Not Arrived
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleCheckIn(p.id, p.check_in_status)}
                                disabled={checkingIn === p.id}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold w-fit transition-colors disabled:opacity-50 ${
                                  p.check_in_status
                                    ? 'bg-red-500/12 text-red-700 hover:bg-red-500/20 border border-red-400/30'
                                    : 'bg-emerald-500/12 text-emerald-800 hover:bg-emerald-500/20 border border-emerald-500/35'
                                }`}
                              >
                                {checkingIn === p.id ? '...' : p.check_in_status ? 'Undo' : 'Check In'}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="relative inline-block text-left">
                              <button
                                data-action-trigger="true"
                                onClick={(event) => toggleActionMenu(event, p.id)}
                                className="w-8 h-8 rounded-xl border border-slate-900/15 bg-slate-900/[0.04] hover:bg-slate-900/10 text-slate-700 inline-flex items-center justify-center transition-colors"
                                title="Actions"
                              >
                                <MoreVertical size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

      </div>

      {/* ============================================================== */}
      {/* ALL MODAL DIALOGS & OVERLAYS                                   */}
      {/* ============================================================== */}

      {/* Edit Registration Modal */}
      {editingParticipant && editForm && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl liquid-glass-strong rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900/10 bg-slate-900/[0.04]">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Pencil size={16} className="text-sky-600" />
                Edit Registration Details
              </h3>
              <button onClick={closeEdit} className="liquid-icon-bubble !w-8 !h-8 !rounded-xl text-slate-600 hover:text-slate-900">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">Full Name</label>
                <input
                  value={editForm.full_name}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, full_name: e.target.value } : prev))}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, email: e.target.value } : prev))}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">Roll Number / Enrolment No</label>
                <input
                  value={editForm.roll_number}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, roll_number: e.target.value } : prev))}
                  maxLength={15}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">WhatsApp Number</label>
                <input
                  value={editForm.whatsapp_number}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, whatsapp_number: e.target.value } : prev))}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">Branch</label>
                <input
                  value={editForm.branch}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, branch: e.target.value } : prev))}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">Academic Year</label>
                <select
                  value={editForm.year}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, year: e.target.value } : prev))}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                >
                  <option value="1st Year" className="bg-white text-slate-900">1st Year</option>
                  <option value="2nd Year" className="bg-white text-slate-900">2nd Year</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">Payment ID / UTR</label>
                <input
                  value={editForm.payment_id}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, payment_id: e.target.value } : prev))}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">Account Holder Name</label>
                <input
                  value={editForm.account_holder_name}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, account_holder_name: e.target.value } : prev))}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">Skills (comma-separated)</label>
                <input
                  value={editForm.skills}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, skills: e.target.value } : prev))}
                  className="liquid-input w-full px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>

              {editError && <p className="md:col-span-2 text-xs text-red-700">{editError}</p>}

              <div className="md:col-span-2 flex justify-end gap-2.5 mt-2">
                <button type="button" onClick={closeEdit} className="liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="liquid-btn-primary px-5 py-2 rounded-xl text-white font-bold text-xs disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Floating Action Menu */}
      {openActionMenu && (() => {
        const participant = participants.find((item) => item.id === openActionMenu.participantId);
        if (!participant) return null;
        return (
          <div
            data-actions-menu="true"
            className="fixed w-48 rounded-2xl liquid-glass-strong !border-slate-900/15 z-[9999] overflow-hidden"
            style={{
              top: openActionMenu.top,
              left: openActionMenu.left,
              transform: openActionMenu.openUp ? 'translate(-100%, -100%)' : 'translateX(-100%)',
            }}
          >
            <button
              onClick={() => {
                setReviewingParticipant(participant);
                setOpenActionMenu(null);
              }}
              className="w-full px-3.5 py-2.5 text-left text-xs text-amber-800 hover:bg-amber-500/10 flex items-center gap-2 border-b border-slate-900/10 font-medium"
            >
              <Eye size={13} className="text-amber-600" /> Review Step 1 Form
            </button>
            {participant.approval_status === 'pending_approval' && (
              <>
                <button
                  onClick={() => {
                    handleApproveRegistration(participant);
                    setOpenActionMenu(null);
                  }}
                  disabled={resolvingApprovalId === participant.id}
                  className="w-full px-3.5 py-2 text-left text-xs text-emerald-700 hover:bg-emerald-500/10 flex items-center gap-2 border-b border-slate-900/10 disabled:opacity-50"
                >
                  <Check size={13} className="text-emerald-600" /> Approve Step 1
                </button>
                <button
                  onClick={() => {
                    handleOpenRejectModal(participant);
                    setOpenActionMenu(null);
                  }}
                  disabled={resolvingApprovalId === participant.id}
                  className="w-full px-3.5 py-2 text-left text-xs text-red-700 hover:bg-red-500/10 flex items-center gap-2 border-b border-slate-900/10 disabled:opacity-50"
                >
                  <X size={13} className="text-red-600" /> Reject Step 1
                </button>
              </>
            )}
            {participant.approval_status === 'approved' && (
              <button
                onClick={() => {
                  handleResendApprovalEmail(participant);
                  setOpenActionMenu(null);
                }}
                disabled={resendingApprovalId === participant.id}
                className="w-full px-3.5 py-2 text-left text-xs text-blue-700 hover:bg-blue-500/10 flex items-center gap-2 border-b border-slate-900/10 disabled:opacity-50"
              >
                <Send size={13} className="text-blue-600" /> Resend Step 2 Link
              </button>
            )}
            {participant.payment_screenshot_url && (
              <button
                onClick={() => {
                  setScreenshotModal({
                    url: participant.payment_screenshot_url!,
                    title: `${participant.full_name} - Payment Screenshot`,
                    participant,
                  });
                  setOpenActionMenu(null);
                }}
                className="w-full px-3.5 py-2 text-left text-xs text-blue-700 hover:bg-blue-500/10 flex items-center gap-2 border-b border-slate-900/10"
              >
                <Image size={13} className="text-blue-600" /> View Screenshot
              </button>
            )}
            <button
              onClick={() => {
                handlePaymentVerification(participant.id, participant.payment_verified);
                setOpenActionMenu(null);
              }}
              disabled={verifyingPayment === participant.id}
              className="w-full px-3.5 py-2 text-left text-xs text-blue-700 hover:bg-blue-500/10 flex items-center gap-2 border-b border-slate-900/10 disabled:opacity-50"
            >
              <ShieldCheck size={13} className="text-blue-600" /> {participant.payment_verified ? 'Unverify Payment' : 'Verify Payment'}
            </button>
            <button
              onClick={() => {
                handleSendRegistrationDetails(participant);
                setOpenActionMenu(null);
              }}
              disabled={sendingConfirmationId === participant.id}
              className="w-full px-3.5 py-2 text-left text-xs text-sky-700 hover:bg-sky-500/10 flex items-center gap-2 border-b border-slate-900/10 disabled:opacity-50"
            >
              <Mail size={13} className="text-sky-600" /> {sendingConfirmationId === participant.id ? 'Sending...' : 'Send Details Email'}
            </button>
            <button
              onClick={() => {
                handleCheckIn(participant.id, participant.check_in_status);
                setOpenActionMenu(null);
              }}
              disabled={checkingIn === participant.id}
              className="w-full px-3.5 py-2 text-left text-xs text-emerald-700 hover:bg-emerald-500/10 flex items-center gap-2 disabled:opacity-50 border-b border-slate-900/10 font-medium"
            >
              <UserCheck size={13} className="text-emerald-600" /> {participant.check_in_status ? 'Undo Check-in' : 'Check In'}
            </button>
            <button
              onClick={() => {
                openParticipantQr(participant);
                setOpenActionMenu(null);
              }}
              className="w-full px-3.5 py-2 text-left text-xs text-violet-700 hover:bg-violet-500/10 flex items-center gap-2 border-b border-slate-900/10"
            >
              <QrCode size={13} className="text-violet-600" /> Show Pass QR
            </button>
            <button
              onClick={() => {
                openEdit(participant);
                setOpenActionMenu(null);
              }}
              className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-900/[0.06] flex items-center gap-2 border-b border-slate-900/10"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={() => {
                handleDelete(participant);
                setOpenActionMenu(null);
              }}
              disabled={deletingId === participant.id}
              className="w-full px-3.5 py-2 text-left text-xs text-red-700 hover:bg-red-500/10 flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 size={13} className="text-red-600" /> Delete
            </button>
          </div>
        );
      })()}

      {/* Floating Panel Dropdowns (Quick Tools / Data Hub) */}
      {openPanelMenu && (
        <div
          data-dashboard-menu="true"
          className="fixed rounded-2xl liquid-glass-strong !border-slate-900/15 z-[9999] overflow-hidden"
          style={{
            top: openPanelMenu.top,
            left: openPanelMenu.left,
            width: openPanelMenu.width,
            transform: openPanelMenu.openUp ? 'translateY(-100%)' : undefined,
          }}
        >
          {openPanelMenu.menu === 'shortcuts' && (
            <>
              <Link
                to="/admin/scan"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-emerald-700 hover:bg-emerald-500/10 flex items-center gap-2 font-bold"
              >
                <QrCode size={14} /> Pass QR Scanner (Desk Mode)
              </Link>
              <Link
                to="/admin/management-team"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 hover:bg-slate-900/[0.06] flex items-center gap-2 border-t border-slate-900/10"
              >
                <ShieldCheck size={14} className="text-indigo-600" /> Management Team
              </Link>
              <Link
                to="/admin/upload"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 hover:bg-slate-900/[0.06] flex items-center gap-2 border-t border-slate-900/10"
              >
                <Upload size={14} className="text-blue-600" /> Media Upload
              </Link>
              <Link
                to="/admin/winners"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 hover:bg-slate-900/[0.06] flex items-center gap-2 border-t border-slate-900/10"
              >
                <Trophy size={14} className="text-amber-600" /> Winners Manager
              </Link>
              <Link
                to="/admin/bulk-passes"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 hover:bg-slate-900/[0.06] flex items-center gap-2 border-t border-slate-900/10"
              >
                <Download size={14} className="text-fuchsia-600" /> Bulk Pass Download
              </Link>
              <Link
                to="/admin/event-settings"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 hover:bg-slate-900/[0.06] flex items-center gap-2 border-t border-slate-900/10"
              >
                <CalendarClock size={14} className="text-teal-600" /> Event Settings
              </Link>
              {currentUser?.role === 'super_admin' && (
                <>
                  <Link
                    to="/admin/control"
                    onClick={() => setOpenPanelMenu(null)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-blue-700 hover:bg-blue-500/10 flex items-center gap-2 border-t border-blue-500/20 font-bold"
                  >
                    <ShieldAlert size={14} /> Super Control Center
                  </Link>
                  <Link
                    to="/admin/control/admins"
                    onClick={() => setOpenPanelMenu(null)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-amber-800 hover:bg-amber-500/10 flex items-center gap-2 border-t border-slate-900/10 font-bold"
                  >
                    <Users size={14} /> Manage Admins
                  </Link>
                </>
              )}
            </>
          )}

          {openPanelMenu.menu === 'data' && (
            <>
              <button
                onClick={() => {
                  setOpenPanelMenu(null);
                  handleExport('csv');
                }}
                disabled={transferLoading !== null}
                className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm text-emerald-700 hover:bg-emerald-500/10 flex items-center gap-2 disabled:opacity-50"
              >
                <Download size={14} className="text-emerald-600" /> Export All CSV
              </button>
              <button
                onClick={() => {
                  setOpenPanelMenu(null);
                  handleExport('xlsx');
                }}
                disabled={transferLoading !== null}
                className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm text-blue-700 hover:bg-blue-500/10 flex items-center gap-2 border-t border-slate-900/10 disabled:opacity-50"
              >
                <Download size={14} className="text-blue-600" /> Export Excel (.xlsx)
              </button>
              <button
                onClick={() => {
                  setOpenPanelMenu(null);
                  handleImportClick();
                }}
                disabled={transferLoading !== null}
                className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm text-indigo-700 hover:bg-indigo-500/10 flex items-center gap-2 border-t border-slate-900/10 disabled:opacity-50"
              >
                <FileUp size={14} className="text-indigo-600" /> Bulk Import CSV/Excel
              </button>
              <button
                onClick={() => {
                  setOpenPanelMenu(null);
                  fetchData();
                  fetchPaymentSummary();
                }}
                className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm text-slate-800 hover:bg-slate-900/[0.06] flex items-center gap-2 border-t border-slate-900/10"
              >
                <RefreshCw size={14} className="text-emerald-600" /> Refresh All Records
              </button>
            </>
          )}
        </div>
      )}

      {/* Participant QR Entry Pass Modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm liquid-glass-strong rounded-3xl overflow-hidden text-center">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-900/10 bg-slate-900/[0.04]">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <QrCode size={16} className="text-sky-600" />
                {qrModal.title}
              </h3>
              <button onClick={() => setQrModal(null)} className="liquid-icon-bubble !w-8 !h-8 !rounded-xl text-slate-600 hover:text-slate-900">
                <X size={16} />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-white p-3 rounded-2xl w-fit mx-auto shadow-lg border border-slate-900/10">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrModal.value)}`}
                  alt="QR Code"
                  className="w-60 h-60 object-contain rounded-lg"
                />
              </div>
              <p className="mt-4 text-xs font-mono text-slate-700 break-all bg-slate-900/[0.04] backdrop-blur-md p-2.5 rounded-xl border border-slate-900/10">
                {qrModal.value}
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Status & Email Dialog */}
      {statusDialog && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md liquid-glass-strong rounded-3xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-900/10 flex items-center justify-between bg-slate-900/[0.04]">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">{statusDialog.title}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Admin Notification System</p>
              </div>
              {statusDialog.tone !== 'loading' && (
                <button
                  onClick={() => setStatusDialog(null)}
                  className="liquid-icon-bubble !w-8 !h-8 !rounded-xl text-slate-600 hover:text-slate-900"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-start gap-3.5">
                <div
                  className={`liquid-icon-bubble !w-10 !h-10 !rounded-2xl shrink-0 ${
                    statusDialog.tone === 'loading'
                      ? 'border-sky-500/35 text-sky-600'
                      : statusDialog.tone === 'success'
                        ? 'border-emerald-500/35 text-emerald-600'
                        : 'border-red-400/35 text-red-600'
                  }`}
                >
                  {statusDialog.tone === 'loading' ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : statusDialog.tone === 'success' ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <AlertCircle size={18} />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pt-1">{statusDialog.message}</p>
              </div>

              {statusDialog.tone !== 'loading' && (
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={() => setStatusDialog(null)}
                    className="liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Review Step 1 Registration Modal */}
      {reviewingParticipant && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl liquid-glass-strong rounded-3xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-900/10 flex items-center justify-between bg-slate-900/[0.04]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">Review Step 1 Registration</h3>
                  {reviewingParticipant.registration_id && (
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-sky-500/12 text-sky-800 font-bold border border-sky-500/35">
                      {reviewingParticipant.registration_id}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">Verify participant information before authorizing Step 2 payment access</p>
              </div>
              <button
                onClick={() => setReviewingParticipant(null)}
                className="liquid-icon-bubble !w-8 !h-8 !rounded-xl text-slate-600 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* WhatsApp Community Alert Box */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 backdrop-blur-md border border-emerald-500/35 flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-700 shrink-0">
                  <Phone size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">WhatsApp Contact (Must be in Official Group)</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-base sm:text-lg font-mono font-bold text-slate-900">{reviewingParticipant.whatsapp_number}</span>
                    <a
                      href={`https://wa.me/${reviewingParticipant.whatsapp_number.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1 transition-colors"
                    >
                      <Phone size={12} /> Check on WhatsApp
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Confirm that this phone number is a member in our Ignite 2.O WhatsApp community before approving.
                  </p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm bg-slate-900/[0.04] backdrop-blur-md p-4 rounded-2xl border border-slate-900/10">
                <div>
                  <span className="text-[11px] text-slate-500 block">Full Name</span>
                  <span className="font-semibold text-slate-900">{reviewingParticipant.full_name}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Email Address</span>
                  <span className="font-mono text-slate-800">{reviewingParticipant.email}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Roll / Enrolment No</span>
                  <span className="font-mono text-slate-900 font-semibold">{reviewingParticipant.roll_number}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Branch & Academic Year</span>
                  <span className="text-slate-800">{reviewingParticipant.branch} • {reviewingParticipant.year}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-[11px] text-slate-500 block">Skills / Interests</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reviewingParticipant.skills.length > 0 ? (
                      reviewingParticipant.skills.map((skill, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-lg bg-slate-900/[0.06] border border-slate-900/10 text-xs text-slate-800">
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 text-xs italic">None listed</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2 Payment Verification Box */}
              <div className="p-4 rounded-2xl bg-slate-900/[0.04] backdrop-blur-md border border-sky-500/35 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-sky-600" />
                    <p className="font-semibold text-slate-900 text-xs uppercase tracking-wider">
                      Step 2: Payment Details & Screenshot
                    </p>
                  </div>
                  <div>
                    {reviewingParticipant.payment_status === 'approved' || reviewingParticipant.payment_verified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/35 text-emerald-700">
                        <CheckCircle2 size={11} /> Approved
                      </span>
                    ) : reviewingParticipant.payment_status === 'rejected' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/12 border border-red-400/35 text-red-700">
                        <XCircle size={11} /> Rejected
                      </span>
                    ) : (reviewingParticipant.payment_screenshot_url || reviewingParticipant.account_holder_name || reviewingParticipant.payment_id) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 border border-amber-500/35 text-amber-800 animate-pulse">
                        <Clock size={11} /> Pending Review
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">Awaiting Submission</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Academic Year:</span>
                    <span className="text-slate-900 font-medium">{reviewingParticipant.year || '1st Year'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Applicable Fee:</span>
                    <span className="text-emerald-700 font-bold">
                      INR {reviewingParticipant.payment_amount != null ? reviewingParticipant.payment_amount : (reviewingParticipant.year === '2nd Year' ? 699 : 599)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Account Holder:</span>
                    <span className="text-slate-900 font-medium">{reviewingParticipant.account_holder_name || 'N/A'}</span>
                  </div>
                  <div className="sm:col-span-3">
                    <span className="text-slate-500 block text-[11px]">Payment Reference / UTR ID:</span>
                    <span className="font-mono text-sky-700 font-medium">{reviewingParticipant.payment_id || 'N/A'}</span>
                  </div>
                </div>

                {reviewingParticipant.payment_screenshot_url && (
                  <div className="pt-2 border-t border-slate-900/10 flex items-center gap-4">
                    <img
                      src={reviewingParticipant.payment_screenshot_url}
                      alt="Payment Preview"
                      className="w-16 h-16 object-cover rounded-xl border border-slate-900/15 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() =>
                        setScreenshotModal({
                          url: reviewingParticipant.payment_screenshot_url!,
                          title: `${reviewingParticipant.full_name} - Payment Screenshot`,
                          participant: reviewingParticipant,
                        })
                      }
                    />
                    <div>
                      <p className="text-xs font-medium text-slate-800">Payment Screenshot Attached</p>
                      <button
                        type="button"
                        onClick={() =>
                          setScreenshotModal({
                            url: reviewingParticipant.payment_screenshot_url!,
                            title: `${reviewingParticipant.full_name} - Payment Screenshot`,
                            participant: reviewingParticipant,
                          })
                        }
                        className="mt-1 liquid-btn-glass px-3 py-1 rounded-lg text-sky-700 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Image size={12} /> View Screenshot
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 border-t border-slate-900/10 bg-slate-900/[0.04] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setReviewingParticipant(null)}
                className="liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Close
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {((reviewingParticipant.approval_status || 'approved') === 'pending_approval') && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleOpenRejectModal(reviewingParticipant)}
                      disabled={resolvingApprovalId === reviewingParticipant.id}
                      className="px-4 py-2 rounded-xl bg-red-500/12 hover:bg-red-500/20 text-red-700 border border-red-400/35 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-all"
                    >
                      <X size={14} /> Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveRegistration(reviewingParticipant)}
                      disabled={resolvingApprovalId === reviewingParticipant.id}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-all"
                    >
                      <Check size={14} />
                      {resolvingApprovalId === reviewingParticipant.id ? 'Approving...' : 'Approve & Unlock Step 2'}
                    </button>
                  </>
                )}

                {((reviewingParticipant.approval_status || 'approved') === 'approved') && (
                  <button
                    type="button"
                    onClick={() => handleResendApprovalEmail(reviewingParticipant)}
                    disabled={resendingApprovalId === reviewingParticipant.id}
                    className="liquid-btn-primary px-4 py-2 rounded-xl text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send size={13} />
                    {resendingApprovalId === reviewingParticipant.id ? 'Sending...' : 'Resend Step 2 Link Email'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Reject Registration Modal */}
      {rejectModalParticipant && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-md z-[10001] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md liquid-glass-strong !border-red-400/35 rounded-3xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-red-400/25 bg-red-500/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="liquid-icon-bubble !w-8 !h-8 !rounded-xl border-red-400/35 text-red-700">
                  <XCircle size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">Reject Step 1 Registration</h3>
                  <p className="text-xs text-slate-600">{rejectModalParticipant.full_name}</p>
                </div>
              </div>
              <button
                onClick={() => setRejectModalParticipant(null)}
                className="liquid-icon-bubble !w-8 !h-8 !rounded-xl text-slate-600 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                Rejecting will lock the participant out of Step 2. Specify a reason that will be emailed to the student.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Rejection Reason (Recommended)
                </label>
                <textarea
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="e.g. Phone number not present in official Ignite 2.O WhatsApp community..."
                  rows={3}
                  className="liquid-input w-full !border-red-400/35 focus:!border-red-400 px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-red-500/10 backdrop-blur-sm border border-red-400/25 text-[11px] text-red-800">
                Notification email will be dispatched to <span className="font-mono text-slate-900 font-semibold">{rejectModalParticipant.email}</span>.
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-900/10 bg-slate-900/[0.04] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalParticipant(null)}
                className="liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectRegistration}
                disabled={resolvingApprovalId === rejectModalParticipant.id}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-all"
              >
                <X size={14} />
                {resolvingApprovalId === rejectModalParticipant.id ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Payment Screenshot Viewer Modal */}
      {screenshotModal && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-md z-[10002] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl liquid-glass-strong rounded-3xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-5 py-3.5 border-b border-slate-900/10 flex items-center justify-between bg-slate-900/[0.04]">
              <div className="flex items-center gap-2">
                <Image size={18} className="text-sky-600" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-xs sm:max-w-md">
                  {screenshotModal.title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={screenshotModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="liquid-btn-glass px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1"
                >
                  <ExternalLink size={12} /> Open Tab
                </a>
                <button
                  onClick={() => setScreenshotModal(null)}
                  className="liquid-icon-bubble !w-8 !h-8 !rounded-xl text-slate-600 hover:text-slate-900"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-900/[0.06] backdrop-blur-sm min-h-[300px]">
              <img
                src={screenshotModal.url}
                alt="Payment Screenshot Full"
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-xl border border-slate-900/15"
              />
            </div>

            {screenshotModal.participant && (
              <div className="px-5 py-3 border-t border-slate-900/10 bg-slate-900/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Account Holder: </span>
                  <span className="text-slate-900 font-medium">{screenshotModal.participant.account_holder_name || 'N/A'}</span>
                  <span className="text-slate-500 ml-3">Ref ID: </span>
                  <span className="text-sky-700 font-mono font-medium">{screenshotModal.participant.payment_id || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenRejectPaymentModal(screenshotModal.participant!)}
                    disabled={resolvingPaymentId === screenshotModal.participant.id}
                    className="px-3 py-1.5 rounded-xl bg-red-500/12 hover:bg-red-500/20 text-red-700 border border-red-400/35 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50 transition-all"
                  >
                    <X size={13} /> Reject Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprovePayment(screenshotModal.participant!)}
                    disabled={resolvingPaymentId === screenshotModal.participant.id}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1 shadow-sm disabled:opacity-50 transition-all"
                  >
                    <Check size={13} />
                    {resolvingPaymentId === screenshotModal.participant.id ? 'Approving...' : 'Approve Payment'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Reject Payment Modal */}
      {rejectPaymentModalParticipant && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-md z-[10002] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md liquid-glass-strong !border-red-400/35 rounded-3xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-red-400/25 bg-red-500/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="liquid-icon-bubble !w-8 !h-8 !rounded-xl border-red-400/35 text-red-700">
                  <XCircle size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">Reject Payment Verification</h3>
                  <p className="text-xs text-slate-600">{rejectPaymentModalParticipant.full_name}</p>
                </div>
              </div>
              <button
                onClick={() => setRejectPaymentModalParticipant(null)}
                className="liquid-icon-bubble !w-8 !h-8 !rounded-xl text-slate-600 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                Rejecting will mark the participant's payment as Rejected. Specify a reason so the participant can resubmit valid payment proof.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Rejection Reason (Recommended)
                </label>
                <textarea
                  value={rejectPaymentReasonInput}
                  onChange={(e) => setRejectPaymentReasonInput(e.target.value)}
                  placeholder="e.g. UTR transaction ID not found in bank statement, blurred screenshot..."
                  rows={3}
                  className="liquid-input w-full !border-red-400/35 focus:!border-red-400 px-3 py-2.5 text-xs sm:text-sm"
                />
              </div>

              {rejectPaymentModalParticipant.account_holder_name && (
                <div className="text-xs text-slate-600">
                  Account Holder: <span className="text-slate-900 font-medium">{rejectPaymentModalParticipant.account_holder_name}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-900/10 bg-slate-900/[0.04] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectPaymentModalParticipant(null)}
                className="liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectPayment}
                disabled={resolvingPaymentId === rejectPaymentModalParticipant.id}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-all"
              >
                <X size={14} />
                {resolvingPaymentId === rejectPaymentModalParticipant.id ? 'Rejecting...' : 'Confirm Reject Payment'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Live Pass QR Camera Scanner Modal */}
      <QrCheckinScannerModal
        isOpen={scannerModalOpen}
        onClose={() => setScannerModalOpen(false)}
        onCheckInSuccess={() => fetchData()}
        knownParticipants={participants}
      />
    </div>
  );
}
