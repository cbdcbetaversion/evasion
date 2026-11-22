import React, { useMemo } from 'react';
import { Volume2, VolumeX, Plus, Sun, Moon, Mail, Bell, Wifi, WifiOff, BadgeCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDayOrdinal, formatDayCompact } from '../utils/formatDays';
import { AvatarDisplay } from './AvatarDisplay';
import { getNeonAvatarRingClass } from '../utils/neonStyles';
import { EvasionEmblem } from './EvasionEmblem';

interface TopHeaderProps {
  onOpenCreateModal: () => void;
  onOpenProfile: () => void;
  onBackToLanding?: () => void;
  onOpenInbox: () => void;
  onOpenNotifications: () => void;
  notificationsActive?: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  onOpenCreateModal,
  onOpenProfile,
  onBackToLanding,
  onOpenInbox,
  onOpenNotifications,
  notificationsActive = false,
}) => {
  const {
    user,
    authAccount,
    soundMuted,
    toggleSound,
    openShop,
    theme,
    toggleTheme,
    posts,
    chatMessages,
    incomingFriendRequests,
    isOnlineMode,
    isNetworkOnline,
    manualOfflineMode,
    pendingSyncCount,
    toggleOnlineOfflineMode,
  } = useApp();

  const unreadResponsesCount = useMemo(() => {
    let lastReadInbox = 0;
    try {
      lastReadInbox = Number(localStorage.getItem('evasion_last_read_inbox') || 0);
    } catch {
      lastReadInbox = 0;
    }
    let count = incomingFriendRequests.length;
    for (const p of posts) {
      if (p.authorId !== user.id && p.authorMatricule !== user.matricule) continue;
      if (!p.comments) continue;
      for (const c of p.comments) {
        if (
          c.authorMatricule !== user.matricule &&
          !c.id.startsWith('comm_live_') &&
          !c.id.startsWith('comm_aveu_') &&
          !c.authorId.startsWith('usr_v') &&
          c.createdAt > lastReadInbox
        ) {
          count++;
        }
      }
    }
    for (const m of chatMessages) {
      const isFromMe = m.authorId === user.id || m.authorMatricule === user.matricule;
      if (isFromMe) continue;
      const isToMe =
        m.recipientId === user.id ||
        m.recipientMatricule === user.matricule ||
        Boolean(m.channel && m.channel.startsWith('dm_') && m.channel.includes(user.matricule));
      if (isToMe && m.timestamp > lastReadInbox) {
        count++;
      }
    }
    return count;
  }, [posts, chatMessages, incomingFriendRequests.length, user.id, user.matricule]);

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur-md border-b px-3 sm:px-6 py-2 transition-colors ${
        theme === 'dark'
          ? 'bg-transparent border-white/15 text-white'
          : 'bg-white/85 border-zinc-300/80 text-zinc-900 shadow-2xs'
      }`}
    >
      <div className="max-w-2xl mx-auto w-full space-y-2">
        {/* Ligne 1 : Marque + Univers Perso + Compteurs Clés / Cadenas */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
            <button
              type="button"
              onClick={onBackToLanding}
              title="Écran d'accueil ÉVASION"
              className="flex items-center gap-1.5 sm:gap-2 hover:opacity-90 transition-opacity text-left cursor-pointer shrink-0 min-h-[34px] sm:min-h-[36px]"
            >
              <EvasionEmblem size="xs" />
              <span className="text-sm sm:text-base font-black tracking-wider uppercase font-sans flex items-center leading-none drop-shadow">
                <span className="text-[#ef4444] animate-neon-flicker inline-block mr-[1px]">É</span>
                <span className={theme === 'dark' ? 'text-white' : 'text-zinc-950'}>VASION</span>
              </span>
            </button>

            <button
              type="button"
              onClick={toggleOnlineOfflineMode}
              title={
                isOnlineMode
                  ? 'Mode En ligne actif — Cliquer pour passer Hors ligne'
                  : manualOfflineMode
                  ? 'Mode Hors ligne manuel — Cliquer pour repasser En ligne'
                  : 'Réseau indisponible (Mode local actif) — Cliquer pour basculer'
              }
              aria-label={isOnlineMode ? 'Mode En ligne' : 'Mode Hors ligne'}
              className={`relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold transition-all active:scale-95 cursor-pointer shrink-0 ${
                isOnlineMode
                  ? theme === 'dark'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    : 'border-emerald-600/40 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : theme === 'dark'
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                  : 'border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              {/* Point lumineux (vert éclatant pulsé si en ligne, ambre si hors ligne) */}
              <span className="relative flex h-2 w-2 shrink-0">
                {isOnlineMode && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isOnlineMode
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.95)]'
                      : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.85)]'
                  }`}
                />
              </span>
              {isOnlineMode ? (
                <Wifi className="w-3 h-3 shrink-0" />
              ) : (
                <WifiOff className="w-3 h-3 shrink-0" />
              )}
              <span className="hidden sm:inline">
                {isOnlineMode ? 'En ligne' : !isNetworkOnline ? 'Réseau off' : 'Hors ligne'}
              </span>
              {pendingSyncCount > 0 && (
                <span className="ml-0.5 px-1 rounded-full bg-amber-400 text-zinc-950 text-[9px] font-black leading-tight">
                  {pendingSyncCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink">
            <button
              type="button"
              onClick={onOpenProfile}
              title={`Voir mon profil (${user.alias}) · ${formatDayOrdinal(user.streakDays || user.detentionDays || 1)}`}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full border bg-transparent transition-all active:scale-95 cursor-pointer min-w-0 max-w-[140px] xs:max-w-[170px] sm:max-w-none shrink ${
                theme === 'dark'
                  ? 'hover:bg-white/10 border-white/20 text-zinc-100'
                  : 'hover:bg-black/5 border-zinc-300 text-zinc-900'
              }`}
            >
              <span
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center text-xs overflow-hidden shrink-0 bg-transparent ${getNeonAvatarRingClass(
                  user.neonColor,
                  theme
                )}`}
              >
                <AvatarDisplay avatar={user.avatar} alt={user.alias} />
              </span>
              <span className="text-xs font-bold truncate min-w-0 max-w-[55px] xs:max-w-[85px] sm:max-w-[130px] flex items-center gap-1">
                <span className="truncate">{user.alias}</span>
                {Boolean(user.isVerified || authAccount?.email) && (
                  <span title="Profil validé via Google" className="inline-flex shrink-0">
                    <BadgeCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  </span>
                )}
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono font-extrabold text-orange-500 tabular-nums shrink-0 whitespace-nowrap flex items-center gap-0.5">
                <span>🔥</span>
                {/* Sur mobile : format compact 'J1' pour ne jamais déborder du cadre */}
                <span className="sm:hidden">{formatDayCompact(user.streakDays || user.detentionDays || 1)}</span>
                {/* Sur écran large : format complet '1er jour' */}
                <span className="hidden sm:inline">{formatDayOrdinal(user.streakDays || user.detentionDays || 1)}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => openShop()}
              title={`Clés disponibles : ${user.keysAvailable}`}
              className={`flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm font-mono font-extrabold transition-colors cursor-pointer shrink-0 min-h-[32px] sm:min-h-[34px] px-1 sm:px-1.5 rounded-lg ${
                theme === 'dark'
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                  : 'text-amber-700 hover:text-amber-800 hover:bg-amber-700/10'
              }`}
            >
              <span className="text-sm sm:text-base">🔑</span>
              <span className="tabular-nums">{user.keysAvailable}</span>
            </button>

            <button
              type="button"
              onClick={() => openShop()}
              title={`Cadenas disponibles : ${user.padlocksAvailable ?? 0}`}
              className={`flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm font-mono font-extrabold transition-colors cursor-pointer shrink-0 min-h-[32px] sm:min-h-[34px] px-1 sm:px-1.5 rounded-lg ${
                theme === 'dark'
                  ? 'text-white hover:text-amber-300 hover:bg-white/10'
                  : 'text-zinc-900 hover:text-amber-600 hover:bg-black/5'
              }`}
            >
              <span className="text-sm sm:text-base">🔒</span>
              <span className="tabular-nums">{user.padlocksAvailable ?? 0}</span>
            </button>
          </div>
        </div>

        {/* Ligne 2 : Barre d'actions transparente, bien espacée et 100% visible */}
        <div
          className={`grid grid-cols-6 gap-1.5 sm:gap-2.5 pt-1.5 sm:pt-2 border-t ${
            theme === 'dark' ? 'border-white/10' : 'border-zinc-200/60'
          }`}
        >
          <button
            type="button"
            onClick={onOpenNotifications}
            title={notificationsActive ? 'Notifications actives' : 'Notifications téléphone'}
            aria-label="Notifications"
            className={`relative h-9 rounded-full border bg-transparent flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
              theme === 'dark'
                ? `border-white/15 hover:bg-white/10 ${notificationsActive ? 'text-emerald-400' : 'text-[#fb923c]'}`
                : `border-zinc-300 hover:bg-black/5 ${notificationsActive ? 'text-emerald-700' : 'text-orange-600'}`
            }`}
          >
            <Bell className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline text-[11px] font-mono font-semibold">Notifs</span>
          </button>

          <button
            type="button"
            onClick={onOpenInbox}
            title="Messages & Réponses"
            aria-label="Messages"
            className={`relative h-9 rounded-full border bg-transparent flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
              theme === 'dark'
                ? 'border-white/15 text-emerald-400 hover:bg-white/10'
                : 'border-zinc-300 text-emerald-700 hover:bg-black/5'
            }`}
          >
            <Mail className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline text-[11px] font-mono font-semibold">MP</span>
            {unreadResponsesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ef4444] text-white font-black text-[9px] flex items-center justify-center">
                {unreadResponsesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
            title={theme === 'dark' ? 'Mode jour' : 'Mode nuit'}
            className={`h-9 rounded-full border bg-transparent flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
              theme === 'dark'
                ? 'border-white/15 text-[#fb923c] hover:bg-white/10'
                : 'border-zinc-300 text-indigo-700 hover:bg-black/5'
            }`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            <span className="hidden sm:inline text-[11px] font-mono font-semibold">
              {theme === 'dark' ? 'Jour' : 'Nuit'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundMuted ? 'Activer le son' : 'Couper le son'}
            title={soundMuted ? 'Son coupé' : 'Son actif'}
            className={`h-9 rounded-full border bg-transparent flex items-center justify-center gap-1.5 transition-colors active:scale-95 cursor-pointer ${
              theme === 'dark'
                ? 'border-white/15 text-zinc-200 hover:text-white hover:bg-white/10'
                : 'border-zinc-300 text-zinc-700 hover:text-zinc-900 hover:bg-black/5'
            }`}
          >
            {soundMuted ? (
              <VolumeX className="w-4 h-4 text-zinc-500 shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            <span className="hidden sm:inline text-[11px] font-mono font-semibold">Son</span>
          </button>

          <button
            type="button"
            onClick={onOpenCreateModal}
            title="Publier un aveu"
            className="col-span-2 h-9 px-3 rounded-full evasion-btn-primary text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white shrink-0" />
            <span>Publier</span>
          </button>
        </div>
      </div>
    </header>
  );
};
