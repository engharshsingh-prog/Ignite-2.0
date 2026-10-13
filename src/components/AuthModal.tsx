import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { useUserAuth } from '../context/UserAuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

export default function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Sign In to Ignite 2.O',
  description = 'Sign in with your Google account to access your official pass, manage your registrations, and view your profile.',
}: AuthModalProps) {
  const { loginWithGoogle, error, clearError } = useUserAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [justSuccess, setJustSuccess] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    clearError();
    setSigningIn(true);
    const user = await loginWithGoogle();
    setSigningIn(false);
    if (user) {
      setJustSuccess(true);
      setTimeout(() => {
        setJustSuccess(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 700);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-md bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 sm:p-8 shadow-2xl shadow-blue-500/10 text-white overflow-hidden"
        >
          {/* Neon accent glows */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={() => {
              clearError();
              onClose();
            }}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X size={20} />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 mb-3 shadow-lg shadow-blue-500/10">
              <Sparkles size={22} />
            </div>
            <h2 className="text-2xl font-bold font-display tracking-tight text-white">{title}</h2>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">{description}</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2.5">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-400" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Success State */}
          {justSuccess ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-center flex items-center justify-center gap-2">
              <CheckCircle2 size={20} />
              <span className="font-medium text-sm">Successfully signed in!</span>
            </div>
          ) : (
            /* Google Sign In Button */
            <button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl bg-white text-gray-900 font-semibold text-sm hover:bg-gray-100 transition-all duration-200 shadow-lg shadow-white/5 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              {signingIn ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                  <span>Signing in with Google...</span>
                </div>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>
          )}

          <div className="mt-5 text-center">
            <p className="text-xs text-gray-500">
              Only standard Google accounts are used to identify participants. Ignite 2.O never accesses private Google data.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

