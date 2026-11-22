import React, { useState } from 'react';
import {
  X,
  Zap,
  Key,
  Lock,
  Crown,
  HardDrive,
  Sparkles,
  ShieldCheck,
  Unlock,
  EyeOff,
  Check,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PasswordUnlockModal } from './PasswordUnlockModal';

export const CANTINE_GIFT_RATES = [
  {
    emoji: '🍦',
    label: 'Glace Cornet',
    points: '+50 pts',
    color: 'text-rose-300 border-rose-400/35 bg-rose-500/10',
    lightColor: 'text-rose-800 border-rose-300 bg-rose-50',
  },
  {
    emoji: '💧',
    label: 'Bouteille d’eau',
    points: '+75 pts',
    color: 'text-cyan-300 border-cyan-400/35 bg-cyan-500/10',
    lightColor: 'text-cyan-800 border-cyan-300 bg-cyan-50',
  },
  {
    emoji: '🥫',
    label: 'Boîte de conserve',
    points: '+80 pts',
    color: 'text-orange-300 border-orange-400/35 bg-orange-500/10',
    lightColor: 'text-orange-800 border-orange-300 bg-orange-50',
  },
  {
    emoji: '🔑',
    label: 'Clé Haute Valeur',
    points: '+100 pts',
    color: 'text-amber-300 border-amber-400/35 bg-amber-500/10',
    lightColor: 'text-amber-800 border-amber-300 bg-amber-50',
  },
  {
    emoji: '🔒',
    label: 'Cadenas Scellé',
    points: '+150 pts',
    color: 'text-sky-300 border-sky-400/35 bg-sky-500/10',
    lightColor: 'text-sky-800 border-sky-300 bg-sky-50',
  },
];

export const POINTS_REWARD_ITEMS = [
  {
    id: 'key_1' as const,
    title: '+1 Clé Haute Valeur',
    subtitle: 'Libère un aveu sur Le Mur ou offre-la à un créateur pour le soutenir.',
    cost: 300,
    emoji: '🔑',
    badge: 'Populaire',
    accent: 'border-amber-400/45 bg-amber-500/15 text-amber-300',
    ring: 'hover:border-amber-400/60',
    icon: Key,
  },
  {
    id: 'padlock_1' as const,
    title: '+1 Cadenas Scellé',
    subtitle: 'Scelle un média, verrouille une tentation ou protège ta série 24h.',
    cost: 450,
    emoji: '🔒',
    badge: 'Protection',
    accent: 'border-sky-400/45 bg-sky-500/15 text-sky-300',
    ring: 'hover:border-sky-400/60',
    icon: Lock,
  },
  {
    id: 'keys_3' as const,
    title: 'Pack +3 Clés & +1 Cadenas',
    subtitle: 'Pack complet pour débloquer les accès et soutenir plusieurs détenus.',
    cost: 800,
    emoji: '🔑🔒',
    badge: 'Pack Avantage',
    accent: 'border-emerald-400/45 bg-emerald-500/15 text-emerald-300',
    ring: 'hover:border-emerald-400/60',
    icon: Sparkles,
  },
  {
    id: 'passe_partout' as const,
    title: '+1 Passe-Partout Or',
    subtitle: 'Libération immédiate d’un aveu verrouillé + insigne Passe-Partout.',
    cost: 1000,
    emoji: '⚡',
    badge: 'Haute Valeur',
    accent: 'border-yellow-400/45 bg-yellow-500/15 text-yellow-300',
    ring: 'hover:border-yellow-400/60',
    icon: Zap,
  },
  {
    id: 'memory_5' as const,
    title: '+5 Mémoire Mon Univers',
    subtitle: 'Ajoute 5 emplacements supplémentaires (photos, vidéos ou audios).',
    cost: 1200,
    emoji: '📦',
    badge: 'Stockage',
    accent: 'border-cyan-400/45 bg-cyan-500/15 text-cyan-300',
    ring: 'hover:border-cyan-400/60',
    icon: HardDrive,
  },
  {
    id: 'vip_cell' as const,
    title: 'Statut Cellule VIP & Néon Or',
    subtitle: 'Active le statut VIP, l’accès à la Cellule Privée et le cadre Néon Or.',
    cost: 2500,
    emoji: '👑',
    badge: 'Prestige VIP',
    accent: 'border-pink-400/45 bg-pink-500/15 text-pink-300',
    ring: 'hover:border-pink-400/60',
    icon: Crown,
  },
];

