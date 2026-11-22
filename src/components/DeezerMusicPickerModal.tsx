import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Search,
  Music,
  Play,
  Pause,
  Check,
  Loader2,
  Trash2,
  Volume2,
  VolumeX,
  LayoutGrid,
  List,
} from 'lucide-react';
import { DeezerTrack } from '../types';
import { SmartImage } from './MediaElements';
import {
  getPlayableCoverUrl,
  getPlayableDeezerUrl,
  resolveFreshTrackPreviewUrl,
} from '../utils/audio';

interface DeezerMusicPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrack?: DeezerTrack | null;
  onSelectTrack: (track: DeezerTrack | null) => void;
  title?: string;
  subtitle?: string;
}

interface RawApiMusicTrack {
  id: number | string;
  title: string;
  titleShort?: string;
  artist: string;
  cover?: string;
  albumCover?: string;
  albumTitle?: string;
  audioUrl?: string;
  previewUrl?: string;
  duration?: number;
}

const POPULAR_ARTISTS = [
  'Daft Punk',
  'The Weeknd',
  'Ninho',
  'Jul',
  'Billie Eilish',
  'Dua Lipa',
  'Gims',
  'PNL',
  'Aya Nakamura',
  'Coldplay',
  'Tiakola',
  'Stromae',
  'Drake',
];

