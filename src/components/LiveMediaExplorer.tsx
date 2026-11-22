import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  Image as ImageIcon,
  Mic,
  Film,
  X,
  Download,
  Sparkles,
  Volume2,
  VolumeX,
  Eye,
  Trash2,
  Music,
  Flame,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AvatarDisplay } from './AvatarDisplay';
import { SmartImage } from './MediaElements';
import { TikTokVoicePlayer } from './TikTokVoiceNote';
import { PointsExchangeModal } from './PointsExchangeModal';
import { downloadMediaAsset, peekResolvedMediaUrl, resolveMediaUrl } from '../utils/mediaStore';
import {
  resolveFreshTrackPreviewUrl,
  isDeezerPreviewLikelyExpired,
  getPlayableDeezerUrl,
} from '../utils/audio';
import { NeonColor, CellFrame, DeezerTrack } from '../types';
import {
  getNeonTextClass,
  getNeonAvatarRingClass,
  getCellFrameClasses,
} from '../utils/neonStyles';

export interface CommunityMediaFeedItem {
  feedId: string;
  source: 'universe' | 'post' | 'flame';
  itemId: string;
  postId?: string;
  ownerId: string;
  ownerMatricule: string;
  ownerAlias: string;
  ownerAvatar: string;
  ownerNeonColor?: NeonColor;
  ownerFrame?: CellFrame;
  type: 'photo' | 'video' | 'audio' | 'file' | 'text';
  url: string;
  text?: string;
  bgGradient?: string;
  caption?: string;
  duration?: number;
  fileName?: string;
  bgMusic?: DeezerTrack;
  expiresAt?: number;
  keysCount: number;
  padlocksCount: number;
  createdAt: number;
}

type MediaFilterType = 'all' | 'flame' | 'video' | 'photo' | 'audio';