type RewardId = (typeof POINTS_REWARD_ITEMS)[number]['id'];

export const CantineCreatorsSection: React.FC<{
  onClose?: () => void;
  isModal?: boolean;
}> = ({ onClose, isModal = false }) => {
  const {
    user,
    theme,
    redeemPoints,
    isSensitiveCodesUnlocked,
    lockSensitiveCodes,
    hasAccountPassword,
  } = useApp();

  const isDark = theme === 'dark';
  const [selectedRewardId, setSelectedRewardId] = useState<RewardId | null>(null);
  const [validationCode, setValidationCode] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastRedeemedTitle, setLastRedeemedTitle] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  const userPoints = user.points || 0;
  const selectedReward = POINTS_REWARD_ITEMS.find((item) => item.id === selectedRewardId) || null;

  const handleSelectReward = (rewardId: RewardId) => {
    setValidationError(null);
    setLastRedeemedTitle(null);
    setSelectedRewardId((prev) => (prev === rewardId ? null : rewardId));
    if (isSensitiveCodesUnlocked && !validationCode) {
      setValidationCode(user.referralCode);
    }
  };

  const handleConfirmCantinePayment = async (e: React.FormEvent, rewardItem = selectedReward) => {
    e.preventDefault();
    if (!rewardItem) return;
    const cleanCode = validationCode.trim();
    if (!cleanCode) {
      setValidationError(
        "Entre ton Code USR, ton Code d'évasion ou ton Mot de passe pour signer le paiement en points."
      );
      return;
    }

    setValidationError(null);
    setBusyId(rewardItem.id);
    try {
      const res = await redeemPoints(rewardItem.id, cleanCode);
      if (!res.success) {
        setValidationError(
          res.error || "Code invalide. Vérifie ton Code USR, ton Code d'évasion ou ton Mot de passe."
        );
        return;
      }
      setLastRedeemedTitle(rewardItem.title);
      setSelectedRewardId(null);
      setValidationCode('');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="w-full space-y-5 text-center">
        {/* 1. EN-TÊTE PANORAMIQUE CENTRÉ : TITRE + SOLDE + BARÈME */}
        <div
          className={`w-full rounded-3xl p-4 sm:p-6 border space-y-4 text-center relative ${
            isDark
              ? 'bg-transparent border-white/15'
              : 'bg-white/60 border-zinc-200/90 backdrop-blur-xs'
          }`}
        >
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer la Cantine"
              className={`absolute top-4 right-4 w-9 h-9 rounded-2xl border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                isDark
                  ? 'bg-white/5 hover:bg-white/15 border-white/15 text-white'
                  : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="flex flex-col items-center justify-center space-y-2 max-w-2xl mx-auto">
            <div
              className={`inline-flex items-center justify-center gap-2 px-3.5 py-1 rounded-full border text-xs font-mono font-black uppercase tracking-wider ${
                isDark
                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                  : 'bg-amber-100 border-amber-300 text-amber-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span>Cantine des Créateurs · Échange de Points</span>
            </div>
            <h2
              className={`text-lg sm:text-2xl font-black tracking-tight leading-snug text-center ${
                isDark ? 'text-white' : 'text-zinc-950'
              }`}
            >
              Transforme tes Points Créateur en Clés, Cadenas &amp; Privilèges
            </h2>
            <p
              className={`text-xs sm:text-sm leading-relaxed max-w-xl mx-auto text-center ${
                isDark ? 'text-zinc-300' : 'text-zinc-700'
              }`}
            >
              Chaque cadeau reçu sur tes médias et tes Lives crédite directement ton compte. Sécurise et valide tes achats à la Cantine avec ton{' '}
              <strong className={`font-mono ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>Code USR</strong>, ton{' '}
              <strong className={`font-mono ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Code d&apos;évasion</strong> ou ton{' '}
              <strong className={isDark ? 'text-white' : 'text-zinc-950'}>Mot de passe</strong>.
            </p>
          </div>

          {/* Barre de solde pleine largeur en 4 blocs centrés */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-1">
            <div
              className={`p-3 sm:p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center ${
                isDark
                  ? 'bg-amber-500/10 border-amber-400/40'
                  : 'bg-amber-50/90 border-amber-300'
              }`}
            >
              <span
                className={`text-[10px] sm:text-[11px] font-mono uppercase tracking-wider font-bold ${
                  isDark ? 'text-amber-400' : 'text-amber-800'
                }`}
              >
                Solde Cantine
              </span>
              <div
                className={`text-lg sm:text-2xl font-mono font-black tabular-nums mt-0.5 ${
                  isDark ? 'text-amber-300' : 'text-amber-800'
                }`}
              >
                ⚡ {userPoints} <span className="text-xs font-bold">pts</span>
              </div>
            </div>

            <div
              className={`p-3 sm:p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center ${
                isDark ? 'bg-white/[0.03] border-white/15' : 'bg-white border-zinc-200'
              }`}
            >
              <span
                className={`text-[10px] sm:text-[11px] font-mono uppercase tracking-wider ${
                  isDark ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                Clés disponibles
              </span>
              <div
                className={`text-lg sm:text-2xl font-mono font-black tabular-nums mt-0.5 ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                🔑 {user.keysAvailable || 0}
              </div>
            </div>

            <div
              className={`p-3 sm:p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center ${
                isDark ? 'bg-white/[0.03] border-white/15' : 'bg-white border-zinc-200'
              }`}
            >
              <span
                className={`text-[10px] sm:text-[11px] font-mono uppercase tracking-wider ${
                  isDark ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                Cadenas scellés
              </span>
              <div
                className={`text-lg sm:text-2xl font-mono font-black tabular-nums mt-0.5 ${
                  isDark ? 'text-sky-300' : 'text-sky-700'
                }`}
              >
                🔒 {user.padlocksAvailable || 0}
              </div>
            </div>

            <div
              className={`p-3 sm:p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center ${
                isDark ? 'bg-white/[0.03] border-white/15' : 'bg-white border-zinc-200'
              }`}
            >
              <span
                className={`text-[10px] sm:text-[11px] font-mono uppercase tracking-wider ${
                  isDark ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                Passe-Partout Or
              </span>
              <div
                className={`text-lg sm:text-2xl font-mono font-black tabular-nums mt-0.5 ${
                  isDark ? 'text-yellow-300' : 'text-amber-700'
                }`}
              >
                ⚡ {user.hasPassePartoutCount || 0}
              </div>
            </div>
          </div>

          {/* Barème des cadeaux reçus centré */}
          <div className="space-y-2.5 pt-1 flex flex-col items-center justify-center text-center">
            <div className="flex flex-col items-center justify-center gap-0.5">
              <span
                className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                  isDark ? 'text-emerald-400' : 'text-emerald-700'
                }`}
              >
                🎁 Barème des dons reçus par les créateurs (Médias &amp; Lives)
              </span>
              <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Crédité instantanément sur ton solde ⚡
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 w-full">
              {CANTINE_GIFT_RATES.map((rate) => (
                <div
                  key={rate.label}
                  className={`px-3.5 py-2 rounded-full border inline-flex items-center justify-center gap-2 ${
                    isDark ? rate.color : rate.lightColor
                  }`}
                >
                  <span className="text-base shrink-0">{rate.emoji}</span>
                  <span className="text-xs font-bold">{rate.label}</span>
                  <span className="text-xs font-mono font-black shrink-0 tabular-nums">
                    {rate.points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. CARTE CANTINE PLEINE LARGEUR CENTRÉE : CODES DE VALIDATION */}
        <div
          className={`w-full rounded-3xl p-4 sm:p-5 border space-y-4 text-center ${
            isDark
              ? 'bg-transparent border-white/15'
              : 'bg-white/60 border-zinc-200/90 backdrop-blur-xs'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2.5">
            <div className="space-y-1 flex flex-col items-center justify-center">
              <div
                className={`text-xs sm:text-sm font-mono font-black flex items-center justify-center gap-2 ${
                  isDark ? 'text-[#fb923c]' : 'text-orange-700'
                }`}
              >
                <ShieldCheck className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <span>Carte Cantine · Codes personnels de validation</span>
              </div>
              <p className={`text-xs max-w-lg mx-auto ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                Défloute tes codes pour les copier ou pré-remplir ta signature en 1 clic lors d&apos;un échange.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                isSensitiveCodesUnlocked ? lockSensitiveCodes() : setShowUnlockModal(true)
              }
              className={`px-4 py-2 rounded-full text-xs font-mono font-black inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-all ${
                isSensitiveCodesUnlocked
                  ? isDark
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/15'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-300'
                  : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md'
              }`}
            >
              {isSensitiveCodesUnlocked ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Unlock className="w-3.5 h-3.5" />
              )}
              <span>
                {isSensitiveCodesUnlocked
                  ? 'Flouter mes codes'
                  : hasAccountPassword
                  ? 'Déflouter mes codes'
                  : 'Protéger & Voir mes codes'}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Code USR */}
            <div
              className={`p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-2.5 ${
                isDark ? 'bg-white/[0.03] border-cyan-500/30' : 'bg-cyan-50/70 border-cyan-300'
              }`}
            >
              <div className="space-y-1 w-full">
                <div
                  className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                    isDark ? 'text-cyan-400' : 'text-cyan-800'
                  }`}
                >
                  1. Code USR (Identifiant Unique)
                </div>
                <div
                  className={`text-sm sm:text-base font-black font-mono break-all ${
                    isDark ? 'text-cyan-300' : 'text-cyan-900'
                  } ${
                    isSensitiveCodesUnlocked
                      ? 'select-all'
                      : 'blur-[6px] select-none pointer-events-none'
                  }`}
                >
                  {user.id}
                </div>
              </div>
              {isSensitiveCodesUnlocked && (
                <button
                  type="button"
                  onClick={() => setValidationCode(user.id)}
                  className="px-4 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-mono font-black shrink-0 cursor-pointer transition-colors"
                >
                  Utiliser Code USR
                </button>
              )}
            </div>

            {/* Code d'évasion */}
            <div
              className={`p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-2.5 ${
                isDark ? 'bg-white/[0.03] border-amber-500/30' : 'bg-amber-50/70 border-amber-300'
              }`}
            >
              <div className="space-y-1 w-full">
                <div
                  className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                    isDark ? 'text-amber-400' : 'text-amber-800'
                  }`}
                >
                  2. Code d&apos;Évasion Personnel
                </div>
                <div
                  className={`text-sm sm:text-base font-black font-mono break-all ${
                    isDark ? 'text-amber-300' : 'text-amber-900'
                  } ${
                    isSensitiveCodesUnlocked
                      ? 'select-all'
                      : 'blur-[6px] select-none pointer-events-none'
                  }`}
                >
                  {user.referralCode}
                </div>
              </div>
              {isSensitiveCodesUnlocked && (
                <button
                  type="button"
                  onClick={() => setValidationCode(user.referralCode)}
                  className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-mono font-black shrink-0 cursor-pointer transition-colors"
                >
                  Utiliser Code Évasion
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Message de confirmation après achat centré */}
        {lastRedeemedTitle && (
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-center gap-3 text-center animate-fade-in ${
              isDark
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : 'border-emerald-400 bg-emerald-50 text-emerald-900'
            }`}
          >
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-mono font-bold">
              <CheckCircle2 className={`w-5 h-5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              <span>
                Échange validé avec succès :{' '}
                <strong className={isDark ? 'text-white' : 'text-zinc-950'}>{lastRedeemedTitle}</strong> a été ajouté à ton inventaire !
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLastRedeemedTitle(null)}
              className={`px-3 py-1 rounded-full text-xs font-mono cursor-pointer ${
                isDark
                  ? 'bg-emerald-500/20 text-emerald-200 hover:text-white'
                  : 'bg-emerald-200/70 text-emerald-900 hover:bg-emerald-200'
              }`}
            >
              Fermer
            </button>
          </div>
        )}

        {/* 3. GRILLE DES 6 RÉCOMPENSES CENTRÉE SUR TOUTE LA PAGE */}
        <div className="space-y-3 text-center">
          <div className="flex flex-col items-center justify-center gap-1 px-1">
            <h3
              className={`text-sm sm:text-base font-black uppercase tracking-wider font-mono ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              🛒 Catalogue de la Cantine ({POINTS_REWARD_ITEMS.length} récompenses disponibles)
            </h3>
            <span className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Clique sur une récompense pour signer et débloquer
            </span>
          </div>

          <div
            className={`grid grid-cols-1 ${
              isModal ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-3'
            } gap-3.5`}
          >
            {POINTS_REWARD_ITEMS.map((item) => {
              const canAfford = userPoints >= item.cost;
              const isSelected = selectedRewardId === item.id;
              const progressPct = Math.min(100, Math.round((userPoints / item.cost) * 100));
              const missingPts = Math.max(0, item.cost - userPoints);

              return (
                <div
                  key={item.id}
                  className={`rounded-3xl border p-4 sm:p-5 flex flex-col items-center justify-between text-center gap-4 transition-all ${
                    isSelected
                      ? isDark
                        ? 'bg-amber-500/[0.08] border-[#f97316] shadow-[0_0_30px_rgba(249,115,22,0.2)] md:col-span-2 lg:col-span-3'
                        : 'bg-amber-50/90 border-orange-500 shadow-lg md:col-span-2 lg:col-span-3'
                      : isDark
                      ? `bg-transparent border-white/15 ${item.ring}`
                      : `bg-white/75 border-zinc-300/90 shadow-2xs ${item.ring}`
                  }`}
                >
                  <div className="space-y-3 w-full flex flex-col items-center text-center">
                    {/* En-tête de la carte centré : Icône + Badge + Prix en Points */}
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span
                        className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xl shrink-0 ${item.accent}`}
                      >
                        {item.emoji}
                      </span>

                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider ${
                            isDark
                              ? 'bg-white/5 border-white/10 text-zinc-400'
                              : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                          }`}
                        >
                          {item.badge}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-mono font-black shrink-0 tabular-nums border ${
                            canAfford
                              ? isDark
                                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                                : 'bg-amber-100 border-amber-400 text-amber-900'
                              : isDark
                              ? 'bg-white/5 border-white/10 text-zinc-400'
                              : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                          }`}
                        >
                          ⚡ {item.cost} pts
                        </span>
                      </div>

                      <h4
                        className={`text-sm sm:text-base font-black leading-snug text-center ${
                          isDark ? 'text-white' : 'text-zinc-900'
                        }`}
                      >
                        {item.title}
                      </h4>
                    </div>

                    {/* Description complète centrée */}
                    <p
                      className={`text-xs sm:text-sm leading-relaxed max-w-md mx-auto text-center ${
                        isDark ? 'text-zinc-300' : 'text-zinc-700'
                      }`}
                    >
                      {item.subtitle}
                    </p>

                    {/* Barre de progression centrée */}
                    <div className="space-y-1.5 w-full max-w-md mx-auto">
                      <div className="flex items-center justify-center gap-2 flex-wrap text-[11px] font-mono">
                        <span
                          className={
                            canAfford
                              ? isDark
                                ? 'text-emerald-400 font-bold'
                                : 'text-emerald-700 font-bold'
                              : isDark
                              ? 'text-zinc-400'
                              : 'text-zinc-600'
                          }
                        >
                          {canAfford
                            ? '✓ Solde suffisant'
                            : `Il manque ${missingPts} pts`}
                        </span>
                        <span className={isDark ? 'text-zinc-600' : 'text-zinc-400'}>·</span>
                        <span className={`tabular-nums ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                          {Math.min(userPoints, item.cost)} / {item.cost} pts ({progressPct}%)
                        </span>
                      </div>
                      <div
                        className={`h-2 w-full rounded-full overflow-hidden ${
                          isDark ? 'bg-white/10' : 'bg-zinc-200'
                        }`}
                      >
                        <div
                          style={{ width: `${progressPct}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            canAfford
                              ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-emerald-400'
                              : 'bg-amber-500/60'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Si cette carte est sélectionnée : Guichet de validation centré sur place */}
                  {isSelected ? (
                    <form
                      onSubmit={(e) => handleConfirmCantinePayment(e, item)}
                      className={`w-full max-w-xl mx-auto pt-3 border-t space-y-3 text-center animate-fade-in ${
                        isDark ? 'border-white/15' : 'border-orange-200'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <label
                          className={`text-xs font-mono font-bold text-center ${
                            isDark ? 'text-zinc-200' : 'text-zinc-800'
                          }`}
                        >
                          🔐 Signature requise : saisis ton{' '}
                          <span className="text-cyan-400">Code USR</span>, ton{' '}
                          <span className="text-amber-400">Code d&apos;évasion</span> ou ton{' '}
                          <span className="underline">Mot de passe</span>
                        </label>
                        {isSensitiveCodesUnlocked && (
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setValidationCode(user.id)}
                              className="px-3 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-[11px] font-mono font-bold cursor-pointer"
                            >
                              + Code USR
                            </button>
                            <button
                              type="button"
                              onClick={() => setValidationCode(user.referralCode)}
                              className="px-3 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[11px] font-mono font-bold cursor-pointer"
                            >
                              + Code Évasion
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-center justify-center gap-2.5 w-full">
                        <input
                          type="text"
                          required
                          value={validationCode}
                          onChange={(e) => setValidationCode(e.target.value)}
                          placeholder="Entre ton Code USR, Code d'évasion ou Mot de passe..."
                          className={`w-full rounded-full px-4 py-3 text-xs sm:text-sm font-mono text-center border focus:outline-none ${
                            isDark
                              ? 'bg-black/60 border-white/20 focus:border-[#f97316] text-white placeholder:text-zinc-500'
                              : 'bg-white border-zinc-300 focus:border-orange-500 text-zinc-900 placeholder:text-zinc-400'
                          }`}
                        />

                        <div className="flex items-center justify-center gap-2 flex-wrap w-full">
                          <button
                            type="submit"
                            disabled={busyId === item.id}
                            className="flex-1 sm:flex-initial py-3 px-6 rounded-full evasion-btn-primary font-mono font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {busyId === item.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>Signer &amp; Payer ({item.cost} pts)</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRewardId(null);
                              setValidationError(null);
                            }}
                            className={`py-3 px-5 rounded-full border text-xs font-mono font-bold cursor-pointer ${
                              isDark
                                ? 'bg-white/5 hover:bg-white/10 border-white/15 text-zinc-300'
                                : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700'
                            }`}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>

                      {validationError && (
                        <div className="text-xs p-3 rounded-xl border font-mono bg-red-950/60 border-red-500/50 text-red-200 text-center">
                          ⚠️ {validationError}
                        </div>
                      )}
                    </form>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => handleSelectReward(item.id)}
                      className={`w-full py-2.5 px-4 rounded-full text-xs font-mono font-black flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 ${
                        canAfford
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 shadow-md hover:brightness-110'
                          : isDark
                          ? 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/15'
                          : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300'
                      }`}
                    >
                      <span>Échanger contre {item.cost} pts</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <PasswordUnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
      />
    </>
  );
};

export const PointsExchangeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { theme } = useApp();
  const isDark = theme === 'dark';
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-2 sm:p-4 lg:p-6 overflow-y-auto animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-5xl rounded-3xl border p-3.5 sm:p-6 shadow-2xl my-auto max-h-[94dvh] overflow-y-auto text-center ${
          isDark
            ? 'bg-[#0d0909]/95 border-white/15 text-white'
            : 'bg-[#f8f7f9] border-zinc-200 text-zinc-900'
        }`}
      >
        <CantineCreatorsSection onClose={onClose} isModal={true} />
      </div>
    </div>
  );
};
