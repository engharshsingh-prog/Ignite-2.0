import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden text-gray-300 hover:text-white">
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden bg-[#111411]/98 backdrop-blur-md border-t border-[#303a32]">
          <div className="px-4 py-3 space-y-1">
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
                <button onClick={handleSignout} className="block w-full text-left px-3 py-2 text-red-400 text-sm">Sign Out</button>
              </>
            ) : (
              <Link to="/admin/login" onClick={() => setOpen(false)} className="block px-3 py-2 text-[#3b82f6] text-sm">Admin Login</Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
