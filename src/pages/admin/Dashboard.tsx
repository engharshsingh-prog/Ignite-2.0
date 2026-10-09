import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  Search,
  Mail,
  AlertCircle,
  XCircle,
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
  Copy,
  Link2,
  Power,
  QrCode,
  MoreVertical,
  CalendarClock,
} from 'lucide-react';
import { authHeaders } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getErrorMessage, readJsonSafe } from '../../lib/http';

interface Participant {
  id: number;
  full_name: string;
  roll_number: string;
  branch: string;
  email: string;
  year: string;
  whatsapp_number: string;
  skills: string[];
  payment_id: string;
  payment_verified: boolean;
  check_in_status: boolean;
  check_in_time: string | null;
  registered_at: string;
}

interface Stats {
  total: number;
  checkedIn: number;
  notCheckedIn: number;
  branchCounts: Record<string, number>;
  yearCounts: Record<string, number>;
}

interface ShareAccess {
  enabled: boolean;
  token: string;
  share_path: string;
  share_url: string;
  updated_at: string | null;
}

interface ValidationHandlerAccess {
  enabled: boolean;
  token: string;
  share_path: string;
  share_url: string;
  updated_at: string | null;
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
  menu: 'shortcuts' | 'data' | 'share' | 'handler';
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
}