function normalizeMusicTrack(raw: RawApiMusicTrack): DeezerTrack {
  const cover = getPlayableCoverUrl(raw.cover || raw.albumCover || '');
  const audioUrl = getPlayableDeezerUrl(raw.audioUrl || raw.previewUrl || '', {
    id: raw.id,
    title: raw.title,
    artist: raw.artist,
  });
  return {
    id: raw.id,
    title: raw.title || 'Titre',
    titleShort: raw.titleShort || raw.title || 'Titre',
    artist: raw.artist || 'Artiste',
    cover,
    albumCover: cover,
    albumTitle: raw.albumTitle || '',
    audioUrl,
    previewUrl: audioUrl,
    duration: raw.duration || 30,
  };
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSec = Math.floor(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const DeezerMusicPickerModal: React.FC<DeezerMusicPickerModalProps> = ({
  isOpen,
  onClose,
  selectedTrack,
  onSelectTrack,
  title = 'Musique de fond',
  subtitle = 'Recherche et écoute un titre directement dans le lecteur',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<DeezerTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Custom HTML5 <audio> player state
  const [activeTrack, setActiveTrack] = useState<DeezerTrack | null>(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retriedTrackIdRef = useRef<number | string | null>(null);

  const fetchMusicTracks = useCallback(async (query: string, signal?: AbortSignal) => {
    const cleanQuery = query.trim() || 'top hits';
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/music?q=${encodeURIComponent(cleanQuery)}`, {
        method: 'GET',
        signal,
      });
      if (!response.ok) {
        throw new Error('Impossible de charger les titres');
      }
      const payload = (await response.json()) as
        | RawApiMusicTrack[]
        | { tracks?: RawApiMusicTrack[]; error?: string };
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.tracks)
        ? payload.tracks
        : [];
      const normalized = list
        .map(normalizeMusicTrack)
        .filter((item) => Boolean(item.audioUrl));
      setTracks(normalized);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      // Secondary retry against /api/music/search if /api/music had a transient error
      try {
        const retryRes = await fetch(`/api/music/search?q=${encodeURIComponent(cleanQuery)}`, {
          method: 'GET',
          signal,
        });
        if (retryRes.ok) {
          const retryPayload = (await retryRes.json()) as
            | RawApiMusicTrack[]
            | { tracks?: RawApiMusicTrack[] };
          const retryList = Array.isArray(retryPayload)
            ? retryPayload
            : Array.isArray(retryPayload?.tracks)
            ? retryPayload.tracks
            : [];
          const normalized = retryList
            .map(normalizeMusicTrack)
            .filter((item) => Boolean(item.audioUrl));
          if (normalized.length > 0) {
            setTracks(normalized);
            return;
          }
        }
      } catch (retryErr) {
        if ((retryErr as { name?: string })?.name === 'AbortError') return;
      }
      setErrorMessage('Impossible de récupérer les musiques pour cette recherche.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Stop audio on modal close
  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      setIsBuffering(false);
      setCurrentTime(0);
      return;
    }
    if (selectedTrack && !activeTrack) {
      const norm = normalizeMusicTrack(selectedTrack);
      setActiveTrack(norm);
      setActiveAudioUrl(norm.audioUrl || norm.previewUrl);
    }
  }, [isOpen, selectedTrack, activeTrack]);

  // Search via GET /api/music?q=${encodeURIComponent(query)} with debounce
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const clean = searchQuery.trim();
    const delay = clean ? 240 : 0;
    const timer = window.setTimeout(() => {
      void fetchMusicTracks(clean || 'top hits', controller.signal);
    }, delay);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isOpen, searchQuery, fetchMusicTracks]);

  // Sync volume & mute to HTML5 <audio> element
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = Math.max(0, Math.min(1, volume));
    audioRef.current.muted = isMuted;
  }, [volume, isMuted]);

  const startTrackPlayback = (track: DeezerTrack) => {
    const normalized = normalizeMusicTrack(track);
    const streamUrl = normalized.audioUrl || normalized.previewUrl;
    if (!streamUrl) return;

    // Toggle play/pause if clicking the already active track
    if (activeTrack && String(activeTrack.id) === String(normalized.id) && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        setIsBuffering(true);
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
      }
      return;
    }

    retriedTrackIdRef.current = null;
    setActiveTrack(normalized);
    setActiveAudioUrl(streamUrl);
    setCurrentTime(0);
    setDuration(normalized.duration || 30);
    setIsBuffering(true);

    window.setTimeout(() => {
      const el = audioRef.current;
      if (!el) return;
      el.src = streamUrl;
      el.volume = Math.max(0, Math.min(1, volume));
      el.muted = isMuted;
      el.load();
      el.play()
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch(() => {
          void handleAudioRefreshFallback(normalized);
        });
    }, 0);
  };

  const handleAudioRefreshFallback = async (trackToRefresh: DeezerTrack) => {
    if (retriedTrackIdRef.current === trackToRefresh.id) {
      setIsPlaying(false);
      setIsBuffering(false);
      return;
    }
    retriedTrackIdRef.current = trackToRefresh.id;
    const freshUrl = await resolveFreshTrackPreviewUrl(trackToRefresh, true);
    if (freshUrl && audioRef.current) {
      setActiveAudioUrl(freshUrl);
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

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(e.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current && Number.isFinite(nextTime)) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVol = Number(e.target.value);
    setVolume(nextVol);
    if (nextVol > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleSelect = (track: DeezerTrack) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    const normalized = normalizeMusicTrack(track);
    onSelectTrack(normalized);
    onClose();
  };

  const handleRemoveTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    onSelectTrack(null);
  };

  if (!isOpen) return null;

  const progressRatio = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Native HTML5 <audio> element driving the custom player */}
        <audio
          ref={audioRef}
          src={activeAudioUrl || undefined}
          playsInline
          preload="auto"
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
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onError={() => {
            if (activeTrack) {
              void handleAudioRefreshFallback(activeTrack);
            } else {
              setIsPlaying(false);
              setIsBuffering(false);
            }
          }}
          className="hidden"
        />

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
              <Music className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
              <p className="text-[11px] text-zinc-400">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Currently Attached Track Banner */}
        {selectedTrack && (
          <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                {selectedTrack.cover || selectedTrack.albumCover ? (
                  <SmartImage
                    src={getPlayableCoverUrl(selectedTrack.cover || selectedTrack.albumCover)}
                    alt={selectedTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <Music className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                  <span className="truncate">{selectedTrack.title}</span>
                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  {selectedTrack.artist} · Sélection actuelle
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemoveTrack}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 hover:border-red-500/40 text-zinc-300 hover:text-red-300 text-[11px] font-semibold transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Retirer</span>
            </button>
          </div>
        )}

        {/* Search Input + View Toggle + Quick Artist Chips */}
        <div className="p-3.5 border-b border-zinc-800/80 bg-zinc-950 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un titre ou un artiste…"
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/60 transition-all font-medium"
                autoFocus
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Effacer la recherche"
                  title="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* List / Grid toggle */}
            <div className="flex items-center rounded-xl bg-zinc-900 border border-zinc-800 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Affichage en liste"
                aria-label="Affichage en liste"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-zinc-800 text-orange-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Affichage en grille"
                aria-label="Affichage en grille"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-zinc-800 text-orange-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Artist Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {POPULAR_ARTISTS.map((artist) => (
              <button
                key={artist}
                type="button"
                onClick={() => {
                  setSearchQuery(artist);
                  searchInputRef.current?.focus();
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors border shrink-0 cursor-pointer ${
                  searchQuery.toLowerCase() === artist.toLowerCase()
                    ? 'bg-orange-500 text-zinc-950 border-orange-400 font-bold'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800/80'
                }`}
              >
                {artist}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Native HTML5 Audio Player Bar */}
        {activeTrack && (
          <div className="px-4 py-3 bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-zinc-950 border-b border-orange-500/30 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              {/* Cover + Play/Pause Button + Track Info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => startTrackPlayback(activeTrack)}
                  aria-label={isPlaying ? 'Pause' : 'Lecture'}
                  className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-orange-500/50 bg-zinc-800 flex items-center justify-center group cursor-pointer shadow-md"
                >
                  {activeTrack.cover || activeTrack.albumCover ? (
                    <SmartImage
                      src={activeTrack.cover || activeTrack.albumCover || ''}
                      alt={activeTrack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music className="w-5 h-5 text-orange-400" />
                  )}
                  <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                    {isBuffering ? (
                      <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-4 h-4 text-white fill-white" />
                    ) : (
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    )}
                  </div>
                </button>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">{activeTrack.title}</div>
                  <div className="text-[11px] text-orange-300/90 truncate">{activeTrack.artist}</div>
                </div>
              </div>

              {/* Volume Control (Mute Toggle + Slider) */}
              <div className="flex items-center gap-1.5 shrink-0 bg-zinc-950/80 px-2.5 py-1.5 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
                  title={isMuted ? 'Activer le son' : 'Couper le son'}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
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
                  aria-label="Volume audio"
                  className="w-16 sm:w-20 h-1.5 accent-orange-500 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Direct Choose CTA */}
              <button
                type="button"
                onClick={() => handleSelect(activeTrack)}
                className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs transition-colors shrink-0 cursor-pointer shadow-sm"
              >
                Choisir
              </button>
            </div>

            {/* Interactive Progress Bar */}
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-mono text-zinc-400 tabular-nums w-8 text-right">
                {formatAudioTime(currentTime)}
              </span>
              <div className="relative flex-1 flex items-center">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden pointer-events-none">
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
                  aria-label="Progression de la lecture"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-400 tabular-nums w-8">
                {formatAudioTime(duration)}
              </span>
            </div>
          </div>
        )}

        {/* Tracks Results (List or Grid) */}
        <div className="flex-1 overflow-y-auto p-3 max-h-[50vh]">
          {isLoading && tracks.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
              <span className="text-xs">Recherche musicale en cours…</span>
            </div>
          ) : errorMessage && tracks.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-zinc-400">
              <Music className="w-7 h-7 text-zinc-700" />
              <span className="text-xs text-red-300">{errorMessage}</span>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-zinc-500">
              <Music className="w-7 h-7 text-zinc-700" />
              <span className="text-xs font-semibold text-zinc-400">Aucun titre trouvé</span>
              <span className="text-[11px] text-zinc-500 max-w-xs">
                Tape le nom d&apos;un artiste ou d&apos;un morceau ci-dessus.
              </span>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {tracks.map((track) => {
                const isThisActive = activeTrack && String(activeTrack.id) === String(track.id);
                const isThisPlaying = Boolean(isThisActive && isPlaying);
                const isCurrentSelection =
                  selectedTrack && String(selectedTrack.id) === String(track.id);
                const coverSrc = track.cover || track.albumCover || '';

                return (
                  <div
                    key={track.id}
                    className={`p-2.5 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                      isCurrentSelection
                        ? 'bg-orange-500/10 border-orange-500/50'
                        : isThisActive
                        ? 'bg-zinc-900 border-orange-500/40'
                        : 'bg-zinc-900/50 hover:bg-zinc-900 border-zinc-800/70 hover:border-zinc-700'
                    }`}
                  >
                    <div
                      onClick={() => startTrackPlayback(track)}
                      className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-800 border border-zinc-800 cursor-pointer group"
                    >
                      {coverSrc ? (
                        <SmartImage
                          src={coverSrc}
                          alt={track.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500">
                          <Music className="w-6 h-6" />
                        </div>
                      )}
                      <div
                        className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                          isThisActive
                            ? 'bg-black/55 opacity-100'
                            : 'bg-black/40 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-orange-500 text-zinc-950 flex items-center justify-center shadow-lg">
                          {isThisActive && isBuffering ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isThisPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{track.title}</div>
                      <div className="text-[11px] text-zinc-400 truncate">{track.artist}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelect(track)}
                      className={`w-full py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        isCurrentSelection
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'bg-zinc-800 hover:bg-orange-500 text-zinc-200 hover:text-zinc-950'
                      }`}
                    >
                      {isCurrentSelection ? 'Sélectionné' : 'Choisir'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {tracks.map((track) => {
                const isThisActive = activeTrack && String(activeTrack.id) === String(track.id);
                const isThisPlaying = Boolean(isThisActive && isPlaying);
                const isCurrentSelection =
                  selectedTrack && String(selectedTrack.id) === String(track.id);
                const coverSrc = track.cover || track.albumCover || '';

                return (
                  <div
                    key={track.id}
                    className={`p-2 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                      isCurrentSelection
                        ? 'bg-orange-500/10 border-orange-500/40'
                        : isThisActive
                        ? 'bg-zinc-900 border-orange-500/40'
                        : 'bg-zinc-900/50 hover:bg-zinc-900 border-zinc-800/60 hover:border-zinc-700'
                    }`}
                  >
                    {/* Left: Play button + Cover + Title + Artist */}
                    <div
                      onClick={() => startTrackPlayback(track)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startTrackPlayback(track);
                        }}
                        className={`relative w-11 h-11 rounded-lg overflow-hidden shrink-0 border group cursor-pointer ${
                          isThisActive ? 'border-orange-400' : 'border-zinc-800'
                        }`}
                        title={isThisPlaying ? 'Pause' : 'Écouter'}
                      >
                        {coverSrc ? (
                          <SmartImage
                            src={coverSrc}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                            <Music className="w-4 h-4" />
                          </div>
                        )}
                        <div
                          className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                            isThisActive
                              ? 'bg-black/60 opacity-100'
                              : 'bg-black/40 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {isThisActive && isBuffering ? (
                            <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                          ) : isThisPlaying ? (
                            <Pause className="w-4 h-4 text-white fill-white" />
                          ) : (
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          )}
                        </div>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-white truncate max-w-full">
                            {track.title}
                          </span>
                          {isThisPlaying && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-orange-500/20 text-[9px] font-bold text-orange-300">
                              <Volume2 className="w-2.5 h-2.5" />
                              <span>En lecture</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">{track.artist}</div>
                      </div>
                    </div>

                    {/* Right: Play & Select buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startTrackPlayback(track)}
                        className={`p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                          isThisPlaying
                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                            : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                        }`}
                        title={isThisPlaying ? 'Mettre en pause' : 'Lire dans le lecteur'}
                        aria-label={isThisPlaying ? 'Mettre en pause' : 'Lire dans le lecteur'}
                      >
                        {isThisPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelect(track)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isCurrentSelection
                            ? 'bg-emerald-500 text-zinc-950'
                            : 'bg-zinc-800 hover:bg-orange-500 text-zinc-200 hover:text-zinc-950'
                        }`}
                      >
                        {isCurrentSelection ? 'Sélectionné' : 'Choisir'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-zinc-800/80 bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Lecteur audio intégré · Aucun lien externe</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
