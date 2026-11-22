import React from 'react';
import { Radio, Users, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LiveSession } from '../types';
import { AvatarDisplay } from './AvatarDisplay';

interface LiveAvatarWrapperProps {
  userId?: string;
  matricule?: string;
  sizeClass?: string;
  children: React.ReactNode;
}

/**
 * Wraps any user's avatar with a vivid animated Live aura ring & clickable LIVE pill
 * whenever that user is currently hosting OR co-hosting on screen in an active Live.
 */
export const LiveAvatarWrapper: React.FC<LiveAvatarWrapperProps> = ({
  userId,
  matricule,
  children,
}) => {
  const { getUserLiveSession, requestOpenLive } = useApp();
  const liveSession = getUserLiveSession(userId, matricule);

  if (!liveSession) {
    return <>{children}</>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        requestOpenLive(liveSession.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          requestOpenLive(liveSession.id);
        }
      }}
      title={`EN DIRECT 🔴 : « ${liveSession.title} » · Cliquer pour rejoindre le Live`}
      className="relative inline-flex items-center justify-center shrink-0 cursor-pointer group focus:outline-none"
    >
      <span className="live-avatar-aura inline-flex items-center justify-center">
        <span className="rounded-xl overflow-hidden block">{children}</span>
      </span>
      <span className="live-pseudo-pill absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded-full text-[8px] font-mono font-black text-white tracking-wider uppercase border border-white/40 whitespace-nowrap leading-none shadow-md">
        LIVE
      </span>
    </div>
  );
};

interface LivePseudoBadgeProps {
  userId?: string;
  matricule?: string;
  compact?: boolean;
}

/**
 * Displays a vivid animated EN LIVE pill next to any user's pseudo/name if they are currently live.
 * Clicking jumps straight into their active Live stream.
 */
export const LivePseudoBadge: React.FC<LivePseudoBadgeProps> = ({
  userId,
  matricule,
  compact = false,
}) => {
  const { getUserLiveSession, requestOpenLive } = useApp();
  const liveSession = getUserLiveSession(userId, matricule);

  if (!liveSession) return null;

  const totalOnScreen = 1 + (liveSession.guests?.length || 0);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        requestOpenLive(liveSession.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          requestOpenLive(liveSession.id);
        }
      }}
      title={`Rejoindre le Live de ${liveSession.hostName} : « ${liveSession.title} »`}
      className="live-pseudo-pill inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-black text-white tracking-wider uppercase cursor-pointer hover:scale-105 active:scale-95 transition-transform shrink-0 border border-white/30"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0" />
      <span>{compact ? 'LIVE' : 'EN LIVE'}</span>
      {!compact && totalOnScreen > 1 && (
        <span className="bg-black/30 px-1 rounded text-[8px]">{totalOnScreen}/5</span>
      )}
    </div>
  );
};

