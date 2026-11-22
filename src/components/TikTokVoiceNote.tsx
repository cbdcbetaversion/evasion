import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Mic, Play, Pause, Trash2, Check, Square, Volume2, X, Send } from 'lucide-react';
import { soundEngine } from '../utils/audio';
import {
  saveMediaBlob,
  resolveMediaBlob,
  processAudioFile,
  revokeMediaUrlOrRef,
  MAX_MEDIA_FILE_SIZE_BYTES,
} from '../utils/mediaStore';

interface TikTokVoicePlayerProps {
  audioData?: string;
  duration: number;
  compact?: boolean;
  isMe?: boolean;
  hideSpeed?: boolean;
  onDelete?: () => void;
  onMediaError?: () => void;
}

export const TikTokVoicePlayer: React.FC<TikTokVoicePlayerProps> = ({
  audioData,
  duration,
  compact = false,
  isMe = false,
  hideSpeed = false,
  onDelete,
  onMediaError,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(Math.max(1, duration || 3));
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const webAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fallbackCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const errorReportedRef = useRef(false);
  const onMediaErrorRef = useRef(onMediaError);
  onMediaErrorRef.current = onMediaError;

  const reportErrorOnce = () => {
    if (errorReportedRef.current) return;
    errorReportedRef.current = true;
    onMediaErrorRef.current?.();
  };

  // Clean minimalist waveform bar heights
  const bars = useMemo(() => {
    const seedStr = audioData ? audioData.slice(-32) : String(duration);
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const count = compact ? 14 : 22;
    return Array.from({ length: count }, (_, i) => {
      const wave = Math.sin((i / count) * Math.PI) * 0.65;
      const pseudo = Math.abs(Math.sin(hash + i * 1.7)) * 0.35;
      return Math.max(0.22, Math.min(1, wave + pseudo));
    });
  }, [audioData, duration, compact]);

  const closeFallbackCtx = (ctxToClose?: AudioContext | null) => {
    const target = ctxToClose || fallbackCtxRef.current;
    if (target) {
      target.close().catch(() => {});
      if (fallbackCtxRef.current === target) {
        fallbackCtxRef.current = null;
      }
    }
  };

  const stopAll = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (fallbackTimerRef.current) {
      window.clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
    if (webAudioSourceRef.current) {
      try {
        webAudioSourceRef.current.stop();
        webAudioSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      webAudioSourceRef.current = null;
    }
    closeFallbackCtx();
    setIsPlaying(false);
  };

  useEffect(() => {
    setTotalDuration(Math.max(1, duration || 3));
  }, [duration]);

  useEffect(() => {
    errorReportedRef.current = false;
    stopAll();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (!onMediaErrorRef.current) return;
    if (!audioData) {
      reportErrorOnce();
      return;
    }
    let active = true;
    if (
      audioData.startsWith('/api/media/') ||
      audioData.startsWith('http://') ||
      audioData.startsWith('https://')
    ) {
      fetch(audioData, { method: 'HEAD' })
        .then((res) => {
          if (!active) return;
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (!res.ok || ct.startsWith('image/')) {
            reportErrorOnce();
          }
        })
        .catch(() => {
          if (active) reportErrorOnce();
        });
    } else if (audioData.startsWith('data:')) {
      if (!audioData.startsWith('data:audio') || audioData.length < 200) {
        reportErrorOnce();
      }
    }
    return () => {
      active = false;
    };
  }, [audioData]);

  useEffect(() => {
    return () => {
      stopAll();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const playWithWebAudioFallback = async (blob: Blob) => {
    let ctx: AudioContext | null = null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      fallbackCtxRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
      const realDur = decodedBuffer.duration > 0 ? decodedBuffer.duration : totalDuration;
      setTotalDuration(realDur);

      const source = ctx.createBufferSource();
      source.buffer = decodedBuffer;
      source.playbackRate.value = playbackRate;

      const gain = ctx.createGain();
      gain.gain.value = 1.35; // Clear human voice boost
      source.connect(gain);
      gain.connect(ctx.destination);

      webAudioSourceRef.current = source;
      const startedAt = ctx.currentTime;
      setIsPlaying(true);

      const tick = () => {
        if (!ctx || fallbackCtxRef.current !== ctx) return;
        const elapsed = (ctx.currentTime - startedAt) * playbackRate;
        if (elapsed >= realDur) {
          setCurrentTime(0);
          setIsPlaying(false);
          return;
        }
        setCurrentTime(elapsed);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      source.onended = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        webAudioSourceRef.current = null;
        closeFallbackCtx(ctx);
        setCurrentTime(0);
        setIsPlaying(false);
      };

      source.start(0);
    } catch {
      closeFallbackCtx(ctx);
      setIsPlaying(false);
      setCurrentTime(0);
      reportErrorOnce();
    }
  };

  const togglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isPlaying) {
      stopAll();
      return;
    }

    if (!audioData) {
      reportErrorOnce();
      return;
    }

    let blob: Blob | null = null;
    if (
      audioData.startsWith('idb://') ||
      audioData.startsWith('/api/media/') ||
      audioData.startsWith('http://') ||
      audioData.startsWith('https://') ||
      audioData.startsWith('blob:')
    ) {
      blob = await resolveMediaBlob(audioData);
      if (!blob) {
        reportErrorOnce();
        return;
      }
    } else if (audioData.startsWith('data:audio') && audioData.length >= 200) {
      const parsed = soundEngine.base64ToAudioBlob(audioData);
      if (!parsed || parsed.blob.size < 100) {
        reportErrorOnce();
        return;
      }
      blob = parsed.blob;
    } else {
      reportErrorOnce();
      return;
    }

    if (!blob || blob.size < 50) {
      reportErrorOnce();
      return;
    }

    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        // ignore
      }
      objectUrlRef.current = null;
    }
    objectUrlRef.current = URL.createObjectURL(blob);

    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.src = objectUrlRef.current;
      audio.playbackRate = playbackRate;
      audio.volume = 1.0;
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          setTotalDuration(audio.duration);
        }
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };

      audio.onerror = () => {
        stopAll();
        playWithWebAudioFallback(blob);
      };

      setIsPlaying(true);
      await audio.play();
    } catch {
      stopAll();
      await playWithWebAudioFallback(blob);
    }
  };

  const handleSeek = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const ratio = (index + 1) / bars.length;
    const targetTime = ratio * totalDuration;
    setCurrentTime(targetTime);
    if (audioRef.current && isFinite(audioRef.current.duration)) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSpeed: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
    if (webAudioSourceRef.current) {
      webAudioSourceRef.current.playbackRate.value = nextSpeed;
    }
  };

  const formatSec = (s: number) => {
    const sec = Math.max(0, Math.round(s));
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const progressRatio = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;

  return (
    <div
      onClick={togglePlay}
      className={`group relative flex items-center gap-2 select-none cursor-pointer transition-all rounded-2xl border min-w-0 w-full ${
        isMe
          ? 'bg-gradient-to-r from-[#ff0050]/20 via-red-600/15 to-[#00f2fe]/15 border-[#ff0050]/40 hover:border-[#ff0050]/70'
          : 'bg-zinc-900/90 hover:bg-zinc-900 border-white/15 hover:border-[#00f2fe]/40'
      } ${compact ? 'px-2.5 py-1.5 max-w-full' : 'px-3.5 py-2.5 max-w-md'} shadow-lg`}
    >
      {/* TikTok Play / Pause Circle */}
      <button
        type="button"
        onClick={togglePlay}
        className={`shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-90 ${
          compact ? 'w-7 h-7' : 'w-9 h-9'
        } ${
          isPlaying
            ? 'bg-[#ff0050] text-white shadow-[0_0_14px_rgba(255,0,80,0.65)]'
            : 'bg-white text-black hover:bg-zinc-100 shadow-md'
        }`}
        title={isPlaying ? 'Pause' : 'Écouter le message vocal'}
      >
        {isPlaying ? (
          <Pause className={compact ? 'w-3.5 h-3.5 fill-current' : 'w-4 h-4 fill-current'} />
        ) : (
          <Play className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} fill-current ml-0.5`} />
        )}
      </button>

      {/* Interactive TikTok Waveform Bars */}
      <div className="flex-1 flex items-center gap-[3px] h-7 overflow-hidden">
        {bars.map((heightRatio, idx) => {
          const barThreshold = (idx + 1) / bars.length;
          const isFilled = isPlaying
            ? progressRatio >= barThreshold
            : currentTime > 0 && progressRatio >= barThreshold;

          return (
            <div
              key={idx}
              onClick={(e) => handleSeek(idx, e)}
              style={{
                height: `${Math.max(22, Math.round(heightRatio * 100))}%`,
              }}
              className={`flex-1 min-w-[2.5px] max-w-[4px] rounded-full transition-all duration-150 ${
                isFilled
                  ? 'bg-gradient-to-t from-[#ff0050] to-[#00f2fe] shadow-[0_0_6px_rgba(0,242,254,0.5)]'
                  : isPlaying
                  ? 'bg-white/40'
                  : 'bg-white/65 group-hover:bg-white/80'
              }`}
            />
          );
        })}
      </div>

      {/* Duration Counter */}
      <div className="shrink-0 flex items-center gap-1.5">
        <span
          className={`font-mono font-bold tracking-tight ${
            compact ? 'text-[10px]' : 'text-xs'
          } ${isPlaying ? 'text-[#00f2fe]' : 'text-zinc-200'}`}
        >
          {isPlaying || currentTime > 0
            ? `${formatSec(currentTime)} / ${formatSec(totalDuration)}`
            : formatSec(totalDuration)}
        </span>

        {/* Speed Multiplier Pill (only shown in published feed/chat playback, omitted in draft preview) */}
        {!hideSpeed && (
          <button
            type="button"
            onClick={cycleSpeed}
            className={`px-1.5 py-0.5 rounded-md font-mono font-black transition-colors border ${
              compact ? 'text-[9px]' : 'text-[10px]'
            } ${
              playbackRate > 1
                ? 'bg-[#00f2fe]/20 text-[#00f2fe] border-[#00f2fe]/40'
                : 'bg-white/10 text-zinc-300 border-white/10 hover:bg-white/20'
            }`}
            title="Vitesse de lecture"
          >
            {playbackRate}x
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopAll();
              onDelete();
            }}
            className="p-1 rounded-full text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            title="Supprimer la note vocale"
          >
            <Trash2 className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
        )}
      </div>
    </div>
  );
};

interface TikTokVoiceRecorderProps {
  maxSeconds?: number;
  compact?: boolean;
  label?: string;
  recordedNote: { duration: number; audioData: string } | null;
  onRecorded: (note: { duration: number; audioData: string } | null) => void;
  onDirectSend?: (note: { duration: number; audioData: string }) => void;
  onRecordingChange?: (recording: boolean) => void;
  hideInlinePreview?: boolean;
  buttonClassName?: string;
}

type MicPermStatus = 'granted' | 'prompt' | 'denied' | 'unknown';

export const TikTokVoiceRecorder: React.FC<TikTokVoiceRecorderProps> = ({
  maxSeconds = 60,
  compact = false,
  label = 'Vocal',
  recordedNote,
  onRecorded,
  onDirectSend,
  onRecordingChange,
  hideInlinePreview = false,
  buttonClassName,
}) => {
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioStep, setStudioStep] = useState<'ready' | 'recording' | 'preview'>('ready');
  const [micPerm, setMicPerm] = useState<MicPermStatus>('unknown');
  const [micError, setMicError] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [draftNote, setDraftNote] = useState<{ duration: number; audioData: string } | null>(null);
  const [liveBars, setLiveBars] = useState<number[]>(Array(16).fill(0.24));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafMeterRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);
  const shouldSaveRef = useRef<boolean>(true);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  const cleanupRecordingResources = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafMeterRef.current) {
      cancelAnimationFrame(rafMeterRef.current);
      rafMeterRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    onRecordingChange?.(false);
  }, [onRecordingChange]);

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
    };
  }, []);

  const checkMicPermission = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted' || status.state === 'prompt' || status.state === 'denied') {
          setMicPerm(status.state);
          return;
        }
      }
    } catch {
      // Safari does not support permissions.query('microphone')
    }
    setMicPerm('unknown');
  };

  const openStudio = () => {
    setMicError(null);
    setDraftNote(recordedNote);
    setStudioStep(recordedNote ? 'preview' : 'ready');
    setIsStudioOpen(true);
    checkMicPermission();
  };

  const closeStudio = () => {
    shouldSaveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    cleanupRecordingResources();
    setIsStudioOpen(false);
    setStudioStep('ready');
    setRecordSeconds(0);
    setMicError(null);
  };

  const requestMicrophoneStream = async (): Promise<MediaStream> => {
    const attempts: MediaStreamConstraints[] = [
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      },
      { audio: true },
    ];
    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Microphone unavailable');
  };

  const startRecording = async () => {
    setMicError(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setMicError('Enregistrement direct indisponible sur ce navigateur. Utilise « Importer un audio du tél » ci-dessous.');
      return;
    }

    try {
      const stream = await requestMicrophoneStream();
      setMicPerm('granted');
      streamRef.current = stream;

      try {
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateMeter = () => {
          analyser.getByteFrequencyData(dataArray);
          const nextBars = Array.from({ length: 16 }, (_, i) => {
            const val = dataArray[i % dataArray.length] / 255;
            return Math.max(0.2, Math.min(1, val * 1.4));
          });
          setLiveBars(nextBars);
          rafMeterRef.current = requestAnimationFrame(updateMeter);
        };
        rafMeterRef.current = requestAnimationFrame(updateMeter);
      } catch {
        // Ignore visualizer restriction
      }

      const preferredTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];
      let selectedMimeType = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        for (const t of preferredTypes) {
          if (MediaRecorder.isTypeSupported(t)) {
            selectedMimeType = t;
            break;
          }
        }
      }

      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      shouldSaveRef.current = true;
      startTimeRef.current = Date.now();
      setRecordSeconds(0);
      setStudioStep('recording');

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const elapsedSec = Math.max(
          1,
          Math.min(maxSeconds, Math.round((Date.now() - startTimeRef.current) / 1000))
        );
        cleanupRecordingResources();

        if (!shouldSaveRef.current || chunksRef.current.length === 0) {
          chunksRef.current = [];
          setStudioStep('ready');
          return;
        }

        const rawType = recorder.mimeType || selectedMimeType || 'audio/webm';
        const cleanMime = rawType.split(';')[0].trim() || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: cleanMime });
        chunksRef.current = [];

        if (blob.size < 100) {
          setMicError('Enregistrement trop court. Appuie sur enregistrer et parle plus longtemps.');
          setStudioStep('ready');
          return;
        }
        if (blob.size > MAX_MEDIA_FILE_SIZE_BYTES) {
          setMicError('Enregistrement audio trop volumineux (max 20 Mo).');
          setStudioStep('ready');
          return;
        }

        try {
          const audioRef = await saveMediaBlob(blob);
          setDraftNote((prev) => {
            if (prev?.audioData && prev.audioData !== recordedNote?.audioData) {
              void revokeMediaUrlOrRef(prev.audioData);
            }
            return { duration: elapsedSec, audioData: audioRef };
          });
          setStudioStep('preview');
        } catch {
          setMicError("Impossible d'enregistrer le fichier audio.");
          setStudioStep('ready');
        }
      };

      recorder.start(200);

      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (elapsed >= maxSeconds) {
          stopRecordingForListen();
        } else {
          setRecordSeconds(elapsed);
        }
      }, 250);
    } catch {
      cleanupRecordingResources();
      setMicPerm('denied');
      setStudioStep('ready');
      setMicError(
        'Autorisation micro requise sur ton téléphone : autorise le micro dans Safari/Chrome ou importe un mémo vocal ci-dessous.'
      );
    }
  };

  const stopRecordingForListen = () => {
    shouldSaveRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        if (
          mediaRecorderRef.current.state === 'recording' &&
          typeof mediaRecorderRef.current.requestData === 'function'
        ) {
          mediaRecorderRef.current.requestData();
        }
        mediaRecorderRef.current.stop();
      } catch {
        cleanupRecordingResources();
        setStudioStep('ready');
      }
    } else {
      cleanupRecordingResources();
      setStudioStep('ready');
    }
  };

  const cancelCurrentRecording = () => {
    shouldSaveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    cleanupRecordingResources();
    setRecordSeconds(0);
    setStudioStep('ready');
  };

  const handleImportAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMicError(null);

    try {
      const processed = await processAudioFile(file, maxSeconds);
      setDraftNote((prev) => {
        if (prev?.audioData && prev.audioData !== recordedNote?.audioData) {
          void revokeMediaUrlOrRef(prev.audioData);
        }
        return { duration: processed.duration, audioData: processed.audioRef };
      });
      setStudioStep('preview');
    } catch (err) {
      setMicError(
        err instanceof Error
          ? err.message
          : `Audio invalide (max ${maxSeconds}s, max 20 Mo).`
      );
    }
  };

  const handleValidateDraft = () => {
    if (!draftNote) return;
    if (recordedNote?.audioData && recordedNote.audioData !== draftNote.audioData) {
      void revokeMediaUrlOrRef(recordedNote.audioData);
    }
    onRecorded(draftNote);
    setIsStudioOpen(false);
    setStudioStep('ready');
  };

  const handleDirectSendDraft = () => {
    if (!draftNote || !onDirectSend) return;
    onDirectSend(draftNote);
    setDraftNote(null);
    setIsStudioOpen(false);
    setStudioStep('ready');
  };

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <>
      {/* Trigger or compact inline preview (never overlaps sibling buttons) */}
      {recordedNote && !hideInlinePreview ? (
        <TikTokVoicePlayer
          audioData={recordedNote.audioData}
          duration={recordedNote.duration}
          compact={compact}
          isMe={true}
          hideSpeed={true}
          onDelete={() => {
            if (recordedNote.audioData) {
              void revokeMediaUrlOrRef(recordedNote.audioData);
            }
            onRecorded(null);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={openStudio}
          title="Enregistrer ou écouter un message vocal (1 min max)"
          className={
            buttonClassName ||
            `flex items-center justify-center gap-1 rounded-xl border transition-all active:scale-95 whitespace-nowrap shrink-0 cursor-pointer ${
              compact
                ? recordedNote
                  ? 'px-2 sm:px-2.5 py-1.5 text-[11px] font-mono font-semibold bg-[#ff0050]/20 border-[#ff0050] text-pink-300'
                  : 'px-2 sm:px-2.5 py-1.5 text-[11px] font-mono font-semibold bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                : 'px-4 py-2.5 text-xs font-bold bg-gradient-to-r from-zinc-900 to-zinc-800 hover:from-[#ff0050]/20 hover:to-[#00f2fe]/20 text-white border-white/15 hover:border-[#ff0050]/50 shadow-md rounded-full'
            }`
          }
        >
          <Mic className="w-3.5 h-3.5 text-[#ff0050] shrink-0" />
          <span>{label}</span>
          {recordedNote && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
          {!compact && <Volume2 className="w-3.5 h-3.5 text-[#00f2fe] opacity-80 shrink-0" />}
        </button>
      )}

      {/* Clean Studio Vocal Modal (aligned UX with VideoStudioModal — zero overlap) */}
      {isStudioOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={closeStudio}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md max-h-[92dvh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/90">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-[#ff0050]/20 border border-[#ff0050]/45 flex items-center justify-center text-[#ff0050]">
                  <Mic className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">Message vocal · {maxSeconds}s max</h3>
                  <p className="text-[10px] font-mono text-zinc-400">Enregistrer, écouter et valider</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeStudio}
                className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              ref={audioFileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleImportAudioFile}
            />

            <div className="p-4 space-y-4 flex-1 overflow-y-auto overscroll-contain">
              {micError && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-100 text-xs leading-relaxed">
                  {micError}
                </div>
              )}

              {studioStep === 'ready' && (
                <div className="space-y-3">
                  <div className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-300">
                      {micPerm === 'granted'
                        ? 'Micro autorisé sur le téléphone ✓'
                        : micPerm === 'denied'
                        ? 'Micro bloqué dans le navigateur'
                        : 'Autorisation micro demandée au lancement'}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        micPerm === 'granted'
                          ? 'bg-emerald-400'
                          : micPerm === 'denied'
                          ? 'bg-red-400'
                          : 'bg-amber-400'
                      }`}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={startRecording}
                    className="w-full py-3.5 px-4 rounded-2xl bg-[#ff0050] hover:bg-[#ff1a62] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,0,80,0.35)] active:scale-95 transition-all cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    <span>{micPerm === 'denied' ? 'Réessayer l’autorisation micro' : 'Appuyer pour parler'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => audioFileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono font-semibold cursor-pointer transition-colors"
                  >
                    Importer un fichier audio / mémo vocal du tél
                  </button>
                </div>
              )}

              {studioStep === 'recording' && (
                <div className="space-y-4 py-2">
                  <div className="p-4 rounded-2xl bg-zinc-950 border border-red-500/50 space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="flex items-center gap-2 text-red-400 font-bold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ff0050] animate-ping" />
                        <span>Enregistrement...</span>
                      </span>
                      <span className="text-white font-black tabular-nums">
                        {formatClock(recordSeconds)} / {formatClock(maxSeconds)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 h-10 px-1">
                      {liveBars.map((h, i) => (
                        <div
                          key={i}
                          style={{ height: `${Math.round(h * 100)}%` }}
                          className="flex-1 rounded-full bg-gradient-to-t from-[#ff0050] to-[#00f2fe] transition-all duration-75"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelCurrentRecording}
                      className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-bold cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={stopRecordingForListen}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-[#ff0050] hover:bg-[#ff1a62] text-white text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Arrêter pour écouter</span>
                    </button>
                  </div>
                </div>
              )}

              {studioStep === 'preview' && draftNote && (
                <div className="space-y-4">
                  <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                    <div className="text-[11px] font-mono text-zinc-400">
                      Écoute ton message vocal avant de valider :
                    </div>
                    <TikTokVoicePlayer
                      audioData={draftNote.audioData}
                      duration={draftNote.duration}
                      compact={false}
                      isMe={true}
                      hideSpeed={true}
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        if (draftNote?.audioData && draftNote.audioData !== recordedNote?.audioData) {
                          void revokeMediaUrlOrRef(draftNote.audioData);
                        }
                        setDraftNote(null);
                        setStudioStep('ready');
                      }}
                      className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Refaire</span>
                    </button>
                    {onDirectSend ? (
                      <>
                        <button
                          type="button"
                          onClick={handleValidateDraft}
                          className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                          title="Valider l'audio et ajouter du texte avant d'envoyer"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Joindre</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDirectSendDraft}
                          className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-mono font-black flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Valider & Envoyer ({draftNote.duration}s)</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleValidateDraft}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-mono font-black flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Valider ({draftNote.duration}s)</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
