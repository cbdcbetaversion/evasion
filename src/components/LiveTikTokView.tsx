import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Radio,
  Video,
  VideoOff,
  Mic,
  MicOff,
  RefreshCw,
  Heart,
  Key,
  Lock,
  Send,
  Eye,
  X,
  Sparkles,
  Users,
  CheckCircle2,
  Camera,
  Download,
  ShieldCheck,
  ZoomOut,
  ZoomIn,
  Plus,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  UserPlus,
  Hand,
  Megaphone,
  Copy,
  Check,
  Pin,
  Film,
  Volume2,
  VolumeX,
  Ban,
  Share2,
} from 'lucide-react';
import { useApp, LIVE_MIN_KEYS_REQUIRED } from '../context/AppContext';
import { LiveSession, DirectChatTarget, NeonColor, CellFrame, AppTheme } from '../types';
import { LiveAvatarWrapper, LivePseudoBadge } from './LiveBadge';
import { AvatarDisplay } from './AvatarDisplay';
import { LiveMediaExplorer } from './LiveMediaExplorer';
import {
  requestCameraAndMicStream,
  requestAudioOnlyStream,
  findCameraDeviceIdForFacing,
  saveMediaBlob,
  downloadMediaAsset,
  attachStreamToVideoElement,
  getMediaPermissionsSummary,
  subscribeMediaPermissionChanges,
  isInsideEmbeddedFrame,
  getMediaPermissionGuideSteps,
  MediaPermissionsSummary,
} from '../utils/mediaStore';
import {
  getNeonTextClass,
  getNeonAvatarRingClass,
  getCellFrameClasses,
} from '../utils/neonStyles';

const DEFAULT_RTC_ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
      ],
    },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

const downsampleFloatToInt16Base64 = (
  input: Float32Array,
  fromRate: number,
  targetRate = 24000
): string => {
  const ratio = fromRate > targetRate ? fromRate / targetRate : 1;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.min(input.length - 1, Math.floor(pos));
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = pos - i0;
    const s0 = input[i0] || 0;
    const s1 = input[i1] || 0;
    const s = Math.max(-1, Math.min(1, s0 + (s1 - s0) * frac));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  const chunkSize = 0x4000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
};

const resampleFloat32Linear = (
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array => {
  if (!input.length || fromRate <= 0 || toRate <= 0 || Math.abs(fromRate - toRate) < 1) {
    return new Float32Array(input);
  }
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.min(input.length - 1, Math.floor(pos));
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = (input[i0] || 0) + ((input[i1] || 0) - (input[i0] || 0)) * frac;
  }
  return out;
};

const VIEWER_RING_WORKLET_CODE = `
class EvasionLiveAudioPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate || 48000;
    this.cap = Math.max(48000, Math.round(sr * 3));
    this.ring = new Float32Array(this.cap);
    this.readIdx = 0;
    this.writeIdx = 0;
    this.filled = 0;
    this.primed = false;
    this.lastOut = 0;
    this.prebufferTarget = Math.round(sr * 0.095);
    this.maxBacklog = Math.round(sr * 0.45);
    this.trimTarget = Math.round(sr * 0.13);
    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg && msg.type === 'flush') {
        this.readIdx = 0;
        this.writeIdx = 0;
        this.filled = 0;
        this.primed = false;
        this.lastOut = 0;
        return;
      }
      if (msg instanceof Float32Array && msg.length > 0) {
        const len = msg.length;
        for (let i = 0; i < len; i++) {
          this.ring[this.writeIdx] = msg[i];
          this.writeIdx = (this.writeIdx + 1) % this.cap;
          if (this.filled < this.cap) {
            this.filled += 1;
          } else {
            this.readIdx = (this.readIdx + 1) % this.cap;
          }
        }
        if (this.filled > this.maxBacklog) {
          const skip = this.filled - this.trimTarget;
          this.readIdx = (this.readIdx + skip) % this.cap;
          this.filled -= skip;
        }
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const n = out.length;
    if (!this.primed && this.filled >= this.prebufferTarget) {
      this.primed = true;
    }
    for (let i = 0; i < n; i++) {
      if (this.primed && this.filled > 0) {
        const s = this.ring[this.readIdx];
        this.readIdx = (this.readIdx + 1) % this.cap;
        this.filled -= 1;
        this.lastOut = s;
        out[i] = s;
      } else {
        this.primed = false;
        this.lastOut *= 0.90;
        out[i] = this.lastOut;
      }
    }
    return true;
  }
}
registerProcessor('evasion-live-audio-player', EvasionLiveAudioPlayer);
`;

const BROADCASTER_CAPTURE_WORKLET_CODE = `
class EvasionLiveAudioCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(2048);
    this.pos = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.pos++] = ch[i];
      if (this.pos >= this.buf.length) {
        const copy = new Float32Array(this.buf);
        this.port.postMessage(copy, [copy.buffer]);
        this.pos = 0;
      }
    }
    return true;
  }
}
registerProcessor('evasion-live-audio-capture', EvasionLiveAudioCapture);
`;

const decodeInt16Base64ToFloat32 = (b64: string): Float32Array | null => {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
    const out = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      out[i] = pcm[i] / 32768;
    }
    return out;
  } catch {
    return null;
  }
};

const applyLowLatencySenderParams = (sender: RTCRtpSender, kind: string) => {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    if (kind === 'video') {
      params.degradationPreference = 'balanced';
      params.encodings[0] = {
        ...params.encodings[0],
        maxBitrate: 1_200_000,
        maxFramerate: 24,
        scaleResolutionDownBy: 1,
        priority: 'high',
        networkPriority: 'high',
      };
    } else if (kind === 'audio') {
      params.encodings[0] = {
        ...params.encodings[0],
        maxBitrate: 128_000,
        priority: 'high',
        networkPriority: 'high',
      };
    }
    void sender.setParameters(params).catch(() => {});
  } catch {
    // ignore unsupported RTCRtpSender parameter fields
  }
};

const applyLowLatencyReceiverHint = (receiver?: RTCRtpReceiver, kind?: string) => {
  if (!receiver) return;
  try {
    if (kind === 'audio') {
      if ('playoutDelayHint' in receiver) {
        (receiver as RTCRtpReceiver & { playoutDelayHint?: number }).playoutDelayHint = 0.08;
      }
      if ('jitterBufferTarget' in receiver) {
        (receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget = 80;
      }
      return;
    }
    if ('playoutDelayHint' in receiver) {
      (receiver as RTCRtpReceiver & { playoutDelayHint?: number }).playoutDelayHint = 0;
    }
    if ('jitterBufferTarget' in receiver) {
      (receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget = 0;
    }
  } catch {
    // ignore unsupported jitter buffer hints
  }
};

interface StageParticipantItem {
  userId: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: NeonColor;
  frame?: CellFrame;
  isHost: boolean;
  camEnabled: boolean;
  micEnabled: boolean;
}

interface ParticipantVideoTileProps {
  participant: StageParticipantItem;
  slotIndex: number;
  totalCount: number;
  isMe: boolean;
  stream: MediaStream | null;
  filterCss: string;
  isEnlargedZoom: boolean;
  facingMode: 'user' | 'environment';
  theme: AppTheme;
  canKick: boolean;
  onKick?: () => void;
  onLeaveStage?: () => void;
  onOpenDirectChat: () => void;
  onEnableLocalCamera?: () => void;
  onEnableAudioOnly?: () => void;
  onBroadcastCameraClick?: () => void;
  onReconnectStream?: () => void;
  viewerMuted?: boolean;
  onViewerAudioBlockedChange?: (blocked: boolean) => void;
  onUnmuteViewerAudio?: () => void;
  camRequesting?: boolean;
  camError?: string | null;
  liveTitle: string;
  topicTag: string;
  isCinemaMode?: boolean;
  isExpandedChat?: boolean;
  relayFrameUrl?: string | null;
  relaySenderKey?: string;
  relayHostKey?: string;
  subscribeRelayFrame?: (keys: string[], cb: (url: string | null) => void) => () => void;
  relayAudioActive?: boolean;
  audioUnlockedTick?: number;
}

const ParticipantVideoTile: React.FC<ParticipantVideoTileProps> = React.memo(
  ({
    participant,
    slotIndex,
    totalCount,
    isMe,
    stream,
    filterCss,
    isEnlargedZoom,
    facingMode,
    canKick,
    onKick,
    onLeaveStage,
    onOpenDirectChat,
    onEnableLocalCamera,
    onEnableAudioOnly,
    onBroadcastCameraClick,
    onReconnectStream,
    viewerMuted = false,
    onViewerAudioBlockedChange,
    onUnmuteViewerAudio,
    camRequesting,
    camError,
    liveTitle,
    topicTag,
    isCinemaMode = false,
    isExpandedChat = false,
    relayFrameUrl = null,
    relaySenderKey,
    relayHostKey,
    subscribeRelayFrame,
    relayAudioActive = false,
    audioUnlockedTick = 0,
  }) => {
    const tileVideoRef = useRef<HTMLVideoElement | null>(null);
    const tileAudioRef = useRef<HTMLAudioElement | null>(null);
    const relayImgRef = useRef<HTMLImageElement | null>(null);
    const [isPlayingVideo, setIsPlayingVideo] = useState(false);
    const [relayImgDecoded, setRelayImgDecoded] = useState(false);
    const [isAudioBlocked, setIsAudioBlocked] = useState(false);
    const [trackTick, setTrackTick] = useState(0);
    const onViewerAudioBlockedChangeRef = useRef(onViewerAudioBlockedChange);
    onViewerAudioBlockedChangeRef.current = onViewerAudioBlockedChange;
    const onUnmuteViewerAudioRef = useRef(onUnmuteViewerAudio);
    onUnmuteViewerAudioRef.current = onUnmuteViewerAudio;
    const autoplayMutedFallbackRef = useRef(false);

    // Track remote mute/unmute/ended events so UI updates immediately if broadcaster cuts video
    useEffect(() => {
      if (!stream) return;
      const bump = () => setTrackTick((n) => n + 1);
      const tracks = stream.getTracks();
      tracks.forEach((t) => {
        t.addEventListener('mute', bump);
        t.addEventListener('unmute', bump);
        t.addEventListener('ended', bump);
      });
      stream.addEventListener('addtrack', bump);
      stream.addEventListener('removetrack', bump);
      return () => {
        tracks.forEach((t) => {
          t.removeEventListener('mute', bump);
          t.removeEventListener('unmute', bump);
          t.removeEventListener('ended', bump);
        });
        stream.removeEventListener('addtrack', bump);
        stream.removeEventListener('removetrack', bump);
      };
    }, [stream]);

    const videoTracks = stream ? stream.getVideoTracks() : [];
    const hasLiveVideoTrack = Boolean(
      stream &&
        participant.camEnabled &&
        videoTracks.some((t) => t.readyState === 'live')
    );
    const hasUnmutedVideoTrack = Boolean(
      stream &&
        participant.camEnabled &&
        videoTracks.some((t) => t.readyState === 'live' && !t.muted)
    );
    const hasLiveAudioTrack = Boolean(
      stream && stream.getAudioTracks().some((t) => t.readyState === 'live')
    );
    const hasRelayVideo = Boolean(participant.camEnabled && relayFrameUrl);

    useEffect(() => {
      if (!hasRelayVideo) {
        setRelayImgDecoded(false);
        if (relayImgRef.current) {
          relayImgRef.current.removeAttribute('src');
        }
      }
    }, [hasRelayVideo]);

    useEffect(() => {
      if (isMe || !subscribeRelayFrame) return;
      const keys = [relaySenderKey, relayHostKey].filter((k): k is string => Boolean(k));
      if (keys.length === 0) return;
      return subscribeRelayFrame(keys, (nextUrl) => {
        const img = relayImgRef.current;
        if (!nextUrl) {
          setRelayImgDecoded(false);
          if (img) img.removeAttribute('src');
          return;
        }
        setRelayImgDecoded(true);
        if (img) {
          img.src = nextUrl;
        }
      });
    }, [isMe, subscribeRelayFrame, relaySenderKey, relayHostKey]);

    const updateBlockedState = useCallback((blocked: boolean) => {
      setIsAudioBlocked(blocked);
      onViewerAudioBlockedChangeRef.current?.(blocked);
    }, []);

    // Synchronous in-gesture unmute handler so iOS Safari & Chrome never re-mute remote WebRTC streams
    useEffect(() => {
      if (isMe) return;
      const onSyncUnlock = () => {
        if (viewerMuted) return;
        autoplayMutedFallbackRef.current = false;
        const vid = tileVideoRef.current;
        if (vid && vid.srcObject) {
          try {
            vid.muted = false;
            vid.defaultMuted = false;
            vid.removeAttribute('muted');
            vid.volume = 1;
            const p = vid.play();
            if (p && typeof p.then === 'function') {
              p.then(() => updateBlockedState(false)).catch(() => {});
            }
          } catch {
            // ignore
          }
        }
        const aud = tileAudioRef.current;
        if (aud && aud.srcObject) {
          try {
            aud.muted = false;
            aud.defaultMuted = false;
            aud.removeAttribute('muted');
            aud.volume = 1;
            const p = aud.play();
            if (p && typeof p.then === 'function') {
              p.then(() => updateBlockedState(false)).catch(() => {});
            }
          } catch {
            // ignore
          }
        }
      };
      window.addEventListener('evasion:viewer-unlock-media', onSyncUnlock);
      return () => {
        window.removeEventListener('evasion:viewer-unlock-media', onSyncUnlock);
      };
    }, [isMe, viewerMuted, updateBlockedState]);

    useEffect(() => {
      const el = tileVideoRef.current;
      if (!el || !stream || !hasLiveVideoTrack) {
        setIsPlayingVideo(false);
        return;
      }
      stream.getVideoTracks().forEach((t) => {
        t.enabled = true;
      });
      if (viewerMuted) {
        autoplayMutedFallbackRef.current = false;
      } else if (!isMe && audioUnlockedTick > 0 && el.muted && !autoplayMutedFallbackRef.current) {
        el.muted = false;
        el.defaultMuted = false;
        el.removeAttribute('muted');
        el.volume = 1;
      }
      const shouldMute = isMe || viewerMuted || autoplayMutedFallbackRef.current;
      if (el.srcObject !== stream || el.muted !== shouldMute) {
        attachStreamToVideoElement(el, stream, { muted: shouldMute });
      }
      if (!shouldMute) {
        el.volume = 1;
      }
      const syncReadyState = () => {
        if (el.readyState >= 2 && el.videoWidth > 0 && !el.paused) {
          setIsPlayingVideo(true);
          return true;
        }
        setIsPlayingVideo(false);
        return false;
      };
      const tryPlay = () => {
        el.play()
          .then(() => {
            syncReadyState();
            if (!isMe && !viewerMuted && !el.muted) {
              autoplayMutedFallbackRef.current = false;
              updateBlockedState(false);
            }
          })
          .catch(() => {
            if (!isMe) {
              autoplayMutedFallbackRef.current = true;
              el.muted = true;
              el.play()
                .then(() => {
                  syncReadyState();
                  if (!viewerMuted) updateBlockedState(true);
                })
                .catch(() => {});
            } else {
              el.muted = true;
              el.play()
                .then(() => {
                  syncReadyState();
                })
                .catch(() => {});
            }
          });
      };
      if (el.paused || el.srcObject !== stream) {
        tryPlay();
      }
      syncReadyState();
      const pollT = window.setInterval(() => {
        if (el.paused && el.srcObject) {
          tryPlay();
        }
        syncReadyState();
      }, 220);
      return () => window.clearInterval(pollT);
    }, [stream, hasLiveVideoTrack, hasUnmutedVideoTrack, isMe, viewerMuted, audioUnlockedTick, trackTick, updateBlockedState]);

    useEffect(() => {
      const audioEl = tileAudioRef.current;
      if (!audioEl || !stream || isMe || (hasLiveVideoTrack && isPlayingVideo && !autoplayMutedFallbackRef.current) || !hasLiveAudioTrack) return;
      if (audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
      }
      audioEl.muted = viewerMuted;
      if (!viewerMuted) {
        audioEl.volume = 1;
      }
      audioEl
        .play()
        .then(() => {
          if (!viewerMuted) updateBlockedState(false);
        })
        .catch(() => {
          if (!viewerMuted) updateBlockedState(true);
        });
    }, [stream, isMe, hasLiveVideoTrack, isPlayingVideo, hasLiveAudioTrack, viewerMuted, audioUnlockedTick, trackTick, updateBlockedState]);

    // Adaptive grid placement for 1, 2, 3, 4, or 5 simultaneous screens
    const gridSpanClass =
      totalCount === 3 && slotIndex === 0
        ? 'col-span-2'
        : totalCount === 5
        ? slotIndex < 2
          ? 'col-span-3'
          : 'col-span-2'
        : '';

    const showVideoElement = hasLiveVideoTrack && Boolean(stream);
    const showFallbackBackdrop = !isPlayingVideo && !(hasRelayVideo && !isMe && relayImgDecoded);

    return (
      <div
        className={`relative w-full h-full min-h-0 overflow-hidden bg-transparent ${gridSpanClass} ${
          totalCount > 1
            ? 'rounded-2xl border border-white/20'
            : ''
        }`}
      >
        {showVideoElement && stream && (
          <video
            data-local-stage-video={isMe ? 'true' : undefined}
            ref={(el) => {
              tileVideoRef.current = el;
              if (el && stream) {
                if (el.srcObject !== stream) {
                  attachStreamToVideoElement(el, stream, {
                    muted: isMe || viewerMuted || autoplayMutedFallbackRef.current,
                  });
                }
                el.playsInline = true;
              }
            }}
            autoPlay
            playsInline
            muted={isMe || viewerMuted}
            onLoadedMetadata={(e) => {
              const shouldMute = isMe || viewerMuted || autoplayMutedFallbackRef.current;
              e.currentTarget.muted = shouldMute;
              e.currentTarget.play().catch(() => {
                if (!isMe) {
                  autoplayMutedFallbackRef.current = true;
                  e.currentTarget.muted = true;
                  e.currentTarget.play().catch(() => {});
                  if (!viewerMuted) updateBlockedState(true);
                }
              });
              if (e.currentTarget.readyState >= 2 && e.currentTarget.videoWidth > 0) {
                setIsPlayingVideo(true);
              }
            }}
            onLoadedData={(e) => {
              if (e.currentTarget.videoWidth > 0 && !e.currentTarget.paused) {
                setIsPlayingVideo(true);
              }
            }}
            onCanPlay={(e) => {
              if (e.currentTarget.paused) {
                e.currentTarget.play().catch(() => {});
              }
              if (e.currentTarget.readyState >= 2 && e.currentTarget.videoWidth > 0) {
                setIsPlayingVideo(true);
              }
            }}
            onPlaying={(e) => {
              if (e.currentTarget.videoWidth > 0) {
                setIsPlayingVideo(true);
              }
            }}
            onTimeUpdate={(e) => {
              if (!isPlayingVideo && e.currentTarget.videoWidth > 0 && !e.currentTarget.paused) {
                setIsPlayingVideo(true);
              }
            }}
            onResize={(e) => {
              if (e.currentTarget.readyState >= 2 && e.currentTarget.videoWidth > 0 && !e.currentTarget.paused) {
                setIsPlayingVideo(true);
              }
            }}
            className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
              isPlayingVideo ? 'opacity-100 z-[3]' : 'opacity-0 z-[1] pointer-events-none'
            } ${
              totalCount > 1
                ? 'object-cover'
                : isCinemaMode
                ? 'object-cover sm:object-contain'
                : isEnlargedZoom
                ? 'object-cover'
                : 'object-cover sm:object-contain'
            } ${
              isMe && facingMode === 'user' ? '-scale-x-100' : ''
            } ${participant.isHost ? filterCss : ''}`}
          />
        )}

        {hasRelayVideo && !isMe && (
          <img
            ref={relayImgRef}
            src={relayFrameUrl && relayFrameUrl !== '__AVAILABLE__' ? relayFrameUrl : undefined}
            alt={participant.alias}
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth > 0) {
                setRelayImgDecoded(true);
              }
            }}
            onError={() => {
              setRelayImgDecoded(false);
            }}
            className={`absolute inset-0 z-[2] w-full h-full select-none pointer-events-none transition-opacity duration-150 ${
              relayImgDecoded ? 'opacity-100' : 'opacity-0'
            } ${
              totalCount > 1
                ? 'object-cover'
                : isCinemaMode
                ? 'object-cover sm:object-contain'
                : isEnlargedZoom
                ? 'object-cover'
                : 'object-cover sm:object-contain'
            } ${participant.isHost ? filterCss : ''}`}
          />
        )}

        {isAudioBlocked && !viewerMuted && !isMe && !isCinemaMode && (isPlayingVideo || hasRelayVideo) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              autoplayMutedFallbackRef.current = false;
              const vid = tileVideoRef.current;
              if (vid) {
                vid.muted = false;
                vid.defaultMuted = false;
                vid.removeAttribute('muted');
                vid.volume = 1;
                vid.play().catch(() => {});
              }
              const aud = tileAudioRef.current;
              if (aud) {
                aud.muted = false;
                aud.defaultMuted = false;
                aud.removeAttribute('muted');
                aud.volume = 1;
                aud.play().catch(() => {});
              }
              window.dispatchEvent(new Event('evasion:viewer-unlock-media'));
              updateBlockedState(false);
              onUnmuteViewerAudioRef.current?.();
            }}
            className={`z-20 px-3 py-1.5 rounded-full bg-transparent backdrop-blur-[2px] border border-cyan-400/80 text-white text-[11px] font-mono font-bold flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all cursor-pointer animate-pulse drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] ${
              totalCount > 1 ? 'absolute top-2 left-2' : 'absolute top-36 left-1/2 -translate-x-1/2'
            }`}
            title="Toucher pour activer le son du Live"
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
            <span>Activer le son</span>
          </button>
        )}

        {showFallbackBackdrop && (
          <div
            className={`relative z-[2] w-full h-full flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#ff0050]/12 via-transparent to-[#00f2fe]/12 overflow-hidden ${
              totalCount === 1 && !isCinemaMode
                ? `px-4 pt-[148px] sm:pt-[162px] ${
                    isExpandedChat ? 'pb-[350px] sm:pb-[380px]' : 'pb-[275px] sm:pb-[305px]'
                  }`
                : 'p-4'
            }`}
          >
            {/* Hidden audio element if remote sends audio without playing video */}
            {!isMe && stream && hasLiveAudioTrack && (
              <audio
                autoPlay
                muted={viewerMuted}
                ref={(el) => {
                  tileAudioRef.current = el;
                  if (el && el.srcObject !== stream) {
                    el.srcObject = stream;
                    el.muted = viewerMuted;
                    el.play()
                      .then(() => {
                        if (!viewerMuted) updateBlockedState(false);
                      })
                      .catch(() => {
                        if (!viewerMuted) updateBlockedState(true);
                      });
                  }
                }}
              />
            )}

            {/* Pulsing background ambient live wave rings */}
            <div className="relative z-10 flex flex-col items-center max-w-full">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-32 h-32 sm:w-44 sm:h-44 rounded-full border border-[#ff0050]/30 animate-ping opacity-25 pointer-events-none" />
                <div className="absolute w-44 h-44 sm:w-60 sm:h-60 rounded-full border border-[#00f2fe]/20 animate-pulse opacity-20 pointer-events-none" />

                {isMe ? (
                  <button
                    type="button"
                    disabled={camRequesting}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEnableLocalCamera) {
                        onEnableLocalCamera();
                      } else if (onBroadcastCameraClick) {
                        onBroadcastCameraClick();
                      }
                    }}
                    className="live-avatar-aura group inline-flex items-center justify-center p-1 rounded-full bg-gradient-to-tr from-[#ff0050] to-[#00f2fe] cursor-pointer hover:scale-105 active:scale-95 transition-all relative"
                    title="Activer la caméra et le micro sans couper le Live"
                  >
                    <div
                      className={`${
                        totalCount > 2
                          ? 'w-14 h-14 text-xl'
                          : 'w-20 h-20 sm:w-24 sm:h-24 text-3xl sm:text-4xl'
                      } rounded-full bg-transparent flex items-center justify-center overflow-hidden shadow-2xl relative`}
                    >
                      <AvatarDisplay avatar={participant.avatar} alt={participant.alias} />
                      <div className="absolute inset-0 bg-transparent group-hover:bg-white/10 flex items-center justify-center transition-colors">
                        <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow-[0_0_12px_rgba(255,0,80,0.85)]" />
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="live-avatar-aura inline-flex items-center justify-center p-1 rounded-full bg-gradient-to-tr from-[#ff0050] to-[#00f2fe]">
                    <div
                      className={`${
                        totalCount > 2
                          ? 'w-14 h-14 text-xl'
                          : 'w-20 h-20 sm:w-24 sm:h-24 text-3xl sm:text-4xl'
                      } rounded-full bg-transparent flex items-center justify-center overflow-hidden shadow-2xl`}
                    >
                      <AvatarDisplay avatar={participant.avatar} alt={participant.alias} />
                    </div>
                  </div>
                )}
              </div>

              {!isCinemaMode && isMe && (
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={camRequesting}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEnableLocalCamera) {
                        onEnableLocalCamera();
                      } else if (onBroadcastCameraClick) {
                        onBroadcastCameraClick();
                      }
                    }}
                    className="px-4 py-2 min-h-[40px] rounded-full bg-transparent hover:bg-[#ff0050]/20 disabled:opacity-60 border-2 border-[#ff0050] text-white font-mono font-black text-xs tracking-wide flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                    title="Autoriser la caméra et le micro sans interrompre le Live"
                  >
                    <Camera className="w-4 h-4 text-[#ff0050] shrink-0" />
                    <span>
                      {camRequesting
                        ? 'Activation en cours...'
                        : 'Activer caméra & micro'}
                    </span>
                  </button>
                  {!hasLiveAudioTrack && onEnableAudioOnly && (
                    <button
                      type="button"
                      disabled={camRequesting}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEnableAudioOnly();
                      }}
                      className="px-3.5 py-2 min-h-[40px] rounded-full bg-transparent hover:bg-emerald-500/20 disabled:opacity-60 border border-emerald-400/75 text-emerald-200 font-mono font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                      title="Activer uniquement le micro sans caméra"
                    >
                      <Mic className="w-4 h-4 text-emerald-300 shrink-0" />
                      <span>Micro seul</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {totalCount === 1 ? (
              !isCinemaMode && (
                <div className="relative z-10 mt-2.5 space-y-1.5 max-w-xs px-2">
                  <h3 className="text-base sm:text-xl font-black text-white leading-snug line-clamp-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)]">
                    {liveTitle}
                  </h3>
                  <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-transparent border border-white/25 text-xs font-mono text-amber-300 font-bold max-w-full truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                    <span>{topicTag}</span>
                    <span>·</span>
                    <span>
                      {isMe
                        ? 'Prêt à diffuser'
                        : hasLiveAudioTrack || relayAudioActive
                        ? 'Audio en direct 🔊'
                        : participant.camEnabled
                        ? 'Connexion vidéo en cours…'
                        : 'Audio en direct'}
                    </span>
                  </div>
                  {!isMe && !stream && !relayAudioActive && onReconnectStream && (
                    <div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReconnectStream();
                        }}
                        className="mt-1 px-3.5 py-1.5 rounded-full bg-transparent hover:bg-white/15 border border-white/25 text-white text-[11px] font-mono font-bold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Reconnecter le flux</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            ) : (
              !isCinemaMode && (
                <div className="relative z-10 mt-2 space-y-1 max-w-full">
                  <div className="text-xs font-bold text-white truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">{participant.alias}</div>
                  {!isMe && (
                    <div className="text-[10px] font-mono text-zinc-300">
                      {hasLiveAudioTrack || relayAudioActive
                        ? 'Audio en direct 🔊'
                        : participant.camEnabled
                        ? 'Vidéo en attente…'
                        : 'Audio seul'}
                    </div>
                  )}
                  {!isMe && !stream && !relayAudioActive && onReconnectStream && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReconnectStream();
                      }}
                      className="px-2.5 py-1 rounded-full bg-transparent hover:bg-white/10 border border-white/20 text-white text-[10px] font-mono inline-flex items-center gap-1 cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Reconnecter</span>
                    </button>
                  )}
                </div>
              )
            )}

            {!isCinemaMode && isMe && camError && (
              <div className="mt-2.5 text-[11px] text-amber-200 bg-transparent px-3 py-2 rounded-xl border border-amber-400/60 max-w-xs drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] space-y-1">
                <p>{camError}</p>
                {(() => {
                  const guide = getMediaPermissionGuideSteps();
                  return (
                    <p className="text-[10px] text-zinc-300 font-mono">
                      {guide.platformLabel} : {guide.steps[0]}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Per-tile identity overlay when 2..5 participants are on screen (hidden in cinema mode) */}
        {totalCount > 1 && !isCinemaMode && (
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1.5 pointer-events-none">
            <button
              type="button"
              disabled={isMe}
              onClick={(e) => {
                e.stopPropagation();
                if (!isMe) onOpenDirectChat();
              }}
              className={`pointer-events-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-transparent drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] border border-white/25 text-[10px] font-mono text-white max-w-[75%] ${
                !isMe ? 'hover:border-[#00f2fe] cursor-pointer' : ''
              }`}
            >
              <span className="w-4 h-4 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0">
                <AvatarDisplay avatar={participant.avatar} alt={participant.alias} />
              </span>
              <span
                className={`font-bold truncate ${
                  participant.neonColor ? getNeonTextClass(participant.neonColor, 'dark') : ''
                }`}
              >
                {participant.alias}
              </span>
              <span
                className={`px-1 rounded text-[8px] font-black uppercase shrink-0 border bg-transparent ${
                  participant.isHost ? 'border-[#ff0050] text-white' : 'border-cyan-400 text-cyan-200'
                }`}
              >
                {participant.isHost ? 'HÔTE' : `#${slotIndex + 1}`}
              </span>
              {!participant.micEnabled && <MicOff className="w-2.5 h-2.5 text-red-400 shrink-0" />}
            </button>

            <div className="pointer-events-auto flex items-center gap-1">
              {isMe && !participant.isHost && onLeaveStage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLeaveStage();
                  }}
                  title="Quitter l'écran et redevenir spectateur"
                  className="px-2 py-0.5 rounded-full bg-transparent hover:bg-red-500/20 border border-red-400/75 text-white text-[9px] font-mono font-bold cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                >
                  Descendre
                </button>
              )}
              {canKick && onKick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKick();
                  }}
                  title={`Retirer ${participant.alias} de l'écran`}
                  className="w-6 h-6 rounded-full bg-transparent hover:bg-red-500/25 border border-red-400/80 text-white flex items-center justify-center cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

