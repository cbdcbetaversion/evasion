import React, { useEffect, useState } from 'react';
import { X, Loader2, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AuthAccountInfo } from '../types';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onNewProtectedAccount?: (account: AuthAccountInfo) => void;
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { connectWithGoogle } = useApp();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOfficialGoogleSignIn = async () => {
    if (isSubmitting) return;
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const res = await connectWithGoogle();
      if (res.redirected) {
        return;
      }
      if (!res.success) {
        setFeedback(res.error || 'Connexion Google impossible. Réessaye.');
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      onSuccess?.();
      onClose();
    } catch {
      setFeedback('Connexion Google impossible. Réessaye.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl bg-[#120d0d] border border-white/10 text-white space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.275c0-.85-.075-1.665-.215-2.45H12v4.635h6.445c-.28 1.495-1.12 2.765-2.385 3.615v3.005h3.86c2.26-2.08 3.57-5.145 3.57-8.805z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.955-1.075 7.94-2.92l-3.86-3.005c-1.075.72-2.45 1.145-4.08 1.145-3.135 0-5.79-2.115-6.74-4.96H1.27v3.1C3.245 21.285 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.26 14.26C5.02 13.54 4.885 12.78 4.885 12s.135-1.54.375-2.26V6.64H1.27C.46 8.255 0 10.075 0 12s.46 3.745 1.27 5.36l3.99-3.1z"
              />
              <path
                fill="#EA4335"
                d="M12 4.78c1.76 0 3.345.605 4.59 1.795l3.44-3.44C17.95 1.19 15.235 0 12 0 7.31 0 3.245 2.715 1.27 6.64l3.99 3.1c.95-2.845 3.605-4.96 6.74-4.96z"
              />
            </svg>
            <h3 className="text-base font-bold text-white">Connexion Google</h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-left rounded-2xl bg-white/5 border border-white/10 p-3.5">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Accès protégé par ton compte Google</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Ton identité est vérifiée directement par Google. Personne d&apos;autre ne peut ouvrir ton profil sans se connecter à ton compte Google officiel.
          </p>
        </div>

        {feedback && (
          <div className="text-xs p-2.5 rounded-2xl border font-mono bg-red-950/45 border-red-500/40 text-red-200 text-left">
            ⚠️ {feedback}
          </div>
        )}

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void handleOfficialGoogleSignIn()}
          className="w-full py-3.5 px-6 rounded-full evasion-btn-primary disabled:opacity-60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Vérification Google...</span>
            </>
          ) : (
            <span>Continuer avec Google</span>
          )}
        </button>
      </div>
    </div>
  );
};