function formatFlameRemainingShort(expiresAt?: number): string {
  if (!expiresAt) return '24H';
  const diffMs = Math.max(0, expiresAt - Date.now());
  const totalMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h${mins > 0 ? `${mins}m` : ''}`;
  return `${Math.max(1, mins)}m`;
}

function stopAndReleaseMediaElement(el: HTMLMediaElement | null) {
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    // ignore
  }
}

function useFreshMusicUrl(bgMusic?: DeezerTrack) {
  const [url, setUrl] = useState<string>(() => getPlayableDeezerUrl(bgMusic?.previewUrl, bgMusic));
  const [failed, setFailed] = useState(false);
  const retriedRef = useRef(false);

  useEffect(() => {
    let active = true;
    retriedRef.current = false;
    setFailed(false);
    const initial = getPlayableDeezerUrl(bgMusic?.previewUrl, bgMusic);
    setUrl(initial);

    if (bgMusic && initial && isDeezerPreviewLikelyExpired(initial)) {
      void resolveFreshTrackPreviewUrl(bgMusic, true).then((fresh) => {
        if (!active) return;
        if (fresh) setUrl(getPlayableDeezerUrl(fresh, bgMusic));
      });
    }
    return () => {
      active = false;
    };
  }, [bgMusic?.id, bgMusic?.previewUrl, bgMusic?.title, bgMusic?.artist]);

  const handleAudioError = useCallback(() => {
    if (!bgMusic || retriedRef.current) {
      setFailed(true);
      return;
    }
    retriedRef.current = true;
    void resolveFreshTrackPreviewUrl(bgMusic, true).then((fresh) => {
      if (fresh && fresh !== url) {
        setUrl(fresh);
      } else {
        setFailed(true);
      }
    });
  }, [bgMusic, url]);

  return { musicUrl: url, musicFailed: failed, handleAudioError };
}

const FullscreenVideoStage: React.FC<{
  src: string;
  isMuted: boolean;
  bgMusic?: DeezerTrack;
  wasSwipeRef?: React.MutableRefObject<boolean>;
  onAutoplayMuted?: () => void;
  onMediaError?: () => void;
}> = ({ src, isMuted, bgMusic, wasSwipeRef, onAutoplayMuted, onMediaError }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>(() => peekResolvedMediaUrl(src) || '');
  const [hasError, setHasError] = useState(false);
  const { musicUrl, musicFailed: bgMusicError, handleAudioError } = useFreshMusicUrl(bgMusic);
  const [isPlaying, setIsPlaying] = useState(true);
  const [centerIcon, setCenterIcon] = useState<'play' | 'pause' | null>(null);
  const indicatorTimerRef = useRef<number | null>(null);
  const errorReportedRef = useRef(false);
  const onMediaErrorRef = useRef(onMediaError);
  onMediaErrorRef.current = onMediaError;
  const onAutoplayMutedRef = useRef(onAutoplayMuted);
  onAutoplayMutedRef.current = onAutoplayMuted;

  const hasBgMusic = Boolean(musicUrl) && !bgMusicError;

  const reportErrorOnce = useCallback(() => {
    if (errorReportedRef.current) return;
    errorReportedRef.current = true;
    setHasError(true);
    onMediaErrorRef.current?.();
  }, []);

  // Safe pause/reset on unmount so neither video nor bgMusic lingers after swiping/closing
  useEffect(() => {
    const vEl = videoRef.current;
    const aEl = bgAudioRef.current;
    return () => {
      if (indicatorTimerRef.current) window.clearTimeout(indicatorTimerRef.current);
      stopAndReleaseMediaElement(bgAudioRef.current || aEl);
      stopAndReleaseMediaElement(videoRef.current || vEl);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setHasError(false);
    errorReportedRef.current = false;
    const sync = peekResolvedMediaUrl(src);
    if (sync) {
      setResolvedUrl(sync);
      return;
    }
    if (!src) {
      reportErrorOnce();
      return;
    }
    resolveMediaUrl(src)
      .then((u) => {
        if (!active) return;
        if (u) setResolvedUrl(u);
        else reportErrorOnce();
      })
      .catch(() => {
        if (active) reportErrorOnce();
      });
    return () => {
      active = false;
    };
  }, [src, reportErrorOnce]);

  // Sync video mute & playback (if bgMusic is valid, mute video so bgMusic plays cleanly; if bgMusic fails, restore video audio)
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !resolvedUrl) return;
    el.muted = hasBgMusic ? true : isMuted;
    el.playsInline = true;
    if (isPlaying && el.paused) {
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          if (!el.muted) {
            el.muted = true;
            el.play().catch(() => {});
            onAutoplayMutedRef.current?.();
          }
        });
      }
    }
  }, [resolvedUrl, isMuted, hasBgMusic, isPlaying]);

  // Sync background music play/pause/mute WITHOUT restarting currentTime on mute toggle
  useEffect(() => {
    const audio = bgAudioRef.current;
    if (!audio || !hasBgMusic) return;
    audio.muted = isMuted;
    if (isPlaying && !isMuted) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          if (err && (err as { name?: string }).name === 'AbortError') return;
          onAutoplayMutedRef.current?.();
        });
      }
    } else {
      audio.pause();
    }
  }, [hasBgMusic, musicUrl, isMuted, isPlaying]);

  const triggerCenterIndicator = (state: 'play' | 'pause') => {
    setCenterIcon(state);
    if (indicatorTimerRef.current) window.clearTimeout(indicatorTimerRef.current);
    indicatorTimerRef.current = window.setTimeout(() => {
      setCenterIcon(null);
    }, 700);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    const audio = bgAudioRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = hasBgMusic ? true : isMuted;
      v.play()
        .then(() => {
          setIsPlaying(true);
          triggerCenterIndicator('play');
          if (audio && hasBgMusic && !isMuted) {
            audio.play().catch(() => {});
          }
        })
        .catch(() => {
          v.muted = true;
          v.play()
            .then(() => {
              setIsPlaying(true);
              triggerCenterIndicator('play');
            })
            .catch(() => {});
          onAutoplayMuted?.();
        });
    } else {
      v.pause();
      if (audio) audio.pause();
      setIsPlaying(false);
      triggerCenterIndicator('pause');
    }
  };

  const toggleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  if (hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-black text-zinc-400">
        <Film className="w-10 h-10 mb-2 text-zinc-600" />
        <p className="text-xs font-mono">Vidéo temporairement indisponible — glisse pour continuer</p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-black/40 backdrop-blur-xl overflow-hidden group cursor-pointer"
      onDoubleClick={(e) => {
        e.stopPropagation();
        toggleFullscreen();
      }}
    >
      {musicUrl && !bgMusicError && (
        <audio
          ref={bgAudioRef}
          src={musicUrl}
          loop
          playsInline
          preload="auto"
          onError={() => handleAudioError()}
        />
      )}
      <video
        ref={videoRef}
        src={resolvedUrl || undefined}
        autoPlay
        loop
        playsInline
        preload="auto"
        muted={hasBgMusic ? true : isMuted}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => reportErrorOnce()}
        onClick={(e) => {
          e.stopPropagation();
          if (wasSwipeRef?.current) return;
          togglePlay();
        }}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Center animated play/pause indicator */}
      {centerIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-black/45 backdrop-blur-2xl border border-white/30 flex items-center justify-center text-white text-3xl shadow-2xl animate-bounce">
            {centerIcon === 'play' ? '▶️' : '⏸️'}
          </div>
        </div>
      )}
      <div className="absolute bottom-24 left-5 right-5 z-20 flex items-center justify-between gap-3 pointer-events-none">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-black/70 hover:bg-black text-white border border-white/25 text-xs font-mono font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-transform active:scale-95 shadow-lg opacity-90 hover:opacity-100"
          title={isPlaying ? 'Pause' : 'Lecture'}
        >
          <span>{isPlaying ? 'Pause ⏸️' : 'Play ▶️'}</span>
        </button>

        {bgMusic?.previewUrl && (
          <div className="pointer-events-none px-3 py-1 rounded-full bg-black/70 border border-orange-400/40 text-white text-[11px] font-mono font-bold flex items-center gap-1.5 backdrop-blur-md max-w-[180px]">
            <Music className="w-3 h-3 text-orange-400 shrink-0" />
            <span className="truncate">
              {bgMusicError ? 'Son vidéo actif' : bgMusic.title}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-black/70 hover:bg-black text-white border border-white/25 text-xs font-mono font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-transform active:scale-95 shadow-lg opacity-90 hover:opacity-100"
          title="Plein écran"
        >
          <span>Plein écran ⛶</span>
        </button>
      </div>
    </div>
  );
};

const FullscreenPhotoStage: React.FC<{
  src: string;
  alt: string;
  bgMusic?: DeezerTrack;
  isMuted: boolean;
  wasSwipeRef?: React.MutableRefObject<boolean>;
  onToggleMute: () => void;
  onMediaError?: () => void;
}> = ({ src, alt, bgMusic, isMuted, wasSwipeRef, onToggleMute, onMediaError }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const { musicUrl, musicFailed: bgMusicError, handleAudioError } = useFreshMusicUrl(bgMusic);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    setPhotoError(false);
  }, [src]);

  // Safe pause/reset on unmount or track change
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      stopAndReleaseMediaElement(audioRef.current || audio);
    };
  }, [musicUrl]);

  // Sync mute/play state without resetting currentTime on mute toggle
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicUrl || bgMusicError) {
      setIsMusicPlaying(false);
      setAutoplayBlocked(false);
      return;
    }
    audio.muted = isMuted;
    if (isMuted) {
      audio.pause();
      setIsMusicPlaying(false);
      setAutoplayBlocked(false);
    } else {
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          setIsMusicPlaying(true);
          setAutoplayBlocked(false);
        }).catch((err) => {
          if (err && (err as { name?: string }).name === 'AbortError') return;
          setIsMusicPlaying(false);
          setAutoplayBlocked(true);
        });
      }
    }
  }, [musicUrl, bgMusicError, isMuted]);

  const handleTogglePhotoMusic = (e: React.MouseEvent, fromBackground = false) => {
    e.stopPropagation();
    if (fromBackground && wasSwipeRef?.current) return;
    const audio = audioRef.current;
    if (!audio || !musicUrl || bgMusicError) return;
    if (isMuted) {
      onToggleMute();
      audio.muted = false;
      audio
        .play()
        .then(() => {
          setIsMusicPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch(() => {});
      return;
    }
    if (audio.paused) {
      audio
        .play()
        .then(() => {
          setIsMusicPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch(() => {});
    } else {
      audio.pause();
      setIsMusicPlaying(false);
    }
  };

  if (photoError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-black text-zinc-400">
        <ImageIcon className="w-10 h-10 mb-2 text-zinc-600" />
        <p className="text-xs font-mono">Photo temporairement indisponible — glisse pour continuer</p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full flex items-center justify-center overflow-hidden"
      onClick={musicUrl && !bgMusicError ? (e) => handleTogglePhotoMusic(e, true) : undefined}
    >
      {musicUrl && !bgMusicError && (
        <audio
          ref={audioRef}
          src={musicUrl}
          loop
          playsInline
          preload="auto"
          onPlay={() => {
            setIsMusicPlaying(true);
            setAutoplayBlocked(false);
          }}
          onPause={() => setIsMusicPlaying(false)}
          onError={() => {
            setIsMusicPlaying(false);
            setAutoplayBlocked(false);
            handleAudioError();
          }}
        />
      )}
      <SmartImage
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110 pointer-events-none"
      />
      <SmartImage
        src={src}
        alt={alt}
        onMediaError={() => {
          setPhotoError(true);
          onMediaError?.();
        }}
        className="relative z-10 w-full h-full object-contain pointer-events-none"
      />

      {bgMusic?.previewUrl && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <button
            type="button"
            disabled={bgMusicError}
            onClick={(e) => handleTogglePhotoMusic(e, false)}
            className="px-3.5 py-2 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-orange-400/50 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-xl cursor-pointer active:scale-95 transition-transform max-w-[85vw] disabled:opacity-65 disabled:cursor-default"
            title={
              bgMusicError
                ? 'Extrait audio indisponible'
                : isMusicPlaying && !isMuted
                ? 'Mettre le son en pause'
                : 'Activer le son'
            }
          >
            {!bgMusicError &&
              (isMusicPlaying && !isMuted ? (
                <Pause className="w-3.5 h-3.5 text-orange-400 fill-orange-400 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 text-orange-400 fill-orange-400 shrink-0" />
              ))}
            <Music className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="truncate max-w-[190px]">
              {bgMusicError
                ? `${bgMusic.title} (extrait indisponible)`
                : autoplayBlocked
                ? `Appuie pour le son · ${bgMusic.title}`
                : `${bgMusic.title}${bgMusic.artist ? ` — ${bgMusic.artist}` : ''}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

const FullscreenFlameTextStage: React.FC<{
  text: string;
  bgGradient?: string;
  bgMusic?: DeezerTrack;
  isMuted: boolean;
  wasSwipeRef?: React.MutableRefObject<boolean>;
  onToggleMute: () => void;
}> = ({ text, bgGradient, bgMusic, isMuted, wasSwipeRef, onToggleMute }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const { musicUrl, musicFailed: bgMusicError, handleAudioError } = useFreshMusicUrl(bgMusic);

  // Safe pause/reset on unmount or track change
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      stopAndReleaseMediaElement(audioRef.current || audio);
    };
  }, [musicUrl]);

  // Sync mute/play without resetting currentTime on mute toggle
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicUrl || bgMusicError) {
      setIsMusicPlaying(false);
      setAutoplayBlocked(false);
      return;
    }
    audio.muted = isMuted;
    if (isMuted) {
      audio.pause();
      setIsMusicPlaying(false);
      setAutoplayBlocked(false);
    } else {
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          setIsMusicPlaying(true);
          setAutoplayBlocked(false);
        }).catch((err) => {
          if (err && (err as { name?: string }).name === 'AbortError') return;
          setIsMusicPlaying(false);
          setAutoplayBlocked(true);
        });
      }
    }
  }, [musicUrl, bgMusicError, isMuted]);

  const handleToggleMusic = (e: React.MouseEvent, fromBackground = false) => {
    e.stopPropagation();
    if (fromBackground && wasSwipeRef?.current) return;
    const audio = audioRef.current;
    if (!audio || !musicUrl || bgMusicError) return;
    if (isMuted) {
      onToggleMute();
      audio.muted = false;
      audio
        .play()
        .then(() => {
          setIsMusicPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch(() => {});
      return;
    }
    if (audio.paused) {
      audio
        .play()
        .then(() => {
          setIsMusicPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch(() => {});
    } else {
      audio.pause();
      setIsMusicPlaying(false);
    }
  };

  return (
    <div
      onClick={musicUrl && !bgMusicError ? (e) => handleToggleMusic(e, true) : undefined}
      className={`relative w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br ${
        bgGradient || 'from-orange-600 via-red-600 to-rose-700'
      }`}
    >
      {musicUrl && !bgMusicError && (
        <audio
          ref={audioRef}
          src={musicUrl}
          loop
          playsInline
          preload="auto"
          onPlay={() => {
            setIsMusicPlaying(true);
            setAutoplayBlocked(false);
          }}
          onPause={() => setIsMusicPlaying(false)}
          onError={() => {
            setIsMusicPlaying(false);
            setAutoplayBlocked(false);
            handleAudioError();
          }}
        />
      )}
      <div className="max-w-md mx-auto space-y-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/30 border border-white/20 text-[11px] font-mono font-bold text-amber-200 uppercase tracking-wider">
          <Flame className="w-3.5 h-3.5 text-orange-300" />
          <span>Flamme 24h</span>
        </div>
        <p className="text-xl sm:text-3xl font-black text-white leading-snug drop-shadow-lg break-words whitespace-pre-wrap">
          {text}
        </p>
      </div>

      {bgMusic?.previewUrl && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <button
            type="button"
            disabled={bgMusicError}
            onClick={(e) => handleToggleMusic(e, false)}
            className="px-3.5 py-2 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-orange-400/50 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-xl cursor-pointer active:scale-95 transition-transform max-w-[85vw] disabled:opacity-65 disabled:cursor-default"
          >
            {!bgMusicError &&
              (isMusicPlaying && !isMuted ? (
                <Pause className="w-3.5 h-3.5 text-orange-400 fill-orange-400 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 text-orange-400 fill-orange-400 shrink-0" />
              ))}
            <Music className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="truncate max-w-[190px]">
              {bgMusicError
                ? `${bgMusic.title} (extrait indisponible)`
                : autoplayBlocked
                ? `Appuie pour le son · ${bgMusic.title}`
                : `${bgMusic.title}${bgMusic.artist ? ` — ${bgMusic.artist}` : ''}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

const FullscreenAudioStage: React.FC<{
  item: CommunityMediaFeedItem;
  isMuted: boolean;
  onToggleMute: () => void;
  onMediaError?: () => void;
}> = ({ item, isMuted, onToggleMute, onMediaError }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const { musicUrl, musicFailed: bgMusicError, handleAudioError } = useFreshMusicUrl(item.bgMusic);

  // Safe cleanup on unmount or track change; start paused so bgMusic never clashes with voice playback
  useEffect(() => {
    setIsMusicPlaying(false);
    const audio = audioRef.current;
    return () => {
      stopAndReleaseMediaElement(audioRef.current || audio);
    };
  }, [musicUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = isMuted;
    audio.volume = 0.35;
    if (isMuted) {
      audio.pause();
      setIsMusicPlaying(false);
    }
  }, [isMuted]);

  const handleToggleBgMusic = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !musicUrl || bgMusicError) return;
    if (isMuted) {
      onToggleMute();
      audio.muted = false;
    }
    if (audio.paused) {
      audio.volume = 0.35;
      audio
        .play()
        .then(() => setIsMusicPlaying(true))
        .catch(() => setIsMusicPlaying(false));
    } else {
      audio.pause();
      setIsMusicPlaying(false);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#ff0050]/20 via-zinc-950 to-[#00f2fe]/20">
      {musicUrl && !bgMusicError && (
        <audio
          ref={audioRef}
          src={musicUrl}
          loop
          playsInline
          preload="none"
          onPlay={() => setIsMusicPlaying(true)}
          onPause={() => setIsMusicPlaying(false)}
          onError={() => {
            setIsMusicPlaying(false);
            handleAudioError();
          }}
        />
      )}
      {item.source === 'flame' && (
        <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-400/40 text-[11px] font-mono font-bold text-orange-300 uppercase tracking-wider">
          <Flame className="w-3.5 h-3.5 text-orange-400" />
          <span>Flamme vocale 24h</span>
        </div>
      )}
      <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#00f2fe]/60 shadow-[0_0_30px_rgba(0,242,254,0.3)] mb-4 flex items-center justify-center bg-zinc-900 text-3xl">
        <AvatarDisplay avatar={item.ownerAvatar} alt={item.ownerAlias} />
      </div>
      <div className="w-full max-w-sm p-4 rounded-3xl bg-black/35 backdrop-blur-md border border-white/15">
        <TikTokVoicePlayer
          duration={item.duration || 8}
          audioData={item.url}
          onMediaError={onMediaError}
        />
      </div>

      {item.bgMusic?.previewUrl && (
        <div className="mt-4 pointer-events-auto">
          <button
            type="button"
            disabled={bgMusicError}
            onClick={handleToggleBgMusic}
            className="px-3.5 py-2 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-orange-400/50 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-xl cursor-pointer active:scale-95 transition-transform max-w-[85vw] disabled:opacity-65 disabled:cursor-default"
          >
            {!bgMusicError &&
              (isMusicPlaying && !isMuted ? (
                <Pause className="w-3.5 h-3.5 text-orange-400 fill-orange-400 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 text-orange-400 fill-orange-400 shrink-0" />
              ))}
            <Music className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="truncate max-w-[200px]">
              {bgMusicError
                ? `${item.bgMusic.title} (extrait indisponible)`
                : `${item.bgMusic.title}${item.bgMusic.artist ? ` — ${item.bgMusic.artist}` : ''}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export const LiveMediaExplorer: React.FC = () => {
  const {
    user,
    authAccount,
    posts,
    theme,
    openUserProfile,
    giveKey,
    sealPostWithPadlock,
    authFetch,
    syncServerSession,
    removeUniverseMedia,
    removeActiveFlame,
    stopAmbientTrack,
    showToast,
  } = useApp();

  const isDark = theme === 'dark';
  const [serverItems, setServerItems] = useState<CommunityMediaFeedItem[]>([]);
  const [deletedMediaKeys, setDeletedMediaKeys] = useState<Record<string, boolean>>({});
  const [isOpenFullscreen, setIsOpenFullscreen] = useState(false);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MediaFilterType>('all');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  // Tinder-style horizontal & vertical swipe state
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const didSwipeMoveRef = useRef<boolean>(false);

  const [localReactionBonus, setLocalReactionBonus] = useState<
    Record<
      string,
      {
        keys: number;
        padlocks: number;
        hearts: number;
        iceCones: number;
        waterBottles: number;
        cans: number;
      }
    >
  >({});
  const [centerBurst, setCenterBurst] = useState<{
    id: number;
    giftType: 'key' | 'padlock' | 'heart' | 'ice_cone' | 'water_bottle' | 'canned_food';
    senderName: string;
    senderAvatar: string;
    recipientName: string;
    combo: number;
  } | null>(null);

  const [givenMediaGifts, setGivenMediaGifts] = useState<
    Record<
      string,
      {
        heart?: number;
        ice_cone?: number;
        water_bottle?: number;
        canned_food?: number;
      }
    >
  >(() => {
    try {
      const raw = localStorage.getItem('evasion_media_given_gifts');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const FREE_GIFT_LIMITS = {
    heart: 5,
    ice_cone: 3,
    water_bottle: 3,
    canned_food: 2,
  } as const;

  const wheelCooldownRef = useRef<number>(0);
  const comboCountRef = useRef<number>(0);
  const lastGiftTimeRef = useRef<number>(0);

  const fetchCommunityMedia = useCallback(async () => {
    try {
      const res = await fetch('/api/media-feed', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as {
          success?: boolean;
          items?: CommunityMediaFeedItem[];
        };
        if (Array.isArray(data.items)) {
          setServerItems(data.items);
        }
      }
    } catch {
      // fallback uses local posts and user universeMedia
    }
  }, []);

  useEffect(() => {
    void fetchCommunityMedia();
  }, [
    fetchCommunityMedia,
    user.universeMedia?.length,
    user.isUniversePublic,
    user.activeFlame?.id,
    posts.length,
  ]);

  // Listen to real-time media deletions/additions/visibility updates across the app & WebSocket
  useEffect(() => {
    const handleMediaFeedUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          action?: string;
          ownerId?: string;
          itemId?: string;
          url?: string;
        }>
      ).detail;

      if (detail?.action === 'deleted') {
        const delId = detail.itemId?.trim();
        const delUrl = detail.url?.trim();
        if (delId || delUrl) {
          setDeletedMediaKeys((prev) => ({
            ...prev,
            ...(delId ? { [delId]: true } : {}),
            ...(delUrl ? { [delUrl]: true } : {}),
          }));
          setServerItems((prev) =>
            prev.filter(
              (it) =>
                (!delId || it.itemId !== delId) &&
                (!delUrl || it.url !== delUrl)
            )
          );
        }
      }
      void fetchCommunityMedia();
    };

    window.addEventListener('evasion:media-feed-updated', handleMediaFeedUpdated);
    return () => {
      window.removeEventListener('evasion:media-feed-updated', handleMediaFeedUpdated);
    };
  }, [fetchCommunityMedia]);

  const handleBrokenMedia = useCallback((item: CommunityMediaFeedItem) => {
    if (!item) return;
    // Ne JAMAIS supprimer un média du profil utilisateur ni envoyer un delete serveur sur un simple échec de chargement réseau.
    // On affiche simplement l'état indisponible dans le lecteur sans toucher au profil ni aux médias sauvegardés.
  }, []);

  const handleDeleteOwnMedia = useCallback(
    async (item: CommunityMediaFeedItem) => {
      if (item.ownerId !== user.id) return;
      const delId = item.itemId;
      const delUrl = item.url;

      // 1. Instant 0ms local state removal
      setDeletedMediaKeys((prev) => ({
        ...prev,
        ...(delId ? { [delId]: true } : {}),
        ...(delUrl ? { [delUrl]: true } : {}),
      }));
      setServerItems((prev) =>
        prev.filter((it) => it.itemId !== delId && it.url !== delUrl)
      );

      // 2. Remove from user's Flame or Universe and server
      if (item.source === 'flame') {
        await removeActiveFlame();
        showToast({
          title: 'Flamme supprimée 🗑️',
          message: 'Ta Flamme 24h a été retirée du Live Média.',
          type: 'info',
        });
        return;
      }

      await removeUniverseMedia(delId);
      try {
        await authFetch('/api/media-feed/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: delId, url: delUrl }),
        });
      } catch {
        // already removed optimistically
      }

      showToast({
        title: 'Média supprimé 🗑️',
        message: 'Ton média a été retiré immédiatement du Live Média.',
        type: 'info',
      });
    },
    [user.id, removeUniverseMedia, removeActiveFlame, authFetch, showToast]
  );

  // Combine server items with current user's active Flame, public universeMedia & media posts without duplicates
  const allMediaItems = useMemo(() => {
    const map = new Map<string, CommunityMediaFeedItem>();
    const ownActiveIds = new Set<string>();
    const ownActiveUrls = new Set<string>();
    const isOwnUniversePublic = user.isUniversePublic !== false;
    const now = Date.now();

    // 0. Current user's active 24h Flame (shown immediately in Média Live)
    if (
      user.activeFlame &&
      user.activeFlame.expiresAt > now &&
      user.activeFlame.type !== 'file' &&
      !deletedMediaKeys[user.activeFlame.id]
    ) {
      const fl = user.activeFlame;
      const hasValidContent =
        fl.type === 'text' ? Boolean(fl.text && fl.text.trim()) : Boolean(fl.url);
      if (hasValidContent) {
        const flameKey = `flame_${user.id}_${fl.id}`;
        ownActiveIds.add(fl.id);
        map.set(flameKey, {
          feedId: flameKey,
          source: 'flame',
          itemId: fl.id,
          ownerId: user.id,
          ownerMatricule: user.matricule,
          ownerAlias: user.alias || user.matricule,
          ownerAvatar: user.avatar || '⛓️',
          ownerNeonColor: user.neonColor,
          ownerFrame: user.cellBorderFrame,
          type: fl.type,
          url: fl.url || '',
          text: fl.text,
          bgGradient: fl.bgGradient,
          caption: fl.caption,
          duration: fl.duration,
          fileName: fl.fileName,
          bgMusic: fl.bgMusic,
          expiresAt: fl.expiresAt,
          keysCount: 0,
          padlocksCount: 0,
          createdAt: Number(fl.createdAt || now),
        });
      }
    }

    // 1. Current user's public universeMedia (authoritative for current user's Universe, including local idb:// while syncing)
    if (isOwnUniversePublic) {
      for (const m of user.universeMedia || []) {
        if (!m || !m.url || m.type === 'file') continue;
        if (m.visibility === 'private') continue;
        if (deletedMediaKeys[m.id] || deletedMediaKeys[m.url]) continue;
        ownActiveIds.add(m.id);
        ownActiveUrls.add(m.url);
        const key = m.url;
        map.set(key, {
          feedId: `uni_${user.id}_${m.id}`,
          source: 'universe',
          itemId: m.id,
          ownerId: user.id,
          ownerMatricule: user.matricule,
          ownerAlias: user.alias || user.matricule,
          ownerAvatar: user.avatar || '⛓️',
          ownerNeonColor: user.neonColor,
          ownerFrame: user.cellBorderFrame,
          type: m.type,
          url: m.url,
          caption: m.caption,
          duration: m.duration,
          fileName: m.fileName,
          bgMusic: m.bgMusic,
          keysCount: Number(m.keysCount || 0),
          padlocksCount: Number(m.padlocksCount || 0),
          createdAt: Number(m.createdAt || Date.now()),
        });
      }
    }

    // 2. Server media feed (all users' active Flames + Universe media + media posts)
    for (const item of serverItems) {
      if (!item || item.type === 'file') continue;
      if (item.source === 'flame') {
        if (item.expiresAt && item.expiresAt <= now) continue;
        if (deletedMediaKeys[item.itemId] || (item.url && deletedMediaKeys[item.url])) continue;
        if (item.type !== 'text' && (!item.url || item.url.startsWith('idb://'))) continue;
        if (item.type === 'text' && (!item.text || !item.text.trim())) continue;
        // Skip stale server copy of own flame if user deleted it locally
        if (
          (item.ownerId === user.id || item.ownerMatricule === user.matricule) &&
          (!user.activeFlame || user.activeFlame.id !== item.itemId)
        ) {
          continue;
        }
        const key = item.feedId || `flame_${item.ownerId}_${item.itemId}`;
        if (!map.has(key)) {
          map.set(key, item);
        }
        continue;
      }

      if (!item.url || item.url.startsWith('idb://')) continue;
      if (deletedMediaKeys[item.itemId] || deletedMediaKeys[item.url]) continue;
      // If this is current user's universe media, only keep it if it still exists in user.universeMedia
      if (
        item.source === 'universe' &&
        (item.ownerId === user.id || item.ownerMatricule === user.matricule) &&
        !ownActiveIds.has(item.itemId) &&
        !ownActiveUrls.has(item.url)
      ) {
        continue;
      }
      const key = item.url;
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const existing = map.get(key)!;
        map.set(key, {
          ...existing,
          bgMusic: existing.bgMusic || item.bgMusic,
          keysCount: Math.max(existing.keysCount, item.keysCount),
          padlocksCount: Math.max(existing.padlocksCount, item.padlocksCount),
        });
      }
    }

    // 3. Local posts with media
    for (const post of posts) {
      if (deletedMediaKeys[post.id]) continue;
      if (post.videoUrl && !post.videoUrl.startsWith('idb://') && !deletedMediaKeys[post.videoUrl]) {
        const key = post.videoUrl;
        if (!map.has(key)) {
          map.set(key, {
            feedId: `post_vid_${post.id}`,
            source: 'post',
            itemId: post.id,
            postId: post.id,
            ownerId: post.authorId,
            ownerMatricule: post.authorMatricule,
            ownerAlias: post.authorAlias || post.authorMatricule,
            ownerAvatar: post.authorAvatar || '⛓️',
            ownerNeonColor: post.authorNeonColor,
            ownerFrame: post.authorFrame,
            type: 'video',
            url: post.videoUrl,
            caption: post.content,
            duration: post.videoDuration,
            bgMusic: post.bgMusic,
            keysCount: Number(post.keysCount || 0),
            padlocksCount: Number(post.padlocksSealCount || 1),
            createdAt: Number(post.createdAt || Date.now()),
          });
        }
      } else if (post.imageUrl && !post.imageUrl.startsWith('idb://') && !deletedMediaKeys[post.imageUrl]) {
        const key = post.imageUrl;
        if (!map.has(key)) {
          map.set(key, {
            feedId: `post_img_${post.id}`,
            source: 'post',
            itemId: post.id,
            postId: post.id,
            ownerId: post.authorId,
            ownerMatricule: post.authorMatricule,
            ownerAlias: post.authorAlias || post.authorMatricule,
            ownerAvatar: post.authorAvatar || '⛓️',
            ownerNeonColor: post.authorNeonColor,
            ownerFrame: post.authorFrame,
            type: 'photo',
            url: post.imageUrl,
            caption: post.content,
            bgMusic: post.bgMusic,
            keysCount: Number(post.keysCount || 0),
            padlocksCount: Number(post.padlocksSealCount || 1),
            createdAt: Number(post.createdAt || Date.now()),
          });
        }
      } else if (
        post.audioNote?.audioData &&
        !post.audioNote.audioData.startsWith('idb://') &&
        !deletedMediaKeys[post.audioNote.audioData]
      ) {
        const key = post.audioNote.audioData;
        if (!map.has(key)) {
          map.set(key, {
            feedId: `post_aud_${post.id}`,
            source: 'post',
            itemId: post.id,
            postId: post.id,
            ownerId: post.authorId,
            ownerMatricule: post.authorMatricule,
            ownerAlias: post.authorAlias || post.authorMatricule,
            ownerAvatar: post.authorAvatar || '⛓️',
            ownerNeonColor: post.authorNeonColor,
            ownerFrame: post.authorFrame,
            type: 'audio',
            url: post.audioNote.audioData,
            caption: post.content,
            duration: post.audioNote.duration,
            bgMusic: post.bgMusic,
            keysCount: Number(post.keysCount || 0),
            padlocksCount: Number(post.padlocksSealCount || 1),
            createdAt: Number(post.createdAt || Date.now()),
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [user, serverItems, posts, deletedMediaKeys]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return allMediaItems;
    if (activeFilter === 'flame') return allMediaItems.filter((item) => item.source === 'flame');
    return allMediaItems.filter((item) => item.type === activeFilter);
  }, [allMediaItems, activeFilter]);

  useEffect(() => {
    if (activeIndex >= filteredItems.length) {
      setActiveIndex(0);
    }
  }, [filteredItems.length, activeIndex]);

  const currentItem = filteredItems[activeIndex] || null;

  // Always silence global/profile ambient audio while Live Média fullscreen is open or when swiping items
  useEffect(() => {
    if (isOpenFullscreen) {
      stopAmbientTrack();
    }
  }, [isOpenFullscreen, activeIndex, activeFilter, stopAmbientTrack]);

  // Background preloader & prefetcher so next/prev videos are downloaded and ready instantly
  useEffect(() => {
    if (!filteredItems.length || activeIndex < 0 || !isOpenFullscreen) return;
    const nextIdx = (activeIndex + 1) % filteredItems.length;
    const prevIdx = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
    [filteredItems[nextIdx], filteredItems[prevIdx]].forEach((item) => {
      if (item && item.url) {
        void resolveMediaUrl(item.url).catch(() => {});
      }
    });
  }, [activeIndex, filteredItems, isOpenFullscreen]);

  const handleCycleMedia = useCallback(
    (delta: number) => {
      if (filteredItems.length <= 1) return;
      setActiveIndex((prev) => (prev + delta + filteredItems.length) % filteredItems.length);
    },
    [filteredItems.length]
  );

  // Keyboard Left/Right/Up/Down navigation when fullscreen is open
  useEffect(() => {
    if (!isOpenFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleCycleMedia(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handleCycleMedia(-1);
      } else if (e.key === 'Escape') {
        setIsOpenFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpenFullscreen, handleCycleMedia]);

  // Unified Tinder-style swipe handlers (Left <-> Right & Up <-> Down)
  const startSwipeGesture = (clientX: number, clientY: number, target: HTMLElement | null) => {
    if (target?.closest('button, input, a')) {
      dragStartRef.current = null;
      return;
    }
    dragStartRef.current = { x: clientX, y: clientY, time: Date.now() };
    didSwipeMoveRef.current = false;
    setIsDragging(true);
  };

  const moveSwipeGesture = (clientX: number, clientY: number) => {
    if (!dragStartRef.current) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      didSwipeMoveRef.current = true;
    }
    setDragOffset({ x: dx, y: dy });
  };

  const endSwipeGesture = () => {
    if (!dragStartRef.current) return;
    const { x: dx, y: dy } = dragOffset;
    dragStartRef.current = null;
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });

    if (filteredItems.length <= 1) return;

    // Swipe gauche <-> droite ou haut <-> bas (4 directions fluides)
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (Math.abs(dx) >= 40) {
        handleCycleMedia(dx < 0 ? 1 : -1);
      }
    } else if (Math.abs(dy) >= 40) {
      handleCycleMedia(dy < 0 ? 1 : -1);
    }
  };

  const GIFT_META = {
    key: {
      emoji: '🔑',
      title: '1 Clé (+100 pts Cantine pour le créateur)',
      ring: 'border-amber-400 bg-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.6)]',
      pill: 'bg-amber-600/80 border-amber-300/60',
    },
    padlock: {
      emoji: '🔒',
      title: '1 Cadenas (+150 pts Cantine pour le créateur)',
      ring: 'border-sky-400 bg-sky-500/20 shadow-[0_0_40px_rgba(56,189,248,0.6)]',
      pill: 'bg-sky-600/80 border-sky-300/60',
    },
    heart: {
      emoji: '❤️',
      title: '1 Cœur (+25 pts Cantine pour le créateur)',
      ring: 'border-pink-400 bg-pink-500/20 shadow-[0_0_40px_rgba(244,63,94,0.6)]',
      pill: 'bg-pink-600/80 border-pink-300/60',
    },
    ice_cone: {
      emoji: '🍦',
      title: '1 Glace Cornet (+50 pts Cantine pour le créateur)',
      ring: 'border-rose-400 bg-rose-500/20 shadow-[0_0_40px_rgba(251,113,133,0.6)]',
      pill: 'bg-rose-600/80 border-rose-300/60',
    },
    water_bottle: {
      emoji: '💧',
      title: '1 Bouteille d’Eau (+75 pts Cantine pour le créateur)',
      ring: 'border-cyan-400 bg-cyan-500/20 shadow-[0_0_40px_rgba(34,211,238,0.6)]',
      pill: 'bg-cyan-600/80 border-cyan-300/60',
    },
    canned_food: {
      emoji: '🥫',
      title: '1 Boîte de Conserve (+80 pts Cantine pour le créateur)',
      ring: 'border-orange-400 bg-orange-500/20 shadow-[0_0_40px_rgba(251,146,60,0.6)]',
      pill: 'bg-orange-600/80 border-orange-300/60',
    },
  } as const;

  const triggerLiveStyleBurst = (
    giftType: 'key' | 'padlock' | 'heart' | 'ice_cone' | 'water_bottle' | 'canned_food',
    recipientName: string
  ) => {
    const now = Date.now();
    if (now - lastGiftTimeRef.current < 2500) {
      comboCountRef.current += 1;
    } else {
      comboCountRef.current = 1;
    }
    lastGiftTimeRef.current = now;
    const id = now;
    setCenterBurst({
      id,
      giftType,
      senderName: user.alias || user.matricule,
      senderAvatar: user.avatar || '⛓️',
      recipientName,
      combo: comboCountRef.current,
    });
    window.setTimeout(() => {
      setCenterBurst((curr) => (curr?.id === id ? null : curr));
    }, 1500);
  };

  const handleReactToMedia = async (
    item: CommunityMediaFeedItem,
    giftType: 'key' | 'padlock' | 'heart' | 'ice_cone' | 'water_bottle' | 'canned_food',
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();

    if (item.ownerId === user.id) {
      showToast({
        title: 'Ton propre média 🎬',
        message: 'Ce sont les autres détenus qui t’offrent des cadeaux pour créditer tes points Cantine !',
        type: 'info',
      });
      return;
    }

    if (giftType === 'key') {
      if ((user.keysAvailable || 0) <= 0) {
        showToast({
          title: 'Stock épuisé · 0 Clé 🔑',
          message: 'Tu n’as plus de clés en réserve. Publie un aveu ou valide ta mission pour en obtenir !',
          type: 'warning',
        });
        return;
      }
    } else if (giftType === 'padlock') {
      if ((user.padlocksAvailable || 0) <= 0) {
        showToast({
          title: 'Stock épuisé · 0 Cadenas 🔒',
          message: 'Tu n’as plus de cadenas en réserve. Valide ta mission du jour pour en obtenir !',
          type: 'warning',
        });
        return;
      }
    } else {
      const alreadyGiven = givenMediaGifts[item.feedId]?.[giftType] || 0;
      const maxAllowed = FREE_GIFT_LIMITS[giftType];
      if (alreadyGiven >= maxAllowed) {
        showToast({
          title: 'Limite atteinte 🛑',
          message: `Tu as déjà offert le maximum autorisé (${maxAllowed}/${maxAllowed}) pour ce média !`,
          type: 'warning',
        });
        return;
      }

      setGivenMediaGifts((prev) => {
        const next = {
          ...prev,
          [item.feedId]: {
            ...(prev[item.feedId] || {}),
            [giftType]: alreadyGiven + 1,
          },
        };
        try {
          localStorage.setItem('evasion_media_given_gifts', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }

    setLocalReactionBonus((prev) => {
      const current = prev[item.feedId] || {
        keys: 0,
        padlocks: 0,
        hearts: 0,
        iceCones: 0,
        waterBottles: 0,
        cans: 0,
      };
      return {
        ...prev,
        [item.feedId]: {
          keys: current.keys + (giftType === 'key' ? 1 : 0),
          padlocks: current.padlocks + (giftType === 'padlock' ? 1 : 0),
          hearts: current.hearts + (giftType === 'heart' ? 1 : 0),
          iceCones: current.iceCones + (giftType === 'ice_cone' ? 1 : 0),
          waterBottles: current.waterBottles + (giftType === 'water_bottle' ? 1 : 0),
          cans: current.cans + (giftType === 'canned_food' ? 1 : 0),
        },
      };
    });

    triggerLiveStyleBurst(giftType, item.ownerAlias);

    if (item.source === 'post' && item.postId && (giftType === 'key' || giftType === 'padlock')) {
      if (giftType === 'key') {
        giveKey(item.postId);
      } else {
        sealPostWithPadlock(item.postId);
      }
      return;
    }

    try {
      const res = await authFetch('/api/media-feed/react', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          matricule: user.matricule,
          alias: user.alias,
          source: item.source,
          itemId: item.itemId,
          ownerId: item.ownerId,
          giftType,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          success?: boolean;
          keysCount?: number;
          padlocksCount?: number;
          senderProfile?: typeof user;
        };
        if (typeof data.keysCount === 'number' || typeof data.padlocksCount === 'number') {
          setServerItems((prev) =>
            prev.map((it) =>
              it.feedId === item.feedId || it.itemId === item.itemId
                ? {
                    ...it,
                    keysCount:
                      typeof data.keysCount === 'number' && data.keysCount > 0
                        ? data.keysCount
                        : it.keysCount,
                    padlocksCount:
                      typeof data.padlocksCount === 'number' && data.padlocksCount > 0
                        ? data.padlocksCount
                        : it.padlocksCount,
                  }
                : it
            )
          );
          if (giftType === 'key' || giftType === 'padlock') {
            setLocalReactionBonus((prev) => {
              const cur = prev[item.feedId];
              if (!cur) return prev;
              return {
                ...prev,
                [item.feedId]: {
                  ...cur,
                  keys: giftType === 'key' ? Math.max(0, cur.keys - 1) : cur.keys,
                  padlocks: giftType === 'padlock' ? Math.max(0, cur.padlocks - 1) : cur.padlocks,
                },
              };
            });
          }
        }
        // Ne synchroniser que si le profil renvoyé correspond STRICTEMENT au même utilisateur ET ne régresse ni le pseudo ni les médias/flamme
        if (
          data.senderProfile &&
          data.senderProfile.id === user.id &&
          (user.alias === 'Spectre En Quête' || data.senderProfile.alias !== 'Spectre En Quête') &&
          (data.senderProfile.universeMedia?.length || 0) >= (user.universeMedia?.length || 0)
        ) {
          syncServerSession({
            id: authAccount?.id || user.id,
            username: authAccount?.username || user.alias || user.id,
            profile: {
              ...user,
              keysAvailable: data.senderProfile.keysAvailable,
              padlocksAvailable: data.senderProfile.padlocksAvailable,
              heartsAvailable: data.senderProfile.heartsAvailable,
              iceConesAvailable: data.senderProfile.iceConesAvailable,
              waterBottlesAvailable: data.senderProfile.waterBottlesAvailable,
              cansAvailable: data.senderProfile.cansAvailable,
              keysGivenTotal: data.senderProfile.keysGivenTotal,
              points: Math.max(user.points || 0, data.senderProfile.points || 0),
            },
          });
        }
      }
    } catch {
      // optimistic UI already updated
    }
  };

  const getEffectiveCounts = (item: CommunityMediaFeedItem) => {
    const bonus = localReactionBonus[item.feedId] || {
      keys: 0,
      padlocks: 0,
      hearts: 0,
      iceCones: 0,
      waterBottles: 0,
      cans: 0,
    };
    return {
      keys: item.keysCount + bonus.keys,
      padlocks: item.padlocksCount + bonus.padlocks,
      hearts: bonus.hearts,
      iceCones: bonus.iceCones,
      waterBottles: bonus.waterBottles,
      cans: bonus.cans,
    };
  };

  const countByType = useMemo(() => {
    return {
      all: allMediaItems.length,
      flame: allMediaItems.filter((i) => i.source === 'flame').length,
      video: allMediaItems.filter((i) => i.type === 'video').length,
      photo: allMediaItems.filter((i) => i.type === 'photo').length,
      audio: allMediaItems.filter((i) => i.type === 'audio').length,
    };
  }, [allMediaItems]);

  return (
    <>
      {/* BOUTON D'ACCÈS "MÉDIAS DE LA COMMUNAUTÉ" CENTRÉ DANS LIVE */}
      <div
        className={`w-full rounded-3xl p-4 sm:p-5 border text-center transition-all relative overflow-hidden ${
          isDark
            ? 'bg-transparent border-white/15 shadow-lg'
            : 'bg-white/75 border-zinc-300/90 backdrop-blur-xs shadow-xs'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
          <div className="flex items-center justify-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#ff0050] to-[#00f2fe] flex items-center justify-center text-white shadow-[0_0_20px_rgba(255,0,80,0.4)] shrink-0">
              <Film className="w-5 h-5" />
            </div>
            <div className="flex -space-x-2 overflow-hidden">
              {allMediaItems.slice(0, 4).map((m) => (
                <span
                  key={m.feedId}
                  className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs overflow-hidden shrink-0 ${
                    isDark ? 'bg-zinc-900 border-white/25' : 'bg-white border-zinc-300'
                  }`}
                >
                  <AvatarDisplay avatar={m.ownerAvatar} alt={m.ownerAlias} />
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <h2
                className={`text-base sm:text-lg font-black ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                Médias de la Communauté
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#ff0050] text-white font-mono font-black text-[10px] uppercase tracking-wider">
                {allMediaItems.length} médias
              </span>
              {countByType.flame > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-orange-500 to-red-600 text-white font-mono font-black text-[10px] uppercase tracking-wider inline-flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  <span>{countByType.flame} flamme{countByType.flame > 1 ? 's' : ''}</span>
                </span>
              )}
            </div>
            <p className={`text-xs font-mono ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
              Médias & Flammes 24h · Offrir 🔑 🔒 ❤️ 🍦 💧 🥫
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap w-full">
            <button
              type="button"
              onClick={() => {
                stopAmbientTrack();
                void fetchCommunityMedia();
                setActiveFilter('all');
                setActiveIndex(0);
                setIsVideoMuted(false);
                setIsOpenFullscreen(true);
              }}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#ff0050] to-[#ff2a6d] text-white text-xs font-mono font-black flex items-center justify-center gap-1.5 shadow-md hover:brightness-110 cursor-pointer active:scale-95 transition-transform"
            >
              <Eye className="w-4 h-4" />
              <span>Ouvrir les Médias</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopAmbientTrack();
                void fetchCommunityMedia();
                setActiveFilter('flame');
                setActiveIndex(0);
                setIsVideoMuted(false);
                setIsOpenFullscreen(true);
              }}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 text-white text-xs font-mono font-black flex items-center justify-center gap-1.5 shadow-md hover:brightness-110 cursor-pointer active:scale-95 transition-transform"
            >
              <Flame className="w-4 h-4" />
              <span>Flammes ({countByType.flame})</span>
            </button>
          </div>
        </div>
      </div>

      {/* LECTEUR PLEIN ÉCRAN 100% TRANSPARENT, CENTRÉ & SWIPE TINDER GAUCHE <-> DROITE */}
      {isOpenFullscreen && (
        <div
          onDoubleClick={(e) => {
            if (!currentItem || currentItem.ownerId === user.id) return;
            const target = e.target as HTMLElement | null;
            if (target?.closest('button, input, a, video, audio')) return;
            void handleReactToMedia(currentItem, 'heart');
          }}
          onWheel={(e) => {
            if (filteredItems.length <= 1) return;
            const now = Date.now();
            if (now - wheelCooldownRef.current < 420) return;
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(delta) >= 28) {
              wheelCooldownRef.current = now;
              handleCycleMedia(delta > 0 ? 1 : -1);
            }
          }}
          onTouchStart={(e) => {
            if (e.touches.length === 1) {
              startSwipeGesture(
                e.touches[0].clientX,
                e.touches[0].clientY,
                e.target as HTMLElement | null
              );
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 1) {
              moveSwipeGesture(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onTouchEnd={() => {
            endSwipeGesture();
          }}
          onMouseDown={(e) => {
            startSwipeGesture(e.clientX, e.clientY, e.target as HTMLElement | null);
          }}
          onMouseMove={(e) => {
            if (isDragging) {
              moveSwipeGesture(e.clientX, e.clientY);
            }
          }}
          onMouseUp={() => {
            if (isDragging) {
              endSwipeGesture();
            }
          }}
          onMouseLeave={() => {
            if (isDragging) {
              endSwipeGesture();
            }
          }}
          className="fixed inset-0 z-50 w-screen h-[100dvh] bg-black/40 backdrop-blur-2xl flex flex-col justify-between items-center text-center select-none overflow-hidden animate-fade-in touch-none"
        >
          {/* 1. ARRIÈRE-PLAN MÉDIA PLEIN ÉCRAN (SWIPE GAUCHE <-> DROITE & HAUT <-> BAS) */}
          <div
            style={{
              transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${
                dragOffset.x * 0.03
              }deg)`,
              transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            className="absolute inset-0 w-full h-full bg-black/30 backdrop-blur-md flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
          >
            {!currentItem ? (
              <div className="text-center p-6 space-y-2">
                <Film className="w-10 h-10 text-zinc-600 mx-auto" />
                <p className="text-sm font-bold text-zinc-300">Aucun média dans ce filtre</p>
              </div>
            ) : currentItem.type === 'text' ? (
              <FullscreenFlameTextStage
                key={currentItem.feedId}
                text={currentItem.text || currentItem.caption || ''}
                bgGradient={currentItem.bgGradient}
                bgMusic={currentItem.bgMusic}
                isMuted={isVideoMuted}
                wasSwipeRef={didSwipeMoveRef}
                onToggleMute={() => setIsVideoMuted((m) => !m)}
              />
            ) : currentItem.type === 'video' ? (
              <FullscreenVideoStage
                key={currentItem.feedId}
                src={currentItem.url}
                isMuted={isVideoMuted}
                bgMusic={currentItem.bgMusic}
                wasSwipeRef={didSwipeMoveRef}
                onAutoplayMuted={() => setIsVideoMuted(true)}
                onMediaError={() => handleBrokenMedia(currentItem)}
              />
            ) : currentItem.type === 'photo' ? (
              <FullscreenPhotoStage
                key={currentItem.feedId}
                src={currentItem.url}
                alt={currentItem.caption || currentItem.ownerAlias}
                bgMusic={currentItem.bgMusic}
                isMuted={isVideoMuted}
                wasSwipeRef={didSwipeMoveRef}
                onToggleMute={() => setIsVideoMuted((m) => !m)}
                onMediaError={() => handleBrokenMedia(currentItem)}
              />
            ) : (
              <FullscreenAudioStage
                key={currentItem.feedId}
                item={currentItem}
                isMuted={isVideoMuted}
                onToggleMute={() => setIsVideoMuted((m) => !m)}
                onMediaError={() => handleBrokenMedia(currentItem)}
              />
            )}
          </div>

          {/* 2. DÉGRADÉS SUBTILS HAUT & BAS POUR LISIBILITÉ EN TRANSPARENCE */}
          <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/65 via-black/25 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

          {/* 3. L'ENTÊTE EN HAUT ENTIÈREMENT CENTRÉE EN TRANSPARENCE */}
          <div className="relative z-10 w-full max-w-xl mx-auto px-3 pt-3 sm:px-5 sm:pt-4 flex flex-col items-center justify-center gap-2 pointer-events-auto text-center">
            {/* Row 1 Centrée: Détenu Créateur + Compteur + Points + Son + Télécharger + Quitter */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 w-full">
              {currentItem && (
                <button
                  type="button"
                  onClick={() => {
                    openUserProfile({
                      id: currentItem.ownerId,
                      matricule: currentItem.ownerMatricule,
                      alias: currentItem.ownerAlias,
                      avatar: currentItem.ownerAvatar || '⛓️',
                      neonColor: currentItem.ownerNeonColor,
                    });
                  }}
                  className={`inline-flex items-center justify-center gap-2 pr-3 pl-1 py-1 rounded-full bg-black/30 backdrop-blur-xs border min-w-0 max-w-full transition-all hover:scale-[1.02] active:scale-95 cursor-pointer ${
                    getCellFrameClasses(
                      currentItem.ownerFrame,
                      currentItem.ownerNeonColor,
                      'dark'
                    )
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full bg-black/40 flex items-center justify-center text-sm shrink-0 overflow-hidden ${
                      currentItem.ownerNeonColor
                        ? getNeonAvatarRingClass(currentItem.ownerNeonColor, 'dark')
                        : 'border border-[#00f2fe]/80'
                    }`}
                  >
                    <AvatarDisplay avatar={currentItem.ownerAvatar} alt={currentItem.ownerAlias} />
                  </span>
                  <span
                    className={`text-xs font-black text-white drop-shadow truncate max-w-[130px] sm:max-w-[180px] ${
                      currentItem.ownerNeonColor
                        ? getNeonTextClass(currentItem.ownerNeonColor, 'dark')
                        : ''
                    }`}
                  >
                    @{currentItem.ownerAlias}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-white text-[9px] font-black tracking-wider uppercase shrink-0 leading-none inline-flex items-center gap-0.5 ${
                      currentItem.source === 'flame'
                        ? 'bg-gradient-to-r from-orange-500 to-red-600'
                        : 'bg-[#ff0050]/85'
                    }`}
                  >
                    {currentItem.source === 'flame'
                      ? `🔥 FLAMME · ${formatFlameRemainingShort(currentItem.expiresAt)}`
                      : 'CRÉATEUR'}
                  </span>
                </button>
              )}

              <div className="px-2.5 h-8 rounded-full bg-black/30 backdrop-blur-xs border border-white/15 text-[11px] font-mono font-bold text-white drop-shadow flex items-center justify-center gap-1 tabular-nums">
                <span>{filteredItems.length > 0 ? activeIndex + 1 : 0}</span>
                <span className="opacity-50">/</span>
                <span>{filteredItems.length}</span>
              </div>

              {currentItem?.ownerId === user.id && (
                <button
                  type="button"
                  onClick={() => void handleDeleteOwnMedia(currentItem)}
                  title="Supprimer définitivement ce média du Live Média"
                  className="w-8 h-8 rounded-full bg-red-500/25 hover:bg-red-500/45 backdrop-blur-xs border border-red-400/45 text-red-200 flex items-center justify-center cursor-pointer active:scale-90 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {currentItem && currentItem.url && (
                <button
                  type="button"
                  onClick={() =>
                    void downloadMediaAsset(
                      currentItem.url,
                      currentItem.fileName || `evasion_media_${currentItem.itemId}`
                    )
                  }
                  title="Télécharger ce média"
                  className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-xs border border-white/15 text-white flex items-center justify-center cursor-pointer hover:bg-black/45"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-200" />
                </button>
              )}

              {(currentItem?.type === 'video' || Boolean(currentItem?.bgMusic?.previewUrl)) && (
                <button
                  type="button"
                  onClick={() => setIsVideoMuted((m) => !m)}
                  title={isVideoMuted ? 'Activer le son' : 'Couper le son'}
                  className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-xs border border-white/15 text-white flex items-center justify-center cursor-pointer hover:bg-black/45"
                >
                  {isVideoMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpenFullscreen(false)}
                title="Quitter le flux média"
                className="px-2.5 h-8 rounded-full bg-red-600/75 hover:bg-red-500/90 backdrop-blur-xs border border-red-400/35 text-white text-[11px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer shadow-md"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quitter</span>
              </button>
            </div>

            {/* Row 2 Centrée: Filtres transparents (Tous, Flammes, Vidéos, Photos, Audios) */}
            <div className="flex items-center justify-center gap-1 p-1 rounded-full bg-black/25 backdrop-blur-xs border border-white/15 max-w-full overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: 'Tous', count: countByType.all, icon: Sparkles },
                  { id: 'flame', label: 'Flammes', count: countByType.flame, icon: Flame },
                  { id: 'video', label: 'Vidéos', count: countByType.video, icon: Play },
                  { id: 'photo', label: 'Photos', count: countByType.photo, icon: ImageIcon },
                  { id: 'audio', label: 'Audios', count: countByType.audio, icon: Mic },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = activeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveFilter(tab.id);
                      setActiveIndex(0);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer transition-all whitespace-nowrap ${
                      active
                        ? 'bg-[#ff0050]/85 text-white shadow-xs'
                        : 'text-zinc-200 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{tab.label}</span>
                    <span className="opacity-75">({tab.count})</span>
                  </button>
                );
              })}
            </div>

            {/* Row 3 removed from top header and relocated to bottom */}
          </div>

          {/* 4. ANIMATION D'OFFRANDE AU DÉTENU CRÉATEUR AU CENTRE DE L'ÉCRAN */}
          {centerBurst && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4 animate-fade-in">
              <div className="relative flex flex-col items-center justify-center text-center">
                <div
                  className={`absolute w-36 h-36 rounded-full border-2 animate-ping opacity-40 ${
                    GIFT_META[centerBurst.giftType].ring
                  }`}
                />
                <div
                  className={`relative w-28 h-28 rounded-full border-2 flex items-center justify-center backdrop-blur-md animate-bounce ${
                    GIFT_META[centerBurst.giftType].ring
                  }`}
                >
                  <span className="text-6xl drop-shadow-[0_0_24px_rgba(255,255,255,0.85)]">
                    {GIFT_META[centerBurst.giftType].emoji}
                  </span>
                </div>
                <div
                  className={`mt-2 px-4 py-1.5 rounded-full border text-white shadow-2xl flex items-center justify-center gap-2 backdrop-blur-md ${
                    GIFT_META[centerBurst.giftType].pill
                  }`}
                >
                  <span className="w-5 h-5 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0">
                    <AvatarDisplay avatar={centerBurst.senderAvatar} alt={centerBurst.senderName} />
                  </span>
                  <span className="text-xs font-black">{centerBurst.senderName}</span>
                  <span className="text-xs font-mono">
                    offre {GIFT_META[centerBurst.giftType].title} à @{centerBurst.recipientName}
                  </span>
                  <span className="text-sm font-black italic text-yellow-200">
                    ×{centerBurst.combo}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 5. BAS DE L'ÉCRAN : BARRE DE CADEAUX HORIZONTALE AVEC FONDU ENCHAÎNÉ GAUCHE & DROITE */}
          <div className="relative z-10 w-full max-w-md mx-auto px-3 sm:px-5 pb-6 sm:pb-8 flex flex-col items-center justify-center gap-2 pointer-events-none safe-area-bottom text-center">
            {currentItem && (
              <div
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="pointer-events-auto relative w-fit max-w-full rounded-2xl bg-black/75 backdrop-blur-md border border-white/30 shadow-2xl overflow-hidden"
              >
                {/* Fondu enchaîné gauche */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-7 sm:w-9 bg-gradient-to-r from-black/95 via-black/55 to-transparent z-10"
                />
                {/* Fondu enchaîné droite */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-7 sm:w-9 bg-gradient-to-l from-black/95 via-black/55 to-transparent z-10"
                />

                <div className="flex items-center justify-start sm:justify-center gap-2 sm:gap-3 px-6 sm:px-7 py-2 text-xs sm:text-sm font-mono font-black tabular-nums whitespace-nowrap overflow-x-auto no-scrollbar scroll-smooth touch-pan-x max-w-full [mask-image:linear-gradient(to_right,transparent_0%,black_8%,black_92%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_8%,black_92%,transparent_100%)]">
                  {/* Clés : dépensent le stock réel détenu */}
                  <button
                    type="button"
                    onClick={(e) => void handleReactToMedia(currentItem, 'key', e)}
                    disabled={(user.keysAvailable || 0) <= 0}
                    title={`Offrir 1 Clé 🔑 à @${currentItem.ownerAlias} (Tu détiens : ${user.keysAvailable || 0} 🔑)`}
                    className={`px-3 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition-all border ${
                      (user.keysAvailable || 0) > 0
                        ? 'text-amber-300 bg-amber-500/20 hover:bg-amber-500/40 border-amber-400/40 cursor-pointer active:scale-90'
                        : 'text-zinc-500 bg-zinc-900/60 border-zinc-700/40 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-lg sm:text-xl">🔑</span>
                    <span className="text-sm font-black">{getEffectiveCounts(currentItem).keys}</span>
                    <span className="text-[10px] font-mono text-amber-200/90 font-bold">
                      ({user.keysAvailable || 0} dispo)
                    </span>
                  </button>

                  {/* Cadenas : dépensent le stock réel détenu */}
                  <button
                    type="button"
                    onClick={(e) => void handleReactToMedia(currentItem, 'padlock', e)}
                    disabled={(user.padlocksAvailable || 0) <= 0}
                    title={`Offrir 1 Cadenas 🔒 à @${currentItem.ownerAlias} (Tu détiens : ${user.padlocksAvailable || 0} 🔒)`}
                    className={`px-3 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition-all border ${
                      (user.padlocksAvailable || 0) > 0
                        ? 'text-sky-300 bg-sky-500/20 hover:bg-sky-500/40 border-sky-400/40 cursor-pointer active:scale-90'
                        : 'text-zinc-500 bg-zinc-900/60 border-zinc-700/40 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-lg sm:text-xl">🔒</span>
                    <span className="text-sm font-black">{getEffectiveCounts(currentItem).padlocks}</span>
                    <span className="text-[10px] font-mono text-sky-200/90 font-bold">
                      ({user.padlocksAvailable || 0} dispo)
                    </span>
                  </button>

                  {/* Cœur : donne des points au créateur, limité à 5 par média */}
                  {(() => {
                    const given = givenMediaGifts[currentItem.feedId]?.heart || 0;
                    const rem = Math.max(0, FREE_GIFT_LIMITS.heart - given);
                    return (
                      <button
                        type="button"
                        onClick={(e) => void handleReactToMedia(currentItem, 'heart', e)}
                        disabled={rem <= 0}
                        title={`Envoyer un Cœur ❤️ (+25 pts pour @${currentItem.ownerAlias}) · ${rem}/${FREE_GIFT_LIMITS.heart} restant(s)`}
                        className={`px-3 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition-all border ${
                          rem > 0
                            ? 'text-pink-300 bg-pink-500/20 hover:bg-pink-500/40 border-pink-400/40 cursor-pointer active:scale-90'
                            : 'text-zinc-500 bg-zinc-900/60 border-zinc-700/40 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-lg sm:text-xl">❤️</span>
                        <span className="text-sm font-black">{getEffectiveCounts(currentItem).hearts}</span>
                        <span className="text-[10px] font-mono text-pink-200/80 font-bold">
                          ({rem > 0 ? `${rem} dispo` : 'Max'})
                        </span>
                      </button>
                    );
                  })()}

                  {/* Glace : donne des points au créateur, limitée à 3 par média */}
                  {(() => {
                    const given = givenMediaGifts[currentItem.feedId]?.ice_cone || 0;
                    const rem = Math.max(0, FREE_GIFT_LIMITS.ice_cone - given);
                    return (
                      <button
                        type="button"
                        onClick={(e) => void handleReactToMedia(currentItem, 'ice_cone', e)}
                        disabled={rem <= 0}
                        title={`Offrir une Glace 🍦 (+50 pts pour @${currentItem.ownerAlias}) · ${rem}/${FREE_GIFT_LIMITS.ice_cone} restante(s)`}
                        className={`px-3 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition-all border ${
                          rem > 0
                            ? 'text-rose-300 bg-rose-500/20 hover:bg-rose-500/40 border-rose-400/40 cursor-pointer active:scale-90'
                            : 'text-zinc-500 bg-zinc-900/60 border-zinc-700/40 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-lg sm:text-xl">🍦</span>
                        <span className="text-sm font-black">{getEffectiveCounts(currentItem).iceCones}</span>
                        <span className="text-[10px] font-mono text-rose-200/80 font-bold">
                          ({rem > 0 ? `${rem} dispo` : 'Max'})
                        </span>
                      </button>
                    );
                  })()}

                  {/* Bouteille d'eau : donne des points au créateur, limitée à 3 par média */}
                  {(() => {
                    const given = givenMediaGifts[currentItem.feedId]?.water_bottle || 0;
                    const rem = Math.max(0, FREE_GIFT_LIMITS.water_bottle - given);
                    return (
                      <button
                        type="button"
                        onClick={(e) => void handleReactToMedia(currentItem, 'water_bottle', e)}
                        disabled={rem <= 0}
                        title={`Offrir une Bouteille d'eau 💧 (+75 pts pour @${currentItem.ownerAlias}) · ${rem}/${FREE_GIFT_LIMITS.water_bottle} restante(s)`}
                        className={`px-3 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition-all border ${
                          rem > 0
                            ? 'text-cyan-300 bg-cyan-500/20 hover:bg-cyan-500/40 border-cyan-400/40 cursor-pointer active:scale-90'
                            : 'text-zinc-500 bg-zinc-900/60 border-zinc-700/40 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-lg sm:text-xl">💧</span>
                        <span className="text-sm font-black">{getEffectiveCounts(currentItem).waterBottles}</span>
                        <span className="text-[10px] font-mono text-cyan-200/80 font-bold">
                          ({rem > 0 ? `${rem} dispo` : 'Max'})
                        </span>
                      </button>
                    );
                  })()}

                  {/* Conserve : donne des points au créateur, limitée à 2 par média */}
                  {(() => {
                    const given = givenMediaGifts[currentItem.feedId]?.canned_food || 0;
                    const rem = Math.max(0, FREE_GIFT_LIMITS.canned_food - given);
                    return (
                      <button
                        type="button"
                        onClick={(e) => void handleReactToMedia(currentItem, 'canned_food', e)}
                        disabled={rem <= 0}
                        title={`Offrir une Boîte de conserve 🥫 (+80 pts pour @${currentItem.ownerAlias}) · ${rem}/${FREE_GIFT_LIMITS.canned_food} restante(s)`}
                        className={`px-3 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition-all border ${
                          rem > 0
                            ? 'text-orange-300 bg-orange-500/20 hover:bg-orange-500/40 border-orange-400/40 cursor-pointer active:scale-90'
                            : 'text-zinc-500 bg-zinc-900/60 border-zinc-700/40 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-lg sm:text-xl">🥫</span>
                        <span className="text-sm font-black">{getEffectiveCounts(currentItem).cans}</span>
                        <span className="text-[10px] font-mono text-orange-200/80 font-bold">
                          ({rem > 0 ? `${rem} dispo` : 'Max'})
                        </span>
                      </button>
                    );
                  })()}
                </div>
              </div>
            )}

            {currentItem?.caption && (
              <div className="pointer-events-auto bg-black/40 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-2 text-center shadow-lg">
                <p className="text-xs text-zinc-100 drop-shadow line-clamp-2 leading-relaxed">
                  {currentItem.caption}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <PointsExchangeModal
        isOpen={isPointsModalOpen}
        onClose={() => setIsPointsModalOpen(false)}
      />
    </>
  );
};
