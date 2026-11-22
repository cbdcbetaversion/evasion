import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Lock,
  User,
  UserCheck,
  Key,
  ArrowRight,
  X,
  Loader2,
  Eye,
  EyeOff,
  Unlock,
  Copy,
  Check,
  Download,
  ShieldCheck,
  BadgeCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { soundEngine } from '../utils/audio';
import { AuthAccountInfo } from '../types';
import { downloadRecoverySheet } from '../utils/recoveryDownload';
import { resolveAnonymousShareSlug } from '../utils/universeUrl';
import { EvasionEmblem } from './EvasionEmblem';
import { GoogleSignInModal } from './GoogleSignInModal';

interface LandingStartScreenProps {
  onEnter: () => void;
  skipSplash?: boolean;
}

export const LandingStartScreen: React.FC<LandingStartScreenProps> = ({
  onEnter,
  skipSplash = false,
}) => {
  const {
    user,
    authAccount,
    enterFreshZeroSession,
    createProtectedAnonymousSession,
    connectWithPseudo,
    connectWithGoogle,
    loginAccount,
    unlockSensitiveCodesWithPassword,
    lockSensitiveCodes,
    showToast,
  } = useApp();



  const [splashPhase, setSplashPhase] = useState<'visible' | 'exiting' | 'done'>(
    skipSplash ? 'done' : 'visible'
  );
  const exitTimerRef = useRef<number | null>(null);
  const doneTimerRef = useRef<number | null>(null);

  // Direct Main Screen CONNEXION Form (matching visual design)
  const [loginIdentifier, setLoginIdentifier] = useState(() => {
    try {
      return window.localStorage.getItem('evasion_remembered_id') || '';
    } catch {
      return '';
    }
  });

  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return window.localStorage.getItem('evasion_remember_me') !== 'false';
    } catch {
      return true;
    }
  });
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);
  const [loginNeedsDisambiguation, setLoginNeedsDisambiguation] = useState(false);
  const [offerCreatePseudo, setOfferCreatePseudo] = useState<{ pseudo: string; password: string } | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  // Modal 1: Entrée Anonyme (directe OU avec mot de passe à l'entrée)
  const [showAnonModal, setShowAnonModal] = useState(false);
  const [anonPasswordInput, setAnonPasswordInput] = useState('');
  const [showAnonPassword, setShowAnonPassword] = useState(false);
  const [anonFeedback, setAnonFeedback] = useState<string | null>(null);
  const [isCreatingProtectedAnon, setIsCreatingProtectedAnon] = useState(false);
  const [isEnteringAnon, setIsEnteringAnon] = useState(false);

  // Modal 2: S'inscrire / Créer un pseudo + mot de passe
  const [showPseudoModal, setShowPseudoModal] = useState(false);
  const [pseudoInput, setPseudoInput] = useState('');
  const [pseudoPasswordInput, setPseudoPasswordInput] = useState('');
  const [showPseudoPassword, setShowPseudoPassword] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('⛓️');
  const [pseudoFeedback, setPseudoFeedback] = useState<string | null>(null);
  const [isSubmittingPseudo, setIsSubmittingPseudo] = useState(false);

  // Modal 3: Récupérer son compte (Mot de passe seul ou Code)
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeInputValue, setCodeInputValue] = useState('');
  const [codePasswordInput, setCodePasswordInput] = useState('');
  const [showCodePassword, setShowCodePassword] = useState(false);
  const [codeFeedback, setCodeFeedback] = useState<string | null>(null);
  const [codeNeedsIdentifier, setCodeNeedsIdentifier] = useState(false);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  // Modal 4: Coffre généré (USR & Code d'évasion floutés -> mot de passe pour déflouter -> Copier & Télécharger)
  const [generatedAccount, setGeneratedAccount] = useState<AuthAccountInfo | null>(null);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [vaultPasswordInput, setVaultPasswordInput] = useState('');
  const [showVaultPassword, setShowVaultPassword] = useState(false);
  const [vaultUnlockBusy, setVaultUnlockBusy] = useState(false);
  const [vaultFeedback, setVaultFeedback] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'usr' | 'code' | 'all' | null>(null);
  const [hasDownloadedSheet, setHasDownloadedSheet] = useState(false);

  const AVATARS = ['⛓️', '🐺', '⚡', '🦅', '🗝️', '🌿', '🔥', '🕊️', '💀', '🛡️'];

  useEffect(() => {
    if (skipSplash) {
      setSplashPhase('done');
      return;
    }
    const t = window.setTimeout(() => {
      setSplashPhase('exiting');
      exitTimerRef.current = window.setTimeout(() => {
        setSplashPhase('done');
      }, 380);
    }, 1600);

    return () => {
      clearTimeout(t);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
      if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
    };
  }, [skipSplash]);

  const playEnterSoundAndOpen = useCallback(() => {
    soundEngine.playLockSound();
    setTimeout(() => {
      soundEngine.playKeyTurn();
    }, 80);
    onEnter();
  }, [onEnter]);

  const openGeneratedVaultForAccount = (account: AuthAccountInfo) => {
    setShowAnonModal(false);
    setShowPseudoModal(false);
    setGeneratedAccount(account);
    setIsVaultUnlocked(false);
    setVaultPasswordInput('');
    setVaultFeedback(null);
    setCopiedField(null);
    setHasDownloadedSheet(false);
  };

  // Main Screen Form Submit: SE CONNECTER (supports Pseudo/Email/USR/Code + Password OR Password-only recovery)
  const handleMainLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = loginIdentifier.trim();
    const cleanPass = loginPassword.trim();
    if (!cleanId && !cleanPass) {
      setLoginFeedback('Entre ton pseudo, ton adresse Google ou ton mot de passe pour retrouver ton compte.');
      return;
    }
    setLoginFeedback(null);
    setLoginNeedsDisambiguation(false);
    setOfferCreatePseudo(null);
    setIsLoggingIn(true);
    try {
      const res = await loginAccount(cleanId, cleanPass);
      if (res.success) {
        try {
          window.localStorage.setItem('evasion_remember_me', rememberMe ? 'true' : 'false');
          if (rememberMe && cleanId) {
            window.localStorage.setItem('evasion_remembered_id', cleanId);
          } else {
            window.localStorage.removeItem('evasion_remembered_id');
          }
        } catch {
          // ignore storage errors
        }
        playEnterSoundAndOpen();
        return;
      }

      if (res.requiresDisambiguation) {
        setLoginNeedsDisambiguation(true);
      } else if (
        cleanId.length >= 2 &&
        !cleanId.includes('@') &&
        (!res.error || res.error.toLowerCase().includes('aucun compte'))
      ) {
        setOfferCreatePseudo({ pseudo: cleanId, password: cleanPass });
      }
      setLoginFeedback(
        res.error || 'Identifiants invalides. Laisse le nom d’utilisateur vide pour tenter par mot de passe seul.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Mode 1A: Entrer immédiatement anonymement (sans mot de passe)
  const handleQuickAnonymousEnter = async () => {
    if (isEnteringAnon) return;
    setIsEnteringAnon(true);
    setShowAnonModal(false);
    try {
      await enterFreshZeroSession();
    } finally {
      setIsEnteringAnon(false);
    }
    playEnterSoundAndOpen();
  };

  // Mode Google Sign-In : authentification officielle directe au clic (évite le blocage popup navigateur)
  const handleGoogleLogin = async () => {
    if (isGoogleLoading) return;
    setLoginFeedback(null);
    setOfferCreatePseudo(null);
    setIsGoogleLoading(true);
    try {
      const res = await connectWithGoogle();
      if (res.redirected) {
        return;
      }
      if (res.success) {
        playEnterSoundAndOpen();
        return;
      }
      if (res.error) {
        setLoginFeedback(res.error);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Mode 1B: Entrer anonymement AVEC mot de passe à l'entrée → générer USR & Code d'évasion floutés
  const handleCreateProtectedAnonymous = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = anonPasswordInput.trim();
    if (cleanPass.length < 4) {
      setAnonFeedback('Entre un mot de passe d’au moins 4 caractères pour générer et protéger tes codes.');
      return;
    }
    setAnonFeedback(null);
    setIsCreatingProtectedAnon(true);
    try {
      const res = await createProtectedAnonymousSession(cleanPass);
      if (!res.success || !res.account) {
        setAnonFeedback(res.error || 'Impossible de générer la session anonyme protégée.');
        return;
      }
      openGeneratedVaultForAccount(res.account);
    } finally {
      setIsCreatingProtectedAnon(false);
    }
  };

  // Mode 2: S'inscrire / Créer un pseudo + mot de passe à l'entrée
  const handleConfirmPseudo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPseudo = pseudoInput.trim();
    const cleanPass = pseudoPasswordInput.trim();
    if (cleanPseudo.length < 2) {
      setPseudoFeedback('Entre un pseudo d’au moins 2 caractères.');
      return;
    }
    if (cleanPass.length > 0 && cleanPass.length < 4) {
      setPseudoFeedback('Le mot de passe doit contenir au moins 4 caractères.');
      return;
    }

    setPseudoFeedback(null);
    setIsSubmittingPseudo(true);
    try {
      const res = await connectWithPseudo(cleanPseudo, selectedAvatar, cleanPass);
      if (!res.success) {
        setPseudoFeedback(
          res.error || 'Ce pseudo est déjà protégé par un mot de passe. Entre ton mot de passe pour continuer.'
        );
        return;
      }

      if (!res.restored && cleanPass.length >= 4 && res.account) {
        openGeneratedVaultForAccount(res.account);
        return;
      }

      setShowPseudoModal(false);
      playEnterSoundAndOpen();
    } catch {
      setPseudoFeedback('Connexion réseau impossible. Réessaye.');
    } finally {
      setIsSubmittingPseudo(false);
    }
  };

  // Déflouter les codes générés à l'entrée
  const handleUnlockGeneratedVault = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = vaultPasswordInput.trim();
    if (!cleanPass) {
      setVaultFeedback('Entre ton mot de passe pour déflouter tes codes.');
      return;
    }
    setVaultUnlockBusy(true);
    setVaultFeedback(null);
    try {
      const res = await unlockSensitiveCodesWithPassword(cleanPass);
      if (!res.success) {
        setVaultFeedback(res.error || 'Mot de passe incorrect.');
        return;
      }
      setIsVaultUnlocked(true);
      setVaultPasswordInput('');
    } finally {
      setVaultUnlockBusy(false);
    }
  };

  const handleCopyGenerated = async (val: string, field: 'usr' | 'code' | 'all', label: string) => {
    if (!isVaultUnlocked) {
      setVaultFeedback('Entre ton mot de passe pour déflouter avant de copier.');
      return;
    }
    try {
      await navigator.clipboard?.writeText(val);
      setCopiedField(field);
      showToast({
        title: `${label} copié !`,
        message: 'Sauvegarde-le précieusement hors de vue.',
        icon: '📋',
        type: 'success',
      });
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadGenerated = () => {
    if (!generatedAccount) return;
    if (!isVaultUnlocked) {
      setVaultFeedback('Entre ton mot de passe pour déflouter avant de télécharger.');
      return;
    }
    downloadRecoverySheet({
      alias: generatedAccount.profile.alias,
      matricule: generatedAccount.profile.matricule,
      userId: generatedAccount.profile.id,
      referralCode: generatedAccount.profile.referralCode,
      publicShareSlug: generatedAccount.profile.publicShareSlug,
    });
    setHasDownloadedSheet(true);
    showToast({
      title: 'Fiche téléchargée ⬇️',
      message: 'Tes codes USR et Évasion sont enregistrés dans ton téléphone/PC.',
      icon: '✅',
      type: 'success',
    });
  };

  const handleFinishVaultAndEnter = () => {
    lockSensitiveCodes();
    setGeneratedAccount(null);
    setIsVaultUnlocked(false);
    playEnterSoundAndOpen();
  };

  // Mode 3: Récupérer son compte avec son mot de passe seul (ou avec Code / Pseudo optionnel)
  const handleApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = codeInputValue.trim();
    const cleanPass = codePasswordInput.trim();
    if (!cleanPass) {
      setCodeFeedback('Entre ton mot de passe pour récupérer ton compte.');
      return;
    }

    setCodeFeedback(null);
    setCodeNeedsIdentifier(false);
    setIsSubmittingCode(true);
    try {
      const loginRes = await loginAccount(cleanCode, cleanPass);
      if (loginRes.success) {
        setShowCodeModal(false);
        playEnterSoundAndOpen();
        return;
      }
      if (loginRes.requiresDisambiguation) {
        setCodeNeedsIdentifier(true);
      }
      setCodeFeedback(
        loginRes.error ||
          'Aucun compte trouvé avec ce mot de passe. Vérifie ta saisie ou ajoute ton code / pseudo.'
      );
    } finally {
      setIsSubmittingCode(false);
    }
  };

  if (splashPhase !== 'done') {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="ÉVASION — Continuer vers l'espace de connexion"
        onClick={() => {
          if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
          if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
          setSplashPhase('done');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
            if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
            setSplashPhase('done');
          }
        }}
        className={`relative min-h-[100dvh] w-full flex flex-col items-center justify-center px-6 text-center overflow-hidden bg-jail-bars select-none bg-[#090707] text-white cursor-pointer transition-all duration-200 ease-out ${
          splashPhase === 'exiting' ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
        }`}
      >
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 sm:w-[28rem] sm:h-[28rem] rounded-full bg-gradient-to-br from-red-600/20 to-orange-500/12 blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col items-center justify-center animate-splash-logo">
          {/* Uniquement le logo É qui charge au tout début */}
          <EvasionEmblem size="lg" animatedRing />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-[100dvh] w-full flex flex-col justify-start sm:justify-center items-center px-5 sm:px-8 pt-8 sm:pt-12 text-center overflow-y-auto bg-jail-bars bg-[#090707] text-white select-none animate-fade-in"
      style={{ paddingBottom: 'max(11rem, calc(env(safe-area-inset-bottom, 3rem) + 8rem))' }}
    >
      {/* Ambient Coral-Ember Radial Aura behind the Header */}
      <div
        className="absolute top-[16%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-gradient-to-b from-red-600/18 via-orange-500/10 to-transparent blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[390px] sm:max-w-[420px] flex flex-col items-center">
        {/* Le É circulaire au tout début */}
        <EvasionEmblem size="md" className="mb-4" />

        {/* Bloc exact de l'image IMG_0614 : ÉVASION + Halo rouge derrière le É */}
        <div className="relative inline-flex items-center justify-center">
          <span
            className="absolute -left-5 top-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-[#ef4444]/35 blur-2xl pointer-events-none"
            aria-hidden="true"
          />
          <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight uppercase font-sans flex items-center justify-center leading-none">
            <span className="text-[#ef4444] drop-shadow-[0_0_22px_rgba(239,68,68,0.65)] inline-block mr-[1px]">
              É
            </span>
            <span className="text-white">VASION</span>
          </h1>
        </div>

        {/* Titre principal sur 2 lignes comme sur l'image */}
        <h2 className="mt-4 text-lg sm:text-[22px] font-extrabold text-white leading-[1.28] tracking-tight">
          Prisonnier de ta routine, des
          <br />
          écrans, du regard des autres ?
        </h2>

        {/* Sous-titre sur 2 lignes : "Zéro algorithme. Zéro vie parfaite." / "Avoue ce qui t'enferme, libère-toi." */}
        <p className="mt-2.5 mb-6 text-xs sm:text-sm text-zinc-400 font-normal leading-relaxed">
          Zéro algorithme. Zéro vie parfaite.
          <br />
          Avoue ce qui t&apos;enferme, libère-toi.
        </p>

        {/* Section Title */}
        <div className="mb-3.5 text-xs font-bold tracking-[0.22em] uppercase text-[#ef4444]">
          Connexion
        </div>

        {/* Direct Login / Recovery Form matching screenshot pill styling */}
        <form onSubmit={handleMainLogin} className="w-full space-y-3.5 text-left">
          <div className="relative">
            <User className="w-4 h-4 text-[#ef4444] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
              placeholder="Nom d'utilisateur ou code (ou vide)"
              aria-label="Nom d'utilisateur ou code"
              className={`w-full rounded-full pl-11 pr-4 py-3.5 text-sm bg-[#141010]/95 border transition-colors focus:outline-none text-white placeholder:text-zinc-500 ${
                loginNeedsDisambiguation
                  ? 'border-amber-500 ring-1 ring-amber-500/40'
                  : 'border-[#ef4444]/30 focus:border-[#f97316]'
              }`}
            />
          </div>

          <div className="relative">
            <Lock className="w-4 h-4 text-[#ef4444] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showLoginPassword ? 'text' : 'password'}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Mot de passe"
              aria-label="Mot de passe"
              className="w-full rounded-full pl-11 pr-11 py-3.5 text-sm bg-[#141010]/95 border border-[#ef4444]/30 focus:border-[#f97316] transition-colors focus:outline-none text-white placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={() => setShowLoginPassword((prev) => !prev)}
              aria-label={showLoginPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Remember me + Forgot password / Recovery */}
          <div className="flex items-center justify-between gap-2 px-1 pt-0.5 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white select-none min-h-[32px]">
              <button
                type="button"
                role="checkbox"
                aria-checked={rememberMe}
                onClick={() => setRememberMe((prev) => !prev)}
                className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors cursor-pointer ${
                  rememberMe
                    ? 'bg-[#ef4444]/20 border-[#ef4444] text-[#ef4444]'
                    : 'bg-transparent border-[#ef4444]/70 text-transparent'
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </button>
              <span>Se souvenir de moi</span>
            </label>

            <button
              type="button"
              onClick={() => {
                setCodeFeedback(null);
                setCodeNeedsIdentifier(false);
                setShowCodeModal(true);
              }}
              className="text-[#ef4444] hover:text-[#fb923c] underline underline-offset-4 transition-colors font-medium cursor-pointer"
            >
              Mot de passe oublié ?
            </button>
          </div>

          {loginFeedback && (
            <div className="text-xs px-4 py-2.5 rounded-2xl border font-mono bg-red-950/45 border-red-500/40 text-red-200 space-y-2">
              <div>⚠️ {loginFeedback}</div>
              {offerCreatePseudo && (
                <button
                  type="button"
                  onClick={() => {
                    setPseudoFeedback(null);
                    setPseudoInput(offerCreatePseudo.pseudo);
                    setPseudoPasswordInput(offerCreatePseudo.password);
                    setShowPseudoModal(true);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-sans font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Créer &laquo; {offerCreatePseudo.pseudo} &raquo; maintenant</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Primary Coral-to-Orange Pill CTA */}
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-3.5 px-6 rounded-full evasion-btn-primary disabled:opacity-70 font-bold text-sm tracking-[0.14em] uppercase flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {isLoggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <span>Se connecter</span>
            )}
          </button>
        </form>

        {/* OU Hairline Divider */}
        <div className="w-full flex items-center gap-3 my-5">
          <span className="flex-1 h-px bg-white/10" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">ou</span>
          <span className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google Sign-In Pill Button matching IMG_0635.png */}
        <div className="w-full space-y-2.5">
          <button
            type="button"
            disabled={isGoogleLoading}
            onClick={() => void handleGoogleLogin()}
            className="w-full py-3.5 px-6 rounded-full bg-[#120d0d]/95 hover:bg-[#1a1212] border border-[#ef4444]/40 hover:border-[#f97316]/70 active:scale-[0.985] disabled:opacity-65 text-white font-semibold text-sm flex items-center justify-center gap-3 transition-all cursor-pointer"
          >
            {isGoogleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
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
            )}
            <span>{isGoogleLoading ? 'Connexion Google...' : 'Se connecter avec Google'}</span>
          </button>

          {/* Secondary Anonymous Entry Pill Button */}
          <button
            type="button"
            disabled={isEnteringAnon}
            onClick={() => {
              setAnonFeedback(null);
              setAnonPasswordInput('');
              setShowAnonModal(true);
            }}
            className="w-full py-3 px-6 rounded-full bg-[#120d0d]/80 hover:bg-[#1a1212] border border-white/15 hover:border-[#ef4444]/40 active:scale-[0.985] disabled:opacity-70 text-zinc-200 hover:text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-[#f97316]" />
            <span>Entrer en anonyme</span>
          </button>
        </div>

        {/* Bottom Registration Link matching screenshot */}
        <div className="mt-5 flex items-center justify-center gap-1.5 text-xs">
          <span className="text-zinc-500">Pas encore de compte ?</span>
          <button
            type="button"
            onClick={() => {
              setPseudoFeedback(null);
              setShowPseudoModal(true);
            }}
            className="text-[#ef4444] hover:text-[#fb923c] font-semibold cursor-pointer transition-colors"
          >
            S&apos;inscrire
          </button>
        </div>
      </div>

      {/* Modal 1: Entrée Anonyme (directe OU protégée par mot de passe pour générer USR & Code d'évasion) */}
      {showAnonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm border rounded-3xl p-6 text-left shadow-2xl bg-[#120d0d] border-[#ef4444]/30 text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#f97316]" />
                <span>Entrée anonyme</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAnonModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer bg-white/5 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={isEnteringAnon}
              onClick={handleQuickAnonymousEnter}
              className="w-full py-3.5 px-4 rounded-full bg-[#1a1313] hover:bg-[#231919] border border-white/10 text-white font-semibold text-sm flex items-center justify-between cursor-pointer transition-colors"
            >
              <span>Entrer directement en anonyme</span>
              <ArrowRight className="w-4 h-4 text-[#f97316]" />
            </button>

            <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-zinc-500">
              <span className="flex-1 h-px bg-white/10" />
              <span>ou sécuriser dès l&apos;entrée</span>
              <span className="flex-1 h-px bg-white/10" />
            </div>

            <form onSubmit={handleCreateProtectedAnonymous} className="space-y-3">
              <div>
                <label className="block text-xs font-mono mb-1.5 text-zinc-300">
                  Mettre un mot de passe à l&apos;entrée (génère USR &amp; Code d&apos;évasion)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#ef4444] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showAnonPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    maxLength={128}
                    value={anonPasswordInput}
                    onChange={(e) => setAnonPasswordInput(e.target.value)}
                    placeholder="Mot de passe (4 caractères min.)"
                    className="w-full border rounded-full pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#f97316] font-mono bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAnonPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {showAnonPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {anonFeedback && (
                <div className="text-xs p-2.5 rounded-2xl border font-mono bg-red-950/40 border-red-500/40 text-red-300">
                  ⚠️ {anonFeedback}
                </div>
              )}

              <button
                type="submit"
                disabled={isCreatingProtectedAnon}
                className="w-full py-3 rounded-full evasion-btn-primary disabled:opacity-70 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                {isCreatingProtectedAnon ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    <span>Générer USR &amp; Code d&apos;évasion 🔒</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: S'inscrire / Créer un pseudo + mot de passe */}
      {showPseudoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm border rounded-3xl p-6 text-left shadow-2xl bg-[#120d0d] border-[#ef4444]/30 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-base font-bold flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#ef4444]" />
                <span>Créer un pseudo / S&apos;inscrire</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPseudoModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer bg-white/5 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmPseudo} className="space-y-4">
              <div>
                <label className="block text-xs font-mono mb-1.5 text-zinc-400">
                  Choisis ton pseudo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#ef4444] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={24}
                    value={pseudoInput}
                    onChange={(e) => setPseudoInput(e.target.value)}
                    placeholder="Ex: Fantôme_09, Alex_Rebel"
                    className="w-full border rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#f97316] font-sans bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono mb-1.5 text-zinc-400">
                  Symbole (pour un nouveau pseudo)
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATARS.map((av) => (
                    <button
                      type="button"
                      key={av}
                      onClick={() => setSelectedAvatar(av)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-all cursor-pointer ${
                        selectedAvatar === av
                          ? 'bg-gradient-to-br from-[#ef4444]/25 to-[#f97316]/25 border-[#ef4444] scale-105'
                          : 'bg-[#181212] border-white/10 text-zinc-400 hover:border-white/25'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono mb-1.5 text-zinc-400">
                  Mot de passe à l&apos;entrée (génère USR &amp; Code d&apos;évasion à déflouter)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#ef4444] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPseudoPassword ? 'text' : 'password'}
                    minLength={4}
                    maxLength={128}
                    value={pseudoPasswordInput}
                    onChange={(e) => setPseudoPasswordInput(e.target.value)}
                    placeholder="Mot de passe (4 caractères min.)"
                    className="w-full border rounded-full pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#f97316] font-mono bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPseudoPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {showPseudoPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {pseudoFeedback && (
                <div className="text-xs p-2.5 rounded-2xl border font-mono bg-red-950/40 border-red-500/40 text-red-300">
                  ⚠️ {pseudoFeedback}
                </div>
              )}

              <div className="text-[11px] font-mono text-zinc-500">
                Avec mot de passe : tes codes USR et Évasion sont générés floutés ici pour copie &amp; téléchargement, puis masqués de ton profil.
              </div>

              <button
                type="submit"
                disabled={isSubmittingPseudo}
                className="w-full py-3.5 rounded-full evasion-btn-primary disabled:opacity-70 font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmittingPseudo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Créer / Entrer</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Coffre généré à l'entrée (flouté par défaut → mot de passe pour déflouter → Copier & Télécharger) */}
      {generatedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md border rounded-3xl p-5 sm:p-6 text-left shadow-2xl bg-[#120d0d] border-[#f97316]/40 text-white space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ef4444]/20 to-[#f97316]/20 border border-[#f97316]/45 flex items-center justify-center text-[#fb923c] shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-black text-white">
                  Tes codes secrets ont été générés 🔒
                </h3>
                <p className="text-[11px] font-mono text-zinc-400">
                  Lien public : {resolveAnonymousShareSlug(generatedAccount.profile.publicShareSlug || generatedAccount.id)}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border bg-[#0c0909] border-white/10 space-y-3">
              {/* USR Code */}
              <div className="p-2.5 rounded-xl bg-[#161111] border border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-zinc-500">USR Code (confidentiel)</div>
                  <div
                    className={`text-sm font-black font-mono text-cyan-400 transition-all ${
                      isVaultUnlocked ? 'select-all' : 'blur-[6px] select-none pointer-events-none'
                    }`}
                  >
                    {generatedAccount.profile.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyGenerated(generatedAccount.profile.id, 'usr', 'USR Code')
                  }
                  className="px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-mono font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {!isVaultUnlocked ? (
                    <Lock className="w-3 h-3 text-[#fb923c]" />
                  ) : copiedField === 'usr' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{!isVaultUnlocked ? 'Flouté' : copiedField === 'usr' ? 'Copié' : 'Copier'}</span>
                </button>
              </div>

              {/* Code d'évasion */}
              <div className="p-2.5 rounded-xl bg-[#161111] border border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-zinc-500">Code d&apos;évasion (confidentiel)</div>
                  <div
                    className={`text-sm font-black font-mono text-[#fb923c] transition-all ${
                      isVaultUnlocked ? 'select-all' : 'blur-[6px] select-none pointer-events-none'
                    }`}
                  >
                    {generatedAccount.profile.referralCode}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyGenerated(
                      generatedAccount.profile.referralCode,
                      'code',
                      "Code d'évasion"
                    )
                  }
                  className="px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-mono font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {!isVaultUnlocked ? (
                    <Lock className="w-3 h-3 text-[#fb923c]" />
                  ) : copiedField === 'code' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{!isVaultUnlocked ? 'Flouté' : copiedField === 'code' ? 'Copié' : 'Copier'}</span>
                </button>
              </div>

              {!isVaultUnlocked ? (
                <form onSubmit={handleUnlockGeneratedVault} className="space-y-2.5 pt-1">
                  <label className="block text-[11px] font-mono text-[#fb923c]">
                    Confirme ton mot de passe pour déflouter tes codes :
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showVaultPassword ? 'text' : 'password'}
                        required
                        value={vaultPasswordInput}
                        onChange={(e) => setVaultPasswordInput(e.target.value)}
                        placeholder="Entre ton mot de passe..."
                        className="w-full border rounded-full pl-3.5 pr-9 py-2 text-xs font-mono bg-[#181212] border-[#ef4444]/35 text-white focus:outline-none focus:border-[#f97316]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowVaultPassword((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        {showVaultPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={vaultUnlockBusy}
                      className="px-4 py-2 rounded-full evasion-btn-primary font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {vaultUnlockBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5" />
                      )}
                      <span>Déflouter</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyGenerated(
                        `USR: ${generatedAccount.profile.id}\nCode d'évasion: ${generatedAccount.profile.referralCode}`,
                        'all',
                        'USR + Code'
                      )
                    }
                    className="py-2.5 px-3 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedField === 'all' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'all' ? 'Tout copié ✓' : 'Tout copier'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadGenerated}
                    className="py-2.5 px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{hasDownloadedSheet ? 'Téléchargé ✓' : 'Télécharger'}</span>
                  </button>
                </div>
              )}

              {vaultFeedback && (
                <div className="text-xs p-2 rounded-2xl border font-mono bg-red-950/40 border-red-500/40 text-red-300">
                  ⚠️ {vaultFeedback}
                </div>
              )}
            </div>

            <p className="text-[11px] font-mono text-zinc-400 leading-relaxed">
              Par sécurité anti-piratage, ces codes ne seront <strong className="text-white">jamais affichés dans la vue de ton profil</strong>. Copie-les ou télécharge ta fiche maintenant.
            </p>

            <button
              type="button"
              onClick={handleFinishVaultAndEnter}
              className="w-full py-3.5 rounded-full evasion-btn-primary font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Entrer dans ÉVASION</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal 3: Récupérer mon compte (Mot de passe seul OU avec Code / Pseudo optionnel) */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm border rounded-3xl p-6 text-left shadow-2xl bg-[#120d0d] border-[#ef4444]/30 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Key className="w-4 h-4 text-[#f97316]" />
                <span>Récupérer mon compte</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCodeModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer bg-white/5 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyCode} className="space-y-4">
              <div>
                <label className="block text-xs font-mono mb-1.5 text-zinc-300">
                  Mot de passe du compte <span className="text-[#fb923c]">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#ef4444] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showCodePassword ? 'text' : 'password'}
                    required
                    value={codePasswordInput}
                    onChange={(e) => setCodePasswordInput(e.target.value)}
                    placeholder="Entre le mot de passe que tu as choisi"
                    className="w-full border rounded-full pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#f97316] font-mono bg-[#181212] border-[#ef4444]/30 text-white placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCodePassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {showCodePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono mb-1.5 text-zinc-400">
                  Pseudo, USR ou Code d&apos;évasion{' '}
                  <span className="text-emerald-400">(optionnel — laisser vide si oublié)</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#ef4444] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={codeInputValue}
                    onChange={(e) => setCodeInputValue(e.target.value)}
                    placeholder="Laisser vide si tu n'as que le mot de passe"
                    className={`w-full border rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none font-mono bg-[#181212] text-white placeholder:text-zinc-600 ${
                      codeNeedsIdentifier
                        ? 'border-amber-500 ring-1 ring-amber-500/40'
                        : 'border-[#ef4444]/30 focus:border-[#f97316]'
                    }`}
                  />
                </div>
              </div>

              {codeFeedback && (
                <div className="text-xs p-2.5 rounded-2xl border font-mono bg-red-950/40 border-red-500/40 text-red-300">
                  ⚠️ {codeFeedback}
                </div>
              )}

              <p className="text-[11px] font-mono leading-relaxed text-zinc-400">
                Code USR ou Code d&apos;évasion perdu ? Entre simplement le mot de passe que tu as gardé en tête pour retrouver toutes tes clés, amis et progression.
              </p>

              <button
                type="submit"
                disabled={isSubmittingCode}
                className="w-full py-3.5 rounded-full evasion-btn-primary disabled:opacity-70 font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmittingCode ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Récupérer mon espace</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Google Sign-In direct (compatible iOS, Vercel et Web sans erreur de popup) */}
      <GoogleSignInModal
        isOpen={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onSuccess={() => {
          setShowGoogleModal(false);
          playEnterSoundAndOpen();
        }}
        onNewProtectedAccount={(account) => {
          setShowGoogleModal(false);
          openGeneratedVaultForAccount(account);
        }}
      />
    </div>
  );
};