interface FloatingReaction {
  id: string;
  emoji: string;
  offsetClass: string;
}

type GiftKind = 'key_gift' | 'padlock' | 'ice_cone' | 'water_bottle' | 'canned_food';

interface LiveGiftBannerItem {
  id: string;
  giftType: GiftKind;
  senderName: string;
  senderAvatar: string;
  combo: number;
  timestamp: number;
}

const LIVE_GIFT_CONFIG: Record<
  GiftKind,
  {
    emoji: string;
    title: string;
    shortLabel: string;
    pts: string;
    gradient: string;
    glow: string;
    ring: string;
  }
> = {
  key_gift: {
    emoji: '🔑',
    title: "Clé d'Évasion",
    shortLabel: '+1 Clé',
    pts: '+100 pts',
    gradient: 'from-amber-500/45 via-yellow-500/35 to-amber-600/45 border-amber-300/60',
    glow: 'shadow-[0_0_35px_rgba(245,158,11,0.45)]',
    ring: 'border-amber-400/60 bg-amber-500/15',
  },
  padlock: {
    emoji: '🔒',
    title: 'Cadenas Scellé',
    shortLabel: 'Cadenas',
    pts: '+150 pts',
    gradient: 'from-sky-500/45 via-cyan-500/35 to-blue-600/45 border-sky-300/60',
    glow: 'shadow-[0_0_35px_rgba(14,165,233,0.45)]',
    ring: 'border-sky-400/60 bg-sky-500/15',
  },
  ice_cone: {
    emoji: '🍦',
    title: 'Glace Cornet',
    shortLabel: 'Cornet',
    pts: '+50 pts',
    gradient: 'from-pink-500/45 via-rose-500/35 to-amber-500/45 border-pink-300/60',
    glow: 'shadow-[0_0_35px_rgba(236,72,153,0.45)]',
    ring: 'border-pink-400/60 bg-pink-500/15',
  },
  water_bottle: {
    emoji: '💧',
    title: "Bouteille d’eau",
    shortLabel: 'Eau',
    pts: '+75 pts',
    gradient: 'from-cyan-500/45 via-sky-500/35 to-blue-600/45 border-cyan-300/60',
    glow: 'shadow-[0_0_35px_rgba(6,182,212,0.45)]',
    ring: 'border-cyan-400/60 bg-cyan-500/15',
  },
  canned_food: {
    emoji: '🥫',
    title: 'Boîte de Conserve',
    shortLabel: 'Conserve',
    pts: '+80 pts',
    gradient: 'from-orange-500/45 via-red-500/35 to-amber-600/45 border-orange-300/60',
    glow: 'shadow-[0_0_35px_rgba(249,115,22,0.45)]',
    ring: 'border-orange-400/60 bg-orange-500/15',
  },
};

const FLOATING_OFFSET_CLASSES = [
  'right-1',
  'right-3',
  'right-5',
  'right-2',
  'right-4',
  'right-6',
];

const LIVE_FILTERS: { id: 'none' | 'neon' | 'mono' | 'warm'; label: string; css: string }[] = [
  { id: 'none', label: 'Normal', css: '' },
  { id: 'neon', label: 'Néon', css: 'contrast-125 saturate-150 hue-rotate-15' },
  { id: 'mono', label: 'N&B', css: 'grayscale contrast-125' },
  { id: 'warm', label: '432Hz', css: 'sepia-[.25] saturate-125 brightness-105' },
];

const ZOOM_LEVELS: {
  id: '075' | '090' | '100' | '125' | '150' | '200';
  label: string;
  scale: number;
  wrapperClass: string;
}[] = [
  { id: '075', label: '0.75×', scale: 0.75, wrapperClass: 'live-zoom-075' },
  { id: '090', label: '0.90×', scale: 0.9, wrapperClass: 'live-zoom-090' },
  { id: '100', label: '1.0×', scale: 1.0, wrapperClass: 'live-zoom-100' },
  { id: '125', label: '1.25×', scale: 1.25, wrapperClass: 'live-zoom-125' },
  { id: '150', label: '1.5×', scale: 1.5, wrapperClass: 'live-zoom-150' },
  { id: '200', label: '2.0×', scale: 2.0, wrapperClass: 'live-zoom-200' },
];

const TOPIC_SUGGESTIONS = ['#Détox', '#Écrans', '#Focus', '#NuitBlanche', '#SportIRL', '#Liberté'];

