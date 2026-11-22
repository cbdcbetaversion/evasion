import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Upload,
  X,
  Check,
  RefreshCw,
  Volume2,
  VolumeX,
  Square,
  AlertCircle,
  Loader2,
  Film,
  Download,
  Camera,
  ShieldCheck,
  Smartphone,
  Send,
  FileText,
  ExternalLink,
  Music,
  Play,
  Pause,
} from 'lucide-react';
import { DeezerTrack } from '../types';
import { getPlayableDeezerUrl, resolveFreshTrackPreviewUrl } from '../utils/audio';
import {
  resolveMediaUrl,
  peekResolvedMediaUrl,
  saveMediaBlob,
  processVideoFile,
  requestCameraAndMicStream,
  downloadMediaAsset,
  attachStreamToVideoElement,
  getCameraPermissionState,
  revokeMediaUrlOrRef,
  formatFileSizeMo,
  MAX_MEDIA_FILE_SIZE_BYTES,
  DevicePermissionState,
} from '../utils/mediaStore';

interface SmartImageProps {
  src: string;
  alt?: string;
  className?: string;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  onMediaError?: () => void;
}

export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt = '',
  className = '',
  referrerPolicy = 'no-referrer',
  onMediaError,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>(
    () => peekResolvedMediaUrl(src) || ''
  );
  const errorReportedRef = useRef(false);
  const onMediaErrorRef = useRef(onMediaError);
  onMediaErrorRef.current = onMediaError;

  const reportErrorOnce = () => {
    if (errorReportedRef.current) return;
    errorReportedRef.current = true;
    onMediaErrorRef.current?.();
  };

  useEffect(() => {
    let active = true;
    errorReportedRef.current = false;
    const immediate = peekResolvedMediaUrl(src);
    if (immediate) {
      setResolvedUrl(immediate);
      return;
    }
    if (!src) {
      setResolvedUrl('');
      reportErrorOnce();
      return;
    }
    resolveMediaUrl(src)
      .then((u) => {
        if (!active) return;
        if (u) {
          setResolvedUrl(u);
        } else {
          reportErrorOnce();
        }
      })
      .catch(() => {
        if (active) reportErrorOnce();
      });
    return () => {
      active = false;
    };
  }, [src]);

  if (!resolvedUrl) {
    return (
      <div className={`bg-zinc-950 flex items-center justify-center ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      referrerPolicy={referrerPolicy}
      onError={() => {
        if (resolvedUrl.startsWith('/api/music/cover?')) {
          try {
            const parsed = new URL(resolvedUrl, 'https://evasion.local');
            const rawInner = parsed.searchParams.get('url');
            if (rawInner && rawInner.startsWith('http')) {
              setResolvedUrl(rawInner);
              return;
            }
          } catch {
            // ignore
          }
        }
        reportErrorOnce();
      }}
      className={className}
    />
  );
};

interface DocumentFileCardProps {
  file: {
    url: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  };
  isDark?: boolean;
  compact?: boolean;
  onRemove?: () => void;
  onPreview?: () => void;
}

export const DocumentFileCard: React.FC<DocumentFileCardProps> = ({
  file,
  isDark = true,
  compact = false,
  onRemove,
  onPreview,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => peekResolvedMediaUrl(file.url));
  const [loading, setLoading] = useState<boolean>(() => !peekResolvedMediaUrl(file.url));

  useEffect(() => {
    let active = true;
    const immediate = peekResolvedMediaUrl(file.url);
    if (immediate) {
      setResolvedUrl(immediate);
      setLoading(false);
      return;
    }
    setLoading(true);
    resolveMediaUrl(file.url)
      .then((u) => {
        if (active) setResolvedUrl(u);
      })
      .catch(() => {
        if (active) setResolvedUrl(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [file.url]);

  const ext = file.fileName?.includes('.')
    ? file.fileName.split('.').pop()?.toUpperCase().slice(0, 6)
    : 'DOC';

  const sizeLabel = formatFileSizeMo(file.fileSize);

  return (
    <div
      className={`rounded-2xl border flex items-center gap-3 transition-all ${
        compact ? 'p-2.5' : 'p-3'
      } ${
        isDark
          ? 'bg-zinc-900/90 border-zinc-800 text-zinc-100'
          : 'bg-zinc-50 border-zinc-200 text-zinc-900'
      }`}
    >
      <div
        onClick={onPreview}
        role={onPreview ? 'button' : undefined}
        tabIndex={onPreview ? 0 : undefined}
        className={`w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex flex-col items-center justify-center shrink-0 ${
          onPreview ? 'cursor-pointer hover:bg-amber-500/25' : ''
        }`}
      >
        <FileText className="w-4 h-4 text-amber-400" />
        <span className="text-[8px] font-mono font-black text-amber-300 leading-none mt-0.5">{ext}</span>
      </div>

      <div
        onClick={onPreview}
        className={`min-w-0 flex-1 text-left ${onPreview ? 'cursor-pointer' : ''}`}
      >
        <div className="text-xs font-bold truncate">{file.fileName || 'Document joint'}</div>
        <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1.5 flex-wrap">
          <span>{ext}</span>
          {file.fileSize ? <span>· {sizeLabel}</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {loading ? (
          <span className="px-2.5 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 text-[11px] font-mono inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
          </span>
        ) : resolvedUrl ? (
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={file.fileName || `document_${Date.now()}`}
            onClick={(e) => e.stopPropagation()}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[11px] font-mono font-bold inline-flex items-center gap-1 shadow-xs transition-colors"
            title="Télécharger ou ouvrir le fichier"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span>Télécharger / Ouvrir</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void downloadMediaAsset(file.url, file.fileName || 'document');
            }}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-mono font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3 shrink-0" />
            <span>Télécharger / Ouvrir</span>
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="w-7 h-7 rounded-xl bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center cursor-pointer"
            title="Retirer ce document"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

interface SmartPhotoWithMusicProps {
  src: string;
  alt?: string;
  className?: string;
  bgMusic?: DeezerTrack;
  onClick?: () => void;
}

export const SmartPhotoWithMusic: React.FC<SmartPhotoWithMusicProps> = ({
  src,
  alt = 'Photo',
  className = '',
  bgMusic,
  onClick,
}) => {
  const rawMusicUrl = bgMusic?.audioUrl || bgMusic?.previewUrl || '';
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [resolvedMusicUrl, setResolvedMusicUrl] = useState<string>(() =>
    getPlayableDeezerUrl(rawMusicUrl, bgMusic)
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retriedRef = useRef(false);

  useEffect(() => {
    retriedRef.current = false;
    setResolvedMusicUrl(getPlayableDeezerUrl(bgMusic?.audioUrl || bgMusic?.previewUrl, bgMusic));
    const el = audioRef.current;
    return () => {
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
    };
  }, [bgMusic?.id, bgMusic?.audioUrl, bgMusic?.previewUrl, bgMusic?.title, bgMusic?.artist]);

  const toggleMusic = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el || !rawMusicUrl) return;
    if (musicPlaying) {
      el.pause();
      setMusicPlaying(false);
    } else {
      el.muted = false;
      el.play()
        .then(() => setMusicPlaying(true))
        .catch(() => {
          if (retriedRef.current) {
            setMusicPlaying(false);
            return;
          }
          retriedRef.current = true;
          void resolveFreshTrackPreviewUrl(bgMusic, true).then((freshUrl) => {
            const playable = freshUrl ? getPlayableDeezerUrl(freshUrl, bgMusic) : '';
            if (playable && audioRef.current) {
              setResolvedMusicUrl(playable);
              audioRef.current.src = playable;
              audioRef.current
                .play()
                .then(() => setMusicPlaying(true))
                .catch(() => setMusicPlaying(false));
            } else {
              setMusicPlaying(false);
            }
          });
        });
    }
  };

  return (
    <div className="relative w-full h-full">
      <div onClick={onClick} className={onClick ? 'w-full h-full cursor-pointer' : 'w-full h-full'}>
        <SmartImage src={src} alt={alt} className={className} />
      </div>
      {bgMusic && rawMusicUrl && (
        <>
          <audio
            ref={audioRef}
            src={resolvedMusicUrl || getPlayableDeezerUrl(rawMusicUrl, bgMusic)}
            loop
            playsInline
            preload="metadata"
            onEnded={() => setMusicPlaying(false)}
            onError={() => {
              if (retriedRef.current) return;
              retriedRef.current = true;
              void resolveFreshTrackPreviewUrl(bgMusic, true).then((freshUrl) => {
                if (freshUrl) setResolvedMusicUrl(getPlayableDeezerUrl(freshUrl, bgMusic));
              });
            }}
          />
          <button
            type="button"
            onClick={toggleMusic}
            className="absolute bottom-2.5 left-2.5 z-10 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-orange-400/40 text-white text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
            title={musicPlaying ? 'Mettre la musique en pause' : 'Lire avec musique de fond'}
          >
            {musicPlaying ? (
              <Pause className="w-3 h-3 text-orange-400 fill-orange-400" />
            ) : (
              <Play className="w-3 h-3 text-orange-400 fill-orange-400" />
            )}
            <Music className="w-3 h-3 text-orange-400" />
            <span className="max-w-[130px] truncate">{bgMusic.title}</span>
          </button>
        </>
      )}
    </div>
  );
};

interface SmartVideoPlayerProps {
  src: string;
  duration?: number;
  compact?: boolean;
  bgMusic?: DeezerTrack;
  forceMuted?: boolean;
}

export const SmartVideoPlayer: React.FC<SmartVideoPlayerProps> = ({
  src,
  duration,
  compact = false,
  bgMusic,
  forceMuted = false,
}) => {
  const rawBgUrl = bgMusic?.audioUrl || bgMusic?.previewUrl || '';
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => peekResolvedMediaUrl(src));
  const [loading, setLoading] = useState<boolean>(() => !peekResolvedMediaUrl(src));
  const [loadError, setLoadError] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => Boolean(rawBgUrl) || forceMuted);
  const [musicOverlayActive, setMusicOverlayActive] = useState<boolean>(() => Boolean(rawBgUrl));
  const [resolvedBgMusicUrl, setResolvedBgMusicUrl] = useState<string>(() =>
    getPlayableDeezerUrl(rawBgUrl, bgMusic)
  );
  const bgMusicRetriedRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadedOk, setDownloadedOk] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const hasMusic = Boolean(bgMusic?.audioUrl || bgMusic?.previewUrl);
    bgMusicRetriedRef.current = false;
    setResolvedBgMusicUrl(getPlayableDeezerUrl(bgMusic?.audioUrl || bgMusic?.previewUrl, bgMusic));
    setMusicOverlayActive(hasMusic);
    if (hasMusic || forceMuted) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  }, [bgMusic?.id, bgMusic?.audioUrl, bgMusic?.previewUrl, bgMusic?.title, bgMusic?.artist, forceMuted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted || musicOverlayActive || forceMuted;
    }
  }, [isMuted, musicOverlayActive, forceMuted]);

  useEffect(() => {
    return () => {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
        bgAudioRef.current.currentTime = 0;
      }
    };
  }, [src, bgMusic?.audioUrl, bgMusic?.previewUrl]);

  useEffect(() => {
    let active = true;
    const immediate = peekResolvedMediaUrl(src);
    if (immediate) {
      setResolvedUrl(immediate);
      setLoading(false);
      setLoadError(false);
      return;
    }
    setLoading(true);
    setLoadError(false);

    resolveMediaUrl(src)
      .then((url) => {
        if (!active) return;
        if (url) {
          setResolvedUrl(url);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [src]);

  const formatTime = (sec?: number) => {
    const s = Math.max(0, Math.round(sec || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    const res = await downloadMediaAsset(src, `evasion_video_${Date.now()}`);
    setDownloading(false);
    if (res.ok) {
      setDownloadedOk(true);
      window.setTimeout(() => setDownloadedOk(false), 2500);
    }
  };

  const syncMusicWithVideoPlay = () => {
    if (!rawBgUrl || !bgAudioRef.current) return;
    if (musicOverlayActive && !forceMuted) {
      if (videoRef.current) {
        videoRef.current.muted = true;
      }
      bgAudioRef.current.play().catch(() => {});
    }
  };

  const pauseSyncedMusic = () => {
    if (bgAudioRef.current && !bgAudioRef.current.paused) {
      bgAudioRef.current.pause();
    }
  };

  const toggleMusicOverlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!rawBgUrl) return;
    const nextMusicActive = !musicOverlayActive;
    setMusicOverlayActive(nextMusicActive);
    if (nextMusicActive) {
      setIsMuted(true);
      if (videoRef.current) {
        videoRef.current.muted = true;
        if (!videoRef.current.paused && bgAudioRef.current) {
          bgAudioRef.current.play().catch(() => {});
        }
      }
    } else {
      pauseSyncedMusic();
      setIsMuted(false);
      if (videoRef.current) {
        videoRef.current.muted = forceMuted;
      }
    }
  };

  if (loading) {
    return (
      <div className="w-full h-44 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-400 text-xs font-mono gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
        <span>Chargement vidéo...</span>
      </div>
    );
  }

  if (loadError || !resolvedUrl) {
    return (
      <div className="w-full p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-mono gap-2">
        <Film className="w-4 h-4" />
        <span>Vidéo indisponible dans cette session</span>
      </div>
    );
  }

  const effectiveMuted = isMuted || musicOverlayActive || forceMuted;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`relative w-full rounded-2xl overflow-hidden bg-black border border-zinc-800 group ${
        compact ? 'max-h-56' : 'max-h-[460px]'
      }`}
    >
      <video
        ref={videoRef}
        src={resolvedUrl}
        controls
        playsInline
        preload="metadata"
        muted={effectiveMuted}
        onPlay={syncMusicWithVideoPlay}
        onPause={pauseSyncedMusic}
        onEnded={pauseSyncedMusic}
        onError={() => setLoadError(true)}
        className={`w-full h-auto object-contain mx-auto bg-black ${compact ? 'max-h-56' : 'max-h-[460px]'}`}
      />

      {bgMusic && rawBgUrl && (
        <audio
          ref={bgAudioRef}
          src={resolvedBgMusicUrl || getPlayableDeezerUrl(rawBgUrl, bgMusic)}
          loop
          playsInline
          preload="metadata"
          onError={() => {
            if (bgMusicRetriedRef.current) {
              // Si la musique reste indisponible, réactiver le son natif de la vidéo
              setMusicOverlayActive(false);
              setIsMuted(false);
              return;
            }
            bgMusicRetriedRef.current = true;
            void resolveFreshTrackPreviewUrl(bgMusic, true).then((freshUrl) => {
              const playable = freshUrl ? getPlayableDeezerUrl(freshUrl, bgMusic) : '';
              if (playable) {
                setResolvedBgMusicUrl(playable);
                if (bgAudioRef.current) {
                  bgAudioRef.current.src = playable;
                  if (videoRef.current && !videoRef.current.paused && musicOverlayActive && !forceMuted) {
                    bgAudioRef.current.play().catch(() => {});
                  }
                }
              } else {
                setMusicOverlayActive(false);
                setIsMuted(false);
              }
            });
          }}
        />
      )}

      {/* Top overlays: 1 min badge + synced music pill + download + quick mute */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 pointer-events-auto min-w-0">
          <span className="px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-sm border border-white/15 text-[10px] font-mono font-bold text-white flex items-center gap-1 shrink-0">
            <Video className="w-3 h-3 text-[#ff0050]" />
            <span>{duration ? formatTime(duration) : 'Vidéo 1m'}</span>
          </span>

          {bgMusic && rawBgUrl && (
            <button
              type="button"
              onClick={toggleMusicOverlay}
              className={`px-2 py-0.5 rounded-lg backdrop-blur-sm border text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer truncate max-w-[180px] transition-colors ${
                musicOverlayActive
                  ? 'bg-orange-500/85 border-orange-300/60 text-white'
                  : 'bg-black/70 border-white/15 text-zinc-300'
              }`}
              title={
                musicOverlayActive
                  ? 'Musique active (vidéo mise en sourdine) — cliquer pour rétablir le son vidéo'
                  : 'Activer la musique superposée (coupe le son vidéo)'
              }
            >
              <Music className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {musicOverlayActive ? `${bgMusic.title} (muet)` : 'Son original'}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            className="w-7 h-7 rounded-full bg-black/65 hover:bg-black text-white/85 hover:text-white border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Enregistrer"
          >
            {downloading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : downloadedOk ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Download className="w-3 h-3" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (musicOverlayActive && rawBgUrl) {
                toggleMusicOverlay(e);
                return;
              }
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (videoRef.current) videoRef.current.muted = nextMuted;
            }}
            className="w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
            title={effectiveMuted ? 'Activer le son' : 'Couper le son'}
          >
            {effectiveMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

interface VideoStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoReady: (video: { videoUrl: string; duration: number }) => void;
  onDirectSend?: (video: { videoUrl: string; duration: number }) => void;
  maxSeconds?: number;
}

export const VideoStudioModal: React.FC<VideoStudioModalProps> = ({
  isOpen,
  onClose,
  onVideoReady,
  onDirectSend,
  maxSeconds = 60,
}) => {
  const [mode, setMode] = useState<'choose' | 'camera' | 'preview'>('choose');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadingPreview, setDownloadingPreview] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [showWakeCamPrompt, setShowWakeCamPrompt] = useState(false);
  const [permState, setPermState] = useState<DevicePermissionState>('unknown');
  const [streamRev, setStreamRev] = useState(0);
  const [previewVideo, setPreviewVideo] = useState<{ videoUrl: string; duration: number; resolvedUrl: string } | null>(
    null
  );

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCaptureInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<{ videoUrl: string; duration: number; resolvedUrl: string } | null>(null);
  const validatedRef = useRef<boolean>(false);

  const discardCurrentPreview = () => {
    const cur = previewVideoRef.current;
    if (cur && !validatedRef.current) {
      void revokeMediaUrlOrRef(cur.videoUrl);
    }
    previewVideoRef.current = null;
    setPreviewVideo(null);
  };

  useEffect(() => {
    previewVideoRef.current = previewVideo;
  }, [previewVideo]);

  const stopCameraStream = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setIsRecording(false);
    setIsVideoReady(false);
    setShowWakeCamPrompt(false);
  };

  useEffect(() => {
    if (isOpen) {
      validatedRef.current = false;
      getCameraPermissionState().then(setPermState);
    } else {
      stopCameraStream();
      discardCurrentPreview();
      setMode('choose');
      setErrorMsg(null);
      setElapsedSec(0);
    }
    return () => {
      stopCameraStream();
    };
  }, [isOpen]);

  // Crucial fix: bind streamRef.current to <video> AFTER mode === 'camera' mounts in the DOM
  useEffect(() => {
    if (mode !== 'camera' || !streamRef.current) return;

    const bindNow = () => {
      if (liveVideoRef.current && streamRef.current) {
        attachStreamToVideoElement(liveVideoRef.current, streamRef.current);
        if (liveVideoRef.current.videoWidth > 0 && !liveVideoRef.current.paused) {
          setIsVideoReady(true);
          setShowWakeCamPrompt(false);
        }
      }
    };

    bindNow();
    const t1 = window.setTimeout(bindNow, 150);
    const t2 = window.setTimeout(() => {
      bindNow();
      if (liveVideoRef.current && (liveVideoRef.current.videoWidth === 0 || liveVideoRef.current.paused)) {
        setShowWakeCamPrompt(true);
      }
    }, 1100);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mode, streamRev, facingMode]);

  const startCameraPreview = async (targetFacing: 'user' | 'environment' = facingMode) => {
    setErrorMsg(null);
    stopCameraStream();
    setIsProcessing(true);

    const res = await requestCameraAndMicStream({
      facingMode: targetFacing,
      withAudio: true,
    });
    setIsProcessing(false);
    getCameraPermissionState().then(setPermState);

    if (!res.stream) {
      setErrorMsg(res.errorMessage || "Autorisation caméra requise sur le téléphone.");
      return;
    }

    streamRef.current = res.stream;
    setIsVideoReady(false);
    setShowWakeCamPrompt(false);
    setMode('camera');
    setStreamRev((r) => r + 1);
  };

  const toggleCameraFacing = () => {
    if (isRecording) return;
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    startCameraPreview(next);
  };

  const handleForceWakeVideo = () => {
    if (liveVideoRef.current && streamRef.current) {
      attachStreamToVideoElement(liveVideoRef.current, streamRef.current);
      liveVideoRef.current
        .play()
        .then(() => {
          setIsVideoReady(true);
          setShowWakeCamPrompt(false);
        })
        .catch(() => {
          startCameraPreview(facingMode);
        });
    } else {
      startCameraPreview(facingMode);
    }
  };

  const startRecordingVideo = () => {
    if (!streamRef.current) return;
    setErrorMsg(null);

    const mimeCandidates = [
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    let selectedMime = '';
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      for (const m of mimeCandidates) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }
    }

    try {
      const recorder = selectedMime
        ? new MediaRecorder(streamRef.current, { mimeType: selectedMime })
        : new MediaRecorder(streamRef.current);

      recorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      setElapsedSec(0);
      setIsRecording(true);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const dur = Math.max(1, Math.min(maxSeconds, Math.round((Date.now() - startTimeRef.current) / 1000)));
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsRecording(false);

        if (chunksRef.current.length === 0) return;

        setIsProcessing(true);
        try {
          const rawMime = recorder.mimeType || selectedMime || 'video/webm';
          const cleanMime = rawMime.split(';')[0].trim() || 'video/webm';
          const blob = new Blob(chunksRef.current, { type: cleanMime });
          chunksRef.current = [];

          if (blob.size > MAX_MEDIA_FILE_SIZE_BYTES) {
            setErrorMsg('Vidéo enregistrée trop volumineuse (max 20 Mo). Essaie un extrait plus court.');
            stopCameraStream();
            setMode('choose');
            return;
          }

          discardCurrentPreview();
          const videoRef = await saveMediaBlob(blob);
          const resolved = (await resolveMediaUrl(videoRef)) || '';
          stopCameraStream();
          setPreviewVideo({ videoUrl: videoRef, duration: dur, resolvedUrl: resolved });
          setMode('preview');
        } catch {
          setErrorMsg("Erreur lors de l'enregistrement de la vidéo.");
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start(300);

      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (sec >= maxSeconds) {
          stopRecordingVideo();
        } else {
          setElapsedSec(sec);
        }
      }, 250);
    } catch {
      setIsRecording(false);
      setErrorMsg("Impossible de démarrer l'enregistrement vidéo sur cet appareil.");
    }
  };

  const stopRecordingVideo = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        setIsRecording(false);
      }
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const { videoRef, duration } = await processVideoFile(file, maxSeconds);
      discardCurrentPreview();
      const resolved = (await resolveMediaUrl(videoRef)) || '';
      stopCameraStream();
      setPreviewVideo({ videoUrl: videoRef, duration, resolvedUrl: resolved });
      setMode('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Vidéo invalide (1 min max, 20 Mo max).');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md max-h-[92dvh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/90">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#ff0050] to-[#00f2fe] flex items-center justify-center text-white">
              <Video className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Vidéo · 1 min max</h3>
              <p className="text-[10px] font-mono text-zinc-400">Caméra en direct ou galerie</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileImport}
        />

        <input
          ref={nativeCaptureInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={handleFileImport}
        />

        <div className="p-4 space-y-4 flex-1 overflow-y-auto overscroll-contain">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <div className="space-y-1">
                  <p>{errorMsg}</p>
                  <p className="text-[11px] text-zinc-300">
                    Sur iPhone / Android : vérifie les autorisations du site (icône caméra dans la barre du navigateur → Autoriser).
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => startCameraPreview(facingMode)}
                  className="py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Autoriser sur le téléphone</span>
                </button>
                <button
                  type="button"
                  onClick={() => nativeCaptureInputRef.current?.click()}
                  className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-mono font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                  <span>Caméra native du tél</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'choose' && (
            <div className="space-y-3 py-1">
              {/* Mobile permission banner */}
              <div className="px-3 py-2 rounded-xl bg-zinc-950/90 border border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck
                    className={`w-4 h-4 shrink-0 ${
                      permState === 'granted'
                        ? 'text-emerald-400'
                        : permState === 'denied'
                        ? 'text-red-400'
                        : 'text-amber-400'
                    }`}
                  />
                  <span className="text-[11px] font-mono text-zinc-300 truncate">
                    {permState === 'granted'
                      ? 'Caméra & Micro autorisés sur le tél ✓'
                      : permState === 'denied'
                      ? 'Caméra bloquée — active-la dans Safari/Chrome'
                      : 'Autorise la caméra & le micro sur ton téléphone'}
                  </span>
                </div>
                {permState !== 'granted' && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => startCameraPreview(facingMode)}
                    className="px-2.5 py-1 rounded-lg bg-[#ff0050] hover:bg-[#ff1a62] text-white text-[10px] font-mono font-bold shrink-0 cursor-pointer"
                  >
                    Autoriser
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => startCameraPreview(facingMode)}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-[#ff0050]/20 via-red-600/15 to-[#00f2fe]/15 hover:from-[#ff0050]/30 hover:to-[#00f2fe]/25 border border-[#ff0050]/40 text-left flex items-center gap-3.5 transition-all cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-[#ff0050] text-white flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(255,0,80,0.45)]">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Filmer avec la caméra en direct</div>
                  <div className="text-xs text-zinc-400">Aperçu vidéo en direct + micro jusqu’à 1 min</div>
                </div>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => nativeCaptureInputRef.current?.click()}
                className="w-full p-3.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 text-left flex items-center gap-3.5 transition-all cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-400 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Appareil photo du téléphone</div>
                  <div className="text-xs text-zinc-400">Ouvre directement l’app Caméra iOS / Android</div>
                </div>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-3.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 text-left flex items-center gap-3.5 transition-all cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-sky-500/20 border border-sky-400/40 text-sky-400 flex items-center justify-center shrink-0">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Importer depuis la galerie</div>
                  <div className="text-xs text-zinc-400">MP4, MOV ou WebM (1 minute maximum)</div>
                </div>
              </button>
            </div>
          )}

          {mode === 'camera' && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black border border-zinc-800 aspect-[9/14] max-h-[390px] mx-auto">
                <video
                  ref={(el) => {
                    liveVideoRef.current = el;
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      attachStreamToVideoElement(el, streamRef.current);
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    vid.play().catch(() => {});
                    if (vid.videoWidth > 0) {
                      setIsVideoReady(true);
                      setShowWakeCamPrompt(false);
                    }
                  }}
                  onPlaying={() => {
                    setIsVideoReady(true);
                    setShowWakeCamPrompt(false);
                  }}
                  className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                />

                {/* Fallback Wake-Up Overlay ONLY if camera stream is active yet browser hasn't painted video frame */}
                {(!isVideoReady || showWakeCamPrompt) && (
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center gap-2.5 z-10">
                    <Camera className="w-7 h-7 text-[#00f2fe] animate-pulse" />
                    <p className="text-xs font-mono text-zinc-200 max-w-[230px]">
                      {showWakeCamPrompt
                        ? 'La caméra tourne mais ton téléphone bloque l’aperçu automatique.'
                        : 'Initialisation du flux caméra...'}
                    </p>
                    <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
                      <button
                        type="button"
                        onClick={handleForceWakeVideo}
                        className="w-full py-2 px-3 rounded-xl bg-[#ff0050] hover:bg-[#ff1a62] text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Afficher la caméra 📷</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          stopCameraStream();
                          nativeCaptureInputRef.current?.click();
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                        <span>Utiliser Caméra du tél</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Top Camera Overlay */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20">
                  <div className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-sm border border-white/15 text-xs font-mono font-bold text-white flex items-center gap-1.5">
                    {isRecording ? (
                      <span className="w-2 h-2 rounded-full bg-[#ff0050] animate-ping" />
                    ) : (
                      <span className={`w-2 h-2 rounded-full ${isVideoReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    )}
                    <span>
                      {formatTimer(elapsedSec)} / {formatTimer(maxSeconds)}
                    </span>
                  </div>

                  {!isRecording && (
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="w-8 h-8 rounded-full bg-black/75 text-white border border-white/15 flex items-center justify-center cursor-pointer"
                      title="Changer de caméra"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                {isRecording && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 z-20">
                    <div
                      className="h-full bg-gradient-to-r from-[#ff0050] to-[#00f2fe] transition-all duration-200"
                      style={{ width: `${Math.min(100, (elapsedSec / maxSeconds) * 100)}%` }}
                    />
                  </div>
                )}

                {/* Record / Stop Button */}
                <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4 z-20">
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecordingVideo}
                      className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white flex items-center justify-center cursor-pointer active:scale-95"
                    >
                      <Square className="w-6 h-6 text-[#ff0050] fill-[#ff0050]" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecordingVideo}
                      className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white flex items-center justify-center cursor-pointer active:scale-95"
                    >
                      <span className="w-11 h-11 rounded-full bg-[#ff0050]" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setMode('choose');
                  }}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  ← Retour
                </button>
                <span className="text-zinc-400">
                  {isRecording ? 'Appuie sur ■ pour terminer' : 'Appuie sur le bouton rouge pour filmer'}
                </span>
              </div>
            </div>
          )}

          {mode === 'preview' && previewVideo && (
            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden bg-black border border-zinc-800 max-h-[340px]">
                <video
                  src={previewVideo.resolvedUrl}
                  controls
                  playsInline
                  autoPlay
                  className="w-full max-h-[340px] object-contain mx-auto"
                />
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    discardCurrentPreview();
                    setMode('choose');
                  }}
                  className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-bold cursor-pointer"
                >
                  Changer
                </button>

                <button
                  type="button"
                  disabled={downloadingPreview}
                  onClick={async () => {
                    setDownloadingPreview(true);
                    await downloadMediaAsset(previewVideo.videoUrl, `evasion_video_${Date.now()}`);
                    setDownloadingPreview(false);
                  }}
                  className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="Enregistrer"
                  title="Enregistrer"
                >
                  {downloadingPreview ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>

                {onDirectSend ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        validatedRef.current = true;
                        onVideoReady({ videoUrl: previewVideo.videoUrl, duration: previewVideo.duration });
                        onClose();
                      }}
                      className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                      title="Joindre la vidéo et ajouter un texte avant d'envoyer"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Joindre</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        validatedRef.current = true;
                        onDirectSend({ videoUrl: previewVideo.videoUrl, duration: previewVideo.duration });
                        onClose();
                      }}
                      className="flex-1 min-w-[160px] py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Valider & Envoyer ({previewVideo.duration}s)</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      validatedRef.current = true;
                      onVideoReady({ videoUrl: previewVideo.videoUrl, duration: previewVideo.duration });
                      onClose();
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-black text-xs flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Valider ({previewVideo.duration}s)</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
