import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Key,
  Lock,
  Loader2,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  Unlock,
  Copy,
  Check,
  Download,
  Vault,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PasswordUnlockModal } from './PasswordUnlockModal';
import { downloadRecoverySheet } from '../utils/recoveryDownload';
import { EvasionEmblem } from './EvasionEmblem';
import { GoogleSignInModal } from './GoogleSignInModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    user,
    authAccount,
    theme,
    registerAccount,
    loginAccount,
    logoutAccount,
    hasAccountPassword,
    isSensitiveCodesUnlocked,
    lockSensitiveCodes,
    showToast,
  } = useApp();
  const isDark = theme === 'dark';

  const [mode, setMode] = useState<'vault' | 'register' | 'login'>('vault');
  const [username, setUsername] = useState(
    user.alias && user.alias !== 'Spectre En Quête' ? user.alias : ''
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsDisambiguation, setNeedsDisambiguation] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [copiedField, setCopiedField] = useState<'usr' | 'code' | null>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = () => {
    setShowGoogleModal(true);
  };

  const copySecret = async (val: string, field: 'usr' | 'code', label: string) => {
    if (!isSensitiveCodesUnlocked) {
      setShowUnlockModal(true);
      return;
    }
    try {
      await navigator.clipboard?.writeText(val);
      setCopiedField(field);
      showToast({
        title: `${label} copié`,
        message: 'Conserve cet identifiant confidentiel en lieu sûr.',
        icon: '🔐',
        type: 'success',
      });
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadVaultSheet = () => {
    if (!isSensitiveCodesUnlocked) {
      setShowUnlockModal(true);
      return;
    }
    downloadRecoverySheet({
      alias: user.alias,
      matricule: user.matricule,
      userId: user.id,
      referralCode: user.referralCode,
      publicShareSlug: user.publicShareSlug,
    });
    showToast({
      title: 'Fiche de secours téléchargée ⬇️',
      message: 'Tes codes USR et Évasion sont enregistrés dans ton fichier.',
      icon: '📄',
      type: 'success',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNeedsDisambiguation(false);
    const cleanId = username.trim();
    const cleanPass = password.trim();
    if (mode === 'register') {
      if (cleanId.length < 2) {
        setErrorMsg('Entre un pseudo d’au moins 2 caractères pour protéger ton dossier.');
        return;
      }
      if (cleanPass.length < 4) {
        setErrorMsg('Entre un mot de passe d’au moins 4 caractères.');
        return;
      }
    } else {
      if (!cleanId && !cleanPass) {
        setErrorMsg('Entre ton mot de passe ou ton pseudo / adresse Google pour récupérer ton dossier.');
        return;
      }
      if (!cleanId && cleanPass.length < 4) {
        setErrorMsg('Entre un mot de passe d’au moins 4 caractères.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        const res = await registerAccount({
          username: cleanId,
          password: cleanPass,
          alias: cleanId,
          avatar: user.avatar,
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Impossible de sauvegarder ce dossier.');
          return;
        }
        onClose();
      } else {
        const res = await loginAccount(cleanId, cleanPass);
        if (!res.success) {
          if (res.requiresDisambiguation) {
            setNeedsDisambiguation(true);
          }
          setErrorMsg(res.error || 'Aucun compte trouvé avec ces identifiants.');
          return;
        }
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
        <div
          className={`relative w-full max-w-md border rounded-3xl p-5 sm:p-6 shadow-2xl ${
            isDark ? 'bg-[#120d0d] border-[#ef4444]/30 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div
            className={`flex items-center justify-between pb-3 border-b mb-4 ${
              isDark ? 'border-white/10' : 'border-zinc-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <EvasionEmblem size="sm" />
              <div className="min-w-0">
                <h2 className={`text-sm sm:text-base font-black ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  Coffre-Fort &amp; Sécurité
                </h2>
                <p className="text-[11px] font-mono text-zinc-400 truncate">
                  Tes codes secrets ne s&apos;affichent jamais sur ton profil public
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer shrink-0 ${
                isDark
                  ? 'bg-white/5 text-zinc-400 hover:text-white'
                  : 'bg-zinc-100 text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3 Tabs */}
          <div
            className={`grid grid-cols-3 gap-1 p-1 rounded-full border mb-4 ${
              isDark ? 'bg-[#0b0808] border-[#ef4444]/20' : 'bg-zinc-100 border-zinc-200'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setMode('vault');
                setErrorMsg(null);
              }}
              className={`py-2 px-2 rounded-full text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                mode === 'vault'
                  ? 'evasion-btn-primary shadow-sm'
                  : isDark
                  ? 'text-zinc-400 hover:text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Lock className="w-3 h-3" />
              <span>Mes Codes</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
                setNeedsDisambiguation(false);
                if (!username && user.alias && user.alias !== 'Spectre En Quête') {
                  setUsername(user.alias);
                }
              }}
              className={`py-2 px-2 rounded-full text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                mode === 'register'
                  ? 'evasion-btn-primary shadow-sm'
                  : isDark
                  ? 'text-zinc-400 hover:text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <UserPlus className="w-3 h-3" />
              <span>Protéger</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setNeedsDisambiguation(false);
                // Vider l'identifiant par défaut pour permettre la récupération avec le mot de passe seul
                setUsername('');
              }}
              className={`py-2 px-2 rounded-full text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                mode === 'login'
                  ? 'evasion-btn-primary shadow-sm'
                  : isDark
                  ? 'text-zinc-400 hover:text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <LogIn className="w-3 h-3" />
              <span>Récupérer</span>
            </button>
          </div>

          {mode === 'vault' ? (
            <div className="space-y-3">
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  isDark ? 'bg-[#0b0808] border-white/10' : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                    <Vault className="w-4 h-4" />
                    <span>Identifiants de récupération</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => (isSensitiveCodesUnlocked ? lockSensitiveCodes() : setShowUnlockModal(true))}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold inline-flex items-center gap-1 cursor-pointer ${
                      isSensitiveCodesUnlocked
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                        : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                    }`}
                  >
                    {isSensitiveCodesUnlocked ? <EyeOff className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    <span>
                      {isSensitiveCodesUnlocked
                        ? 'Flouter'
                        : hasAccountPassword
                        ? 'Déflouter'
                        : 'Définir mot de passe'}
                    </span>
                  </button>
                </div>

                {/* USR Code */}
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                    isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-zinc-500">Code USR secret</div>
                    <div
                      className={`text-sm font-black font-mono text-cyan-400 transition-all ${
                        isSensitiveCodesUnlocked ? 'select-all' : 'blur-[6px] select-none pointer-events-none'
                      }`}
                    >
                      {user.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copySecret(user.id, 'usr', 'Code USR')}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-mono font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {!isSensitiveCodesUnlocked ? (
                      <Lock className="w-3 h-3 text-amber-400" />
                    ) : copiedField === 'usr' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{!isSensitiveCodesUnlocked ? 'Verrouillé' : copiedField === 'usr' ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>

                {/* Escape Code */}
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                    isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-zinc-500">Code d&apos;évasion</div>
                    <div
                      className={`text-sm font-black font-mono text-amber-400 transition-all ${
                        isSensitiveCodesUnlocked ? 'select-all' : 'blur-[6px] select-none pointer-events-none'
                      }`}
                    >
                      {user.referralCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copySecret(user.referralCode, 'code', "Code d'évasion")}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-mono font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {!isSensitiveCodesUnlocked ? (
                      <Lock className="w-3 h-3 text-amber-400" />
                    ) : copiedField === 'code' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{!isSensitiveCodesUnlocked ? 'Verrouillé' : copiedField === 'code' ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadVaultSheet}
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isSensitiveCodesUnlocked
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700'
                  }`}
                >
                  {isSensitiveCodesUnlocked ? <Download className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  <span>
                    {isSensitiveCodesUnlocked
                      ? 'Télécharger ma fiche de secours (.txt)'
                      : 'Déflouter par mot de passe pour copier & télécharger'}
                  </span>
                </button>
              </div>

              <div
                className={`p-3.5 rounded-2xl border space-y-2.5 ${
                  isDark ? 'bg-[#0b0808] border-white/10' : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold truncate">
                      {authAccount?.email ? `Google : ${authAccount.email}` : `Profil : ${user.alias}`}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400 truncate">
                      {user.matricule} · {user.keysAvailable} 🔑 · {user.padlocksAvailable} 🔒
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void logoutAccount();
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 text-[11px] font-mono font-bold shrink-0 cursor-pointer"
                  >
                    Se déconnecter
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className={`w-full py-2.5 px-4 rounded-xl border font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isDark
                      ? 'bg-[#140e0e] hover:bg-[#1f1515] border-[#ef4444]/35 text-white'
                      : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-900'
                  }`}
                >
                  <span>🌐</span>
                  <span>
                    {authAccount?.email
                      ? 'Changer de compte Google'
                      : 'Lier / Se connecter avec Google'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'login' && (
                <div
                  className={`p-2.5 rounded-xl border text-[11px] font-mono leading-relaxed ${
                    isDark
                      ? 'bg-cyan-950/25 border-cyan-500/30 text-cyan-200'
                      : 'bg-cyan-50 border-cyan-200 text-cyan-900'
                  }`}
                >
                  Entre ton <strong className="underline">mot de passe</strong> ou ton <strong className="underline">pseudo / code</strong>. Pour un compte Google, clique sur le bouton Google ci-dessous.
                </div>
              )}

              <div>
                <label className={`block text-[11px] font-mono mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {mode === 'register'
                    ? 'Ton Pseudo (2 caractères min.)'
                    : 'Mot de passe du compte (ou laisser vide si compte sans mot de passe)'}
                </label>
                {mode === 'register' ? (
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={48}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex: Alex_Rebel"
                    className={`w-full border rounded-full px-4 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-[#f97316] font-mono ${
                      isDark
                        ? 'bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                    }`}
                  />
                ) : (
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Entre le mot de passe que tu as choisi"
                      className={`w-full border rounded-full pl-4 pr-10 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-[#f97316] font-mono ${
                        isDark
                          ? 'bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className={`block text-[11px] font-mono mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {mode === 'register'
                    ? 'Mot de passe de protection (4 caractères min.)'
                    : 'Pseudo ou Code (optionnel — laisser vide si oublié)'}
                </label>
                {mode === 'register' ? (
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full border rounded-full pl-4 pr-10 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-[#f97316] font-mono ${
                        isDark
                          ? 'bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    maxLength={48}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Laisser vide si tu n'as que le mot de passe"
                    className={`w-full border rounded-full px-4 py-2.5 text-xs sm:text-sm focus:outline-none font-mono ${
                      needsDisambiguation
                        ? 'border-amber-500 ring-1 ring-amber-500/40'
                        : isDark
                        ? 'border-[#ef4444]/30 focus:border-[#f97316]'
                        : 'border-zinc-200 focus:border-[#f97316]'
                    } ${
                      isDark
                        ? 'bg-[#181212] text-white placeholder:text-zinc-600'
                        : 'bg-zinc-50 text-zinc-900 placeholder:text-zinc-400'
                    }`}
                  />
                )}
              </div>

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
                disabled={submitting}
                className="w-full py-3.5 rounded-full evasion-btn-primary font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : mode === 'register' ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>
                  {mode === 'register'
                    ? 'Sauvegarder avec mot de passe'
                    : 'Récupérer mon dossier'}
                </span>
              </button>

              <div className="flex items-center gap-2.5 py-1">
                <span className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-zinc-200'}`} />
                <span className="text-[10px] font-mono uppercase text-zinc-500">ou</span>
                <span className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-zinc-200'}`} />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className={`w-full py-3 px-4 rounded-full border font-semibold text-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                  isDark
                    ? 'bg-[#0b0808] hover:bg-[#1a1212] border-[#ef4444]/35 text-white'
                    : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-300 text-zinc-900'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                <span>Se connecter avec Google</span>
              </button>
            </form>
          )}

          <div
            className={`mt-4 pt-3 border-t flex items-center justify-between text-[10px] font-mono text-zinc-500 ${
              isDark ? 'border-zinc-800/80' : 'border-zinc-200'
            }`}
          >
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Protection anti-piratage active</span>
            </span>
            <span className={`flex items-center gap-1 ${isDark ? 'text-amber-400/90' : 'text-amber-700'}`}>
              <Key className="w-3 h-3" />
              <Lock className="w-3 h-3" />
              <span>Clés &amp; cadenas synchronisés</span>
            </span>
          </div>
        </div>
      </div>

      <PasswordUnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
      />

      <GoogleSignInModal
        isOpen={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onSuccess={() => {
          setShowGoogleModal(false);
          onClose();
        }}
      />
    </>
  );
};
