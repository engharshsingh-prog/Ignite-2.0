import { useState, useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { checkAdminAuth, subscribeToAdminAuth } from '../lib/auth';
import LoadingSpinner from './LoadingSpinner';

export default function AdminGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    const verify = () => {
      setStatus('loading');
      checkAdminAuth().then(user => setStatus(user ? 'ok' : 'denied'));
    };
    verify();
    const unsubscribe = subscribeToAdminAuth(verify);
    return unsubscribe;
  }, []);

  if (status === 'loading') return <div className="min-h-screen bg-[#171b18] flex items-center justify-center"><LoadingSpinner text="Verifying admin access..." /></div>;
  if (status === 'denied') return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
