import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Flame,
  Clock,
  Send,
  MessageCircle,
  Trash2,
  Plus,
  Loader2,
  FileText,
  Download,
  Music,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Gift,
  Key,
  Lock,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { ActiveFlameItem, NeonColor, FlameComment } from '../types';
import { useApp } from '../context/AppContext';
import { AvatarDisplay } from './AvatarDisplay';
import { ProfileStatusBadges } from './ProfileStatusBadges';
import { SmartImage, SmartVideoPlayer, DocumentFileCard } from './MediaElements';
import { TikTokVoicePlayer } from './TikTokVoiceNote';
import { getNeonItem } from '../utils/neonStyles';
import { getPlayableDeezerUrl, resolveFreshTrackPreviewUrl } from '../utils/audio';

interface FlameViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  flame: ActiveFlameItem;
  owner: {
    id: string;
    matricule: string;
    alias: string;
    avatar: string;
    neonColor?: NeonColor;
    isVerified?: boolean;
    profileType?: 'personal' | 'professional';
    detentionDays?: number;
  };
  isOwnProfile: boolean;
  onFlameUpdated?: (updated: ActiveFlameItem) => void;
  onOpenComposer?: () => void;
  onStartDirectChat?: () => void;
}

interface FloatingGiftBurst {
  id: string;
  emoji: string;
  label: string;
}

function formatRemainingTime(expiresAt: number): string {
  const diffMs = Math.max(0, expiresAt - Date.now());
  const totalMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

function formatCommentTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "à l'instant";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  return `${diffH}h`;
}

