import React from 'react';
import {
  Timer,
  CheckCircle2,
  MessageSquare,
  Users,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ActiveTab } from './BottomNav';
import { GlobalLiveRadarStrip, LivePseudoBadge } from './LiveBadge';
import { AvatarDisplay } from './AvatarDisplay';

interface DesktopSidebarRightProps {
  onChangeTab: (tab: ActiveTab) => void;
  onOpenDetox: () => void;
}

export const DesktopSidebarRight: React.FC<DesktopSidebarRightProps> = ({
  onChangeTab,
  onOpenDetox,
}) => {
  const {
    user,
    dailyMission,
    isDailyMissionCompleted,
    completeDailyMission,
    chatMessages,
    onlineInmatesCount,
    theme,
    hasFullKeyAccess,
    requireFullKeyAccess,
    openDirectChat,
    openUserProfile,
    availableInmates,
  } = useApp();

  const screenTimeHours = Math.floor((user.screenTimeSavedMinutes || 0) / 60);
  const screenTimeMins = (user.screenTimeSavedMinutes || 0) % 60;

  const latestMessages = chatMessages.slice(-3);

  return (
    <aside
      className={`hidden xl:flex flex-col w-80 sticky top-0 h-screen p-5 border-l select-none shrink-0 space-y-4 overflow-y-auto no-scrollbar backdrop-blur-xs ${
        theme === 'dark' ? 'bg-transparent border-white/15 text-zinc-100' : 'bg-white/75 border-zinc-300/80 text-zinc-900'
      }`}
    >
      {/* 0. Vue Publique du Profil */}
      <button
        type="button"
        onClick={() =>
          openUserProfile({
            id: user.id,
            matricule: user.matricule,
            alias: user.alias,
            avatar: user.avatar,
            neonColor: user.neonColor,
          })
        }
        title="Voir la vue publique de mon profil"
        className={`w-full p-3.5 rounded-2xl border bg-transparent text-left flex items-center justify-between gap-3 transition-all cursor-pointer hover:border-[#f97316]/60 ${
          theme === 'dark'
            ? 'border-white/15 hover:bg-white/5'
            : 'border-zinc-300 hover:bg-black/5'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-full bg-transparent border border-[#f97316]/40 flex items-center justify-center overflow-hidden shrink-0">
            <AvatarDisplay avatar={user.avatar} alt={user.alias} />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-black truncate">{user.alias}</div>
            <div className={`text-[10px] font-mono truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Vue publique · {(user.universeMedia || []).length} médias
            </div>
          </div>
        </div>
        <ArrowRight className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-[#fb923c]' : 'text-orange-600'}`} />
      </button>

      {/* 1. Détox & Temps Épargné */}
      <div
        className={`p-4 rounded-2xl border bg-transparent transition-all ${
          theme === 'dark'
            ? 'border-emerald-500/30'
            : 'border-emerald-300 bg-white/55'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`flex items-center gap-1.5 text-xs font-mono font-bold ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
            <Timer className="w-4 h-4" />
            <span>Temps Épargné</span>
          </span>
          <span className="text-sm font-black font-mono tabular-nums">
            {screenTimeHours}h {screenTimeMins}m
          </span>
        </div>

        <p className={`text-[11px] mb-3 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
          Coupe les écrans et gagne +5 🔑 par session.
        </p>

        <button
          type="button"
          onClick={() => {
            if (!requireFullKeyAccess('Mode Détox')) return;
            onOpenDetox();
          }}
          className={`w-full py-2.5 px-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
            !hasFullKeyAccess ? 'opacity-65' : ''
          }`}
        >
          {hasFullKeyAccess ? <Timer className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          <span>{hasFullKeyAccess ? 'Lancer Détox' : 'Détox · 10 🔑'}</span>
        </button>
      </div>

      {/* 2. Mission IRL du Jour */}
      <div
        className={`p-4 rounded-2xl border bg-transparent transition-all ${
          isDailyMissionCompleted
            ? theme === 'dark'
              ? 'border-emerald-500/40 text-emerald-300'
              : 'border-emerald-300 text-emerald-800'
            : theme === 'dark'
            ? 'border-white/15'
            : 'border-zinc-300'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
          <span className={`font-bold ${theme === 'dark' ? 'text-[#fb923c]' : 'text-orange-700'}`}>🎯 Mission du Jour</span>
          <span className={`text-[11px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600 font-semibold'}`}>+{dailyMission.keysReward} 🔑 +1 🔒</span>
        </div>

        <h4 className={`text-xs font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
          {dailyMission.icon} {dailyMission.title}
        </h4>
        <p className={`text-[11px] leading-relaxed mb-2.5 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
          {dailyMission.description}
        </p>

        {isDailyMissionCompleted ? (
          <div className={`flex items-center gap-1.5 text-xs font-mono font-bold ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Validée aujourd&apos;hui ✓</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={completeDailyMission}
            className="w-full py-2 px-3 rounded-full evasion-btn-primary font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Valider (+{dailyMission.keysReward} 🔑 +1 🔒)</span>
          </button>
        )}
      </div>

      {/* 2B. Détecteur Lives en cours */}
      <GlobalLiveRadarStrip onOpenLiveTab={() => onChangeTab('live')} compact />

      {/* 3. La Cour en Direct Snippet */}
      <div
        className={`p-4 rounded-2xl border bg-transparent transition-all ${
          theme === 'dark' ? 'border-white/15' : 'border-zinc-300'
        }`}
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <MessageSquare className={`w-4 h-4 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <h4 className={`text-xs font-bold font-mono uppercase ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
              La Cour
            </h4>
          </div>
          {availableInmates.length > 0 && (
            <div className={`flex items-center gap-1 text-[11px] font-mono ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600 font-semibold'}`}>
              <Users className={`w-3 h-3 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
              <span>{availableInmates.length} en ligne</span>
            </div>
          )}
        </div>

        {availableInmates.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2">
            {availableInmates.slice(0, 6).map((inmate) => (
              <button
                key={inmate.matricule}
                type="button"
                onClick={() => openDirectChat(inmate)}
                className={`px-2 py-1 rounded-lg border bg-transparent text-[10px] font-mono flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'hover:bg-white/10 border-white/15 hover:border-cyan-500/50 text-zinc-200'
                    : 'hover:bg-black/5 border-zinc-300 hover:border-cyan-500 text-zinc-700'
                }`}
              >
                <span className="w-4 h-4 rounded overflow-hidden inline-flex items-center justify-center shrink-0">
                  <AvatarDisplay avatar={inmate.avatar || '⛓️'} alt={inmate.alias || inmate.matricule} />
                </span>
                <span className="truncate max-w-[65px]">{inmate.alias || inmate.matricule}</span>
                <LivePseudoBadge userId={inmate.id} matricule={inmate.matricule} compact />
                {!hasFullKeyAccess && <Lock className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2 mb-3">
          {latestMessages.map((msg, idx) => (
            <div
              key={`${msg.id}_${idx}`}
              className={`p-2 rounded-xl border bg-transparent text-xs ${
                theme === 'dark' ? 'border-white/15' : 'border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-0.5">
                <div className="flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      openUserProfile({
                        id: msg.authorId,
                        matricule: msg.authorMatricule,
                        alias: msg.authorMatricule,
                        avatar: msg.authorAvatar || '⛓️',
                        neonColor: msg.neonColor,
                      })
                    }
                    className={`font-bold flex items-center gap-1 cursor-pointer transition-colors hover:underline ${
                      theme === 'dark' ? 'text-zinc-200 hover:text-cyan-300' : 'text-zinc-800 hover:text-cyan-600'
                    }`}
                  >
                    <span className="w-4 h-4 rounded overflow-hidden inline-flex items-center justify-center shrink-0">
                      <AvatarDisplay avatar={msg.authorAvatar} alt={msg.authorMatricule} />
                    </span>
                    <span className="truncate max-w-[85px]">{msg.authorMatricule}</span>
                  </button>
                  <LivePseudoBadge userId={msg.authorId} matricule={msg.authorMatricule} compact />
                </div>
                <span>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className={`text-[11px] line-clamp-2 leading-relaxed ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                {msg.content}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onChangeTab('chat')}
          className={`w-full py-2 px-3 rounded-xl border bg-transparent text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            theme === 'dark'
              ? 'border-white/20 hover:bg-white/10 text-zinc-100'
              : 'border-zinc-300 hover:bg-black/5 text-zinc-800'
          } ${!hasFullKeyAccess ? 'opacity-75' : ''}`}
        >
          {!hasFullKeyAccess && <Lock className="w-3.5 h-3.5 text-amber-500" />}
          <span>{hasFullKeyAccess ? 'Ouvrir La Cour' : 'La Cour · 10 🔑'}</span>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>
    </aside>
  );
};