function toFormData(participant: Participant): ParticipantForm {
  return {
    email: participant.email,
    full_name: participant.full_name,
    roll_number: participant.roll_number,
    branch: participant.branch,
    year: participant.year,
    skills: participant.skills.join(', '),
    payment_id: participant.payment_id,
    whatsapp_number: participant.whatsapp_number,
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
  const [shareAccess, setShareAccess] = useState<ShareAccess | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [handlerAccess, setHandlerAccess] = useState<ValidationHandlerAccess | null>(null);
  const [handlerLoading, setHandlerLoading] = useState(false);
  const [handlerMessage, setHandlerMessage] = useState('');
  const [handlerPassword, setHandlerPassword] = useState('');
  const [registrationControl, setRegistrationControl] = useState<RegistrationControl | null>(null);
  const [registrationToggleLoading, setRegistrationToggleLoading] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<ActionMenuState | null>(null);
  const [openPanelMenu, setOpenPanelMenu] = useState<PanelMenuState | null>(null);
  const [qrModal, setQrModal] = useState<{ title: string; value: string } | null>(null);
  const [statusDialog, setStatusDialog] = useState<StatusDialogState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, branch, branches.length]);

  const fetchShareAccess = useCallback(async () => {
    try {
      const res = await fetch('/api/participants-share', { headers: authHeaders() });
      const data = await readJsonSafe<ShareAccess & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to load share access'));
      setShareAccess(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

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

  const fetchHandlerAccess = useCallback(async () => {
    try {
      const res = await fetch('/api/validation-handler-access', { headers: authHeaders() });
      const data = await readJsonSafe<ValidationHandlerAccess & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to load validation handler access'));
      setHandlerAccess(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchShareAccess();
    fetchHandlerAccess();
    fetchRegistrationControl();
  }, [fetchData, fetchHandlerAccess, fetchRegistrationControl, fetchShareAccess]);

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
    const confirmDelete = window.confirm(`Delete registration for ${participant.full_name}? This cannot be undone.`);
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

  const checkinPct = stats ? Math.round((stats.checkedIn / (stats.total || 1)) * 100) : 0;

  const downloadBlob = (blob: Blob, fallbackName: string, contentDisposition: string | null) => {
    const match = contentDisposition?.match(/filename=\"?([^\"]+)\"?/i);
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

  const buildShareLink = () => {
    if (!shareAccess?.token) return '';
    if (shareAccess.share_url) {
      return /^https?:\/\//i.test(shareAccess.share_url) ? shareAccess.share_url : `${window.location.origin}${shareAccess.share_url}`;
    }
    return `${window.location.origin}/records/${shareAccess.token}`;
  };

  const handleShareAccessUpdate = async (payload: { enabled?: boolean; regenerate?: boolean }, successMessage: string) => {
    setShareLoading(true);
    setShareMessage('');
    try {
      const res = await fetch('/api/participants-share', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await readJsonSafe<ShareAccess & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update shared access'));
      setShareAccess(data);
      setShareMessage(successMessage);
    } catch (err) {
      setShareMessage(err instanceof Error ? err.message : 'Failed to update shared access');
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShareLink = async () => {
    const link = buildShareLink();
    if (!link) {
      setShareMessage('Share link is not available yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setShareMessage('Private share link copied.');
    } catch {
      setShareMessage(link);
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

  const openShareQr = () => {
    const link = buildShareLink();
    if (!link) {
      setShareMessage('Share link is not available yet.');
      return;
    }
    setQrModal({ title: 'Shared View Access Link', value: link });
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

  const buildHandlerLink = () => {
    if (!handlerAccess?.token) return '';
    if (handlerAccess.share_url) {
      return /^https?:\/\//i.test(handlerAccess.share_url) ? handlerAccess.share_url : `${window.location.origin}${handlerAccess.share_url}`;
    }
    return `${window.location.origin}/validate/${handlerAccess.token}`;
  };

  const handleHandlerAccessUpdate = async (payload: { enabled?: boolean; regenerate?: boolean; password?: string }, successMessage: string) => {
    setHandlerLoading(true);
    setHandlerMessage('');
    try {
      const res = await fetch('/api/validation-handler-access', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await readJsonSafe<ValidationHandlerAccess & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update validation handler access'));
      setHandlerAccess(data);
      setHandlerMessage(successMessage);
      if (payload.password) setHandlerPassword('');
    } catch (err) {
      setHandlerMessage(err instanceof Error ? err.message : 'Failed to update validation handler access');
    } finally {
      setHandlerLoading(false);
    }
  };

  const copyHandlerLink = async () => {
    const link = buildHandlerLink();
    if (!link) {
      setHandlerMessage('Validation handler link is not available yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setHandlerMessage('Validation handler link copied.');
    } catch {
      setHandlerMessage(link);
    }
  };

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col gap-4 mb-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-black">Admin Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">Ignite 2.O - Registration and Check-in Management</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              data-menu-trigger="true"
              onClick={(event) => togglePanelMenu(event, 'shortcuts', 180)}
              className="px-4 py-2 rounded-xl border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-500/15 to-violet-500/15 text-fuchsia-100 text-sm inline-flex items-center gap-2 hover:from-fuchsia-500/20 hover:to-violet-500/20 transition-colors"
            >
              <Link2 size={16} />
              Quick Links
              <ChevronDown size={14} className={`transition-transform ${openPanelMenu?.menu === 'shortcuts' ? 'rotate-180' : ''}`} />
            </button>
            <button
              data-menu-trigger="true"
              onClick={(event) => togglePanelMenu(event, 'data', 220)}
              disabled={transferLoading !== null}
              className="px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-100 text-sm inline-flex items-center gap-2 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              <Download size={16} />
              {transferLoading ? 'Working...' : 'Data Tools'}
              <ChevronDown size={14} className={`transition-transform ${openPanelMenu?.menu === 'data' ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleImportFile}
        />
        {transferMessage && <p className="mb-5 text-sm text-gray-300">{transferMessage}</p>}

        <div className="mb-8 p-5 rounded-2xl bg-[#191e1b]/90 border border-[#303a32]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-white font-semibold flex items-center gap-2"><Link2 size={16} className="text-blue-300" /> Shared View Access</p>
              <p className="text-sm text-gray-400 mt-1">Hidden by default. Only users with the private tokenized link can view registrations when enabled.</p>
              {shareAccess?.token && (
                <p className="text-xs text-gray-500 mt-2">Token: <span className="font-mono">{shareAccess.token.slice(0, 10)}...</span></p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                data-menu-trigger="true"
                onClick={(event) => togglePanelMenu(event, 'share', 220)}
                disabled={shareLoading}
                className="px-4 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-200 text-sm font-medium inline-flex items-center gap-2 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <Link2 size={14} />
                {shareLoading ? 'Updating...' : 'Access Options'}
                <ChevronDown size={14} className={`transition-transform ${openPanelMenu?.menu === 'share' ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
          {shareMessage && <p className="text-sm text-gray-300 mt-3">{shareMessage}</p>}
        </div>

        <div className="mb-8 p-5 rounded-2xl bg-[#191e1b]/90 border border-[#303a32]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-white font-semibold flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-300" /> Validation Handler Access</p>
              <p className="text-sm text-gray-400 mt-1">Hidden tokenized page for QR scan + quick search and payment/check-in handling.</p>
              {handlerAccess?.token && (
                <p className="text-xs text-gray-500 mt-2">Token: <span className="font-mono">{handlerAccess.token.slice(0, 10)}...</span></p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                data-menu-trigger="true"
                onClick={(event) => togglePanelMenu(event, 'handler', 200)}
                disabled={handlerLoading}
                className="px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm font-medium inline-flex items-center gap-2 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                <ShieldCheck size={14} />
                {handlerLoading ? 'Updating...' : 'Handler Options'}
                <ChevronDown size={14} className={`transition-transform ${openPanelMenu?.menu === 'handler' ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              value={handlerPassword}
              onChange={(e) => setHandlerPassword(e.target.value)}
              placeholder="Set/rotate handler page password"
              className="flex-1 bg-[#15152a] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400/50"
            />
            <button
              onClick={() => handleHandlerAccessUpdate({ password: handlerPassword }, 'Validation handler password updated.')}
              disabled={handlerLoading || handlerPassword.trim().length < 4}
              className="px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              Update Password
            </button>
          </div>

          {handlerMessage && <p className="text-sm text-gray-300 mt-3">{handlerMessage}</p>}
        </div>

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-2xl bg-[#191e1b]/90 border border-[#303a32]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Users size={18} className="text-blue-400" />
                </div>
                <span className="text-gray-400 text-sm">Total Registered</span>
              </div>
              <p className="text-3xl font-black">{stats.total}</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="p-5 rounded-2xl bg-[#191e1b]/90 border border-[#303a32]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <UserCheck size={18} className="text-emerald-400" />
                </div>
                <span className="text-gray-400 text-sm">Checked In</span>
              </div>
              <p className="text-3xl font-black text-emerald-400">{stats.checkedIn}</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-5 rounded-2xl bg-[#191e1b]/90 border border-[#303a32]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <XCircle size={18} className="text-red-400" />
                </div>
                <span className="text-gray-400 text-sm">Pending</span>
              </div>
              <p className="text-3xl font-black text-red-400">{stats.notCheckedIn}</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="p-5 rounded-2xl bg-[#191e1b]/90 border border-[#303a32]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-olive-500/20 flex items-center justify-center">
                  <Power size={18} className={registrationControl?.enabled ? 'text-emerald-300' : 'text-red-300'} />
                </div>
                <span className="text-gray-400 text-sm">Registrations</span>
              </div>
              <p className={`text-xl font-black ${registrationControl?.enabled ? 'text-emerald-300' : 'text-red-300'}`}>
                {registrationControl?.enabled ? 'Open' : 'Closed'}
              </p>
              <button
                onClick={toggleRegistrations}
                disabled={registrationToggleLoading}
                className={`mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  registrationControl?.enabled
                    ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                }`}
              >
                {registrationToggleLoading ? 'Updating...' : registrationControl?.enabled ? 'Disable' : 'Enable'}
              </button>
            </motion.div>
          </div>
        )}

        {stats && (
          <div className="mb-8 p-5 rounded-2xl bg-[#191e1b]/90 border border-[#303a32]">
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-400">Check-in Progress</span>
              <span className="text-white font-semibold">
                {stats.checkedIn} / {stats.total} students arrived
              </span>
            </div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${checkinPct}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, roll no, or email..."
              className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]"
            />
          </div>
          <div className="relative">
            <select
              value={branch}
              onChange={e => setBranch(e.target.value)}
              className="bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 pr-10 text-white focus:outline-none focus:border-[#3b82f6] appearance-none"
            >
              <option value="all">All Branches</option>
              {branches.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner text="Loading participants..." />
        ) : (
          <div className="rounded-2xl border border-white/10 overflow-visible mb-8">
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Participant</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Roll No</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Branch</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Year</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Payment</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {participants.map(p => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#718044] flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {p.full_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-white text-sm">{p.full_name}</p>
                            <p className="text-gray-500 text-xs">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="font-mono text-sm text-gray-300">{p.roll_number}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-300 text-xs font-medium">{p.branch}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-gray-400 text-sm">{p.year}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {p.payment_verified ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-olive-500/10 border border-olive-500/30 text-olive-300 text-xs font-semibold">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.check_in_status ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-emerald-400 text-xs font-medium">Checked In</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-gray-600" />
                            <span className="text-gray-500 text-xs">Pending</span>
                          </div>
                        )}
                        {p.check_in_time && <p className="text-gray-600 text-xs">{new Date(p.check_in_time).toLocaleTimeString()}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block text-left">
                          <button
                            data-action-trigger="true"
                            onClick={(event) => toggleActionMenu(event, p.id)}
                            className="w-9 h-9 rounded-lg border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10 inline-flex items-center justify-center"
                            title="Actions"
                          >
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {participants.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Users size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No participants found</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {editingParticipant && editForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl bg-[#171127] border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Edit Registration</h3>
              <button onClick={closeEdit} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Full Name</label>
                <input
                  value={editForm.full_name}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, full_name: e.target.value } : prev))}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, email: e.target.value } : prev))}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Roll Number</label>
                <input
                  value={editForm.roll_number}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, roll_number: e.target.value } : prev))}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">WhatsApp Number</label>
                <input
                  value={editForm.whatsapp_number}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, whatsapp_number: e.target.value } : prev))}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Branch</label>
                <input
                  value={editForm.branch}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, branch: e.target.value } : prev))}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Year</label>
                <select
                  value={editForm.year}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, year: e.target.value } : prev))}
                  className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Payment ID</label>
                <input
                  value={editForm.payment_id}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, payment_id: e.target.value } : prev))}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Skills (comma-separated)</label>
                <input
                  value={editForm.skills}
                  onChange={e => setEditForm(prev => (prev ? { ...prev, skills: e.target.value } : prev))}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {editError && <p className="md:col-span-2 text-sm text-red-400">{editError}</p>}

              <div className="md:col-span-2 flex justify-end gap-3 mt-1">
                <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-xl border border-white/20 text-gray-300 hover:bg-white/10">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 text-white font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {openActionMenu && (() => {
        const participant = participants.find((item) => item.id === openActionMenu.participantId);
        if (!participant) return null;
        return (
          <div
            data-actions-menu="true"
            className="fixed w-44 rounded-xl border border-[#2a2a4a] bg-[#121225] shadow-xl z-[9999] overflow-hidden"
            style={{
              top: openActionMenu.top,
              left: openActionMenu.left,
              transform: openActionMenu.openUp ? 'translate(-100%, -100%)' : 'translateX(-100%)',
            }}
          >
            <button
              onClick={() => {
                handleSendRegistrationDetails(participant);
                setOpenActionMenu(null);
              }}
              disabled={sendingConfirmationId === participant.id}
              className="w-full px-3 py-2 text-left text-xs text-sky-200 hover:bg-sky-500/10 flex items-center gap-2 border-b border-white/5 disabled:opacity-50"
            >
              <Mail size={13} /> {sendingConfirmationId === participant.id ? 'Sending Details...' : 'Send Details'}
            </button>
            <button
              onClick={() => {
                handlePaymentVerification(participant.id, participant.payment_verified);
                setOpenActionMenu(null);
              }}
              disabled={verifyingPayment === participant.id}
              className="w-full px-3 py-2 text-left text-xs text-blue-200 hover:bg-blue-500/10 flex items-center gap-2 disabled:opacity-50"
            >
              <ShieldCheck size={13} /> {participant.payment_verified ? 'Unverify Pay' : 'Verify Pay'}
            </button>
            <button
              onClick={() => {
                handleCheckIn(participant.id, participant.check_in_status);
                setOpenActionMenu(null);
              }}
              disabled={checkingIn === participant.id}
              className="w-full px-3 py-2 text-left text-xs text-emerald-200 hover:bg-emerald-500/10 flex items-center gap-2 disabled:opacity-50 border-t border-white/5"
            >
              <UserCheck size={13} /> {participant.check_in_status ? 'Undo Check-in' : 'Check In'}
            </button>
            <button
              onClick={() => {
                openParticipantQr(participant);
                setOpenActionMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-xs text-violet-200 hover:bg-violet-500/10 flex items-center gap-2 border-t border-white/5"
            >
              <QrCode size={13} /> Show QR
            </button>
            <button
              onClick={() => {
                openEdit(participant);
                setOpenActionMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-xs text-indigo-200 hover:bg-indigo-500/10 flex items-center gap-2 border-t border-white/5"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={() => {
                handleDelete(participant);
                setOpenActionMenu(null);
              }}
              disabled={deletingId === participant.id}
              className="w-full px-3 py-2 text-left text-xs text-red-200 hover:bg-red-500/10 flex items-center gap-2 border-t border-white/5 disabled:opacity-50"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        );
      })()}

      {openPanelMenu && (
        <div
          data-dashboard-menu="true"
          className="fixed rounded-xl border border-[#2a2a4a] bg-[#121225] shadow-xl z-[9999] overflow-hidden"
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
                to="/admin/management-team"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3 py-2.5 text-sm text-indigo-200 hover:bg-indigo-500/10 flex items-center gap-2"
              >
                <ShieldCheck size={14} /> Management Team
              </Link>
              <Link
                to="/admin/upload"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3 py-2.5 text-sm text-blue-200 hover:bg-blue-500/10 flex items-center gap-2 border-t border-white/5"
              >
                <Upload size={14} /> Media Upload
              </Link>
              <Link
                to="/admin/winners"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3 py-2.5 text-sm text-olive-200 hover:bg-olive-500/10 flex items-center gap-2 border-t border-white/5"
              >
                <Trophy size={14} /> Winners Manager
              </Link>
              <Link
                to="/admin/bulk-passes"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3 py-2.5 text-sm text-fuchsia-200 hover:bg-fuchsia-500/10 flex items-center gap-2 border-t border-white/5"
              >
                <Download size={14} /> Bulk Pass Download
              </Link>
              <Link
                to="/admin/event-settings"
                onClick={() => setOpenPanelMenu(null)}
                className="w-full px-3 py-2.5 text-sm text-emerald-200 hover:bg-emerald-500/10 flex items-center gap-2 border-t border-white/5"
              >
                <CalendarClock size={14} /> Event Settings
              </Link>
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
                className="w-full px-3 py-2.5 text-left text-sm text-emerald-200 hover:bg-emerald-500/10 flex items-center gap-2 disabled:opacity-50"
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                onClick={() => {
                  setOpenPanelMenu(null);
                  handleExport('xlsx');
                }}
                disabled={transferLoading !== null}
                className="w-full px-3 py-2.5 text-left text-sm text-blue-200 hover:bg-blue-500/10 flex items-center gap-2 border-t border-white/5 disabled:opacity-50"
              >
                <Download size={14} /> Export Excel
              </button>
              <button
                onClick={() => {
                  setOpenPanelMenu(null);
                  handleImportClick();
                }}
                disabled={transferLoading !== null}
                className="w-full px-3 py-2.5 text-left text-sm text-indigo-200 hover:bg-indigo-500/10 flex items-center gap-2 border-t border-white/5 disabled:opacity-50"
              >
                <FileUp size={14} /> Import CSV/Excel
              </button>
              <button
                onClick={() => {
                  setOpenPanelMenu(null);
                  fetchData();
                }}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-white/10 flex items-center gap-2 border-t border-white/5"
              >
                <RefreshCw size={14} /> Refresh Data
              </button>
            </>
          )}

          {openPanelMenu.menu === 'share' && (
            <>
              <button
                onClick={() => {
                  handleShareAccessUpdate(
                    { enabled: !shareAccess?.enabled },
                    shareAccess?.enabled ? 'Shared access disabled.' : 'Shared access enabled.'
                  );
                  setOpenPanelMenu(null);
                }}
                disabled={shareLoading}
                className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 disabled:opacity-50 ${
                  shareAccess?.enabled
                    ? 'text-red-200 hover:bg-red-500/10'
                    : 'text-emerald-200 hover:bg-emerald-500/10'
                }`}
              >
                <Power size={14} /> {shareAccess?.enabled ? 'Disable Access' : 'Enable Access'}
              </button>
              <button
                onClick={() => {
                  handleShareAccessUpdate({ regenerate: true }, 'Share link regenerated. Old link is now revoked.');
                  setOpenPanelMenu(null);
                }}
                disabled={shareLoading}
                className="w-full px-3 py-2.5 text-left text-sm text-olive-200 hover:bg-olive-500/10 flex items-center gap-2 border-t border-white/5 disabled:opacity-50"
              >
                <RefreshCw size={14} /> Regenerate Link
              </button>
              <button
                onClick={() => {
                  handleCopyShareLink();
                  setOpenPanelMenu(null);
                }}
                disabled={shareLoading || !shareAccess?.enabled}
                className="w-full px-3 py-2.5 text-left text-sm text-blue-200 hover:bg-blue-500/10 flex items-center gap-2 border-t border-white/5 disabled:opacity-50"
              >
                <Copy size={14} /> Copy Link
              </button>
              <button
                onClick={() => {
                  openShareQr();
                  setOpenPanelMenu(null);
                }}
                disabled={shareLoading || !shareAccess?.enabled}
                className="w-full px-3 py-2.5 text-left text-sm text-violet-200 hover:bg-violet-500/10 flex items-center gap-2 border-t border-white/5 disabled:opacity-50"
              >
                <QrCode size={14} /> QR Link
              </button>
            </>
          )}

          {openPanelMenu.menu === 'handler' && (
            <>
              <button
                onClick={() => {
                  handleHandlerAccessUpdate(
                    { enabled: !handlerAccess?.enabled },
                    handlerAccess?.enabled ? 'Validation handler access disabled.' : 'Validation handler access enabled.'
                  );
                  setOpenPanelMenu(null);
                }}
                disabled={handlerLoading}
                className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 disabled:opacity-50 ${
                  handlerAccess?.enabled
                    ? 'text-red-200 hover:bg-red-500/10'
                    : 'text-emerald-200 hover:bg-emerald-500/10'
                }`}
              >
                <Power size={14} /> {handlerAccess?.enabled ? 'Disable Access' : 'Enable Access'}
              </button>
              <button
                onClick={() => {
                  handleHandlerAccessUpdate({ regenerate: true }, 'Validation handler link regenerated. Old link revoked.');
                  setOpenPanelMenu(null);
                }}
                disabled={handlerLoading}
                className="w-full px-3 py-2.5 text-left text-sm text-olive-200 hover:bg-olive-500/10 flex items-center gap-2 border-t border-white/5 disabled:opacity-50"
              >
                <RefreshCw size={14} /> Regenerate Link
              </button>
              <button
                onClick={() => {
                  copyHandlerLink();
                  setOpenPanelMenu(null);
                }}
                disabled={handlerLoading || !handlerAccess?.enabled}
                className="w-full px-3 py-2.5 text-left text-sm text-blue-200 hover:bg-blue-500/10 flex items-center gap-2 border-t border-white/5 disabled:opacity-50"
              >
                <Copy size={14} /> Copy Link
              </button>
            </>
          )}
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm bg-[#171127] border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-base font-bold text-white">{qrModal.title}</h3>
              <button onClick={() => setQrModal(null)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrModal.value)}`}
                alt="QR Code"
                className="w-64 h-64 mx-auto rounded-lg bg-white p-2"
              />
              <p className="mt-3 text-xs text-gray-400 break-all">{qrModal.value}</p>
            </div>
          </motion.div>
        </div>
      )}

      {statusDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-[#171127] border border-white/10 rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">{statusDialog.title}</h3>
                <p className="text-xs text-gray-400 mt-1">Admin email delivery status</p>
              </div>
              {statusDialog.tone !== 'loading' && (
                <button
                  onClick={() => setStatusDialog(null)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    statusDialog.tone === 'loading'
                      ? 'bg-sky-500/15 text-sky-300'
                      : statusDialog.tone === 'success'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-red-500/15 text-red-300'
                  }`}
                >
                  {statusDialog.tone === 'loading' ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : statusDialog.tone === 'success' ? (
                    <Mail size={18} />
                  ) : (
                    <AlertCircle size={18} />
                  )}
                </div>
                <p className="text-sm text-gray-200 leading-relaxed">{statusDialog.message}</p>
              </div>

              {statusDialog.tone !== 'loading' && (
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={() => setStatusDialog(null)}
                    className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-sm hover:bg-white/15"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}


