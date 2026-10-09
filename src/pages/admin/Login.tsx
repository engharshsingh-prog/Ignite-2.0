import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { checkAdminAuth, setToken, subscribeToAdminAuth } from '../../lib/auth';
import { getErrorMessage, readJsonSafe } from '../../lib/http';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
      const data = await readJsonSafe<{ token?: string; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Login failed'));
      if (!data?.token) throw new Error('Missing login token in response');
      setToken(data.token);
      navigate('/admin', { replace: true });
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8">
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
                placeholder="Configured ADMIN_EMAIL"
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
                  placeholder="********"
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

          <p className="text-center text-gray-600 text-xs mt-6">
            Authorized admin access only.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
