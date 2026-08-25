import React, { useState } from 'react';
import { UserAccount } from '../types';
import { X, Mail, Sparkles, ShieldCheck, CheckCircle2, ArrowRight, Loader2, User } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserAccount) => void;
  initialReason?: 'limit_reached' | 'manual';
  downloadCount: number;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialReason = 'manual',
  downloadCount,
}) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create account. Please try again.');
      }

      onLoginSuccess(data.user);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      if (!user.email) {
        throw new Error('Could not retrieve email from Google Account.');
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, name: user.displayName || undefined }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync with server.');
      }

      onLoginSuccess(data.user);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Google Sign-In failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col transition-all">
        {/* Header */}
        <div className="relative bg-gradient-to-tr from-red-600 via-rose-600 to-red-800 p-5 sm:p-6 text-white text-center">
          <button
            id="close-auth-modal-btn"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Sparkles className="w-6 h-6 text-white" />
          </div>

          <h3 className="font-extrabold text-lg sm:text-xl tracking-tight">
            {initialReason === 'limit_reached' ? 'Free Limit Reached' : 'Create Free Account'}
          </h3>
          <p className="text-xs sm:text-sm text-red-100 mt-1 max-w-xs mx-auto">
            {initialReason === 'limit_reached'
              ? `You've completed your 3 free visitor downloads. Enter your email to unlock unlimited 4K & HD downloads!`
              : 'Enter your email to unlock unlimited 4K, 1080p, and MP3 downloads.'}
          </p>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4">
          {initialReason === 'limit_reached' && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-3 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
              <span className="font-semibold">Visitor Downloads Used:</span>
              <span className="font-bold bg-red-200 dark:bg-red-900 px-2 py-0.5 rounded-full text-red-900 dark:text-red-100">
                {downloadCount} / 3
              </span>
            </div>
          )}

          {error && (
            <div className="p-2.5 sm:p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-300 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="user-email-input" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 pointer-events-none" />
                <input
                  id="user-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.name@example.com"
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label htmlFor="user-name-input" className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                Name <span className="text-zinc-400 font-normal">(Optional)</span>
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 pointer-events-none" />
                <input
                  id="user-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* Perks list */}
            <div className="pt-2 space-y-1.5 text-zinc-600 dark:text-zinc-400 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Unlimited 4K, 1080p Full HD & Shorts MP4 downloads</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Fast 320kbps MP3 audio soundtrack extractor</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Zero subscription fees and saved download history</span>
              </div>
            </div>

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-700 hover:via-rose-700 hover:to-red-800 text-white font-bold text-xs sm:text-sm py-2.5 sm:py-3 rounded-xl shadow-lg shadow-red-600/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Activating Account...</span>
                </>
              ) : (
                <>
                  <span>Unlock Unlimited Downloads</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
            <span className="flex-shrink mx-3 text-zinc-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-wider">or</span>
            <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
          </div>

          {/* Google Sign-in Button */}
          <button
            id="google-signin-btn"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 font-bold text-xs sm:text-sm py-2.5 sm:py-3 rounded-xl transition-all cursor-pointer disabled:opacity-60 shadow-sm"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
          </button>

          <p className="text-[11px] text-center text-zinc-400 dark:text-zinc-500">
            We value your privacy. No spam, ever.
          </p>
        </div>
      </div>
    </div>
  );
};
