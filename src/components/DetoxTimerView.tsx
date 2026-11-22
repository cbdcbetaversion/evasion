import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  AlertTriangle,
  Lock,
  Music,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { KeyAccessGate } from './KeyAccessGate';
import { SoundscapeType } from '../utils/audio';
import { formatDayOrdinal } from '../utils/formatDays';
import { getYearlyTheme } from '../utils/yearlyAssets';

const QUOTES = [
  "« Chaque minute sans notification est un barreau de moins dans ta cellule mentale. »",
  "« Les algorithmes volent ton attention pour enrichir la Silicon Valley. Reprends tes heures. »",
  "« Le véritable luxe moderne n'est pas ce que tu consommes, mais le silence auquel tu accèdes. »",
  "« Tu n'es pas le produit. Tu es un esprit libre en train de briser son conditionnement. »",
  "« Le monde réel a des textures, des odeurs et des regards. Les écrans n'ont que de la lumière bleue. »",
];

export const DetoxTimerView: React.FC = () => {
  const { detoxSession, startDetox, cancelDetox, completeDetox, user, theme, hasFullKeyAccess } = useApp();
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);
  const [ambientSound, setAmbientSound] = useState<boolean>(true);
  const [soundscape, setSoundscape] = useState<SoundscapeType>('432hz');
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);
  const [quoteIdx, setQuoteIdx] = useState<number>(0);

  // Sync timer
  useEffect(() => {
    if (!detoxSession.isActive || !detoxSession.targetEndTime) {
      setTimeLeftSec(selectedMinutes * 60);
      return;
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    const updateTimer = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((detoxSession.targetEndTime! - now) / 1000));
      setTimeLeftSec(diffSec);

      if (diffSec <= 0) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        completeDetox();
      }
    };

    updateTimer();
    interval = setInterval(updateTimer, 1000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [detoxSession, completeDetox, selectedMinutes]);

  // Rotate quotes every 20 seconds during active session
  useEffect(() => {
    if (!detoxSession.isActive) return;
    const qInterval = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % QUOTES.length);
    }, 20000);
    return () => clearInterval(qInterval);
  }, [detoxSession.isActive]);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    startDetox(selectedMinutes, ambientSound, soundscape);
  };

  const confirmCancel = () => {
    cancelDetox();
    setShowCancelConfirm(false);
  };

  const totalSessionSec = (detoxSession.durationMinutes || selectedMinutes) * 60;
  const progressPercent = detoxSession.isActive
    ? Math.min(100, Math.round(((totalSessionSec - timeLeftSec) / totalSessionSec) * 100))
    : 0;

  const hasEspritLibreBadge = user.badges.some((b) => b.id === 'badge_esprit_libre');
  const screenTimeHours = Math.floor((user.screenTimeSavedMinutes || 0) / 60);
  const screenTimeMins = (user.screenTimeSavedMinutes || 0) % 60;
  const yearlyTheme = getYearlyTheme();

  return (
    <div className="space-y-4 pb-20">
      {/* Bouclier Anti-Scroll Header */}
      <div
        className={`relative rounded-3xl overflow-hidden border py-3.5 px-4 text-center transition-colors ${
          theme === 'dark'
            ? 'border-white/15 bg-transparent'
            : 'border-zinc-300/90 bg-white/75 backdrop-blur-xs shadow-xs'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <h2
              className={`text-base sm:text-lg font-black tracking-tight ${
                theme === 'dark' ? 'text-white' : 'text-zinc-950'
              }`}
            >
              🛡️ Bouclier Détox
            </h2>
            {hasEspritLibreBadge && (
              <span
                className={`text-xs font-mono font-bold ${
                  theme === 'dark' ? 'text-[#fb923c]' : 'text-orange-600'
                }`}
              >
                · Esprit Libre 🕊️
              </span>
            )}
          </div>

          <div
            className={`flex items-center justify-center gap-2.5 text-[11px] font-mono flex-wrap ${
              theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
            }`}
          >
            <span>
              <strong className={`font-bold ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
                {screenTimeHours}h {screenTimeMins}m
              </strong>{' '}
              gagnées
            </span>
            <span>·</span>
            <span>
              <strong className={`font-bold ${theme === 'dark' ? 'text-[#fb923c]' : 'text-orange-600'}`}>
                {formatDayOrdinal(user.detentionDays || user.streakDays || 1)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Focus / Detox Card */}
      <div
        className={`rounded-3xl p-6 border transition-all text-center relative overflow-hidden ${
          detoxSession.isActive
            ? theme === 'dark'
              ? 'bg-transparent border-emerald-500/60 shadow-[0_0_50px_rgba(16,185,129,0.2)]'
              : 'bg-white/80 border-emerald-500 shadow-md'
            : theme === 'dark'
            ? 'bg-transparent border-white/15'
            : 'bg-white/75 border-zinc-300/90 backdrop-blur-xs shadow-xs'
        }`}
      >
        {detoxSession.isActive ? (
          /* ACTIVE DETOX MODE */
          <div className="py-6 space-y-6">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${
                theme === 'dark'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-emerald-100 border-emerald-400 text-emerald-800'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Bouclier Verrouillé · Ambiance {detoxSession.soundscape || '432Hz'}</span>
            </div>

            {/* Circular pulse / timer representation */}
            <div className="relative w-48 h-48 sm:w-60 sm:h-60 mx-auto flex items-center justify-center">
              {/* Pulsing breathing ring */}
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping opacity-25" />
              <div className="absolute inset-2 rounded-full border border-emerald-500/40 animate-pulse" />

              {/* Progress background SVG circle */}
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  className={theme === 'dark' ? 'stroke-zinc-800' : 'stroke-zinc-200'}
                  strokeWidth="5"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  className="stroke-emerald-500 transition-all duration-1000"
                  strokeWidth="6"
                  strokeDasharray={276}
                  strokeDashoffset={276 - (276 * progressPercent) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>

              <div className="absolute flex flex-col items-center">
                <span
                  className={`text-3xl sm:text-5xl font-mono font-black tracking-wider tabular-nums ${
                    theme === 'dark'
                      ? 'text-white drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                      : 'text-zinc-950'
                  }`}
                >
                  {formatTime(timeLeftSec)}
                </span>
                <span
                  className={`text-[11px] font-mono mt-1 font-bold ${
                    theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                >
                  {progressPercent}% accompli
                </span>
                <span
                  className={`text-[10px] font-mono mt-0.5 ${
                    theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  Pose l'écran face contre table
                </span>
              </div>
            </div>

            <div className="max-w-md mx-auto min-h-[48px] flex items-center justify-center">
              <p
                className={`text-xs italic font-serif transition-opacity duration-500 ${
                  theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
                {QUOTES[quoteIdx]}
              </p>
            </div>

            {/* Cancel Button */}
            {!showCancelConfirm ? (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className={`text-xs underline decoration-dotted transition-colors cursor-pointer ${
                  theme === 'dark' ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-600 hover:text-red-600'
                }`}
              >
                Interrompre le bouclier
              </button>
            ) : (
              <div
                className={`p-3.5 border rounded-xl space-y-2 max-w-xs mx-auto animate-fade-in ${
                  theme === 'dark'
                    ? 'bg-red-950/40 border-red-800/60'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 justify-center text-xs font-semibold ${
                    theme === 'dark' ? 'text-red-300' : 'text-red-800'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span>Abandonner la session ?</span>
                </div>
                <p className={`text-[11px] ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Tu perdras ta progression et le bonus de +5 clés d'évasion.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(false)}
                    className={`px-3 py-1 rounded-lg text-xs cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-zinc-800 text-zinc-200'
                        : 'bg-white border border-zinc-300 text-zinc-800'
                    }`}
                  >
                    Continuer
                  </button>
                  <button
                    type="button"
                    onClick={confirmCancel}
                    className="px-3 py-1 rounded-lg bg-red-600 text-xs text-white font-bold cursor-pointer"
                  >
                    Abandonner
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : !hasFullKeyAccess ? (
          <KeyAccessGate
            compact
            title="Mode Détox · 10 🔑"
            description="Atteins 10 🔑 pour débloquer les sessions de coupure d'écran (+5 🔑 par session)."
          />
        ) : (
          /* IDLE / SETUP MODE */
          <div className="py-3 space-y-5">
            <div className="max-w-md mx-auto space-y-1">
              <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-950'}`}>
                Coupe les distractions
              </h3>
              <p className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Pose ton téléphone et gagne +5 🔑 à la fin du chrono.
              </p>
            </div>

            {/* Duration Presets */}
            <div>
              <label className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2 text-left max-w-md mx-auto">
                1. Durée de la déconnexion
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-md mx-auto">
                {[
                  { mins: 1, label: '1 min', sub: '⚡ Test' },
                  { mins: 15, label: '15 min', sub: 'Pause café' },
                  { mins: 30, label: '30 min', sub: 'Focus profond' },
                  { mins: 60, label: '60 min', sub: 'Esprit Libre 🕊️' },
                ].map((p) => (
                  <button
                    key={p.mins}
                    type="button"
                    onClick={() => setSelectedMinutes(p.mins)}
                      className={`p-3 rounded-xl border transition-all text-center cursor-pointer ${
                      selectedMinutes === p.mins
                        ? theme === 'dark'
                          ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                          : 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold shadow-xs'
                        : theme === 'dark'
                        ? 'bg-transparent border-white/15 text-zinc-300 hover:border-white/30'
                        : 'bg-white border-zinc-200 text-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <div className="font-mono text-sm sm:text-base font-bold">{p.label}</div>
                    <div className={`text-[10px] font-sans mt-0.5 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {p.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Soundscapes Selector - Exclusively 432Hz Soft & Silence */}
            <div>
              <div className="flex items-center justify-between max-w-md mx-auto mb-2 text-left">
                <label className={`text-[11px] font-mono uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  2. Fréquence Sonore Douce (432 Hz)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const next = !ambientSound;
                    setAmbientSound(next);
                    setSoundscape(next ? '432hz' : 'silence');
                  }}
                  className={`text-xs font-mono flex items-center gap-1 cursor-pointer ${
                    ambientSound && soundscape === '432hz'
                      ? theme === 'dark'
                        ? 'text-emerald-400'
                        : 'text-emerald-700 font-bold'
                      : theme === 'dark'
                      ? 'text-zinc-400'
                      : 'text-zinc-600'
                  }`}
                >
                  {ambientSound && soundscape === '432hz' ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>{ambientSound && soundscape === '432hz' ? '432Hz Doux Actif' : 'Coupé'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto">
                {[
                  {
                    id: '432hz' as SoundscapeType,
                    label: '432Hz Zen Doux',
                    icon: Music,
                    desc: 'Harmonie douce & apaisante',
                  },
                  {
                    id: 'silence' as SoundscapeType,
                    label: 'Silence Total',
                    icon: EyeOff,
                    desc: '0 décibel',
                  },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSoundscape(s.id);
                      setAmbientSound(s.id !== 'silence');
                    }}
                    className={`p-3 rounded-xl border transition-all text-left flex items-start gap-2.5 cursor-pointer ${
                      soundscape === s.id
                        ? theme === 'dark'
                          ? 'bg-emerald-500/15 border-emerald-500/60 text-white shadow-xs ring-1 ring-emerald-500/40'
                          : 'bg-emerald-50 border-emerald-500 text-zinc-950 shadow-xs ring-1 ring-emerald-500/30'
                        : theme === 'dark'
                        ? 'bg-zinc-950/50 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 text-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <s.icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        soundscape === s.id
                          ? theme === 'dark'
                            ? 'text-emerald-400'
                            : 'text-emerald-700'
                          : 'text-zinc-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{s.label}</div>
                      <div className={`text-[10px] font-mono truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        {s.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Rewards info */}
            <div
              className={`max-w-md mx-auto p-3.5 rounded-xl border flex items-center justify-around text-xs ${
                theme === 'dark'
                  ? 'bg-zinc-950/80 border-zinc-800'
                  : 'bg-white border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">🕊️</span>
                <div className="text-left">
                  <div className={`font-bold ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
                    Badge "Esprit Libre"
                  </div>
                  <div className={`text-[10px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Ajouté à ton profil
                  </div>
                </div>
              </div>
              <div className={`h-6 w-px ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
              <div className="flex items-center gap-2">
                <span className="text-xl">🔑</span>
                <div className="text-left">
                  <div className={`font-bold ${theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}`}>
                    +5 Clés Bonus
                  </div>
                  <div className={`text-[10px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Pour libérer les aveux
                  </div>
                </div>
              </div>
            </div>

            {/* Launch CTA */}
            <button
              type="button"
              onClick={handleStart}
              className="w-full max-w-sm mx-auto py-3.5 rounded-full evasion-btn-primary font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Verrouiller pour {selectedMinutes} minutes</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
