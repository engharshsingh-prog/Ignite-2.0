import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Shield } from 'lucide-react';
import { getToken, removeToken, subscribeToAdminAuth } from '../lib/auth';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const syncAdminState = () => setIsAdmin(!!getToken());
    syncAdminState();
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    const unsubscribe = subscribeToAdminAuth(syncAdminState);
    return () => {
      window.removeEventListener('scroll', onScroll);
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
                  location.pathname.startsWith('/admin') ? 'bg-[#a3b46a]/20 text-[#a3b46a]' : 'text-[#a3b46a] hover:bg-[#a3b46a]/10'
                }`}>
                  <Shield size={14} /> Admin
                </Link>
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
                <Link to="/admin" onClick={() => setOpen(false)} className="block px-3 py-2 text-olive-400 text-sm">Admin Dashboard</Link>
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
