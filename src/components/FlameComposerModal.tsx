import React, { useState, useRef } from 'react';
import {
  X,
  Flame,
  Type,
  Image as ImageIcon,
  Film,
  Mic,
  Upload,
  Loader2,
  Bell,
  Sparkles,
  Music,
  Play,
  Pause,
  Disc3,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DeezerTrack } from '../types';
import { processUniverseFile, revokeMediaUrlOrRef } from '../utils/mediaStore';
import { SmartImage, SmartVideoPlayer } from './MediaElements';
import { TikTokVoiceRecorder } from './TikTokVoiceNote';
import { DeezerMusicPickerModal } from './DeezerMusicPickerModal';
import { getPlayableDeezerUrl } from '../utils/audio';

interface FlameComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FlameTab = 'text' | 'photo' | 'video' | 'audio';

const FLAME_GRADIENTS = [
  { id: 'ember', label: 'Braise', cls: 'from-orange-600 via-red-600 to-rose-700' },
  { id: 'cyber', label: 'Cyber', cls: 'from-cyan-600 via-blue-700 to-indigo-800' },
  { id: 'emerald', label: 'Évasion', cls: 'from-emerald-600 via-teal-700 to-zinc-900' },
  { id: 'neon', label: 'Néon', cls: 'from-fuchsia-600 via-purple-700 to-indigo-900' },
  { id: 'gold', label: 'Or', cls: 'from-amber-500 via-orange-600 to-yellow-700' },
  { id: 'obsidian', label: 'Nuit', cls: 'from-zinc-800 via-zinc-900 to-black' },
];