export interface OnlineStatusBadgeProps {
  userId?: string;
  matricule?: string;
  alias?: string;
  showText?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * Displays in real time whether a user profile is currently online or offline on the platform.
 */
export const OnlineStatusBadge: React.FC<OnlineStatusBadgeProps> = ({
  userId,
  matricule,
  alias,
  showText = true,
  size = 'sm',
  className = '',
}) => {
  const { user, onlineUsers, theme } = useApp();

  const isOnline = React.useMemo(() => {
    const targetId = userId?.trim();
    const targetMat = matricule?.trim().toLowerCase();
    const targetAlias = alias?.trim().toLowerCase();

    // Le compte actif actuel sur le navigateur/app est toujours en ligne
    if (
      (targetId && targetId === user.id) ||
      (targetMat && user.matricule && targetMat === user.matricule.toLowerCase()) ||
      (targetAlias && user.alias && targetAlias === user.alias.toLowerCase())
    ) {
      return true;
    }

    if (!onlineUsers || onlineUsers.length === 0) return false;
    return onlineUsers.some(
      (u) =>
        (targetId && u.id === targetId) ||
        (targetMat && u.matricule?.toLowerCase() === targetMat) ||
        (targetAlias && u.alias?.toLowerCase() === targetAlias)
    );
  }, [user.id, user.matricule, user.alias, onlineUsers, userId, matricule, alias]);

  const isDark = theme === 'dark';

  if (isOnline) {
    return (
      <span
        title="Actuellement connecté sur le site / l'application ÉVASION"
        className={`inline-flex items-center gap-1.5 rounded-full font-mono font-bold tracking-tight shrink-0 transition-colors ${
          size === 'xs'
            ? 'px-1.5 py-0.5 text-[9px]'
            : size === 'md'
            ? 'px-2.5 py-1 text-xs'
            : 'px-2 py-0.5 text-[10px]'
        } ${
          isDark
            ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-300'
            : 'bg-emerald-50 border border-emerald-300 text-emerald-800'
        } ${className}`}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        {showText && <span>En ligne</span>}
      </span>
    );
  }

  return (
    <span
      title="Actuellement hors ligne de la plateforme"
      className={`inline-flex items-center gap-1 rounded-full font-mono font-medium shrink-0 transition-colors ${
        size === 'xs'
          ? 'px-1.5 py-0.5 text-[9px]'
          : size === 'md'
          ? 'px-2.5 py-1 text-xs'
          : 'px-2 py-0.5 text-[10px]'
      } ${
        isDark
          ? 'bg-zinc-800/80 border border-zinc-700/60 text-zinc-400'
          : 'bg-zinc-100 border border-zinc-200 text-zinc-500'
      } ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
      {showText && <span>Hors ligne</span>}
    </span>
  );
};

interface GlobalLiveRadarStripProps {
  onOpenLiveTab?: () => void;
  compact?: boolean;
}

/**
 * Reusable Live Radar Strip to immediately detect all active Lives and connected users on the platform.
 */
export const GlobalLiveRadarStrip: React.FC<GlobalLiveRadarStripProps> = ({
  onOpenLiveTab,
  compact = false,
}) => {
  const { activeLives, onlineUsers, requestOpenLive, theme } = useApp();

  return (
    <div
      className={`rounded-2xl border p-2.5 sm:p-3 space-y-2 transition-all ${
        activeLives.length > 0 ? 'live-card-glow' : ''
      } ${
        theme === 'dark'
          ? 'bg-transparent border-white/15'
          : 'bg-white/75 border-zinc-300/90 backdrop-blur-xs shadow-xs'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {activeLives.length > 0 && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff0050] opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                activeLives.length > 0 ? 'bg-[#ff0050]' : 'bg-emerald-500 animate-pulse'
              }`}
            />
          </span>
          <span
            className={`text-[11px] font-mono font-black uppercase tracking-wider ${
              theme === 'dark' ? 'text-white' : 'text-zinc-900'
            }`}
          >
            {activeLives.length > 0
              ? `Radar Live · ${activeLives.length} diffusion${activeLives.length > 1 ? 's' : ''} en cours`
              : 'Aucun Live en direct · Temps réel'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono">
          {onlineUsers.length > 0 && (
            <span
              className={`flex items-center gap-1 font-bold ${
                theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>{onlineUsers.length} connecté{onlineUsers.length > 1 ? 's' : ''}</span>
            </span>
          )}
          {onOpenLiveTab && (
            <button
              type="button"
              onClick={onOpenLiveTab}
              className={`px-2.5 py-0.5 rounded-full font-bold cursor-pointer transition-colors flex items-center gap-1 border ${
                activeLives.length > 0
                  ? 'bg-[#ff0050] hover:bg-[#ff1a62] border-[#ff0050] text-white'
                  : theme === 'dark'
                  ? 'bg-transparent hover:bg-white/10 border-white/25 text-white'
                  : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-900 shadow-2xs'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>{activeLives.length > 0 ? 'Regarder' : 'Lancer un Live'}</span>
            </button>
          )}
        </div>
      </div>

      {activeLives.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {activeLives.map((live: LiveSession) => {
            const stageCount = 1 + (live.guests?.length || 0);
            return (
              <button
                key={live.id}
                type="button"
                onClick={() => requestOpenLive(live.id)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border shrink-0 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${
                  theme === 'dark'
                    ? 'bg-zinc-950/90 border-[#ff0050]/45 hover:border-[#00f2fe] text-white'
                    : 'bg-white border-rose-300 hover:border-[#ff0050] text-zinc-900 shadow-2xs'
                }`}
              >
                <span className="live-avatar-aura inline-flex items-center justify-center shrink-0">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm overflow-hidden ${
                      theme === 'dark' ? 'bg-zinc-900' : 'bg-zinc-100'
                    }`}
                  >
                    <AvatarDisplay avatar={live.hostAvatar || '⛓️'} alt={live.hostName} />
                  </span>
                </span>
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold truncate max-w-[95px]">
                      {live.hostName}
                    </span>
                    <span className="live-pseudo-pill px-1 py-[1px] rounded text-[8px] font-mono font-black text-white">
                      LIVE
                    </span>
                    {stageCount > 1 && (
                      <span
                        className={`px-1 py-[1px] rounded border text-[8px] font-mono font-bold ${
                          theme === 'dark'
                            ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                            : 'bg-cyan-50 border-cyan-300 text-cyan-800'
                        }`}
                      >
                        {stageCount}/5
                      </span>
                    )}
                  </div>
                  {!compact && (
                    <div
                      className={`text-[10px] font-mono flex items-center gap-1.5 truncate max-w-[140px] ${
                        theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'
                      }`}
                    >
                      <span className="truncate">{live.title}</span>
                      <span
                        className={`inline-flex items-center gap-0.5 shrink-0 font-bold ${
                          theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'
                        }`}
                      >
                        <Eye className="w-2.5 h-2.5" />
                        {live.viewersCount}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
