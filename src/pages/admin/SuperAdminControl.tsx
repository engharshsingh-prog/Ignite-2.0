import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Crown,
  Shield,
  ShieldCheck,
  Users,
  Clock,
  History,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  LogOut,
  Trash2,
  UserPlus,
  ArrowLeft,
  ExternalLink,
  Filter,
  AlertTriangle,
  X,
  KeyRound,
  Eye,
  EyeOff,
  UserCheck,
  Image,
  Layers,
  Lock,
  Unlock,
  UploadCloud,
} from 'lucide-react';
import { authHeaders, removeToken, checkAdminAuth, type AdminUser } from '../../lib/auth';
import { readJsonSafe, getErrorMessage } from '../../lib/http';

interface PendingRequest {
  id: string;
  user_id: number;
  email: string;
  ip: string;
  user_agent: string;
  status: string;
  requested_at: string;
  expires_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

interface AdminAccount {
  id: number;
  email: string;
  role: 'super_admin' | 'admin';
  status: 'active' | 'suspended';
  is_approved?: boolean;
  added_by: string;
  created_at: string;
  last_login_at: string | null;
  is_super_admin: boolean;
}

interface ActivityLogItem {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  actor_email: string;
  details: string | Record<string, unknown> | null;
  created_at: string;
}

interface SummaryData {
  participants: number;
  checkedIn: number;
  paymentsVerified: number;
  media: number;
  pendingMedia: number;
  admins: number;
  pendingApprovals: number;
  activeSessions: number;
}

type TabType = 'overview' | 'requests' | 'admins' | 'locks' | 'activity';

interface StudentRegistrationLockItem {
  participant_id: number | null;
  registration_id: string;
  full_name: string;
  email: string;
  roll_number: string;
  branch: string;
  year: string;
  approval_status: string;
  payment_status: string;
  payment_verified: boolean;
  payment_id: string | null;
  payment_amount: number;
  account_holder_name: string | null;
  registered_at: string;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  lock_reason: string | null;
  unlocked_at: string | null;
  unlocked_by: string | null;
  unlock_reason: string | null;
}

interface LockAuditLogItem {
  id: number;
  action: string;
  actor_email: string;
  created_at: string;
  details: {
    email?: string;
    roll_number?: string;
    year?: string;
    reason?: string;
    registration_id?: string;
    [key: string]: any;
  };
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant: 'danger' | 'warning' | 'primary';
  onConfirm: () => Promise<void> | void;
}

export default function SuperAdminControl() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  // Overview data
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Public Media Upload gate control
  const [mediaControl, setMediaControl] = useState<{ enabled: boolean; updated_at: string | null } | null>(null);
  const [mediaControlLoading, setMediaControlLoading] = useState(false);
  const [mediaToggleLoading, setMediaToggleLoading] = useState(false);

  // Requests data
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [recentRequests, setRecentRequests] = useState<PendingRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Admins data
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [showNewAdminPw, setShowNewAdminPw] = useState(false);
  const [addAdminLoading, setAddAdminLoading] = useState(false);
  const [addAdminError, setAddAdminError] = useState('');

  // Password reset modal
  const [passwordResetTarget, setPasswordResetTarget] = useState<AdminAccount | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Activity logs data
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('all');

  // Year-Wise Registration Lock Management state
  const [locksList, setLocksList] = useState<StudentRegistrationLockItem[]>([]);
  const [locksLoading, setLocksLoading] = useState(false);
  const [locksSearch, setLocksSearch] = useState('');
  const [locksYearFilter, setLocksYearFilter] = useState<'all' | '1st Year' | '2nd Year'>('all');
  const [locksStatusFilter, setLocksStatusFilter] = useState<'all' | 'locked' | 'unlocked'>('all');
  const [lockAuditLogs, setLockAuditLogs] = useState<LockAuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<{
    item: StudentRegistrationLockItem;
    action: 'unlock' | 'lock';
  } | null>(null);
  const [toggleReason, setToggleReason] = useState('');
  const [toggleLoading, setToggleLoading] = useState(false);

