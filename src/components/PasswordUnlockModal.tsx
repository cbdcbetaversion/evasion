import React, { useState, useEffect } from 'react';
import { Lock, Unlock, ShieldCheck, Eye, EyeOff, X, Loader2, KeyRound } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface PasswordUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlocked?: () => void;
  initialMode?: 'auto' | 'change';
}

export const PasswordUnlockModal: React.FC<PasswordUnlockModalProps> = ({
  isOpen,
  onClose,
  onUnlocked,
  initialMode = 'auto',
}) => {
  const {
    theme,
    hasAccountPassword,
    unlockSensitiveCodesWithPassword,
    setAccountPassword,
  } = useApp();
  const isDark = theme === 'dark';

  const isChangeMode = initialMode === 'change' && hasAccountPassword;
  const isSetupMode = !hasAccountPassword;

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isSetupMode || isChangeMode) {
      const cleanNew = password.trim();
      if (cleanNew.length < 4) {
        setErrorMsg('Le mot de passe doit contenir au moins 4 caractères.');
        return;
      }
      if (cleanNew !== confirmPassword.trim()) {
        setErrorMsg('Les deux mots de passe ne correspondent pas.');
        return;
      }
      if (isChangeMode && !currentPassword.trim()) {
        setErrorMsg('Entre ton mot de passe actuel.');
        return;
      }
      setBusy(true);
      try {
        const res = await setAccountPassword(
          cleanNew,
          isChangeMode ? currentPassword.trim() : undefined
        );
        if (!res.success) {
          setErrorMsg(res.error || 'Impossible d’enregistrer le mot de passe.');
          return;
        }
        onUnlocked?.();
        onClose();
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const res = await unlockSensitiveCodesWithPassword(password);
      if (!res.success) {
        setErrorMsg(res.error || 'Mot de passe incorrect.');
        return;
      }
      onUnlocked?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className={`relative w-full max-w-sm border rounded-3xl p-5 shadow-2xl ${
          isDark ? 'bg-[#120d0d] border-[#ef4444]/30 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div
          className={`flex items-center justify-between pb-3 border-b mb-4 ${
            isDark ? 'border-white/10' : 'border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full flex items-center justify-center border bg-gradient-to-br from-[#ef4444]/20 to-[#f97316]/20 border-[#f97316]/45 text-[#fb923c]">
              {isSetupMode ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </span>
            <div>
              <h3 className="text-sm font-black">
                {isChangeMode
                  ? 'Modifier mon mot de passe'
                  : isSetupMode
                  ? 'Protéger & déflouter mes codes'
                  : 'Déflouter Code d’évasion & USR'}
              </h3>
              <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Protection anti-piratage de compte
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
              isDark
                ? 'bg-white/5 text-zinc-400 hover:text-white'
                : 'bg-zinc-100 text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className={`text-xs leading-relaxed mb-3.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
          {isChangeMode
            ? 'Entre ton mot de passe actuel puis choisis un nouveau mot de passe personnel.'
            : isSetupMode
            ? 'Pour éviter tout piratage, définis un mot de passe personnel. Il sera exigé pour déflouter ton Code d’évasion et ton identifiant USR.'
            : 'Ton Code d’évasion et ton identifiant USR sont floutés par sécurité. Entre ton mot de passe pour les afficher.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isChangeMode && (
            <div>
              <label className={`block text-[11px] font-mono mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Mot de passe actuel
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Mot de passe actuel"
                className={`w-full border rounded-full px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-[#f97316] ${
                  isDark
                    ? 'bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
            </div>
          )}

          <div>
            <label className={`block text-[11px] font-mono mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isSetupMode || isChangeMode ? 'Nouveau mot de passe (4 caractères min.)' : 'Mot de passe du compte'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={isSetupMode || isChangeMode ? 4 : 1}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full border rounded-full pl-4 pr-10 py-2.5 text-sm font-mono focus:outline-none focus:border-[#f97316] ${
                  isDark
                    ? 'bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                title={showPassword ? 'Masquer' : 'Afficher'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {(isSetupMode || isChangeMode) && (
            <div>
              <label className={`block text-[11px] font-mono mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Confirmer le mot de passe
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={4}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full border rounded-full px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-[#f97316] ${
                  isDark
                    ? 'bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
            </div>
          )}

          {errorMsg && (
            <div
              className={`p-2.5 rounded-2xl border text-xs font-mono ${
                isDark
                  ? 'bg-red-950/50 border-red-500/40 text-red-300'
                  : 'bg-red-50 border-red-300 text-red-700'
              }`}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3.5 rounded-full evasion-btn-primary disabled:opacity-70 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSetupMode || isChangeMode ? (
              <KeyRound className="w-4 h-4" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
            <span>
              {isChangeMode
                ? 'Mettre à jour le mot de passe'
                : isSetupMode
                ? 'Activer le mot de passe & déflouter'
                : 'Déflouter maintenant'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};
