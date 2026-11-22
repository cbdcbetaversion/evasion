import React from 'react';
import { Lock, Key, Sparkles, PlusCircle, CheckCircle2, Target } from 'lucide-react';
import { useApp, MIN_KEYS_FULL_ACCESS, LIVE_MIN_KEYS_REQUIRED } from '../context/AppContext';

interface KeyAccessGateProps {
  title?: string;
  description?: string;
  compact?: boolean;
  extraNote?: string;
  onOpenCreate?: () => void;
}

export const KeyAccessGate: React.FC<KeyAccessGateProps> = ({
  title,
  description,
  compact = false,
  extraNote,
  onOpenCreate,
}) => {
  const {
    user,
    openShop,
    theme,
    dailyMission,
    isDailyMissionCompleted,
    completeDailyMission,
  } = useApp();
  const currentKeys = user.keysAvailable || 0;
  const missingKeys = Math.max(0, MIN_KEYS_FULL_ACCESS - currentKeys);
  const progressPct = Math.min(100, Math.round((currentKeys / MIN_KEYS_FULL_ACCESS) * 100));

  return (
    <div
      className={`rounded-3xl border text-center space-y-3.5 ${
        compact ? 'p-4' : 'p-6 sm:p-8'
      } ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-amber-950/30 via-zinc-900 to-zinc-950 border-amber-500/40 shadow-[0_0_28px_rgba(245,158,11,0.12)]'
          : 'bg-amber-50/80 border-amber-300 shadow-xs'
      }`}
    >
      <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
        <Lock className="w-6 h-6" />
      </div>

      <div className="space-y-1">
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-bold tabular-nums ${
            theme === 'dark'
              ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
              : 'bg-amber-100 border-amber-300 text-amber-800'
          }`}
        >
          <Key className="w-3 h-3" />
          <span>
            {currentKeys} / {MIN_KEYS_FULL_ACCESS} 🔑
          </span>
        </div>

        <h3
          className={`text-base sm:text-lg font-black tracking-tight ${
            theme === 'dark' ? 'text-white' : 'text-zinc-950'
          }`}
        >
          {title ||
            (currentKeys === 0
              ? `Débloque tout dès ${MIN_KEYS_FULL_ACCESS} 🔑`
              : `Plus que ${missingKeys} clé${missingKeys > 1 ? 's' : ''} pour tout débloquer`)}
        </h3>

        <p
          className={`text-xs max-w-md mx-auto leading-relaxed ${
            theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
          }`}
        >
          {description ||
            `Publie sur Le Mur (0 🔑) et valide ta mission du jour. Atteins ${MIN_KEYS_FULL_ACCESS} 🔑 pour ouvrir La Cour, les MP et Détox.`}
        </p>

        {extraNote && !description && (
          <p
            className={`text-[11px] font-mono max-w-md mx-auto ${
              theme === 'dark' ? 'text-amber-400/90' : 'text-amber-700'
            }`}
          >
            {extraNote}
          </p>
        )}
      </div>

      <div className="max-w-xs mx-auto space-y-1.5">
        <div
          className={`h-2 w-full rounded-full overflow-hidden ${
            theme === 'dark' ? 'bg-zinc-950 border border-zinc-800' : 'bg-amber-100 border border-amber-200'
          }`}
        >
          <div
            style={{ width: `${progressPct}%` }}
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
          />
        </div>
        <div className={`text-[10px] font-mono tabular-nums ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
          {progressPct}% · {MIN_KEYS_FULL_ACCESS} 🔑 requis (Live : {LIVE_MIN_KEYS_REQUIRED} 🔑)
        </div>
      </div>

      <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
        {onOpenCreate && (
          <button
            type="button"
            onClick={onOpenCreate}
            className="px-4 py-2 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-mono font-black text-xs uppercase tracking-wide inline-flex items-center gap-1.5 shadow-[0_0_16px_rgba(239,68,68,0.3)] active:scale-95 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Graver un aveu (+Clés)</span>
          </button>
        )}

        <button
          type="button"
          onClick={completeDailyMission}
          disabled={isDailyMissionCompleted}
          className={`px-4 py-2 rounded-2xl font-mono font-black text-xs uppercase tracking-wide inline-flex items-center gap-1.5 transition-all ${
            isDailyMissionCompleted
              ? theme === 'dark'
                ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 cursor-default'
                : 'bg-emerald-100 border border-emerald-300 text-emerald-700 cursor-default'
              : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_16px_rgba(16,185,129,0.28)] active:scale-95 cursor-pointer'
          }`}
        >
          {isDailyMissionCompleted ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Mission validée ✓</span>
            </>
          ) : (
            <>
              <Target className="w-4 h-4" />
              <span>Mission du jour (+{dailyMission.keysReward} 🔑)</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => openShop()}
          className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-black text-xs uppercase tracking-wide inline-flex items-center gap-1.5 shadow-[0_0_16px_rgba(245,158,11,0.28)] active:scale-95 transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>Boutique (+Clés) 🔑</span>
        </button>
      </div>
    </div>
  );
};
