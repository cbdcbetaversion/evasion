import React, { useState, useEffect } from 'react';
import {
  Key,
  Crown,
  Sparkles,
  Zap,
  BookOpen,
  Check,
  ExternalLink,
  Mic,
  Lock,
  Unlock,
  Radio,
  Copy,
  CheckCheck,
  TrendingUp,
  Award,
  Video,
  BadgeCheck,
  Briefcase,
  User,
} from 'lucide-react';
import { useApp, isMasterPassUser } from '../context/AppContext';
import { KeyAccessGate } from './KeyAccessGate';
import { AvatarDisplay } from './AvatarDisplay';
import { ProfileStatusBadges } from './ProfileStatusBadges';
import { CantineCreatorsSection, CANTINE_GIFT_RATES } from './PointsExchangeModal';
import { DIGITAL_KITS, AFFILIATE_RESOURCES, VIRAL_SCRIPTS } from '../data/marketData';
import { NeonColor, CellFrame } from '../types';
import {
  NEON_PALETTE,
  CELL_FRAME_OPTIONS,
  getNeonItem,
  getCellFrameClasses,
} from '../utils/neonStyles';

type MarketSubTab = 'cantine' | 'micro' | 'vip' | 'kits' | 'affiliate' | 'scripts';

export const BlackMarketView: React.FC = () => {
  const {
    user,
    authAccount,
    theme,
    openShop,
    buyPassePartout,
    buyNeonPack,
    subscribeVip,
    buyKit,
    openKitReader,
    showToast,
    hasFullKeyAccess,
    requireFullKeyAccess,
    updateProfileStatus,
    openAuthModal,
  } = useApp();

  const isDark = theme === 'dark';
  const isUserVerified = Boolean(user.isVerified || authAccount?.email);
  const isMasterPass = isMasterPassUser(user);
  const [activeSubTab, setActiveSubTab] = useState<MarketSubTab>('cantine');
  const [selectedNeon, setSelectedNeon] = useState<NeonColor>(user.neonColor || 'emerald');
  const [selectedFrame, setSelectedFrame] = useState<CellFrame>(user.cellBorderFrame || 'neon');
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);

  useEffect(() => {
    if (user.neonColor) setSelectedNeon(user.neonColor);
    if (user.cellBorderFrame) setSelectedFrame(user.cellBorderFrame);
  }, [user.neonColor, user.cellBorderFrame]);

  const handleCopyScript = (scriptText: string, id: string) => {
    if (!requireFullKeyAccess('Copier un script vidéo')) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(scriptText);
      setCopiedScriptId(id);
      showToast({
        title: 'Script copié dans le presse-papier ! 🎬',
        message: 'Prêt à être tourné face caméra ou en format voix off sur Reels/Shorts.',
        type: 'success',
      });
      setTimeout(() => setCopiedScriptId(null), 3000);
    }
  };

  const isVipActive = user.isVipSubscriber || user.isVipCell;

  return (
    <div className="space-y-5 pb-24 animate-fade-in text-center">
      {/* Header Banner Centré */}
      <div
        className={`rounded-3xl p-5 border relative overflow-hidden text-center ${
          isDark
            ? 'bg-transparent border-white/15'
            : 'bg-white/40 border-zinc-200/80 backdrop-blur-xs'
        }`}
      >
        <div className="relative z-10 space-y-4 text-center">
          <div className="min-w-0 flex flex-col items-center justify-center text-center">
            <div
              className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] font-mono mb-1 ${
                isDark ? 'text-amber-400' : 'text-amber-700'
              }`}
            >
              <span className="font-bold">Le Marché Noir</span>
              <span aria-hidden="true" className={isDark ? 'text-zinc-600' : 'text-zinc-300'}>·</span>
              <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>0 Pub</span>
            </div>
            <h1
              className={`text-xl sm:text-2xl font-black tracking-tight text-center ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              Boutique &amp; Clés
            </h1>
            <p
              className={`text-xs mt-1 leading-relaxed max-w-md mx-auto text-center ${
                isDark ? 'text-zinc-400' : 'text-zinc-600'
              }`}
            >
              Clés, Style Néon, Quartier VIP et outils d&apos;émancipation à prix doux.
            </p>
          </div>

          {/* Section Pleine Largeur Centrée : Ton inventaire & Cantine des Créateurs */}
          <div
            className={`pt-4 border-t space-y-3.5 text-center ${
              isDark ? 'border-white/10' : 'border-zinc-200'
            }`}
          >
            {/* Grille 4 colonnes centrée sur toute la largeur */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => setActiveSubTab('cantine')}
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer group ${
                  activeSubTab === 'cantine'
                    ? isDark
                      ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                      : 'bg-amber-100 border-amber-500 shadow-xs'
                    : isDark
                    ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-400/40'
                    : 'bg-amber-50 hover:bg-amber-100/80 border-amber-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Zap className={`w-3.5 h-3.5 shrink-0 group-hover:scale-110 transition-transform ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
                  <span className={`text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                    Cantine Créateur
                  </span>
                </div>
                <div
                  className={`text-lg sm:text-xl font-mono font-black tabular-nums mt-1 ${
                    isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  ⚡ {user.points || 0} <span className={`text-xs font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>pts</span>
                </div>
                <div className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-amber-300/90' : 'text-amber-800'}`}>
                  Échanger mes points
                </div>
              </button>

              <div
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center ${
                  isDark ? 'bg-white/[0.03] border-white/15' : 'bg-white/80 border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Key className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
                  <span className={`text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Clés &amp; Cadenas
                  </span>
                </div>
                <div
                  className={`text-lg sm:text-xl font-mono font-black tabular-nums mt-1 ${
                    isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  🔑 {user.keysAvailable || 0} <span className="text-zinc-500">·</span> 🔒 {user.padlocksAvailable || 0}
                </div>
                <div className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Disponibles immédiatement
                </div>
              </div>

              <div
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center ${
                  isDark ? 'bg-white/[0.03] border-white/15' : 'bg-white/80 border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Unlock className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-yellow-400' : 'text-amber-700'}`} />
                  <span className={`text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Passe-Partout
                  </span>
                </div>
                <div
                  className={`text-lg sm:text-xl font-mono font-black tabular-nums mt-1 ${
                    isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  ⚡ {user.hasPassePartoutCount || 0}
                </div>
                <div className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Libération directe d&apos;aveu
                </div>
              </div>

              <div
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center ${
                  isDark
                    ? `bg-white/[0.03] ${isVipActive ? 'border-amber-400/45' : 'border-white/15'}`
                    : isVipActive
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-white/80 border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Crown className={`w-3.5 h-3.5 shrink-0 ${isVipActive ? 'text-amber-500' : 'text-zinc-500'}`} />
                  <span className={`text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Statut Cellule
                  </span>
                </div>
                <div
                  className={`text-lg sm:text-xl font-mono font-black mt-1 ${
                    isVipActive
                      ? isDark
                        ? 'text-amber-300'
                        : 'text-amber-800'
                      : isDark
                      ? 'text-zinc-300'
                      : 'text-zinc-800'
                  }`}
                >
                  {isVipActive ? 'VIP Actif 👑' : 'Standard'}
                </div>
                <div className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {isVipActive ? 'Accès Cellule Privée' : '1,99 €/mois ou 2 500 pts'}
                </div>
              </div>
            </div>

            {/* Bandeau horizontal pleine largeur de la Cantine des Créateurs (100% Centré) */}
            <div
              className={`w-full p-4 sm:p-5 rounded-2xl border flex flex-col items-center justify-center text-center gap-3.5 ${
                isDark
                  ? 'bg-white/[0.03] border-amber-500/35'
                  : 'bg-amber-50/75 border-amber-300'
              }`}
            >
              <div className="space-y-2.5 flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
                <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-mono font-black uppercase tracking-wider">
                  <Zap className="w-3 h-3 shrink-0" />
                  <span>Cantine des Créateurs</span>
                </span>

                <p
                  className={`text-xs sm:text-sm font-bold leading-snug text-center ${
                    isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  Reçois des cadeaux sur tes médias &amp; Lives et paie avec tes points (Code USR / Évasion)
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                  {CANTINE_GIFT_RATES.map((rate) => (
                    <span
                      key={rate.label}
                      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-mono font-bold ${
                        isDark ? rate.color : rate.lightColor
                      }`}
                    >
                      <span>{rate.emoji}</span>
                      <span>{rate.label}</span>
                      <strong className="font-black">{rate.points}</strong>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-center gap-2.5 flex-wrap w-full">
                <button
                  type="button"
                  onClick={() => setActiveSubTab(activeSubTab === 'cantine' ? 'micro' : 'cantine')}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 text-zinc-950 text-xs font-mono font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
                >
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>
                    {activeSubTab === 'cantine'
                      ? 'Voir les Packs Boutique'
                      : `Ouvrir la Cantine (${user.points || 0} pts)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-tabs Navigation Centrée (aucune coupure sur les bords) */}
        <div
          className={`mt-5 pt-3 border-t flex flex-wrap items-center justify-center gap-2 ${
            isDark ? 'border-zinc-800/80' : 'border-zinc-200'
          }`}
        >
          {[
            { id: 'cantine' as MarketSubTab, label: `⚡ Cantine (${user.points || 0} pts)`, icon: Zap },
            { id: 'micro' as MarketSubTab, label: 'Micro-Packs (0,50€ - 0,99€)', icon: Key },
            { id: 'vip' as MarketSubTab, label: 'Quartier VIP (1,99€/mois)', icon: Crown },
            { id: 'kits' as MarketSubTab, label: "Kits d'Évasion (2,99€ - 7,99€)", icon: BookOpen },
            { id: 'affiliate' as MarketSubTab, label: 'Outils Partenaires (0€)', icon: Award },
            { id: 'scripts' as MarketSubTab, label: '🎬 Scripts Vidéo Viraux', icon: Video },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'evasion-btn-primary font-bold'
                    : isDark
                    ? 'bg-transparent text-zinc-400 hover:text-zinc-200 border border-white/15 hover:border-[#f97316]/40'
                    : 'bg-white/40 text-zinc-600 hover:text-zinc-900 border border-zinc-200 hover:bg-zinc-200/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'stroke-[2.4]' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lock Gate below 10 keys */}
      {!hasFullKeyAccess && (
        <KeyAccessGate
          compact
          extraNote="La Boutique et la Cantine des Créateurs restent ouvertes immédiatement même à 0 🔑."
        />
      )}

      {/* 0. CANTINE DES CRÉATEURS SUR TOUTE LA LARGEUR & LONGUEUR DE L'ÉCRAN */}
      {activeSubTab === 'cantine' && <CantineCreatorsSection />}

      {/* 1. MICRO-TRANSACTIONS (Passe-Partout 0,99€ + Style Néon 0,50€ + Packs Clés & Cadenas) */}
      {activeSubTab === 'micro' && (
        <div className="space-y-4 text-center">
          <div className="flex flex-col items-center justify-center gap-1 text-xs font-mono px-1 text-center">
            <span className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Micro-transactions &amp; Packs Clés (« Prix d’un café »)
            </span>
            <span className={`text-[11px] xs:text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              Carte Bancaire (CB/Visa/Mastercard) &amp; PayPal sécurisé
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Le Passe-Partout (0,99 €) */}
            <div
              className={`rounded-3xl p-5 border relative overflow-hidden flex flex-col items-center justify-between text-center ${
                isDark
                  ? 'bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border-amber-500/40 shadow-lg'
                  : 'bg-white border-amber-300 shadow-xs'
              }`}
            >
              <div className="px-3 py-1 bg-amber-500 text-zinc-950 font-mono text-[10px] font-black rounded-full uppercase tracking-wider mb-3">
                COUP DE COEUR
              </div>

              <div className="flex flex-col items-center text-center w-full">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl mb-3 shadow-[0_0_20px_rgba(245,158,11,0.2)] mx-auto">
                  🗝️
                </div>
                <div className="flex flex-wrap items-baseline justify-center gap-2">
                  <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                    Le « Passe-Partout »
                  </h3>
                  <span className={`text-xl font-black font-mono ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    0,99 €
                  </span>
                </div>
                <p className={`text-xs mt-1 leading-relaxed max-w-md mx-auto ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Fais sauter les barreaux immédiatement sans attendre les 5 clés de la communauté.
                </p>

                <ul className={`mt-4 space-y-2 text-xs flex flex-col items-center text-center ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span><strong>Libération immédiate</strong> de ton message ou d'un camarade</span>
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" />
                    <span><strong>Épinglé tout en haut du mur pendant 24h</strong></span>
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Badge doré exclusif <strong>👑 Libéré d'Office</strong></span>
                  </li>
                </ul>
              </div>

              <div className={`w-full mt-6 pt-4 border-t flex items-center justify-center gap-2.5 ${isDark ? 'border-zinc-800/80' : 'border-zinc-200'}`}>
                <button
                  onClick={() => buyPassePartout()}
                  className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-95 cursor-pointer"
                >
                  <Key className="w-4 h-4 fill-zinc-950" />
                  <span>
                    {isMasterPass
                      ? 'Activer Passe-Partout (Gratuit · 0 €)'
                      : 'Acheter pour 0,99 €'}
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Pack Style Néon / Personnalisation de Cellule (0,50 €) */}
            <div
              className={`rounded-3xl p-5 border relative overflow-hidden flex flex-col items-center justify-between text-center ${
                isDark
                  ? 'bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border-zinc-800 shadow-lg'
                  : 'bg-white border-zinc-200 shadow-xs'
              }`}
            >
              <div className="flex flex-col items-center text-center w-full">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-2xl mb-3 shadow-[0_0_20px_rgba(6,182,212,0.2)] mx-auto">
                  🎨
                </div>
                <div className="flex flex-wrap items-baseline justify-center gap-2">
                  <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                    Pack « Style Néon »
                  </h3>
                  <span className={`text-xl font-black font-mono ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                    0,50 €
                  </span>
                </div>
                <p className={`text-xs mt-1 leading-relaxed max-w-md mx-auto ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Personnalise ta présence dans l'établissement avec un pseudo lumineux et un cadre de cellule exclusif.
                </p>

                {/* Live Preview of Chosen Neon + Frame */}
                <div
                  className={`w-full mt-3 p-3 rounded-2xl border flex flex-col sm:flex-row items-center justify-center gap-2.5 transition-all text-center ${
                    isDark ? 'bg-zinc-950/90' : 'bg-zinc-50'
                  } ${getCellFrameClasses(selectedFrame, selectedNeon, theme)}`}
                >
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-xl border flex items-center justify-center text-base shrink-0 overflow-hidden ${
                        isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-300'
                      }`}
                    >
                      <AvatarDisplay avatar={user.avatar} alt={user.alias} />
                    </span>
                    <div className="min-w-0 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-mono truncate ${getNeonItem(selectedNeon).textClass}`}>
                          {user.alias || user.matricule}
                        </span>
                        <ProfileStatusBadges
                          isVerified={isUserVerified}
                          profileType={user.profileType || 'personal'}
                          showPersonalLabel
                          compact
                        />
                      </div>
                      <div className={`text-[11px] font-mono truncate ${getNeonItem(selectedNeon).textClass}`}>
                        {user.matricule}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 ${
                      isDark
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                        : 'bg-white border-zinc-300 text-zinc-700'
                    }`}
                  >
                    {user.neonColor === selectedNeon && user.cellBorderFrame === selectedFrame
                      ? 'Actif ✓'
                      : 'Aperçu'}
                  </span>
                </div>

                {/* Mention à côté du profil : Particulier / Professionnel + Profil Vérifié (Google) */}
                <div className="w-full mt-3 pt-3 border-t border-zinc-800/70 space-y-2 text-center">
                  <span className={`text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                    <BadgeCheck className="w-3.5 h-3.5" />
                    <span>Mention à côté du profil (Gratuit) :</span>
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void updateProfileStatus({ profileType: 'personal' })}
                      className={`p-2 rounded-xl text-[11px] font-mono flex items-center justify-center gap-1.5 border cursor-pointer transition-all ${
                        (user.profileType || 'personal') === 'personal'
                          ? 'border-zinc-400 bg-zinc-800 text-white font-bold'
                          : isDark
                          ? 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      <User className="w-3 h-3" />
                      <span>Particulier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateProfileStatus({ profileType: 'professional' })}
                      className={`p-2 rounded-xl text-[11px] font-mono flex items-center justify-center gap-1.5 border cursor-pointer transition-all ${
                        user.profileType === 'professional'
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300 font-bold'
                          : isDark
                          ? 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      <Briefcase className="w-3 h-3" />
                      <span>Professionnel</span>
                    </button>
                  </div>
                  <div
                    className={`p-2.5 rounded-xl border text-[11px] flex items-center justify-between gap-2 text-left ${
                      isUserVerified
                        ? 'bg-sky-500/10 border-sky-400/40 text-sky-300'
                        : isDark
                        ? 'bg-zinc-950/70 border-zinc-800 text-zinc-400'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <BadgeCheck className={`w-4 h-4 shrink-0 ${isUserVerified ? 'text-sky-400' : 'text-zinc-500'}`} />
                      <span>
                        {isUserVerified
                          ? 'Profil Vérifié actif (Google ✓)'
                          : 'Connecte Google pour activer la mention Vérifié ✓'}
                      </span>
                    </span>
                    {!isUserVerified && (
                      <button
                        type="button"
                        onClick={() => openAuthModal()}
                        className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-black text-[10px] shrink-0 cursor-pointer"
                      >
                        Google
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Color Picker */}
                <div className="w-full mt-3.5 space-y-2 text-center">
                  <span className={`text-[11px] font-mono block ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Choisis ta couleur néon :
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {NEON_PALETTE.map((col) => {
                      const isSelected = selectedNeon === col.id;
                      return (
                        <button
                          key={col.id}
                          type="button"
                          onClick={() => setSelectedNeon(col.id)}
                          className={`p-2 rounded-xl text-[11px] font-mono flex items-center justify-center gap-1.5 transition-all border cursor-pointer text-center ${
                            isSelected
                              ? `${col.borderClass} ${col.bgClass} ${col.textClass} font-bold shadow-sm`
                              : isDark
                              ? 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dotClass}`} />
                          <span className="truncate">{col.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cadres de cellule */}
                <div className="w-full mt-3 space-y-1.5 text-center">
                  <span className={`text-[11px] font-mono block ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Cadre de cellule :
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {CELL_FRAME_OPTIONS.map((fr) => (
                      <button
                        key={fr.id}
                        type="button"
                        onClick={() => setSelectedFrame(fr.id)}
                        className={`p-2 rounded-xl text-center text-xs transition-all border cursor-pointer ${
                          selectedFrame === fr.id
                            ? isDark
                              ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300 font-semibold'
                              : 'border-cyan-500 bg-cyan-50 text-cyan-800 font-semibold'
                            : isDark
                            ? 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-zinc-200'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        <div className="font-mono text-[11px] truncate">{fr.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`w-full mt-6 pt-4 border-t flex items-center justify-center gap-2.5 ${isDark ? 'border-zinc-800/80' : 'border-zinc-200'}`}>
                <button
                  type="button"
                  onClick={() => buyNeonPack(selectedNeon, selectedFrame)}
                  className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 fill-zinc-950" />
                  <span>
                    {isMasterPass
                      ? user.neonColor === selectedNeon && user.cellBorderFrame === selectedFrame
                        ? 'Style Actif · Modifier (Gratuit · 0 €)'
                        : 'Activer ce Style (Gratuit · 0 €)'
                      : user.neonColor === selectedNeon && user.cellBorderFrame === selectedFrame
                      ? 'Style Actif · Modifier / Payer (0,50 €)'
                      : 'Activer & Payer (0,50 €)'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Packs Clés 🔑 & Cadenas 🔒 */}
          <div className="pt-2 space-y-3 text-center">
            <div className="flex flex-col items-center justify-center gap-1 px-1 text-center">
              <span className={`text-xs font-mono font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                🔑 Packs Clés Haute Valeur &amp; Cadenas 🔒
              </span>
              <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Crédit instantané
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {[
                {
                  id: 'pack_keys_15',
                  name: 'Trousseau Clandestin',
                  tagline: '+15 Clés 🔑 & +2 Cadenas 🔒 pour libérer Le Mur et débloquer l’accès complet.',
                  priceLabel: '1,99 €',
                  amount: 1.99,
                  keys: 15,
                  padlocks: 2,
                  icon: '🗝️',
                  type: 'keys_pack' as const,
                },
                {
                  id: 'pack_dev_support',
                  name: 'Café des Développeurs',
                  tagline: 'Soutien direct à ÉVASION + 10 Clés 🔑 & +2 Cadenas 🔒 Haute Valeur.',
                  priceLabel: '2,50 €',
                  amount: 2.5,
                  keys: 10,
                  padlocks: 2,
                  icon: '☕',
                  type: 'keys_pack' as const,
                },
                {
                  id: 'pack_vip_50',
                  name: 'Passe-Partout VIP + Cadenas',
                  tagline: '+50 Clés 🔑 (accès Studio Live débloqué !), +5 Cadenas 🔒 & Cellule VIP.',
                  priceLabel: '4,99 €',
                  amount: 4.99,
                  keys: 50,
                  padlocks: 5,
                  isVip: true,
                  icon: '👑',
                  type: 'keys_pack' as const,
                },
              ].map((pack) => (
                <div
                  key={pack.id}
                  className={`rounded-3xl p-4 border flex flex-col items-center justify-between text-center ${
                    pack.isVip
                      ? isDark
                        ? 'bg-gradient-to-br from-amber-950/35 via-zinc-900 to-zinc-950 border-amber-500/50 shadow-lg'
                        : 'bg-amber-50/70 border-amber-300 shadow-xs'
                      : isDark
                      ? 'bg-zinc-900/90 border-zinc-800'
                      : 'bg-white border-zinc-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col items-center text-center w-full">
                    <div className="flex flex-col items-center justify-center gap-1 mb-2">
                      <span className="text-2xl">{pack.icon}</span>
                      <span className={`text-base font-black font-mono ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        {isMasterPass ? '0,00 €' : pack.priceLabel}
                      </span>
                    </div>
                    <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                      {pack.name}
                    </h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {pack.tagline}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openShop(pack)}
                    className="mt-4 w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>
                      {isMasterPass ? 'Activer Gratuit (0 €)' : `Choisir & Payer (${pack.priceLabel})`}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Extension Mémoire Univers (Photos, Vidéos, Audios & Fichiers) */}
          <div className="pt-2 space-y-3 text-center">
            <div className="flex flex-col items-center justify-center gap-1 px-1 text-center">
              <span className={`text-xs font-mono font-bold ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                🧠 Mémoire Univers (Photos, Vidéos, Audios &amp; Fichiers)
              </span>
              <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                25 médias gratuits inclus · Extension permanente
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {[
                {
                  id: 'pack_storage_50',
                  name: 'Extension +50 Médias',
                  tagline: '+50 emplacements permanents dans Mon Univers (sans rien effacer) + 2 Clés 🔑.',
                  priceLabel: '1,99 €',
                  amount: 1.99,
                  storageSlots: 50,
                  keys: 2,
                  icon: '🧠',
                  type: 'storage_pack' as const,
                },
                {
                  id: 'pack_storage_150',
                  name: 'Extension +150 Médias',
                  tagline: '+150 emplacements photos, vidéos, audios & fichiers + 5 Clés 🔑 & +2 Cadenas 🔒.',
                  priceLabel: '3,99 €',
                  amount: 3.99,
                  storageSlots: 150,
                  keys: 5,
                  padlocks: 2,
                  icon: '💾',
                  type: 'storage_pack' as const,
                },
                {
                  id: 'pack_storage_unlimited',
                  name: 'Mémoire Illimitée ∞',
                  tagline: 'Médias illimités à vie sur ton Univers + 10 Clés 🔑, +5 Cadenas 🔒 & Cellule VIP.',
                  priceLabel: '7,99 €',
                  amount: 7.99,
                  isStorageUnlimited: true,
                  keys: 10,
                  padlocks: 5,
                  isVip: true,
                  icon: '♾️',
                  type: 'storage_pack' as const,
                },
              ].map((pack) => (
                <div
                  key={pack.id}
                  className={`rounded-3xl p-4 border flex flex-col items-center justify-between text-center ${
                    pack.isStorageUnlimited
                      ? isDark
                        ? 'bg-gradient-to-br from-cyan-950/35 via-zinc-900 to-zinc-950 border-cyan-500/50 shadow-lg'
                        : 'bg-cyan-50/70 border-cyan-300 shadow-xs'
                      : isDark
                      ? 'bg-zinc-900/90 border-zinc-800'
                      : 'bg-white border-zinc-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col items-center text-center w-full">
                    <div className="flex flex-col items-center justify-center gap-1 mb-2">
                      <span className="text-2xl">{pack.icon}</span>
                      <span className={`text-base font-black font-mono ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                        {isMasterPass ? '0,00 €' : pack.priceLabel}
                      </span>
                    </div>
                    <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                      {pack.name}
                    </h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {pack.tagline}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openShop(pack)}
                    className="mt-4 w-full py-2.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {isMasterPass ? 'Activer Gratuit (0 €)' : `Débloquer (${pack.priceLabel})`}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. ABONNEMENT QUARTIER VIP / ESPRIT LIBRE (1,99 € / mois) */}
      {activeSubTab === 'vip' && (
        <div className="space-y-4 text-center">
          <div
            className={`rounded-3xl p-6 border relative overflow-hidden text-center ${
              isDark
                ? 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950/30 border-amber-500/40 shadow-2xl'
                : 'bg-gradient-to-br from-white via-amber-50/40 to-amber-50 border-amber-300 shadow-xs'
            }`}
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center justify-center gap-6 text-center">
              <div className="max-w-2xl mx-auto flex flex-col items-center text-center">
                <div
                  className={`inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full border font-mono text-xs font-bold mb-3 ${
                    isDark
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-amber-100 border-amber-300 text-amber-800'
                  }`}
                >
                  <Crown className="w-4 h-4" />
                  <span>ABONNEMENT SANS ENGAGEMENT</span>
                </div>
                <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  Quartier VIP · Esprit Libre
                </h2>
                <div className="flex flex-wrap items-baseline justify-center gap-2 mt-1">
                  <span className={`text-3xl font-black font-mono ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    1,99 €
                  </span>
                  <span className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    / mois (moins cher qu'un espresso)
                  </span>
                </div>
                <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Salons privés, voix cryptée et +10 Clés 🔑 chaque mois.
                </p>

                {/* VIP Perks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 w-full">
                  <div className={`p-3.5 rounded-2xl border flex flex-col items-center text-center ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                    <div className={`flex items-center justify-center gap-2 font-bold text-xs ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                      <Radio className="w-4 h-4 shrink-0" />
                      <span>Salons Privés « Cellules Clandestines »</span>
                    </div>
                    <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Crée des salles de discussion instantanées privées entre amis pour vous entraider loin du reste de la prison.
                    </p>
                  </div>

                  <div className={`p-3.5 rounded-2xl border flex flex-col items-center text-center ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                    <div className={`flex items-center justify-center gap-2 font-bold text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      <Mic className="w-4 h-4 shrink-0" />
                      <span>Modificateur de Voix Crypté</span>
                    </div>
                    <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Transforme et anonymise tes notes vocales avec un pitch radio d'évasion digne des plus grands infiltrés.
                    </p>
                  </div>

                  <div className={`p-3.5 rounded-2xl border flex flex-col items-center text-center ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                    <div className={`flex items-center justify-center gap-2 font-bold text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                      <TrendingUp className="w-4 h-4 shrink-0" />
                      <span>Statistiques Détox Avancées</span>
                    </div>
                    <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Indice de clarté mentale, calcul précis des heures d'écrans sauvées et historique des streaks.
                    </p>
                  </div>

                  <div className={`p-3.5 rounded-2xl border flex flex-col items-center text-center ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                    <div className={`flex items-center justify-center gap-2 font-bold text-xs ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>
                      <Award className="w-4 h-4 shrink-0" />
                      <span>Badge d'Honneur & 10 Clés / Mois</span>
                    </div>
                    <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Reçois chaque mois un trousseau de clés bonus pour libérer qui tu veux sans attendre.
                    </p>
                  </div>
                </div>
              </div>

              {/* Subscribe CTA Box */}
              <div
                className={`p-6 rounded-3xl border flex flex-col justify-center items-center text-center gap-3 w-full max-w-sm shadow-md ${
                  isDark ? 'bg-zinc-900/90 border-amber-500/50' : 'bg-white border-amber-300'
                }`}
              >
                <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                  👑
                </div>
                <div className={`font-bold text-sm ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  {isVipActive ? 'Abonnement Actif' : 'Rejoindre le Quartier'}
                </div>
                <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {isVipActive
                    ? 'Tu bénéficies de tous les privilèges clandestins.'
                    : '1,99 € par mois. Résiliable en un clic à tout moment.'}
                </p>

                <button
                  onClick={subscribeVip}
                  className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 cursor-pointer ${
                    isVipActive
                      ? 'bg-emerald-500 text-zinc-950 cursor-default'
                      : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                  }`}
                >
                  {isVipActive ? '👑 VIP Déjà Activé' : "S'abonner (1,99 €/mois)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. KITS D'ÉVASION NUMÉRIQUES (2,99 € à 7,99 €) */}
      {activeSubTab === 'kits' && (
        <div className="space-y-4 text-center">
          <div className="flex flex-col items-center justify-center gap-1 text-xs font-mono px-1 text-center">
            <span className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Guides actionnables sans blabla
            </span>
            <span className={`text-[11px] xs:text-xs ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
              Consultables directement dans l’application
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DIGITAL_KITS.map((kit) => {
              const isPurchased = (user.purchasedKits || []).includes(kit.id);

              return (
                <div
                  key={kit.id}
                  className={`rounded-3xl p-5 border transition-all flex flex-col items-center justify-between text-center ${
                    isDark
                      ? 'bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800 hover:border-zinc-700'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col items-center text-center w-full">
                    <div className="flex flex-col items-center justify-center gap-2 mb-3">
                      <span
                        className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-2xl shadow-inner ${
                          isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'
                        }`}
                      >
                        {kit.icon}
                      </span>
                      {kit.badge && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full border font-mono text-[10px] font-bold ${
                            isDark
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          }`}
                        >
                          {kit.badge}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-baseline justify-center gap-2">
                      <span className="text-xs font-mono text-zinc-500">{kit.category}</span>
                      <span className={`text-lg font-black font-mono ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                        {kit.price}
                      </span>
                    </div>

                    <h3 className={`text-base font-bold mt-1 leading-snug ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                      {kit.title}
                    </h3>
                    <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {kit.subtitle}
                    </p>

                    <div
                      className={`w-full mt-3 pt-3 border-t flex items-center justify-center gap-3 text-[11px] text-zinc-500 font-mono ${
                        isDark ? 'border-zinc-800/80' : 'border-zinc-200'
                      }`}
                    >
                      <span>{kit.readingTime}</span>
                      <span>·</span>
                      <span>{kit.chapters.length} chapitres</span>
                    </div>
                  </div>

                  <div className={`w-full mt-5 pt-3 border-t flex items-center justify-center gap-2 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
                    {isPurchased ? (
                      <button
                        onClick={() => openKitReader(kit)}
                        className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Ouvrir le guide complet</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => buyKit(kit.id)}
                        className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] active:scale-95 cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>
                          {isMasterPass
                            ? 'Débloquer (Gratuit · 0 €)'
                            : `Débloquer (${kit.price})`}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. AFFILIATION & OUTILS PARTENAIRES (0 € pour l'utilisateur) */}
      {activeSubTab === 'affiliate' && (
        <div className="space-y-4 text-center">
          <div
            className={`p-3.5 rounded-2xl border text-xs text-center ${
              isDark
                ? 'bg-zinc-900/60 border-zinc-800 text-zinc-300'
                : 'bg-emerald-50 border-emerald-200 text-zinc-700'
            }`}
          >
            Outils testés sans surcoût (liens partenaires).
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AFFILIATE_RESOURCES.map((res) => (
              <div
                key={res.id}
                className={`rounded-3xl p-5 border transition-all flex flex-col items-center justify-between text-center ${
                  isDark
                    ? 'bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800 hover:border-zinc-700'
                    : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-xs'
                }`}
              >
                <div className="flex flex-col items-center text-center w-full">
                  <div className="flex flex-col items-center justify-center gap-2 mb-2">
                    <span
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
                        isDark ? 'bg-zinc-800' : 'bg-zinc-100 border border-zinc-200'
                      }`}
                    >
                      {res.icon}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full border font-mono text-[10px] font-bold ${
                        isDark
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                          : 'bg-cyan-50 border-cyan-300 text-cyan-700'
                      }`}
                    >
                      {res.badge}
                    </span>
                  </div>

                  <h3 className={`text-base font-bold mt-1 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                    {res.name}
                  </h3>
                  <div className={`text-xs font-mono mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    {res.commissionRate}
                  </div>
                  <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {res.description}
                  </p>

                  <ul className={`mt-3 space-y-1.5 text-[11px] flex flex-col items-center text-center ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    {res.features.map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-center justify-center gap-1.5">
                        <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`w-full mt-5 pt-3 border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full py-2.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition-colors ${
                      isDark
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white'
                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200'
                    }`}
                  >
                    <span>Découvrir l'outil</span>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. STRATÉGIE VIRALE : 3 SCRIPTS VIDÉO / REELS PERCUTANTS */}
      {activeSubTab === 'scripts' && (
        <div className="space-y-4 text-center">
          <div
            className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center ${
              isDark
                ? 'bg-gradient-to-r from-red-950/40 via-zinc-900 to-zinc-950 border-red-500/30'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <h2 className={`text-sm font-bold flex items-center justify-center gap-2 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                <Video className="w-4 h-4 text-red-500" />
                <span>3 Scripts Vidéo Clés en Main</span>
              </h2>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Prêts à tourner en 1 prise sans matériel.
              </p>
            </div>
            <span
              className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                isDark
                  ? 'text-red-400 bg-red-500/10 border-red-500/30'
                  : 'text-red-700 bg-white border-red-200'
              }`}
            >
              Prêts à tourner
            </span>
          </div>

          <div className="space-y-4">
            {VIRAL_SCRIPTS.map((script) => {
              const isCopied = copiedScriptId === script.id;

              return (
                <div
                  key={script.id}
                  className={`rounded-3xl p-5 border relative overflow-hidden text-center ${
                    isDark
                      ? 'bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border-zinc-800'
                      : 'bg-white border-zinc-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-2 mb-3 text-center">
                    <div className="flex flex-col items-center text-center">
                      <span
                        className={`text-[11px] font-mono uppercase tracking-wider ${
                          isDark ? 'text-amber-400' : 'text-amber-700'
                        }`}
                      >
                        {script.targetViews}
                      </span>
                      <h3 className={`text-base font-bold mt-0.5 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                        {script.title}
                      </h3>
                    </div>

                    <button
                      onClick={() =>
                        handleCopyScript(
                          `🎬 ${script.title}\n\n🎯 HOOK :\n${script.hook}\n\n📹 VISUEL :\n${script.visualConcept}\n\n🎙️ VOIX OFF / TEXTE :\n${script.voiceover}\n\n📢 APPEL À L'ACTION :\n${script.callToAction}\n\n🏷️ HASHTAGS :\n${script.hashtags.join(' ')}`,
                          script.id
                        )
                      }
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        !hasFullKeyAccess ? 'opacity-65' : ''
                      } ${
                        isCopied
                          ? 'bg-emerald-500 text-zinc-950 font-bold'
                          : isDark
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                          : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200'
                      }`}
                    >
                      {!hasFullKeyAccess ? (
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                      ) : isCopied ? (
                        <CheckCheck className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {!hasFullKeyAccess
                          ? 'Verrouillé · 10 🔑'
                          : isCopied
                          ? 'Script Copié !'
                          : 'Copier tout le script'}
                      </span>
                    </button>
                  </div>

                  {/* Hook */}
                  <div
                    className={`p-3 rounded-xl border text-xs mb-3 text-center ${
                      isDark
                        ? 'bg-red-500/10 border-red-500/30 text-red-200'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                  >
                    <strong className={`font-mono uppercase text-[10px] block mb-0.5 ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                      1. L'Accroche Choc (Secondes 0 à 3) :
                    </strong>
                    {script.hook}
                  </div>

                  {/* Visual Setup */}
                  <div
                    className={`p-3 rounded-xl border text-xs mb-3 text-center ${
                      isDark
                        ? 'bg-zinc-950/70 border-zinc-800/80 text-zinc-400'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    <strong className="text-zinc-500 font-mono uppercase text-[10px] block mb-0.5">
                      2. Idée Visuelle (Faceless ou Facecam) :
                    </strong>
                    {script.visualConcept}
                  </div>

                  {/* Voiceover Script */}
                  <div
                    className={`p-4 rounded-2xl border text-xs sm:text-sm whitespace-pre-line leading-relaxed font-normal mb-3 text-center ${
                      isDark
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-200'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                    }`}
                  >
                    <strong
                      className={`font-mono uppercase text-[10px] block mb-2 ${
                        isDark ? 'text-emerald-400' : 'text-emerald-700'
                      }`}
                    >
                      3. Récitation / Voix Off Complète :
                    </strong>
                    {script.voiceover}
                  </div>

                  {/* CTA & Hashtags */}
                  <div
                    className={`flex flex-col items-center justify-center gap-2 text-xs pt-3 border-t text-center ${
                      isDark ? 'border-zinc-800/80' : 'border-zinc-200'
                    }`}
                  >
                    <span className={`font-mono text-[11px] ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                      👉 {script.callToAction}
                    </span>
                    <div className="flex items-center justify-center gap-1.5 flex-wrap text-[10px] text-zinc-500 font-mono">
                      {script.hashtags.map((h, hIdx) => (
                        <span key={hIdx}>{h}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
