import { useState, useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { checkAdminAuth, subscribeToAdminAuth } from '../lib/auth';
import LoadingSpinner from './LoadingSpinner';

export default function AdminGuard({
  children,
  requireSuperAdmin = false,
}: {
  children: ReactNode;
  requireSuperAdmin?: boolean;
}) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied' | 'forbidden'>('loading');

  useEffect(() => {
    const verify = () => {
      setStatus('loading');
      checkAdminAuth().then((user) => {
        if (!user) {
          setStatus('denied');
        } else if (requireSuperAdmin && user.role !== 'super_admin') {
          setStatus('forbidden');
        } else {
          setStatus('ok');
        }
      });
    };
    verify();
    return subscribeToAdminAuth(verify);
  }, [requireSuperAdmin]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#171b18] flex items-center justify-center">
        <LoadingSpinner text="Verifying authorization..." />
      </div>
    );
  }
  if (status === 'denied') return <Navigate to="/admin/login" replace />;
  if (status === 'forbidden') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
