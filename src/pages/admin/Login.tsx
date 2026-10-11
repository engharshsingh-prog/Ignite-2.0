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
    <div className="min-h-screen bg-[#111411] grid-bg flex items-center justify-center px-4">
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-blue-700/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-olive-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8">
          
          {/* WAITING FOR SUPER ADMIN APPROVAL VIEW */}
          {pendingRequest ? (
            <div className="text-center py-4">
              <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                {pollStatus === 'pending' && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
                    <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                      <Clock size={28} />
                    </div>
                  </>
                )}
                {pollStatus === 'approved' && (
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 size={36} />
                  </div>
                )}
                {(pollStatus === 'rejected' || pollStatus === 'expired') && (
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400">
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

              <p className="text-sm text-gray-300 max-w-sm mx-auto mb-4 leading-relaxed">
                {pollMessage}
              </p>

              <div className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-4 text-left text-xs space-y-2 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-400">Account:</span>
                  <span className="text-white font-mono font-medium">{pendingRequest.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Status:</span>
                  <span className={`font-semibold capitalize ${
                    pollStatus === 'pending' ? 'text-amber-400 flex items-center gap-1' :
                    pollStatus === 'approved' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {pollStatus === 'pending' && <RefreshCw size={11} className="animate-spin inline" />}
                    {pollStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Request ID:</span>
                  <span className="text-gray-500 font-mono text-[10px]">{pendingRequest.requestId.slice(0, 12)}...</span>
                </div>
              </div>

              {pollStatus === 'pending' ? (
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  className="w-full py-3 rounded-xl border border-white/20 text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-sm font-semibold"
                >
                  Cancel Request
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold hover:opacity-90 transition-opacity text-sm"
                >
                  Return to Login
                </button>
              )}
            </div>
          ) : (
            /* STANDARD LOGIN FORM */
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#718044] flex items-center justify-center mx-auto mb-4">
                  <Shield size={28} className="text-white" />
                </div>
                <h1 className="text-2xl font-black text-white">Admin Access</h1>
                <p className="text-gray-400 text-sm mt-1">Ignite 2.O Control Panel</p>
              </div>

              {error && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 mb-5">
                  <AlertCircle size={16} />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
                >
                  {loading ? 'Signing In...' : 'Sign In to Dashboard'}
                </button>
              </form>

              <p className="text-center text-gray-500 text-xs mt-6">
                First-time admin logins require Super Admin approval. Once approved, subsequent logins are direct.
              </p>
            </>
          )}

        </div>
      </motion.div>
    </div>
  );
}