export const FlameViewerModal: React.FC<FlameViewerModalProps> = ({
  isOpen,
  onClose,
  flame,
  owner,
  isOwnProfile,
  onFlameUpdated,
  onOpenComposer,
  onStartDirectChat,
}) => {
  const { user, commentOnFlame, removeActiveFlame, openDirectChat, stopAmbientTrack, showToast } = useApp();
  const [localFlame, setLocalFlame] = useState<ActiveFlameItem>(flame);
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [justCommented, setJustCommented] = useState(false);

  // Drawers state (Comments drawer & Gift drawer)
  const [isCommentsDrawerOpen, setIsCommentsDrawerOpen] = useState(false);
  const [isGiftsDrawerOpen, setIsGiftsDrawerOpen] = useState(false);
  const [activeBurst, setActiveBurst] = useState<FloatingGiftBurst | null>(null);

  // Background audio state
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [musicError, setMusicError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const burstTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalFlame(flame);
    setJustCommented(false);
    setMusicError(false);
  }, [flame, isOpen]);

  // Stop any global/profile ambient track whenever FlameViewerModal is open so two songs never overlap
  useEffect(() => {
    if (isOpen) {
      stopAmbientTrack();
    }
  }, [isOpen, stopAmbientTrack]);

  // Audio setup with safe cleanup and automatic Deezer preview URL refresh
  useEffect(() => {
    const cleanupAudio = (audio: HTMLAudioElement | null) => {
      if (!audio) return;
      try {
        audio.onerror = null;
        audio.onplay = null;
        audio.onpause = null;
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    };

    if (!isOpen || !localFlame.bgMusic?.previewUrl) {
      cleanupAudio(audioRef.current);
      audioRef.current = null;
      setIsMusicPlaying(false);
      return;
    }

    let cancelled = false;
    setMusicError(false);

    const mountAudio = (url: string, allowRetry: boolean) => {
      if (cancelled) return;
      cleanupAudio(audioRef.current);
      const audio = new Audio();
      (audio as unknown as { playsInline: boolean }).playsInline = true;
      audio.preload = 'auto';
      audio.loop = true;
      audio.muted = isMuted;
      audio.volume = localFlame.type === 'audio' ? 0.35 : 1;
      audio.src = getPlayableDeezerUrl(url, localFlame.bgMusic);
      audio.onerror = () => {
        if (cancelled) return;
        if (allowRetry && localFlame.bgMusic) {
          void resolveFreshTrackPreviewUrl(localFlame.bgMusic, true).then((freshUrl) => {
            if (cancelled) return;
            if (freshUrl && freshUrl !== url) {
              mountAudio(freshUrl, false);
            } else {
              setMusicError(true);
              setIsMusicPlaying(false);
            }
          });
          return;
        }
        setMusicError(true);
        setIsMusicPlaying(false);
      };
      audio.onplay = () => {
        if (!cancelled) setIsMusicPlaying(true);
      };
      audio.onpause = () => {
        if (!cancelled) setIsMusicPlaying(false);
      };
      audioRef.current = audio;

      // For voice-note flames, don't auto-blast bgMusic over the user's voice; let user tap Play manually
      if (localFlame.type !== 'audio' && !isMuted) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (!cancelled) setIsMusicPlaying(true);
            })
            .catch(() => {
              if (!cancelled) setIsMusicPlaying(false);
            });
        }
      } else {
        setIsMusicPlaying(false);
      }
    };

    void resolveFreshTrackPreviewUrl(localFlame.bgMusic).then((resolvedUrl) => {
      if (cancelled) return;
      mountAudio(resolvedUrl || localFlame.bgMusic!.previewUrl, true);
    });

    return () => {
      cancelled = true;
      cleanupAudio(audioRef.current);
      audioRef.current = null;
    };
  }, [isOpen, localFlame.bgMusic?.previewUrl, localFlame.bgMusic?.id, localFlame.type]);

  // Keep mute state in sync without restarting playback from 0:00
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (burstTimerRef.current) {
        window.clearTimeout(burstTimerRef.current);
      }
    };
  }, []);

  const toggleMusicPlay = () => {
    if (musicError) return;
    if (!audioRef.current) {
      if (localFlame.bgMusic?.previewUrl) {
        const audio = new Audio(
          getPlayableDeezerUrl(localFlame.bgMusic.previewUrl, localFlame.bgMusic)
        );
        (audio as unknown as { playsInline: boolean }).playsInline = true;
        audio.loop = true;
        audio.muted = isMuted;
        audio.volume = localFlame.type === 'audio' ? 0.35 : 1;
        audio.onerror = () => {
          setMusicError(true);
          setIsMusicPlaying(false);
        };
        audioRef.current = audio;
      } else {
        return;
      }
    }
    if (isMusicPlaying) {
      audioRef.current.pause();
      setIsMusicPlaying(false);
    } else {
      stopAmbientTrack();
      if (isMuted) {
        audioRef.current.muted = false;
        setIsMuted(false);
      }
      audioRef.current
        .play()
        .then(() => setIsMusicPlaying(true))
        .catch(() => setIsMusicPlaying(false));
    }
  };

  const toggleMute = () => {
    if (!audioRef.current || musicError) return;
    const nextMuted = !isMuted;
    audioRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && audioRef.current.paused && localFlame.type !== 'audio') {
      audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => {});
    }
  };

  const progressPct = useMemo(() => {
    const total = Math.max(1, localFlame.expiresAt - localFlame.createdAt);
    const elapsed = Math.max(0, Math.min(total, Date.now() - localFlame.createdAt));
    return Math.round((elapsed / total) * 100);
  }, [localFlame.createdAt, localFlame.expiresAt]);

  if (!isOpen) return null;

  const neonStyle = getNeonItem(owner.neonColor);
  const comments = localFlame.comments || [];

  const handleOpenChat = () => {
    if (onStartDirectChat) {
      onStartDirectChat();
      onClose();
      return;
    }
    openDirectChat({
      id: owner.id,
      matricule: owner.matricule,
      alias: owner.alias,
      avatar: owner.avatar || '⛓️',
      neonColor: owner.neonColor,
    });
    onClose();
  };

  const handleSubmitComment = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = commentText.trim();
    if (!clean || isSending) return;
    setIsSending(true);
    try {
      const res = await commentOnFlame(owner.id || owner.matricule, clean);
      if (!res.success) {
        showToast({
          title: 'Commentaire non envoyé',
          message: res.error || 'Réessaie dans un instant.',
          type: 'warning',
        });
        return;
      }
      if (res.activeFlame) {
        setLocalFlame(res.activeFlame);
        onFlameUpdated?.(res.activeFlame);
      }
      setCommentText('');
      setJustCommented(true);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendGift = async (gift: {
    type: 'key' | 'padlock' | 'gold_flame' | 'ice_cone' | 'water_bottle' | 'crown';
    emoji: string;
    label: string;
    costText?: string;
  }) => {
    if (isSending) return;

    // Check balances
    if (gift.type === 'key' && (user.keysAvailable || 0) <= 0) {
      showToast({
        title: 'Solde insuffisant 🔑',
        message: 'Tu n’as plus de clés disponibles. Découvre de nouveaux aveux pour en gagner !',
        type: 'warning',
      });
      return;
    }
    if (gift.type === 'padlock' && (user.padlocksAvailable || 0) <= 0) {
      showToast({
        title: 'Solde insuffisant 🔒',
        message: 'Tu n’as plus de cadenas disponibles.',
        type: 'warning',
      });
      return;
    }

    setIsSending(true);
    try {
      let content = '';
      if (gift.type === 'key') {
        content = `🎁 A offert 1 Clé d'Évasion 🔑 !`;
      } else if (gift.type === 'padlock') {
        content = `🔒 A offert 1 Cadenas de Solidarité 🔒 !`;
      } else if (gift.type === 'gold_flame') {
        content = `🔥 A envoyé une Super Flamme d'Or !`;
      } else if (gift.type === 'ice_cone') {
        content = `🍦 A offert un Cornet Glacé réconfortant !`;
      } else if (gift.type === 'water_bottle') {
        content = `🥤 A offert une Boisson Fraîche !`;
      } else if (gift.type === 'crown') {
        content = `👑 A décerné la Couronne d'Honneur !`;
      }

      const res = await commentOnFlame(
        owner.id || owner.matricule,
        content,
        gift.type === 'key' ? 'key' : gift.type === 'padlock' ? 'padlock' : undefined
      );

      if (!res.success) {
        showToast({
          title: 'Erreur cadeau',
          message: res.error || 'Impossible d’envoyer le cadeau.',
          type: 'warning',
        });
        return;
      }

      if (res.activeFlame) {
        setLocalFlame(res.activeFlame);
        onFlameUpdated?.(res.activeFlame);
      }

      // Trigger burst on screen
      setActiveBurst({
        id: `b_${Date.now()}`,
        emoji: gift.emoji,
        label: gift.label,
      });

      if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = window.setTimeout(() => {
        setActiveBurst(null);
      }, 2600);

      showToast({
        title: `Cadeau envoyé 🎁`,
        message: `Tu as offert ${gift.label} à ${owner.alias} !`,
        type: 'success',
      });

      setIsGiftsDrawerOpen(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleRemoveOwnFlame = async () => {
    await removeActiveFlame();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-black flex items-center justify-center select-none overflow-hidden animate-in fade-in duration-200"
      onClick={() => {
        if (isCommentsDrawerOpen) setIsCommentsDrawerOpen(false);
        if (isGiftsDrawerOpen) setIsGiftsDrawerOpen(false);
      }}
    >
      {/* Fullscreen Media Container */}
      <div
        className="relative w-full h-full max-w-lg mx-auto flex flex-col justify-between overflow-hidden bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Visual Content (Takes 100% of Screen) */}
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
          {localFlame.type === 'text' && (
            <div
              className={`w-full h-full p-6 sm:p-10 flex flex-col items-center justify-center text-center bg-gradient-to-br ${
                localFlame.bgGradient || 'from-orange-600 via-red-600 to-rose-700'
              }`}
            >
              <p className="text-xl sm:text-3xl font-black text-white leading-relaxed whitespace-pre-wrap break-words drop-shadow-md max-w-sm sm:max-w-md">
                {localFlame.text}
              </p>
            </div>
          )}

          {localFlame.type === 'photo' && localFlame.url && (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              {/* Ambient blur background */}
              <SmartImage
                src={localFlame.url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110 pointer-events-none"
              />
              {/* Main photo */}
              <SmartImage
                src={localFlame.url}
                alt={localFlame.caption || 'Flamme photo'}
                className="relative z-10 w-full h-full object-contain"
              />
            </div>
          )}

          {localFlame.type === 'video' && localFlame.url && (
            <div className="w-full h-full flex items-center justify-center bg-black">
              <SmartVideoPlayer
                src={localFlame.url}
                duration={localFlame.duration}
                forceMuted={Boolean(localFlame.bgMusic?.previewUrl && isMusicPlaying && !isMuted)}
              />
            </div>
          )}

          {localFlame.type === 'audio' && localFlame.url && (
            <div className="w-full h-full p-6 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 via-zinc-950 to-black">
              <div className="w-full max-w-sm p-6 rounded-3xl bg-zinc-900/90 border border-orange-500/30 shadow-2xl space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-orange-400">
                  <Flame className="w-4 h-4" />
                  <span>Flamme vocale</span>
                </div>
                <TikTokVoicePlayer
                  audioData={localFlame.url}
                  duration={localFlame.duration || 10}
                />
              </div>
            </div>
          )}

          {localFlame.type === 'file' && localFlame.url && (
            <div className="w-full h-full p-6 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 via-zinc-950 to-black">
              <div className="w-full max-w-sm">
                <DocumentFileCard
                  file={{ url: localFlame.url, fileName: localFlame.fileName }}
                  isDark={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* Floating Caption Overlay (if any) */}
        {localFlame.caption && (
          <div className="absolute bottom-20 left-4 right-4 z-10 pointer-events-none">
            <div className="inline-block max-w-full px-3.5 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 text-white text-xs sm:text-sm font-medium shadow-lg leading-snug">
              {localFlame.caption}
            </div>
          </div>
        )}

        {/* Floating Gift Burst Animation (Screen Effect) */}
        {activeBurst && (
          <div className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center justify-center animate-in zoom-in-50 fade-in duration-300">
            <div className="p-4 rounded-3xl bg-black/75 backdrop-blur-md border border-amber-400/40 shadow-2xl flex flex-col items-center gap-1.5 animate-bounce">
              <span className="text-5xl">{activeBurst.emoji}</span>
              <span className="text-xs font-black text-amber-300 uppercase tracking-wider">
                {activeBurst.label}
              </span>
            </div>
          </div>
        )}

        {/* Top Minimalist Header & Progress */}
        <div className="relative z-20 pt-3 px-3.5 pb-6 bg-gradient-to-b from-black/85 via-black/45 to-transparent space-y-2">
          {/* Progress line */}
          <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-400 via-red-500 to-amber-300 transition-all rounded-full"
              style={{ width: `${Math.max(4, 100 - progressPct)}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {/* Left: Avatar + Alias + Time remaining */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr from-orange-500 to-amber-400 shrink-0">
                <div className="w-full h-full rounded-full bg-zinc-950 overflow-hidden flex items-center justify-center text-sm">
                  <AvatarDisplay avatar={owner.avatar} alt={owner.alias} />
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <span className={`text-xs font-bold text-white truncate ${neonStyle.textClass}`}>
                    {owner.alias}
                  </span>
                  <ProfileStatusBadges
                    isVerified={owner.isVerified}
                    profileType={owner.profileType}
                    compact
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/70">
                  <span className="inline-flex items-center gap-0.5 text-orange-400 font-semibold">
                    <Flame className="w-2.5 h-2.5" />
                    24h
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {formatRemainingTime(localFlame.expiresAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actions & Close */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isOwnProfile && onOpenComposer && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenComposer();
                  }}
                  title="Nouvelle Flamme"
                  className="px-2.5 py-1 rounded-full bg-black/40 hover:bg-black/60 border border-white/20 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-orange-400" />
                  <span className="hidden sm:inline">Nouvelle</span>
                </button>
              )}

              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => void handleRemoveOwnFlame()}
                  title="Supprimer ma Flamme"
                  className="p-1.5 rounded-full bg-black/40 hover:bg-red-500/40 border border-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/50 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Minimal Floating Background Audio Pill (if any) */}
          {localFlame.bgMusic && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] text-white shadow-md">
              <span
                className={`text-xs ${isMusicPlaying ? 'animate-spin' : ''}`}
                style={{ animationDuration: '3s' }}
              >
                💿
              </span>
              <span className="font-semibold truncate max-w-[150px] sm:max-w-xs">
                {localFlame.bgMusic.title}
              </span>
              <span className="text-white/60 truncate max-w-[90px]">
                · {localFlame.bgMusic.artist}
              </span>
              <button
                type="button"
                onClick={toggleMusicPlay}
                title={isMusicPlaying ? 'Pause' : 'Lecture'}
                className="p-0.5 text-white/80 hover:text-white cursor-pointer"
              >
                {isMusicPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-white" />}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                title={isMuted ? 'Activer le son' : 'Couper le son'}
                className="p-0.5 text-white/80 hover:text-white cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3" />}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Minimalist Floating Action Bar (View full screen by default) */}
        <div className="relative z-20 pb-4 px-3.5 pt-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between gap-2">
          {/* Quick Comment Input */}
          <form
            onSubmit={(e) => void handleSubmitComment(e)}
            className="flex-1 min-w-0 flex items-center gap-1.5"
          >
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value.slice(0, 300))}
              placeholder={`Laisser un mot à ${owner.alias}…`}
              className="flex-1 min-w-0 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 focus:bg-black/80 backdrop-blur-md border border-white/20 focus:border-orange-400 text-xs text-white placeholder-white/50 focus:outline-none transition-all font-medium"
            />
            {commentText.trim().length > 0 && (
              <button
                type="submit"
                disabled={isSending}
                className="p-2 rounded-full bg-orange-500 hover:bg-orange-400 text-white transition-colors cursor-pointer shrink-0"
              >
                {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            )}
          </form>

          {/* Petit logo commentaire 💬 */}
          <button
            type="button"
            onClick={() => {
              setIsCommentsDrawerOpen((prev) => !prev);
              setIsGiftsDrawerOpen(false);
            }}
            title="Voir les commentaires"
            className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/55 hover:bg-white/15 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <MessageCircle className="w-4 h-4 text-orange-400" />
            {comments.length > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-orange-500 text-[10px] font-black text-white shadow">
                {comments.length}
              </span>
            )}
          </button>

          {/* Petit logo donner des cadeaux 🎁 */}
          <button
            type="button"
            onClick={() => {
              setIsGiftsDrawerOpen((prev) => !prev);
              setIsCommentsDrawerOpen(false);
            }}
            title="Offrir un cadeau"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-500/25 to-orange-500/25 hover:from-amber-500/40 hover:to-orange-500/40 backdrop-blur-md border border-amber-400/40 hover:border-amber-400 text-amber-300 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <Gift className="w-4 h-4 text-amber-400 animate-pulse" />
          </button>

          {/* Petit logo discussion privée (si profil tiers) */}
          {!isOwnProfile && (
            <button
              type="button"
              onClick={handleOpenChat}
              title="Discuter en privé"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/55 hover:bg-white/15 backdrop-blur-md border border-white/20 text-emerald-400 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Slide-Up Comments Drawer */}
        {isCommentsDrawerOpen && (
          <div
            className="absolute inset-x-0 bottom-0 z-40 max-h-[68vh] rounded-t-3xl bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800 shadow-[0_-10px_35px_rgba(0,0,0,0.8)] flex flex-col animate-in slide-in-from-bottom-5 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Drag Bar */}
            <div className="pt-2.5 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-zinc-700/80" />
            </div>

            {/* Drawer Header */}
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Commentaires ({comments.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!isOwnProfile && (
                  <button
                    type="button"
                    onClick={handleOpenChat}
                    className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-black hover:bg-emerald-500/25 transition-colors"
                  >
                    Chat privé
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCommentsDrawerOpen(false)}
                  className="p-1 rounded-full text-zinc-400 hover:text-white cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-[160px] max-h-[40vh]">
              {comments.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500 space-y-1">
                  <p>Aucun commentaire pour l’instant.</p>
                  <p className="text-[11px] text-zinc-600">Sois le premier à réagir !</p>
                </div>
              ) : (
                comments.map((c: FlameComment) => {
                  const cNeon = getNeonItem(c.authorNeonColor);
                  const isGiftComment = c.content.includes('🎁') || c.content.includes('🔑') || c.content.includes('🔒') || c.content.includes('🔥');
                  return (
                    <div
                      key={c.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-2xl border transition-colors ${
                        isGiftComment
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : 'bg-zinc-900/70 border-zinc-800/70'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-sm shrink-0">
                        <AvatarDisplay avatar={c.authorAvatar} alt={c.authorAlias} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className={`text-xs font-bold truncate ${cNeon.textClass}`}>
                              {c.authorAlias}
                            </span>
                            {c.authorIsVerified && (
                              <ProfileStatusBadges isVerified compact />
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                            {formatCommentTime(c.createdAt)}
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 break-words ${isGiftComment ? 'text-amber-200 font-semibold' : 'text-zinc-200'}`}>
                          {c.content}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Post-comment CTA */}
            {justCommented && !isOwnProfile && (
              <div className="mx-4 mb-2 p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-2">
                <span className="text-[11px] text-emerald-200 font-semibold">
                  Commentaire envoyé ! Continuer en privé ?
                </span>
                <button
                  type="button"
                  onClick={handleOpenChat}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-black hover:bg-emerald-400 transition-colors cursor-pointer"
                >
                  Discuter 💬
                </button>
              </div>
            )}

            {/* Drawer Input */}
            <form
              onSubmit={(e) => void handleSubmitComment(e)}
              className="p-3 border-t border-zinc-800 flex items-center gap-2 bg-zinc-950"
            >
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value.slice(0, 300))}
                placeholder={`Commenter la Flamme…`}
                className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={!commentText.trim() || isSending}
                className={`p-2 rounded-xl font-bold text-xs flex items-center justify-center transition-all ${
                  commentText.trim() && !isSending
                    ? 'bg-orange-500 text-white hover:bg-orange-400 cursor-pointer'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        )}

        {/* Slide-Up Gifts Drawer */}
        {isGiftsDrawerOpen && (
          <div
            className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl bg-zinc-950/95 backdrop-blur-xl border-t border-amber-500/40 p-4 sm:p-5 space-y-4 shadow-[0_-10px_40px_rgba(245,158,11,0.25)] animate-in slide-in-from-bottom-5 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Drag Bar */}
            <div className="pt-0.5 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-zinc-700/80" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white">
                    Offrir un cadeau à {owner.alias}
                  </h4>
                  <p className="text-[10px] text-zinc-400">
                    Soutiens sa Flamme 24h avec une clé ou un symbole
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGiftsDrawerOpen(false)}
                className="p-1 rounded-full text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User Balance Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">Ton solde disponible :</span>
              <div className="flex items-center gap-3 font-bold">
                <span className="text-amber-400 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5" />
                  {user.keysAvailable} Clé{user.keysAvailable > 1 ? 's' : ''}
                </span>
                <span className="text-indigo-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  {user.padlocksAvailable || 0} Cadenas
                </span>
              </div>
            </div>

            {/* Gifts Grid */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                {
                  type: 'key' as const,
                  emoji: '🔑',
                  label: 'Clé d’Évasion',
                  desc: 'Coût: 1 Clé',
                  highlight: true,
                },
                {
                  type: 'padlock' as const,
                  emoji: '🔒',
                  label: 'Cadenas Scellé',
                  desc: 'Coût: 1 Cadenas',
                  highlight: false,
                },
                {
                  type: 'gold_flame' as const,
                  emoji: '🔥',
                  label: 'Flamme d’Or',
                  desc: 'Gratuit · Boost',
                  highlight: true,
                },
                {
                  type: 'ice_cone' as const,
                  emoji: '🍦',
                  label: 'Cornet Glacé',
                  desc: 'Gratuit · Douceur',
                  highlight: false,
                },
                {
                  type: 'water_bottle' as const,
                  emoji: '🥤',
                  label: 'Boisson Fraîche',
                  desc: 'Gratuit · Énergie',
                  highlight: false,
                },
                {
                  type: 'crown' as const,
                  emoji: '👑',
                  label: 'Couronne VIP',
                  desc: 'Gratuit · Respect',
                  highlight: false,
                },
              ].map((g) => (
                <button
                  key={g.type}
                  type="button"
                  disabled={isSending}
                  onClick={() => void handleSendGift(g)}
                  className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 ${
                    g.highlight
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/35 hover:border-amber-400'
                      : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-2xl sm:text-3xl">{g.emoji}</span>
                  <span className="text-[11px] font-bold text-white text-center leading-tight">
                    {g.label}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">{g.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
