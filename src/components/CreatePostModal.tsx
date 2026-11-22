import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Lock,
  Mic,
  ShieldCheck,
  AlertCircle,
  Image as ImageIcon,
  Hash,
  AtSign,
  Key,
  Video,
  Music,
  FileText,
} from 'lucide-react';
import { PostCategory, DeezerTrack, AttachedFileMeta } from '../types';
import { useApp } from '../context/AppContext';
import { TikTokVoiceRecorder } from './TikTokVoiceNote';
import {
  processImageFile,
  processDocumentFile,
  revokeMediaUrlOrRef,
} from '../utils/mediaStore';
import {
  SmartImage,
  SmartVideoPlayer,
  VideoStudioModal,
  DocumentFileCard,
} from './MediaElements';
import { AvatarDisplay } from './AvatarDisplay';
import { getNeonTextClass, getNeonAvatarRingClass } from '../utils/neonStyles';
import { DeezerMusicPickerModal } from './DeezerMusicPickerModal';
import { AmbientMusicBar } from './AmbientMusicBar';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: { id: PostCategory; label: string; tag: string; desc: string }[] = [
  { id: 'ecrans', label: '📱 #Écrans', tag: '#Écrans', desc: 'Scrolling, réseaux, algorithmes' },
  { id: 'routine', label: '🔁 #Routine', tag: '#Routine', desc: 'Quotidien, discipline, habitudes' },
  { id: 'pression', label: '🎭 #Pression', tag: '#PressionSociale', desc: 'Regard des autres, authenticité' },
  { id: 'burnout', label: '⚡ #Burnout', tag: '#Burnout', desc: 'Surcharge mentale, repos' },
  { id: 'procrastination', label: '⏳ #Focus', tag: '#Focus', desc: 'Action, objectifs, création' },
  { id: 'solitude', label: '🌑 #Solitude', tag: '#Solitude', desc: 'Connexions réelles, entraide' },
];

