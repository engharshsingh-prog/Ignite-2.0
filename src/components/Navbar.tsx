import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut, Shield, Crown } from 'lucide-react';
import { getToken, removeToken, subscribeToAdminAuth, checkAdminAuth, authHeaders } from '../lib/auth';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let intervalId: number | undefined;

    const syncAdminState = () => {
      setIsAdmin(!!getToken());
      checkAdminAuth().then((u) => {
        const isSuper = u?.role === 'super_admin';
        setIsSuperAdmin(isSuper);
        if (isSuper) {
          const fetchPending = () => {
            fetch('/api/auth/approvals', { headers: authHeaders() })
              .then((res) => (res.ok ? res.json() : null))
              .then((d) => setPendingRequestsCount(d?.pending?.length || 0))
              .catch(() => {});
          };
          fetchPending();
          intervalId = window.setInterval(fetchPending, 8000);
        }
      });
    };

    syncAdminState();
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const unsubscribe = subscribeToAdminAuth(syncAdminState);

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (intervalId) clearInterval(intervalId);
      unsubscribe();
    };
  }, [location]);

  const handleSignout = async () => {
    const token = getToken();
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
    } finally {
      removeToken();
      setIsAdmin(false);
      setOpen(false);
      navigate('/', { replace: true });
    }
  };

  const links = [
    { to: '/', label: 'Home' },
    { to: '/register', label: 'Register' },
    { to: '/gallery', label: 'Gallery' },
    { to: '/upload-media', label: 'Upload Media' },
    { to: '/hall-of-fame', label: 'Hall of Fame' },
    { to: '/management-team', label: 'Management Team' },
    { to: '/my-profile', label: 'My Profile' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-3 sm:px-5 pt-3 pointer-events-none">
      <div className="max-w-7xl mx-auto pointer-events-auto">
        <div
          className={`relative rounded-2xl px-4 sm:px-5 transition-all duration-500 border ${
            scrolled
              ? 'bg-white/82 backdrop-blur-2xl border-slate-900/12 shadow-[0_14px_36px_rgba(15,23,42,0.1),0_0_24px_rgba(6,182,212,0.14),inset_0_1px_0_rgba(255,255,255,1)]'
              : 'bg-white/65 backdrop-blur-xl border-slate-900/10 shadow-[0_10px_28px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.95)]'
          }`}
        >
          {/* Specular Top Reflection Line */}
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/45 to-transparent" />

          <div className="flex items-center justify-between h-14 sm:h-15">
            <Link to="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="w-8 h-8 rounded-full liquid-icon-bubble overflow-hidden p-0.5 ring-1 ring-sky-400/40">
                <img src="/logo.jpg" alt="Ignite 2.O icon" className="w-full h-full object-cover rounded-full" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight">
                <span className="text-slate-900">Ignite</span>
                <span className="bg-gradient-to-r from-cyan-600 via-blue-600 to-violet-600 bg-clip-text text-transparent">2.O</span>
              </span>
            </Link>

            <div className="hidden lg:flex items-center gap-1">
              {links.map((l) => {
                const active = isActive(l.to);
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={`relative px-3 py-1.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                      active
                        ? 'text-sky-900'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-sky-500/10'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="liquid-nav-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-400/22 via-sky-400/20 to-violet-400/20 border border-sky-400/45 shadow-[0_4px_14px_rgba(14,165,233,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]"
                      />
                    )}
                    <span className="relative z-10">{l.label}</span>
                  </Link>
                );
              })}

              {isAdmin ? (
                <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-900/12">
                  <Link
                    to="/admin"
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-all ${
                      location.pathname === '/admin'
                        ? 'bg-sky-500/15 text-sky-800 border border-sky-400/45 shadow-[0_4px_12px_rgba(14,165,233,0.16)]'
                        : 'text-sky-700 hover:bg-sky-500/10 border border-transparent'
                    }`}
                  >
                    <Shield size={14} /> Admin
                  </Link>
                  {isSuperAdmin && (
                    <div className="relative inline-flex items-center">
                      <Link
                        to="/admin/super"
                        aria-label="Super Admin control"
                        title="Super Admin control"
                        className={`group relative flex items-center justify-center w-9 h-9 rounded-xl liquid-icon-bubble text-sky-700 hover:text-sky-950 transition-all ${
                          location.pathname.startsWith('/admin/super') || location.pathname.startsWith('/admin/control')
                            ? 'ring-2 ring-sky-500/70 text-sky-900'
                            : ''
                        }`}
                      >
                        <Crown size={16} className="transition-transform group-hover:scale-110" />
                        {pendingRequestsCount > 0 && (
                          <span
                            aria-label={`${pendingRequestsCount} pending requests`}
                            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4.5 px-1 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 flex items-center justify-center border border-white animate-pulse"
                          >
                            {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                          </span>
                        )}
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg liquid-glass-strong px-2.5 py-1 text-[11px] font-semibold text-slate-900 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity z-50"
                        >
                          Super Admin Control
                        </span>
                      </Link>
                    </div>
                  )}
                  <button
                    onClick={handleSignout}
                    className="px-3 py-1.5 rounded-xl text-sm font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border border-transparent hover:border-rose-400/30 flex items-center gap-1 transition-all"
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  to="/admin/login"
                  className="ml-2 px-4 py-1.5 rounded-xl text-sm font-semibold text-white liquid-btn-primary"
                >
                  Admin
                </Link>
              )}
            </div>

            <button
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="lg:hidden w-9 h-9 rounded-xl liquid-icon-bubble flex items-center justify-center text-slate-700 hover:text-slate-950"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Liquid Glass Drawer */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden mt-2 rounded-2xl liquid-glass-strong overflow-hidden"
            >
              <div className="px-4 py-3 space-y-1">
                {links.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={`block px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isActive(l.to)
                        ? 'bg-gradient-to-r from-cyan-400/20 to-blue-400/20 text-sky-900 border border-sky-400/40'
                        : 'text-slate-700 hover:bg-sky-500/10 hover:text-slate-950'
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
                {isAdmin ? (
                  <div className="pt-2 mt-2 border-t border-slate-900/10 space-y-1">
                    <Link
                      to="/admin"
                      onClick={() => setOpen(false)}
                      className="block px-3.5 py-2.5 text-sky-700 hover:bg-sky-500/10 rounded-xl text-sm font-semibold"
                    >
                      Admin Dashboard
                    </Link>
                    {isSuperAdmin && (
                      <Link
                        to="/admin/super"
                        onClick={() => setOpen(false)}
                        className="px-3.5 py-2.5 text-sky-900 text-sm font-semibold flex items-center justify-between bg-sky-500/15 rounded-xl border border-sky-400/35 my-1"
                      >
                        <span className="flex items-center gap-2">
                          <Crown size={16} /> Super Admin Control
                        </span>
                        {pendingRequestsCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-400 text-slate-950">
                            {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                          </span>
                        )}
                      </Link>
                    )}
                    <button
                      onClick={handleSignout}
                      className="block w-full text-left px-3.5 py-2.5 text-rose-600 hover:bg-rose-500/10 rounded-xl text-sm font-semibold"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="pt-2 mt-2 border-t border-slate-900/10">
                    <Link
                      to="/admin/login"
                      onClick={() => setOpen(false)}
                      className="block text-center px-4 py-2.5 rounded-xl text-sm font-semibold text-white liquid-btn-primary"
                    >
                      Admin Login
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
