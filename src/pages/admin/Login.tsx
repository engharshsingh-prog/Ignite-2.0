import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, AlertCircle, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { checkAdminAuth, setToken, subscribeToAdminAuth } from '../../lib/auth';
import { getErrorMessage, readJsonSafe } from '../../lib/http';

interface PendingRequestState {
  requestId: string;
  token: string;
  email: string;
  expiresAt: string;
}

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingRequest, setPendingRequest] = useState<PendingRequestState | null>(null);
  const [pollStatus, setPollStatus] = useState<'pending' | 'approved' | 'rejected' | 'expired'>('pending');
  const [pollMessage, setPollMessage] = useState('Waiting for a Super Admin to authorize your session...');
  const pollTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const verify = async () => {
      const user = await checkAdminAuth();
      if (user) navigate('/admin', { replace: true });
    };
    verify();
    return subscribeToAdminAuth(() => {
      verify();
    });
  }, [navigate]);

  // Polling effect for pending requests
  useEffect(() => {
    if (!pendingRequest || pollStatus !== 'pending') return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/auth/approval-status?request_id=${encodeURIComponent(pendingRequest.requestId)}`);
        const data = await readJsonSafe<{ status?: string; token?: string; message?: string }>(res);
        if (data?.status === 'approved') {
          setPollStatus('approved');
          setPollMessage('Approval granted! Redirecting to admin dashboard...');
          const activeToken = data.token || pendingRequest.token;
          setToken(activeToken);
          window.setTimeout(() => {
            navigate('/admin', { replace: true });
          }, 1200);
        } else if (data?.status === 'rejected') {
          setPollStatus('rejected');
          setPollMessage(data.message || 'Your login request was rejected by a Super Admin.');
        } else if (data?.status === 'expired') {
          setPollStatus('expired');
          setPollMessage('This approval request has expired. Please sign in again.');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Check immediately, then poll every 3 seconds
    checkStatus();
    pollTimerRef.current = window.setInterval(checkStatus, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [pendingRequest, pollStatus, navigate]);

  const handleCancelRequest = async () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (pendingRequest) {
      try {
        await fetch('/api/auth/approval-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: pendingRequest.requestId, token: pendingRequest.token }),
        });
      } catch {
        // ignore
      }
    }
    setPendingRequest(null);
    setPollStatus('pending');
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const data = await readJsonSafe<{
        token?: string;
        pending?: boolean;
        request_id?: string;
        expires_at?: string;
        approved?: boolean;
        error?: string;
      }>(res);

      if (!res.ok) throw new Error(getErrorMessage(data, 'Login failed'));

      // If Super Admin (direct approval)
      if (data?.approved && data?.token) {
        setToken(data.token);
        navigate('/admin', { replace: true });
        return;
      }

      // If Regular Admin (requires Super Admin approval)
      if (data?.pending && data?.request_id && data?.token) {
        setPollStatus('pending');
        setPollMessage('Waiting for a Super Admin to authorize your session...');
        setPendingRequest({
          requestId: data.request_id,
          token: data.token,
          email: normalizedEmail,
          expiresAt: data.expires_at || '',
        });
        return;
      }

      // Fallback if token directly returned
      if (data?.token) {
        setToken(data.token);
        navigate('/admin', { replace: true });
        return;
      }

      throw new Error('Unexpected response from login service');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-16 relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-violet-500/15 rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="liquid-glass-strong rounded-3xl p-8">
          
          {/* WAITING FOR SUPER ADMIN APPROVAL VIEW */}
          {pendingRequest ? (
            <div className="text-center py-4">
              <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                {pollStatus === 'pending' && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-cyan-400/40 border-t-cyan-300 animate-spin" />
                    <div className="liquid-icon-bubble w-14 h-14 text-cyan-300">
                      <Clock size={28} />
                    </div>
                  </>
                )}
                {pollStatus === 'approved' && (
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/50 backdrop-blur-md flex items-center justify-center text-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.25)]">
                    <CheckCircle2 size={36} />
                  </div>
                )}
                {(pollStatus === 'rejected' || pollStatus === 'expired') && (
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-400/50 backdrop-blur-md flex items-center justify-center text-red-300 shadow-[0_0_24px_rgba(248,113,113,0.25)]">
                    <XCircle size={36} />
                  </div>
                )}
              </div>

              <h2 className="text-2xl font-black text-white mb-2">
                {pollStatus === 'pending' && 'Awaiting Approval'}
                {pollStatus === 'approved' && 'Login Approved!'}
                {pollStatus === 'rejected' && 'Access Rejected'}
                {pollStatus === 'expired' && 'Request Expired'}
              </h2>

              <p className="text-sm text-slate-300/90 max-w-sm mx-auto mb-4 leading-relaxed">
                {pollMessage}
              </p>

              <div className="liquid-glass rounded-2xl p-4 text-left text-xs space-y-2 mb-6">
                <div className="flex justify-between">
                  <span className="text-slate-400">Account:</span>
                  <span className="text-white font-mono font-medium">{pendingRequest.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className={`font-semibold capitalize ${
                    pollStatus === 'pending' ? 'text-amber-300 flex items-center gap-1' :
                    pollStatus === 'approved' ? 'text-emerald-300' : 'text-red-300'
                  }`}>
                    {pollStatus === 'pending' && <RefreshCw size={11} className="animate-spin inline" />}
                    {pollStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Request ID:</span>
                  <span className="text-slate-400/80 font-mono text-[10px]">{pendingRequest.requestId.slice(0, 12)}...</span>
                </div>
              </div>

              {pollStatus === 'pending' ? (
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  className="liquid-btn-glass w-full py-3 rounded-xl text-slate-200 hover:text-white text-sm font-semibold"
                >
                  Cancel Request
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  className="liquid-btn-primary w-full py-3 rounded-xl text-white font-bold text-sm"
                >
                  Return to Login
                </button>
              )}
            </div>
          ) : (
            /* STANDARD LOGIN FORM */
            <>
              <div className="text-center mb-8">
                <div className="liquid-icon-bubble w-16 h-16 rounded-2xl mx-auto mb-4 text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.28)]">
                  <Shield size={28} />
                </div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent">
                  Admin Access
                </h1>
                <p className="text-slate-300/80 text-sm mt-1">Ignite 2.O Control Panel</p>
              </div>

              {error && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-500/15 border border-red-400/35 backdrop-blur-md text-red-200 mb-5">
                  <AlertCircle size={16} className="shrink-0 text-red-300" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="admin-email" className="block text-sm font-medium text-slate-200 mb-1.5">Email</label>
                  <input
                    id="admin-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60"
                  />
                </div>
                <div>
                  <label htmlFor="admin-password" className="block text-sm font-medium text-slate-200 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      id="admin-password"
                      name="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="liquid-input w-full rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-400/60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-200 transition-colors"
                    >
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="liquid-btn-primary w-full py-3 rounded-xl text-white font-bold disabled:opacity-50 mt-2"
                >
                  {loading ? 'Signing In...' : 'Sign In to Dashboard'}
                </button>
              </form>

              <p className="text-center text-slate-400/80 text-xs mt-6">
                First-time admin logins require Super Admin approval. Once approved, subsequent logins are direct.
              </p>
            </>
          )}

        </div>
      </motion.div>
    </div>
  );
}
