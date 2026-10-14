import { apiFetch } from '../../lib/api';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Users,
  Database,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Download,
  Search,
  RefreshCw,
  LogOut,
  Clock,
  Laptop,
  Image,
  History,
  Trash2,
  Shield,
  UserX,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { authHeaders, removeToken } from '../../lib/auth';
import { readJsonSafe, getErrorMessage } from '../../lib/http';

interface PendingApproval {
  id: string;
  user_id: number;
  email: string;
  ip: string;
  user_agent: string;
  status: string;
  requested_at: string;
  expires_at: string;
}

interface SessionRecord {
  id: string;
  masked_id: string;
  user_id: number;
  email: string;
  role: string;
  status: string;
  ip: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

export default function ControlCenter() {
  const [activeTab, setActiveTab] = useState<'approvals' | 'admins' | 'participants' | 'sessions' | 'logs' | 'media'>('approvals');
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [recentApprovals, setRecentApprovals] = useState<PendingApproval[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [tabData, setTabData] = useState<Record<string, unknown[]>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

  const navigate = useNavigate();

  const fetchApprovals = useCallback(async () => {
    try {
      setApprovalsLoading(true);
      const res = await apiFetch('/api/auth/approvals', { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          navigate('/admin', { replace: true });
          return;
        }
        return;
      }
      const data = await readJsonSafe<{ pending?: PendingApproval[]; recent?: PendingApproval[] }>(res);
      setPendingApprovals(data?.pending || []);
      setRecentApprovals(data?.recent || []);
    } catch (err) {
      console.error('Fetch approvals error:', err);
    } finally {
      setApprovalsLoading(false);
    }
  }, [navigate]);

  const fetchDataForTab = useCallback(async (tab: string) => {
    try {
      setDataLoading(true);
      let section = 'participants';
      if (tab === 'admins') section = 'admins';
      else if (tab === 'sessions') section = 'sessions';
      else if (tab === 'logs') section = 'activity_logs';
      else if (tab === 'media') section = 'media';

      const res = await apiFetch(`/api/control/data?section=${section}`, { headers: authHeaders() });
      if (res.ok) {
        const payload = await readJsonSafe<{ data?: unknown[] }>(res);
        setTabData(prev => ({ ...prev, [tab]: payload?.data || [] }));
      }
    } catch (err) {
      console.error('Fetch tab data error:', err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Poll approvals every 4 seconds
  useEffect(() => {
    fetchApprovals();
    const interval = window.setInterval(fetchApprovals, 4000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  // Load active tab data on change
  useEffect(() => {
    if (activeTab !== 'approvals') {
      fetchDataForTab(activeTab);
    }
  }, [activeTab, fetchDataForTab]);

  const handleResolve = async (requestId: string, action: 'approve' | 'reject') => {
    setResolvingId(requestId);
    setActionMessage(null);
    try {
      const res = await apiFetch('/api/auth/approval-resolve', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ request_id: requestId, action }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, `Failed to ${action} request`));

      setActionMessage({
        text: `Request successfully ${action === 'approve' ? 'approved' : 'rejected'}.`,
        type: 'success',
      });
      fetchApprovals();
      if (activeTab === 'sessions') fetchDataForTab('sessions');
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : 'Action failed',
        type: 'error',
      });
    } finally {
      setResolvingId(null);
    }
  };

  const handleDeleteApprovalHistory = async (id: string) => {
    try {
      const res = await apiFetch(`/api/auth/approvals?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to remove history record'));

      setActionMessage({ text: 'History record removed.', type: 'success' });
      fetchApprovals();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Delete failed', type: 'error' });
    }
  };

  const handleClearAllApprovalHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all authorization history records?')) return;
    try {
      const res = await apiFetch('/api/auth/approvals?all=true', {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to clear history'));

      setActionMessage({ text: 'All authorization history cleared.', type: 'success' });
      fetchApprovals();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Clear failed', type: 'error' });
    }
  };

  const handleRemoveAdminAccount = async (email: string) => {
    if (
      !window.confirm(
        `Are you sure you want to completely REMOVE Admin ID "${email}"?\n\nThis will delete the admin account from the system and immediately revoke all their active sessions.`
      )
    ) {
      return;
    }
    try {
      const res = await apiFetch(`/api/control/admins?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to remove admin account'));

      setActionMessage({ text: `Admin ID "${email}" removed successfully. All sessions revoked.`, type: 'success' });
      fetchApprovals();
      fetchDataForTab('admins');
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Delete failed', type: 'error' });
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setActionMessage(null);
    try {
      const res = await apiFetch(`/api/control/sessions?session_id=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to revoke session'));

      setActionMessage({ text: 'Session revoked successfully.', type: 'success' });
      setRevokeConfirmId(null);
      fetchDataForTab('sessions');
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Revoke failed', type: 'error' });
    }
  };

  const handleSignOut = async () => {
    try {
      await apiFetch('/api/auth/signout', { method: 'POST', headers: authHeaders() });
    } catch {
      // ignore
    }
    removeToken();
    navigate('/admin/login', { replace: true });
  };

  // Export helper
  const handleExport = (format: 'xlsx' | 'csv' | 'json') => {
    const data = (tabData[activeTab] || []) as Record<string, unknown>[];
    if (data.length === 0) {
      setActionMessage({ text: 'No data available to export.', type: 'error' });
      return;
    }

    if (format === 'json') {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ignite26-${activeTab}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(data);
      if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ignite26-${activeTab}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, activeTab);
        XLSX.writeFile(wb, `ignite26-${activeTab}.xlsx`);
      }
    }
    setActionMessage({ text: `Exported ${data.length} records as ${format.toUpperCase()}.`, type: 'success' });
  };

  const filteredData = useMemo(() => {
    const raw = (tabData[activeTab] || []) as Record<string, unknown>[];
    if (!searchTerm.trim()) return raw;
    const term = searchTerm.toLowerCase();
    return raw.filter((item) =>
      Object.values(item).some((val) =>
        String(val ?? '').toLowerCase().includes(term)
      )
    );
  }, [tabData, activeTab, searchTerm]);

  return (
    <div className="min-h-screen bg-[#111411] text-white">
      {/* TOP HEADER */}
      <header className="border-b border-[#303a32] bg-[#141916]/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-olive-500 flex items-center justify-center font-black">
              <ShieldAlert size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold">Ignite 2.O</h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  Super Admin Control Center
                </span>
              </div>
              <p className="text-xs text-gray-400">Master Access & Governance</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/admin"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#191e1b] border border-[#303a32] hover:bg-[#222924] transition-colors"
            >
              Standard Dashboard
            </Link>
            <Link
              to="/admin/control/admins"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-olive-500/15 border border-olive-500/40 text-olive-300 hover:bg-olive-500/25 transition-colors flex items-center gap-1.5"
            >
              <Users size={14} />
              Manage Admins
            </Link>
            <button
              onClick={handleSignOut}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {actionMessage && (
          <div
            className={`p-4 rounded-xl mb-6 text-sm flex items-center justify-between border ${
              actionMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-xs opacity-70 hover:opacity-100 ml-4 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-2 border-b border-[#303a32] pb-4 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'approvals'
                ? 'bg-blue-600 text-white'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32]'
            }`}
          >
            <Clock size={16} />
            Login Approvals
            {pendingApprovals.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-400 text-black">
                {pendingApprovals.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('admins')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'admins'
                ? 'bg-blue-600 text-white'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32]'
            }`}
          >
            <Shield size={16} />
            Admin Accounts
          </button>

          <button
            onClick={() => setActiveTab('participants')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'participants'
                ? 'bg-blue-600 text-white'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32]'
            }`}
          >
            <Users size={16} />
            Participants
          </button>

          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'sessions'
                ? 'bg-blue-600 text-white'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32]'
            }`}
          >
            <Laptop size={16} />
            Active Sessions
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32]'
            }`}
          >
            <History size={16} />
            Activity Logs
          </button>

          <button
            onClick={() => setActiveTab('media')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'media'
                ? 'bg-blue-600 text-white'
                : 'bg-[#191e1b] text-gray-400 hover:text-white border border-[#303a32]'
            }`}
          >
            <Image size={16} />
            Media Gallery
          </button>
        </div>

        {/* TAB 1: PENDING APPROVALS */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-amber-400" />
                  <h2 className="text-base font-bold">Pending Admin Login Authorizations</h2>
                </div>
                <button
                  onClick={fetchApprovals}
                  disabled={approvalsLoading}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={12} className={approvalsLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {pendingApprovals.length === 0 ? (
                <div className="text-center py-10 text-gray-400 border border-dashed border-[#303a32] rounded-xl">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400" />
                  <p className="text-sm font-medium">No pending login authorization requests.</p>
                  <p className="text-xs text-gray-500 mt-1">
                    When regular admins sign in, their requests will appear here in real time.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingApprovals.map((req) => (
                    <div
                      key={req.id}
                      className="p-5 rounded-xl bg-[#222924] border border-[#3a473d] flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white text-base">{req.email}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Pending Approval
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                          <span>IP: <strong className="text-gray-300">{req.ip || 'Unknown'}</strong></span>
                          <span>Requested: <strong className="text-gray-300">{new Date(req.requested_at).toLocaleTimeString()}</strong></span>
                          <span>Expires: <strong className="text-amber-300">{new Date(req.expires_at).toLocaleTimeString()}</strong></span>
                        </div>
                        {req.user_agent && (
                          <p className="text-[11px] text-gray-500 font-mono mt-1 truncate max-w-xl">
                            {req.user_agent}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleResolve(req.id, 'approve')}
                          disabled={resolvingId === req.id}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} />
                          Approve
                        </button>
                        <button
                          onClick={() => handleResolve(req.id, 'reject')}
                          disabled={resolvingId === req.id}
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <XCircle size={14} />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RECENT RESOLVED REQUESTS */}
            {recentApprovals.length > 0 && (
              <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-300">Recent Authorization History</h3>
                    <p className="text-xs text-gray-500">History of resolved login approval requests.</p>
                  </div>
                  <button
                    onClick={handleClearAllApprovalHistory}
                    className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    title="Clear all authorization history"
                  >
                    <Trash2 size={12} />
                    Clear All
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#303a32] text-gray-400">
                        <th className="py-2 px-3">Admin Email</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">IP Address</th>
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#303a32]/50">
                      {recentApprovals.map((item) => (
                        <tr key={item.id} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 font-medium text-white">{item.email}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.status === 'approved'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : item.status === 'rejected'
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-gray-500/20 text-gray-300'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-400">{item.ip || '—'}</td>
                          <td className="py-2.5 px-3 text-gray-400">
                            {new Date(item.requested_at).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleRemoveAdminAccount(item.email)}
                                className="px-2.5 py-1 rounded bg-red-600/20 border border-red-500/40 hover:bg-red-600/30 text-red-300 font-bold text-[11px] inline-flex items-center gap-1 transition-colors shadow-sm"
                                title={`Completely remove Admin ID "${item.email}" and revoke all active sessions`}
                              >
                                <UserX size={11} />
                                Remove ID
                              </button>
                              <button
                                onClick={() => handleDeleteApprovalHistory(item.id)}
                                className="p-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                title="Clear this log record"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2, 3, 4, 5: DATA TABLES & SESSIONS */}
        {activeTab !== 'approvals' && (
          <div className="space-y-4">
            {/* ACTION BAR: SEARCH & EXPORT */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#191e1b] border border-[#303a32] rounded-2xl p-4">
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Search ${activeTab}...`}
                  className="w-full bg-[#111411] border border-[#303a32] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => fetchDataForTab(activeTab)}
                  disabled={dataLoading}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={12} className={dataLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={() => handleExport('xlsx')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet size={14} />
                  Export XLSX
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="px-3.5 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="px-3.5 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Database size={14} />
                  Export JSON
                </button>
              </div>
            </div>

            {/* ADMIN ACCOUNTS SPECIFIC VIEW */}
            {activeTab === 'admins' ? (
              <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 bg-[#141916] border-b border-[#303a32] flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">Administrator Accounts</h3>
                    <p className="text-xs text-gray-400">Super Admins can remove any Admin ID or manage access.</p>
                  </div>
                  <Link
                    to="/admin/control/admins"
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-olive-500 text-white font-bold text-xs flex items-center gap-1.5 hover:opacity-95 transition-opacity"
                  >
                    <Users size={14} />
                    Add / Full Admin Manager
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#141916] text-gray-400 border-b border-[#303a32]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Admin Account</th>
                        <th className="py-3 px-4 font-semibold">Role</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Created</th>
                        <th className="py-3 px-4 font-semibold">Last Login</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#303a32]">
                      {filteredData.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-400">
                            {dataLoading ? 'Loading admin accounts...' : 'No admins found.'}
                          </td>
                        </tr>
                      ) : (
                        filteredData.map((raw) => {
                          const adm = raw as Record<string, unknown>;
                          const email = String(adm.email || '');
                          const isSuper = Boolean(adm.is_configured_super_admin || adm.role === 'super_admin');
                          const status = String(adm.status || 'active');
                          const isApproved = Boolean(adm.is_approved);
                          return (
                            <tr key={String(adm.id || email)} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] ${
                                    isSuper ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-olive-500/20 text-olive-300 border border-olive-500/30'
                                  }`}>
                                    {isSuper ? <ShieldAlert size={14} /> : <Shield size={14} />}
                                  </div>
                                  <span className="font-bold text-white text-sm">{email}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {isSuper ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                    SUPER ADMIN
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-olive-500/20 text-olive-300 border border-olive-500/40">
                                    ADMIN
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                                  }`}>
                                    {status.toUpperCase()}
                                  </span>
                                  {!isSuper && isApproved && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                                      Approved
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-gray-400">
                                {adm.created_at ? new Date(String(adm.created_at)).toLocaleDateString() : '—'}
                              </td>
                              <td className="py-3 px-4 text-gray-400">
                                {adm.last_login_at ? new Date(String(adm.last_login_at)).toLocaleString() : 'Never'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {isSuper ? (
                                  <span className="text-[11px] text-gray-500 italic">Server Configured (Locked)</span>
                                ) : (
                                  <button
                                    onClick={() => handleRemoveAdminAccount(email)}
                                    className="px-3 py-1.5 rounded-xl bg-red-600/20 border border-red-500/40 hover:bg-red-600/30 text-red-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-sm"
                                    title={`Remove Admin ID ${email}`}
                                  >
                                    <UserX size={13} />
                                    Remove Admin ID
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : activeTab === 'sessions' ? (
              <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#141916] text-gray-400 border-b border-[#303a32]">
                      <tr>
                        <th className="py-3 px-4">Admin Email</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">IP Address</th>
                        <th className="py-3 px-4">Device / Client</th>
                        <th className="py-3 px-4">Created At</th>
                        <th className="py-3 px-4">Last Seen</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#303a32]">
                      {filteredData.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-gray-400">
                            No sessions found.
                          </td>
                        </tr>
                      ) : (
                        filteredData.map((raw) => {
                          const s = raw as unknown as SessionRecord;
                          return (
                            <tr key={s.id} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-4">
                                <span className="font-bold text-white">{s.email}</span>
                                {s.is_current && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                    Current
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    s.status === 'active'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-red-500/20 text-red-300'
                                  }`}
                                >
                                  {s.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-gray-300">{s.ip}</td>
                              <td className="py-3 px-4 text-gray-400 font-mono text-[11px] truncate max-w-xs">
                                {s.user_agent}
                              </td>
                              <td className="py-3 px-4 text-gray-400">
                                {new Date(s.created_at).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-gray-400">
                                {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : '—'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {s.status === 'active' && (
                                  revokeConfirmId === s.id ? (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => handleRevokeSession(s.id)}
                                        className="px-2.5 py-1 rounded bg-red-600 text-white font-bold text-[11px]"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        onClick={() => setRevokeConfirmId(null)}
                                        className="px-2 py-1 rounded bg-gray-600 text-white text-[11px]"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setRevokeConfirmId(s.id)}
                                      className="px-2.5 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-semibold text-[11px]"
                                    >
                                      Revoke
                                    </button>
                                  )
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* GENERIC DATA TABLE VIEW */
              <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#141916] text-gray-400 border-b border-[#303a32] sticky top-0">
                      <tr>
                        {filteredData.length > 0 &&
                          Object.keys(filteredData[0])
                            .filter((k) => !k.includes('password') && !k.includes('token') && !k.includes('hash'))
                            .map((col) => (
                              <th key={col} className="py-3 px-4 uppercase tracking-wider text-[11px]">
                                {col.replace(/_/g, ' ')}
                              </th>
                            ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#303a32]">
                      {filteredData.length === 0 ? (
                        <tr>
                          <td className="py-8 text-center text-gray-400" colSpan={8}>
                            {dataLoading ? 'Loading records...' : 'No records found.'}
                          </td>
                        </tr>
                      ) : (
                        filteredData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            {Object.entries(row)
                              .filter(([k]) => !k.includes('password') && !k.includes('token') && !k.includes('hash'))
                              .map(([col, val]) => (
                                <td key={col} className="py-3 px-4 max-w-xs truncate text-gray-300">
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
                                </td>
                              ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