const QUICK_HASHTAGS = ['#Détox', '#Vérité', '#Focus', '#Liberté', '#NuitBlanche', '#SportIRL', '#Créativité', '#ZéroAlgo'];
const QUICK_MENTIONS = ['@Communauté', '@Veilleur', '@Cerveau', '@Complices', '@Matricule_404'];

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ isOpen, onClose }) => {
  const { user, theme, createPost, customSalons, showToast } = useApp();
  const isDark = theme === 'dark';

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('ecrans');
  const [keysRequired, setKeysRequired] = useState<number>(10);
  const [recordedVoice, setRecordedVoice] = useState<{ duration: number; audioData: string } | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedVideo, setAttachedVideo] = useState<{ videoUrl: string; duration: number } | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFileMeta | null>(null);
  const [attachedMusic, setAttachedMusic] = useState<DeezerTrack | null>(null);
  const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
  const [isVideoStudioOpen, setIsVideoStudioOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      submittedRef.current = false;
    }
  }, [isOpen]);

  const cleanupUnpublishedDrafts = () => {
    if (submittedRef.current) return;
    if (attachedImage) void revokeMediaUrlOrRef(attachedImage);
    if (attachedVideo?.videoUrl) void revokeMediaUrlOrRef(attachedVideo.videoUrl);
    if (recordedVoice?.audioData) void revokeMediaUrlOrRef(recordedVoice.audioData);
    if (attachedFile?.url) void revokeMediaUrlOrRef(attachedFile.url);
  };

  const handleClose = () => {
    cleanupUnpublishedDrafts();
    setAttachedImage(null);
    setAttachedVideo(null);
    setRecordedVoice(null);
    setAttachedFile(null);
    setAttachedMusic(null);
    onClose();
  };

  if (!isOpen) return null;

  const insertToken = (token: string) => {
    setContent((prev) => {
      if (prev.includes(token)) return prev;
      const sep = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
      return `${prev}${sep}${token} `;
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const processed = await processImageFile(file, 1080);
      if (attachedImage) void revokeMediaUrlOrRef(attachedImage);
      setAttachedImage(processed);
    } catch (err) {
      showToast({
        title: 'Photo invalide',
        message: err instanceof Error ? err.message : "Impossible d'importer cette image.",
        type: 'warning',
      });
    }
  };

  const handleDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const doc = await processDocumentFile(file);
      if (attachedFile?.url) void revokeMediaUrlOrRef(attachedFile.url);
      setAttachedFile({
        url: doc.fileRef,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
      });
    } catch (err) {
      showToast({
        title: 'Fichier refusé',
        message: err instanceof Error ? err.message : 'Document trop volumineux (max 20 Mo).',
        type: 'warning',
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !recordedVoice && !attachedImage && !attachedVideo && !attachedMusic && !attachedFile) return;

    submittedRef.current = true;
    const fallbackText = attachedVideo
      ? '🎬 Vidéo partagée sur le réseau #Évasion'
      : recordedVoice
      ? '🎙️ Note vocale partagée sur le réseau #Évasion'
      : attachedFile
      ? `📄 Document partagé : ${attachedFile.fileName}`
      : attachedMusic
      ? `🎵 Musique partagée : ${attachedMusic.title} (${attachedMusic.artist})`
      : '📸 Photo partagée sur le réseau #Évasion';

    createPost(
      content.trim() || fallbackText,
      category,
      recordedVoice
        ? {
            duration: recordedVoice.duration,
            hasVoiceFilter: false,
            audioData: recordedVoice.audioData,
          }
        : undefined,
      keysRequired,
      attachedImage || undefined,
      attachedVideo || undefined,
      attachedMusic || undefined,
      attachedFile || undefined
    );

    setContent('');
    setKeysRequired(10);
    setRecordedVoice(null);
    setAttachedImage(null);
    setAttachedVideo(null);
    setAttachedFile(null);
    setAttachedMusic(null);
    onClose();
  };

  const hasAnyAttachment =
    Boolean(content.trim()) ||
    Boolean(recordedVoice) ||
    Boolean(attachedImage) ||
    Boolean(attachedVideo) ||
    Boolean(attachedMusic) ||
    Boolean(attachedFile);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className={`relative w-full max-w-lg border rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto no-scrollbar ${
          isDark ? 'bg-[#120d0d] border-[#ef4444]/25' : 'bg-white border-zinc-200'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between pb-3 border-b mb-4 ${
            isDark ? 'border-[#ef4444]/15' : 'border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg overflow-hidden ${
                isDark ? 'bg-zinc-800' : 'bg-zinc-100'
              } ${getNeonAvatarRingClass(user.neonColor, theme)}`}
            >
              <AvatarDisplay avatar={user.avatar} alt={user.alias} />
            </span>
            <div>
              <h2 className={`text-base font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                <span>Nouvelle publication</span>
                <span className="text-xs font-mono text-amber-500">🔑🔒</span>
              </h2>
              <p className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                <span
                  className={
                    user.neonColor
                      ? getNeonTextClass(user.neonColor, theme)
                      : isDark
                      ? 'text-zinc-200'
                      : 'text-zinc-900'
                  }
                >
                  @{user.alias || user.matricule}
                </span>{' '}
                · <span className={isDark ? 'text-zinc-300' : 'text-zinc-700'}>{user.matricule}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? 'bg-zinc-800 text-zinc-400 hover:text-white'
                : 'bg-zinc-100 text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Sujet principal (#) */}
          <div className="space-y-1.5">
            <label className={`block text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              1. Sujet principal (#)
            </label>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  title={cat.desc}
                  className={`px-3 py-2 rounded-xl border transition-all text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                    category === cat.id
                      ? isDark
                        ? 'bg-red-500/15 border-red-500/70 text-white font-bold shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                        : 'bg-red-50 border-red-400 text-red-700 font-bold'
                      : isDark
                      ? 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Grande Zone de texte ergonomique et haute */}
          <div
            className={`rounded-2xl border focus-within:border-[#f97316]/80 transition-colors overflow-hidden ${
              isDark ? 'bg-[#090707] border-[#ef4444]/20' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div
              className={`flex items-center justify-between px-4 py-2.5 border-b ${
                isDark ? 'border-zinc-800/80 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-100/80'
              }`}
            >
              <span className={`text-xs font-mono font-semibold ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                2. Ton message · Texte, #Sujets & @Mentions
              </span>
              <div className="flex items-center gap-2.5">
                {content.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setContent('')}
                    className={`text-[11px] font-mono cursor-pointer ${
                      isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    Effacer
                  </button>
                )}
                <span className="text-xs font-mono tabular-nums text-zinc-500">
                  {content.length}/2000
                </span>
              </div>
            </div>

            <textarea
              maxLength={2000}
              rows={7}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Écris librement ton ressenti de haut en bas, lance un débat avec #Détox ou mentionne @Communauté..."
              className={`w-full min-h-[170px] sm:min-h-[210px] !bg-transparent !border-0 p-4 text-sm sm:text-base leading-relaxed focus:outline-none resize-y font-sans ${
                isDark ? 'text-zinc-100 placeholder:text-zinc-600' : 'text-zinc-900 placeholder:text-zinc-400'
              }`}
            />

            {/* Quick insert #Hashtags & @Mentions docked cleanly at bottom of writing card */}
            <div
              className={`px-3 py-2.5 border-t space-y-1.5 ${
                isDark ? 'border-zinc-800/80 bg-zinc-900/40' : 'border-zinc-200 bg-zinc-100/70'
              }`}
            >
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className={`text-[10px] font-mono flex items-center gap-0.5 shrink-0 font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  <Hash className="w-3 h-3" /> Sujets :
                </span>
                {[...customSalons.map((s) => s.tag), ...QUICK_HASHTAGS].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertToken(tag)}
                    className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono transition-colors shrink-0 cursor-pointer ${
                      isDark
                        ? 'bg-zinc-950 hover:bg-amber-500/20 border-zinc-800 hover:border-amber-500/40 text-amber-300'
                        : 'bg-white hover:bg-amber-50 border-zinc-200 hover:border-amber-400 text-amber-700'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className={`text-[10px] font-mono flex items-center gap-0.5 shrink-0 font-bold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                  <AtSign className="w-3 h-3" /> Mentionner :
                </span>
                {QUICK_MENTIONS.map((mention) => (
                  <button
                    key={mention}
                    type="button"
                    onClick={() => insertToken(mention)}
                    className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono transition-colors shrink-0 cursor-pointer ${
                      isDark
                        ? 'bg-zinc-950 hover:bg-sky-500/20 border-zinc-800 hover:border-sky-500/40 text-sky-300'
                        : 'bg-white hover:bg-sky-50 border-zinc-200 hover:border-sky-400 text-sky-700'
                    }`}
                  >
                    {mention}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Photo, Vidéo 1 min, Vocal, Musique & Document (20 Mo max) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {/* Photo attachment */}
            <div
              className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 ${
                isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono flex items-center gap-1.5 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  <ImageIcon className="w-3.5 h-3.5 text-sky-500" />
                  <span>Photo</span>
                </span>
                {attachedImage && (
                  <button
                    type="button"
                    onClick={() => {
                      void revokeMediaUrlOrRef(attachedImage);
                      setAttachedImage(null);
                    }}
                    className="text-[10px] font-mono text-red-500 hover:underline cursor-pointer"
                  >
                    Retirer
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />

              {attachedImage ? (
                <div className={`relative rounded-xl overflow-hidden border max-h-28 ${isDark ? 'border-zinc-700' : 'border-zinc-300'}`}>
                  <SmartImage src={attachedImage} alt="Aperçu" className="w-full h-24 object-cover" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                      : 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                  }`}
                >
                  <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>Photo</span>
                </button>
              )}
            </div>

            {/* Video 1 minute max */}
            <div
              className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 ${
                isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono flex items-center gap-1.5 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  <Video className="w-3.5 h-3.5 text-[#ff0050]" />
                  <span>Vidéo (1m)</span>
                </span>
                {attachedVideo && (
                  <button
                    type="button"
                    onClick={() => {
                      void revokeMediaUrlOrRef(attachedVideo.videoUrl);
                      setAttachedVideo(null);
                    }}
                    className="text-[10px] font-mono text-red-500 hover:underline cursor-pointer"
                  >
                    Retirer
                  </button>
                )}
              </div>

              {attachedVideo ? (
                <SmartVideoPlayer
                  src={attachedVideo.videoUrl}
                  duration={attachedVideo.duration}
                  compact={true}
                  bgMusic={attachedMusic || undefined}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsVideoStudioOpen(true)}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                      : 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                  }`}
                >
                  <Video className="w-4 h-4 text-[#ff0050] shrink-0" />
                  <span>Vidéo</span>
                </button>
              )}
            </div>

            {/* Voice Note Recorder */}
            <div
              className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 ${
                isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono flex items-center gap-1.5 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  <Mic className="w-3.5 h-3.5 text-amber-500" />
                  <span>Vocal (1m)</span>
                </span>
                {recordedVoice && (
                  <span className="text-[10px] text-emerald-500 font-mono flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{recordedVoice.duration}s</span>
                  </span>
                )}
              </div>

              <TikTokVoiceRecorder
                maxSeconds={60}
                compact={true}
                label="Vocal"
                recordedNote={recordedVoice}
                onRecorded={setRecordedVoice}
              />
            </div>

            {/* Document / File Attachment (PDF, DOCX, etc., max 20 Mo) */}
            <div
              className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 ${
                isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono flex items-center gap-1.5 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Document</span>
                </span>
                {attachedFile && (
                  <button
                    type="button"
                    onClick={() => {
                      void revokeMediaUrlOrRef(attachedFile.url);
                      setAttachedFile(null);
                    }}
                    className="text-[10px] font-mono text-red-500 hover:underline cursor-pointer"
                  >
                    Retirer
                  </button>
                )}
              </div>

              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={handleDocumentSelect}
              />

              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className={`w-full py-2.5 px-3 rounded-xl border text-xs font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                    : 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                }`}
              >
                <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">{attachedFile ? 'Changer' : 'Fichier 20Mo'}</span>
              </button>
            </div>

            {/* Background Music Attachment */}
            <div
              className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 col-span-2 sm:col-span-2 ${
                isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono flex items-center gap-1.5 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  <Music className="w-3.5 h-3.5 text-orange-400" />
                  <span>Musique d&apos;arrière-plan</span>
                </span>
                {attachedMusic && (
                  <button
                    type="button"
                    onClick={() => setAttachedMusic(null)}
                    className="text-[10px] font-mono text-red-500 hover:underline cursor-pointer"
                  >
                    Retirer
                  </button>
                )}
              </div>

              {attachedMusic ? (
                <button
                  type="button"
                  onClick={() => setIsMusicPickerOpen(true)}
                  className={`w-full p-2 rounded-xl border text-left cursor-pointer transition-colors ${
                    isDark ? 'bg-zinc-900 border-orange-500/40 hover:border-orange-500' : 'bg-white border-orange-300'
                  }`}
                >
                  <div className="text-[11px] font-bold text-orange-400 truncate">
                    {attachedMusic.title}
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    {attachedMusic.artist}
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsMusicPickerOpen(true)}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                      : 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                  }`}
                >
                  <Music className="w-4 h-4 text-orange-400 shrink-0" />
                  <span>Choisir une musique de fond 🎵</span>
                </button>
              )}
            </div>
          </div>

          {/* Attached Document Card Preview */}
          {attachedFile && (
            <DocumentFileCard
              file={attachedFile}
              isDark={isDark}
              onRemove={() => {
                void revokeMediaUrlOrRef(attachedFile.url);
                setAttachedFile(null);
              }}
            />
          )}

          {/* Background Music Preview Bar if attached */}
          {attachedMusic && (
            <div className="pt-0.5">
              <AmbientMusicBar
                track={attachedMusic}
                sourceId="new_post_preview"
                label="Ambiance sonore"
                onRemove={() => setAttachedMusic(null)}
                onChange={() => setIsMusicPickerOpen(true)}
              />
            </div>
          )}

          {/* 4. Nombre de clés / cadenas sur le sujet */}
          <div>
            <label className={`block text-xs font-mono mb-2 flex items-center justify-between gap-2 flex-wrap ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-sky-500" />
                <span>3. Verrouillage (Clés 🔑 & Cadenas 🔒)</span>
              </span>
              <span className={`font-bold tabular-nums ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                {keysRequired} 🔑 pour libérer
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { count: 5, title: '5 Clés 🔑', desc: '5 Cadenas 🔒' },
                { count: 10, title: '10 Clés 🔑', desc: '10 Cadenas 🔒' },
                { count: 25, title: '25 Clés 🔑', desc: '25 Cadenas 🔒' },
                { count: 50, title: '50 Clés 🔑', desc: '50 Cadenas 🔒' },
              ].map((opt) => (
                <button
                  key={opt.count}
                  type="button"
                  onClick={() => setKeysRequired(opt.count)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    keysRequired === opt.count
                      ? isDark
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                        : 'bg-amber-50 border-amber-400 text-amber-800'
                      : isDark
                      ? 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-300'
                  }`}
                >
                  <div className="text-xs font-bold font-mono">{opt.title}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Hint info */}
          <div
            className={`flex items-start gap-2 text-xs p-2.5 rounded-lg border ${
              isDark ? 'text-zinc-400 bg-zinc-950/40 border-zinc-800/60' : 'text-zinc-600 bg-zinc-50 border-zinc-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p>
              Vidéos &amp; audios limités à <strong>1 minute (60s)</strong> · Fichiers &amp; médias limités à <strong>20 Mo max</strong>.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!hasAnyAttachment}
            className="w-full py-3.5 rounded-full evasion-btn-primary disabled:opacity-45 text-white font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Key className="w-4 h-4" />
            <span>Publier sur le réseau ({keysRequired} 🔒)</span>
          </button>
        </form>

        <VideoStudioModal
          isOpen={isVideoStudioOpen}
          onClose={() => setIsVideoStudioOpen(false)}
          onVideoReady={(video) => {
            if (attachedVideo?.videoUrl && attachedVideo.videoUrl !== video.videoUrl) {
              void revokeMediaUrlOrRef(attachedVideo.videoUrl);
            }
            setAttachedVideo(video);
          }}
          maxSeconds={60}
        />

        <DeezerMusicPickerModal
          isOpen={isMusicPickerOpen}
          onClose={() => setIsMusicPickerOpen(false)}
          selectedTrack={attachedMusic}
          onSelectTrack={(track) => setAttachedMusic(track)}
          title="Musique de fond du Mur"
          subtitle="Choisis un audio en arrière-plan pour accompagner ta publication"
        />
      </div>
    </div>
  );
};

