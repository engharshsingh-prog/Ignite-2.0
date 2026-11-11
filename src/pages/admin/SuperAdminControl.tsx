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

interface YearRegistrationGateways {
  enabled_1st_year: boolean;
  enabled_2nd_year: boolean;
  updated_at: string | null;
  updated_by: string | null;
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

  // Public Year Registration gate controls
  const [yearGateways, setYearGateways] = useState<YearRegistrationGateways | null>(null);
  const [yearGatewaysLoading, setYearGatewaysLoading] = useState(false);
  const [gatewayToggleLoading, setGatewayToggleLoading] = useState<string | null>(null);

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

  // Fetch public year registration gateways
  const fetchYearGateways = useCallback(async () => {
    try {
      setYearGatewaysLoading(true);
      const res = await fetch('/api/super-admin/year-registration-control', { headers: authHeaders() });
      if (res.ok) {
        const data = await readJsonSafe<YearRegistrationGateways>(res);
        if (data) setYearGateways(data);
      }
    } catch (err) {
      console.error('Fetch year registration gateways error:', err);
    } finally {
      setYearGatewaysLoading(false);
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
    fetchYearGateways();
  }, [fetchSummary, fetchRequests, fetchMediaControl, fetchYearGateways]);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchSummary();
      fetchMediaControl();
      fetchYearGateways();
    } else if (activeTab === 'requests') {
      fetchRequests();
    } else if (activeTab === 'admins') {
      fetchAdmins();
    } else if (activeTab === 'locks') {
      fetchLocks();
      fetchLockAuditLogs();
      fetchYearGateways();
    } else if (activeTab === 'activity') {
      fetchActivityLogs();
    }
  }, [activeTab, fetchSummary, fetchRequests, fetchAdmins, fetchActivityLogs, fetchMediaControl, fetchYearGateways, fetchLocks, fetchLockAuditLogs]);

  // Auto-refresh requests every 5s while on requests tab or overview
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchRequests();
      if (activeTab === 'overview') {
        fetchSummary();
        fetchMediaControl();
        fetchYearGateways();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchRequests, fetchSummary, fetchMediaControl, fetchYearGateways, activeTab]);

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

  // Toggle public year registration gateway (Super Admin exclusive authority)
  const handleToggleYearGateway = (year: '1st Year' | '2nd Year', targetEnabled: boolean) => {
    setConfirmDialog({
      title: targetEnabled ? `Enable ${year} Registration?` : `Pause ${year} Registration?`,
      message: targetEnabled
        ? `Are you sure you want to open and enable public registrations for ${year}? Students will be able to select ${year} on the registration page and proceed to the ${year === '2nd Year' ? '₹699' : '₹599'} UPI payment step.`
        : `Are you sure you want to pause and close public registrations for ${year}? The ${year} option on the registration page will be disabled with a 'Registrations Closed' notice, and submissions will be rejected by the server.`,
      confirmLabel: targetEnabled ? `Yes, Enable ${year}` : `Yes, Pause ${year}`,
      confirmVariant: targetEnabled ? 'primary' : 'warning',
      onConfirm: async () => {
        try {
          setConfirmWorking(true);
          setGatewayToggleLoading(year);
          const res = await fetch('/api/super-admin/year-registration-control', {
            method: 'PUT',
            headers: {
              ...authHeaders(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ year, enabled: targetEnabled }),
          });
          const data = await readJsonSafe<{
            success?: boolean;
            message?: string;
            enabled_1st_year?: boolean;
            enabled_2nd_year?: boolean;
            updated_at?: string | null;
            updated_by?: string | null;
            error?: string;
          }>(res);

          if (!res.ok) throw new Error(getErrorMessage(data, `Failed to update ${year} registration gateway`));

          setYearGateways({
            enabled_1st_year: data?.enabled_1st_year ?? (year === '1st Year' ? targetEnabled : (yearGateways?.enabled_1st_year ?? true)),
            enabled_2nd_year: data?.enabled_2nd_year ?? (year === '2nd Year' ? targetEnabled : (yearGateways?.enabled_2nd_year ?? true)),
            updated_at: data?.updated_at || new Date().toISOString(),
            updated_by: data?.updated_by || currentUser?.email || null,
          });

          setActionMessage({
            type: 'success',
            text: data?.message || `${year} registration gateway is now ${targetEnabled ? 'OPEN' : 'PAUSED'}.`,
          });
        } catch (err: unknown) {
          setActionMessage({
            type: 'error',
            text: err instanceof Error ? err.message : `Failed to update ${year} registration gateway`,
          });
        } finally {
          setConfirmWorking(false);
          setGatewayToggleLoading(null);
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
    <div className="min-h-screen text-slate-900 pt-20 pb-20">
      {/* HEADER SECTION */}
      <header className="border-b border-slate-900/10 bg-white/80 backdrop-blur-2xl sticky top-16 z-30 shadow-[0_8px_32px_rgba(15,23,42,0.06)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400/20 to-blue-600/20 border border-sky-500/35 ring-2 ring-sky-400/20 flex items-center justify-center text-sky-700 shadow-lg shadow-sky-500/15 backdrop-blur-md">
              <Crown size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">Super Admin Control</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/12 border border-sky-500/35 text-sky-800 backdrop-blur-md">
                  MASTER ACCESS
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {currentUser?.email ? (
                  <>
                    Logged in as <span className="text-sky-700 font-medium">{currentUser.email}</span>
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
              className="liquid-btn-glass px-3.5 py-2 min-h-[44px] text-xs inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <ArrowLeft size={14} />
              Standard Dashboard
            </Link>
            <button
              onClick={handleSignOut}
              aria-label="Sign out of Super Admin"
              className="px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-red-500/12 border border-red-400/35 text-red-700 hover:bg-red-500/20 transition-colors inline-flex items-center gap-1.5 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-red-400"
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
            className={`p-4 rounded-2xl mb-6 text-sm flex items-center justify-between border backdrop-blur-md ${
              actionMessage.type === 'success'
                ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-800'
                : 'bg-red-500/12 border-red-400/35 text-red-800'
            }`}
          >
            <span className="font-medium">{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              aria-label="Dismiss message"
              className="p-1 rounded hover:bg-slate-900/10 transition-colors ml-4 text-xs"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* SECTION TABS NAVIGATION */}
        <div className="flex items-center gap-2 border-b border-slate-900/10 pb-3 mb-6 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              activeTab === 'overview'
                ? 'liquid-btn-primary'
                : 'liquid-btn-glass text-slate-700 hover:text-slate-900'
            }`}
          >
            <Layers size={16} />
            Overview
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              activeTab === 'requests'
                ? 'liquid-btn-primary'
                : 'liquid-btn-glass text-slate-700 hover:text-slate-900'
            }`}
          >
            <Clock size={16} />
            Admin Requests
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-400 text-slate-950 animate-pulse">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('admins')}
            className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              activeTab === 'admins'
                ? 'liquid-btn-primary'
                : 'liquid-btn-glass text-slate-700 hover:text-slate-900'
            }`}
          >
            <Shield size={16} />
            Admins
            {admins.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-900/10 text-slate-800">
                {admins.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('locks')}
            className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              activeTab === 'locks'
                ? 'liquid-btn-primary'
                : 'liquid-btn-glass text-slate-700 hover:text-slate-900'
            }`}
          >
            <Lock size={16} />
            Registration Locks
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              activeTab === 'activity'
                ? 'liquid-btn-primary'
                : 'liquid-btn-glass text-slate-700 hover:text-slate-900'
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
              <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                  <span>Total Participants</span>
                  <Users size={16} className="text-blue-600" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">
                    {summaryLoading ? '—' : summary?.participants ?? 0}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Registrations recorded</p>
                </div>
              </div>

              <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                  <span>Checked In</span>
                  <UserCheck size={16} className="text-sky-600" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-sky-700">
                    {summaryLoading ? '—' : summary?.checkedIn ?? 0}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {summary?.participants
                      ? `${Math.round(((summary.checkedIn || 0) / summary.participants) * 100)}% attendance rate`
                      : 'Verified at entry'}
                  </p>
                </div>
              </div>

              <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                  <span>Pending Requests</span>
                  <Clock size={16} className="text-amber-600" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-amber-700">
                    {summaryLoading ? '—' : summary?.pendingApprovals ?? pendingCount}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Require Super Admin approval</p>
                </div>
              </div>

              <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                  <span>Media Pending</span>
                  <Image size={16} className="text-violet-600" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">
                    {summaryLoading ? '—' : summary?.pendingMedia ?? 0}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Out of {summary?.media ?? 0} uploaded items
                  </p>
                </div>
              </div>
            </div>

            {/* Secondary stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="liquid-glass-card p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-600">Payments Verified</p>
                  <p className="text-xl font-bold text-emerald-700 mt-1">{summary?.paymentsVerified ?? 0}</p>
                </div>
                <ShieldCheck size={24} className="text-emerald-600/75" />
              </div>

              <div className="liquid-glass-card p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-600">Active Admin Sessions</p>
                  <p className="text-xl font-bold text-sky-700 mt-1">{summary?.activeSessions ?? 0}</p>
                </div>
                <Shield size={24} className="text-sky-600/75" />
              </div>

              <div className="liquid-glass-card p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-600">Provisioned Admins</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{summary?.admins ?? admins.length}</p>
                </div>
                <Users size={24} className="text-slate-500/80" />
              </div>
            </div>

            {/* Master Gates & Public Controls Card */}
            <div className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-4 border-b border-slate-900/10">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="text-sky-600" size={18} />
                    Public Gateway & Submission Controls
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Manage real-time access to public registration year gateways and community upload portals. Only Super Admins have authority to toggle these gates.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* 2nd Year Registration Gateway */}
                <div className="liquid-glass-card p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-3 rounded-xl border mt-0.5 shrink-0 ${
                        (yearGateways?.enabled_2nd_year ?? true)
                          ? 'bg-amber-500/12 border-amber-500/35 text-amber-700'
                          : 'bg-rose-500/12 border-rose-500/35 text-rose-700'
                      }`}
                    >
                      <Crown size={22} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">2nd Year Registration Gateway (₹699)</h3>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            yearGatewaysLoading
                              ? 'bg-slate-900/10 text-slate-600'
                              : (yearGateways?.enabled_2nd_year ?? true)
                                ? 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/35'
                                : 'bg-rose-500/15 text-rose-800 border border-rose-500/35'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              (yearGateways?.enabled_2nd_year ?? true) ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                            }`}
                          />
                          {yearGatewaysLoading
                            ? 'Checking...'
                            : (yearGateways?.enabled_2nd_year ?? true)
                              ? 'OPEN (Accepting 2nd Year)'
                              : 'PAUSED (Registrations Closed)'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                        Controls whether students can select <strong className="text-amber-700">2nd Year (₹699)</strong> and register with the 2nd Year QR code on <code className="text-xs text-sky-800 bg-sky-500/10 px-1.5 py-0.5 rounded">/register</code>.
                        When paused, the 2nd Year option is locked and marked closed, preventing both form submission and API bypass.
                      </p>
                      {yearGateways?.updated_at && (
                        <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                          <Clock size={12} />
                          Last changed: {new Date(yearGateways.updated_at).toLocaleString()}
                          {yearGateways.updated_by ? ` by ${yearGateways.updated_by}` : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                    <Link
                      to="/register"
                      target="_blank"
                      rel="noreferrer"
                      className="liquid-btn-glass px-3 py-2 text-xs flex items-center gap-1.5"
                    >
                      <ExternalLink size={14} /> View Register
                    </Link>

                    <button
                      onClick={() => handleToggleYearGateway('2nd Year', !(yearGateways?.enabled_2nd_year ?? true))}
                      disabled={yearGatewaysLoading || gatewayToggleLoading === '2nd Year'}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all backdrop-blur-md shadow-sm ${
                        (yearGateways?.enabled_2nd_year ?? true)
                          ? 'bg-rose-600 hover:bg-rose-500 border border-rose-500/40 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 text-white'
                      } disabled:opacity-50`}
                    >
                      {gatewayToggleLoading === '2nd Year' ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : (yearGateways?.enabled_2nd_year ?? true) ? (
                        <>
                          <Lock size={15} /> Pause 2nd Year
                        </>
                      ) : (
                        <>
                          <Unlock size={15} /> Enable 2nd Year
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 1st Year Registration Gateway */}
                <div className="liquid-glass-card p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-3 rounded-xl border mt-0.5 shrink-0 ${
                        (yearGateways?.enabled_1st_year ?? true)
                          ? 'bg-sky-500/12 border-sky-500/35 text-sky-700'
                          : 'bg-rose-500/12 border-rose-500/35 text-rose-700'
                      }`}
                    >
                      <Users size={22} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">1st Year Registration Gateway (₹599)</h3>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            yearGatewaysLoading
                              ? 'bg-slate-900/10 text-slate-600'
                              : (yearGateways?.enabled_1st_year ?? true)
                                ? 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/35'
                                : 'bg-rose-500/15 text-rose-800 border border-rose-500/35'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              (yearGateways?.enabled_1st_year ?? true) ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                            }`}
                          />
                          {yearGatewaysLoading
                            ? 'Checking...'
                            : (yearGateways?.enabled_1st_year ?? true)
                              ? 'OPEN (Accepting 1st Year)'
                              : 'PAUSED (Registrations Closed)'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                        Controls whether students can select <strong className="text-sky-700">1st Year (₹599)</strong> and register with the 1st Year QR code on <code className="text-xs text-sky-800 bg-sky-500/10 px-1.5 py-0.5 rounded">/register</code>.
                      </p>
                      {yearGateways?.updated_at && (
                        <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                          <Clock size={12} />
                          Last changed: {new Date(yearGateways.updated_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                    <button
                      onClick={() => handleToggleYearGateway('1st Year', !(yearGateways?.enabled_1st_year ?? true))}
                      disabled={yearGatewaysLoading || gatewayToggleLoading === '1st Year'}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all backdrop-blur-md shadow-sm ${
                        (yearGateways?.enabled_1st_year ?? true)
                          ? 'bg-rose-600 hover:bg-rose-500 border border-rose-500/40 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 text-white'
                      } disabled:opacity-50`}
                    >
                      {gatewayToggleLoading === '1st Year' ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : (yearGateways?.enabled_1st_year ?? true) ? (
                        <>
                          <Lock size={15} /> Pause 1st Year
                        </>
                      ) : (
                        <>
                          <Unlock size={15} /> Enable 1st Year
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Public Media Upload Gateway */}
                <div className="liquid-glass-card p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-3 rounded-xl border mt-0.5 shrink-0 ${
                        mediaControl?.enabled
                          ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-700'
                          : 'bg-rose-500/12 border-rose-500/35 text-rose-700'
                      }`}
                    >
                      <UploadCloud size={22} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">Public Media Upload Portal</h3>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            mediaControlLoading
                              ? 'bg-slate-900/10 text-slate-600'
                              : mediaControl?.enabled
                                ? 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/35'
                                : 'bg-rose-500/15 text-rose-800 border border-rose-500/35'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              mediaControl?.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                            }`}
                          />
                          {mediaControlLoading
                            ? 'Checking...'
                            : mediaControl?.enabled
                              ? 'OPEN (Accepting Submissions)'
                              : 'CLOSED (Submissions Paused)'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                        Controls access to the public community upload page (<code className="text-xs text-sky-800 bg-sky-500/10 px-1.5 py-0.5 rounded">/upload-media</code>).
                        When turned OFF, public visitors cannot submit photos or videos. Admins can still upload media anytime via the admin panel.
                      </p>
                      {mediaControl?.updated_at && (
                        <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
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
                      className="liquid-btn-glass px-3 py-2 text-xs flex items-center gap-1.5"
                    >
                      <ExternalLink size={14} /> View Page
                    </Link>

                    <button
                      onClick={() => handleToggleMediaControl(!mediaControl?.enabled)}
                      disabled={mediaControlLoading || mediaToggleLoading}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all backdrop-blur-md shadow-sm ${
                        mediaControl?.enabled
                          ? 'bg-rose-600 hover:bg-rose-500 border border-rose-500/40 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 text-white'
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
            </div>

            {/* Full Data Views Card */}
            <div className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ExternalLink size={18} className="text-sky-600" />
                    Full Data Views & Governance Tools
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Super admins have complete master privileges across all Ignite 2.O data surfaces.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Link
                  to="/admin"
                  className="liquid-glass-card p-4 rounded-2xl hover:border-sky-500/45 transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                      Participants & Check-ins
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">Filter, search, QR check-in & verification</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-sky-600 transition-colors" />
                </Link>

                <Link
                  to="/gallery"
                  className="liquid-glass-card p-4 rounded-2xl hover:border-sky-500/45 transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                      Media Gallery Management
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">Review and curate user media uploads</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-sky-600 transition-colors" />
                </Link>

                <Link
                  to="/admin/event-settings"
                  className="liquid-glass-card p-4 rounded-2xl hover:border-sky-500/45 transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                      Event Configuration
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">Registration toggles, schedule & rules</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-sky-600 transition-colors" />
                </Link>

                <Link
                  to="/admin/winners"
                  className="liquid-glass-card p-4 rounded-2xl hover:border-sky-500/45 transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                      Hall of Fame & Winners
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">Record event podiums and awards</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-sky-600 transition-colors" />
                </Link>

                <Link
                  to="/admin/management-team"
                  className="liquid-glass-card p-4 rounded-2xl hover:border-sky-500/45 transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                      Management Team Roster
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">Organizers, coordinators, faculty</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-sky-600 transition-colors" />
                </Link>

                <Link
                  to="/admin/bulk-passes"
                  className="liquid-glass-card p-4 rounded-2xl hover:border-sky-500/45 transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                      Bulk Pass Generation
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">Export printable attendee badges</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-sky-600 transition-colors" />
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
            <div className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <Clock size={20} className="text-amber-600" />
                  <h2 className="text-lg font-bold text-slate-900">Pending Admin Access Requests</h2>
                  {pendingCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-800 border border-amber-500/35">
                      {pendingCount} Pending
                    </span>
                  )}
                </div>

                <button
                  onClick={fetchRequests}
                  disabled={requestsLoading}
                  aria-label="Refresh access requests"
                  className="liquid-btn-glass px-3.5 py-2 min-h-[44px] text-xs flex items-center gap-1.5 self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <RefreshCw size={13} className={requestsLoading ? 'animate-spin' : ''} />
                  Refresh List
                </button>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-slate-600 border border-dashed border-slate-900/15 rounded-2xl bg-slate-900/[0.02]">
                  <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-600" />
                  <p className="font-semibold text-sm text-slate-900">No pending access requests</p>
                  <p className="text-xs text-slate-600 mt-1">
                    When a new admin attempts to sign in or register, their authorization request will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900/[0.04] text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-900/10">
                      <tr>
                        <th className="py-3 px-4">Admin Email</th>
                        <th className="py-3 px-4">Requested Time</th>
                        <th className="py-3 px-4">Device / IP</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/10">
                      {pendingRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-900/[0.03] transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{req.email}</div>
                            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/12 text-amber-800 border border-amber-500/30">
                              Awaiting Approval
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 text-xs">
                            <div>{formatDate(req.requested_at)}</div>
                            <span className="text-[11px] text-slate-500">
                              Expires: {formatDate(req.expires_at)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 text-xs">
                            <div className="font-mono text-slate-800">{req.ip || 'Unknown IP'}</div>
                            <div className="truncate max-w-[200px] text-[11px] text-slate-500" title={req.user_agent}>
                              {req.user_agent || 'Standard Web Client'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleResolveRequest(req.id, 'approve')}
                                disabled={resolvingId === req.id}
                                aria-label={`Approve request for ${req.email}`}
                                className="px-3 py-1.5 min-h-[38px] rounded-xl bg-emerald-500/12 text-emerald-700 border border-emerald-500/35 hover:bg-emerald-500/20 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                                className="px-3 py-1.5 min-h-[38px] rounded-xl bg-red-500/12 text-red-700 border border-red-400/35 hover:bg-red-500/20 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-400"
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
            <div className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <History size={18} className="text-slate-600" />
                  Recent Authorization History
                </h3>
                {recentRequests.length > 0 && (
                  <button
                    onClick={handleClearAllHistory}
                    aria-label="Clear all authorization history"
                    className="px-3 py-1.5 min-h-[38px] rounded-xl bg-red-500/12 border border-red-400/35 hover:bg-red-500/20 text-red-700 text-xs font-semibold flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <Trash2 size={13} />
                    Clear History
                  </button>
                )}
              </div>

              {recentRequests.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">No authorization history recorded yet.</div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/[0.04] text-slate-700 font-semibold border-b border-slate-900/10">
                      <tr>
                        <th className="py-2.5 px-4">Email</th>
                        <th className="py-2.5 px-4">Outcome</th>
                        <th className="py-2.5 px-4">Resolved By</th>
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/10">
                      {recentRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-900/[0.03] transition-colors">
                          <td className="py-2.5 px-4 font-medium text-slate-900">{req.email}</td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                req.status === 'approved'
                                  ? 'bg-emerald-500/12 text-emerald-700 border border-emerald-500/30'
                                  : req.status === 'rejected'
                                  ? 'bg-red-500/12 text-red-700 border border-red-400/30'
                                  : 'bg-slate-900/10 text-slate-600'
                              }`}
                            >
                              {req.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{req.resolved_by || 'system'}</td>
                          <td className="py-2.5 px-4 text-slate-600">{formatDate(req.resolved_at || req.requested_at)}</td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteHistoryRecord(req.id)}
                              aria-label={`Remove history record for ${req.email}`}
                              className="text-slate-500 hover:text-red-600 p-1.5 rounded transition-colors inline-flex items-center"
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
            <div className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Shield size={20} className="text-sky-600" />
                    Admin Accounts & Governance
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Manage provisioned admin users, revoke access, change roles, or reset credentials.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddAdminModal(true)}
                    aria-label="Add new admin"
                    className="liquid-btn-primary px-3.5 py-2 min-h-[44px] text-xs inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <UserPlus size={15} />
                    Add Admin
                  </button>
                  <button
                    onClick={fetchAdmins}
                    disabled={adminsLoading}
                    aria-label="Refresh admin accounts list"
                    className="liquid-btn-glass px-3.5 py-2 min-h-[44px] text-xs flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <RefreshCw size={13} className={adminsLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Search bar */}
              <div className="mb-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="search-admins"
                    name="search_admins"
                    aria-label="Search admins by email or role"
                    type="text"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    placeholder="Search admins by email or role..."
                    className="liquid-input w-full pl-10 pr-4 py-2.5 text-sm"
                  />
                </div>
              </div>

              {/* Admins Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/[0.04] text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-900/10">
                    <tr>
                      <th className="py-3 px-4">Admin Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Last Login</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/10">
                    {filteredAdmins.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 text-sm">
                          No admin accounts match your search.
                        </td>
                      </tr>
                    ) : (
                      filteredAdmins.map((admin) => {
                        const isCurrent = currentUser?.email?.toLowerCase() === admin.email.toLowerCase();
                        const isSuper = admin.is_super_admin || admin.role === 'super_admin';

                        return (
                          <tr key={admin.id} className="hover:bg-slate-900/[0.03] transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900 flex items-center gap-2">
                                {admin.email}
                                {isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/12 text-blue-700 border border-blue-500/35">
                                    YOU
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Added by {admin.added_by || 'system'} • {formatDate(admin.created_at)}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              {isSuper ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/12 text-sky-800 border border-sky-500/35">
                                  <Crown size={12} />
                                  Super Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/12 text-blue-700 border border-blue-500/35">
                                  <Shield size={12} />
                                  Admin
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              {admin.status === 'active' ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/12 text-emerald-700 border border-emerald-500/35">
                                  Active
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/12 text-red-700 border border-red-400/35">
                                  Revoked / Suspended
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-xs text-slate-600">
                              {formatDate(admin.last_login_at)}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isSuper ? (
                                  <span className="text-xs text-slate-500 italic pr-2">Protected</span>
                                ) : (
                                  <>
                                    {/* Revoke / Reactivate access */}
                                    {admin.status === 'active' ? (
                                      <button
                                        onClick={() => handleRevokeAdminAccess(admin)}
                                        aria-label={`Revoke access for ${admin.email}`}
                                        className="px-2.5 py-1.5 rounded-lg bg-red-500/12 border border-red-400/35 text-red-700 hover:bg-red-500/20 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                                        title="Revoke admin access immediately"
                                      >
                                        Revoke
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleReactivateAdminAccess(admin)}
                                        aria-label={`Restore access for ${admin.email}`}
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/12 border border-emerald-500/35 text-emerald-700 hover:bg-emerald-500/20 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                                      className="p-1.5 rounded-lg bg-slate-900/[0.04] border border-slate-900/15 hover:bg-slate-900/10 text-slate-700 hover:text-slate-900 transition-colors"
                                      title="Reset Password"
                                    >
                                      <KeyRound size={14} />
                                    </button>

                                    {/* Remove admin completely */}
                                    <button
                                      onClick={() => handleRemoveAdminId(admin)}
                                      aria-label={`Remove admin ID ${admin.email}`}
                                      className="p-1.5 rounded-lg bg-red-500/12 border border-red-400/35 hover:bg-red-500/20 text-red-700 transition-colors"
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
              <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                  <span>Total Registrations</span>
                  <Users size={16} className="text-blue-600" />
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {locksLoading ? '—' : lockStats.total}
                </div>
              </div>

              <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                  <span>1st Year (₹599)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                </div>
                <div className="mt-2 text-2xl font-black text-sky-700">
                  {locksLoading ? '—' : lockStats.firstYearCount}
                </div>
              </div>

              <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                  <span>2nd Year (₹699)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                </div>
                <div className="mt-2 text-2xl font-black text-amber-700">
                  {locksLoading ? '—' : lockStats.secondYearCount}
                </div>
              </div>

              <div className="liquid-glass-card p-5 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                  <span>Unlocked Records</span>
                  <Unlock size={16} className="text-emerald-600" />
                </div>
                <div className="mt-2 text-2xl font-black text-emerald-700">
                  {locksLoading ? '—' : lockStats.unlockedCount}
                </div>
              </div>
            </div>

            {/* Quick Year Registration Gateways Control */}
            <div className="liquid-glass-strong p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/12 border border-sky-500/35 text-sky-700">
                  <Shield size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Public Registration Gateways
                    <span className="text-[11px] font-normal text-slate-500">(Super Admin Only)</span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className={`w-2 h-2 rounded-full ${(yearGateways?.enabled_1st_year ?? true) ? 'bg-sky-500' : 'bg-rose-500'}`} />
                      1st Year (₹599): <strong className={(yearGateways?.enabled_1st_year ?? true) ? 'text-sky-700' : 'text-rose-700'}>{(yearGateways?.enabled_1st_year ?? true) ? 'OPEN' : 'PAUSED'}</strong>
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className={`w-2 h-2 rounded-full ${(yearGateways?.enabled_2nd_year ?? true) ? 'bg-amber-500' : 'bg-rose-500'}`} />
                      2nd Year (₹699): <strong className={(yearGateways?.enabled_2nd_year ?? true) ? 'text-amber-700' : 'text-rose-700'}>{(yearGateways?.enabled_2nd_year ?? true) ? 'OPEN' : 'PAUSED'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleYearGateway('1st Year', !(yearGateways?.enabled_1st_year ?? true))}
                  disabled={yearGatewaysLoading || gatewayToggleLoading === '1st Year'}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all backdrop-blur-md shadow-sm ${
                    (yearGateways?.enabled_1st_year ?? true)
                      ? 'bg-rose-600 hover:bg-rose-500 border border-rose-500/40 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 border border-blue-500/40 text-white'
                  } disabled:opacity-50`}
                >
                  {gatewayToggleLoading === '1st Year' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (yearGateways?.enabled_1st_year ?? true) ? (
                    <>
                      <Lock size={13} /> Pause 1st Year
                    </>
                  ) : (
                    <>
                      <Unlock size={13} /> Enable 1st Year
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleToggleYearGateway('2nd Year', !(yearGateways?.enabled_2nd_year ?? true))}
                  disabled={yearGatewaysLoading || gatewayToggleLoading === '2nd Year'}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all backdrop-blur-md shadow-sm ${
                    (yearGateways?.enabled_2nd_year ?? true)
                      ? 'bg-rose-600 hover:bg-rose-500 border border-rose-500/40 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 border border-amber-400/50 text-slate-950'
                  } disabled:opacity-50`}
                >
                  {gatewayToggleLoading === '2nd Year' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (yearGateways?.enabled_2nd_year ?? true) ? (
                    <>
                      <Lock size={13} /> Pause 2nd Year
                    </>
                  ) : (
                    <>
                      <Unlock size={13} /> Enable 2nd Year
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Lock Management Section */}
            <div className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Lock size={20} className="text-sky-600" />
                    Year-Wise Registration Lock Management
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
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
                  className="liquid-btn-glass px-3.5 py-2 min-h-[44px] text-xs flex items-center gap-1.5 self-start md:self-auto focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <RefreshCw size={13} className={locksLoading || auditLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="search-locks"
                    name="search_locks"
                    aria-label="Filter locks by name, email, roll number, or reg ID"
                    type="text"
                    value={locksSearch}
                    onChange={(e) => setLocksSearch(e.target.value)}
                    placeholder="Search by student name, email, roll number, or registration ID..."
                    className="liquid-input w-full pl-10 pr-4 py-2 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Filter size={16} className="text-slate-500 hidden sm:inline-block" />
                  <select
                    value={locksYearFilter}
                    onChange={(e) => setLocksYearFilter(e.target.value as any)}
                    aria-label="Filter locks by academic year"
                    className="liquid-input px-3 py-2 text-xs font-medium"
                  >
                    <option value="all" className="bg-white text-slate-900">All Academic Years</option>
                    <option value="1st Year" className="bg-white text-slate-900">1st Year (₹599)</option>
                    <option value="2nd Year" className="bg-white text-slate-900">2nd Year (₹699)</option>
                  </select>

                  <select
                    value={locksStatusFilter}
                    onChange={(e) => setLocksStatusFilter(e.target.value as any)}
                    aria-label="Filter locks by lock status"
                    className="liquid-input px-3 py-2 text-xs font-medium"
                  >
                    <option value="all" className="bg-white text-slate-900">All Lock Statuses</option>
                    <option value="locked" className="bg-white text-slate-900">Locked Only</option>
                    <option value="unlocked" className="bg-white text-slate-900">Unlocked Only</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/[0.04] text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-900/10">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Academic Year</th>
                      <th className="py-3 px-4">Registration Status</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Lock Status</th>
                      <th className="py-3 px-4 text-right">Super Admin Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/10">
                    {filteredLocks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-500 text-sm">
                          {locksLoading ? 'Loading registration locks...' : 'No registrations found matching the criteria.'}
                        </td>
                      </tr>
                    ) : (
                      filteredLocks.map((item) => (
                        <tr key={`${item.email}-${item.year}-${item.participant_id}`} className="hover:bg-slate-900/[0.03] transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 text-xs">{item.full_name}</div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">{item.email}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Roll: <span className="text-slate-800 font-mono">{item.roll_number || 'N/A'}</span> • {item.branch}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                                item.year === '1st Year'
                                  ? 'bg-sky-500/12 text-sky-800 border-sky-500/35'
                                  : 'bg-amber-500/12 text-amber-800 border-amber-500/35'
                              }`}
                            >
                              {item.year}
                            </span>
                            <div className="text-[10px] text-slate-500 font-mono mt-1">
                              {item.registration_id}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                                item.approval_status === 'approved'
                                  ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/35'
                                  : item.approval_status === 'rejected'
                                  ? 'bg-red-500/12 text-red-700 border-red-400/35'
                                  : 'bg-amber-500/12 text-amber-800 border-amber-500/35'
                              }`}
                            >
                              {item.approval_status === 'approved'
                                ? 'Approved'
                                : item.approval_status === 'rejected'
                                ? 'Rejected'
                                : 'Pending Approval'}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-1">
                              {formatDate(item.registered_at)}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="text-xs font-semibold text-slate-900">
                              ₹{item.payment_amount}
                            </div>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 border ${
                                item.payment_verified || item.payment_status === 'completed'
                                  ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/35'
                                  : item.payment_id
                                  ? 'bg-blue-500/12 text-blue-700 border-blue-500/35'
                                  : 'bg-slate-900/10 text-slate-600 border-slate-900/15'
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
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/12 text-amber-800 border border-amber-500/35">
                                  <Lock size={12} />
                                  Locked
                                </span>
                                {item.locked_at && (
                                  <div className="text-[10px] text-slate-500 mt-0.5" title={item.lock_reason || undefined}>
                                    Locked {formatDate(item.locked_at)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/12 text-emerald-700 border border-emerald-500/35">
                                  <Unlock size={12} />
                                  Unlocked
                                </span>
                                {item.unlocked_by && (
                                  <div className="text-[10px] text-emerald-700 mt-0.5" title={item.unlock_reason || undefined}>
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
                                className="px-3 py-1.5 rounded-lg bg-emerald-500/12 border border-emerald-500/35 text-emerald-700 hover:bg-emerald-500/20 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                                className="px-3 py-1.5 rounded-lg bg-amber-500/12 border border-amber-500/35 text-amber-800 hover:bg-amber-500/20 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
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
            <div className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <History size={18} className="text-sky-600" />
                    Registration Lock Audit Log
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Immutable history of Super Admin unlock and lock actions, reasons, and timestamps.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/[0.04] text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-900/10">
                    <tr>
                      <th className="py-3 px-4">When</th>
                      <th className="py-3 px-4">Super Admin</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Target Student</th>
                      <th className="py-3 px-4">Academic Year</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/10">
                    {lockAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                          {auditLoading ? 'Loading audit history...' : 'No lock or unlock events recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      lockAuditLogs.map((log) => {
                        const isUnlock = log.action === 'unlock_registration';
                        return (
                          <tr key={log.id} className="hover:bg-slate-900/[0.03] transition-colors">
                            <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                              {formatDate(log.created_at)}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-900 font-medium whitespace-nowrap">
                              {log.actor_email}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
                                  isUnlock
                                    ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/35'
                                    : 'bg-amber-500/12 text-amber-800 border-amber-500/35'
                                }`}
                              >
                                {isUnlock ? <Unlock size={11} /> : <Lock size={11} />}
                                {isUnlock ? 'UNLOCKED' : 'LOCKED'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs font-mono text-slate-700 whitespace-nowrap">
                              {log.details?.email || 'N/A'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="text-xs font-bold text-sky-700">
                                {log.details?.year || 'N/A'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">
                              <span className="italic text-slate-500">
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
            <div className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <History size={20} className="text-sky-600" />
                    Audit & Activity Log
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Comprehensive log of all administrative actions, approvals, revokes, and updates.
                  </p>
                </div>

                <button
                  onClick={fetchActivityLogs}
                  disabled={logsLoading}
                  aria-label="Refresh activity logs"
                  className="liquid-btn-glass px-3.5 py-2 min-h-[44px] text-xs flex items-center gap-1.5 self-start md:self-auto focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="search-logs"
                    name="search_logs"
                    aria-label="Filter logs by admin, action, or details"
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Filter by admin, action, or details..."
                    className="liquid-input w-full pl-10 pr-4 py-2 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-slate-500" />
                  <select
                    value={logActionFilter}
                    onChange={(e) => setLogActionFilter(e.target.value)}
                    aria-label="Filter activity logs by category"
                    className="liquid-input px-3 py-2 text-xs font-medium"
                  >
                    <option value="all" className="bg-white text-slate-900">All Actions</option>
                    <option value="approvals" className="bg-white text-slate-900">Login Approvals & Requests</option>
                    <option value="admins" className="bg-white text-slate-900">Admin Management</option>
                    <option value="participants" className="bg-white text-slate-900">Participant Actions</option>
                    <option value="media" className="bg-white text-slate-900">Media Actions</option>
                  </select>
                </div>
              </div>

              {/* Log Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/55">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/[0.04] text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-900/10">
                    <tr>
                      <th className="py-3 px-4">When</th>
                      <th className="py-3 px-4">Who (Actor)</th>
                      <th className="py-3 px-4">What (Action)</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/10">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-slate-500 text-sm">
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
                          <tr key={log.id} className="hover:bg-slate-900/[0.03] transition-colors">
                            <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                              {formatDate(log.created_at)}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-900 text-xs">{log.actor_email || 'System'}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/12 text-sky-800 border border-sky-500/35">
                                {log.action}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 max-w-md">
                              <div className="truncate font-mono text-[11px] text-slate-500" title={detailsStr}>
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
          className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="liquid-glass-strong rounded-3xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 id="add-admin-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserPlus size={18} className="text-sky-600" />
                Provision New Admin
              </h3>
              <button
                onClick={() => setShowAddAdminModal(false)}
                className="liquid-icon-bubble !w-8 !h-8 text-slate-600 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            {addAdminError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/12 border border-red-400/35 text-xs text-red-700">
                {addAdminError}
              </div>
            )}

            <form onSubmit={handleAddAdminSubmit} className="space-y-4">
              <div>
                <label htmlFor="provision-admin-email" className="block text-xs font-semibold text-slate-700 mb-1">Gmail Address</label>
                <input
                  id="provision-admin-email"
                  name="email"
                  autoComplete="email"
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="liquid-input w-full px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="provision-admin-password" className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
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
                    className="liquid-input w-full px-3.5 py-2 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    aria-label={showNewAdminPw ? "Hide password" : "Show password"}
                    onClick={() => setShowNewAdminPw(!showNewAdminPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                  >
                    {showNewAdminPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(false)}
                  className="liquid-btn-glass px-4 py-2 min-h-[44px] text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addAdminLoading}
                  className="liquid-btn-primary px-4 py-2 min-h-[44px] text-xs disabled:opacity-50"
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
          className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="liquid-glass-strong rounded-3xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 id="reset-pw-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
                <KeyRound size={18} className="text-amber-600" />
                Reset Password
              </h3>
              <button
                onClick={() => setPasswordResetTarget(null)}
                className="liquid-icon-bubble !w-8 !h-8 text-slate-600 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              Reset password for <span className="font-semibold text-slate-900">{passwordResetTarget.email}</span>. All active sessions for this admin will be revoked immediately.
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-admin-password" className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
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
                    className="liquid-input w-full px-3.5 py-2 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    aria-label={showResetPw ? "Hide password" : "Show password"}
                    onClick={() => setShowResetPw(!showResetPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                  >
                    {showResetPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordResetTarget(null)}
                  className="liquid-btn-glass px-4 py-2 min-h-[44px] text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50"
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
          className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="liquid-glass-strong rounded-3xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4 border-b border-slate-900/10 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    toggleTarget.action === 'unlock'
                      ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/35'
                      : 'bg-amber-500/15 text-amber-700 border border-amber-500/35'
                  }`}
                >
                  {toggleTarget.action === 'unlock' ? <Unlock size={20} /> : <Lock size={20} />}
                </div>
                <div>
                  <h3 id="lock-toggle-modal-title" className="text-base font-bold text-slate-900">
                    {toggleTarget.action === 'unlock' ? 'Unlock Registration' : 'Re-Lock Registration'}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Academic Year: <span className="text-sky-700 font-semibold">{toggleTarget.item.year}</span>
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
                className="liquid-icon-bubble !w-8 !h-8 text-slate-600 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div className="p-3.5 rounded-2xl bg-slate-900/[0.04] border border-slate-900/10 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Student Name:</span>
                  <span className="text-slate-900 font-medium">{toggleTarget.item.full_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Email:</span>
                  <span className="text-slate-900 font-mono">{toggleTarget.item.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Roll Number:</span>
                  <span className="text-slate-900 font-mono">{toggleTarget.item.roll_number || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Academic Year:</span>
                  <span className="text-sky-700 font-semibold">{toggleTarget.item.year}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Registration ID:</span>
                  <span className="text-slate-900 font-mono">{toggleTarget.item.registration_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Current Lock Status:</span>
                  <span className={`font-semibold ${toggleTarget.item.is_locked ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {toggleTarget.item.is_locked ? 'Locked' : 'Unlocked'}
                  </span>
                </div>
              </div>

              <div
                className={`p-3.5 rounded-2xl text-xs border ${
                  toggleTarget.action === 'unlock'
                    ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-900'
                    : 'bg-amber-500/12 border-amber-500/35 text-amber-950'
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
                <label htmlFor="lock-reason" className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                  className="liquid-input w-full p-3 text-xs"
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
                className="liquid-btn-glass px-4 py-2 min-h-[44px] text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleLockSubmit}
                disabled={toggleLoading}
                className={`px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-2 ${
                  toggleTarget.action === 'unlock'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-400'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400 focus:ring-amber-400'
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
          className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="liquid-glass-strong rounded-3xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  confirmDialog.confirmVariant === 'danger'
                    ? 'bg-red-500/15 text-red-700 border border-red-400/35'
                    : 'bg-amber-500/15 text-amber-700 border border-amber-500/35'
                }`}
              >
                <AlertTriangle size={20} />
              </div>
              <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
                {confirmDialog.title}
              </h3>
            </div>

            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed mb-6">
              {confirmDialog.message}
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={confirmWorking}
                className="liquid-btn-glass px-4 py-2 min-h-[44px] text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
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
                    ? 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-400'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400 focus:ring-amber-400'
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

