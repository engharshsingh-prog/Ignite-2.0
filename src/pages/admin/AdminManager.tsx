import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Shield,
  ShieldAlert,
  UserPlus,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { authHeaders, removeToken } from '../../lib/auth';
import { readJsonSafe, getErrorMessage } from '../../lib/http';

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

export default function AdminManager() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New admin form
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Password reset modal
  const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);

  const navigate = useNavigate();

  const fetchAdmins = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/control/admins', { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          navigate('/admin', { replace: true });
          return;
        }
        return;
      }
      const data = await readJsonSafe<{ admins?: AdminAccount[] }>(res);
      setAdmins(data?.admins || []);
    } catch (err) {
      console.error('Fetch admins error:', err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      const res = await fetch('/api/control/admins', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), password: newPassword }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to add admin'));

      setActionMessage({ text: `Admin ${newEmail} created successfully.`, type: 'success' });
      setShowAddModal(false);
      setNewEmail('');
      setNewPassword('');
      fetchAdmins();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add admin');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleStatus = async (admin: AdminAccount) => {
    const nextStatus = admin.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch('/api/control/admins', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id: admin.id, status: nextStatus }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, `Failed to ${nextStatus} admin`));

      setActionMessage({ text: `Admin ${admin.email} is now ${nextStatus}.`, type: 'success' });
      fetchAdmins();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Action failed', type: 'error' });
    }
  };

  const handleToggleApproval = async (admin: AdminAccount) => {
    const nextApproved = !admin.is_approved;
    try {
      const res = await fetch('/api/control/admins', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id: admin.id, is_approved: nextApproved }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update approval status'));

      setActionMessage({
        text: nextApproved
          ? `${admin.email} is now approved! They can log in directly without requests.`
          : `Approval revoked for ${admin.email}. They will need approval on next login.`,
        type: 'success',
      });
      fetchAdmins();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Action failed', type: 'error' });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const res = await fetch('/api/control/admins', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id: resetTarget.id, new_password: resetPassword }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to reset password'));

      setActionMessage({ text: `Password updated for ${resetTarget.email}.`, type: 'success' });
      setResetTarget(null);
      setResetPassword('');
      fetchAdmins();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Reset failed', type: 'error' });
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/control/admins?id=${deleteTarget.id}&email=${encodeURIComponent(deleteTarget.email)}`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id: deleteTarget.id, email: deleteTarget.email }),
      });
      const data = await readJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to remove admin'));

      setActionMessage({ text: `Admin ${deleteTarget.email} removed.`, type: 'success' });
      setDeleteTarget(null);
      fetchAdmins();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Delete failed', type: 'error' });
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST', headers: authHeaders() });
    } catch {
      // ignore
    }
    removeToken();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-screen text-slate-900">
      {/* HEADER */}
      <header className="border-b border-slate-900/10 bg-white/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="liquid-icon-bubble w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 font-black">
              <Users size={20} className="text-sky-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">Admin Governance</h1>
                <span className="liquid-glass-pill px-2.5 py-0.5 rounded-full text-[11px] font-bold text-sky-800 border-sky-400/40">
                  Super Admin Exclusive
                </span>
              </div>
              <p className="text-xs text-slate-500">Manage Portal Administrators & Access Roles</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/admin/control"
              className="liquid-btn-glass px-3.5 py-2 rounded-xl text-xs font-semibold border-sky-400/40 text-sky-800 flex items-center gap-1.5"
            >
              <ShieldAlert size={14} />
              Control Center
            </Link>
            <Link
              to="/admin"
              className="liquid-btn-glass px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700"
            >
              Dashboard
            </Link>
            <button
              onClick={handleSignOut}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/12 border border-red-400/35 text-red-700 hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
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
            className={`liquid-glass p-4 rounded-2xl mb-6 text-sm flex items-center justify-between font-medium ${
              actionMessage.type === 'success'
                ? 'border-emerald-500/35 bg-emerald-50/85 text-emerald-800'
                : 'border-red-400/35 bg-red-50/85 text-red-700'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-xs opacity-75 hover:opacity-100 ml-4 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ACTION BAR */}
        <div className="liquid-glass-strong flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl p-5 mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Administrator Accounts</h2>
            <p className="text-xs text-slate-600">
              Only Super Admins can add, suspend, reactivate, or remove admin portal users.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAdmins}
              disabled={loading}
              className="liquid-btn-glass px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => {
                setShowAddModal(true);
                setFormError('');
              }}
              className="liquid-btn-primary px-4 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-1.5"
            >
              <UserPlus size={16} />
              Add Administrator
            </button>
          </div>
        </div>

        {/* ADMINS TABLE */}
        <div className="liquid-glass-strong rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/[0.04] text-sky-800 border-b border-slate-900/10">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Admin Account</th>
                  <th className="py-3.5 px-4 font-semibold">Role</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold">Added By</th>
                  <th className="py-3.5 px-4 font-semibold">Created</th>
                  <th className="py-3.5 px-4 font-semibold">Last Login</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/10">
                {admins.map((adm) => (
                  <tr key={adm.id} className="hover:bg-sky-500/[0.04] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`liquid-icon-bubble w-7 h-7 rounded-lg font-bold text-[11px] ${
                            adm.is_super_admin
                              ? 'border-sky-400/40 text-sky-700'
                              : 'border-violet-400/40 text-violet-700'
                          }`}
                        >
                          {adm.is_super_admin ? <ShieldAlert size={14} /> : <Shield size={14} />}
                        </div>
                        <span className="font-bold text-slate-900 text-sm">{adm.email}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {adm.is_super_admin ? (
                        <span className="liquid-glass-pill px-2.5 py-0.5 rounded-full text-[10px] font-black text-sky-800 border-sky-400/40">
                          SUPER ADMIN
                        </span>
                      ) : (
                        <span className="liquid-glass-pill px-2.5 py-0.5 rounded-full text-[10px] font-bold text-violet-700 border-violet-400/40">
                          ADMIN
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            adm.status === 'active'
                              ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/35'
                              : 'bg-red-500/12 text-red-700 border-red-400/35'
                          }`}
                        >
                          {adm.status.toUpperCase()}
                        </span>
                        {!adm.is_super_admin && (
                          adm.is_approved ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 size={10} /> Approved
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/12 text-amber-800 border border-amber-500/35">
                              Pending 1st Approval
                            </span>
                          )
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">{adm.added_by}</td>

                    <td className="py-3.5 px-4 text-slate-600">
                      {adm.created_at ? new Date(adm.created_at).toLocaleDateString() : '—'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      {adm.last_login_at ? new Date(adm.last_login_at).toLocaleString() : 'Never'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {adm.is_super_admin ? (
                        <span className="text-[11px] text-slate-500 italic">Server Configured (Locked)</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {!adm.is_approved ? (
                            <button
                              onClick={() => handleToggleApproval(adm)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/12 border border-emerald-500/35 text-emerald-700 hover:bg-emerald-500/20 transition-colors"
                              title="Pre-approve admin for direct login"
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleApproval(adm)}
                              className="liquid-btn-glass px-2.5 py-1 rounded-lg text-[10px] font-semibold text-slate-700 hover:text-slate-900"
                              title="Revoke approval (forces re-approval on next login)"
                            >
                              Revoke
                            </button>
                          )}

                          <button
                            onClick={() => handleToggleStatus(adm)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                              adm.status === 'active'
                                ? 'bg-amber-500/12 border-amber-500/35 text-amber-800 hover:bg-amber-500/20'
                                : 'bg-emerald-500/12 border-emerald-500/35 text-emerald-700 hover:bg-emerald-500/20'
                            }`}
                          >
                            {adm.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </button>

                          <button
                            onClick={() => {
                              setResetTarget(adm);
                              setResetPassword('');
                            }}
                            className="liquid-icon-bubble w-7 h-7 rounded-lg text-slate-700"
                            title="Reset Password"
                          >
                            <KeyRound size={13} />
                          </button>

                          <button
                            onClick={() => setDeleteTarget(adm)}
                            className="w-7 h-7 rounded-lg bg-red-500/12 border border-red-400/35 hover:bg-red-500/20 text-red-700 flex items-center justify-center transition-colors"
                            title="Remove Admin"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ADD ADMIN MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-strong rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="liquid-icon-bubble w-10 h-10 rounded-xl border-sky-400/35 text-sky-600 font-bold">
                <UserPlus size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Administrator</h3>
                <p className="text-xs text-slate-600">Grant admin dashboard access</p>
              </div>
            </div>

            {formError && (
              <div className="liquid-glass p-3 rounded-xl border-red-400/40 bg-red-50/85 text-red-700 text-xs mb-4 flex items-center gap-2 font-medium">
                <AlertCircle size={14} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Admin Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="liquid-input w-full rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Initial Password (min 8 chars)</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    className="liquid-input w-full rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-sky-700"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="liquid-glass p-3 rounded-xl border-sky-400/35 text-sky-900 text-[11px] leading-relaxed">
                When this admin signs in, you (Super Admin) will receive a real-time authorization request to approve their session.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="liquid-btn-glass px-4 py-2 rounded-xl text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="liquid-btn-primary px-5 py-2 rounded-xl text-white font-bold text-xs disabled:opacity-50"
                >
                  {formLoading ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-strong rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-2">Reset Password</h3>
            <p className="text-xs text-slate-600 mb-4">
              Enter a new password for <strong className="text-slate-900">{resetTarget.email}</strong>:
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="relative">
                <input
                  type={showResetPw ? 'text' : 'password'}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  required
                  minLength={8}
                  className="liquid-input w-full rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPw(!showResetPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-sky-700"
                >
                  {showResetPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="liquid-btn-glass px-4 py-2 rounded-xl text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="liquid-btn-primary px-5 py-2 rounded-xl text-white font-bold text-xs disabled:opacity-50"
                >
                  {resetLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-strong rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="liquid-icon-bubble w-12 h-12 rounded-full border-red-400/40 bg-red-500/12 text-red-600 mx-auto mb-4">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Remove Administrator?</h3>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to remove <strong className="text-slate-900">{deleteTarget.email}</strong>? All their active sessions will be revoked immediately.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="liquid-btn-glass px-4 py-2 rounded-xl text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAdmin}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-lg shadow-red-500/20 transition-colors"
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

