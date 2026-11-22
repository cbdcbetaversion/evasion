import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Music, Trash2, Edit3, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { DeezerTrack } from '../types';
import { useApp } from '../context/AppContext';
import { SmartImage } from './MediaElements';
import {
  getPlayableCoverUrl,
  getPlayableDeezerUrl,
  resolveFreshTrackPreviewUrl,
  soundEngine,
} from '../utils/audio';

interface AmbientMusicBarProps {
  track: DeezerTrack;
  sourceId: string;
  variant?: 'compact' | 'normal' | 'banner';
  label?: string;
  onRemove?: () => void;
  onChange?: () => void;
  className?: string;
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSec = Math.floor(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const AmbientMusicBar: React.FC<AmbientMusicBarProps> = ({
  track,
  sourceId,
  variant = 'normal',
  label = 'Musique de fond',
  onRemove,
  onChange,
  className = '',
}) => {
  const { stopAmbientTrack, theme } = useApp();
  const isDark = theme === 'dark';

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retriedRef = useRef(false);

  const [audioSrc, setAudioSrc] = useState<string>(() =>
    getPlayableDeezerUrl(track.audioUrl || track.previewUrl, track)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(track.duration || 30);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  const coverSrc = getPlayableCoverUrl(track.cover || track.albumCover || '');

  useEffect(() => {
    retriedRef.current = false;
    const nextUrl = getPlayableDeezerUrl(track.audioUrl || track.previewUrl, track);
    setAudioSrc(nextUrl);
    setIsPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setDuration(track.duration || 30);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [track.id, track.audioUrl, track.previewUrl, track.title, track.artist, track.duration]);

  // Coordinate across multiple AmbientMusicBar instances so only one plays at a time
  useEffect(() => {
    const onOtherPlay = (e: Event) => {
      const detail = (e as CustomEvent<{ sourceId?: string }>).detail;
      if (detail?.sourceId && detail.sourceId !== sourceId) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
        setIsBuffering(false);
      }
    };
    window.addEventListener('evasion:custom-audio-play', onOtherPlay);
    return () => {
      window.removeEventListener('evasion:custom-audio-play', onOtherPlay);
    };
  }, [sourceId]);

  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el) {
        el.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = Math.max(0, Math.min(1, volume));
    audioRef.current.muted = isMuted;
  }, [volume, isMuted]);

  const handleRefreshFallback = async () => {
    if (retriedRef.current) {
      setIsPlaying(false);
      setIsBuffering(false);
      return;
    }
    retriedRef.current = true;
    const freshUrl = await resolveFreshTrackPreviewUrl(track, true);
    if (freshUrl && audioRef.current) {
      setAudioSrc(freshUrl);
      audioRef.current.src = freshUrl;
      audioRef.current.load();
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setIsBuffering(false);
        });
    } else {
      setIsPlaying(false);
      setIsBuffering(false);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el || !audioSrc) return;

    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
      return;
    }

    // Stop any global context ambient track and notify other custom audio bars
    stopAmbientTrack();
    soundEngine.unlock();
    window.dispatchEvent(new CustomEvent('evasion:custom-audio-play', { detail: { sourceId } }));

    setIsBuffering(true);
    el.volume = Math.max(0, Math.min(1, volume));
    el.muted = isMuted;
    el.play()
      .then(() => {
        setIsPlaying(true);
        setIsBuffering(false);
      })
      .catch(() => {
        void handleRefreshFallback();
      });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const nextTime = Number(e.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current && Number.isFinite(nextTime)) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const nextVol = Number(e.target.value);
    setVolume(nextVol);
    if (nextVol > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const progressRatio = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const hiddenAudioElement = (
    <audio
      ref={audioRef}
      src={audioSrc || undefined}
      loop
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => {
        const d = e.currentTarget.duration;
        if (Number.isFinite(d) && d > 0) {
          setDuration(d);
        }
      }}
      onTimeUpdate={(e) => {
        setCurrentTime(e.currentTarget.currentTime);
      }}
      onPlay={() => {
        setIsPlaying(true);
        setIsBuffering(false);
      }}
      onPause={() => {
        setIsPlaying(false);
      }}
      onWaiting={() => setIsBuffering(true)}
      onPlaying={() => setIsBuffering(false)}
      onError={() => {
        void handleRefreshFallback();
      }}
      className="hidden"
    />
  );

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
          isPlaying
            ? isDark
              ? 'bg-orange-500/20 border border-orange-500/60 text-orange-200 shadow-[0_0_12px_rgba(249,115,22,0.3)]'
              : 'bg-orange-100 border border-orange-400 text-orange-900 shadow-xs'
            : isDark
            ? 'bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300'
            : 'bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-700'
        } ${className}`}
        title={`${track.title} · ${track.artist}`}
      >
        {hiddenAudioElement}
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-1.5 cursor-pointer font-medium truncate max-w-[200px]"
          aria-label={isPlaying ? 'Mettre en pause' : 'Écouter'}
        >
          {isBuffering ? (
            <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0" />
          ) : isPlaying ? (
            <Pause className="w-3 h-3 fill-current text-orange-400 shrink-0" />
          ) : (
            <Play className="w-3 h-3 fill-current text-zinc-400 shrink-0" />
          )}
          <span className="truncate">{track.title}</span>
          <span className="text-[10px] opacity-70 truncate">· {track.artist}</span>
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (audioRef.current) audioRef.current.pause();
              stopAmbientTrack(sourceId);
              onRemove();
            }}
            className="hover:text-red-400 p-0.5 cursor-pointer transition-colors"
            title="Retirer la musique"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`rounded-2xl border transition-all select-none ${
        variant === 'banner' ? 'p-3.5' : 'p-2.5'
      } ${
        isPlaying
          ? isDark
            ? 'bg-gradient-to-r from-orange-500/15 via-red-500/10 to-zinc-950 border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.25)]'
            : 'bg-gradient-to-r from-orange-50 via-amber-50 to-white border-orange-300 shadow-sm'
          : isDark
          ? 'bg-zinc-950/80 hover:bg-zinc-900/90 border-zinc-800/90 hover:border-zinc-700'
          : 'bg-zinc-50 hover:bg-zinc-100/80 border-zinc-200'
      } ${className}`}
    >
      {hiddenAudioElement}

      <div className="flex items-center justify-between gap-2.5">
        {/* Left: Cover + Play/Pause button + Title & Artist */}
        <div
          onClick={handleToggle}
          className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
        >
          <div className="relative shrink-0">
            <div
              className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center border ${
                isPlaying
                  ? 'border-orange-500/70 shadow-sm'
                  : isDark
                  ? 'bg-zinc-900 border-zinc-800'
                  : 'bg-zinc-200 border-zinc-300'
              }`}
            >
              {coverSrc ? (
                <SmartImage src={coverSrc} alt={track.title} className="w-full h-full object-cover" />
              ) : (
                <Music className={`w-4 h-4 ${isPlaying ? 'text-orange-400' : 'text-zinc-400'}`} />
              )}
            </div>
            <div
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] shadow ${
                isPlaying ? 'bg-orange-500 text-white' : 'bg-zinc-900 text-zinc-300 border border-zinc-700'
              }`}
            >
              {isBuffering ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-2.5 h-2.5 fill-white" />
              ) : (
                <Play className="w-2.5 h-2.5 fill-current" />
              )}
            </div>
          </div>

          <div className="min-w-0 text-left flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`text-xs font-bold truncate max-w-[200px] sm:max-w-xs ${
                  isPlaying
                    ? isDark
                      ? 'text-orange-300'
                      : 'text-orange-950 font-black'
                    : isDark
                    ? 'text-zinc-100'
                    : 'text-zinc-900'
                }`}
              >
                {track.title}
              </span>
              {label && (
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded-md uppercase font-bold shrink-0 ${
                    isPlaying
                      ? isDark
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                        : 'bg-orange-100 text-orange-800'
                      : isDark
                      ? 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                      : 'bg-zinc-200 text-zinc-700'
                  }`}
                >
                  {label}
                </span>
              )}
            </div>
            <div
              className={`text-[11px] font-mono truncate max-w-[200px] sm:max-w-xs ${
                isPlaying
                  ? isDark
                    ? 'text-orange-400/90'
                    : 'text-orange-800'
                  : isDark
                  ? 'text-zinc-400'
                  : 'text-zinc-600'
              }`}
            >
              {track.artist}
            </div>
          </div>
        </div>

        {/* Right: Play/Pause CTA + Volume + Edit/Remove Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggle}
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              isPlaying
                ? 'bg-orange-500 text-zinc-950 border-orange-400'
                : isDark
                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
                : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:text-zinc-900'
            }`}
          >
            {isBuffering ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Lire</span>
              </>
            )}
          </button>

          {onChange && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange();
              }}
              className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                isDark
                  ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
                  : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
              }`}
              title="Changer de musique"
              aria-label="Changer de musique"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}

          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (audioRef.current) audioRef.current.pause();
                stopAmbientTrack(sourceId);
                onRemove();
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
              title="Retirer la musique"
              aria-label="Retirer la musique"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Custom Native Progress Bar & Volume Control */}
      <div
        className={`mt-2.5 pt-2 border-t flex items-center justify-between gap-2.5 ${
          isDark ? 'border-white/10' : 'border-zinc-200/80'
        }`}
      >
        {/* Progress Slider */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className={`text-[10px] font-mono tabular-nums w-7 text-right ${
              isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            {formatAudioTime(currentTime)}
          </span>
          <div className="relative flex-1 flex items-center">
            <div
              className={`w-full h-1.5 rounded-full overflow-hidden pointer-events-none ${
                isDark ? 'bg-zinc-800' : 'bg-zinc-200'
              }`}
            >
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-100"
                style={{ width: `${progressRatio}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 30}
              step={0.1}
              value={Math.min(currentTime, duration || 30)}
              onChange={handleSeek}
              aria-label="Progression audio"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <span
            className={`text-[10px] font-mono tabular-nums w-7 ${
              isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            {formatAudioTime(duration)}
          </span>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted((prev) => !prev);
            }}
            aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
            title={isMuted ? 'Activer le son' : 'Couper le son'}
            className="text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-orange-400" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            aria-label="Volume"
            className="w-14 sm:w-16 h-1.5 accent-orange-500 bg-zinc-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