  // Action feedback & confirm dialog
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmWorking, setConfirmWorking] = useState(false);

  const navigate = useNavigate();

  // Verify current user is super admin
  useEffect(() => {
    checkAdminAuth().then((user) => {
      if (!user || user.role !== 'super_admin') {
        navigate('/admin', { replace: true });
      } else {
        setCurrentUser(user);
      }
    });
  }, [navigate]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const res = await fetch('/api/control/data?section=summary', { headers: authHeaders() });
      if (res.ok) {
        const data = await readJsonSafe<SummaryData>(res);
        if (data) setSummary(data);
      }
    } catch (err) {
      console.error('Fetch summary error:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // Fetch public media control
  const fetchMediaControl = useCallback(async () => {
    try {
      setMediaControlLoading(true);
      const res = await fetch('/api/public-media-control', { headers: authHeaders() });
      if (res.ok) {
        const data = await readJsonSafe<{ enabled: boolean; updated_at: string | null }>(res);
        if (data) setMediaControl(data);
      }
    } catch (err) {
      console.error('Fetch public media control error:', err);
    } finally {
      setMediaControlLoading(false);
    }
  }, []);

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    try {
      setRequestsLoading(true);
      const res = await fetch('/api/auth/approvals', { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          navigate('/admin', { replace: true });
        }
        return;
      }
      const data = await readJsonSafe<{ pending?: PendingRequest[]; recent?: PendingRequest[] }>(res);
      setPendingRequests(data?.pending || []);
      setRecentRequests(data?.recent || []);
    } catch (err) {
      console.error('Fetch requests error:', err);
    } finally {
      setRequestsLoading(false);
    }
  }, [navigate]);

  // Fetch admins
  const fetchAdmins = useCallback(async () => {
    try {
      setAdminsLoading(true);
      const res = await fetch('/api/control/admins', { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          navigate('/admin', { replace: true });
        }
        return;
      }
      const data = await readJsonSafe<{ admins?: AdminAccount[] }>(res);
      setAdmins(data?.admins || []);
    } catch (err) {
      console.error('Fetch admins error:', err);
    } finally {
      setAdminsLoading(false);
    }
  }, [navigate]);

  // Fetch activity logs
  const fetchActivityLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const res = await fetch('/api/control/data?section=activity_logs', { headers: authHeaders() });
      if (res.ok) {
        const payload = await readJsonSafe<{ data?: ActivityLogItem[] }>(res);
        setActivityLogs(payload?.data || []);
      }
    } catch (err) {
      console.error('Fetch activity logs error:', err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Fetch registration locks
  const fetchLocks = useCallback(async () => {
    try {
      setLocksLoading(true);
      const res = await fetch('/api/super-admin/registration-locks', {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await readJsonSafe<StudentRegistrationLockItem[]>(res);
        if (Array.isArray(data)) setLocksList(data);
      }
    } catch (err) {
      console.error('fetchLocks error:', err);
    } finally {
      setLocksLoading(false);
    }
  }, []);

  // Fetch lock audit logs
  const fetchLockAuditLogs = useCallback(async () => {
    try {
      setAuditLoading(true);
      const res = await fetch('/api/super-admin/registration-locks/audit-logs', {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await readJsonSafe<LockAuditLogItem[]>(res);
        if (Array.isArray(data)) setLockAuditLogs(data);
      }
    } catch (err) {
      console.error('fetchLockAuditLogs error:', err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  // Handle lock / unlock submission
  const handleToggleLockSubmit = async () => {
    if (!toggleTarget) return;
    setToggleLoading(true);
    try {
      const res = await fetch('/api/super-admin/registration-locks/toggle', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: toggleTarget.item.email,
          year: toggleTarget.item.year,
          action: toggleTarget.action,
          reason: toggleReason.trim(),
          participant_id: toggleTarget.item.participant_id,
        }),
      });
      const data = await readJsonSafe<{ success?: boolean; message?: string; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update registration lock'));

      setActionMessage({
        type: 'success',
        text: data?.message || `Successfully ${toggleTarget.action}ed ${toggleTarget.item.year} registration for ${toggleTarget.item.email}`,
      });
      setToggleTarget(null);
      setToggleReason('');
      fetchLocks();
      fetchLockAuditLogs();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update lock',
      });
    } finally {
      setToggleLoading(false);
    }
  };

  // Initial loads and tab triggers
  useEffect(() => {
    fetchSummary();
    fetchRequests();
    fetchMediaControl();
  }, [fetchSummary, fetchRequests, fetchMediaControl]);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchSummary();
      fetchMediaControl();
    } else if (activeTab === 'requests') {
      fetchRequests();
    } else if (activeTab === 'admins') {
      fetchAdmins();
    } else if (activeTab === 'locks') {
      fetchLocks();
      fetchLockAuditLogs();
    } else if (activeTab === 'activity') {
      fetchActivityLogs();
    }
  }, [activeTab, fetchSummary, fetchRequests, fetchAdmins, fetchActivityLogs, fetchMediaControl, fetchLocks, fetchLockAuditLogs]);

  // Auto-refresh requests every 5s while on requests tab or overview
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchRequests();
      if (activeTab === 'overview') {
        fetchSummary();
        fetchMediaControl();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchRequests, fetchSummary, fetchMediaControl, activeTab]);

  // Toggle public media upload gate
  const handleToggleMediaControl = (targetEnabled: boolean) => {
    setConfirmDialog({
      title: targetEnabled ? 'Open Public Media Upload?' : 'Pause Public Media Upload?',
      message: targetEnabled
        ? 'Public media uploads will be opened. Visitors and attendees will be able to submit photos and videos for review.'
        : 'Public media uploads will be closed immediately. Visitors opening the upload portal will see a paused notice. (Admins can still upload directly).',
      confirmLabel: targetEnabled ? 'Yes, Open Uploads' : 'Yes, Pause Uploads',
      confirmVariant: targetEnabled ? 'primary' : 'warning',
      onConfirm: async () => {
        try {
          setConfirmWorking(true);
          setMediaToggleLoading(true);
          const res = await fetch('/api/public-media-control', {
            method: 'PUT',
            headers: {
              ...authHeaders(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ enabled: targetEnabled }),
          });
          const data = await readJsonSafe<{ enabled: boolean; updated_at: string | null; error?: string }>(res);
          if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update media upload status'));
          setMediaControl({ enabled: data?.enabled ?? targetEnabled, updated_at: data?.updated_at || new Date().toISOString() });
          setActionMessage({
            type: 'success',
            text: targetEnabled ? 'Public Media Upload portal is now OPEN.' : 'Public Media Upload portal is now CLOSED.',
          });
        } catch (err: unknown) {
          setActionMessage({
            type: 'error',
            text: err instanceof Error ? err.message : 'Failed to update media upload status',
          });
        } finally {
          setConfirmWorking(false);
          setMediaToggleLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  // Resolve request (approve / reject)
  const handleResolveRequest = async (requestId: string, action: 'approve' | 'reject') => {
    setResolvingId(requestId);
    setActionMessage(null);
    try {
      const res = await fetch('/api/auth/approval-resolve', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ request_id: requestId, action }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, `Failed to ${action} request`));

      setActionMessage({
        text: `Request has been successfully ${action === 'approve' ? 'approved' : 'rejected'}.`,
        type: 'success',
      });
      fetchRequests();
      fetchSummary();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : 'Action failed',
        type: 'error',
      });
    } finally {
      setResolvingId(null);
    }
  };

  // Delete single authorization history record
  const handleDeleteHistoryRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/auth/approvals?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to remove history record'));

      setActionMessage({ text: 'History record removed.', type: 'success' });
      fetchRequests();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Delete failed', type: 'error' });
    }
  };

  // Clear all authorization history
  const handleClearAllHistory = () => {
    setConfirmDialog({
      title: 'Clear Authorization History',
      message: 'Are you sure you want to delete all resolved authorization history records? This cannot be undone.',
      confirmLabel: 'Clear All History',
      confirmVariant: 'danger',
      onConfirm: async () => {
        const res = await fetch('/api/auth/approvals?all=true', {
          method: 'DELETE',
          headers: authHeaders(),
        });
        const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
        if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to clear history'));

        setActionMessage({ text: 'All authorization history cleared.', type: 'success' });
        fetchRequests();
      },
    });
  };

  // Add new admin
  const handleAddAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddAdminLoading(true);
    setAddAdminError('');
    try {
      const res = await fetch('/api/control/admins', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email: newAdminEmail.trim().toLowerCase(), password: newAdminPassword }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to add admin'));

      setActionMessage({ text: `Admin ${newAdminEmail} created successfully.`, type: 'success' });
      setShowAddAdminModal(false);
      setNewAdminEmail('');
      setNewAdminPassword('');
      fetchAdmins();
      fetchSummary();
    } catch (err) {
      setAddAdminError(err instanceof Error ? err.message : 'Failed to add admin');
    } finally {
      setAddAdminLoading(false);
    }
  };

  // Revoke / suspend admin access
  const handleRevokeAdminAccess = (admin: AdminAccount) => {
    setConfirmDialog({
      title: 'Revoke Admin Access',
      message: `Are you sure you want to REVOKE admin access for "${admin.email}"? All active sessions for this account will be terminated immediately.`,
      confirmLabel: 'Revoke Access',
      confirmVariant: 'danger',
      onConfirm: async () => {
        const res = await fetch('/api/control/admins', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ id: admin.id, status: 'suspended', is_approved: false }),
        });
        const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
        if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to revoke admin access'));

        setActionMessage({ text: `Access revoked for "${admin.email}". Sessions invalidated.`, type: 'success' });
        fetchAdmins();
      },
    });
  };

  // Reactivate admin access
  const handleReactivateAdminAccess = async (admin: AdminAccount) => {
    try {
      const res = await fetch('/api/control/admins', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id: admin.id, status: 'active', is_approved: true }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to reactivate admin'));

      setActionMessage({ text: `Admin access restored for "${admin.email}".`, type: 'success' });
      fetchAdmins();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Action failed', type: 'error' });
    }
  };

  // Remove admin ID completely
  const handleRemoveAdminId = (admin: AdminAccount) => {
    setConfirmDialog({
      title: 'Remove Admin ID',
      message: `Are you sure you want to completely REMOVE Admin ID "${admin.email}"?\n\nThis will permanently delete this admin account, revoke all sessions, and remove access request records.`,
      confirmLabel: 'Remove Admin ID',
      confirmVariant: 'danger',
      onConfirm: async () => {
        const res = await fetch(`/api/control/admins?email=${encodeURIComponent(admin.email)}`, {
          method: 'DELETE',
          headers: authHeaders(),
          body: JSON.stringify({ email: admin.email, id: admin.id }),
        });
        const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
        if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to remove admin account'));

        setActionMessage({ text: `Admin ID "${admin.email}" removed successfully.`, type: 'success' });
        fetchAdmins();
        fetchRequests();
        fetchSummary();
      },
    });
  };

  // Reset password submit
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordResetTarget) return;
    setResetLoading(true);
    try {
      const res = await fetch('/api/control/admins', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id: passwordResetTarget.id, new_password: newResetPassword }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to reset password'));

      setActionMessage({ text: `Password reset successfully for "${passwordResetTarget.email}".`, type: 'success' });
      setPasswordResetTarget(null);
      setNewResetPassword('');
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Reset failed', type: 'error' });
    } finally {
      setResetLoading(false);
    }
  };

  // Sign out
  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST', headers: authHeaders() });
    } catch {
      // ignore
    }
    removeToken();
    navigate('/admin/login', { replace: true });
  };

  // Filtered admins
  const filteredAdmins = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter(a => a.email.toLowerCase().includes(q) || a.role.toLowerCase().includes(q));
  }, [admins, adminSearch]);

  // Filtered activity logs
  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return activityLogs.filter(log => {
      const matchesSearch =
        !q ||
        log.actor_email?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q) ||
        log.entity_type?.toLowerCase().includes(q) ||
        JSON.stringify(log.details || '').toLowerCase().includes(q);

      const matchesAction =
        logActionFilter === 'all' ||
        (logActionFilter === 'approvals' && log.action?.includes('approval')) ||
        (logActionFilter === 'admins' && (log.action?.includes('admin') || log.entity_type?.includes('admin'))) ||
        (logActionFilter === 'participants' && log.entity_type === 'participant') ||
        (logActionFilter === 'media' && log.entity_type === 'media');

      return matchesSearch && matchesAction;
    });
  }, [activityLogs, logSearch, logActionFilter]);

  // Filtered registration locks
  const filteredLocks = useMemo(() => {
    const q = locksSearch.trim().toLowerCase();
    return locksList.filter((item) => {
      const matchesSearch =
        !q ||
        item.full_name?.toLowerCase().includes(q) ||
        item.email?.toLowerCase().includes(q) ||
        item.roll_number?.toLowerCase().includes(q) ||
        item.registration_id?.toLowerCase().includes(q) ||
        String(item.participant_id || '').toLowerCase().includes(q);

      const matchesYear =
        locksYearFilter === 'all' || item.year === locksYearFilter;

      const matchesStatus =
        locksStatusFilter === 'all' ||
        (locksStatusFilter === 'locked' && item.is_locked) ||
        (locksStatusFilter === 'unlocked' && !item.is_locked);

      return matchesSearch && matchesYear && matchesStatus;
    });
  }, [locksList, locksSearch, locksYearFilter, locksStatusFilter]);

  // Lock summary stats
  const lockStats = useMemo(() => {
    let firstYearCount = 0;
    let secondYearCount = 0;
    let unlockedCount = 0;
    let lockedCount = 0;

    locksList.forEach((item) => {
      if (item.year === '1st Year') firstYearCount++;
      if (item.year === '2nd Year') secondYearCount++;
      if (item.is_locked) lockedCount++;
      else unlockedCount++;
    });

    return {
      total: locksList.length,
      firstYearCount,
      secondYearCount,
      unlockedCount,
      lockedCount,
    };
  }, [locksList]);

  // Format date helper
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const pendingCount = pendingRequests.length;

  return (
    <div className="min-h-screen bg-[#111411] text-white pt-20 pb-20">
      {/* HEADER SECTION */}
      <header className="border-b border-[#303a32] bg-[#171b18]/90 backdrop-blur sticky top-16 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#a3b46a]/25 to-olive-600/30 border border-[#a3b46a]/60 ring-2 ring-[#a3b46a]/60 ring-offset-2 ring-offset-[#111411] flex items-center justify-center text-[#a3b46a] shadow-lg shadow-[#a3b46a]/15">
              <Crown size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Super Admin Control</h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#a3b46a]/20 border border-[#a3b46a]/50 text-[#a3b46a]">
                  MASTER ACCESS
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {currentUser?.email ? (
                  <>
                    Logged in as <span className="text-[#a3b46a] font-medium">{currentUser.email}</span>
                  </>
                ) : (
                  'Master Governance & System Administration'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/admin"
              aria-label="Back to Standard Admin Dashboard"
              className="px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-[#191e1b] border border-[#303a32] hover:bg-[#222924] hover:text-white text-gray-300 transition-colors inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#a3b46a]"
            >
              <ArrowLeft size={14} />
              Standard Dashboard
            </Link>
            <button
              onClick={handleSignOut}
              aria-label="Sign out of Super Admin"
              className="px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* ACTION FEEDBACK ALERT */}
        {actionMessage && (
          <div
            role="status"
            className={`p-4 rounded-xl mb-6 text-sm flex items-center justify-between border ${
              actionMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <span className="font-medium">{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              aria-label="Dismiss message"
              className="p-1 rounded hover:bg-white/10 transition-colors ml-4 text-xs"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* SECTION TABS NAVIGATION */}
        <div className="flex items-center gap-2 border-b border-[#303a32] pb-3 mb-6 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#a3b46a] ${
              activeTab === 'overview'
                ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32] hover:bg-[#202722]'
            }`}
          >
            <Layers size={16} />
            Overview
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#a3b46a] ${
              activeTab === 'requests'
                ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32] hover:bg-[#202722]'
            }`}
          >
            <Clock size={16} />
            Admin Requests
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-400 text-black animate-pulse">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('admins')}
            className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#a3b46a] ${
              activeTab === 'admins'
                ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32] hover:bg-[#202722]'
            }`}
          >
            <Shield size={16} />
            Admins
            {admins.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-gray-300">
                {admins.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('locks')}
            className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#a3b46a] ${
              activeTab === 'locks'
                ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32] hover:bg-[#202722]'
            }`}
          >
            <Lock size={16} />
            Registration Locks
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#a3b46a] ${
              activeTab === 'activity'
                ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32] hover:bg-[#202722]'
            }`}
          >
            <History size={16} />
            Activity Log
          </button>
        </div>

        {/* ============================================================== */}
        {/* 1. OVERVIEW SECTION                                             */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-[#191e1b] border border-[#303a32] flex flex-col justify-between hover:border-[#a3b46a]/40 transition-colors">
                <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                  <span>Total Participants</span>
                  <Users size={16} className="text-[#3b82f6]" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-white">
                    {summaryLoading ? '—' : summary?.participants ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Registrations recorded</p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#191e1b] border border-[#303a32] flex flex-col justify-between hover:border-[#a3b46a]/40 transition-colors">
                <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                  <span>Checked In</span>
                  <UserCheck size={16} className="text-[#a3b46a]" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-[#a3b46a]">
                    {summaryLoading ? '—' : summary?.checkedIn ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {summary?.participants
                      ? `${Math.round(((summary.checkedIn || 0) / summary.participants) * 100)}% attendance rate`
                      : 'Verified at entry'}
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#191e1b] border border-[#303a32] flex flex-col justify-between hover:border-[#a3b46a]/40 transition-colors">
                <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                  <span>Pending Requests</span>
                  <Clock size={16} className="text-amber-400" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-amber-400">
                    {summaryLoading ? '—' : summary?.pendingApprovals ?? pendingCount}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Require Super Admin approval</p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#191e1b] border border-[#303a32] flex flex-col justify-between hover:border-[#a3b46a]/40 transition-colors">
                <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                  <span>Media Pending</span>
                  <Image size={16} className="text-fuchsia-400" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-white">
                    {summaryLoading ? '—' : summary?.pendingMedia ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Out of {summary?.media ?? 0} uploaded items
                  </p>
                </div>
              </div>
            </div>

            {/* Secondary stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#191e1b]/80 border border-[#303a32] flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Payments Verified</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">{summary?.paymentsVerified ?? 0}</p>
                </div>
                <ShieldCheck size={24} className="text-emerald-400/60" />
              </div>

              <div className="p-4 rounded-xl bg-[#191e1b]/80 border border-[#303a32] flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Active Admin Sessions</p>
                  <p className="text-xl font-bold text-blue-400 mt-1">{summary?.activeSessions ?? 0}</p>
                </div>
                <Shield size={24} className="text-blue-400/60" />
              </div>

              <div className="p-4 rounded-xl bg-[#191e1b]/80 border border-[#303a32] flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Provisioned Admins</p>
                  <p className="text-xl font-bold text-white mt-1">{summary?.admins ?? admins.length}</p>
                </div>
                <Users size={24} className="text-gray-400/60" />
              </div>
            </div>

            {/* Master Gates & Public Controls Card */}
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-4 border-b border-[#303a32]/60">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Shield className="text-[#3b82f6]" size={18} />
                    Public Gateway & Submission Controls
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Manage real-time access to public-facing portals and community upload gates.
                  </p>
                </div>
              </div>

              {/* Public Media Upload Gateway */}
              <div className="p-4 sm:p-5 rounded-xl bg-[#212823] border border-[#303a32] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`p-3 rounded-xl border mt-0.5 shrink-0 ${
                      mediaControl?.enabled
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    <UploadCloud size={22} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-sm sm:text-base font-bold text-white">Public Media Upload Portal</h3>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          mediaControlLoading
                            ? 'bg-gray-700/50 text-gray-400'
                            : mediaControl?.enabled
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            mediaControl?.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                          }`}
                        />
                        {mediaControlLoading
                          ? 'Checking...'
                          : mediaControl?.enabled
                            ? 'OPEN (Accepting Submissions)'
                            : 'CLOSED (Submissions Paused)'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                      Controls access to the public community upload page (<code className="text-xs text-gray-300 bg-white/5 px-1.5 py-0.5 rounded">/upload-media</code>).
                      When turned OFF, public visitors cannot submit photos or videos. Admins can still upload media anytime via the admin panel.
                    </p>
                    {mediaControl?.updated_at && (
                      <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                        <Clock size={12} />
                        Last changed: {new Date(mediaControl.updated_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                  <Link
                    to="/upload-media"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium border border-[#303a32] flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink size={14} /> View Page
                  </Link>

                  <button
                    onClick={() => handleToggleMediaControl(!mediaControl?.enabled)}
                    disabled={mediaControlLoading || mediaToggleLoading}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${
                      mediaControl?.enabled
                        ? 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-rose-600/20'
                        : 'bg-emerald-600/90 hover:bg-emerald-600 text-white shadow-emerald-600/20'
                    } disabled:opacity-50`}
                  >
                    {mediaToggleLoading ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : mediaControl?.enabled ? (
                      <>
                        <Lock size={15} /> Turn OFF Uploads
                      </>
                    ) : (
                      <>
                        <Unlock size={15} /> Turn ON Uploads
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Full Data Views Card */}
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ExternalLink size={18} className="text-[#a3b46a]" />
                    Full Data Views & Governance Tools
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Super admins have complete master privileges across all Ignite 2.O data surfaces.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Link
                  to="/admin"
                  className="p-4 rounded-xl bg-[#212823] border border-[#303a32] hover:border-[#a3b46a]/60 hover:bg-[#252e27] transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-[#a3b46a] transition-colors">
                      Participants & Check-ins
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Filter, search, QR check-in & verification</p>
                  </div>
                  <ExternalLink size={16} className="text-gray-500 group-hover:text-[#a3b46a] transition-colors" />
                </Link>

                <Link
                  to="/gallery"
                  className="p-4 rounded-xl bg-[#212823] border border-[#303a32] hover:border-[#a3b46a]/60 hover:bg-[#252e27] transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-[#a3b46a] transition-colors">
                      Media Gallery Management
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Review and curate user media uploads</p>
                  </div>
                  <ExternalLink size={16} className="text-gray-500 group-hover:text-[#a3b46a] transition-colors" />
                </Link>

                <Link
                  to="/admin/event-settings"
                  className="p-4 rounded-xl bg-[#212823] border border-[#303a32] hover:border-[#a3b46a]/60 hover:bg-[#252e27] transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-[#a3b46a] transition-colors">
                      Event Configuration
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Registration toggles, schedule & rules</p>
                  </div>
                  <ExternalLink size={16} className="text-gray-500 group-hover:text-[#a3b46a] transition-colors" />
                </Link>

                <Link
                  to="/admin/winners"
                  className="p-4 rounded-xl bg-[#212823] border border-[#303a32] hover:border-[#a3b46a]/60 hover:bg-[#252e27] transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-[#a3b46a] transition-colors">
                      Hall of Fame & Winners
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Record event podiums and awards</p>
                  </div>
                  <ExternalLink size={16} className="text-gray-500 group-hover:text-[#a3b46a] transition-colors" />
                </Link>

                <Link
                  to="/admin/management-team"
                  className="p-4 rounded-xl bg-[#212823] border border-[#303a32] hover:border-[#a3b46a]/60 hover:bg-[#252e27] transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-[#a3b46a] transition-colors">
                      Management Team Roster
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Organizers, coordinators, faculty</p>
                  </div>
                  <ExternalLink size={16} className="text-gray-500 group-hover:text-[#a3b46a] transition-colors" />
                </Link>

                <Link
                  to="/admin/bulk-passes"
                  className="p-4 rounded-xl bg-[#212823] border border-[#303a32] hover:border-[#a3b46a]/60 hover:bg-[#252e27] transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-[#a3b46a] transition-colors">
                      Bulk Pass Generation
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Export printable attendee badges</p>
                  </div>
                  <ExternalLink size={16} className="text-gray-500 group-hover:text-[#a3b46a] transition-colors" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. ADMIN REQUESTS SECTION                                       */}
        {/* ============================================================== */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            {/* Pending Requests Box */}
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <Clock size={20} className="text-amber-400" />
                  <h2 className="text-lg font-bold text-white">Pending Admin Access Requests</h2>
                  {pendingCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                      {pendingCount} Pending
                    </span>
                  )}
                </div>

                <button
                  onClick={fetchRequests}
                  disabled={requestsLoading}
                  aria-label="Refresh access requests"
                  className="px-3.5 py-2 min-h-[44px] rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-[#a3b46a]"
                >
                  <RefreshCw size={13} className={requestsLoading ? 'animate-spin' : ''} />
                  Refresh List
                </button>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border border-dashed border-[#303a32] rounded-xl bg-[#141815]/50">
                  <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-400" />
                  <p className="font-semibold text-sm text-gray-200">No pending access requests</p>
                  <p className="text-xs text-gray-400 mt-1">
                    When a new admin attempts to sign in or register, their authorization request will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#303a32]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#212823] text-gray-300 text-xs font-semibold uppercase tracking-wider border-b border-[#303a32]">
                      <tr>
                        <th className="py-3 px-4">Admin Email</th>
                        <th className="py-3 px-4">Requested Time</th>
                        <th className="py-3 px-4">Device / IP</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#303a32]/60 bg-[#191e1b]">
                      {pendingRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-[#202722] transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">{req.email}</div>
                            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-400/10 text-amber-300 border border-amber-400/30">
                              Awaiting Approval
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-gray-300 text-xs">
                            <div>{formatDate(req.requested_at)}</div>
                            <span className="text-[11px] text-gray-500">
                              Expires: {formatDate(req.expires_at)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-gray-400 text-xs">
                            <div className="font-mono">{req.ip || 'Unknown IP'}</div>
                            <div className="truncate max-w-[200px] text-[11px] text-gray-500" title={req.user_agent}>
                              {req.user_agent || 'Standard Web Client'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleResolveRequest(req.id, 'approve')}
                                disabled={resolvingId === req.id}
                                aria-label={`Approve request for ${req.email}`}
                                className="px-3 py-1.5 min-h-[38px] rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              >
                                <CheckCircle2 size={14} />
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmDialog({
                                    title: 'Reject Access Request',
                                    message: `Are you sure you want to REJECT the access request from "${req.email}"?`,
                                    confirmLabel: 'Reject Request',
                                    confirmVariant: 'danger',
                                    onConfirm: () => handleResolveRequest(req.id, 'reject'),
                                  })
                                }
                                disabled={resolvingId === req.id}
                                aria-label={`Reject request for ${req.email}`}
                                className="px-3 py-1.5 min-h-[38px] rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                              >
                                <XCircle size={14} />
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Authorization History Box */}
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <History size={18} className="text-gray-400" />
                  Recent Authorization History
                </h3>
                {recentRequests.length > 0 && (
                  <button
                    onClick={handleClearAllHistory}
                    aria-label="Clear all authorization history"
                    className="px-3 py-1.5 min-h-[38px] rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <Trash2 size={13} />
                    Clear History
                  </button>
                )}
              </div>

              {recentRequests.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-xs">No authorization history recorded yet.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#303a32]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#212823] text-gray-400 font-semibold border-b border-[#303a32]">
                      <tr>
                        <th className="py-2.5 px-4">Email</th>
                        <th className="py-2.5 px-4">Outcome</th>
                        <th className="py-2.5 px-4">Resolved By</th>
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#303a32]/60">
                      {recentRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-[#202722]/60">
                          <td className="py-2.5 px-4 font-medium text-gray-200">{req.email}</td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                req.status === 'approved'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : req.status === 'rejected'
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-gray-500/20 text-gray-400'
                              }`}
                            >
                              {req.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-gray-400">{req.resolved_by || 'system'}</td>
                          <td className="py-2.5 px-4 text-gray-400">{formatDate(req.resolved_at || req.requested_at)}</td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteHistoryRecord(req.id)}
                              aria-label={`Remove history record for ${req.email}`}
                              className="text-gray-400 hover:text-red-400 p-1.5 rounded transition-colors inline-flex items-center"
                              title="Delete record"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 3. ADMINS SECTION                                               */}
        {/* ============================================================== */}
        {activeTab === 'admins' && (
          <div className="space-y-6">
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Shield size={20} className="text-[#a3b46a]" />
                    Admin Accounts & Governance
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Manage provisioned admin users, revoke access, change roles, or reset credentials.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddAdminModal(true)}
                    aria-label="Add new admin"
                    className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#3b82f6] text-white hover:bg-blue-600 text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-md shadow-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <UserPlus size={15} />
                    Add Admin
                  </button>
                  <button
                    onClick={fetchAdmins}
                    disabled={adminsLoading}
                    aria-label="Refresh admin accounts list"
                    className="px-3.5 py-2 min-h-[44px] rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#a3b46a]"
                  >
                    <RefreshCw size={13} className={adminsLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Search bar */}
              <div className="mb-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="search-admins"
                    name="search_admins"
                    aria-label="Search admins by email or role"
                    type="text"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    placeholder="Search admins by email or role..."
                    className="w-full bg-[#141815] border border-[#303a32] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#a3b46a] focus:ring-1 focus:ring-[#a3b46a]"
                  />
                </div>
              </div>

              {/* Admins Table */}
              <div className="overflow-x-auto rounded-xl border border-[#303a32]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#212823] text-gray-300 text-xs font-semibold uppercase tracking-wider border-b border-[#303a32]">
                    <tr>
                      <th className="py-3 px-4">Admin Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Last Login</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#303a32]/60 bg-[#191e1b]">
                    {filteredAdmins.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-400 text-sm">
                          No admin accounts match your search.
                        </td>
                      </tr>
                    ) : (
                      filteredAdmins.map((admin) => {
                        const isCurrent = currentUser?.email?.toLowerCase() === admin.email.toLowerCase();
                        const isSuper = admin.is_super_admin || admin.role === 'super_admin';

                        return (
                          <tr key={admin.id} className="hover:bg-[#202722] transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white flex items-center gap-2">
                                {admin.email}
                                {isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                    YOU
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-400 mt-0.5">
                                Added by {admin.added_by || 'system'} • {formatDate(admin.created_at)}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              {isSuper ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#a3b46a]/20 text-[#a3b46a] border border-[#a3b46a]/40">
                                  <Crown size={12} />
                                  Super Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                  <Shield size={12} />
                                  Admin
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              {admin.status === 'active' ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  Active
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                                  Revoked / Suspended
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-xs text-gray-400">
                              {formatDate(admin.last_login_at)}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isSuper ? (
                                  <span className="text-xs text-gray-500 italic pr-2">Protected</span>
                                ) : (
                                  <>
                                    {/* Revoke / Reactivate access */}
                                    {admin.status === 'active' ? (
                                      <button
                                        onClick={() => handleRevokeAdminAccess(admin)}
                                        aria-label={`Revoke access for ${admin.email}`}
                                        className="px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                                        title="Revoke admin access immediately"
                                      >
                                        Revoke
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleReactivateAdminAccess(admin)}
                                        aria-label={`Restore access for ${admin.email}`}
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        title="Restore admin access"
                                      >
                                        Activate
                                      </button>
                                    )}

                                    {/* Password Reset */}
                                    <button
                                      onClick={() => {
                                        setPasswordResetTarget(admin);
                                        setNewResetPassword('');
                                      }}
                                      aria-label={`Reset password for ${admin.email}`}
                                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                                      title="Reset Password"
                                    >
                                      <KeyRound size={14} />
                                    </button>

                                    {/* Remove admin completely */}
                                    <button
                                      onClick={() => handleRemoveAdminId(admin)}
                                      aria-label={`Remove admin ID ${admin.email}`}
                                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 transition-colors"
                                      title="Delete Admin Account"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* YEAR-WISE REGISTRATION LOCK MANAGEMENT                          */}
        {/* ============================================================== */}
        {activeTab === 'locks' && (
          <div className="space-y-6">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-[#191e1b] border border-[#303a32] flex flex-col justify-between">
                <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                  <span>Total Registrations</span>
                  <Users size={16} className="text-[#3b82f6]" />
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {locksLoading ? '—' : lockStats.total}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#191e1b] border border-[#303a32] flex flex-col justify-between">
                <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                  <span>1st Year (₹599)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                </div>
                <div className="mt-2 text-2xl font-black text-blue-400">
                  {locksLoading ? '—' : lockStats.firstYearCount}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#191e1b] border border-[#303a32] flex flex-col justify-between">
                <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                  <span>2nd Year (₹699)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                </div>
                <div className="mt-2 text-2xl font-black text-amber-400">
                  {locksLoading ? '—' : lockStats.secondYearCount}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#191e1b] border border-[#303a32] flex flex-col justify-between">
                <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                  <span>Unlocked Records</span>
                  <Unlock size={16} className="text-emerald-400" />
                </div>
                <div className="mt-2 text-2xl font-black text-emerald-400">
                  {locksLoading ? '—' : lockStats.unlockedCount}
                </div>
              </div>
            </div>

            {/* Lock Management Section */}
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Lock size={20} className="text-[#3b82f6]" />
                    Year-Wise Registration Lock Management
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Independently view, unlock, or lock student registrations for 1st Year (₹599) and 2nd Year (₹699).
                  </p>
                </div>

                <button
                  onClick={() => {
                    fetchLocks();
                    fetchLockAuditLogs();
                  }}
                  disabled={locksLoading || auditLoading}
                  aria-label="Refresh registration locks"
                  className="px-3.5 py-2 min-h-[44px] rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors self-start md:self-auto focus:outline-none focus:ring-2 focus:ring-[#a3b46a]"
                >
                  <RefreshCw size={13} className={locksLoading || auditLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="search-locks"
                    name="search_locks"
                    aria-label="Filter locks by name, email, roll number, or reg ID"
                    type="text"
                    value={locksSearch}
                    onChange={(e) => setLocksSearch(e.target.value)}
                    placeholder="Search by student name, email, roll number, or registration ID..."
                    className="w-full bg-[#141815] border border-[#303a32] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#a3b46a] focus:ring-1 focus:ring-[#a3b46a]"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Filter size={16} className="text-gray-400 hidden sm:inline-block" />
                  <select
                    value={locksYearFilter}
                    onChange={(e) => setLocksYearFilter(e.target.value as any)}
                    aria-label="Filter locks by academic year"
                    className="bg-[#141815] border border-[#303a32] rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-[#a3b46a]"
                  >
                    <option value="all">All Academic Years</option>
                    <option value="1st Year">1st Year (₹599)</option>
                    <option value="2nd Year">2nd Year (₹699)</option>
                  </select>

                  <select
                    value={locksStatusFilter}
                    onChange={(e) => setLocksStatusFilter(e.target.value as any)}
                    aria-label="Filter locks by lock status"
                    className="bg-[#141815] border border-[#303a32] rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-[#a3b46a]"
                  >
                    <option value="all">All Lock Statuses</option>
                    <option value="locked">Locked Only</option>
                    <option value="unlocked">Unlocked Only</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-[#303a32]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#212823] text-gray-300 text-xs font-semibold uppercase tracking-wider border-b border-[#303a32]">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Academic Year</th>
                      <th className="py-3 px-4">Registration Status</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Lock Status</th>
                      <th className="py-3 px-4 text-right">Super Admin Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#303a32]/60 bg-[#191e1b]">
                    {filteredLocks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-gray-400 text-sm">
                          {locksLoading ? 'Loading registration locks...' : 'No registrations found matching the criteria.'}
                        </td>
                      </tr>
                    ) : (
                      filteredLocks.map((item) => (
                        <tr key={`${item.email}-${item.year}-${item.participant_id}`} className="hover:bg-[#202722] transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white text-xs">{item.full_name}</div>
                            <div className="text-[11px] text-gray-400 font-mono mt-0.5">{item.email}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              Roll: <span className="text-gray-300 font-mono">{item.roll_number || 'N/A'}</span> • {item.branch}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                                item.year === '1st Year'
                                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              }`}
                            >
                              {item.year}
                            </span>
                            <div className="text-[10px] text-gray-400 font-mono mt-1">
                              {item.registration_id}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                                item.approval_status === 'approved'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : item.approval_status === 'rejected'
                                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                  : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                              }`}
                            >
                              {item.approval_status === 'approved'
                                ? 'Approved'
                                : item.approval_status === 'rejected'
                                ? 'Rejected'
                                : 'Pending Approval'}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-1">
                              {formatDate(item.registered_at)}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="text-xs font-semibold text-white">
                              ₹{item.payment_amount}
                            </div>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 border ${
                                item.payment_verified || item.payment_status === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : item.payment_id
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                              }`}
                            >
                              {item.payment_verified || item.payment_status === 'completed'
                                ? 'Verified'
                                : item.payment_id
                                ? 'Submitted'
                                : 'Pending'}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {item.is_locked ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  <Lock size={12} />
                                  Locked
                                </span>
                                {item.locked_at && (
                                  <div className="text-[10px] text-gray-400 mt-0.5" title={item.lock_reason || undefined}>
                                    Locked {formatDate(item.locked_at)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  <Unlock size={12} />
                                  Unlocked
                                </span>
                                {item.unlocked_by && (
                                  <div className="text-[10px] text-emerald-400/80 mt-0.5" title={item.unlock_reason || undefined}>
                                    By {item.unlocked_by.split('@')[0]}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {item.is_locked ? (
                              <button
                                onClick={() =>
                                  setToggleTarget({
                                    item,
                                    action: 'unlock',
                                  })
                                }
                                aria-label={`Unlock ${item.year} registration for ${item.email}`}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              >
                                <Unlock size={13} />
                                Unlock Year
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  setToggleTarget({
                                    item,
                                    action: 'lock',
                                  })
                                }
                                aria-label={`Re-lock ${item.year} registration for ${item.email}`}
                                className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
                              >
                                <Lock size={13} />
                                Re-Lock Year
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Audit Log Box */}
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <History size={18} className="text-[#3b82f6]" />
                    Registration Lock Audit Log
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Immutable history of Super Admin unlock and lock actions, reasons, and timestamps.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#303a32]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#212823] text-gray-300 text-xs font-semibold uppercase tracking-wider border-b border-[#303a32]">
                    <tr>
                      <th className="py-3 px-4">When</th>
                      <th className="py-3 px-4">Super Admin</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Target Student</th>
                      <th className="py-3 px-4">Academic Year</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#303a32]/60 bg-[#191e1b]">
                    {lockAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400 text-xs">
                          {auditLoading ? 'Loading audit history...' : 'No lock or unlock events recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      lockAuditLogs.map((log) => {
                        const isUnlock = log.action === 'unlock_registration';
                        return (
                          <tr key={log.id} className="hover:bg-[#202722] transition-colors">
                            <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                              {formatDate(log.created_at)}
                            </td>
                            <td className="py-3 px-4 text-xs text-white font-medium whitespace-nowrap">
                              {log.actor_email}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
                                  isUnlock
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                }`}
                              >
                                {isUnlock ? <Unlock size={11} /> : <Lock size={11} />}
                                {isUnlock ? 'UNLOCKED' : 'LOCKED'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs font-mono text-gray-300 whitespace-nowrap">
                              {log.details?.email || 'N/A'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="text-xs font-bold text-[#a3b46a]">
                                {log.details?.year || 'N/A'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-gray-300 max-w-xs">
                              <span className="italic text-gray-400">
                                {log.details?.reason || 'No reason provided'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 4. ACTIVITY LOG SECTION                                         */}
        {/* ============================================================== */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <History size={20} className="text-[#3b82f6]" />
                    Audit & Activity Log
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Comprehensive log of all administrative actions, approvals, revokes, and updates.
                  </p>
                </div>

                <button
                  onClick={fetchActivityLogs}
                  disabled={logsLoading}
                  aria-label="Refresh activity logs"
                  className="px-3.5 py-2 min-h-[44px] rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors self-start md:self-auto focus:outline-none focus:ring-2 focus:ring-[#a3b46a]"
                >
                  <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="search-logs"
                    name="search_logs"
                    aria-label="Filter logs by admin, action, or details"
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Filter by admin, action, or details..."
                    className="w-full bg-[#141815] border border-[#303a32] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#a3b46a] focus:ring-1 focus:ring-[#a3b46a]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-gray-400" />
                  <select
                    value={logActionFilter}
                    onChange={(e) => setLogActionFilter(e.target.value)}
                    aria-label="Filter activity logs by category"
                    className="bg-[#141815] border border-[#303a32] rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-[#a3b46a]"
                  >
                    <option value="all">All Actions</option>
                    <option value="approvals">Login Approvals & Requests</option>
                    <option value="admins">Admin Management</option>
                    <option value="participants">Participant Actions</option>
                    <option value="media">Media Actions</option>
                  </select>
                </div>
              </div>

              {/* Log Table */}
              <div className="overflow-x-auto rounded-xl border border-[#303a32]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#212823] text-gray-300 text-xs font-semibold uppercase tracking-wider border-b border-[#303a32]">
                    <tr>
                      <th className="py-3 px-4">When</th>
                      <th className="py-3 px-4">Who (Actor)</th>
                      <th className="py-3 px-4">What (Action)</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#303a32]/60 bg-[#191e1b]">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-gray-400 text-sm">
                          {logsLoading ? 'Loading activity logs...' : 'No activity logs matching the criteria.'}
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => {
                        let detailsStr = '';
                        if (typeof log.details === 'string') {
                          detailsStr = log.details;
                        } else if (log.details && typeof log.details === 'object') {
                          detailsStr = JSON.stringify(log.details);
                        }

                        return (
                          <tr key={log.id} className="hover:bg-[#202722] transition-colors">
                            <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                              {formatDate(log.created_at)}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-white text-xs">{log.actor_email || 'System'}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30">
                                {log.action}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-gray-300 max-w-md">
                              <div className="truncate font-mono text-[11px] text-gray-400" title={detailsStr}>
                                {detailsStr || `${log.entity_type} #${log.entity_id}`}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* ADD ADMIN MODAL                                                */}
      {/* ============================================================== */}
      {showAddAdminModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-admin-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 id="add-admin-title" className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus size={18} className="text-[#3b82f6]" />
                Provision New Admin
              </h3>
              <button
                onClick={() => setShowAddAdminModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {addAdminError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {addAdminError}
              </div>
            )}

            <form onSubmit={handleAddAdminSubmit} className="space-y-4">
              <div>
                <label htmlFor="provision-admin-email" className="block text-xs font-semibold text-gray-300 mb-1">Gmail Address</label>
                <input
                  id="provision-admin-email"
                  name="email"
                  autoComplete="email"
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="w-full bg-[#141815] border border-[#303a32] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#a3b46a]"
                />
              </div>

              <div>
                <label htmlFor="provision-admin-password" className="block text-xs font-semibold text-gray-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    id="provision-admin-password"
                    name="password"
                    autoComplete="new-password"
                    type={showNewAdminPw ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full bg-[#141815] border border-[#303a32] rounded-xl px-3.5 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#a3b46a]"
                  />
                  <button
                    type="button"
                    aria-label={showNewAdminPw ? "Hide password" : "Show password"}
                    onClick={() => setShowNewAdminPw(!showNewAdminPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showNewAdminPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(false)}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addAdminLoading}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-[#3b82f6] text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {addAdminLoading ? 'Creating...' : 'Create Admin Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* RESET PASSWORD MODAL                                           */}
      {/* ============================================================== */}
      {passwordResetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-pw-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 id="reset-pw-title" className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound size={18} className="text-amber-400" />
                Reset Password
              </h3>
              <button
                onClick={() => setPasswordResetTarget(null)}
                className="text-gray-400 hover:text-white p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              Reset password for <span className="font-semibold text-white">{passwordResetTarget.email}</span>. All active sessions for this admin will be revoked immediately.
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-admin-password" className="block text-xs font-semibold text-gray-300 mb-1">New Password</label>
                <div className="relative">
                  <input
                    id="reset-admin-password"
                    name="new_password"
                    autoComplete="new-password"
                    type={showResetPw ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full bg-[#141815] border border-[#303a32] rounded-xl px-3.5 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#a3b46a]"
                  />
                  <button
                    type="button"
                    aria-label={showResetPw ? "Hide password" : "Show password"}
                    onClick={() => setShowResetPw(!showResetPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showResetPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordResetTarget(null)}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  {resetLoading ? 'Resetting...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* LOCK / UNLOCK CONFIRMATION MODAL                               */}
      {/* ============================================================== */}
      {toggleTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-toggle-modal-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-[#303a32] pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    toggleTarget.action === 'unlock'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {toggleTarget.action === 'unlock' ? <Unlock size={20} /> : <Lock size={20} />}
                </div>
                <div>
                  <h3 id="lock-toggle-modal-title" className="text-base font-bold text-white">
                    {toggleTarget.action === 'unlock' ? 'Unlock Registration' : 'Re-Lock Registration'}
                  </h3>
                  <p className="text-xs text-gray-400">
                    Academic Year: <span className="text-[#a3b46a] font-semibold">{toggleTarget.item.year}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setToggleTarget(null);
                  setToggleReason('');
                }}
                disabled={toggleLoading}
                aria-label="Close dialog"
                className="text-gray-400 hover:text-white p-1 rounded transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div className="p-3.5 rounded-xl bg-[#141815] border border-[#303a32] text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Student Name:</span>
                  <span className="text-white font-medium">{toggleTarget.item.full_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Email:</span>
                  <span className="text-white font-mono">{toggleTarget.item.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Roll Number:</span>
                  <span className="text-white font-mono">{toggleTarget.item.roll_number || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Academic Year:</span>
                  <span className="text-[#a3b46a] font-semibold">{toggleTarget.item.year}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Registration ID:</span>
                  <span className="text-white font-mono">{toggleTarget.item.registration_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Lock Status:</span>
                  <span className={`font-semibold ${toggleTarget.item.is_locked ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {toggleTarget.item.is_locked ? 'Locked' : 'Unlocked'}
                  </span>
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl text-xs border ${
                  toggleTarget.action === 'unlock'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                }`}
              >
                {toggleTarget.action === 'unlock' ? (
                  <p>
                    <strong>Notice:</strong> Unlocking will allow this student to submit or update their{' '}
                    <strong>{toggleTarget.item.year}</strong> registration. The other academic year's registration lock remains completely independent.
                  </p>
                ) : (
                  <p>
                    <strong>Notice:</strong> Re-locking will prevent this student from submitting or updating their{' '}
                    <strong>{toggleTarget.item.year}</strong> registration on the registration page until unlocked again.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="lock-reason" className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Reason for {toggleTarget.action === 'unlock' ? 'Unlocking' : 'Locking'} (Optional, recorded in audit log)
                </label>
                <textarea
                  id="lock-reason"
                  rows={2}
                  value={toggleReason}
                  onChange={(e) => setToggleReason(e.target.value)}
                  placeholder={
                    toggleTarget.action === 'unlock'
                      ? 'e.g. Student requested to correct details, re-upload payment slip, special approval...'
                      : 'e.g. Duplicate attempt prevented, manual lock enforcement...'
                  }
                  className="w-full bg-[#141815] border border-[#303a32] rounded-xl p-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#a3b46a] focus:ring-1 focus:ring-[#a3b46a]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setToggleTarget(null);
                  setToggleReason('');
                }}
                disabled={toggleLoading}
                className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleLockSubmit}
                disabled={toggleLoading}
                className={`px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-2 ${
                  toggleTarget.action === 'unlock'
                    ? 'bg-emerald-500 text-black hover:bg-emerald-400 focus:ring-emerald-400'
                    : 'bg-amber-500 text-black hover:bg-amber-400 focus:ring-amber-400'
                } disabled:opacity-50`}
              >
                {toggleLoading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Processing...
                  </>
                ) : toggleTarget.action === 'unlock' ? (
                  <>
                    <Unlock size={14} />
                    Confirm Unlock
                  </>
                ) : (
                  <>
                    <Lock size={14} />
                    Confirm Lock
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRMATION DIALOG MODAL                                      */}
      {/* ============================================================== */}
      {confirmDialog && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  confirmDialog.confirmVariant === 'danger'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}
              >
                <AlertTriangle size={20} />
              </div>
              <h3 id="confirm-dialog-title" className="text-base font-bold text-white">
                {confirmDialog.title}
              </h3>
            </div>

            <p className="text-xs text-gray-300 whitespace-pre-line leading-relaxed mb-6">
              {confirmDialog.message}
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={confirmWorking}
                className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmWorking}
                onClick={async () => {
                  try {
                    setConfirmWorking(true);
                    await confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  } catch (err) {
                    setActionMessage({
                      text: err instanceof Error ? err.message : 'Operation failed',
                      type: 'error',
                    });
                    setConfirmDialog(null);
                  } finally {
                    setConfirmWorking(false);
                  }
                }}
                className={`px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-colors focus:outline-none focus:ring-2 ${
                  confirmDialog.confirmVariant === 'danger'
                    ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-400'
                    : 'bg-amber-500 text-black hover:bg-amber-400 focus:ring-amber-400'
                }`}
              >
                {confirmWorking ? 'Processing...' : confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