export const LiveTikTokView: React.FC = () => {
  const {
    user,
    activeLives,
    startLiveSession,
    endLiveSession,
    joinLiveSession,
    leaveLiveSession,
    updateLiveFilter,
    sendLiveComment,
    sendLiveLike,
    sendLiveReaction,
    sendLiveKeyGift,
    sendLivePadlock,
    sendLiveSpecialGift,
    customSalons,
    createCustomSalon,
    createPost,
    openShop,
    claimDailyBonusKeys,
    showToast,
    theme,
    hasFullKeyAccess,
    requireFullKeyAccess,
    openDirectChat,
    openUserProfile,
    availableInmates,
    searchInmates,
    onlineUsers,
    requestedLiveId,
    autoJoinCoHostLiveId,
    requestOpenLive,
    clearRequestedLive,
    sendLiveInvite,
    requestJoinLiveStage,
    approveGuestStageRequest,
    removeOrLeaveLiveStage,
    updateLiveGuestMedia,
    updateLiveAnnouncement,
    blockLiveViewer,
    joinLiveRtcRoom,
    leaveLiveRtcRoom,
    sendLiveRtcSignal,
    sendLiveRelaySubscribe,
    sendLiveRelayUnsubscribe,
    sendLiveRelayMedia,
    onLiveRtcEvent,
  } = useApp();

  // Lobby / Setup state — séparé clairement entre Spectateur ("watch") et Diffuseur ("broadcast")
  const [lobbyRoleTab, setLobbyRoleTab] = useState<'watch' | 'broadcast'>('watch');
  const [liveTitle, setLiveTitle] = useState('');
  const [liveTopic, setLiveTopic] = useState('#Détox');
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [showCustomTopicInput, setShowCustomTopicInput] = useState(false);
  const [liveFilter, setLiveFilter] = useState<'none' | 'neon' | 'mono' | 'warm'>('none');
  const [currentLiveId, setCurrentLiveId] = useState<string | null>(null);
  const [endedSummary, setEndedSummary] = useState<{
    title: string;
    durationSec: number;
    keys: number;
    padlocks: number;
    specialGifts: number;
    recordedClipRef?: string;
    recordedClipDuration?: number;
  } | null>(null);

  // Camera / Media stream state
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camGranted, setCamGranted] = useState(false);
  const [camRequesting, setCamRequesting] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [permSummary, setPermSummary] = useState<MediaPermissionsSummary>({
    camera: 'unknown',
    microphone: 'unknown',
  });
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [audioOutputUnlocked, setAudioOutputUnlocked] = useState(false);
  const [zoomIndex, setZoomIndex] = useState<number>(2); // default 1.0x plein écran
  const [zoomDirection, setZoomDirection] = useState<1 | -1>(1); // 1 = agrandir jusqu'à 2.0x, -1 = diminuer jusqu'à 0.75x
  const [isExpandedChat, setIsExpandedChat] = useState(false);
  const [isLiveVideoPlaying, setIsLiveVideoPlaying] = useState(false);

  // Multi-user Stage (Live en Live 2-5 participants) & WebRTC Mesh
  const [showStageInviteModal, setShowStageInviteModal] = useState(false);
  const [stageInviteSearch, setStageInviteSearch] = useState('');
  const [stageInviteResults, setStageInviteResults] = useState<DirectChatTarget[]>([]);
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [copiedLiveLink, setCopiedLiveLink] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  remoteStreamsRef.current = remoteStreams;
  const [remoteMediaStates, setRemoteMediaStates] = useState<
    Record<string, { camEnabled: boolean; micEnabled: boolean }>
  >({});
  const remoteMediaStatesRef = useRef<Record<string, { camEnabled: boolean; micEnabled: boolean }>>({});
  remoteMediaStatesRef.current = remoteMediaStates;
  const [viewerMuted, setViewerMuted] = useState(false);
  const viewerMutedRef = useRef<boolean>(viewerMuted);
  viewerMutedRef.current = viewerMuted;
  const [viewerAudioBlocked, setViewerAudioBlocked] = useState(false);
  const viewerAudioBlockedRef = useRef<boolean>(false);
  viewerAudioBlockedRef.current = viewerAudioBlocked;
  const [audioUnlockedTick, setAudioUnlockedTick] = useState(0);
  const rtcIceConfigRef = useRef<RTCConfiguration>(DEFAULT_RTC_ICE_CONFIG);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerRetryMapRef = useRef<Map<string, number>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingRenegotiatePeersRef = useRef<Set<string>>(new Set());
  const [relayFrames, setRelayFrames] = useState<Record<string, string>>({});
  const relayFramesMapRef = useRef<Record<string, string>>({});
  const relayAvailableSetRef = useRef<Set<string>>(new Set());
  const relayFrameListenersRef = useRef<Map<string, Set<(url: string | null) => void>>>(new Map());
  const subscribeRelayFrame = useCallback((keys: string[], cb: (url: string | null) => void) => {
    const cleanKeys = keys.filter(Boolean);
    for (const k of cleanKeys) {
      let set = relayFrameListenersRef.current.get(k);
      if (!set) {
        set = new Set();
        relayFrameListenersRef.current.set(k, set);
      }
      set.add(cb);
      const cached = relayFramesMapRef.current[k];
      if (cached) {
        cb(cached);
      }
    }
    return () => {
      for (const k of cleanKeys) {
        const set = relayFrameListenersRef.current.get(k);
        if (set) {
          set.delete(cb);
          if (set.size === 0) relayFrameListenersRef.current.delete(k);
        }
      }
    };
  }, []);
  const [relayAudioActive, setRelayAudioActive] = useState<Record<string, boolean>>({});
  const [relayNeeded, setRelayNeeded] = useState(false);
  const subscribedRelaySendersRef = useRef<Set<string>>(new Set());
  const viewerAudioCtxRef = useRef<AudioContext | null>(null);
  const viewerAudioInputRef = useRef<AudioNode | null>(null);
  const viewerAudioGainRef = useRef<GainNode | null>(null);
  const viewerWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const viewerFallbackProcRef = useRef<ScriptProcessorNode | null>(null);
  const viewerRingStateRef = useRef<{
    ring: Float32Array;
    readIdx: number;
    writeIdx: number;
    filled: number;
    primed: boolean;
    lastOut: number;
    prebufferTarget: number;
    maxBacklog: number;
    trimTarget: number;
  } | null>(null);
  const broadcasterAudioCtxRef = useRef<AudioContext | null>(null);
  const viewerNextAudioTimeRef = useRef<number>(0);
  const relayAudioActivityTimersRef = useRef<Record<string, number>>({});
  const intentionalStreamStopRef = useRef<boolean>(false);
  const trackRecoveryAttemptsRef = useRef<number>(0);
  const localMediaVersionRef = useRef<number>(0);
  const [localMediaVersion, setLocalMediaVersion] = useState<number>(0);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [blockedTerminatedLiveId, setBlockedTerminatedLiveId] = useState<string | null>(null);
  const [justEndedNotice, setJustEndedNotice] = useState<{ title: string; endedAt: number } | null>(null);
  const [showViewersModerationModal, setShowViewersModerationModal] = useState(false);
  const [pendingBlockTarget, setPendingBlockTarget] = useState<{
    userId: string;
    matricule?: string;
    alias: string;
    avatar?: string;
  } | null>(null);
  const hostStoppedLiveIdRef = useRef<string | null>(null);

  // Live room interaction & optional clip recording (1 min max)
  const [commentInput, setCommentInput] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [clipElapsedSec, setClipElapsedSec] = useState(0);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [activeGiftBanners, setActiveGiftBanners] = useState<LiveGiftBannerItem[]>([]);
  const [centerGiftBurst, setCenterGiftBurst] = useState<LiveGiftBannerItem | null>(null);
  const [isRecordingClip, setIsRecordingClip] = useState(false);

  const stageContainerRef = useRef<HTMLDivElement>(null);
  const seenGiftCommentIdsRef = useRef<Set<string>>(new Set());
  const trackedLiveIdForGiftsRef = useRef<string | null>(null);
  const giftBurstTimeoutRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewStudioVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clipRecorderRef = useRef<MediaRecorder | null>(null);
  const clipChunksRef = useRef<Blob[]>([]);
  const clipStartRef = useRef<number>(0);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const joinedLiveIdRef = useRef<string | null>(null);
  const liveQuickChipsRef = useRef<HTMLDivElement>(null);
  const liveTopicsScrollRef = useRef<HTMLDivElement>(null);
  const liveInmatesScrollRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const wheelCooldownRef = useRef<number>(0);

  // Recherche de détenu pour MP depuis l'espace Live
  const [liveSearchQuery, setLiveSearchQuery] = useState('');
  const liveSearchInputRef = useRef<HTMLInputElement>(null);
  const stageInviteSearchInputRef = useRef<HTMLInputElement>(null);
  const [liveSearchResults, setLiveSearchResults] = useState<DirectChatTarget[]>([]);
  const [isSearchingInmates, setIsSearchingInmates] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!liveSearchQuery.trim()) {
      setLiveSearchResults([]);
      setIsSearchingInmates(false);
      return;
    }
    setIsSearchingInmates(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchInmates(liveSearchQuery);
        if (!cancelled) setLiveSearchResults(res);
      } finally {
        if (!cancelled) setIsSearchingInmates(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [liveSearchQuery, searchInmates]);

  useEffect(() => {
    let cancelled = false;
    if (!stageInviteSearch.trim()) {
      setStageInviteResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchInmates(stageInviteSearch);
      if (!cancelled) setStageInviteResults(res);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stageInviteSearch, searchInmates]);

  const currentLive: LiveSession | undefined = activeLives.find((l) => l.id === currentLiveId);
  const isHost = Boolean(
    currentLive &&
      (currentLive.hostId === user.id ||
        (Boolean(user.matricule) && currentLive.hostMatricule === user.matricule))
  );
  const isGuestOnStage = Boolean(
    currentLive?.guests?.some(
      (g) =>
        g.userId === user.id ||
        (Boolean(user.matricule) && g.matricule === user.matricule)
    )
  );
  const isParticipantOnScreen = Boolean(isHost || isGuestOnStage);

  const stopClipRecorderOnly = async (): Promise<{ ref: string; dur: number } | null> => {
    const rec = clipRecorderRef.current;
    if (!rec || rec.state === 'inactive') {
      setIsRecordingClip(false);
      setClipElapsedSec(0);
      return null;
    }

    return new Promise((resolve) => {
      rec.onstop = async () => {
        setIsRecordingClip(false);
        setClipElapsedSec(0);
        const dur = Math.max(1, Math.min(60, Math.round((Date.now() - clipStartRef.current) / 1000)));
        if (clipChunksRef.current.length === 0) {
          resolve(null);
          return;
        }
        try {
          const mime = (rec.mimeType || 'video/webm').split(';')[0].trim() || 'video/webm';
          const blob = new Blob(clipChunksRef.current, { type: mime });
          clipChunksRef.current = [];
          const ref = await saveMediaBlob(blob);
          resolve({ ref, dur });
        } catch {
          resolve(null);
        }
      };
      try {
        rec.stop();
      } catch {
        setIsRecordingClip(false);
        setClipElapsedSec(0);
        resolve(null);
      }
    });
  };

  const stopStream = () => {
    intentionalStreamStopRef.current = true;
    if (clipRecorderRef.current && clipRecorderRef.current.state !== 'inactive') {
      try {
        clipRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecordingClip(false);
    setClipElapsedSec(0);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (previewStudioVideoRef.current) {
      previewStudioVideoRef.current.srcObject = null;
    }
    setCamGranted(false);
    setIsLiveVideoPlaying(false);
  };

  const bindTrackUnexpectedEndRecovery = (stream: MediaStream) => {
    stream.getTracks().forEach((track) => {
      track.addEventListener(
        'ended',
        () => {
          if (intentionalStreamStopRef.current || !isParticipantOnScreenRef.current) return;
          if (trackRecoveryAttemptsRef.current >= 4) return;
          trackRecoveryAttemptsRef.current += 1;
          window.setTimeout(() => {
            if (intentionalStreamStopRef.current || !isParticipantOnScreenRef.current) return;
            if (track.kind === 'video' && camEnabledRef.current) {
              void attachCameraStream(facingModeRef.current);
            } else if (track.kind === 'audio' && !camEnabledRef.current && micEnabledRef.current) {
              void attachAudioOnlyStream();
            }
          }, 350);
        },
        { once: true }
      );
    });
  };

  const attachCameraStream = async (
    targetFacing: 'user' | 'environment' = facingMode,
    isCameraFlip = false
  ): Promise<boolean> => {
    intentionalStreamStopRef.current = false;
    setCamError(null);
    setCamRequesting(true);
    ensureBroadcasterAudioUnlocked();

    try {
      const previousStream = streamRef.current;
      const previousDeviceId = previousStream?.getVideoTracks?.()?.[0]?.getSettings?.()?.deviceId;
      const targetDeviceId = isCameraFlip
        ? await findCameraDeviceIdForFacing(targetFacing, previousDeviceId)
        : undefined;

      // On camera flip, release ONLY the video track before acquiring the opposite sensor (iOS/Android requirement)
      // so audio tracks & WebRTC peer connections remain active without cutting the Live!
      if (isCameraFlip && previousStream) {
        intentionalStreamStopRef.current = true;
        previousStream.getVideoTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
        intentionalStreamStopRef.current = false;
      }

      const result = await requestCameraAndMicStream({
        facingMode: targetFacing,
        withAudio: !previousStream || previousStream.getAudioTracks().every((t) => t.readyState === 'ended'),
        deviceId: targetDeviceId,
        strictFacing: isCameraFlip,
      });
      setCamRequesting(false);
      void getMediaPermissionsSummary().then(setPermSummary);

      if (!result.stream) {
        if (isCameraFlip) {
          const restoreFacing = targetFacing === 'environment' ? 'user' : 'environment';
          const restored = await requestCameraAndMicStream({
            facingMode: restoreFacing,
            withAudio: !previousStream || previousStream.getAudioTracks().every((t) => t.readyState === 'ended'),
          });
          if (restored.stream) {
            const keptAudio = (previousStream?.getAudioTracks() || []).filter((t) => t.readyState === 'live');
            const finalStream =
              restored.stream.getAudioTracks().length === 0 && keptAudio.length > 0
                ? new MediaStream([...restored.stream.getVideoTracks(), ...keptAudio])
                : restored.stream;
            streamRef.current = finalStream;
            bindTrackUnexpectedEndRecovery(finalStream);
            trackRecoveryAttemptsRef.current = 0;
            localMediaVersionRef.current += 1;
            setLocalMediaVersion(localMediaVersionRef.current);
            setCamGranted(true);
            setCamEnabled(true);
            setIsLiveVideoPlaying(true);
          }
          showToast({
            title: 'Caméra arrière indisponible',
            message: 'Une seule caméra détectée sur cet appareil : caméra actuelle conservée.',
            type: 'info',
          });
          return false;
        }
        setCamGranted(Boolean(previousStream && previousStream.getTracks().some((t) => t.readyState === 'live')));
        const errReason =
          result.errorMessage ||
          "Autorisation caméra requise : active la caméra dans les réglages du navigateur.";
        setCamError(errReason);
        if (result.errorCode === 'denied') {
          setShowPermissionHelp(true);
        }
        showToast({
          title: 'Accès caméra requis',
          message: errReason,
          type: 'warning',
        });
        return false;
      }

      // Preserve live audio track if new stream only acquired video (e.g. seamless flip without audio interruption)
      const liveAudioTracks = (previousStream?.getAudioTracks() || []).filter((t) => t.readyState === 'live');
      const nextStream =
        result.stream.getAudioTracks().length === 0 && liveAudioTracks.length > 0
          ? new MediaStream([...result.stream.getVideoTracks(), ...liveAudioTracks])
          : result.stream;

      // Clean up any replaced tracks from previous stream after new stream is ready
      if (previousStream && previousStream !== nextStream) {
        intentionalStreamStopRef.current = true;
        previousStream.getTracks().forEach((oldTrack) => {
          const stillUsed = nextStream.getTracks().includes(oldTrack);
          if (!stillUsed) {
            try {
              oldTrack.stop();
            } catch {
              // ignore
            }
          }
        });
        intentionalStreamStopRef.current = false;
      }

      streamRef.current = nextStream;
      nextStream.getVideoTracks().forEach((t) => {
        t.enabled = true;
      });
      nextStream.getAudioTracks().forEach((t) => {
        t.enabled = micEnabledRef.current;
      });
      bindTrackUnexpectedEndRecovery(nextStream);
      trackRecoveryAttemptsRef.current = 0;

      localMediaVersionRef.current += 1;
      setLocalMediaVersion(localMediaVersionRef.current);
      setCamGranted(true);
      setCamEnabled(true);
      setIsLiveVideoPlaying(true);
      setShowPermissionHelp(false);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          attachStreamToVideoElement(videoRef.current, nextStream);
        }
        if (previewStudioVideoRef.current) {
          attachStreamToVideoElement(previewStudioVideoRef.current, nextStream);
        }
      });

      return true;
    } catch (err) {
      setCamRequesting(false);
      const errMsg = (err as Error)?.message || "Impossible d'accéder à la caméra ou au micro.";
      setCamError(errMsg);
      showToast({
        title: 'Erreur d’accès caméra/micro',
        message: errMsg,
        type: 'warning',
      });
      return false;
    }
  };

  const attachAudioOnlyStream = async (): Promise<boolean> => {
    intentionalStreamStopRef.current = false;
    setCamError(null);
    ensureBroadcasterAudioUnlocked();
    const existingAudio = (streamRef.current?.getAudioTracks() || []).filter(
      (t) => t.readyState === 'live'
    );
    if (existingAudio.length > 0) {
      // Release video tracks cleanly while keeping the live microphone track
      intentionalStreamStopRef.current = true;
      streamRef.current?.getVideoTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      intentionalStreamStopRef.current = false;
      const audioStream = new MediaStream(existingAudio);
      audioStream.getAudioTracks().forEach((t) => {
        t.enabled = micEnabledRef.current;
      });
      streamRef.current = audioStream;
      localMediaVersionRef.current += 1;
      setLocalMediaVersion(localMediaVersionRef.current);
      return true;
    }

    setCamRequesting(true);
    try {
      const result = await requestAudioOnlyStream();
      setCamRequesting(false);
      void getMediaPermissionsSummary().then(setPermSummary);
      if (!result.stream) {
        if (result.errorMessage) {
          setCamError(result.errorMessage);
          if (result.errorCode === 'denied') setShowPermissionHelp(true);
          showToast({
            title: 'Accès micro requis',
            message: result.errorMessage,
            type: 'warning',
          });
        }
        return false;
      }
      if (streamRef.current) {
        intentionalStreamStopRef.current = true;
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
        intentionalStreamStopRef.current = false;
      }
      result.stream.getAudioTracks().forEach((t) => {
        t.enabled = micEnabledRef.current;
      });
      streamRef.current = result.stream;
      bindTrackUnexpectedEndRecovery(result.stream);
      trackRecoveryAttemptsRef.current = 0;
      localMediaVersionRef.current += 1;
      setLocalMediaVersion(localMediaVersionRef.current);
      setShowPermissionHelp(false);
      return true;
    } catch {
      setCamRequesting(false);
      return false;
    }
  };

  const leaveLiveSessionRef = useRef(leaveLiveSession);
  leaveLiveSessionRef.current = leaveLiveSession;

  useEffect(() => {
    void getMediaPermissionsSummary().then(setPermSummary);
    const unsubPerm = subscribeMediaPermissionChanges(setPermSummary);
    return () => {
      unsubPerm();
      if (joinedLiveIdRef.current) {
        leaveLiveSessionRef.current(joinedLiveIdRef.current);
        joinedLiveIdRef.current = null;
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      try {
        viewerWorkletNodeRef.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        viewerFallbackProcRef.current?.disconnect();
      } catch {
        // ignore
      }
      viewerWorkletNodeRef.current = null;
      viewerFallbackProcRef.current = null;
      viewerRingStateRef.current = null;
      if (viewerAudioCtxRef.current && viewerAudioCtxRef.current.state !== 'closed') {
        void viewerAudioCtxRef.current.close().catch(() => {});
      }
      viewerAudioCtxRef.current = null;
      viewerAudioInputRef.current = null;
      viewerAudioGainRef.current = null;
      if (broadcasterAudioCtxRef.current && broadcasterAudioCtxRef.current.state !== 'closed') {
        void broadcasterAudioCtxRef.current.close().catch(() => {});
      }
      broadcasterAudioCtxRef.current = null;
      stopStream();
    };
  }, []);

  // Attach stream ONLY when video element identity / grant / enable state changes
  const liveId = currentLive?.id;
  const liveStartedAt = currentLive?.startedAt;

  // Auto-open Live when clicked from notification / radar / invite / user aura
  useEffect(() => {
    if (!requestedLiveId) return;
    const target = activeLives.find((l) => l.id === requestedLiveId && l.isActive);
    if (!target) return;
    const isUserBlocked = Boolean(
      target.hostId !== user.id &&
        (target.blockedUserIds?.includes(user.id) ||
          (user.matricule && target.blockedUserIds?.includes(user.matricule)))
    );
    if (isUserBlocked) {
      setCurrentLiveId(null);
      setBlockedTerminatedLiveId(target.id);
      clearRequestedLive();
      return;
    }
    if (currentLiveId !== target.id) {
      setEndedSummary(null);
      setBlockedTerminatedLiveId(null);
      if (joinedLiveIdRef.current && joinedLiveIdRef.current !== target.id) {
        leaveLiveSession(joinedLiveIdRef.current);
      }
      if (target.hostId !== user.id) {
        joinLiveSession(target.id);
        joinedLiveIdRef.current = target.id;
      } else {
        joinedLiveIdRef.current = null;
      }
      setFloatingReactions([]);
      setCurrentLiveId(target.id);
    }
    if (autoJoinCoHostLiveId === target.id && !streamRef.current) {
      void attachCameraStream(facingMode);
    }
    clearRequestedLive();
  }, [
    requestedLiveId,
    autoJoinCoHostLiveId,
    activeLives,
    currentLiveId,
    user.id,
    user.matricule,
    joinLiveSession,
    leaveLiveSession,
    clearRequestedLive,
  ]);

  // Auto-reconnect host to their active running session when switching back to the Live tab
  useEffect(() => {
    if (currentLiveId) return;
    const myHostingLive = activeLives.find((l) => l.isActive && l.hostId === user.id);
    if (myHostingLive) {
      setCurrentLiveId(myHostingLive.id);
    }
  }, [activeLives, currentLiveId, user.id]);

  const activeLivesRef = useRef<LiveSession[]>(activeLives);
  activeLivesRef.current = activeLives;
  const isHostRef = useRef<boolean>(isHost);
  isHostRef.current = isHost;
  const isGuestOnStageRef = useRef<boolean>(isGuestOnStage);
  isGuestOnStageRef.current = isGuestOnStage;
  const isParticipantOnScreenRef = useRef<boolean>(isParticipantOnScreen);
  isParticipantOnScreenRef.current = isParticipantOnScreen;
  const endedSummaryRef = useRef(endedSummary);
  endedSummaryRef.current = endedSummary;

  const camEnabledRef = useRef<boolean>(camEnabled);
  camEnabledRef.current = camEnabled;
  const micEnabledRef = useRef<boolean>(micEnabled);
  micEnabledRef.current = micEnabled;
  const facingModeRef = useRef<'user' | 'environment'>(facingMode);
  facingModeRef.current = facingMode;
  const userMatriculeRef = useRef<string>(user.matricule);
  userMatriculeRef.current = user.matricule;
  const joinLiveRtcRoomRef = useRef(joinLiveRtcRoom);
  joinLiveRtcRoomRef.current = joinLiveRtcRoom;
  const leaveLiveRtcRoomRef = useRef(leaveLiveRtcRoom);
  leaveLiveRtcRoomRef.current = leaveLiveRtcRoom;
  const sendLiveRtcSignalRef = useRef(sendLiveRtcSignal);
  sendLiveRtcSignalRef.current = sendLiveRtcSignal;
  const sendLiveRelaySubscribeRef = useRef(sendLiveRelaySubscribe);
  sendLiveRelaySubscribeRef.current = sendLiveRelaySubscribe;
  const sendLiveRelayUnsubscribeRef = useRef(sendLiveRelayUnsubscribe);
  sendLiveRelayUnsubscribeRef.current = sendLiveRelayUnsubscribe;
  const sendLiveRelayMediaRef = useRef(sendLiveRelayMedia);
  sendLiveRelayMediaRef.current = sendLiveRelayMedia;
  const onLiveRtcEventRef = useRef(onLiveRtcEvent);
  onLiveRtcEventRef.current = onLiveRtcEvent;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const wasParticipantOnScreenRef = useRef<boolean>(false);
  const userPausedPreviewRef = useRef<boolean>(false);

  const ensureBroadcasterAudioUnlocked = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      let ctx = broadcasterAudioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioCtx({ latencyHint: 'interactive' });
        broadcasterAudioCtxRef.current = ctx;
      }
      const wakeSilent = (targetCtx: AudioContext) => {
        try {
          if (targetCtx.state === 'running') {
            const silentBuf = targetCtx.createBuffer(1, 1, 24000);
            const src = targetCtx.createBufferSource();
            src.buffer = silentBuf;
            src.connect(targetCtx.destination);
            src.start(0);
          }
        } catch {
          // ignore
        }
      };
      if (ctx.state === 'suspended') {
        const activeCtx = ctx;
        void activeCtx
          .resume()
          .then(() => wakeSilent(activeCtx))
          .catch(() => {});
      } else {
        wakeSilent(ctx);
      }
      return ctx;
    } catch {
      return null;
    }
  }, []);

  const resetViewerAudioRing = useCallback(() => {
    viewerNextAudioTimeRef.current = 0;
    if (viewerRingStateRef.current) {
      viewerRingStateRef.current.readIdx = 0;
      viewerRingStateRef.current.writeIdx = 0;
      viewerRingStateRef.current.filled = 0;
      viewerRingStateRef.current.primed = false;
      viewerRingStateRef.current.lastOut = 0;
    }
    try {
      viewerWorkletNodeRef.current?.port.postMessage({ type: 'flush' });
    } catch {
      // ignore
    }
  }, []);

  const ensureViewerAudioUnlocked = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      let ctx = viewerAudioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioCtx({ latencyHint: 'interactive' });
        viewerAudioCtxRef.current = ctx;
        const gain = ctx.createGain();
        gain.gain.value = viewerMutedRef.current ? 0 : 1.35;
        let inputNode: AudioNode = gain;
        if (typeof ctx.createDynamicsCompressor === 'function') {
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -16;
          compressor.knee.value = 14;
          compressor.ratio.value = 3.5;
          compressor.attack.value = 0.004;
          compressor.release.value = 0.16;
          compressor.connect(gain);
          inputNode = compressor;
        }
        gain.connect(ctx.destination);
        viewerAudioInputRef.current = inputNode;
        viewerAudioGainRef.current = gain;
        viewerNextAudioTimeRef.current = 0;

        // Continuous fallback ring buffer + immediate AudioWorklet upgrade for click-free, zero-stutter playout
        const sr = ctx.sampleRate || 48000;
        const cap = Math.max(48000, Math.round(sr * 3));
        const ringState = {
          ring: new Float32Array(cap),
          readIdx: 0,
          writeIdx: 0,
          filled: 0,
          primed: false,
          lastOut: 0,
          prebufferTarget: Math.round(sr * 0.095),
          maxBacklog: Math.round(sr * 0.45),
          trimTarget: Math.round(sr * 0.13),
        };
        viewerRingStateRef.current = ringState;

        if (typeof ctx.createScriptProcessor === 'function') {
          try {
            const proc = ctx.createScriptProcessor(1024, 0, 1);
            proc.onaudioprocess = (ev) => {
              const out = ev.outputBuffer.getChannelData(0);
              const rs = viewerRingStateRef.current;
              if (!rs || viewerWorkletNodeRef.current) {
                out.fill(0);
                return;
              }
              if (!rs.primed && rs.filled >= rs.prebufferTarget) {
                rs.primed = true;
              }
              const len = rs.ring.length;
              for (let i = 0; i < out.length; i++) {
                if (rs.primed && rs.filled > 0) {
                  const s = rs.ring[rs.readIdx];
                  rs.readIdx = (rs.readIdx + 1) % len;
                  rs.filled -= 1;
                  rs.lastOut = s;
                  out[i] = s;
                } else {
                  rs.primed = false;
                  rs.lastOut *= 0.90;
                  out[i] = rs.lastOut;
                }
              }
            };
            proc.connect(inputNode);
            viewerFallbackProcRef.current = proc;
          } catch {
            // ignore script processor fallback error
          }
        }

        if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
          try {
            const activeCtx = ctx;
            const blob = new Blob([VIEWER_RING_WORKLET_CODE], { type: 'application/javascript' });
            const modUrl = URL.createObjectURL(blob);
            void activeCtx.audioWorklet
              .addModule(modUrl)
              .then(() => {
                URL.revokeObjectURL(modUrl);
                if (viewerAudioCtxRef.current !== activeCtx || activeCtx.state === 'closed') return;
                const wNode = new AudioWorkletNode(activeCtx, 'evasion-live-audio-player', {
                  numberOfInputs: 0,
                  numberOfOutputs: 1,
                  outputChannelCount: [1],
                });
                wNode.connect(inputNode);
                viewerWorkletNodeRef.current = wNode;
                // Transfer any pre-buffered samples seamlessly to the off-main-thread worklet
                const rs = viewerRingStateRef.current;
                if (rs && rs.filled > 0) {
                  const carry = new Float32Array(rs.filled);
                  const len = rs.ring.length;
                  for (let i = 0; i < carry.length; i++) {
                    carry[i] = rs.ring[(rs.readIdx + i) % len];
                  }
                  rs.readIdx = 0;
                  rs.writeIdx = 0;
                  rs.filled = 0;
                  rs.primed = false;
                  wNode.port.postMessage(carry, [carry.buffer]);
                }
                if (viewerFallbackProcRef.current) {
                  try {
                    viewerFallbackProcRef.current.disconnect();
                  } catch {
                    // ignore
                  }
                  viewerFallbackProcRef.current = null;
                }
              })
              .catch(() => {
                URL.revokeObjectURL(modUrl);
              });
          } catch {
            // fallback ScriptProcessor ring buffer remains active
          }
        }

        ctx.onstatechange = () => {
          if (ctx && ctx.state === 'running') {
            setAudioOutputUnlocked(true);
            setViewerAudioBlocked(false);
            setAudioUnlockedTick((n) => n + 1);
          }
        };
      }
      if (viewerAudioGainRef.current) {
        viewerAudioGainRef.current.gain.value = viewerMutedRef.current ? 0 : 1.15;
      }
      // Play a silent 1-sample buffer inside user gesture to unlock mobile Safari/Chrome playback
      if (ctx.state === 'suspended') {
        try {
          const syncBuf = ctx.createBuffer(1, 1, 24000);
          const syncSrc = ctx.createBufferSource();
          syncSrc.buffer = syncBuf;
          syncSrc.connect(viewerAudioGainRef.current || ctx.destination);
          syncSrc.start(0);
        } catch {
          // ignore pre-resume pulse error
        }
        const activeCtx = ctx;
        void activeCtx
          .resume()
          .then(() => {
            setAudioOutputUnlocked(true);
            setViewerAudioBlocked(false);
            setAudioUnlockedTick((n) => n + 1);
            try {
              if (activeCtx.state === 'running') {
                const silentBuf = activeCtx.createBuffer(1, 1, 24000);
                const src = activeCtx.createBufferSource();
                src.buffer = silentBuf;
                src.connect(viewerAudioGainRef.current || activeCtx.destination);
                src.start(0);
              }
            } catch {
              // ignore silent unlock pulse error
            }
          })
          .catch(() => {});
      } else if (ctx.state === 'running') {
        setAudioOutputUnlocked(true);
        setViewerAudioBlocked(false);
        setAudioUnlockedTick((n) => n + 1);
      }
      return ctx;
    } catch {
      return null;
    }
  }, []);

  // Auto-attach studio camera preview seamlessly if permission was already granted by browser
  useEffect(() => {
    if (
      lobbyRoleTab !== 'broadcast' ||
      currentLiveId ||
      !camEnabled ||
      camRequesting ||
      camError ||
      userPausedPreviewRef.current ||
      streamRef.current
    ) {
      return;
    }
    if (permSummary.camera === 'granted') {
      void attachCameraStream(facingModeRef.current);
    }
  }, [lobbyRoleTab, currentLiveId, permSummary.camera, camEnabled, camRequesting, camError]);

  useEffect(() => {
    if (viewerAudioGainRef.current) {
      viewerAudioGainRef.current.gain.value = viewerMuted ? 0 : 1.15;
    }
    if (viewerMuted) {
      resetViewerAudioRing();
    }
  }, [viewerMuted, resetViewerAudioRing]);

  // Global tap/gesture listener while watching so viewer WebAudio + remote media always unlock on first interaction
  useEffect(() => {
    if (!currentLiveId || isParticipantOnScreen || viewerMuted) return;
    const onViewerGestureUnlock = () => {
      ensureViewerAudioUnlocked();
      window.dispatchEvent(new CustomEvent('evasion:viewer-unlock-media'));
      const container = stageContainerRef.current;
      if (!container) return;
      container.querySelectorAll('video, audio').forEach((node) => {
        const media = node as HTMLMediaElement;
        if (media.srcObject && media.srcObject !== streamRef.current) {
          media.muted = false;
          media.defaultMuted = false;
          media.removeAttribute('muted');
          media.volume = 1;
          media
            .play()
            .then(() => setViewerAudioBlocked(false))
            .catch(() => {});
        }
      });
    };
    window.addEventListener('click', onViewerGestureUnlock, { passive: true });
    window.addEventListener('touchend', onViewerGestureUnlock, { passive: true });
    return () => {
      window.removeEventListener('click', onViewerGestureUnlock);
      window.removeEventListener('touchend', onViewerGestureUnlock);
    };
  }, [currentLiveId, isParticipantOnScreen, viewerMuted, ensureViewerAudioUnlocked]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/rtc/ice-servers')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.iceServers) || data.iceServers.length === 0) {
          return;
        }
        rtcIceConfigRef.current = {
          ...DEFAULT_RTC_ICE_CONFIG,
          iceServers: data.iceServers,
        };
      })
      .catch(() => {
        // fallback to DEFAULT_RTC_ICE_CONFIG
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Real WebRTC Peer-to-Peer Mesh + automatic WebSocket Media Relay fallback
  // Depends ONLY on liveId + user.id so camera/mic, toasts, or profile updates NEVER tear down the room!
  useEffect(() => {
    if (!liveId) {
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      subscribedRelaySendersRef.current.clear();
      Object.values(relayAudioActivityTimersRef.current).forEach((id) => window.clearTimeout(id));
      relayAudioActivityTimersRef.current = {};
      setRemoteStreams({});
      setRemoteMediaStates({});
      setRelayFrames({});
      setRelayAudioActive({});
      setRelayNeeded(false);
      setViewerAudioBlocked(false);
      viewerNextAudioTimeRef.current = 0;
      leaveLiveRtcRoomRef.current();
      return;
    }

    const initialRole: 'host' | 'guest' | 'viewer' = isHostRef.current
      ? 'host'
      : isGuestOnStageRef.current
      ? 'guest'
      : 'viewer';
    if (typeof RTCPeerConnection === 'undefined') return;

    let disposed = false;
    const roomJoinedAtMs = Date.now();
    const watchdogTimers: number[] = [];

    const closePeer = (peerUserId: string) => {
      const existing = peerConnectionsRef.current.get(peerUserId);
      if (existing) {
        try {
          existing.close();
        } catch {
          // ignore
        }
        peerConnectionsRef.current.delete(peerUserId);
      }
      pendingIceCandidatesRef.current.delete(peerUserId);
      setRemoteStreams((prev) => {
        if (!prev[peerUserId]) return prev;
        const copy = { ...prev };
        delete copy[peerUserId];
        return copy;
      });
      setRemoteMediaStates((prev) => {
        if (!prev[peerUserId]) return prev;
        const copy = { ...prev };
        delete copy[peerUserId];
        return copy;
      });
    };

    const scheduleExponentialReconnect = (peerUserId: string) => {
      const attempts = (peerRetryMapRef.current.get(peerUserId) || 0) + 1;
      if (attempts > 30) {
        closePeer(peerUserId);
        return;
      }
      peerRetryMapRef.current.set(peerUserId, attempts);
      const delay = Math.min(4000, Math.round(350 * Math.pow(1.35, attempts - 1)));

      const t = window.setTimeout(() => {
        if (disposed || !activeLivesRef.current.some((l) => l.id === liveId)) return;
        const oldPc = peerConnectionsRef.current.get(peerUserId);
        if (oldPc && oldPc.connectionState === 'connected') return;
        if (oldPc) {
          try {
            oldPc.close();
          } catch {
            // ignore
          }
          peerConnectionsRef.current.delete(peerUserId);
        }
        if (isParticipantOnScreenRef.current) {
          void sendOfferToPeer(peerUserId);
        } else {
          sendLiveRtcSignalRef.current(liveId, peerUserId, 'request-offer', {
            forceFresh: true,
            ts: Date.now(),
          });
        }
      }, delay);
      watchdogTimers.push(t);
    };

    const ensurePeerConnection = (peerUserId: string, forceFresh = false) => {
      let pc = peerConnectionsRef.current.get(peerUserId);
      if (
        pc &&
        !forceFresh &&
        pc.signalingState !== 'closed' &&
        pc.connectionState !== 'failed' &&
        pc.iceConnectionState !== 'failed'
      ) {
        return pc;
      }
      if (pc) {
        try {
          pc.close();
        } catch {
          // ignore
        }
        peerConnectionsRef.current.delete(peerUserId);
        pendingIceCandidatesRef.current.delete(peerUserId);
      }
      pc = new RTCPeerConnection(rtcIceConfigRef.current);
      peerConnectionsRef.current.set(peerUserId, pc);

      if (isParticipantOnScreenRef.current && streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          if (track.readyState === 'live') {
            const sender = pc.addTrack(track, streamRef.current);
            applyLowLatencySenderParams(sender, track.kind);
          }
        }
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendLiveRtcSignalRef.current(liveId, peerUserId, 'ice', ev.candidate);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (!pc || disposed) return;
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          peerRetryMapRef.current.set(peerUserId, 0);
        } else if (pc.iceConnectionState === 'failed') {
          try {
            pc.restartIce?.();
          } catch {
            // ignore
          }
          scheduleExponentialReconnect(peerUserId);
        }
      };

      pc.ontrack = (ev) => {
        applyLowLatencyReceiverHint(ev.receiver, ev.track?.kind);
        if (ev.track) ev.track.enabled = true;
        peerRetryMapRef.current.set(peerUserId, 0);
        setRemoteStreams((prev) => {
          const existing = prev[peerUserId];
          const merged = new MediaStream();
          const seenIds = new Set<string>();
          const incoming = ev.streams?.[0]?.getTracks() || [];
          for (const t of [...incoming, ev.track]) {
            if (t && !seenIds.has(t.id) && t.readyState !== 'ended') {
              t.enabled = true;
              seenIds.add(t.id);
              merged.addTrack(t);
            }
          }
          if (existing) {
            for (const oldTrack of existing.getTracks()) {
              if (
                oldTrack.readyState !== 'ended' &&
                !seenIds.has(oldTrack.id) &&
                !merged.getTracks().some((nt) => nt.kind === oldTrack.kind)
              ) {
                merged.addTrack(oldTrack);
              }
            }
          }
          return { ...prev, [peerUserId]: merged };
        });
      };

      pc.onsignalingstatechange = () => {
        if (disposed || !pc) return;
        if (
          pc.signalingState === 'stable' &&
          pendingRenegotiatePeersRef.current.has(peerUserId)
        ) {
          pendingRenegotiatePeersRef.current.delete(peerUserId);
          void sendOfferToPeer(peerUserId);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === 'connected') {
          peerRetryMapRef.current.set(peerUserId, 0);
        } else if (pc?.connectionState === 'failed') {
          scheduleExponentialReconnect(peerUserId);
        } else if (pc?.connectionState === 'disconnected') {
          const t = window.setTimeout(() => {
            if (disposed) return;
            const currentPc = peerConnectionsRef.current.get(peerUserId);
            if (currentPc && currentPc.connectionState === 'disconnected') {
              scheduleExponentialReconnect(peerUserId);
            }
          }, 6000);
          watchdogTimers.push(t);
        } else if (pc?.connectionState === 'closed') {
          pendingRenegotiatePeersRef.current.delete(peerUserId);
          closePeer(peerUserId);
        }
      };

      return pc;
    };

    const flushQueuedIce = async (peerUserId: string, pc: RTCPeerConnection) => {
      const queued = pendingIceCandidatesRef.current.get(peerUserId);
      if (!queued || queued.length === 0) return;
      pendingIceCandidatesRef.current.delete(peerUserId);
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // ignore stale candidate
        }
      }
    };

    const sendMediaStateToPeer = (peerUserId: string) => {
      if (!isParticipantOnScreenRef.current) return;
      const hasLiveCam = Boolean(
        camEnabledRef.current &&
          streamRef.current?.getVideoTracks().some((t) => t.readyState === 'live')
      );
      const hasLiveMic = Boolean(
        micEnabledRef.current &&
          (!streamRef.current ||
            streamRef.current.getAudioTracks().length === 0 ||
            streamRef.current.getAudioTracks().some((t) => t.readyState === 'live'))
      );
      sendLiveRtcSignalRef.current(liveId, peerUserId, 'media-state', {
        camEnabled: hasLiveCam,
        micEnabled: hasLiveMic,
      });
    };

    const sendOfferToPeer = async (peerUserId: string, forceFresh = false) => {
      try {
        const pc = ensurePeerConnection(peerUserId, forceFresh);
        if (isParticipantOnScreenRef.current && streamRef.current) {
          const senders = pc.getSenders();
          for (const track of streamRef.current.getTracks()) {
            if (track.readyState !== 'live') continue;
            const match = senders.find((s) => s.track?.kind === track.kind);
            if (match) {
              if (match.track !== track) {
                try {
                  await match.replaceTrack(track);
                  applyLowLatencySenderParams(match, track.kind);
                } catch {
                  const s = pc.addTrack(track, streamRef.current);
                  applyLowLatencySenderParams(s, track.kind);
                }
              }
            } else {
              const s = pc.addTrack(track, streamRef.current);
              applyLowLatencySenderParams(s, track.kind);
            }
          }
        }
        if (pc.signalingState !== 'stable') {
          pendingRenegotiatePeersRef.current.add(peerUserId);
          return;
        }
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        sendLiveRtcSignalRef.current(liveId, peerUserId, 'offer', pc.localDescription);
        sendMediaStateToPeer(peerUserId);
      } catch {
        // ignore transient negotiation error
      }
    };

    const scheduleViewerRequestOffer = (senderId: string) => {
      if (isParticipantOnScreenRef.current) return;
      [1800, 4200, 7500].forEach((delayMs) => {
        const t = window.setTimeout(() => {
          if (disposed) return;
          const streamReady = remoteStreamsRef.current[senderId]
            ?.getTracks()
            .some((tr) => tr.readyState === 'live' && !tr.muted);
          const pc = peerConnectionsRef.current.get(senderId);
          const isHandshakingOrConnected = Boolean(
            pc &&
              (pc.connectionState === 'connected' ||
                pc.iceConnectionState === 'connected' ||
                pc.iceConnectionState === 'completed' ||
                (pc.connectionState === 'connecting' && delayMs < 6500) ||
                (pc.remoteDescription && pc.iceConnectionState === 'checking' && delayMs < 6500))
          );
          if (!streamReady && !isHandshakingOrConnected) {
            sendLiveRtcSignalRef.current(liveId, senderId, 'request-offer', {
              forceFresh: Boolean(pc && (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed')) || delayMs >= 7000,
              ts: Date.now(),
            });
          }
        }, delayMs);
        watchdogTimers.push(t);
      });
    };

    const syncViewerTransportHealth = () => {
      if (disposed) return;
      const liveObj = activeLivesRef.current.find((l) => l.id === liveId && l.isActive);
      if (!liveObj) return;
      const stageIds = [liveObj.hostId, ...(liveObj.guests || []).map((g) => g.userId)].filter(
        (id) =>
          id &&
          id !== user.id &&
          id !== userMatriculeRef.current &&
          !(isHostRef.current && id === liveObj.hostId)
      );
      for (const senderId of stageIds) {
        const stream = remoteStreamsRef.current[senderId];
        const pc = peerConnectionsRef.current.get(senderId);
        const iceReady = Boolean(
          pc &&
            (pc.iceConnectionState === 'connected' ||
              pc.iceConnectionState === 'completed' ||
              pc.connectionState === 'connected')
        );
        const mediaState = remoteMediaStatesRef.current[senderId];
        const expectsVideo = mediaState ? mediaState.camEnabled : true;
        const expectsAudio = mediaState ? mediaState.micEnabled : true;
        const hasUnmutedVideo = Boolean(
          stream?.getVideoTracks().some((tr) => tr.readyState === 'live' && !tr.muted)
        );
        const hasUnmutedAudio = Boolean(
          stream?.getAudioTracks().some((tr) => tr.readyState === 'live' && !tr.muted)
        );
        const videoOk = !expectsVideo || hasUnmutedVideo;
        const audioOk = !expectsAudio || hasUnmutedAudio;
        const nativeHealthy = iceReady && videoOk && audioOk && (hasUnmutedVideo || hasUnmutedAudio);

        if (nativeHealthy) {
          if (subscribedRelaySendersRef.current.has(senderId)) {
            subscribedRelaySendersRef.current.delete(senderId);
            sendLiveRelayUnsubscribeRef.current(liveId, senderId);
          }
        } else {
          if (!subscribedRelaySendersRef.current.has(senderId)) {
            subscribedRelaySendersRef.current.add(senderId);
            sendLiveRelaySubscribeRef.current(liveId, senderId);
          }
          const isFailed = Boolean(
            pc && (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed' || pc.connectionState === 'disconnected')
          );
          const needsInitialOffer =
            Date.now() - roomJoinedAtMs >= 1600 &&
            (!pc || (pc.connectionState === 'new' && !pc.remoteDescription));
          if (isFailed || needsInitialOffer) {
            sendLiveRtcSignalRef.current(liveId, senderId, 'request-offer', {
              forceFresh: isFailed,
              ts: Date.now(),
            });
          }
        }
      }
    };

    // Instant initial relay activation (~80ms if direct WebRTC hasn't rendered) + periodic recovery
    const initialRelayFallbackTimer = window.setTimeout(syncViewerTransportHealth, 80);
    watchdogTimers.push(initialRelayFallbackTimer);
    const viewerRecoveryTimer = window.setInterval(syncViewerTransportHealth, 2500);

    const unsubscribe = onLiveRtcEventRef.current(async (evt) => {
      const payload = evt.payload || {};
      if (payload.liveId !== liveId) return;

      if (evt.type === 'WS_RECONNECTED') {
        subscribedRelaySendersRef.current.clear();
        syncViewerTransportHealth();
        if (isParticipantOnScreenRef.current) {
          const localSt = streamRef.current;
          const hasLiveCam = Boolean(
            camEnabledRef.current && localSt?.getVideoTracks().some((t) => t.readyState === 'live')
          );
          const hasLiveMic = Boolean(
            micEnabledRef.current &&
              (!localSt ||
                localSt.getAudioTracks().length === 0 ||
                localSt.getAudioTracks().some((t) => t.readyState === 'live'))
          );
          sendLiveRtcSignalRef.current(liveId, '*', 'media-state', {
            camEnabled: hasLiveCam,
            micEnabled: hasLiveMic,
          });
        }
        return;
      }

      if (evt.type === 'LIVE_RTC_ROOM_PEERS') {
        const peers = (payload.peers || []) as { userId: string; role: string }[];
        for (const p of peers) {
          if (!p.userId || p.userId === user.id) continue;
          const peerIsSender = p.role === 'host' || p.role === 'guest';
          if (isParticipantOnScreenRef.current && (!peerIsSender || user.id > p.userId)) {
            void sendOfferToPeer(p.userId);
          } else if (peerIsSender) {
            scheduleViewerRequestOffer(p.userId);
          }
        }
      } else if (evt.type === 'LIVE_RTC_PEER_JOINED') {
        const peerId = String(payload.userId || '');
        const peerRole = String(payload.role || 'viewer');
        if (!peerId || peerId === user.id) return;
        const peerIsSender = peerRole === 'host' || peerRole === 'guest';
        if (isParticipantOnScreenRef.current && (!peerIsSender || user.id > peerId)) {
          const existing = peerConnectionsRef.current.get(peerId);
          const shouldReset = Boolean(
            existing &&
              (existing.connectionState === 'failed' ||
                existing.connectionState === 'closed' ||
                existing.iceConnectionState === 'failed')
          );
          void sendOfferToPeer(peerId, shouldReset);
        } else if (peerIsSender) {
          scheduleViewerRequestOffer(peerId);
        }
      } else if (evt.type === 'LIVE_RTC_PEER_LEFT') {
        const peerId = String(payload.userId || '');
        if (peerId) {
          const t = window.setTimeout(() => {
            if (disposed) return;
            const pc = peerConnectionsRef.current.get(peerId);
            // NEVER tear down an active P2P connection that is still connected or connecting!
            if (pc && (pc.connectionState === 'connected' || pc.connectionState === 'connecting')) {
              return;
            }
            if (
              !pc ||
              pc.connectionState === 'closed' ||
              pc.connectionState === 'failed' ||
              pc.connectionState === 'disconnected'
            ) {
              closePeer(peerId);
            }
          }, 12000);
          watchdogTimers.push(t);
        }
      } else if (evt.type === 'LIVE_USER_BLOCKED') {
        const targetId = String(payload.targetUserId || '');
        const targetMat = String(payload.targetMatricule || '');
        const blockedLive = String(payload.liveId || '');
        if (
          blockedLive === liveId &&
          !isHostRef.current &&
          ((targetId && targetId === user.id) || (targetMat && targetMat === userMatriculeRef.current))
        ) {
          peerConnectionsRef.current.forEach((pc) => pc.close());
          peerConnectionsRef.current.clear();
          pendingIceCandidatesRef.current.clear();
          subscribedRelaySendersRef.current.clear();
          relayAvailableSetRef.current.clear();
          relayFramesMapRef.current = {};
          setRemoteStreams({});
          setRemoteMediaStates({});
          setRelayFrames({});
          setRelayAudioActive({});
          setRelayNeeded(false);
          leaveLiveRtcRoomRef.current(liveId);
          stopStream();
          joinedLiveIdRef.current = null;
          setShowStageInviteModal(false);
          setShowViewersModerationModal(false);
          setIsCinemaMode(false);
          setBlockedTerminatedLiveId(liveId);
          setCurrentLiveId(null);
        }
      } else if (evt.type === 'LIVE_REACTION') {
        const reactionEmoji = String(payload.emoji || '❤️');
        const senderUid = String(payload.userId || '');
        if (senderUid !== user.id) {
          spawnFloatingEmojiRef.current(reactionEmoji);
        }
      } else if (evt.type === 'LIVE_RELAY_NEEDED') {
        if (isParticipantOnScreenRef.current) {
          setRelayNeeded(Boolean(payload.needed));
        }
      } else if (evt.type === 'LIVE_RELAY_MEDIA') {
        const fromUserId = String(payload.fromUserId || '');
        const fromHostId = String(payload.fromHostId || '');
        const senderKey = fromHostId || fromUserId;
        if (!senderKey || fromUserId === user.id) return;
        const mediaKind = payload.mediaKind === 'audio' ? 'audio' : 'video';
        const dataStr = typeof payload.data === 'string' ? payload.data : '';
        if (!dataStr) return;

        if (mediaKind === 'video') {
          if (dataStr === '__CAM_OFF__') {
            delete relayFramesMapRef.current[senderKey];
            relayAvailableSetRef.current.delete(senderKey);
            if (fromUserId) {
              delete relayFramesMapRef.current[fromUserId];
              relayAvailableSetRef.current.delete(fromUserId);
            }
            relayFrameListenersRef.current.get(senderKey)?.forEach((cb) => cb(null));
            if (fromUserId && fromUserId !== senderKey) {
              relayFrameListenersRef.current.get(fromUserId)?.forEach((cb) => cb(null));
            }
            setRelayFrames((prev) => {
              if (!prev[senderKey] && !prev[fromUserId]) return prev;
              const copy = { ...prev };
              delete copy[senderKey];
              if (fromUserId) delete copy[fromUserId];
              return copy;
            });
            setRemoteMediaStates((prev) => ({
              ...prev,
              [senderKey]: { camEnabled: false, micEnabled: prev[senderKey]?.micEnabled ?? true },
              ...(fromUserId && fromUserId !== senderKey
                ? { [fromUserId]: { camEnabled: false, micEnabled: prev[fromUserId]?.micEnabled ?? true } }
                : {}),
            }));
            return;
          }
          relayFramesMapRef.current[senderKey] = dataStr;
          if (fromUserId && fromUserId !== senderKey) {
            relayFramesMapRef.current[fromUserId] = dataStr;
          }
          relayFrameListenersRef.current.get(senderKey)?.forEach((cb) => cb(dataStr));
          if (fromUserId && fromUserId !== senderKey) {
            relayFrameListenersRef.current.get(fromUserId)?.forEach((cb) => cb(dataStr));
          }
          const needsAvailUpdate =
            !relayAvailableSetRef.current.has(senderKey) ||
            (fromUserId && fromUserId !== senderKey && !relayAvailableSetRef.current.has(fromUserId));
          if (needsAvailUpdate) {
            relayAvailableSetRef.current.add(senderKey);
            if (fromUserId) relayAvailableSetRef.current.add(fromUserId);
            setRelayFrames((prev) => {
              if (prev[senderKey] && (!fromUserId || prev[fromUserId])) return prev;
              const next = { ...prev, [senderKey]: '__AVAILABLE__' };
              if (fromUserId && fromUserId !== senderKey) {
                next[fromUserId] = '__AVAILABLE__';
              }
              return next;
            });
          }
          if (
            remoteMediaStatesRef.current[senderKey]?.camEnabled === false ||
            (fromUserId && remoteMediaStatesRef.current[fromUserId]?.camEnabled === false)
          ) {
            setRemoteMediaStates((prev) => ({
              ...prev,
              [senderKey]: { camEnabled: true, micEnabled: prev[senderKey]?.micEnabled ?? true },
              ...(fromUserId && fromUserId !== senderKey
                ? { [fromUserId]: { camEnabled: true, micEnabled: prev[fromUserId]?.micEnabled ?? true } }
                : {}),
            }));
          }
        } else {
          const liveObj = activeLivesRef.current.find((l) => l.id === liveId);
          const nativeStream =
            remoteStreamsRef.current[senderKey] ||
            remoteStreamsRef.current[fromUserId] ||
            (liveObj ? remoteStreamsRef.current[liveObj.hostId] : undefined);
          const nativePc =
            peerConnectionsRef.current.get(senderKey) ||
            peerConnectionsRef.current.get(fromUserId) ||
            (liveObj ? peerConnectionsRef.current.get(liveObj.hostId) : undefined);
          const nativeAudioFlowing = Boolean(
            !viewerAudioBlockedRef.current &&
              nativePc &&
              (nativePc.iceConnectionState === 'connected' ||
                nativePc.iceConnectionState === 'completed') &&
              nativeStream
                ?.getAudioTracks()
                .some((t) => t.readyState === 'live' && t.enabled && !t.muted)
          );
          if (nativeAudioFlowing) return;

          setRelayAudioActive((prev) => (prev[senderKey] ? prev : { ...prev, [senderKey]: true }));
          if (relayAudioActivityTimersRef.current[senderKey]) {
            window.clearTimeout(relayAudioActivityTimersRef.current[senderKey]);
          }
          relayAudioActivityTimersRef.current[senderKey] = window.setTimeout(() => {
            setRelayAudioActive((prev) => {
              if (!prev[senderKey]) return prev;
              const copy = { ...prev };
              delete copy[senderKey];
              return copy;
            });
          }, 2500);

          if (viewerMutedRef.current) return;
          const ctx = viewerAudioCtxRef.current || ensureViewerAudioUnlocked();
          if (!ctx) return;
          if (ctx.state === 'suspended') {
            void ctx
              .resume()
              .then(() => setViewerAudioBlocked(false))
              .catch(() => {
                setViewerAudioBlocked(true);
              });
            if (ctx.state === 'suspended') {
              setViewerAudioBlocked(true);
              return;
            }
          }
          const samples = decodeInt16Base64ToFloat32(dataStr);
          if (!samples || samples.length === 0) return;
          const rawSr = Number(payload.sampleRate) || 24000;
          const sr = Math.min(48000, Math.max(16000, rawSr));
          const resampled = resampleFloat32Linear(samples, sr, ctx.sampleRate || 48000);

          if (viewerWorkletNodeRef.current) {
            try {
              viewerWorkletNodeRef.current.port.postMessage(resampled, [resampled.buffer]);
              return;
            } catch {
              // fall through to ring buffer
            }
          }

          const rs = viewerRingStateRef.current;
          if (rs) {
            const len = rs.ring.length;
            for (let i = 0; i < resampled.length; i++) {
              rs.ring[rs.writeIdx] = resampled[i];
              rs.writeIdx = (rs.writeIdx + 1) % len;
              if (rs.filled < len) {
                rs.filled += 1;
              } else {
                rs.readIdx = (rs.readIdx + 1) % len;
              }
            }
            if (rs.filled > rs.maxBacklog) {
              const skip = rs.filled - rs.trimTarget;
              rs.readIdx = (rs.readIdx + skip) % len;
              rs.filled -= skip;
            }
            return;
          }

          try {
            const buffer = ctx.createBuffer(1, resampled.length, ctx.sampleRate || 48000);
            buffer.getChannelData(0).set(resampled);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const dest = viewerAudioInputRef.current || viewerAudioGainRef.current || ctx.destination;
            source.connect(dest);
            const now = ctx.currentTime;
            if (
              viewerNextAudioTimeRef.current < now ||
              viewerNextAudioTimeRef.current > now + 0.55
            ) {
              viewerNextAudioTimeRef.current = now + 0.08;
            }
            source.start(viewerNextAudioTimeRef.current);
            viewerNextAudioTimeRef.current += buffer.duration;
          } catch {
            // ignore audio playback decode error
          }
        }
      } else if (evt.type === 'LIVE_ENDED') {
        const endedId = String(payload.liveId || '');
        if (endedId === liveId && !isHostRef.current && !endedSummaryRef.current) {
          const endedLiveObj = activeLivesRef.current.find((l) => l.id === endedId);
          setJustEndedNotice({
            title: endedLiveObj?.title || 'Ce Live',
            endedAt: Date.now(),
          });
          peerConnectionsRef.current.forEach((pc) => pc.close());
          peerConnectionsRef.current.clear();
          pendingIceCandidatesRef.current.clear();
          subscribedRelaySendersRef.current.clear();
          setRemoteStreams({});
          setRemoteMediaStates({});
          setRelayFrames({});
          setRelayAudioActive({});
          setRelayNeeded(false);
          stopStream();
          setShowStageInviteModal(false);
          setShowViewersModerationModal(false);
          setIsCinemaMode(false);
          setCurrentLiveId(null);
          showToastRef.current({
            title: 'Live terminé 🎬',
            message: 'L’hôte a mis fin à la diffusion en direct.',
            type: 'info',
          });
        }
      } else if (evt.type === 'LIVE_RTC_SIGNAL') {
        const fromUserId = String(payload.fromUserId || '');
        if (!fromUserId || fromUserId === user.id) return;
        const signalType = payload.signalType;
        const data = payload.data;

        try {
          if (signalType === 'request-offer') {
            if (isParticipantOnScreenRef.current) {
              const reqData = (data && typeof data === 'object' ? data : {}) as {
                forceFresh?: boolean;
              };
              const existing = peerConnectionsRef.current.get(fromUserId);
              const isActivelyHandshaking = Boolean(
                existing &&
                  (existing.connectionState === 'connected' ||
                    existing.connectionState === 'connecting' ||
                    existing.iceConnectionState === 'checking' ||
                    existing.iceConnectionState === 'connected' ||
                    existing.signalingState === 'have-local-offer' ||
                    existing.iceGatheringState === 'gathering')
              );
              if (isActivelyHandshaking && !reqData.forceFresh) {
                return;
              }
              const forceFresh = Boolean(
                reqData.forceFresh ||
                  (existing &&
                    (existing.connectionState === 'failed' ||
                      existing.connectionState === 'closed' ||
                      existing.iceConnectionState === 'failed'))
              );
              void sendOfferToPeer(fromUserId, forceFresh);
            }
          } else if (signalType === 'media-state' && data && typeof data === 'object') {
            const state = data as { camEnabled?: boolean; micEnabled?: boolean };
            setRemoteMediaStates((prev) => ({
              ...prev,
              [fromUserId]: {
                camEnabled: state.camEnabled !== false,
                micEnabled: state.micEnabled !== false,
              },
            }));
          } else if (signalType === 'offer' && data) {
            const pc = ensurePeerConnection(fromUserId);
            if (pc.signalingState !== 'stable') {
              const isPolite = !isParticipantOnScreenRef.current || user.id < fromUserId;
              if (!isPolite) return;
              await pc.setLocalDescription({ type: 'rollback' });
            }
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            await flushQueuedIce(fromUserId, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendLiveRtcSignalRef.current(liveId, fromUserId, 'answer', pc.localDescription);
            if (isParticipantOnScreenRef.current) {
              sendMediaStateToPeer(fromUserId);
            }
          } else if (signalType === 'answer' && data) {
            const pc = peerConnectionsRef.current.get(fromUserId);
            if (pc && pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
              await flushQueuedIce(fromUserId, pc);
            }
          } else if (signalType === 'ice' && data) {
            const pc = ensurePeerConnection(fromUserId);
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(data));
            } else {
              const queue = pendingIceCandidatesRef.current.get(fromUserId) || [];
              queue.push(data as RTCIceCandidateInit);
              pendingIceCandidatesRef.current.set(fromUserId, queue.slice(-40));
            }
          }
        } catch {
          // ignore stale WebRTC signal
        }
      }
    });

    joinLiveRtcRoomRef.current(liveId, initialRole);

    return () => {
      disposed = true;
      window.clearInterval(viewerRecoveryTimer);
      watchdogTimers.forEach((t) => window.clearTimeout(t));
      unsubscribe();
      peerConnectionsRef.current.forEach((pc) => {
        try {
          pc.close();
        } catch {
          // ignore
        }
      });
      peerConnectionsRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      subscribedRelaySendersRef.current.clear();
      relayAvailableSetRef.current.clear();
      Object.values(relayAudioActivityTimersRef.current).forEach((id) => window.clearTimeout(id));
      relayAudioActivityTimersRef.current = {};
      setRemoteStreams({});
      setRemoteMediaStates({});
      relayFramesMapRef.current = {};
      setRelayFrames({});
      setRelayAudioActive({});
      setRelayNeeded(false);
      setViewerAudioBlocked(false);
      resetViewerAudioRing();
      leaveLiveRtcRoomRef.current(liveId);
    };
  }, [liveId, user.id, ensureViewerAudioUnlocked, resetViewerAudioRing]);

  // Upgrade OR cleanly downgrade role if promoted/demoted on stage without leaving the Live
  useEffect(() => {
    if (!liveId) {
      wasParticipantOnScreenRef.current = false;
      return;
    }
    const wasOnStage = wasParticipantOnScreenRef.current;
    wasParticipantOnScreenRef.current = isParticipantOnScreen;

    if (isHost || isGuestOnStage) {
      joinLiveRtcRoomRef.current(liveId, isHost ? 'host' : 'guest');
    } else if (wasOnStage && !isParticipantOnScreen) {
      // Guest stepped down or was removed by host: turn off local camera/mic immediately & rejoin as pure viewer
      stopStream();
      peerConnectionsRef.current.forEach((pc, peerId) => {
        try {
          pc.getSenders().forEach((sender) => {
            if (sender.track) {
              try {
                pc.removeTrack(sender);
              } catch {
                // ignore
              }
            }
          });
        } catch {
          // ignore
        }
        sendLiveRtcSignalRef.current(liveId, peerId, 'media-state', {
          camEnabled: false,
          micEnabled: false,
        });
      });
      joinLiveRtcRoomRef.current(liveId, 'viewer');
    }
  }, [liveId, isHost, isGuestOnStage, isParticipantOnScreen]);

  // Auto-reacquire local camera/audio if mobile OS killed hardware tracks during background switch / phone call
  useEffect(() => {
    if (!liveId || !isParticipantOnScreen) return;
    let restoring = false;

    const checkAndRestoreTracks = async () => {
      if (restoring || document.visibilityState !== 'visible') return;
      if (!isParticipantOnScreenRef.current) return;
      const curStream = streamRef.current;
      if (!curStream) return;

      const needsVideoRestore =
        camEnabledRef.current &&
        curStream.getVideoTracks().every((t) => t.readyState === 'ended');
      const needsAudioRestore =
        !camEnabledRef.current &&
        micEnabledRef.current &&
        curStream.getAudioTracks().every((t) => t.readyState === 'ended');

      if (!needsVideoRestore && !needsAudioRestore) return;
      restoring = true;
      try {
        if (needsVideoRestore) {
          await attachCameraStream(facingModeRef.current);
        } else if (needsAudioRestore) {
          await attachAudioOnlyStream();
        }
      } finally {
        restoring = false;
      }
    };

    const onResume = () => {
      window.setTimeout(() => {
        void checkAndRestoreTracks();
      }, 350);
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [liveId, isParticipantOnScreen]);

  // Push newly acquired local tracks & media-state into all existing peer connections & renegotiate smoothly without cutting the Live
  useEffect(() => {
    if (!liveId || !isParticipantOnScreen) return;
    const localStream = streamRef.current;
    const hasLiveCam = Boolean(
      camEnabled && localStream?.getVideoTracks().some((t) => t.readyState === 'live')
    );
    const hasLiveMic = Boolean(
      micEnabled &&
        (!localStream ||
          localStream.getAudioTracks().length === 0 ||
          localStream.getAudioTracks().some((t) => t.readyState === 'live'))
    );

    void (async () => {
      // Room-wide media-state sync so Relay-only viewers also get immediate cam/mic status updates
      sendLiveRtcSignalRef.current(liveId, '*', 'media-state', {
        camEnabled: hasLiveCam,
        micEnabled: hasLiveMic,
      });
      if (!hasLiveCam && relayNeeded) {
        sendLiveRelayMediaRef.current(liveId, {
          mediaKind: 'video',
          data: '__CAM_OFF__',
        });
      }
      for (const [peerUserId, pc] of peerConnectionsRef.current.entries()) {
        sendLiveRtcSignalRef.current(liveId, peerUserId, 'media-state', {
          camEnabled: hasLiveCam,
          micEnabled: hasLiveMic,
        });
        if (!localStream) continue;
        try {
          const senders = pc.getSenders();
          const transceivers = pc.getTransceivers();
          let needsRenegotiate = false;
          for (const track of localStream.getTracks()) {
            if (track.readyState !== 'live') continue;
            const matchingTransceiver = transceivers.find(
              (t) =>
                t.sender.track?.kind === track.kind ||
                (!t.sender.track && t.receiver.track?.kind === track.kind)
            );
            const matchingSender =
              matchingTransceiver?.sender ||
              senders.find((s) => s.track?.kind === track.kind);

            if (matchingSender) {
              const hadNoTrackBefore = !matchingSender.track;
              if (matchingSender.track !== track) {
                try {
                  await matchingSender.replaceTrack(track);
                  applyLowLatencySenderParams(matchingSender, track.kind);
                } catch {
                  try {
                    pc.removeTrack(matchingSender);
                  } catch {
                    // ignore
                  }
                  const sender = pc.addTrack(track, localStream);
                  applyLowLatencySenderParams(sender, track.kind);
                  needsRenegotiate = true;
                }
              }
              if (
                matchingTransceiver &&
                matchingTransceiver.direction !== 'sendrecv' &&
                matchingTransceiver.direction !== 'sendonly'
              ) {
                matchingTransceiver.direction = 'sendrecv';
                needsRenegotiate = true;
              } else if (hadNoTrackBefore) {
                needsRenegotiate = true;
              }
            } else {
              const sender = pc.addTrack(track, localStream);
              applyLowLatencySenderParams(sender, track.kind);
              needsRenegotiate = true;
            }
          }
          if (needsRenegotiate) {
            if (pc.signalingState === 'stable') {
              pendingRenegotiatePeersRef.current.delete(peerUserId);
              const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
              await pc.setLocalDescription(offer);
              sendLiveRtcSignalRef.current(liveId, peerUserId, 'offer', pc.localDescription);
            } else {
              pendingRenegotiatePeersRef.current.add(peerUserId);
            }
          }
        } catch {
          pendingRenegotiatePeersRef.current.add(peerUserId);
        }
      }
    })();
  }, [liveId, isParticipantOnScreen, camEnabled, micEnabled, localMediaVersion, relayNeeded]);

  const liveAudioTrackId =
    streamRef.current?.getAudioTracks().find((t) => t.readyState === 'live')?.id || '';

  // Broadcaster Relay Video Encoder: decoupled from mic so audio never glitches when toggling or flipping camera
  useEffect(() => {
    if (!liveId || !isParticipantOnScreen || !relayNeeded || !camEnabled) return;
    const localStream = streamRef.current;
    if (!localStream) return;
    const hasLiveVideo = localStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
    if (!hasLiveVideo) return;

    let disposed = false;
    let captureVideo: HTMLVideoElement | null = null;
    let canvas: HTMLCanvasElement | null = null;

    captureVideo = document.createElement('video');
    captureVideo.muted = true;
    captureVideo.playsInline = true;
    captureVideo.setAttribute('playsinline', 'true');
    captureVideo.setAttribute('webkit-playsinline', 'true');
    captureVideo.setAttribute('aria-hidden', 'true');
    captureVideo.style.cssText =
      'position:fixed;left:0;top:0;width:120px;height:90px;opacity:0.001;pointer-events:none;z-index:-1;';
    document.body.appendChild(captureVideo);
    captureVideo.srcObject = new MediaStream(localStream.getVideoTracks());
    captureVideo.play().catch(() => {});
    canvas = document.createElement('canvas');
    const ctx2d = canvas.getContext('2d');
    let useWebp = true;
    let warmupSkipped = 0;
    let skipNextFrame = false;

    const videoTimer = window.setInterval(() => {
      if (disposed || !canvas || !ctx2d) return;
      if (skipNextFrame) {
        skipNextFrame = false;
        return;
      }
      const visibleLocalVideo = document.querySelector(
        'video[data-local-stage-video="true"]'
      ) as HTMLVideoElement | null;
      const sourceEl =
        visibleLocalVideo && visibleLocalVideo.readyState >= 2 && visibleLocalVideo.videoWidth > 0
          ? visibleLocalVideo
          : captureVideo;
      if (!sourceEl || sourceEl.readyState < 2 || sourceEl.videoWidth === 0 || sourceEl.videoHeight === 0) {
        return;
      }
      const maxSide = 512;
      const vw = sourceEl.videoWidth;
      const vh = sourceEl.videoHeight;
      const scale = Math.min(1, maxSide / Math.max(vw, vh));
      const w = Math.max(2, Math.round(vw * scale));
      const h = Math.max(2, Math.round(vh * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx2d.drawImage(sourceEl, 0, 0, w, h);

      // Guard only against initial hardware camera black warmup frames (never freeze dark rooms indefinitely)
      if (warmupSkipped < 8) {
        try {
          let hasNonBlackPixel = false;
          const rowFractions = [0.25, 0.5, 0.75];
          for (const frac of rowFractions) {
            const rowData = ctx2d.getImageData(0, Math.min(h - 1, Math.floor(h * frac)), w, 1).data;
            for (let px = 0; px < rowData.length; px += 16) {
              if (rowData[px] > 6 || rowData[px + 1] > 6 || rowData[px + 2] > 6) {
                hasNonBlackPixel = true;
                break;
              }
            }
            if (hasNonBlackPixel) break;
          }
          if (!hasNonBlackPixel) {
            warmupSkipped += 1;
            return;
          }
        } catch {
          // ignore readback restriction if any
        }
      }

      let dataUrl = '';
      if (useWebp) {
        dataUrl = canvas.toDataURL('image/webp', 0.68);
        if (!dataUrl.startsWith('data:image/webp')) {
          useWebp = false;
          dataUrl = canvas.toDataURL('image/jpeg', 0.70);
        }
      } else {
        dataUrl = canvas.toDataURL('image/jpeg', 0.70);
      }
      if (dataUrl && dataUrl.length <= 260_000) {
        const sent = sendLiveRelayMediaRef.current(liveId, {
          mediaKind: 'video',
          data: dataUrl,
          w,
          h,
        });
        if (!sent) {
          skipNextFrame = true;
        }
      }
    }, 55);

    return () => {
      disposed = true;
      window.clearInterval(videoTimer);
      if (captureVideo) {
        try {
          captureVideo.pause();
          captureVideo.srcObject = null;
          captureVideo.remove();
        } catch {
          // ignore
        }
      }
    };
  }, [liveId, isParticipantOnScreen, relayNeeded, camEnabled, localMediaVersion]);

  // Broadcaster Relay Audio Encoder: stays alive uninterrupted across camera toggles and camera flips
  useEffect(() => {
    if (!liveId || !isParticipantOnScreen || !relayNeeded || !micEnabled) return;
    const localStream = streamRef.current;
    if (!localStream) return;
    const hasLiveAudio = localStream.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled);
    if (!hasLiveAudio) return;

    let disposed = false;
    let audioCtx: AudioContext | null = null;
    let audioSource: MediaStreamAudioSourceNode | null = null;
    let audioProc: ScriptProcessorNode | null = null;
    let zeroGain: GainNode | null = null;
    let resumeAudioListener: (() => void) | null = null;
    let captureWorkletNode: AudioWorkletNode | null = null;

    audioCtx = broadcasterAudioCtxRef.current || ensureBroadcasterAudioUnlocked();
    if (audioCtx) {
      try {
        if (audioCtx.state === 'suspended') {
          void audioCtx.resume().catch(() => {});
          resumeAudioListener = () => {
            if (audioCtx && audioCtx.state === 'suspended') {
              void audioCtx.resume().catch(() => {});
            }
          };
          window.addEventListener('click', resumeAudioListener, { passive: true });
          window.addEventListener('touchend', resumeAudioListener, { passive: true });
          window.addEventListener('keydown', resumeAudioListener, { passive: true });
        }
        const audioOnlyStream = new MediaStream(localStream.getAudioTracks());
        audioSource = audioCtx.createMediaStreamSource(audioOnlyStream);
        zeroGain = audioCtx.createGain();
        zeroGain.gain.value = 0.0001;
        const srcSampleRate = audioCtx.sampleRate || 48000;
        const outRate = Math.min(24000, srcSampleRate);
        const emitAudioChunk = (inputData: Float32Array) => {
          if (disposed || !micEnabledRef.current || !inputData || inputData.length === 0) return;
          const encoded = downsampleFloatToInt16Base64(inputData, srcSampleRate, outRate);
          if (encoded) {
            sendLiveRelayMediaRef.current(liveId, {
              mediaKind: 'audio',
              data: encoded,
              sampleRate: outRate,
            });
          }
        };

        audioProc = audioCtx.createScriptProcessor(1024, 1, 1);
        audioProc.onaudioprocess = (ev) => {
          if (captureWorkletNode) return;
          emitAudioChunk(ev.inputBuffer.getChannelData(0));
        };
        audioSource.connect(audioProc);
        audioProc.connect(zeroGain);
        zeroGain.connect(audioCtx.destination);

        if (audioCtx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
          try {
            const blob = new Blob([BROADCASTER_CAPTURE_WORKLET_CODE], { type: 'application/javascript' });
            const modUrl = URL.createObjectURL(blob);
            void audioCtx.audioWorklet
              .addModule(modUrl)
              .then(() => {
                URL.revokeObjectURL(modUrl);
                if (disposed || !audioCtx || audioCtx.state === 'closed' || !audioSource || !zeroGain) {
                  return;
                }
                const wNode = new AudioWorkletNode(audioCtx, 'evasion-live-audio-capture', {
                  numberOfInputs: 1,
                  numberOfOutputs: 1,
                  channelCount: 1,
                });
                wNode.port.onmessage = (ev) => {
                  if (ev.data instanceof Float32Array) {
                    emitAudioChunk(ev.data);
                  }
                };
                captureWorkletNode = wNode;
                audioSource.connect(wNode);
                wNode.connect(zeroGain);
                try {
                  audioProc?.disconnect();
                } catch {
                  // ignore
                }
                audioProc = null;
              })
              .catch(() => {
                URL.revokeObjectURL(modUrl);
              });
          } catch {
            // fallback ScriptProcessor remains active
          }
        }
      } catch {
        // ignore relay audio capture failure
      }
    }

    return () => {
      disposed = true;
      if (resumeAudioListener) {
        window.removeEventListener('click', resumeAudioListener);
        window.removeEventListener('touchend', resumeAudioListener);
        window.removeEventListener('keydown', resumeAudioListener);
      }
      try {
        captureWorkletNode?.disconnect();
        audioProc?.disconnect();
        audioSource?.disconnect();
        zeroGain?.disconnect();
      } catch {
        // ignore
      }
    };
  }, [liveId, isParticipantOnScreen, relayNeeded, micEnabled, liveAudioTrackId, ensureBroadcasterAudioUnlocked]);

  useEffect(() => {
    const attachLocal = () => {
      if (streamRef.current) {
        if (videoRef.current) {
          attachStreamToVideoElement(videoRef.current, streamRef.current);
        }
        if (previewStudioVideoRef.current) {
          attachStreamToVideoElement(previewStudioVideoRef.current, streamRef.current);
        }
      }
    };
    attachLocal();
    requestAnimationFrame(attachLocal);
    const timer = setTimeout(attachLocal, 100);
    return () => clearTimeout(timer);
  }, [liveId, isHost, camEnabled, camGranted, localMediaVersion]);

  // Live duration timer (depends strictly on liveId & startedAt so likes never reset timer)
  useEffect(() => {
    if (!liveId || !liveStartedAt) {
      setElapsedSec(0);
      return;
    }
    const updateTimer = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - liveStartedAt) / 1000)));
    };
    updateTimer();
    const interval = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(interval);
  }, [liveId, liveStartedAt]);

  // Recording clip 60-second timer + clean auto-stop
  useEffect(() => {
    if (!isRecordingClip) return;
    const interval = window.setInterval(() => {
      const sec = Math.floor((Date.now() - clipStartRef.current) / 1000);
      setClipElapsedSec(Math.min(60, Math.max(0, sec)));
      if (sec >= 60) {
        window.clearInterval(interval);
        stopClipRecorderOnly().then(async (saved) => {
          if (saved) {
            await downloadMediaAsset(saved.ref, `evasion_live_${Date.now()}`);
            showToast({
              title: 'Extrait 60s enregistré & téléchargé ! 🎬',
              message: 'Limite maximale de 1 minute atteinte : vidéo sauvegardée.',
              type: 'success',
            });
          }
        });
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [isRecordingClip, showToast]);

  // Auto scroll chat smoothly inside its own container without moving the outer viewport
  const commentsCount = currentLive?.comments.length || 0;
  useEffect(() => {
    const parent = commentsEndRef.current?.parentElement;
    if (parent) {
      parent.scrollTo({ top: parent.scrollHeight, behavior: 'smooth' });
    }
  }, [commentsCount]);

  const spawnFloatingEmoji = (emoji: string) => {
    const id = `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const offsetClass = FLOATING_OFFSET_CLASSES[Math.floor(Math.random() * FLOATING_OFFSET_CLASSES.length)];
    setFloatingReactions((prev) => [...prev.slice(-14), { id, emoji, offsetClass }]);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
    }, 1500);
  };
  const spawnFloatingEmojiRef = useRef(spawnFloatingEmoji);
  spawnFloatingEmojiRef.current = spawnFloatingEmoji;

  const triggerLiveGiftAnimation = (
    giftType: GiftKind,
    senderName: string,
    senderAvatar: string
  ) => {
    const cfg = LIVE_GIFT_CONFIG[giftType];
    if (!cfg) return;

    // Spawn a burst of floating gift icons on screen
    [0, 140, 280, 420].forEach((delay) => {
      window.setTimeout(() => {
        spawnFloatingEmoji(cfg.emoji);
      }, delay);
    });

    const now = Date.now();
    const bannerId = `gift_${now}_${Math.random().toString(36).slice(2, 6)}`;

    setActiveGiftBanners((prev) => {
      const existingIdx = prev.findIndex(
        (b) => b.senderName === senderName && b.giftType === giftType
      );
      if (existingIdx !== -1) {
        const updated = [...prev];
        const nextCombo = updated[existingIdx].combo + 1;
        const item: LiveGiftBannerItem = {
          ...updated[existingIdx],
          id: bannerId,
          combo: nextCombo,
          timestamp: now,
        };
        updated[existingIdx] = item;
        setCenterGiftBurst(item);
        return updated;
      }
      const newItem: LiveGiftBannerItem = {
        id: bannerId,
        giftType,
        senderName,
        senderAvatar: senderAvatar || '⛓️',
        combo: 1,
        timestamp: now,
      };
      setCenterGiftBurst(newItem);
      return [...prev.slice(-2), newItem];
    });

    if (giftBurstTimeoutRef.current) {
      window.clearTimeout(giftBurstTimeoutRef.current);
    }
    giftBurstTimeoutRef.current = window.setTimeout(() => {
      setCenterGiftBurst(null);
    }, 2400);

    window.setTimeout(() => {
      setActiveGiftBanners((prev) => prev.filter((b) => Date.now() - b.timestamp < 3200));
    }, 3300);
  };

  // Track likesCount increments so remote ❤️ reactions also spawn floating hearts on screen
  const prevLikesCountRef = useRef<{ liveId: string; count: number } | null>(null);
  useEffect(() => {
    if (!currentLive) {
      prevLikesCountRef.current = null;
      return;
    }
    const prev = prevLikesCountRef.current;
    if (prev && prev.liveId === currentLive.id && currentLive.likesCount > prev.count) {
      const diff = Math.min(3, currentLive.likesCount - prev.count);
      for (let i = 0; i < diff; i += 1) {
        window.setTimeout(() => spawnFloatingEmoji('❤️'), i * 90);
      }
    }
    prevLikesCountRef.current = { liveId: currentLive.id, count: currentLive.likesCount };
  }, [currentLive?.id, currentLive?.likesCount]);

  // Clear stale ended notice whenever activeLives becomes non-empty or host launches a Live
  useEffect(() => {
    if (activeLives.length > 0 && justEndedNotice) {
      setJustEndedNotice(null);
    }
  }, [activeLives.length, justEndedNotice]);

  // Watch live comments for incoming gifts (🔑, 🔒, 🍦, 💧, 🥫) so both host and viewers see the on-screen gift animation
  useEffect(() => {
    if (!currentLive) {
      trackedLiveIdForGiftsRef.current = null;
      seenGiftCommentIdsRef.current.clear();
      setActiveGiftBanners([]);
      setCenterGiftBurst(null);
      return;
    }

    if (trackedLiveIdForGiftsRef.current !== currentLive.id) {
      trackedLiveIdForGiftsRef.current = currentLive.id;
      seenGiftCommentIdsRef.current = new Set(currentLive.comments.map((c) => c.id));
      setActiveGiftBanners([]);
      setCenterGiftBurst(null);
      return;
    }

    for (const c of currentLive.comments) {
      if (seenGiftCommentIdsRef.current.has(c.id)) continue;
      seenGiftCommentIdsRef.current.add(c.id);
      if (
        c.type === 'key_gift' ||
        c.type === 'padlock' ||
        c.type === 'ice_cone' ||
        c.type === 'water_bottle' ||
        c.type === 'canned_food'
      ) {
        triggerLiveGiftAnimation(c.type, c.authorName, c.authorAvatar || '⛓️');
      }
    }
  }, [currentLive]);

  const handleJoinExistingLive = (live: LiveSession) => {
    ensureViewerAudioUnlocked();
    const isBlockedInTarget = Boolean(
      live.hostId !== user.id &&
        (live.blockedUserIds?.includes(user.id) ||
          (user.matricule && live.blockedUserIds?.includes(user.matricule)))
    );
    if (isBlockedInTarget) {
      stopStream();
      setEndedSummary(null);
      setCurrentLiveId(null);
      setBlockedTerminatedLiveId(live.id);
      return;
    }
    setEndedSummary(null);
    setBlockedTerminatedLiveId(null);
    if (joinedLiveIdRef.current && joinedLiveIdRef.current !== live.id) {
      leaveLiveSession(joinedLiveIdRef.current);
      joinedLiveIdRef.current = null;
    }
    if (live.hostId !== user.id) {
      joinLiveSession(live.id);
      joinedLiveIdRef.current = live.id;
    } else {
      joinedLiveIdRef.current = null;
    }
    setFloatingReactions([]);
    setCurrentLiveId(live.id);
  };

  const currentLiveIndex = currentLive ? activeLives.findIndex((l) => l.id === currentLive.id) : -1;

  const handleCycleLive = (delta: 1 | -1) => {
    if (activeLives.length <= 1) return;
    if (isHost) {
      showToast({
        title: 'Tu es actuellement en direct',
        message: 'Termine d’abord ton Live (bouton Fin) avant de défiler entre les autres Lives.',
        type: 'info',
      });
      return;
    }
    const baseIdx = currentLiveIndex >= 0 ? currentLiveIndex : 0;
    const nextIdx = (baseIdx + delta + activeLives.length) % activeLives.length;
    const target = activeLives[nextIdx];
    if (target && target.id !== currentLiveId) {
      handleJoinExistingLive(target);
    }
  };

  // Handle keyboard ArrowUp / ArrowDown navigation between active lives
  const handleCycleLiveRef = useRef(handleCycleLive);
  handleCycleLiveRef.current = handleCycleLive;
  useEffect(() => {
    if (!currentLiveId || activeLives.length <= 1) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        handleCycleLiveRef.current(1);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        handleCycleLiveRef.current(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentLiveId, activeLives.length]);

  // Immediately terminate stream if viewer gets blocked by host (synced via LIVE_UPDATED / polling)
  useEffect(() => {
    if (!currentLive || isHost) return;
    const isBlockedNow = Boolean(
      currentLive.blockedUserIds?.includes(user.id) ||
        (user.matricule && currentLive.blockedUserIds?.includes(user.matricule))
    );
    if (isBlockedNow) {
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      setRemoteStreams({});
      leaveLiveRtcRoom(currentLive.id);
      stopStream();
      joinedLiveIdRef.current = null;
      setShowStageInviteModal(false);
      setShowViewersModerationModal(false);
      setBlockedTerminatedLiveId(currentLive.id);
      setCurrentLiveId(null);
    }
  }, [currentLive, isHost, user.id, user.matricule, leaveLiveRtcRoom]);

  // Keep mobile screen awake (Screen WakeLock API) while streaming or watching a Live
  useEffect(() => {
    if (!currentLiveId || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let wakeLockSentinel: any = null;
    let cancelled = false;

    const acquireWakeLock = async () => {
      try {
        if (!cancelled && document.visibilityState === 'visible') {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        // ignore if unsupported or blocked by battery saver
      }
    };

    void acquireWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (wakeLockSentinel && typeof wakeLockSentinel.release === 'function') {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [currentLiveId]);

  // Fast real-time verification when currentLive disappears from activeLives so viewers see "plus de Live" immediately
  useEffect(() => {
    if (!currentLiveId || blockedTerminatedLiveId) return;
    if (hostStoppedLiveIdRef.current === currentLiveId || endedSummary) return;
    // Never auto-stop the host's own Live unless the host explicitly stopped it
    if (isHostRef.current) return;
    const stillActive = activeLives.some((l) => l.id === currentLiveId);
    if (stillActive) return;

    let cancelled = false;
    const closeDeadViewerRoom = (latestLivesList: LiveSession[]) => {
      if (cancelled || hostStoppedLiveIdRef.current === currentLiveId || endedSummaryRef.current || isHostRef.current) {
        return;
      }
      joinedLiveIdRef.current = null;
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      setRemoteStreams({});
      setRemoteMediaStates({});
      setViewerAudioBlocked(false);
      setShowStageInviteModal(false);
      setShowViewersModerationModal(false);
      setIsCinemaMode(false);
      stopStream();
      if (latestLivesList.length > 0) {
        const nextLive = latestLivesList[0];
        if (nextLive.hostId !== user.id) {
          joinLiveSession(nextLive.id);
          joinedLiveIdRef.current = nextLive.id;
        }
        setCurrentLiveId(nextLive.id);
        showToast({
          title: 'Live terminé · Live suivant',
          message: `Tu regardes maintenant « ${nextLive.title} ».`,
          type: 'info',
        });
      } else {
        setJustEndedNotice({ title: 'Ce Live', endedAt: Date.now() });
        setCurrentLiveId(null);
        showToast({
          title: 'Live terminé',
          message: 'Aucun Live en cours pour le moment.',
          type: 'info',
        });
      }
    };

    // Confirm immediately against server before exiting (eliminates stale 12s wait while protecting against blips)
    const verifyAndTransition = async () => {
      try {
        const res = await fetch('/api/lives', { cache: 'no-store' });
        if (cancelled) return;
        if (res.ok) {
          const d = (await res.json().catch(() => null)) as { lives?: LiveSession[] } | null;
          if (Array.isArray(d?.lives)) {
            const serverStillHasIt = d.lives.some((l) => l && l.isActive && l.id === currentLiveId);
            if (!serverStillHasIt) {
              closeDeadViewerRoom(d.lives.filter((l) => l && l.isActive));
              return;
            }
          }
        }
      } catch {
        // fallback to timer below if network error
      }
    };

    const quickVerifyTimer = window.setTimeout(() => {
      void verifyAndTransition();
    }, 350);

    const fallbackTimer = window.setTimeout(() => {
      if (!activeLivesRef.current.some((l) => l.id === currentLiveId)) {
        closeDeadViewerRoom(activeLivesRef.current);
      }
    }, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(quickVerifyTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [activeLives, currentLiveId, blockedTerminatedLiveId, endedSummary, joinLiveSession, showToast, user.id]);

  const hasEnoughKeysForLive = (user.keysAvailable || 0) >= LIVE_MIN_KEYS_REQUIRED;
  const missingKeysForLive = Math.max(0, LIVE_MIN_KEYS_REQUIRED - (user.keysAvailable || 0));

  const handleGoLive = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!hasEnoughKeysForLive) {
        showToast({
          title: `${LIVE_MIN_KEYS_REQUIRED} Clés 🔑 requises pour diffuser en Live`,
          message: `Il te manque encore ${missingKeysForLive} clé${missingKeysForLive > 1 ? 's' : ''}. Valide une mission, une détox ou passe par la Boutique !`,
          icon: '🔒',
          type: 'warning',
          action: {
            label: 'Obtenir des clés',
            onClick: () => openShop(),
          },
        });
        return;
      }
      hostStoppedLiveIdRef.current = null;
      setEndedSummary(null);
      ensureBroadcasterAudioUnlocked();
      if (camEnabled && !streamRef.current) {
        const camOk = await attachCameraStream(facingMode);
        if (!camOk && micEnabled) {
          const audioFallbackOk = await attachAudioOnlyStream();
          if (audioFallbackOk) {
            setCamEnabled(false);
            showToast({
              title: 'Live lancé en Audio seul 🎙️',
              message: 'Caméra indisponible : ton micro diffuse bien en direct !',
              type: 'info',
            });
          }
        }
      } else if (!camEnabled && micEnabled && !streamRef.current) {
        await attachAudioOnlyStream();
      }
      const session = startLiveSession(liveTitle, liveTopic, liveFilter);
      if (!session) return;
      joinedLiveIdRef.current = null;
      requestOpenLive(session.id);
      setCurrentLiveId(session.id);
      setLiveTitle('');
    } catch (err) {
      console.error('Error starting live session:', err);
      showToast({
        title: 'Erreur au lancement du Live',
        message: 'Impossible de lancer la session en direct pour le moment.',
        type: 'warning',
      });
    }
  };

  const handleBroadcastCameraClick = async () => {
    ensureBroadcasterAudioUnlocked();
    if (isHost || isParticipantOnScreen) {
      await attachCameraStream(facingMode);
      return;
    }
    showToast({
      title: 'Accès caméra 🎥',
      message: 'Activation de la caméra et envoi de la demande pour monter sur scène...',
      type: 'info',
    });
    const ok = await attachCameraStream(facingMode);
    if (ok && currentLive) {
      await requestJoinLiveStage(currentLive.id);
    }
  };

  const toggleLiveClipRecording = async () => {
    if (!streamRef.current) {
      showToast({
        title: 'Caméra non active',
        message: 'Autorise d’abord la caméra pour enregistrer un extrait vidéo (1 min max).',
        type: 'warning',
      });
      return;
    }

    if (isRecordingClip) {
      const saved = await stopClipRecorderOnly();
      if (saved) {
        await downloadMediaAsset(saved.ref, `evasion_live_${Date.now()}`);
        showToast({
          title: 'Extrait Live prêt & téléchargé ! 🎬',
          message: `Vidéo enregistrée (${saved.dur}s) sur ton appareil.`,
          type: 'success',
        });
      }
      return;
    }

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
      clipRecorderRef.current = recorder;
      clipChunksRef.current = [];
      clipStartRef.current = Date.now();
      setClipElapsedSec(0);
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) clipChunksRef.current.push(ev.data);
      };
      recorder.start(300);
      setIsRecordingClip(true);
      showToast({
        title: 'Enregistrement extrait démarré ⏺️',
        message: 'Appuie à nouveau sur STOP (max 1 min) pour sauvegarder et télécharger la vidéo.',
        type: 'info',
      });
    } catch {
      showToast({
        title: 'Enregistrement indisponible',
        message: "Ton navigateur ne supporte pas la capture vidéo en direct.",
        type: 'warning',
      });
    }
  };

  const handleEndOrLeaveLive = async () => {
    if (!currentLive) return;
    const closingLiveId = currentLive.id;
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }

    let savedClip: { ref: string; dur: number } | null = null;
    if (isRecordingClip) {
      savedClip = await stopClipRecorderOnly();
    }

    if (isHost) {
      hostStoppedLiveIdRef.current = closingLiveId;
      setEndedSummary({
        title: currentLive.title,
        durationSec: elapsedSec,
        keys: currentLive.keysReceived,
        padlocks: currentLive.padlocksReceived,
        specialGifts:
          (currentLive.iceConesReceived || 0) +
          (currentLive.waterBottlesReceived || 0) +
          (currentLive.cansReceived || 0),
        recordedClipRef: savedClip?.ref,
        recordedClipDuration: savedClip?.dur,
      });
      endLiveSession(closingLiveId);
    } else {
      if (isGuestOnStage) {
        await removeOrLeaveLiveStage(closingLiveId, user.id);
      }
      if (joinedLiveIdRef.current) {
        leaveLiveSession(joinedLiveIdRef.current);
        joinedLiveIdRef.current = null;
      }
    }

    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // ignore
      }
    });
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    setRemoteStreams({});
    setRemoteMediaStates({});
    setViewerAudioBlocked(false);
    leaveLiveRtcRoom(closingLiveId);
    setShowStageInviteModal(false);
    setShowViewersModerationModal(false);
    setIsCinemaMode(false);
    stopStream();
    setCurrentLiveId(null);
  };

  const handleToggleCam = async () => {
    const next = !camEnabled;
    setCamEnabled(next);
    if (next) {
      const hasLiveVideo = Boolean(
        streamRef.current?.getVideoTracks().some((t) => t.readyState === 'live')
      );
      if (hasLiveVideo && streamRef.current) {
        streamRef.current.getVideoTracks().forEach((t) => {
          t.enabled = true;
        });
      } else {
        await attachCameraStream(facingMode);
      }
    } else if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = false;
      });
    }
    if (currentLive && isGuestOnStage) {
      void updateLiveGuestMedia(currentLive.id, { camEnabled: next });
    }
  };

  const handleToggleMic = async () => {
    const next = !micEnabled;
    if (next) {
      ensureBroadcasterAudioUnlocked();
    }
    setMicEnabled(next);
    if (next) {
      const hasLiveAudio = Boolean(
        streamRef.current?.getAudioTracks().some((t) => t.readyState === 'live')
      );
      if (hasLiveAudio && streamRef.current) {
        streamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
      } else if (camEnabled) {
        await attachCameraStream(facingMode);
      } else {
        await attachAudioOnlyStream();
      }
    } else if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
    }
    if (currentLive && isGuestOnStage) {
      void updateLiveGuestMedia(currentLive.id, { micEnabled: next });
    }
  };

  const handleFlipCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    const ok = await attachCameraStream(next, true);
    if (ok) {
      setFacingMode(next);
    }
  };

  const handleCycleZoom = () => {
    let nextIndex = zoomIndex + zoomDirection;
    let nextDirection: 1 | -1 = zoomDirection;

    if (nextIndex >= ZOOM_LEVELS.length - 1) {
      nextIndex = ZOOM_LEVELS.length - 1;
      nextDirection = -1;
    } else if (nextIndex <= 0) {
      nextIndex = 0;
      nextDirection = 1;
    }

    setZoomIndex(nextIndex);
    setZoomDirection(nextDirection);
  };

  const handleCycleFilter = () => {
    if (!currentLive || !isHost) return;
    const idx = LIVE_FILTERS.findIndex((f) => f.id === (currentLive.filter || 'none'));
    const nextFilter = LIVE_FILTERS[(idx + 1) % LIVE_FILTERS.length];
    updateLiveFilter(currentLive.id, nextFilter.id);
    setLiveFilter(nextFilter.id);
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLive || !commentInput.trim()) return;
    sendLiveComment(currentLive.id, commentInput);
    setCommentInput('');
  };

  const handleAddCustomTopic = () => {
    const clean = customTopicInput.trim();
    if (!clean) return;
    const created = createCustomSalon(clean);
    if (created) {
      setLiveTopic(created.tag);
      setCustomTopicInput('');
      setShowCustomTopicInput(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeZoom = ZOOM_LEVELS[zoomIndex] || ZOOM_LEVELS[1];
  const isEnlargedZoom = activeZoom.scale >= 1.0;

  type LeftStreamEntry =
    | { kind: 'live'; key: string; label: string; avatar: string; live: LiveSession }
    | {
        kind: 'viewer';
        key: string;
        label: string;
        avatar: string;
        userId: string;
        matricule?: string;
      };

  const leftStreamEntries = useMemo<LeftStreamEntry[]>(() => {
    if (!currentLive) return [];
    const items: LeftStreamEntry[] = [];
    const seenKeys = new Set<string>();
    const blockedSet = new Set(currentLive.blockedUserIds || []);

    // For the host: ONLY include real currently active viewers in the room (never historic commenters or self)
    if (isHost) {
      for (const v of currentLive.activeViewers || []) {
        if (!v.userId || v.userId === user.id || seenKeys.has(v.userId)) continue;
        if (user.matricule && v.matricule === user.matricule) continue;
        if (blockedSet.has(v.userId) || (v.matricule && blockedSet.has(v.matricule))) continue;
        seenKeys.add(v.userId);
        items.push({
          kind: 'viewer',
          key: `viewer_${v.userId}`,
          label: v.alias || v.matricule,
          avatar: v.avatar || '⛓️',
          userId: v.userId,
          matricule: v.matricule,
        });
      }
    }

    // Only include other active live streams when multiple are actually running
    if (activeLives.length > 1) {
      for (const l of activeLives) {
        if (l.id === currentLive.id || seenKeys.has(`live_${l.id}`)) continue;
        seenKeys.add(`live_${l.id}`);
        items.push({
          kind: 'live',
          key: `live_${l.id}`,
          label: l.hostName,
          avatar: l.hostAvatar || '⛓️',
          live: l,
        });
      }
    }

    return items;
  }, [currentLive, isHost, user.id, user.matricule, activeLives]);

  // Truthful list: never clone/duplicate entries when few or 0 people are watching
  const loopedLeftStreamEntries = leftStreamEntries;

  // --- BLOCKED VIEWER SCREEN ("Live terminé") ---
  if (blockedTerminatedLiveId) {
    return (
      <div className="fixed inset-0 z-50 w-screen h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-zinc-900 border border-white/15 flex items-center justify-center text-3xl mb-4 shadow-xl">
          🎬
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Live terminé
        </h2>
        <p className="mt-2 text-xs sm:text-sm font-mono text-zinc-400 max-w-xs">
          Cette diffusion en direct est terminée.
        </p>
        <button
          type="button"
          onClick={() => {
            setBlockedTerminatedLiveId(null);
            setCurrentLiveId(null);
          }}
          className="mt-6 px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-mono font-bold cursor-pointer transition-all active:scale-95"
        >
          Quitter
        </button>
      </div>
    );
  }

  // --- VIEW 1: TRUE FULLSCREEN RESPONSIVE MULTI-USER (1 À 5 ÉCRANS) LIVE STAGE ---
  if (currentLive) {
    const activeFilterObj = LIVE_FILTERS.find((f) => f.id === (currentLive.filter || 'none')) || LIVE_FILTERS[0];
    const hasActiveVideoTrack = Boolean(streamRef.current && camEnabled && !camError);

    const hostRemoteMedia = remoteMediaStates[currentLive.hostId];
    const stageParticipants: StageParticipantItem[] = [
      {
        userId: currentLive.hostId,
        matricule: currentLive.hostMatricule,
        alias: currentLive.hostName,
        avatar: currentLive.hostAvatar,
        neonColor: isHost ? user.neonColor : currentLive.hostNeonColor,
        frame: isHost ? user.cellBorderFrame : currentLive.hostFrame,
        isHost: true,
        camEnabled: isHost ? camEnabled : hostRemoteMedia?.camEnabled ?? true,
        micEnabled: isHost ? micEnabled : hostRemoteMedia?.micEnabled ?? true,
      },
      ...(currentLive.guests || []).slice(0, 4).map((g) => {
        const guestRemoteMedia = remoteMediaStates[g.userId];
        return {
          userId: g.userId,
          matricule: g.matricule,
          alias: g.alias || g.matricule,
          avatar: g.avatar,
          neonColor: g.userId === user.id ? user.neonColor : g.neonColor,
          frame: g.userId === user.id ? user.cellBorderFrame : g.frame,
          isHost: false,
          camEnabled:
            g.userId === user.id ? camEnabled : guestRemoteMedia?.camEnabled ?? g.camEnabled,
          micEnabled:
            g.userId === user.id ? micEnabled : guestRemoteMedia?.micEnabled ?? g.micEnabled,
        };
      }),
    ];

    const stageCount = stageParticipants.length;
    const guestRequests = currentLive.guestRequests || [];
    const hasRequestedStage = Boolean(
      guestRequests.some(
        (r) => r.userId === user.id || (Boolean(user.matricule) && r.matricule === user.matricule)
      )
    );
    const unlockViewerMediaPlayback = () => {
      if (viewerMuted) return;
      ensureViewerAudioUnlocked();
      setViewerAudioBlocked(false);
      setAudioUnlockedTick((n) => n + 1);
      const container = stageContainerRef.current;
      if (!container) return;
      container.querySelectorAll('video, audio').forEach((node) => {
        const media = node as HTMLMediaElement;
        if (media.srcObject && media.srcObject !== streamRef.current) {
          media.muted = false;
          media.volume = 1;
          media.play().catch(() => {});
        }
      });
    };
    const stageGridLayoutClass =
      stageCount === 1
        ? 'grid-cols-1 grid-rows-1'
        : stageCount === 2
        ? 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1 gap-1.5 sm:gap-2'
        : stageCount === 3
        ? 'grid-cols-2 grid-rows-2 gap-1.5 sm:gap-2'
        : stageCount === 4
        ? 'grid-cols-2 grid-rows-2 gap-1.5 sm:gap-2'
        : 'grid-cols-6 grid-rows-2 gap-1.5 sm:gap-2';

    const inviteCandidates = (() => {
      const base = stageInviteSearch.trim() ? stageInviteResults : availableInmates;
      const seen = new Set<string>();
      const combined: (DirectChatTarget & { isOnlineNow?: boolean; activeLiveId?: string })[] = [];
      for (const ou of onlineUsers) {
        if (ou.id === user.id || seen.has(ou.id)) continue;
        if (stageInviteSearch.trim()) {
          const q = stageInviteSearch.trim().toLowerCase();
          if (
            !ou.alias.toLowerCase().includes(q) &&
            !ou.matricule.toLowerCase().includes(q)
          ) {
            continue;
          }
        }
        seen.add(ou.id);
        combined.push({
          id: ou.id,
          matricule: ou.matricule,
          alias: ou.alias,
          avatar: ou.avatar,
          neonColor: ou.neonColor,
          isOnlineNow: true,
          activeLiveId: ou.activeLiveId,
        });
      }
      for (const item of base) {
        const key = item.id || item.matricule;
        if (key === user.id || seen.has(key)) continue;
        seen.add(key);
        combined.push({ ...item, isOnlineNow: false });
      }
      return combined;
    })();

    return (
      <div
        ref={stageContainerRef}
        onPointerDown={unlockViewerMediaPlayback}
        className="fixed inset-0 z-50 w-screen h-[100dvh] bg-black flex flex-col justify-between select-none overflow-hidden"
      >
        {/* Floating prominent unmute button when browser blocks viewer audio */}
        {viewerAudioBlocked && !viewerMuted && !isParticipantOnScreen && !isCinemaMode && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[65] animate-bounce pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewerMuted(false);
                setViewerAudioBlocked(false);
                window.dispatchEvent(new CustomEvent('evasion:viewer-unlock-media'));
                unlockViewerMediaPlayback();
                showToast({
                  title: 'Son du Live activé 🔊',
                  message: 'Tu reçois maintenant le son et l’image en direct.',
                  type: 'success',
                });
              }}
              className="px-4 py-2 rounded-full bg-transparent hover:bg-white/10 border border-cyan-400/80 text-cyan-200 text-xs font-mono font-bold flex items-center gap-2 shadow-[0_0_24px_rgba(0,242,254,0.35)] cursor-pointer active:scale-95 transition-all drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
            >
              <Volume2 className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>Toucher pour activer le son du Live</span>
            </button>
          </div>
        )}

        {/* Floating exit Cinema Mode button when active (positioned at root level to guarantee visibility and clickability) */}
        {isCinemaMode && (
          <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-[70] animate-fade-in pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCinemaMode(false);
              }}
              className="px-3.5 py-1.5 rounded-full bg-transparent text-[#00f2fe] hover:text-white border border-[#00f2fe]/70 hover:border-[#00f2fe] text-xs font-mono font-bold flex items-center gap-1.5 backdrop-blur-[2px] cursor-pointer transition-all hover:scale-105 active:scale-95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
              title="Quitter le Mode Cinéma (ou toucher n'importe où sur l'écran)"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Quitter Mode Cinéma</span>
            </button>
          </div>
        )}

        {/* FULLSCREEN MULTI-USER VIDEO STAGE (1 à 5 écrans simultanés + tap reaction) */}
        <div
          onClick={(e) => {
            unlockViewerMediaPlayback();
            if (isCinemaMode) {
              setIsCinemaMode(false);
              return;
            }
            if (isHost) return;
            const target = e.target as HTMLElement | null;
            if (target?.closest('button, input, textarea, form, a, [role="button"], [data-no-stage-tap="true"]')) {
              return;
            }
            sendLiveLike(currentLive.id);
            spawnFloatingEmoji('❤️');
          }}
          onWheel={(e) => {
            if (activeLives.length <= 1 || isParticipantOnScreen) return;
            const target = e.target as HTMLElement | null;
            if (target?.closest('[data-chat-scroll="true"], textarea')) return;
            const now = Date.now();
            if (now - wheelCooldownRef.current < 450) return;
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(delta) >= 28) {
              wheelCooldownRef.current = now;
              handleCycleLive(delta > 0 ? 1 : -1);
            }
          }}
          onTouchStart={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('button, input, textarea, form, a, [data-chat-scroll="true"]')) {
              touchStartYRef.current = null;
              touchStartXRef.current = null;
              return;
            }
            if (e.touches.length === 1) {
              touchStartYRef.current = e.touches[0].clientY;
              touchStartXRef.current = e.touches[0].clientX;
            }
          }}
          onTouchEnd={(e) => {
            if (touchStartYRef.current === null || activeLives.length <= 1 || isParticipantOnScreen) {
              touchStartYRef.current = null;
              touchStartXRef.current = null;
              return;
            }
            const endY = e.changedTouches[0]?.clientY;
            const endX = e.changedTouches[0]?.clientX;
            const dy = typeof endY === 'number' ? touchStartYRef.current - endY : 0;
            const dx =
              typeof endX === 'number' && touchStartXRef.current !== null
                ? endX - touchStartXRef.current
                : 0;
            if (Math.abs(dx) >= 40 && Math.abs(dx) >= Math.abs(dy)) {
              handleCycleLive(dx < 0 ? 1 : -1);
            } else if (Math.abs(dy) >= 40) {
              handleCycleLive(dy > 0 ? 1 : -1);
            }
            touchStartYRef.current = null;
            touchStartXRef.current = null;
          }}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('button, input, textarea, form, a, [data-chat-scroll="true"]')) {
              touchStartYRef.current = null;
              touchStartXRef.current = null;
              return;
            }
            touchStartYRef.current = e.clientY;
            touchStartXRef.current = e.clientX;
          }}
          onMouseUp={(e) => {
            if (touchStartYRef.current === null || activeLives.length <= 1 || isParticipantOnScreen) {
              touchStartYRef.current = null;
              touchStartXRef.current = null;
              return;
            }
            const dy = touchStartYRef.current - e.clientY;
            const dx = touchStartXRef.current !== null ? e.clientX - touchStartXRef.current : 0;
            if (Math.abs(dx) >= 40 && Math.abs(dx) >= Math.abs(dy)) {
              handleCycleLive(dx < 0 ? 1 : -1);
            } else if (Math.abs(dy) >= 40) {
              handleCycleLive(dy > 0 ? 1 : -1);
            }
            touchStartYRef.current = null;
            touchStartXRef.current = null;
          }}
          className="live-dark-stage relative w-full h-full flex-1 bg-black overflow-hidden flex flex-col justify-between items-center text-center"
        >
          {/* Full-screen Split-Screen Multi-Stream Grid (1 to 5 simultaneous users) */}
          <div
            className={`absolute inset-0 w-full h-full bg-gradient-to-b from-zinc-950 via-black to-zinc-950 ${
              isCinemaMode
                ? 'p-0'
                : stageCount > 1
                ? `px-1.5 sm:px-2.5 pt-[148px] sm:pt-[156px] ${
                    isExpandedChat ? 'pb-[345px] sm:pb-[375px]' : 'pb-[270px] sm:pb-[295px]'
                  }`
                : 'p-0'
            }`}
          >
            <div
              className={`w-full h-full grid ${stageGridLayoutClass} transition-transform duration-200 ease-out ${
                stageCount === 1 ? activeZoom.wrapperClass : ''
              }`}
            >
              {stageParticipants.map((participant, idx) => {
                const isMeTile =
                  participant.userId === user.id ||
                  (Boolean(user.matricule) && participant.matricule === user.matricule) ||
                  (participant.isHost && isHost);
                const tileStream = isMeTile
                  ? streamRef.current
                  : remoteStreams[participant.userId] ||
                    (participant.isHost && !isHost
                      ? remoteStreams[currentLive.hostId] ||
                        (stageCount === 1 ? Object.values(remoteStreams)[0] : null)
                      : null) ||
                    null;
                const tileRelayFrame = isMeTile
                  ? null
                  : relayFrames[participant.userId] ||
                    (participant.isHost && !isHost
                      ? relayFrames[currentLive.hostId] ||
                        (stageCount === 1 ? Object.values(relayFrames)[0] : null)
                      : null) ||
                    null;
                const tileRelayAudio = isMeTile
                  ? false
                  : Boolean(
                      relayAudioActive[participant.userId] ||
                        (participant.isHost && !isHost
                          ? relayAudioActive[currentLive.hostId] ||
                            (stageCount === 1 ? Object.values(relayAudioActive)[0] : false)
                          : false)
                    );
                const relaySenderKey = isMeTile ? undefined : participant.userId;
                const relayHostKey =
                  !isMeTile && participant.isHost && currentLive.hostId !== participant.userId
                    ? currentLive.hostId
                    : undefined;
                return (
                  <ParticipantVideoTile
                    key={participant.userId}
                    participant={participant}
                    slotIndex={idx}
                    totalCount={stageCount}
                    isMe={isMeTile}
                    stream={tileStream}
                    relayFrameUrl={tileRelayFrame}
                    relaySenderKey={relaySenderKey}
                    relayHostKey={relayHostKey}
                    subscribeRelayFrame={subscribeRelayFrame}
                    relayAudioActive={tileRelayAudio}
                    filterCss={activeFilterObj.css}
                    isEnlargedZoom={isEnlargedZoom}
                    isCinemaMode={isCinemaMode}
                    isExpandedChat={isExpandedChat}
                    facingMode={facingMode}
                    theme={theme}
                    canKick={isHost && !participant.isHost}
                    viewerMuted={viewerMuted}
                    audioUnlockedTick={audioUnlockedTick}
                    onViewerAudioBlockedChange={setViewerAudioBlocked}
                    onUnmuteViewerAudio={() => {
                      setViewerMuted(false);
                      setViewerAudioBlocked(false);
                      setAudioUnlockedTick((n) => n + 1);
                      ensureViewerAudioUnlocked();
                      unlockViewerMediaPlayback();
                    }}
                    onReconnectStream={() => {
                      ensureViewerAudioUnlocked();
                      sendLiveRtcSignal(currentLive.id, participant.userId, 'request-offer', {
                        forceFresh: true,
                        ts: Date.now(),
                      });
                      sendLiveRelaySubscribe(currentLive.id, participant.userId);
                      joinLiveRtcRoom(currentLive.id, isGuestOnStage ? 'guest' : 'viewer');
                    }}
                    onKick={() => void removeOrLeaveLiveStage(currentLive.id, participant.userId)}
                    onLeaveStage={() => void removeOrLeaveLiveStage(currentLive.id, user.id)}
                    onOpenDirectChat={() =>
                      openDirectChat({
                        id: participant.userId,
                        matricule: participant.matricule,
                        alias: participant.alias,
                        avatar: participant.avatar || '⛓️',
                        neonColor: participant.neonColor,
                      })
                    }
                    onEnableLocalCamera={() => void attachCameraStream(facingMode)}
                    onEnableAudioOnly={() => {
                      setCamEnabled(false);
                      void attachAudioOnlyStream();
                    }}
                    onBroadcastCameraClick={() => void handleBroadcastCameraClick()}
                    camRequesting={camRequesting}
                    camError={camError}
                    liveTitle={currentLive.title}
                    topicTag={currentLive.topicTag}
                  />
                );
              })}
            </div>
          </div>

          {/* TOP BAR CENTRÉE 100% TRANSPARENTE SUR L'ÉCRAN DU LIVE (SANS VOILE SOMBRE NI CANTINE) */}
          {!isCinemaMode && (
            <div className="relative z-10 w-full max-w-2xl mx-auto px-3 pt-2.5 sm:px-5 sm:pt-3.5 flex flex-col items-center justify-center gap-2 text-center transition-all duration-300 ease-in-out opacity-100 translate-y-0">
              {/* Row 1 Centrée: Host Identity + Viewers + Cinema + End/Leave */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 w-full">
              <div
                className={`inline-flex items-center justify-center gap-1.5 pr-2 pl-1 py-1 rounded-full bg-transparent border min-w-0 max-w-full text-center ${
                  getCellFrameClasses(
                    isHost ? user.cellBorderFrame : currentLive.hostFrame,
                    isHost ? user.neonColor : currentLive.hostNeonColor,
                    'dark'
                  )
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    openUserProfile({
                      id: currentLive.hostId,
                      matricule: currentLive.hostMatricule,
                      alias: currentLive.hostName,
                      avatar: currentLive.hostAvatar || '⛓️',
                      neonColor: currentLive.hostNeonColor,
                    });
                  }}
                  className="inline-flex items-center gap-2 min-w-0 text-left cursor-pointer group hover:opacity-90 active:scale-95 transition-all"
                  title={`Voir le profil, l'univers et les clés/cadenas de ${currentLive.hostName}`}
                >
                  <span
                    className={`w-7 h-7 rounded-full bg-transparent flex items-center justify-center text-sm shrink-0 overflow-hidden ${
                      (isHost ? user.neonColor : currentLive.hostNeonColor)
                        ? getNeonAvatarRingClass(
                            isHost ? user.neonColor : currentLive.hostNeonColor,
                            'dark'
                          )
                        : 'border border-[#ff0050]/80'
                    }`}
                  >
                    <AvatarDisplay avatar={currentLive.hostAvatar} alt={currentLive.hostName} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white drop-shadow flex items-center gap-1.5">
                      <span
                        className={`truncate max-w-[105px] sm:max-w-[155px] ${
                          (isHost ? user.neonColor : currentLive.hostNeonColor)
                            ? getNeonTextClass(
                                isHost ? user.neonColor : currentLive.hostNeonColor,
                                'dark'
                              )
                            : ''
                        } ${!isHost ? 'group-hover:underline' : ''}`}
                      >
                        {currentLive.hostName}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-200 drop-shadow flex items-center gap-1 whitespace-nowrap">
                      <span className="text-amber-300 font-bold truncate max-w-[95px] sm:max-w-[150px]">{currentLive.topicTag}</span>
                      <span>·</span>
                      <span className="tabular-nums">{formatTimer(elapsedSec)}</span>
                    </div>
                  </div>
                </button>

                {isParticipantOnScreen ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasActiveVideoTrack) {
                        void attachCameraStream(facingMode);
                      } else {
                        void handleFlipCamera();
                      }
                    }}
                    className="px-2 py-1 rounded-full bg-transparent border border-[#ff0050] hover:bg-[#ff0050]/20 text-white text-[9px] font-black tracking-wider uppercase shrink-0 whitespace-nowrap leading-none cursor-pointer active:scale-95 transition-all flex items-center gap-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                    title={hasActiveVideoTrack ? 'Retourner la caméra' : 'Activer la caméra sans couper le Live'}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ff0050] animate-pulse" />
                    <span>EN DIRECT</span>
                  </button>
                ) : (
                  <span className="px-2 py-1 rounded-full bg-transparent border border-[#ff0050] text-white text-[9px] font-black tracking-wider uppercase shrink-0 whitespace-nowrap leading-none flex items-center gap-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ff0050] animate-pulse" />
                    <span>EN DIRECT</span>
                  </span>
                )}
              </div>

              <div className="flex items-center justify-center gap-1.5 shrink-0 flex-wrap">
                {isHost ? (
                  <button
                    type="button"
                    onClick={() => setShowViewersModerationModal(true)}
                    title="Voir les spectateurs en direct & modérer (bloquer)"
                    className="px-2.5 h-9 rounded-full bg-transparent hover:bg-white/10 border border-white/25 text-[11px] font-mono font-bold text-white drop-shadow flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="tabular-nums">{currentLive.viewersCount}</span>
                  </button>
                ) : (
                  <div
                    title="Spectateurs en direct"
                    className="px-2.5 h-9 rounded-full bg-transparent border border-white/20 text-[11px] font-mono font-bold text-white drop-shadow flex items-center justify-center gap-1 whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="tabular-nums">{currentLive.viewersCount}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsCinemaMode((v) => !v)}
                  title={isCinemaMode ? 'Quitter le Mode Cinéma' : 'Mode Cinéma (masquer les interfaces)'}
                  className={`w-9 h-9 rounded-full bg-transparent border flex items-center justify-center cursor-pointer shrink-0 transition-all ${
                    isCinemaMode
                      ? 'border-[#00f2fe] text-[#00f2fe]'
                      : 'border-white/20 text-white hover:bg-white/10'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleEndOrLeaveLive}
                  title={isHost ? 'Arrêter et terminer la session Live' : 'Quitter le Live'}
                  className="px-3 h-9 rounded-full bg-transparent hover:bg-red-600/35 border border-red-400/70 text-white text-[11px] font-mono font-black flex items-center justify-center gap-1 cursor-pointer shrink-0 whitespace-nowrap drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] active:scale-95 transition-all"
                >
                  <X className="w-3.5 h-3.5 text-red-400" />
                  <span>{isHost ? 'Arrêter' : 'Quitter'}</span>
                </button>
              </div>
            </div>

            {/* =====================================================================
                SÉPARATION STRICTE DES RÔLES EN DIRECT (100% TRANSPARENT) :
                1) isHost === true          -> POSTE DE PILOTAGE CRÉATEUR (Cam/Mic/Filtre/REC/Multi-Live/Réceptions)
                2) isGuestOnStage && !isHost -> BARRE INVITÉ SUR SCÈNE (Cam/Mic perso + Descendre)
                3) !isParticipantOnScreen   -> BARRE SPECTATEUR PURE (Son/Monter/Zoom + Cadeaux à offrir)
               ===================================================================== */}
            {isHost ? (
              <>
                {/* HÔTE — Ligne 2 : Outils Techniques du Diffuseur uniquement */}
                <div className="inline-flex items-center justify-start sm:justify-center gap-1.5 px-2.5 py-1 rounded-full bg-transparent border border-white/25 w-fit max-w-full overflow-x-auto no-scrollbar mx-auto drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  <span className="px-2 py-0.5 rounded-full bg-transparent border border-[#ef4444]/60 text-[#fca5a5] text-[9px] font-mono font-black uppercase tracking-wider shrink-0">
                    🎥 Studio Hôte
                  </span>

                  <button
                    type="button"
                    onClick={handleToggleMic}
                    title={micEnabled ? 'Couper ton micro' : 'Activer ton micro'}
                    className={`px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0 bg-transparent ${
                      micEnabled
                        ? 'border-emerald-400/75 text-emerald-200 hover:bg-emerald-500/15'
                        : 'border-red-400/85 text-red-200 hover:bg-red-500/15'
                    }`}
                  >
                    {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    <span>{micEnabled ? 'Micro ON' : 'Muet'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleCam}
                    title={camEnabled ? 'Couper ta caméra' : 'Activer ta caméra'}
                    className={`px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0 bg-transparent ${
                      camEnabled
                        ? 'border-emerald-400/75 text-emerald-200 hover:bg-emerald-500/15'
                        : 'border-red-400/85 text-red-200 hover:bg-red-500/15'
                    }`}
                  >
                    {camEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                    <span>{camEnabled ? 'Cam ON' : 'Audio seul'}</span>
                  </button>

                  {hasActiveVideoTrack && (
                    <>
                      <button
                        type="button"
                        onClick={handleFlipCamera}
                        title="Retourner la caméra (avant / arrière)"
                        className="w-7 h-7 rounded-full bg-transparent border border-white/25 text-white flex items-center justify-center cursor-pointer hover:bg-white/10 shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={handleCycleFilter}
                        title="Changer le filtre vidéo du Live"
                        className="px-2.5 h-7 rounded-full bg-transparent hover:bg-white/10 border border-white/25 text-[10px] font-mono font-bold text-white flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="w-3 h-3 text-[#00f2fe]" />
                        <span>{activeFilterObj.label}</span>
                      </button>

                      <button
                        type="button"
                        onClick={toggleLiveClipRecording}
                        title={
                          isRecordingClip
                            ? 'Stopper et télécharger l’extrait'
                            : 'Enregistrer un extrait vidéo de ton Live (1 min max)'
                        }
                        className={`px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0 bg-transparent ${
                          isRecordingClip
                            ? 'border-[#ff0050] text-white animate-pulse'
                            : 'border-white/25 text-white hover:bg-white/10'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isRecordingClip ? 'bg-white' : 'bg-[#ff0050]'
                          }`}
                        />
                        <span>{isRecordingClip ? `STOP ${formatTimer(clipElapsedSec)}` : 'REC'}</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setAnnouncementDraft(currentLive.pinnedAnnouncement || '');
                      setShowStageInviteModal(true);
                    }}
                    className={`relative px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition-all bg-transparent ${
                      guestRequests.length > 0
                        ? 'border-[#ff0050] text-white animate-pulse'
                        : 'hover:bg-white/10 border-white/30 text-white'
                    }`}
                    title="Gérer les invités à l'écran (1 à 5), demandes et annonce épinglée"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Écran {stageCount}/5</span>
                    {guestRequests.length > 0 && (
                      <span className="px-1 rounded-full bg-amber-300 text-zinc-950 text-[9px] font-black">
                        +{guestRequests.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCycleZoom}
                    className="px-2.5 h-7 rounded-full bg-transparent hover:bg-white/10 border border-white/25 text-[10px] font-mono font-bold text-white flex items-center justify-center gap-1 cursor-pointer shrink-0"
                    title="Ajuster le zoom de ton retour caméra"
                  >
                    {zoomDirection === 1 ? (
                      <ZoomIn className="w-3 h-3 text-[#00f2fe]" />
                    ) : (
                      <ZoomOut className="w-3 h-3 text-amber-300" />
                    )}
                    <span className="tabular-nums">{activeZoom.label}</span>
                  </button>
                </div>

                {currentLive.pinnedAnnouncement && (
                  <div className="px-3 py-1 rounded-full bg-transparent border border-amber-400/45 text-[11px] font-mono text-amber-100 inline-flex items-center justify-center gap-1.5 truncate mx-auto max-w-full drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                    <Pin className="w-3 h-3 text-amber-300 shrink-0" />
                    <span className="truncate">{currentLive.pinnedAnnouncement}</span>
                  </div>
                )}

                {/* HÔTE — Ligne 3 : Compteur de Réceptions en Direct */}
                <div className="inline-flex items-center justify-start sm:justify-center gap-1.5 px-3 h-8 rounded-full bg-transparent border border-white/25 text-[10px] sm:text-[11px] font-mono font-bold tabular-nums whitespace-nowrap overflow-x-auto no-scrollbar w-fit max-w-full mx-auto drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  <span className="text-zinc-200 text-[10px] uppercase tracking-wider shrink-0">
                    Reçus :
                  </span>
                  <span className="text-amber-300 px-1 flex items-center gap-1 shrink-0" title="Clés reçues">
                    <span>🔑</span><span>{currentLive.keysReceived}</span>
                  </span>
                  <span className="text-white/20 shrink-0">·</span>
                  <span className="text-sky-300 px-1 flex items-center gap-1 shrink-0" title="Cadenas reçus">
                    <span>🔒</span><span>{currentLive.padlocksReceived}</span>
                  </span>
                  <span className="text-white/20 shrink-0">·</span>
                  <span className="text-pink-300 px-1 flex items-center gap-1 shrink-0" title="Cœurs reçus">
                    <span>❤️</span><span>{currentLive.likesCount}</span>
                  </span>
                  <span className="text-white/20 shrink-0">·</span>
                  <span className="text-rose-300 px-1 flex items-center gap-1 shrink-0" title="Glaces reçues">
                    <span>🍦</span><span>{currentLive.iceConesReceived || 0}</span>
                  </span>
                  <span className="text-white/20 shrink-0">·</span>
                  <span className="text-cyan-300 px-1 flex items-center gap-1 shrink-0" title="Bouteilles d’eau reçues">
                    <span>💧</span><span>{currentLive.waterBottlesReceived || 0}</span>
                  </span>
                  <span className="text-white/20 shrink-0">·</span>
                  <span className="text-orange-300 px-1 flex items-center gap-1 shrink-0" title="Conserves reçues">
                    <span>🥫</span><span>{currentLive.cansReceived || 0}</span>
                  </span>
                </div>
              </>
            ) : isGuestOnStage ? (
              <>
                {/* INVITÉ CO-HÔTE SUR SCÈNE — Contrôles personnels + Descendre */}
                <div className="inline-flex items-center justify-start sm:justify-center gap-1.5 px-2.5 py-1 rounded-full bg-transparent border border-cyan-400/50 w-fit max-w-full overflow-x-auto no-scrollbar mx-auto drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  <span className="px-2 py-0.5 rounded-full bg-transparent border border-cyan-400/50 text-cyan-200 text-[9px] font-mono font-black uppercase tracking-wider shrink-0">
                    🎥 Invité à l&apos;écran
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    className={`px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0 bg-transparent ${
                      micEnabled
                        ? 'border-emerald-400/75 text-emerald-200'
                        : 'border-red-400/85 text-red-200'
                    }`}
                  >
                    {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    <span>{micEnabled ? 'Micro ON' : 'Muet'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleCam}
                    className={`px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0 bg-transparent ${
                      camEnabled
                        ? 'border-emerald-400/75 text-emerald-200'
                        : 'border-red-400/85 text-red-200'
                    }`}
                  >
                    {camEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                    <span>{camEnabled ? 'Cam ON' : 'Audio seul'}</span>
                  </button>
                  {hasActiveVideoTrack && (
                    <button
                      type="button"
                      onClick={handleFlipCamera}
                      title="Retourner ta caméra"
                      className="w-7 h-7 rounded-full bg-transparent border border-white/25 text-white flex items-center justify-center cursor-pointer hover:bg-white/10 shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void removeOrLeaveLiveStage(currentLive.id, user.id)}
                    className="px-2.5 h-7 rounded-full bg-transparent hover:bg-red-500/20 border border-red-400/70 text-white text-[10px] font-mono font-bold cursor-pointer shrink-0"
                  >
                    Descendre de l&apos;écran
                  </button>
                </div>

                {currentLive.pinnedAnnouncement && (
                  <div className="px-3 py-1 rounded-full bg-transparent border border-amber-400/45 text-[11px] font-mono text-amber-100 inline-flex items-center justify-center gap-1.5 truncate mx-auto max-w-full drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                    <Pin className="w-3 h-3 text-amber-300 shrink-0" />
                    <span className="truncate">{currentLive.pinnedAnnouncement}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* SPECTATEUR — Ligne 2 : Contrôles de Visionnage & Participation uniquement */}
                <div className="inline-flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-2xl sm:rounded-full bg-transparent border border-white/25 w-fit max-w-full mx-auto drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  <span className="px-2 py-0.5 rounded-full bg-transparent border border-white/25 text-zinc-100 text-[9px] font-mono font-black uppercase tracking-wider shrink-0">
                    👁️ Spectateur
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      if (viewerAudioBlocked || viewerMuted) {
                        setViewerMuted(false);
                        setViewerAudioBlocked(false);
                        setAudioUnlockedTick((n) => n + 1);
                        ensureViewerAudioUnlocked();
                        window.dispatchEvent(new CustomEvent('evasion:viewer-unlock-media'));
                        const container = stageContainerRef.current;
                        if (container) {
                          container.querySelectorAll('video, audio').forEach((node) => {
                            const media = node as HTMLMediaElement;
                            if (media.srcObject && media.srcObject !== streamRef.current) {
                              media.muted = false;
                              media.defaultMuted = false;
                              media.removeAttribute('muted');
                              media.volume = 1;
                              media.play().catch(() => {});
                            }
                          });
                        }
                      } else {
                        setViewerMuted(true);
                        const container = stageContainerRef.current;
                        if (container) {
                          container.querySelectorAll('video, audio').forEach((node) => {
                            const media = node as HTMLMediaElement;
                            if (media.srcObject && media.srcObject !== streamRef.current) {
                              media.muted = true;
                            }
                          });
                        }
                      }
                    }}
                    className={`px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition-all bg-transparent ${
                      viewerAudioBlocked
                        ? 'border-cyan-300 text-cyan-200 animate-pulse'
                        : viewerMuted
                        ? 'border-red-400/75 text-red-200'
                        : 'hover:bg-white/10 border-white/25 text-white'
                    }`}
                  >
                    {viewerAudioBlocked || viewerMuted ? (
                      <VolumeX className="w-3 h-3 text-cyan-300" />
                    ) : (
                      <Volume2 className="w-3 h-3 text-emerald-300" />
                    )}
                    <span>
                      {viewerAudioBlocked
                        ? 'Activer le son'
                        : viewerMuted
                        ? 'Son coupé'
                        : 'Son ON'}
                    </span>
                  </button>

                  {(currentLive.guests?.length || 0) < 4 && (
                    <button
                      type="button"
                      disabled={hasRequestedStage}
                      onClick={async () => {
                        if (hasRequestedStage) return;
                        if (!streamRef.current) {
                          await attachCameraStream(facingMode);
                        }
                        await requestJoinLiveStage(currentLive.id);
                      }}
                      className={`px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center gap-1 whitespace-nowrap shrink-0 transition-all bg-transparent ${
                        hasRequestedStage
                          ? 'border-cyan-400/75 text-cyan-200 cursor-default'
                          : 'hover:bg-cyan-500/15 border-cyan-400/60 text-cyan-200 cursor-pointer'
                      }`}
                      title="Demander à l'hôte de monter sur l'écran en simultané"
                    >
                      <Hand className="w-3 h-3" />
                      <span>{hasRequestedStage ? 'Demandé ⏳' : 'Monter à l’écran'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowStageInviteModal(true)}
                    className="px-2.5 h-7 rounded-full bg-transparent hover:bg-white/10 border border-white/25 text-[10px] font-mono font-bold text-white flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    title="Partager ce Live ou inviter un ami à regarder"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Partager</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCycleZoom}
                    className="px-2.5 h-7 rounded-full bg-transparent hover:bg-white/10 border border-white/25 text-[10px] font-mono font-bold text-white flex items-center justify-center gap-1 cursor-pointer shrink-0"
                    title="Zoomer / Dézoomer l'image du Live"
                  >
                    {zoomDirection === 1 ? (
                      <ZoomIn className="w-3 h-3 text-[#00f2fe]" />
                    ) : (
                      <ZoomOut className="w-3 h-3 text-amber-300" />
                    )}
                    <span className="tabular-nums">{activeZoom.label}</span>
                  </button>
                </div>

                {currentLive.pinnedAnnouncement && (
                  <div className="px-3 py-1 rounded-full bg-transparent border border-amber-400/45 text-[11px] font-mono text-amber-100 inline-flex items-center justify-center gap-1.5 truncate mx-auto max-w-full drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                    <Pin className="w-3 h-3 text-amber-300 shrink-0" />
                    <span className="truncate">{currentLive.pinnedAnnouncement}</span>
                  </div>
                )}

                {/* SPECTATEUR — Ligne 3 : Barre d'Envoi de Cadeaux & Soutien au Créateur avec fondu enchaîné gauche & droite */}
                <div className="relative w-fit max-w-full mx-auto rounded-full border border-white/25 bg-black/25 backdrop-blur-xs overflow-hidden drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-black/80 via-black/35 to-transparent z-10"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-black/80 via-black/35 to-transparent z-10"
                  />
                  <div className="inline-flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5 px-4 h-8 text-[10px] sm:text-[11px] font-mono font-bold tabular-nums whitespace-nowrap overflow-x-auto no-scrollbar scroll-smooth touch-pan-x max-w-full [mask-image:linear-gradient(to_right,transparent_0%,black_7%,black_93%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_7%,black_93%,transparent_100%)]">
                    <span className="text-zinc-200 text-[10px] uppercase tracking-wider shrink-0 pr-0.5">
                      Offrir :
                    </span>
                    <button
                      type="button"
                      onClick={() => sendLiveKeyGift(currentLive.id)}
                      title="Offrir 1 Clé 🔑 au créateur"
                      className="text-amber-300 hover:bg-amber-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 sm:gap-1 shrink-0 cursor-pointer active:scale-90 transition-all"
                    >
                      <span>🔑</span>
                      <span>{currentLive.keysReceived}</span>
                    </button>
                    <span className="text-white/25 shrink-0">·</span>
                    <button
                      type="button"
                      onClick={() => sendLivePadlock(currentLive.id)}
                      title="Offrir 1 Cadenas 🔒 au créateur (+150 pts Cantine pour le créateur)"
                      className="text-sky-300 hover:bg-sky-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 sm:gap-1 shrink-0 cursor-pointer active:scale-90 transition-all"
                    >
                      <span>🔒</span>
                      <span>{currentLive.padlocksReceived}</span>
                    </button>
                    <span className="text-white/25 shrink-0">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        sendLiveLike(currentLive.id);
                        spawnFloatingEmoji('❤️');
                      }}
                      title="Envoyer un Cœur ❤️ au créateur"
                      className="text-pink-300 hover:bg-pink-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 sm:gap-1 shrink-0 cursor-pointer active:scale-90 transition-all"
                    >
                      <span>❤️</span>
                      <span>{currentLive.likesCount}</span>
                    </button>
                    <span className="text-white/25 shrink-0">·</span>
                    <button
                      type="button"
                      onClick={() => sendLiveSpecialGift(currentLive.id, 'ice_cone')}
                      title="Offrir une Glace Cornet 🍦 (+50 pts Cantine pour le créateur)"
                      className="text-rose-300 hover:bg-rose-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 sm:gap-1 shrink-0 cursor-pointer active:scale-90 transition-all"
                    >
                      <span>🍦</span>
                      <span>{currentLive.iceConesReceived || 0}</span>
                    </button>
                    <span className="text-white/25 shrink-0">·</span>
                    <button
                      type="button"
                      onClick={() => sendLiveSpecialGift(currentLive.id, 'water_bottle')}
                      title="Offrir une Bouteille d’eau 💧 (+75 pts Cantine pour le créateur)"
                      className="text-cyan-300 hover:bg-cyan-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 sm:gap-1 shrink-0 cursor-pointer active:scale-90 transition-all"
                    >
                      <span>💧</span>
                      <span>{currentLive.waterBottlesReceived || 0}</span>
                    </button>
                    <span className="text-white/25 shrink-0">·</span>
                    <button
                      type="button"
                      onClick={() => sendLiveSpecialGift(currentLive.id, 'canned_food')}
                      title="Offrir une Boîte de conserve 🥫 (+80 pts Cantine pour le créateur)"
                      className="text-orange-300 hover:bg-orange-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 sm:gap-1 shrink-0 cursor-pointer active:scale-90 transition-all"
                    >
                      <span>🥫</span>
                      <span>{currentLive.cansReceived || 0}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

          {/* CENTER-SCREEN SPECTACULAR LIVE GIFT ANIMATION OVERLAY (🔑 🔒 🍦 🍨 🥫) */}
          {!isCinemaMode && centerGiftBurst && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4 animate-fade-in">
              <div className="relative flex flex-col items-center justify-center">
                {/* Radiating neon shockwave rings */}
                <div
                  className={`absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 animate-ping opacity-40 ${
                    LIVE_GIFT_CONFIG[centerGiftBurst.giftType].ring
                  }`}
                />
                <div
                  className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 flex items-center justify-center backdrop-blur-md animate-bounce ${
                    LIVE_GIFT_CONFIG[centerGiftBurst.giftType].ring
                  } ${LIVE_GIFT_CONFIG[centerGiftBurst.giftType].glow}`}
                >
                  <span className="text-6xl sm:text-7xl drop-shadow-[0_0_24px_rgba(255,255,255,0.85)] select-none">
                    {LIVE_GIFT_CONFIG[centerGiftBurst.giftType].emoji}
                  </span>
                  <span className="absolute -top-2 -right-2 text-xl animate-pulse">✨</span>
                  <span className="absolute -bottom-1 -left-2 text-xl animate-pulse">⚡</span>
                </div>

                <div
                  className={`mt-2 px-4 py-1.5 rounded-full bg-gradient-to-r border text-white shadow-2xl flex items-center gap-2 ${
                    LIVE_GIFT_CONFIG[centerGiftBurst.giftType].gradient
                  }`}
                >
                  <span className="w-5 h-5 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0">
                    <AvatarDisplay avatar={centerGiftBurst.senderAvatar} alt={centerGiftBurst.senderName} />
                  </span>
                  <span className="text-xs sm:text-sm font-black tracking-wide">
                    {centerGiftBurst.senderName}
                  </span>
                  <span className="text-xs font-mono opacity-95">
                    envoie {LIVE_GIFT_CONFIG[centerGiftBurst.giftType].title}
                  </span>
                  <span className="text-sm sm:text-base font-black italic text-yellow-200 drop-shadow">
                    ×{centerGiftBurst.combo}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SLIDING LEFT LIVE GIFT COMBO BANNERS */}
          {!isCinemaMode && activeGiftBanners.length > 0 && (
            <div className="pointer-events-none absolute left-3 sm:left-5 bottom-28 z-30 flex flex-col gap-2 max-w-[78%] sm:max-w-xs">
              {activeGiftBanners.map((banner) => {
                const cfg = LIVE_GIFT_CONFIG[banner.giftType];
                return (
                  <div
                    key={banner.id}
                    className={`flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-full bg-gradient-to-r border text-white backdrop-blur-md animate-fade-in ${cfg.gradient} ${cfg.glow}`}
                  >
                    <span className="w-8 h-8 rounded-full bg-transparent border border-white/30 flex items-center justify-center text-base shrink-0 overflow-hidden">
                      <AvatarDisplay avatar={banner.senderAvatar} alt={banner.senderName} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black truncate leading-tight">
                        {banner.senderName}
                      </div>
                      <div className="text-[10px] font-mono text-white/90 truncate leading-tight">
                        a envoyé {cfg.title}
                      </div>
                    </div>
                    <span className="text-2xl animate-bounce shrink-0">{cfg.emoji}</span>
                    <span className="text-base sm:text-lg font-black italic tracking-tighter text-yellow-200 drop-shadow shrink-0">
                      ×{banner.combo}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating Reactions Burst Layer (visible par tous : hôte, co-hôtes & spectateurs) */}
          {!isCinemaMode && (
            <div className="pointer-events-none absolute right-5 bottom-24 w-16 h-44 overflow-visible z-20">
              {floatingReactions.map((item) => (
                <span
                  key={item.id}
                  className={`absolute bottom-0 ${item.offsetClass} text-2xl animate-bounce opacity-95 transition-all duration-700 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]`}
                >
                  {item.emoji}
                </span>
              ))}
            </div>
          )}

          {/* Multi-Live / Viewers Continuous Vertical Crossfade List (Photo + Pseudo, Unobstructed Safe Zone) */}
          {!isCinemaMode && !isExpandedChat && loopedLeftStreamEntries.length > 0 && (
            <div className="absolute left-2 sm:left-3.5 top-[225px] sm:top-[205px] bottom-[295px] sm:bottom-[310px] z-20 pointer-events-none flex flex-col justify-center">
              <div
                data-no-stage-tap="true"
                className="pointer-events-auto max-h-[240px] max-w-[140px] px-0.5 py-1 bg-transparent overflow-hidden flex items-stretch justify-start"
              >
                <div className="h-full overflow-y-auto no-scrollbar flex items-start justify-start">
                  <div className="flex flex-col items-start gap-2.5 py-1">
                    {loopedLeftStreamEntries.map((entry, idx) => {
                      const isCurrent = entry.kind === 'live' && entry.live.id === currentLive.id;
                      return (
                        <button
                          key={`${entry.key}_${idx}`}
                          type="button"
                          title={
                            entry.kind === 'viewer'
                              ? `Modérer ou bloquer ${entry.label}`
                              : entry.label
                          }
                          aria-label={entry.label}
                          onClick={() => {
                            if (entry.kind === 'viewer') {
                              setPendingBlockTarget({
                                userId: entry.userId,
                                matricule: entry.matricule,
                                alias: entry.label,
                                avatar: entry.avatar,
                              });
                              return;
                            }
                            if (isCurrent) return;
                            if (isHost) {
                              showToast({
                                title: 'Tu es actuellement en direct',
                                message: 'Termine d’abord ton Live (bouton Arrêter) avant de changer.',
                                type: 'info',
                              });
                              return;
                            }
                            handleJoinExistingLive(entry.live);
                          }}
                          className="flex items-center gap-1.5 max-w-[132px] shrink-0 cursor-pointer transition-transform hover:scale-105 active:scale-95 bg-transparent text-left"
                        >
                          <span
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-transparent ${
                              isCurrent
                                ? 'ring-2 ring-[#ff0050] shadow-[0_0_12px_rgba(255,0,80,0.85)]'
                                : entry.kind === 'viewer'
                                ? 'border border-emerald-400/75'
                                : 'border border-white/40'
                            }`}
                          >
                            <AvatarDisplay avatar={entry.avatar} alt={entry.label} />
                          </span>
                          <span className="text-[11px] font-bold text-white truncate max-w-[92px] leading-tight drop-shadow-[0_1px_4px_rgba(0,0,0,1)]">
                            {entry.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Spacer for unobstructed center screen (gifts and navigation are in the top header + swipe) */}
          <div className="flex-1 pointer-events-none" />

          {/* BOTTOM TRANSPARENT FULLSCREEN COMMENTS & COMPOSER OVERLAY */}
          {!isCinemaMode && (
            <div
              data-no-stage-tap="true"
              className="relative z-10 w-full shrink-0 pointer-events-auto bg-transparent px-3 pt-2 pb-2.5 sm:px-5 sm:pb-3 safe-area-bottom transition-all duration-300 ease-in-out opacity-100 translate-y-0"
            >
              <div className="w-full max-w-2xl mx-auto space-y-1.5 text-center">
                {/* Comments Header + Expand Height Toggle Centré */}
                <div className="flex items-center justify-center gap-2.5 px-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-transparent border border-white/20 text-[11px] font-mono text-zinc-100 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                    Chat en direct ·{' '}
                    <span className="text-white font-bold tabular-nums">{currentLive.comments.length}</span>{' '}
                    {currentLive.comments.length > 1 ? 'messages' : 'message'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsExpandedChat((v) => !v)}
                    className="w-7 h-7 rounded-full bg-transparent hover:bg-white/15 border border-white/20 text-sky-300 flex items-center justify-center cursor-pointer transition-all shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                    title={isExpandedChat ? 'Réduire le chat' : 'Agrandir le chat'}
                  >
                    {isExpandedChat ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>

                {/* Transparent Readable Scrolling Comments Box over Live Video */}
                <div
                  data-chat-scroll="true"
                  className={`${
                    isExpandedChat ? 'h-48 sm:h-56' : 'h-24 sm:h-32'
                  } transition-all duration-200 overflow-y-auto no-scrollbar space-y-1.5 rounded-2xl bg-transparent border border-white/20 p-2`}
                >
                  {currentLive.comments.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-start gap-2 px-2.5 py-1.5 rounded-xl text-xs max-w-full bg-transparent drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] ${
                        c.type === 'key_gift'
                          ? 'border border-amber-400/45 text-amber-100'
                          : c.type === 'padlock'
                          ? 'border border-sky-400/45 text-sky-100'
                          : c.type === 'ice_cone'
                          ? 'border border-pink-400/45 text-pink-100'
                          : c.type === 'water_bottle'
                          ? 'border border-cyan-400/45 text-cyan-100'
                          : c.type === 'canned_food'
                          ? 'border border-orange-400/45 text-orange-100'
                          : c.type === 'system'
                          ? 'border border-emerald-400/40 text-emerald-200'
                          : 'border border-white/15 text-white'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={c.type === 'system'}
                        onClick={() => {
                          if (c.type === 'system') return;
                          openUserProfile({
                            id: c.authorId,
                            matricule: c.authorName,
                            alias: c.authorName,
                            avatar: c.authorAvatar || '⛓️',
                          });
                        }}
                        className={`w-5 h-5 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 ${
                          c.type !== 'system'
                            ? 'hover:scale-110 active:scale-95 transition-transform cursor-pointer'
                            : ''
                        }`}
                        title={c.type !== 'system' ? `Voir le profil & l'univers de ${c.authorName}` : undefined}
                      >
                        <AvatarDisplay avatar={c.authorAvatar} alt={c.authorName} />
                      </button>
                      <div className="min-w-0 flex-1 text-left break-words leading-snug drop-shadow-[0_1px_4px_rgba(0,0,0,1)]">
                        <button
                          type="button"
                          disabled={c.type === 'system'}
                          onClick={() => {
                            if (c.type === 'system') return;
                            openUserProfile({
                              id: c.authorId,
                              matricule: c.authorName,
                              alias: c.authorName,
                              avatar: c.authorAvatar || '⛓️',
                            });
                          }}
                          className={`font-bold text-amber-300 mr-1.5 inline-flex items-center gap-1 ${
                            c.type !== 'system'
                              ? 'hover:underline cursor-pointer'
                              : ''
                          }`}
                          title={c.type !== 'system' ? `Voir le profil de ${c.authorName}` : undefined}
                        >
                          <span>{c.authorName}</span>
                        </button>
                        <span className="text-white">{c.content}</span>
                      </div>
                      {isHost && c.authorId !== user.id && c.type !== 'system' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingBlockTarget({
                              userId: c.authorId,
                              alias: c.authorName,
                              avatar: c.authorAvatar,
                            });
                          }}
                          title={`Bloquer ${c.authorName} de ce Live`}
                          aria-label={`Bloquer ${c.authorName}`}
                          className="w-6 h-6 rounded-full bg-transparent hover:bg-red-500/25 text-red-300 hover:text-red-200 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div ref={commentsEndRef} />
                </div>

                {/* Réactions visuelles instantanées & messages rapides (100% transparents, ouverts à tous les spectateurs) */}
                {!isHost && (
                  <div className="flex items-center justify-center gap-2 pb-0.5">
                    {['❤️', '🔥', '👏', '😂', '😮', '💯'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          sendLiveReaction(currentLive.id, emoji);
                          spawnFloatingEmoji(emoji);
                        }}
                        title={`Réagir avec ${emoji}`}
                        className="w-8 h-8 rounded-full bg-transparent hover:bg-white/15 border border-white/25 text-base flex items-center justify-center cursor-pointer active:scale-125 transition-transform drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick Live Chips — adaptées selon le rôle (Diffuseur vs Spectateur) */}
                <div
                  ref={liveQuickChipsRef}
                  className="w-full flex items-center justify-between gap-1.5 flex-nowrap overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain scroll-smooth no-scrollbar"
                >
                  {(isHost
                    ? [
                        '🙏 Merci pour le soutien !',
                        '🎥 Bienvenue sur le Live !',
                        '✋ Demandez pour monter à l’écran !',
                        '🔥 Force à tous !',
                        '🔑 Merci pour les clés !',
                        '💬 Posez vos questions !',
                      ]
                    : [
                        '🗝️ Force à toi !',
                        '🔓 Bientôt libre !',
                        '🔥 Force !',
                        '🔑 Bien dit !',
                        '🕊️ Évasion',
                        '🔒 Cadenas posé',
                        '👏 Bravo',
                      ]
                  ).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => sendLiveComment(currentLive.id, chip)}
                      className="px-2.5 py-1 rounded-full bg-transparent hover:bg-white/10 border border-white/20 text-[11px] text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] whitespace-nowrap cursor-pointer shrink-0 select-none"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Transparent Ergonomic Comment Composer */}
                <form
                  onSubmit={handleSendComment}
                  className="rounded-2xl bg-transparent border border-white/25 focus-within:border-[#00f2fe] p-2 flex items-end gap-2 transition-colors"
                >
                  <textarea
                    rows={isExpandedChat ? 2 : 1}
                    maxLength={500}
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (commentInput.trim()) {
                          handleSendComment(e);
                        }
                      }
                    }}
                    placeholder="Écrire ton commentaire en direct..."
                    className={`flex-1 bg-transparent text-xs sm:text-sm text-white placeholder:text-zinc-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] focus:outline-none resize-none leading-relaxed ${
                      isExpandedChat ? 'min-h-[54px]' : 'min-h-[36px]'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!commentInput.trim()}
                    className="px-3 h-9 rounded-xl bg-transparent hover:bg-[#ff0050]/40 border border-white/25 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer drop-shadow"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Envoyer</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* MODAL INVITATIONS & MULTI-ÉCRAN LIVE EN LIVE (2 À 5 SIMULTANÉMENT) */}
          {showStageInviteModal && (
            <div
              data-no-stage-tap="true"
              className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in"
              onClick={() => setShowStageInviteModal(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg max-h-[88dvh] rounded-3xl border border-white/15 bg-zinc-950 text-white shadow-2xl flex flex-col overflow-hidden"
              >
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black flex items-center gap-2">
                      {isHost ? (
                        <>
                          <Users className="w-4 h-4 text-[#00f2fe]" />
                          <span>Studio Multi-Écran ({stageCount}/5) & Annonce</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4 text-cyan-400" />
                          <span>Partager le Live & Inviter des amis</span>
                        </>
                      )}
                    </h3>
                    <p className="text-[11px] font-mono text-zinc-400">
                      {isHost
                        ? 'Gère les demandes pour monter à l’écran (jusqu’à 5), épingle une annonce ou invite des membres.'
                        : 'Partage le lien du direct ou invite des membres connectés à rejoindre ce Live.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStageInviteModal(false)}
                    className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                  {/* 1. Broadcast viewer invitation + copy link */}
                  <div className={`grid grid-cols-1 ${isHost ? 'sm:grid-cols-2' : ''} gap-2`}>
                    {isHost && (
                      <button
                        type="button"
                        onClick={() =>
                          void sendLiveInvite(currentLive.id, { targetUserId: 'ALL' }, 'viewer')
                        }
                        className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#ff0050] to-rose-500 hover:opacity-95 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Megaphone className="w-3.5 h-3.5" />
                        <span>Alerter tous les connectés</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/?notif=live&liveId=${encodeURIComponent(
                          currentLive.id
                        )}`;
                        void navigator.clipboard?.writeText(url);
                        setCopiedLiveLink(true);
                        window.setTimeout(() => setCopiedLiveLink(false), 2000);
                      }}
                      className="py-2.5 px-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedLiveLink ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-cyan-400" />
                      )}
                      <span>{copiedLiveLink ? 'Lien copié !' : 'Copier le lien du Live'}</span>
                    </button>
                  </div>

                  {/* 2. Host pinned announcement */}
                  {isHost && (
                    <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                      <label className="text-[11px] font-mono text-amber-300 font-bold flex items-center gap-1">
                        <Pin className="w-3.5 h-3.5" />
                        <span>Annonce épinglée en haut du Live</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={140}
                          value={announcementDraft}
                          onChange={(e) => setAnnouncementDraft(e.target.value)}
                          placeholder="Ex: Rejoignez-nous à 5 sur scène !"
                          className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => void updateLiveAnnouncement(currentLive.id, announcementDraft)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-mono font-bold cursor-pointer"
                        >
                          Épingler
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. Incoming viewer stage requests */}
                  {isHost && guestRequests.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                        Demandes pour monter à l&apos;écran ({guestRequests.length})
                      </div>
                      <div className="space-y-1.5">
                        {guestRequests.map((reqItem) => (
                          <div
                            key={reqItem.userId}
                            className="p-2.5 rounded-2xl bg-zinc-900 border border-amber-500/40 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-lg shrink-0 bg-zinc-800">
                                <AvatarDisplay avatar={reqItem.avatar} alt={reqItem.alias} />
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate">{reqItem.alias}</div>
                                <div className="text-[10px] font-mono text-zinc-400">
                                  {reqItem.matricule}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={stageCount >= 5}
                                onClick={() =>
                                  void approveGuestStageRequest(currentLive.id, reqItem.userId, true)
                                }
                                className="px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 text-[11px] font-mono font-bold cursor-pointer"
                              >
                                Accepter
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void approveGuestStageRequest(currentLive.id, reqItem.userId, false)
                                }
                                className="px-2 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono cursor-pointer"
                              >
                                Refuser
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Current on-screen participants (1..5) */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                      À l&apos;écran actuellement ({stageCount}/5)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {stageParticipants.map((p, idx) => (
                        <div
                          key={p.userId}
                          className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-base shrink-0 bg-zinc-800">
                              <AvatarDisplay avatar={p.avatar} alt={p.alias} />
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{p.alias}</div>
                              <div className="text-[10px] font-mono text-zinc-400">
                                {p.isHost ? 'Hôte principal' : `Invité #${idx + 1}`}
                              </div>
                            </div>
                          </div>
                          {isHost && !p.isHost && (
                            <button
                              type="button"
                              onClick={() => void removeOrLeaveLiveStage(currentLive.id, p.userId)}
                              className="px-2 py-1 rounded-lg bg-red-600/25 hover:bg-red-600/45 text-red-300 text-[10px] font-mono cursor-pointer"
                            >
                              Retirer
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 5. Invite connected or searched users */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
                        Utilisateurs connectés & communauté
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {onlineUsers.length} en ligne
                      </span>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        ref={stageInviteSearchInputRef}
                        type="text"
                        value={stageInviteSearch}
                        onChange={(e) => setStageInviteSearch(e.target.value)}
                        placeholder="Chercher un pseudo ou matricule à inviter..."
                        className="w-full pl-8 pr-8 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                      />
                      {stageInviteSearch.length > 0 && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setStageInviteSearch('');
                            stageInviteSearchInputRef.current?.focus();
                          }}
                          aria-label="Effacer les caractères saisis"
                          title="Effacer les caractères saisis"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto no-scrollbar">
                      {inviteCandidates.length === 0 ? (
                        <p className="text-xs font-mono text-zinc-500 py-2 text-center">
                          Aucun utilisateur trouvé. Partage le lien ou invite tous les connectés !
                        </p>
                      ) : (
                        inviteCandidates.map((cand) => {
                          const onStageAlready = stageParticipants.some(
                            (p) => p.userId === cand.id || p.matricule === cand.matricule
                          );
                          return (
                            <div
                              key={cand.id || cand.matricule}
                              className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="relative shrink-0">
                                  <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-base bg-zinc-800">
                                    <AvatarDisplay avatar={cand.avatar} alt={cand.alias} />
                                  </span>
                                  {cand.isOnlineNow && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-zinc-950" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold truncate flex items-center gap-1">
                                    <span className="truncate">{cand.alias || cand.matricule}</span>
                                    {cand.activeLiveId && (
                                      <span className="live-pseudo-pill px-1 rounded text-[8px] font-mono font-black">
                                        LIVE
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] font-mono text-zinc-500 truncate">
                                    {cand.matricule}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void sendLiveInvite(
                                      currentLive.id,
                                      { targetUserId: cand.id, targetMatricule: cand.matricule },
                                      'viewer'
                                    )
                                  }
                                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono font-bold cursor-pointer"
                                  title="Inviter à regarder ce Live"
                                >
                                  👁️ Inviter à voir
                                </button>
                                {isHost && !onStageAlready && (
                                  <button
                                    type="button"
                                    disabled={stageCount >= 5}
                                    onClick={() =>
                                      void sendLiveInvite(
                                        currentLive.id,
                                        { targetUserId: cand.id, targetMatricule: cand.matricule },
                                        'cohost'
                                      )
                                    }
                                    className="px-2 py-1 rounded-lg bg-[#ff0050] hover:bg-[#ff1a62] disabled:opacity-40 text-white text-[10px] font-mono font-bold cursor-pointer"
                                    title="Inviter sur l'écran (Live en Live à 2-5)"
                                  >
                                    🎥 Monter à l&apos;écran
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* MODAL SPECTATEURS EN DIRECT & MODÉRATION (BLOQUER) */}
          {showViewersModerationModal && isHost && (
            <div
              data-no-stage-tap="true"
              className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-md animate-fade-in"
              onClick={() => setShowViewersModerationModal(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md max-h-[80dvh] rounded-3xl border border-white/15 bg-zinc-950 text-white shadow-2xl flex flex-col overflow-hidden"
              >
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black flex items-center gap-2">
                      <Eye className="w-4 h-4 text-emerald-400" />
                      <span>Spectateurs & Modération ({currentLive.viewersCount})</span>
                    </h3>
                    <p className="text-[11px] font-mono text-zinc-400">
                      Bloque un spectateur : pour lui le Live sera immédiatement terminé.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowViewersModerationModal(false)}
                    className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                  {(() => {
                    const list: {
                      userId: string;
                      matricule?: string;
                      alias: string;
                      avatar: string;
                      source: string;
                    }[] = [];
                    const seen = new Set<string>();
                    const blockedSet = new Set(currentLive.blockedUserIds || []);

                    for (const v of currentLive.activeViewers || []) {
                      if (!v.userId || v.userId === user.id || seen.has(v.userId)) continue;
                      if (user.matricule && v.matricule === user.matricule) continue;
                      if (blockedSet.has(v.userId) || (v.matricule && blockedSet.has(v.matricule))) continue;
                      seen.add(v.userId);
                      list.push({
                        userId: v.userId,
                        matricule: v.matricule,
                        alias: v.alias || v.matricule,
                        avatar: v.avatar || '⛓️',
                        source: 'Regarde en direct',
                      });
                    }

                    if (list.length === 0) {
                      return (
                        <p className="text-xs font-mono text-zinc-500 text-center py-6">
                          Aucun spectateur en direct pour le moment.
                        </p>
                      );
                    }

                    return list.map((item) => (
                      <div
                        key={item.userId}
                        className="p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            openUserProfile({
                              id: item.userId,
                              matricule: item.matricule || item.alias,
                              alias: item.alias,
                              avatar: item.avatar,
                            })
                          }
                          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                        >
                          <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-zinc-800 shrink-0">
                            <AvatarDisplay avatar={item.avatar} alt={item.alias} />
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{item.alias}</div>
                            <div className="text-[10px] font-mono text-zinc-400 truncate">
                              {item.matricule ? `${item.matricule} · ` : ''}
                              {item.source}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void blockLiveViewer(currentLive.id, {
                              targetUserId: item.userId,
                              targetMatricule: item.matricule,
                              targetAlias: item.alias,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-red-600/85 hover:bg-red-500 text-white text-[11px] font-mono font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Ban className="w-3 h-3" />
                          <span>Bloquer</span>
                        </button>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* CONFIRMATION COMPACTE DE BLOCAGE */}
          {pendingBlockTarget && isHost && (
            <div
              data-no-stage-tap="true"
              className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
              onClick={() => setPendingBlockTarget(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-xs rounded-3xl border border-white/15 bg-zinc-950 p-5 text-center space-y-4 shadow-2xl"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden mx-auto bg-zinc-900 border border-white/20 flex items-center justify-center">
                  <AvatarDisplay
                    avatar={pendingBlockTarget.avatar || '⛓️'}
                    alt={pendingBlockTarget.alias}
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-white">
                    Bloquer {pendingBlockTarget.alias} ?
                  </h4>
                  <p className="text-[11px] font-mono text-zinc-400">
                    Cet utilisateur sera retiré immédiatement et verra « Live terminé ».
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingBlockTarget(null)}
                    className="flex-1 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-mono font-bold cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = pendingBlockTarget;
                      setPendingBlockTarget(null);
                      void blockLiveViewer(currentLive.id, {
                        targetUserId: target.userId,
                        targetMatricule: target.matricule,
                        targetAlias: target.alias,
                      });
                    }}
                    className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Bloquer</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const uniqueTopicSuggestions = Array.from(new Set([...customSalons.map((s) => s.tag), ...TOPIC_SUGGESTIONS]));

  // --- VIEW 2: LIVE LOBBY & STUDIO LAUNCHER ---
  return (
    <div className="space-y-4 pb-20">
      {/* End of Live Summary Banner */}
      {endedSummary && (
        <div
          className={`rounded-3xl p-5 border space-y-3 animate-fade-in ${
            theme === 'dark'
              ? 'bg-gradient-to-br from-emerald-950/60 via-zinc-900 to-zinc-950 border-emerald-500/40'
              : 'bg-emerald-50 border-emerald-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <div
              className={`flex items-center gap-2 font-mono text-xs font-bold ${
                theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>LIVE TERMINÉ · RÉCAPITULATIF</span>
            </div>
            <button
              type="button"
              onClick={() => setEndedSummary(null)}
              className={`cursor-pointer ${
                theme === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <h3 className={`text-base font-black ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
            {endedSummary.title}
          </h3>
          <div className="grid grid-cols-4 gap-2 text-center font-mono">
            <div
              className={`p-2 rounded-xl border ${
                theme === 'dark' ? 'bg-black/40 border-zinc-800' : 'bg-white border-emerald-200'
              }`}
            >
              <div className={`text-sm font-black ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                {formatTimer(endedSummary.durationSec)}
              </div>
              <div className="text-[10px] text-zinc-500">Durée</div>
            </div>
            <div
              className={`p-2 rounded-xl border ${
                theme === 'dark' ? 'bg-black/40 border-zinc-800' : 'bg-white border-emerald-200'
              }`}
            >
              <div className={`text-sm font-black ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>
                {endedSummary.keys}
              </div>
              <div className="text-[10px] text-zinc-500">Clés 🔑</div>
            </div>
            <div
              className={`p-2 rounded-xl border ${
                theme === 'dark' ? 'bg-black/40 border-zinc-800' : 'bg-white border-emerald-200'
              }`}
            >
              <div className={`text-sm font-black ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}>
                {endedSummary.padlocks}
              </div>
              <div className="text-[10px] text-zinc-500">Cadenas 🔒</div>
            </div>
            <div
              className={`p-2 rounded-xl border ${
                theme === 'dark' ? 'bg-black/40 border-zinc-800' : 'bg-white border-emerald-200'
              }`}
            >
              <div className={`text-sm font-black ${theme === 'dark' ? 'text-pink-400' : 'text-pink-600'}`}>
                {endedSummary.specialGifts}
              </div>
              <div className="text-[10px] text-zinc-500">🍦💧🥫</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {endedSummary.recordedClipRef && (
              <button
                type="button"
                onClick={() =>
                  downloadMediaAsset(endedSummary.recordedClipRef!, `evasion_live_${Date.now()}`)
                }
                className="flex-1 py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 font-mono font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger la vidéo du Live</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                createPost(
                  `🎬 Je viens de terminer mon Live « ${endedSummary.title} » (${formatTimer(endedSummary.durationSec)}) · ${endedSummary.keys} 🔑 reçues ! #LiveÉvasion`,
                  'ecrans',
                  undefined,
                  5,
                  undefined,
                  endedSummary.recordedClipRef
                    ? {
                        videoUrl: endedSummary.recordedClipRef,
                        duration: endedSummary.recordedClipDuration || 10,
                      }
                    : undefined
                );
                setEndedSummary(null);
              }}
              className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs cursor-pointer"
            >
              Partager le bilan sur Le Mur 🔑
            </button>
          </div>
        </div>
      )}

      {/* Sélecteur d'Espace Live : 1) Regarder un Live (Spectateur) vs 2) Faire un Live (Studio Créateur) */}
      <div
        className={`rounded-3xl p-2 border grid grid-cols-2 gap-2 ${
          theme === 'dark'
            ? 'bg-transparent border-white/15'
            : 'bg-white/40 border-zinc-200/80 backdrop-blur-xs'
        }`}
      >
        <button
          type="button"
          onClick={() => setLobbyRoleTab('watch')}
          className={`py-3 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            lobbyRoleTab === 'watch'
              ? 'evasion-btn-primary text-white shadow-md'
              : theme === 'dark'
              ? 'bg-transparent text-zinc-400 hover:text-white hover:bg-white/5'
              : 'bg-transparent text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
          }`}
        >
          <Eye className="w-4 h-4 shrink-0" />
          <span>Regarder un Live</span>
          {activeLives.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-black/30 text-[10px] font-mono font-black">
              {activeLives.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setLobbyRoleTab('broadcast')}
          className={`py-3 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            lobbyRoleTab === 'broadcast'
              ? 'evasion-btn-primary text-white shadow-md'
              : theme === 'dark'
              ? 'bg-transparent text-zinc-400 hover:text-white hover:bg-white/5'
              : 'bg-transparent text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
          }`}
        >
          <Radio className="w-4 h-4 shrink-0" />
          <span>Faire un Live · Studio</span>
        </button>
      </div>

      {/* ESPACE 1 : REGARDER UN LIVE & EXPLORER (SPECTATEUR) */}
      {lobbyRoleTab === 'watch' && (
        <>
          {/* Section Médias de tous les utilisateurs de l'app (Naviguer, Regarder, Donner 🔑 ou 🔒) */}
          <LiveMediaExplorer />

          {/* Active Lives List Centrée */}
      <div
        className={`rounded-3xl p-4 sm:p-5 border space-y-3 text-center ${
          theme === 'dark' ? 'bg-transparent border-white/15' : 'bg-white/40 border-zinc-200/80 backdrop-blur-xs'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="flex items-center justify-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff0050] animate-ping" />
            <h2 className={`text-sm sm:text-base font-black ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
              Lives en direct
            </h2>
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className={`text-xs font-mono flex items-center gap-1.5 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-700 font-semibold'}`}>
              <Users className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-emerald-500' : 'text-emerald-600'}`} />
              <span>{activeLives.length} en cours</span>
              <span
                className={`px-2 py-0.5 rounded-full border text-[10px] inline-flex items-center gap-1 font-bold ${
                  theme === 'dark'
                    ? 'border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Temps réel</span>
              </span>
            </span>

            <button
              type="button"
              onClick={() => {
                ensureViewerAudioUnlocked();
                setViewerMuted(false);
                showToast({
                  title: 'Réception audio prête 🔊',
                  message: 'Le son démarrera instantanément dès l’ouverture d’un Live.',
                  type: 'success',
                });
              }}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                audioOutputUnlocked
                  ? theme === 'dark'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : theme === 'dark'
                  ? 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-400/50 text-cyan-200'
                  : 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-800'
              }`}
              title="Pré-autoriser la lecture du son sur ton appareil avant d’entrer dans un Live"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{audioOutputUnlocked ? 'Son prêt ✓' : 'Activer le son'}</span>
            </button>

            {activeLives.length > 0 && (
              <button
                type="button"
                onClick={() => handleJoinExistingLive(activeLives[0])}
                className="px-3.5 py-1.5 rounded-xl bg-[#ff0050] hover:bg-[#ff1a62] text-white text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-95 transition-transform"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {activeLives.length > 1 ? `Défiler & regarder (${activeLives.length})` : 'Regarder'}
                </span>
              </button>
            )}
          </div>
        </div>

        {activeLives.length === 0 ? (
          <div
            className={`py-6 px-4 rounded-2xl border text-center space-y-2 ${
              theme === 'dark'
                ? 'bg-transparent border-white/15'
                : 'bg-white/30 border-zinc-200/80'
            }`}
          >
            <Radio className="w-8 h-8 text-[#ff0050]/75 mx-auto animate-pulse" />
            <p className={`text-xs font-bold ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-800'}`}>
              {justEndedNotice
                ? 'Plus de Live en cours · Le direct vient de se terminer'
                : 'Aucun Live en direct pour le moment'}
            </p>
            <p className={`text-[11px] max-w-xs mx-auto ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {justEndedNotice
                ? 'La diffusion s’est arrêtée en temps réel. Dès qu’un nouveau Live démarre, il apparaîtra ici instantanément.'
                : 'Suivi en temps réel actif : dès qu’un créateur lance un Live, il s’affichera instantanément ici !'}
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
              {justEndedNotice && (
                <button
                  type="button"
                  onClick={() => setJustEndedNotice(null)}
                  className={`px-3 py-1.5 rounded-full bg-transparent border text-[11px] font-mono font-bold cursor-pointer ${
                    theme === 'dark'
                      ? 'border-white/20 text-zinc-300 hover:text-white'
                      : 'border-zinc-300 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  OK
                </button>
              )}
              <button
                type="button"
                onClick={() => setLobbyRoleTab('broadcast')}
                className="px-4 py-2 rounded-full evasion-btn-primary text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Ouvrir le Studio pour faire un Live</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-0.5 no-scrollbar ${
              activeLives.length > 2 ? 'live-mask-fade-soft py-2' : ''
            }`}
          >
            {activeLives.slice(0, 24).map((live) => {
              const liveNeon = live.hostId === user.id ? user.neonColor : live.hostNeonColor;
              const liveFrame = live.hostId === user.id ? user.cellBorderFrame : live.hostFrame;
              const stageParticipantsCount = 1 + (live.guests?.length || 0);
              return (
                <button
                  key={live.id}
                  type="button"
                  onClick={() => handleJoinExistingLive(live)}
                  className={`p-3.5 rounded-2xl border text-left space-y-2 transition-all cursor-pointer group live-card-glow ${
                    theme === 'dark'
                      ? 'bg-gradient-to-br from-[#ff0050]/15 via-zinc-950 to-zinc-900'
                      : 'bg-gradient-to-br from-rose-50 via-white to-zinc-50 shadow-xs'
                  } ${
                    liveFrame && liveFrame !== 'none'
                      ? getCellFrameClasses(liveFrame, liveNeon, theme)
                      : theme === 'dark'
                      ? 'border-[#ff0050]/50 hover:border-[#00f2fe]'
                      : 'border-rose-300 hover:border-[#ff0050]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="live-pseudo-pill px-2 py-0.5 rounded-full text-white font-mono font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span>LIVE</span>
                      </span>
                      {stageParticipantsCount > 1 && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full border font-mono font-bold text-[10px] ${
                            theme === 'dark'
                              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                              : 'bg-cyan-50 border-cyan-300 text-cyan-800'
                          }`}
                        >
                          🎥 {stageParticipantsCount}/5 à l&apos;écran
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-mono flex items-center gap-1 ${
                        theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'
                      }`}
                    >
                      <Eye className="w-3 h-3 text-emerald-500" />
                      <span className="tabular-nums">{live.viewersCount}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="live-avatar-aura shrink-0">
                      <span
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-lg overflow-hidden ${
                          theme === 'dark' ? 'bg-zinc-900' : 'bg-white'
                        } ${
                          liveNeon ? getNeonAvatarRingClass(liveNeon, theme) : ''
                        }`}
                      >
                        <AvatarDisplay avatar={live.hostAvatar} alt={live.hostName} />
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-bold truncate transition-colors ${
                          theme === 'dark'
                            ? 'text-white group-hover:text-amber-300'
                            : 'text-zinc-900 group-hover:text-[#ff0050]'
                        }`}
                      >
                        {live.title}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 truncate flex items-center gap-1">
                        <span className={liveNeon ? getNeonTextClass(liveNeon, theme) : ''}>
                          @{live.hostName}
                        </span>
                        {live.guests && live.guests.length > 0 && (
                          <span className={`font-bold ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-700'}`}>
                            +{live.guests.length} invité{live.guests.length > 1 ? 's' : ''}
                          </span>
                        )}
                        <span>·</span>
                        <span className={theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}>
                          {live.topicTag}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Détection instantanée des utilisateurs connectés en ce moment & statut Live (Centré, véridique) */}
      {(() => {
        const otherOnlineUsers = onlineUsers.filter(
          (ou) => ou.id !== user.id && (!user.matricule || ou.matricule !== user.matricule)
        );
        if (otherOnlineUsers.length === 0) return null;
        return (
        <div
          className={`rounded-3xl p-4 border space-y-2.5 text-center ${
            theme === 'dark' ? 'bg-transparent border-white/15' : 'bg-white/40 border-zinc-200/80 backdrop-blur-xs'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className={`text-xs sm:text-sm font-black font-mono uppercase tracking-wider ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                Connectés sur ÉVASION ({otherOnlineUsers.length})
              </h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              Aura animée = en Live 🔴
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {otherOnlineUsers.map((ou) => (
              <div
                key={ou.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-2xl border shrink-0 ${
                  ou.activeLiveId
                    ? theme === 'dark'
                      ? 'bg-[#ff0050]/10 border-[#ff0050]/50'
                      : 'bg-rose-50 border-rose-300'
                    : theme === 'dark'
                    ? 'bg-zinc-950/80 border-zinc-800'
                    : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <LiveAvatarWrapper userId={ou.id} matricule={ou.matricule}>
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm overflow-hidden ${
                      theme === 'dark' ? 'bg-zinc-900' : 'bg-white'
                    }`}
                  >
                    <AvatarDisplay avatar={ou.avatar} alt={ou.alias} />
                  </span>
                </LiveAvatarWrapper>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-bold truncate max-w-[95px] ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                      {ou.alias || ou.matricule}
                    </span>
                    <LivePseudoBadge userId={ou.id} matricule={ou.matricule} compact />
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate">
                    {ou.activeLiveId ? (ou.isCoHost ? 'Co-hôte en Live' : 'Diffuse en direct') : ou.matricule}
                  </div>
                </div>
                {ou.id !== user.id && !ou.activeLiveId && (
                  <button
                    type="button"
                    onClick={() =>
                      openDirectChat({
                        id: ou.id,
                        matricule: ou.matricule,
                        alias: ou.alias,
                        avatar: ou.avatar,
                        neonColor: ou.neonColor,
                      })
                    }
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-400'
                        : 'bg-cyan-100 hover:bg-cyan-200 text-cyan-800 border border-cyan-300'
                    }`}
                  >
                    MP
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {/* Recherche de Détenu & Discussion Privée Centrée */}
      <div
        className={`rounded-3xl p-5 border space-y-3 text-center ${
          theme === 'dark' ? 'bg-transparent border-white/15' : 'bg-white/40 border-zinc-200/80 backdrop-blur-xs'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-1.5">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Search className="w-4 h-4 text-cyan-500" />
            <h3 className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
              Rechercher un Détenu · MP Direct
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                hasFullKeyAccess
                  ? theme === 'dark'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : theme === 'dark'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {hasFullKeyAccess ? 'Débloqué 🔑' : '🔒 10 🔑 requises'}
            </span>
          </div>
          {availableInmates.length > 0 && (
            <span className={`text-xs font-mono font-bold ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-700'}`}>
              {availableInmates.length} en ligne
            </span>
          )}
        </div>

        {!hasFullKeyAccess && (
          <div
            className={`px-3 py-2 rounded-xl border text-[11px] font-mono text-center ${
              theme === 'dark'
                ? 'bg-amber-950/25 border-amber-500/30 text-amber-300'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            🔒 Les Messages Privés (MP) s&apos;ouvrent à partir de 10 🔑 (crée des aveux + valide la Mission du Jour). Le visionnage des Lives reste libre !
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 text-[#ef4444] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            ref={liveSearchInputRef}
            type="text"
            value={liveSearchQuery}
            onChange={(e) => setLiveSearchQuery(e.target.value)}
            placeholder="Chercher un détenu par pseudo ou matricule pour discuter en privé (MP)..."
            className={`w-full pl-11 pr-9 py-2.5 rounded-full border text-xs font-mono focus:outline-none ${
              theme === 'dark'
                ? 'bg-transparent border-white/15 text-white placeholder:text-zinc-500 focus:border-[#f97316]'
                : 'bg-white/40 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-cyan-500'
            }`}
          />
          {liveSearchQuery.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLiveSearchQuery('');
                liveSearchInputRef.current?.focus();
              }}
              aria-label="Effacer les caractères saisis"
              title="Effacer les caractères saisis"
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full cursor-pointer ${
                theme === 'dark' ? 'text-zinc-400 hover:text-white hover:bg-zinc-800/70' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {liveSearchQuery.trim() && (
          <div className="max-h-44 overflow-y-auto space-y-1.5 pt-1 no-scrollbar">
            {isSearchingInmates ? (
              <p className="text-xs font-mono text-zinc-500 px-1">Recherche en cours...</p>
            ) : liveSearchResults.length === 0 ? (
              <p className="text-xs font-mono text-zinc-500 px-1">
                Aucun détenu correspondant à "{liveSearchQuery}".
              </p>
            ) : (
              liveSearchResults.map((inmate) => (
                <button
                  key={inmate.matricule}
                  type="button"
                  onClick={() => {
                    openDirectChat(inmate);
                    setLiveSearchQuery('');
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-2xl border text-xs font-mono transition-all cursor-pointer group ${
                    theme === 'dark'
                      ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 hover:border-cyan-500/50 text-zinc-200'
                      : 'bg-zinc-50 hover:bg-cyan-50 border-zinc-200 hover:border-cyan-400 text-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-base shrink-0">
                      <AvatarDisplay avatar={inmate.avatar} alt={inmate.alias} />
                    </span>
                    <div className="text-left min-w-0">
                      <div
                        className={`font-bold truncate ${
                          theme === 'dark'
                            ? 'text-white group-hover:text-cyan-300'
                            : 'text-zinc-900 group-hover:text-cyan-700'
                        }`}
                      >
                        {inmate.alias || inmate.matricule}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate">{inmate.matricule}</div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border shrink-0 ${
                      theme === 'dark'
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                        : 'bg-cyan-50 text-cyan-700 border-cyan-300'
                    }`}
                  >
                    💬 Ouvrir MP
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* N'afficher la barre des détenus disponibles que s'il y a de vrais utilisateurs actifs */}
        {availableInmates.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => liveInmatesScrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
              aria-label="Défiler vers la gauche"
              className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                  : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div
              ref={liveInmatesScrollRef}
              className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1"
            >
              {availableInmates.map((inmate) => (
                <button
                  key={inmate.matricule}
                  type="button"
                  onClick={() => openDirectChat(inmate)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs font-mono shrink-0 transition-all cursor-pointer group shadow-xs ${
                    theme === 'dark'
                      ? 'bg-zinc-950/80 hover:bg-zinc-800/90 border-zinc-800 hover:border-cyan-500/50 text-zinc-200'
                      : 'bg-zinc-50 hover:bg-cyan-50 border-zinc-200 hover:border-cyan-400 text-zinc-800'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-base shrink-0">
                    <AvatarDisplay avatar={inmate.avatar} alt={inmate.alias} />
                  </span>
                  <div className="text-left">
                    <div
                      className={`font-bold transition-colors truncate max-w-[110px] ${
                        theme === 'dark'
                          ? 'text-white group-hover:text-cyan-300'
                          : 'text-zinc-900 group-hover:text-cyan-700'
                      }`}
                    >
                      {inmate.alias || inmate.matricule}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-normal truncate max-w-[110px]">
                      {inmate.matricule}
                    </div>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      theme === 'dark'
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                        : 'bg-cyan-50 text-cyan-700 border-cyan-300'
                    }`}
                  >
                    💬 MP
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => liveInmatesScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
              aria-label="Défiler vers la droite"
              className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                  : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
        </>
      )}

      {/* ESPACE 2 : FAIRE UN LIVE · STUDIO CRÉATEUR (DIFFUSEUR) */}
      {lobbyRoleTab === 'broadcast' && (
        <div className="space-y-4 animate-fade-in">
          {/* Studio "Passer en LIVE 🔴" Centré */}
          <form
            onSubmit={handleGoLive}
            className={`rounded-3xl p-5 border space-y-4 text-center ${
              theme === 'dark'
                ? 'bg-transparent border-white/15'
                : 'bg-white/40 border-zinc-200/80 backdrop-blur-xs'
            }`}
          >
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#ef4444] via-[#f97316] to-[#fbbf24] flex items-center justify-center text-white shadow-[0_0_22px_rgba(239,68,68,0.45)]">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h3 className={`text-base font-black ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
              Studio Live
            </h3>
            <p className={`text-xs font-mono ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Plein écran fluide, chat lisible, dons de 🔑 🔒 🍦 💧 🥫 en haut
            </p>
          </div>
        </div>

        {/* Explicit 1-Click Camera & Mic Permission Box + Device Guidance + Preview */}
        <div
          className={`p-3.5 rounded-2xl border space-y-3 text-center ${
            theme === 'dark' ? 'bg-transparent border-white/15' : 'bg-white/30 border-zinc-200/80'
          }`}
        >
          {/* Separate Live Status Indicators for Camera & Microphone */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono">
            <span
              className={`px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 font-bold ${
                camGranted || permSummary.camera === 'granted'
                  ? theme === 'dark'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : permSummary.camera === 'denied'
                  ? theme === 'dark'
                    ? 'bg-red-500/15 border-red-500/40 text-red-300'
                    : 'bg-red-50 border-red-300 text-red-700'
                  : theme === 'dark'
                  ? 'bg-amber-500/10 border-amber-500/35 text-amber-300'
                  : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>
                Caméra :{' '}
                {camGranted || permSummary.camera === 'granted'
                  ? 'Autorisée ✓'
                  : permSummary.camera === 'denied'
                  ? 'Bloquée'
                  : 'À autoriser'}
              </span>
            </span>

            <span
              className={`px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 font-bold ${
                permSummary.microphone === 'granted' ||
                Boolean(streamRef.current?.getAudioTracks().some((t) => t.readyState === 'live'))
                  ? theme === 'dark'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : permSummary.microphone === 'denied'
                  ? theme === 'dark'
                    ? 'bg-red-500/15 border-red-500/40 text-red-300'
                    : 'bg-red-50 border-red-300 text-red-700'
                  : theme === 'dark'
                  ? 'bg-amber-500/10 border-amber-500/35 text-amber-300'
                  : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>
                Micro (Son) :{' '}
                {permSummary.microphone === 'granted' ||
                Boolean(streamRef.current?.getAudioTracks().some((t) => t.readyState === 'live'))
                  ? 'Autorisé ✓'
                  : permSummary.microphone === 'denied'
                  ? 'Bloqué'
                  : 'À autoriser'}
              </span>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={camRequesting}
              onClick={() => {
                userPausedPreviewRef.current = false;
                void attachCameraStream(facingMode);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                camGranted
                  ? theme === 'dark'
                    ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                    : 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                  : 'bg-[#ff0050] hover:bg-[#ff1a62] text-white shadow-sm'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>
                {camRequesting
                  ? 'Demande en cours...'
                  : camGranted
                  ? 'Tester / Réinitialiser'
                  : 'Autoriser Caméra & Micro (1 clic)'}
              </span>
            </button>

            {!camGranted && (
              <button
                type="button"
                disabled={camRequesting}
                onClick={async () => {
                  const ok = await attachAudioOnlyStream();
                  if (ok) {
                    setCamEnabled(false);
                    showToast({
                      title: 'Micro activé 🎙️',
                      message: 'Tu es prêt à lancer un Live en Audio seul !',
                      type: 'success',
                    });
                  }
                }}
                className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                  theme === 'dark'
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-emerald-500/45 text-emerald-300'
                    : 'bg-white hover:bg-emerald-50 border-emerald-300 text-emerald-700'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Audio seul (Micro)</span>
              </button>
            )}

            {camGranted && streamRef.current && (
              <button
                type="button"
                onClick={() => {
                  userPausedPreviewRef.current = true;
                  stopStream();
                }}
                className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                  theme === 'dark'
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                    : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
                }`}
                title="Arrêter l'aperçu caméra et éteindre le capteur"
              >
                <VideoOff className="w-3.5 h-3.5 text-red-400" />
                <span>Couper caméra</span>
              </button>
            )}
          </div>

          {camEnabled &&
            camGranted &&
            streamRef.current &&
            streamRef.current.getVideoTracks().some((t) => t.readyState === 'live') && (
            <div
              className={`relative rounded-xl overflow-hidden bg-gradient-to-br from-[#ff0050]/15 via-zinc-950 to-[#00f2fe]/15 border border-zinc-800 aspect-[16/9] max-h-52 flex items-center justify-center ${
                isEnlargedZoom ? 'p-0' : 'p-1.5'
              }`}
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[11px] font-mono text-zinc-400">Aperçu caméra actif…</span>
              </div>
              <div className={`relative z-[1] w-full h-full flex items-center justify-center transition-transform duration-200 ${activeZoom.wrapperClass}`}>
                <video
                  ref={(el) => {
                    previewStudioVideoRef.current = el;
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      attachStreamToVideoElement(el, streamRef.current);
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    e.currentTarget.play().catch(() => {});
                  }}
                  className={`w-full h-full ${isEnlargedZoom ? 'object-cover' : 'object-contain rounded-lg'} ${
                    facingMode === 'user' ? '-scale-x-100' : ''
                  } ${(LIVE_FILTERS.find((f) => f.id === liveFilter) || LIVE_FILTERS[0]).css}`}
                />
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCycleZoom}
                  className={`px-2.5 h-7 rounded-full border text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                      activeZoom.scale >= 2.0
                        ? 'bg-transparent border-[#00f2fe] text-[#00f2fe]'
                        : 'bg-transparent border-white/25 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]'
                    }`}
                  title={
                    zoomDirection === 1
                      ? 'Agrandir jusqu’à 2.0× puis diminuer'
                      : 'Diminuer le zoom jusqu’à 0.75×'
                  }
                >
                  {zoomDirection === 1 ? (
                    <ZoomIn className="w-3 h-3 text-[#00f2fe]" />
                  ) : (
                    <ZoomOut className="w-3 h-3 text-amber-300" />
                  )}
                  <span className="tabular-nums">{activeZoom.label}</span>
                  <span className="text-zinc-400">{zoomDirection === 1 ? '+' : '−'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="w-7 h-7 rounded-full bg-transparent border border-white/25 text-white flex items-center justify-center cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                  title="Retourner la caméra"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {(camError ||
            permSummary.camera === 'denied' ||
            permSummary.microphone === 'denied' ||
            showPermissionHelp) && (() => {
            const guide = getMediaPermissionGuideSteps();
            const inFrame = isInsideEmbeddedFrame();
            return (
              <div
                className={`p-3 rounded-xl border text-left space-y-2 ${
                  theme === 'dark'
                    ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                    : 'bg-amber-50 border-amber-300 text-amber-900'
                }`}
              >
                {camError && (
                  <p className="text-[11px] font-semibold leading-snug">{camError}</p>
                )}
                <div className="text-[11px] space-y-1">
                  <div className="font-mono font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Déblocage rapide ({guide.platformLabel}) :</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px] opacity-90">
                    {guide.steps.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ol>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => attachCameraStream(facingMode)}
                    className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Réessayer</span>
                  </button>
                  {inFrame && typeof window !== 'undefined' && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`px-3 py-1 rounded-lg border text-[11px] font-mono font-bold inline-flex items-center gap-1 ${
                        theme === 'dark'
                          ? 'border-white/25 text-white hover:bg-white/10'
                          : 'border-zinc-400 text-zinc-900 hover:bg-white'
                      }`}
                    >
                      <span>Ouvrir hors cadre ↗</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Title */}
        <div>
          <label className={`block text-xs font-mono mb-1.5 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Titre de ton Live
          </label>
          <input
            type="text"
            maxLength={60}
            value={liveTitle}
            onChange={(e) => setLiveTitle(e.target.value)}
            placeholder="Ex: Session Détox en direct, discussion sans filtre..."
            className={`w-full px-4 py-2.5 rounded-full border text-sm focus:outline-none ${
              theme === 'dark'
                ? 'bg-[#090707] border-[#ef4444]/25 text-white placeholder:text-zinc-500 focus:border-[#f97316]'
                : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-[#ef4444]'
            }`}
          />
        </div>

        {/* #Sujet selection + custom topic */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className={`block text-xs font-mono ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Sujet du Live (#)
            </label>
            <button
              type="button"
              onClick={() => setShowCustomTopicInput((v) => !v)}
              className={`text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer ${
                theme === 'dark' ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-600'
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Créer un #sujet</span>
            </button>
          </div>

          {showCustomTopicInput && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={28}
                value={customTopicInput}
                onChange={(e) => setCustomTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTopic();
                  }
                }}
                placeholder="Ex: Nuit, Musique, Lecture..."
                className={`flex-1 px-3 py-1.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-emerald-400 ${
                  theme === 'dark'
                    ? 'bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-500'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
              <button
                type="button"
                onClick={handleAddCustomTopic}
                disabled={!customTopicInput.trim()}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-mono font-bold text-xs cursor-pointer"
              >
                OK
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => liveTopicsScrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
              aria-label="Défiler les sujets vers la gauche"
              className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                  : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div
              ref={liveTopicsScrollRef}
              className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5"
            >
              {uniqueTopicSuggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setLiveTopic(tag)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                    liveTopic === tag
                      ? theme === 'dark'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-amber-50 border-amber-400 text-amber-800'
                      : theme === 'dark'
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      : 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => liveTopicsScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
              aria-label="Défiler les sujets vers la droite"
              className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                  : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Camera, Mic & Filter options */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
            <span className={`text-xs font-mono ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Filtre :
            </span>
            {LIVE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setLiveFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border cursor-pointer ${
                  liveFilter === f.id
                    ? theme === 'dark'
                      ? 'bg-[#00f2fe]/20 border-[#00f2fe] text-[#00f2fe] font-bold'
                      : 'bg-cyan-50 border-cyan-500 text-cyan-700 font-bold'
                    : theme === 'dark'
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleMic}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1 cursor-pointer ${
                micEnabled
                  ? theme === 'dark'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : theme === 'dark'
                  ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-600'
              }`}
            >
              {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              <span>{micEnabled ? 'Micro ON' : 'Micro coupé'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleCam}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1 cursor-pointer ${
                camEnabled
                  ? theme === 'dark'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : theme === 'dark'
                  ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-600'
              }`}
            >
              {camEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
              <span>{camEnabled ? 'Caméra ON' : 'Audio seul'}</span>
            </button>
          </div>
        </div>

        {/* Key Threshold Gate to Launch a Live (50 keys minimum required) */}
        <div
          className={`p-3.5 rounded-2xl border space-y-2.5 ${
            hasEnoughKeysForLive
              ? theme === 'dark'
                ? 'bg-emerald-950/25 border-emerald-500/40'
                : 'bg-emerald-50 border-emerald-300'
              : theme === 'dark'
              ? 'bg-amber-950/25 border-amber-500/45'
              : 'bg-amber-50 border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-mono font-bold">
              <Key className={`w-4 h-4 ${hasEnoughKeysForLive ? 'text-emerald-500' : 'text-amber-500'}`} />
              <span
                className={
                  hasEnoughKeysForLive
                    ? theme === 'dark'
                      ? 'text-emerald-300'
                      : 'text-emerald-800'
                    : theme === 'dark'
                    ? 'text-amber-300'
                    : 'text-amber-800'
                }
              >
                {hasEnoughKeysForLive
                  ? `Accès Live débloqué (${user.keysAvailable} 🔑)`
                  : `Minimum ${LIVE_MIN_KEYS_REQUIRED} 🔑 requises pour lancer un Live`}
              </span>
            </div>
            <span
              className={`text-[11px] font-mono font-black tabular-nums px-2 py-0.5 rounded-full border ${
                theme === 'dark'
                  ? 'bg-black/40 border-white/10 text-white'
                  : 'bg-white border-zinc-200 text-zinc-900'
              }`}
            >
              {LIVE_MIN_KEYS_REQUIRED <= 0
                ? 'Accès Live ouvert ✓'
                : `${Math.min(user.keysAvailable || 0, LIVE_MIN_KEYS_REQUIRED)} / ${LIVE_MIN_KEYS_REQUIRED} 🔑`}
            </span>
          </div>

          <div className={`h-1.5 w-full rounded-full overflow-hidden ${theme === 'dark' ? 'bg-zinc-900' : 'bg-zinc-200'}`}>
            <div
              style={{
                width: `${
                  LIVE_MIN_KEYS_REQUIRED <= 0
                    ? 100
                    : Math.min(100, Math.round(((user.keysAvailable || 0) / LIVE_MIN_KEYS_REQUIRED) * 100))
                }%`,
              }}
              className={`h-full rounded-full transition-all duration-300 ${
                hasEnoughKeysForLive ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </div>

          {!hasEnoughKeysForLive && (
            <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
              <p className={`text-[11px] leading-snug ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Il te manque{' '}
                <strong className={theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}>
                  {missingKeysForLive} clé{missingKeysForLive > 1 ? 's' : ''}
                </strong>{' '}
                (réussir une Détox, une Mission IRL ou passer par la Boutique).
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={claimDailyBonusKeys}
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-mono font-bold cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-amber-300'
                      : 'bg-white hover:bg-zinc-100 border-zinc-300 text-amber-700'
                  }`}
                >
                  +3 Clés
                </button>
                <button
                  type="button"
                  onClick={() => openShop()}
                  className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[11px] font-mono font-black cursor-pointer"
                >
                  Boutique 🔑
                </button>
              </div>
            </div>
          )}
        </div>

        {/* GO LIVE CTA */}
        <button
          type="submit"
          className={`w-full py-3.5 rounded-full font-black text-sm tracking-wide uppercase flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
            hasEnoughKeysForLive
              ? 'evasion-btn-primary text-white'
              : theme === 'dark'
              ? 'bg-[#090707] border border-amber-500/40 text-amber-300 hover:bg-zinc-900'
              : 'bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100'
          }`}
        >
          {hasEnoughKeysForLive ? (
            <>
              <Radio className="w-4 h-4 animate-pulse" />
              <span>Passer en LIVE 🔴</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 text-amber-500" />
              <span>Débloquer le Live ({LIVE_MIN_KEYS_REQUIRED} 🔑 requises)</span>
            </>
          )}
        </button>
      </form>
        </div>
      )}
    </div>
  );
};