export const FlameComposerModal: React.FC<FlameComposerModalProps> = ({ isOpen, onClose }) => {
  const { setActiveFlame, showToast, friends } = useApp();
  const [tab, setTab] = useState<FlameTab>('text');
  const [text, setText] = useState('');
  const [bgGradient, setBgGradient] = useState(FLAME_GRADIENTS[0].cls);
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [mediaDuration, setMediaDuration] = useState<number | undefined>(undefined);
  const [mediaFileName, setMediaFileName] = useState<string | undefined>(undefined);
  const [recordedAudio, setRecordedAudio] = useState<{ duration: number; audioData: string } | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<DeezerTrack | null>(null);
  const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const togglePreviewAudio = () => {
    if (!selectedMusic?.previewUrl) return;
    const playable = getPlayableDeezerUrl(selectedMusic.previewUrl, selectedMusic);
    if (!previewAudioRef.current || previewAudioRef.current.src !== playable) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      const a = new Audio(playable);
      (a as unknown as { playsInline: boolean }).playsInline = true;
      a.onended = () => setIsPlayingPreview(false);
      a.onerror = () => setIsPlayingPreview(false);
      previewAudioRef.current = a;
    }
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current.play().then(() => setIsPlayingPreview(true)).catch(() => setIsPlayingPreview(false));
    }
  };

  const handleSelectDeezerTrack = (track: DeezerTrack | null) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPlayingPreview(false);
    setSelectedMusic(track);
  };

  const handleRemoveDeezerTrack = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPlayingPreview(false);
    setSelectedMusic(null);
  };

  if (!isOpen) return null;

  const resetMedia = (revoke = true) => {
    if (revoke) {
      if (mediaUrl) revokeMediaUrlOrRef(mediaUrl);
      if (recordedAudio?.audioData) revokeMediaUrlOrRef(recordedAudio.audioData);
    }
    setMediaUrl('');
    setMediaDuration(undefined);
    setMediaFileName(undefined);
    setRecordedAudio(null);
  };

  const handleCloseDiscard = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPlayingPreview(false);
    resetMedia(true);
    onClose();
  };

  const handleSelectTab = (next: FlameTab) => {
    setTab(next);
    if (next !== tab) {
      resetMedia(true);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, expected: 'photo' | 'video') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsProcessingFile(true);
    try {
      const processed = await processUniverseFile(file);
      if (expected === 'photo' && processed.type !== 'photo') {
        showToast({
          title: 'Image attendue',
          message: 'Sélectionne un fichier image (JPG, PNG, WEBP…).',
          type: 'warning',
        });
        return;
      }
      if (expected === 'video' && processed.type !== 'video') {
        showToast({
          title: 'Vidéo attendue',
          message: 'Sélectionne une vidéo (MP4, MOV, WEBM…).',
          type: 'warning',
        });
        return;
      }
      if (mediaUrl && mediaUrl !== processed.url) {
        revokeMediaUrlOrRef(mediaUrl);
      }
      setMediaUrl(processed.url);
      setMediaDuration(processed.duration);
      setMediaFileName(processed.fileName);
    } catch (err) {
      showToast({
        title: 'Erreur fichier',
        message: err instanceof Error ? err.message : 'Impossible de lire ce média.',
        type: 'warning',
      });
    } finally {
      setIsProcessingFile(false);
    }
  };

  const canPublish =
    !isPublishing &&
    !isProcessingFile &&
    ((tab === 'text' && text.trim().length > 0) ||
      (tab === 'photo' && Boolean(mediaUrl)) ||
      (tab === 'video' && Boolean(mediaUrl)) ||
      (tab === 'audio' && Boolean(recordedAudio?.audioData)));

  const handlePublish = async () => {
    if (!canPublish) return;
    setIsPublishing(true);
    try {
      let ok = false;
      if (tab === 'text') {
        ok = await setActiveFlame({
          type: 'text',
          text: text.trim(),
          bgGradient,
          bgMusic: selectedMusic || undefined,
        });
      } else if (tab === 'photo') {
        ok = await setActiveFlame({
          type: 'photo',
          url: mediaUrl,
          caption: caption.trim() || undefined,
          fileName: mediaFileName,
          bgMusic: selectedMusic || undefined,
        });
      } else if (tab === 'video') {
        ok = await setActiveFlame({
          type: 'video',
          url: mediaUrl,
          duration: mediaDuration,
          caption: caption.trim() || undefined,
          fileName: mediaFileName,
          bgMusic: selectedMusic || undefined,
        });
      } else if (tab === 'audio' && recordedAudio) {
        ok = await setActiveFlame({
          type: 'audio',
          url: recordedAudio.audioData,
          duration: recordedAudio.duration,
          caption: caption.trim() || undefined,
          bgMusic: selectedMusic || undefined,
        });
      }
      if (ok) {
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
          previewAudioRef.current = null;
        }
        setIsPlayingPreview(false);
        setText('');
        setCaption('');
        setSelectedMusic(null);
        resetMedia(false);
        onClose();
      }
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
      onClick={handleCloseDiscard}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-zinc-950 border border-orange-500/35 shadow-[0_0_50px_rgba(249,115,22,0.2)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-gradient-to-r from-orange-500/15 via-red-500/10 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white tracking-tight">Allumer ma Flamme 24h</h3>
              <p className="text-[11px] text-zinc-400">
                Visible au clic sur ton profil · Disparaît après 24h
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseDiscard}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-4 pt-3 pb-2 grid grid-cols-4 gap-1.5 bg-zinc-950">
          {(
            [
              { id: 'text', label: 'Texte', icon: Type },
              { id: 'photo', label: 'Photo', icon: ImageIcon },
              { id: 'video', label: 'Vidéo', icon: Film },
              { id: 'audio', label: 'Vocal', icon: Mic },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                  active
                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-300 shadow-sm'
                    : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {tab === 'text' && (
            <div className="space-y-3">
              <div
                className={`w-full min-h-[210px] rounded-2xl p-5 flex items-center justify-center text-center bg-gradient-to-br ${bgGradient} border border-white/15 shadow-inner`}
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 400))}
                  placeholder="Partage ta présence du jour, ton humeur ou une pensée rapide pour tes amis…"
                  rows={4}
                  className="w-full bg-transparent text-white placeholder-white/60 text-base sm:text-lg font-extrabold text-center resize-none focus:outline-none leading-snug"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {FLAME_GRADIENTS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setBgGradient(g.cls)}
                      title={g.label}
                      className={`w-7 h-7 rounded-full bg-gradient-to-br ${g.cls} border-2 transition-transform ${
                        bgGradient === g.cls ? 'border-white scale-110' : 'border-zinc-700 opacity-80'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] font-mono text-zinc-500">{text.length}/400</span>
              </div>
            </div>
          )}

          {tab === 'photo' && (
            <div className="space-y-3">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFileChange(e, 'photo')}
              />
              {mediaUrl ? (
                <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-black">
                  <SmartImage src={mediaUrl} alt="Aperçu flamme" className="w-full max-h-72 object-contain" />
                  <button
                    type="button"
                    onClick={() => resetMedia(true)}
                    className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 text-white text-xs font-bold border border-white/15 hover:bg-red-600/80 transition-colors"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isProcessingFile}
                  className="w-full py-12 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-orange-500/60 bg-zinc-900/50 flex flex-col items-center justify-center gap-2 text-zinc-300 transition-colors"
                >
                  {isProcessingFile ? (
                    <Loader2 className="w-7 h-7 animate-spin text-orange-400" />
                  ) : (
                    <Upload className="w-7 h-7 text-orange-400" />
                  )}
                  <span className="text-sm font-bold">
                    {isProcessingFile ? 'Préparation de la photo…' : 'Choisir une photo'}
                  </span>
                  <span className="text-[11px] text-zinc-500">JPG, PNG, WEBP · Visible 24h</span>
                </button>
              )}
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 180))}
                placeholder="Ajouter une légende (optionnel)…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/60"
              />
            </div>
          )}

          {tab === 'video' && (
            <div className="space-y-3">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => void handleFileChange(e, 'video')}
              />
              {mediaUrl ? (
                <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-black">
                  <SmartVideoPlayer src={mediaUrl} duration={mediaDuration} bgMusic={selectedMusic || undefined} />
                  <button
                    type="button"
                    onClick={() => resetMedia(true)}
                    className="absolute top-2.5 right-2.5 z-10 px-2.5 py-1 rounded-full bg-black/75 text-white text-xs font-bold border border-white/15 hover:bg-red-600/80 transition-colors"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={isProcessingFile}
                  className="w-full py-12 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-orange-500/60 bg-zinc-900/50 flex flex-col items-center justify-center gap-2 text-zinc-300 transition-colors"
                >
                  {isProcessingFile ? (
                    <Loader2 className="w-7 h-7 animate-spin text-orange-400" />
                  ) : (
                    <Film className="w-7 h-7 text-orange-400" />
                  )}
                  <span className="text-sm font-bold">
                    {isProcessingFile ? 'Préparation de la vidéo…' : 'Choisir une vidéo'}
                  </span>
                  <span className="text-[11px] text-zinc-500">MP4, MOV, WEBM · Visible 24h</span>
                </button>
              )}
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 180))}
                placeholder="Ajouter une légende (optionnel)…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/60"
              />
            </div>
          )}

          {tab === 'audio' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                <p className="text-xs font-bold text-zinc-300 mb-3 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-orange-400" />
                  Enregistre une note vocale de 60s max pour ta Flamme 24h
                </p>
                <TikTokVoiceRecorder
                  maxSeconds={60}
                  label="Enregistrer ma Flamme vocale"
                  recordedNote={recordedAudio}
                  onRecorded={(note) => setRecordedAudio(note)}
                />
              </div>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 180))}
                placeholder="Titre ou contexte du vocal (optionnel)…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/60"
              />
            </div>
          )}

          {/* Section Musique de fond */}
          <div className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Music className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs font-bold text-white">Musique de fond</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                Optionnel
              </span>
            </div>

            {selectedMusic ? (
              <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                    {selectedMusic.albumCover ? (
                      <img
                        src={selectedMusic.albumCover}
                        alt={selectedMusic.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Disc3 className="w-5 h-5 text-zinc-500" />
                    )}
                    <button
                      type="button"
                      onClick={togglePreviewAudio}
                      title={isPlayingPreview ? 'Mettre en pause' : 'Écouter'}
                      className="absolute inset-0 bg-black/50 hover:bg-black/60 flex items-center justify-center text-white transition-colors cursor-pointer"
                    >
                      {isPlayingPreview ? (
                        <Pause className="w-4 h-4 text-orange-400" />
                      ) : (
                        <Play className="w-4 h-4 fill-white ml-0.5" />
                      )}
                    </button>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{selectedMusic.title}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{selectedMusic.artist}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMusicPickerOpen(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Changer
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveDeezerTrack}
                    title="Supprimer la musique"
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-500/20 border border-zinc-800 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsMusicPickerOpen(true)}
                className="w-full py-2.5 px-3 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900/50 text-xs font-medium text-zinc-300 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Music className="w-3.5 h-3.5 text-zinc-400" />
                <span>+ Ajouter une musique de fond 🎵</span>
              </button>
            )}
          </div>

          {/* Friends notification info */}
          <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-start gap-2.5">
            <Bell className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-orange-200/90 leading-relaxed">
              Tes amis ({friends.length}) recevront une notification instantanée dès la publication et pourront
              commenter ta Flamme puis passer en discussion privée.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/90 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCloseDiscard}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canPublish}
            onClick={() => void handlePublish()}
            className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
              canPublish
                ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/25 hover:brightness-110'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Publication…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Publier ma Flamme 24h 🔥</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Deezer Music Picker Modal */}
      <DeezerMusicPickerModal
        isOpen={isMusicPickerOpen}
        onClose={() => setIsMusicPickerOpen(false)}
        onSelectTrack={handleSelectDeezerTrack}
        selectedTrack={selectedMusic}
      />
    </div>
  );
};
