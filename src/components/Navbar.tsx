import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Shield, Crown, User as UserIcon } from 'lucide-react';
import { getToken, removeToken, subscribeToAdminAuth, checkAdminAuth, authHeaders } from '../lib/auth';
import { useUserAuth } from '../context/UserAuthContext';
import AuthModal from './AuthModal';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { user: firebaseUser, logout: firebaseLogout } = useUserAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close user dropdown on route change
  useEffect(() => {
    setUserMenuOpen(false);
    setOpen(false);
  }, [location.pathname]);

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
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
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
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-[#111411]/92 backdrop-blur-md border-b border-[#303a32] shadow-lg shadow-[#3b82f6]/10' : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-full border border-blue-300/40 bg-white/5 flex items-center justify-center glow-box-blue overflow-hidden">
              <img src="/logo.jpg" alt="Ignite 2.O icon" className="w-full h-full object-cover" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">
              <span className="text-white">Ignite</span>
              <span className="text-[#3b82f6]">2.O</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <Link key={l.to} to={l.to}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isActive(l.to)
                    ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40'
                    : 'text-gray-300 hover:text-[#a3b46a] hover:bg-[#a3b46a]/10'
                }`}>
                {l.label}
              </Link>
            ))}
            {isAdmin ? (
              <>
                <Link to="/admin" className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 ${
                  location.pathname === '/admin' ? 'bg-[#a3b46a]/20 text-[#a3b46a]' : 'text-[#a3b46a] hover:bg-[#a3b46a]/10'
                }`}>
                  <Shield size={14} /> Admin
                </Link>
                {isSuperAdmin && (
                  <div className="relative inline-flex items-center ml-1">
                    <Link
                      to="/admin/super"
                      aria-label="Super Admin control"
                      title="Super Admin control"
                      className={`group relative flex items-center justify-center min-w-[38px] min-h-[38px] w-9 h-9 rounded-xl bg-[#191e1b] border border-[#a3b46a]/60 text-[#a3b46a] hover:text-white hover:bg-[#a3b46a]/20 ring-2 ring-[#a3b46a]/70 ring-offset-2 ring-offset-[#111411] transition-all focus:outline-none focus:ring-4 focus:ring-[#a3b46a]/60 shadow-md shadow-[#a3b46a]/20 ${
                        location.pathname.startsWith('/admin/super') || location.pathname.startsWith('/admin/control')
                          ? 'bg-[#a3b46a]/25 text-white ring-4'
                          : ''
                      }`}
                    >
                      <Crown size={17} className="transition-transform group-hover:scale-110" />
                      {pendingRequestsCount > 0 && (
                        <span
                          aria-label={`${pendingRequestsCount} pending requests`}
                          className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4.5 px-1 rounded-full text-[10px] font-black bg-amber-400 text-black flex items-center justify-center border border-[#111411] animate-pulse"
                        >
                          {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                        </span>
                      )}
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#212823] border border-[#a3b46a]/40 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xl opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity z-50"
                      >
                        Super Admin Control
                      </span>
                    </Link>
                  </div>
                )}
                <button onClick={handleSignout} className="ml-2 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-1">
                  <LogOut size={14} /> Sign Out
                </button>
              </>
            ) : (
              <Link to="/admin/login" className="ml-2 px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white hover:opacity-90 transition-opacity glow-box-olive">
                Admin
              </Link>
            )}

            {/* Google / Participant Auth Button (Desktop) */}
            {firebaseUser ? (
              <div className="relative ml-2" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-blue-400/50 hover:bg-white/10 transition-all text-xs text-white cursor-pointer"
                >
                  {firebaseUser.photoURL ? (
                    <img src={firebaseUser.photoURL} alt="" className="w-6 h-6 rounded-full border border-blue-400/50 object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center justify-center font-bold text-[11px]">
                      {(firebaseUser.displayName || firebaseUser.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="max-w-[90px] truncate font-medium">
                    {firebaseUser.displayName ? firebaseUser.displayName.split(' ')[0] : 'Account'}
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-[#0f172a] border border-[#1e293b] rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-white/5 mb-1">
                      <p className="text-xs text-white font-medium truncate">{firebaseUser.displayName || 'Google User'}</p>
                      <p className="text-[11px] text-gray-400 truncate">{firebaseUser.email}</p>
                    </div>
                    <Link
                      to="/my-profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <UserIcon size={14} className="text-blue-400" />
                      <span>My Pass & Profile</span>
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <span className="text-emerald-400 text-sm leading-none">+</span>
                      <span>Event Registration</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        firebaseLogout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-left mt-1"
                    >
                      <LogOut size={14} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="ml-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-blue-400/50 hover:bg-white/10 transition-all cursor-pointer shadow-sm"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Sign In</span>
              </button>
            )}
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden text-gray-300 hover:text-white">
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden bg-[#111411]/98 backdrop-blur-md border-t border-[#303a32]">
          <div className="px-4 py-3 space-y-1">
            {/* Mobile Google User Header */}
            {firebaseUser ? (
              <div className="p-3 mb-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {firebaseUser.photoURL ? (
                    <img src={firebaseUser.photoURL} alt="" className="w-8 h-8 rounded-full border border-blue-400/50 shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                      {(firebaseUser.displayName || firebaseUser.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="truncate">
                    <p className="text-xs font-semibold text-white truncate">{firebaseUser.displayName || 'Google User'}</p>
                    <p className="text-[11px] text-gray-400 truncate">{firebaseUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setOpen(false);
                    firebaseLogout();
                  }}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-500/10 shrink-0"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setAuthModalOpen(true);
                }}
                className="w-full mb-2 flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-xl bg-white text-gray-900 font-semibold text-xs shadow-md"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Sign In with Google</span>
              </button>
            )}

            {links.map(l => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive(l.to) ? 'bg-[#3b82f6]/20 text-[#3b82f6]' : 'text-gray-300'
                }`}>
                  {l.label}
              </Link>
            ))}
            {isAdmin ? (
              <>
                <Link to="/admin" onClick={() => setOpen(false)} className="block px-3 py-2 text-olive-400 text-sm font-medium">Admin Dashboard</Link>
                {isSuperAdmin && (
                  <Link
                    to="/admin/super"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-[#a3b46a] text-sm font-semibold flex items-center justify-between bg-[#a3b46a]/10 rounded-lg border border-[#a3b46a]/30 my-1"
                  >
                    <span className="flex items-center gap-2">
                      <Crown size={16} /> Super Admin Control
                    </span>
                    {pendingRequestsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-400 text-black">
                        {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                      </span>
                    )}
                  </Link>
                )}
                <button onClick={handleSignout} className="block w-full text-left px-3 py-2 text-red-400 text-sm">Sign Out Admin</button>
              </>
            ) : (
              <Link to="/admin/login" onClick={() => setOpen(false)} className="block px-3 py-2 text-[#3b82f6] text-sm">Admin Login</Link>
            )}
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </nav>
  );
}
