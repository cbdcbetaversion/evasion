import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Users,
  MessageSquare,
  Crown,
  Lock,
  PlusCircle,
  X,
  Image as ImageIcon,
  Video,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  Key,
  Shield,
  ArrowDown,
  Check,
} from 'lucide-react';
import { useApp, getDirectChannelId } from '../context/AppContext';
import { DirectChatTarget } from '../types';
import { TikTokVoicePlayer, TikTokVoiceRecorder } from './TikTokVoiceNote';
import { SmartVideoPlayer, VideoStudioModal, SmartImage } from './MediaElements';
import { processImageFile, downloadMediaAsset, revokeMediaUrlOrRef } from '../utils/mediaStore';
import { KeyAccessGate } from './KeyAccessGate';
import { LiveAvatarWrapper, LivePseudoBadge } from './LiveBadge';
import { AvatarDisplay } from './AvatarDisplay';
import { getNeonItem, getNeonTextClass, getNeonAvatarRingClass, getCellFrameClasses } from '../utils/neonStyles';

interface LiveCourtChatProps {
  onOpenCreate?: () => void;
}

export const LiveCourtChat: React.FC<LiveCourtChatProps> = ({ onOpenCreate }) => {
  const {
    chatMessages,
    sendChatMessage,
    sendDirectMessage,
    user,
    userRank,
    onlineInmatesCount,
    showToast,
    customSalons,
    createCustomSalon,
    openDirectChat,
    openUserProfile,
    availableInmates,
    searchInmates,
    hasFullKeyAccess,
    requireFullKeyAccess,
    theme,
  } = useApp();
  const isDark = theme === 'dark';

  const [inputText, setInputText] = useState('');
  const [recordedVoice, setRecordedVoice] = useState<{ duration: number; audioData: string } | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedVideo, setAttachedVideo] = useState<{ videoUrl: string; duration: number } | null>(null);
  const [isVideoStudioOpen, setIsVideoStudioOpen] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('main');
  const [showNewSalonInput, setShowNewSalonInput] = useState<boolean>(false);
  const [newSalonName, setNewSalonName] = useState<string>('');
  const [visibleLimit, setVisibleLimit] = useState<number>(80);

  // Discussion privée active en haut de La Cour quand on clique sur un pseudo
  const [courtPrivateTarget, setCourtPrivateTarget] = useState<DirectChatTarget | null>(null);

  // Recherche de détenu pour MP
  const [showSearchBar, setShowSearchBar] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const courtSearchInputRef = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<DirectChatTarget[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showScrollDownBtn, setShowScrollDownBtn] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickChipsRef = useRef<HTMLDivElement>(null);
  const channelsScrollRef = useRef<HTMLDivElement>(null);
  const inmatesScrollRef = useRef<HTMLDivElement>(null);

  const isVip = user.isVipSubscriber || user.isVipCell;
  const activeCustomSalon = customSalons.find((s) => s.tag === selectedChannel);

  // Recherche en temps réel de détenu inscrit ou actif
  useEffect(() => {
    let cancelled = false;
    if (!showSearchBar) return;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchInmates(searchQuery);
        if (!cancelled) {
          setSearchResults(res);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, showSearchBar, searchInmates]);

  const selectInmateForTopPrivateChat = (inmate: DirectChatTarget) => {
    if (!requireFullKeyAccess('Messages Privés (MP)')) return;
    if (inmate.id === user.id || inmate.matricule === user.matricule) return;
    setCourtPrivateTarget(inmate);
    setShowSearchBar(false);
  };

  const dmChannel = useMemo(() => {
    if (!courtPrivateTarget) return '';
    return getDirectChannelId(user.matricule, courtPrivateTarget.matricule);
  }, [user.matricule, courtPrivateTarget]);

  const filteredMessages = useMemo(() => {
    return chatMessages.filter((m) => {
      const isSimulated =
        m.id.startsWith('chat_bot') ||
        m.id.startsWith('chat_sim') ||
        m.id.startsWith('chat_support') ||
        m.id === 'chat_1' ||
        m.id === 'chat_2' ||
        m.id === 'chat_3' ||
        m.id === 'chat_4' ||
        m.authorId.startsWith('inmate_') ||
        m.authorId.startsWith('usr_c');
      if (isSimulated) return false;

      // Si une discussion privée est active en haut de La Cour, filtrer uniquement les échanges 1-à-1 avec ce codétenu
      if (courtPrivateTarget) {
        if (m.channel === dmChannel) return true;
        const isFromMeToTarget =
          (m.authorId === user.id || m.authorMatricule === user.matricule) &&
          (m.recipientMatricule === courtPrivateTarget.matricule || m.recipientId === courtPrivateTarget.id);
        const isFromTargetToMe =
          (m.authorMatricule === courtPrivateTarget.matricule || m.authorId === courtPrivateTarget.id) &&
          (m.recipientMatricule === user.matricule || m.recipientId === user.id);
        return isFromMeToTarget || isFromTargetToMe;
      }

      // Exclure les MP 1-à-1 de la cour publique
      if (m.channel && m.channel.startsWith('dm_')) return false;

      if (selectedChannel === 'private') {
        return m.channel === 'private';
      }
      if (selectedChannel !== 'main') {
        return m.channel === selectedChannel;
      }
      return !m.channel || m.channel === 'main';
    });
  }, [chatMessages, selectedChannel, courtPrivateTarget, dmChannel, user.id, user.matricule]);

  const visibleMessages = useMemo(() => {
    if (filteredMessages.length <= visibleLimit) return filteredMessages;
    return filteredMessages.slice(-visibleLimit);
  }, [filteredMessages, visibleLimit]);

  const scrollToBottom = (_alsoRevealComposer = false) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    setShowScrollDownBtn(false);
  };

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDownBtn(distanceFromBottom > 60);
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [filteredMessages.length, selectedChannel, courtPrivateTarget?.matricule]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const processed = await processImageFile(file, 1080);
      setAttachedImage((prev) => {
        if (prev && prev !== processed) revokeMediaUrlOrRef(prev);
        return processed;
      });
    } catch (err) {
      showToast({
        title: 'Photo invalide',
        message: err instanceof Error ? err.message : "Impossible d'importer cette image.",
        type: 'warning',
      });
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !recordedVoice && !attachedImage && !attachedVideo) return;

    if (courtPrivateTarget) {
      sendChatMessage(
        inputText,
        dmChannel,
        recordedVoice || undefined,
        attachedImage || undefined,
        attachedVideo || undefined
      );
    } else {
      sendChatMessage(
        inputText,
        selectedChannel,
        recordedVoice || undefined,
        attachedImage || undefined,
        attachedVideo || undefined
      );
    }

    setInputText('');
    setRecordedVoice(null);
    setAttachedImage(null);
    setAttachedVideo(null);
  };

  const handleCreateSalon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSalonName.trim()) return;
    const created = createCustomSalon(newSalonName);
    if (created) {
      setCourtPrivateTarget(null);
      setSelectedChannel(created.tag);
      setNewSalonName('');
      setShowNewSalonInput(false);
    }
  };

  const quickSend = (text: string) => {
    if (courtPrivateTarget) {
      sendChatMessage(text, dmChannel);
    } else {
      sendChatMessage(text, selectedChannel);
    }
  };

  if (!hasFullKeyAccess) {
    return (
      <div className="space-y-4 pb-20">
        <KeyAccessGate
          onOpenCreate={onOpenCreate}
          title="La Cour & MP · 10 🔑"
          description="Atteins 10 🔑 via tes aveux et missions pour ouvrir La Cour et les Messages Privés."
        />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col rounded-3xl border transition-colors lg:h-[calc(100dvh-100px)] lg:max-h-[860px] lg:overflow-hidden ${
        isDark ? 'bg-transparent border-white/15' : 'bg-white/40 border-zinc-200/80 backdrop-blur-xs'
      }`}
    >
      {/* En-tête compact et ergonomique de La Cour */}
      <div
        className={`shrink-0 px-3.5 py-2.5 border-b space-y-2 ${
          isDark
            ? 'bg-transparent border-white/10'
            : 'bg-transparent border-zinc-200/80'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                isDark
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-600'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                className={`text-sm sm:text-base font-black tracking-tight truncate ${
                  isDark ? 'text-white' : 'text-zinc-950'
                }`}
              >
                {courtPrivateTarget
                  ? `MP · ${courtPrivateTarget.alias || courtPrivateTarget.matricule}`
                  : selectedChannel === 'private'
                  ? 'Cellule Clandestine VIP'
                  : activeCustomSalon
                  ? `Salon ${activeCustomSalon.tag}`
                  : 'La Cour'}
              </h2>
              <p className={`text-[11px] font-mono truncate ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {courtPrivateTarget
                  ? `Discussion privée avec ${courtPrivateTarget.matricule}`
                  : 'Touche un pseudo pour voir son univers ou lui écrire'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSearchBar((prev) => !prev)}
              className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                showSearchBar
                  ? 'bg-cyan-500 text-zinc-950 border-cyan-400'
                  : isDark
                  ? 'bg-transparent hover:bg-white/5 text-cyan-400 border-cyan-500/40'
                  : 'bg-white/40 hover:bg-cyan-50 text-cyan-700 border-cyan-300'
              }`}
              title="Rechercher un membre"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Chercher</span>
            </button>

            {onlineInmatesCount > 0 && (
              <div
                className={`min-h-[36px] flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-xl border shrink-0 ${
                  isDark
                    ? 'text-zinc-300 bg-transparent border-white/15'
                    : 'text-zinc-700 bg-white/40 border-zinc-200'
                }`}
              >
                <Users className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <span className={`font-bold tabular-nums ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                  {onlineInmatesCount}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Unboxed status line */}
        <div
          className={`pt-1.5 border-t flex items-center justify-between gap-2 text-[11px] font-mono flex-wrap ${
            isDark ? 'border-zinc-800/80 text-zinc-400' : 'border-zinc-200 text-zinc-600'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-5 h-5 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0">
              <AvatarDisplay avatar={user.avatar} alt={user.alias} />
            </span>
            <span className={`font-bold truncate ${user.neonColor ? getNeonTextClass(user.neonColor, theme) : isDark ? 'text-white' : 'text-zinc-950'}`}>
              {user.alias || user.matricule}
            </span>
            <span aria-hidden="true">·</span>
            <span className={`font-bold whitespace-nowrap ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{userRank.icon} {userRank.rank}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 tabular-nums">
            <span>🔑 <strong className={isDark ? 'text-white' : 'text-zinc-900'}>{user.keysAvailable}</strong></span>
            <span>·</span>
            <span>✨ <strong className={isDark ? 'text-cyan-300' : 'text-cyan-700'}>{user.keysGivenTotal}</strong> offertes</span>
          </div>
        </div>
      </div>

      {/* Barre de recherche de détenu pour MP */}
      {showSearchBar && (
        <div
          className={`shrink-0 px-3.5 py-2.5 border-b space-y-2 animate-fade-in ${
            isDark ? 'bg-zinc-950 border-cyan-500/30' : 'bg-cyan-50/40 border-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-cyan-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={courtSearchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un détenu par pseudo ou matricule (#Détenu_...)..."
                className={`w-full border rounded-xl pl-8 pr-8 py-1.5 text-xs font-mono focus:outline-none ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-700 focus:border-cyan-400 text-white placeholder:text-zinc-500'
                    : 'bg-white border-zinc-300 focus:border-cyan-500 text-zinc-900 placeholder:text-zinc-400'
                }`}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearchQuery('');
                    courtSearchInputRef.current?.focus();
                  }}
                  aria-label="Effacer les caractères saisis"
                  title="Effacer les caractères saisis"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/70 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowSearchBar(false)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono border cursor-pointer ${
                isDark
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-800'
                  : 'bg-white hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 border-zinc-300'
              }`}
            >
              Fermer
            </button>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1 no-scrollbar">
            {isSearching ? (
              <div className="text-[11px] font-mono text-zinc-500 py-2 px-1">
                Recherche dans le registre des détenus...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-[11px] font-mono text-zinc-500 py-2 px-1">
                Aucun autre détenu trouvé pour le moment.
              </div>
            ) : (
              searchResults.map((inmate) => (
                <div
                  key={inmate.matricule}
                  className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition-colors ${
                    isDark
                      ? 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800'
                      : 'bg-white hover:bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <LiveAvatarWrapper userId={inmate.id} matricule={inmate.matricule}>
                      <span
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center text-sm shrink-0 overflow-hidden ${
                          isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-zinc-100 border-zinc-300'
                        }`}
                      >
                        <AvatarDisplay avatar={inmate.avatar || '⛓️'} alt={inmate.alias || inmate.matricule} />
                      </span>
                    </LiveAvatarWrapper>
                    <div className="min-w-0">
                      <div className={`text-xs font-mono font-bold truncate flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                        <span className="truncate">{inmate.alias || inmate.matricule}</span>
                        <LivePseudoBadge userId={inmate.id} matricule={inmate.matricule} compact />
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 truncate">
                        {inmate.matricule}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => selectInmateForTopPrivateChat(inmate)}
                      className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-mono font-bold text-[11px] cursor-pointer transition-colors"
                    >
                      Discuter en haut
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSearchBar(false);
                        openDirectChat(inmate);
                      }}
                      className={`px-2 py-1 rounded-lg border font-mono text-[11px] cursor-pointer transition-colors ${
                        isDark
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border-cyan-500/30'
                          : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border-cyan-300'
                      }`}
                    >
                      Plein écran
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bandeau en haut : Discussion privée active quand on a cliqué sur un pseudo */}
      {courtPrivateTarget && (
        <div
          className={`shrink-0 px-3.5 py-2 border-b flex items-center justify-between gap-2 animate-fade-in ${
            isDark
              ? 'bg-gradient-to-r from-cyan-950/80 via-zinc-900 to-zinc-950 border-cyan-500/40'
              : 'bg-gradient-to-r from-cyan-50 via-white to-cyan-50/40 border-cyan-300'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 overflow-hidden ${
                isDark ? 'bg-zinc-900' : 'bg-white'
              } ${getNeonAvatarRingClass(courtPrivateTarget.neonColor, theme)}`}
            >
              <AvatarDisplay avatar={courtPrivateTarget.avatar || '⛓️'} alt={courtPrivateTarget.alias || courtPrivateTarget.matricule} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openUserProfile(courtPrivateTarget)}
                  title="Voir son profil, son univers et ses clés/cadenas"
                  className={`text-xs font-mono font-black truncate hover:underline cursor-pointer ${
                    isDark ? 'text-cyan-300' : 'text-cyan-700'
                  }`}
                >
                  {courtPrivateTarget.alias || courtPrivateTarget.matricule}
                </button>
                <span
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${
                    isDark
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                      : 'bg-cyan-100 border-cyan-300 text-cyan-800'
                  }`}
                >
                  PRIVÉ 1-À-1 ACTIF
                </span>
              </div>
              <p className={`text-[10px] font-mono truncate flex items-center gap-1 ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                <Shield className="w-3 h-3 text-cyan-500 shrink-0" />
                <span>Messages envoyés uniquement à {courtPrivateTarget.matricule}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => openDirectChat(courtPrivateTarget)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold cursor-pointer transition-colors ${
                isDark
                  ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-400/50 text-cyan-200'
                  : 'bg-cyan-500 hover:bg-cyan-600 border-cyan-600 text-white'
              }`}
            >
              Fenêtre MP
            </button>
            <button
              type="button"
              onClick={() => setCourtPrivateTarget(null)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1 border cursor-pointer ${
                isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'
              }`}
              title="Revenir à la Cour publique"
            >
              <X className="w-3.5 h-3.5" />
              <span>Quitter</span>
            </button>
          </div>
        </div>
      )}

      {/* Barre des Salons avec défilement Gauche <-> Droite */}
      <div
        className={`shrink-0 px-2.5 py-2 border-b space-y-2 ${
          isDark ? 'bg-transparent border-white/10' : 'bg-transparent border-zinc-200/80'
        }`}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => channelsScrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
            aria-label="Défiler les salons vers la gauche"
            className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              isDark
                ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div
            ref={channelsScrollRef}
            className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth"
          >
            <button
              type="button"
              onClick={() => setShowNewSalonInput((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer border ${
                showNewSalonInput
                  ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/40'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Créer un Salon</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCourtPrivateTarget(null);
                setSelectedChannel('main');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                !courtPrivateTarget && selectedChannel === 'main'
                  ? isDark
                    ? 'bg-zinc-800 text-white font-bold border border-zinc-700 shadow-sm'
                    : 'bg-white text-zinc-950 font-bold border border-zinc-300 shadow-2xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Cour Générale
            </button>

            {customSalons.map((salon) => (
              <button
                key={salon.id}
                type="button"
                onClick={() => {
                  setCourtPrivateTarget(null);
                  setSelectedChannel(salon.tag);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  !courtPrivateTarget && selectedChannel === salon.tag
                    ? isDark
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400 font-bold shadow-sm'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-400 font-bold shadow-2xs'
                    : isDark
                    ? 'text-emerald-400/80 hover:text-emerald-300 border border-emerald-500/20'
                    : 'text-emerald-700 hover:text-emerald-900 border border-emerald-200 bg-white'
                }`}
              >
                {salon.tag} 🔑
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                if (!isVip) {
                  showToast({
                    title: 'Quartier VIP Requis 👑',
                    message: "Les cellules privées sont débloquées avec l'abonnement VIP à 1,99 €/mois au Marché Noir.",
                    type: 'warning',
                  });
                  return;
                }
                setCourtPrivateTarget(null);
                setSelectedChannel('private');
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                !courtPrivateTarget && selectedChannel === 'private'
                  ? isDark
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm'
                    : 'bg-amber-100 text-amber-800 border border-amber-400 font-bold shadow-2xs'
                  : isVip
                  ? isDark
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'text-amber-600 hover:text-amber-800'
                  : isDark
                  ? 'text-zinc-600 hover:text-zinc-400'
                  : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {isVip ? <Crown className="w-3 h-3 text-amber-500" /> : <Lock className="w-3 h-3 text-zinc-500" />}
              <span>Cellule Privée VIP</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => channelsScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
            aria-label="Défiler les salons vers la droite"
            className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              isDark
                ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {showNewSalonInput && (
          <form onSubmit={handleCreateSalon} className="flex items-center gap-1.5 pt-0.5">
            <input
              type="text"
              maxLength={32}
              value={newSalonName}
              onChange={(e) => setNewSalonName(e.target.value)}
              placeholder="Nom du nouveau salon ou #sujet (ex: Sport, Musique, Nuit...)"
              className={`flex-1 border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none ${
                isDark
                  ? 'bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-emerald-400'
                  : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500'
              }`}
              autoFocus
            />
            <button
              type="submit"
              disabled={!newSalonName.trim()}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-mono font-bold text-xs shrink-0 cursor-pointer"
            >
              Ouvrir 🔑
            </button>
            <button
              type="button"
              onClick={() => setShowNewSalonInput(false)}
              className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Barre des vrais détenus disponibles (uniquement s'il y a de vrais utilisateurs actifs) */}
      {availableInmates.length > 0 && (
        <div
          className={`shrink-0 px-2.5 py-1.5 border-b flex items-center gap-1.5 ${
            isDark ? 'border-white/10 bg-transparent' : 'border-zinc-200/80 bg-transparent'
          }`}
        >
          <button
            type="button"
            onClick={() => inmatesScrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
            aria-label="Défiler les détenus vers la gauche"
            className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              isDark
                ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 shrink-0 flex items-center gap-1">
            <Users className="w-3 h-3 text-cyan-500" />
            <span>Actifs ({availableInmates.length}) :</span>
          </span>

          <div
            ref={inmatesScrollRef}
            className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth"
          >
            {availableInmates.map((inmate) => {
              const isSelected = courtPrivateTarget?.matricule === inmate.matricule;
              return (
                <div
                  key={inmate.matricule}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-mono shrink-0 transition-all group ${
                    isSelected
                      ? isDark
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold shadow-[0_0_10px_rgba(6,182,212,0.25)]'
                        : 'bg-cyan-100 border-cyan-500 text-cyan-900 font-bold'
                      : isDark
                      ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 hover:border-cyan-500/50 text-zinc-300'
                      : 'bg-white hover:bg-zinc-100 border-zinc-200 hover:border-cyan-500 text-zinc-700'
                  }`}
                >
                  <LiveAvatarWrapper userId={inmate.id} matricule={inmate.matricule}>
                    <span className="w-5 h-5 rounded-full overflow-hidden text-xs inline-flex items-center justify-center">
                      <AvatarDisplay avatar={inmate.avatar} alt={inmate.alias} />
                    </span>
                  </LiveAvatarWrapper>
                  <button
                    type="button"
                    onClick={() => selectInmateForTopPrivateChat(inmate)}
                    className="flex items-center gap-1 cursor-pointer min-w-0"
                    title={`Cliquer pour discuter en privé en haut avec ${inmate.alias || inmate.matricule}`}
                  >
                    <span className="truncate max-w-[90px]">{inmate.alias || inmate.matricule}</span>
                    <span className="text-[9px] text-cyan-500 opacity-85 group-hover:opacity-100 font-bold">
                      💬
                    </span>
                  </button>
                  <LivePseudoBadge userId={inmate.id} matricule={inmate.matricule} compact />
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => inmatesScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
            aria-label="Défiler les détenus vers la droite"
            className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              isDark
                ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Messages Scroll Area (Maximum reading space + floating scroll-down helper) */}
      <div className="relative flex flex-col lg:flex-1 lg:min-h-0">
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="h-[42dvh] min-h-[220px] max-h-[380px] lg:h-auto lg:max-h-none lg:flex-1 lg:min-h-[140px] overflow-y-auto overscroll-contain p-3.5 sm:p-4 space-y-3 bg-transparent"
        >
        {filteredMessages.length > visibleLimit && (
          <button
            type="button"
            onClick={() => setVisibleLimit((v) => v + 80)}
            className={`w-full py-1.5 rounded-xl text-xs font-mono cursor-pointer ${
              isDark
                ? 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300'
                : 'bg-zinc-200/70 hover:bg-zinc-200 text-zinc-700'
            }`}
          >
            Charger les messages précédents ({filteredMessages.length - visibleLimit} masqués)
          </button>
        )}

        {visibleMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center space-y-2">
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs sm:text-sm whitespace-nowrap shadow-xs ${
                isDark
                  ? 'bg-zinc-950/80 border-zinc-800/90 text-zinc-400'
                  : 'bg-white border-zinc-200 text-zinc-600'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span>
                {courtPrivateTarget
                  ? `Aucun message privé avec ${courtPrivateTarget.alias || courtPrivateTarget.matricule}`
                  : 'Aucun message pour le moment'}
              </span>
            </div>
            {courtPrivateTarget && (
              <p className="text-[11px] font-mono text-zinc-500 max-w-xs">
                Écrivez ci-dessous pour démarrer votre discussion privée en temps réel avec {courtPrivateTarget.matricule}.
              </p>
            )}
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isMe = msg.authorId === user.id || msg.authorMatricule === user.matricule;
            const msgNeon = isMe ? user.neonColor || msg.neonColor : msg.neonColor;
            const neonStyle = msgNeon ? getNeonItem(msgNeon) : null;
            const bubbleFrame = isMe
              ? getCellFrameClasses(
                  user.cellBorderFrame && user.cellBorderFrame !== 'none' ? user.cellBorderFrame : 'neon',
                  msgNeon,
                  theme
                )
              : neonStyle
              ? neonStyle.borderClass
              : isDark
              ? 'border-zinc-700/60'
              : 'border-zinc-200';

            const authorTarget: DirectChatTarget = {
              id: msg.authorId,
              matricule: msg.authorMatricule,
              alias: msg.authorMatricule,
              avatar: msg.authorAvatar || '⛓️',
              neonColor: msg.neonColor,
            };

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <LiveAvatarWrapper userId={msg.authorId} matricule={msg.authorMatricule}>
                  <button
                    type="button"
                    disabled={isMe}
                    onClick={() => {
                      if (isMe) return;
                      selectInmateForTopPrivateChat(authorTarget);
                    }}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 select-none overflow-hidden ${
                      isDark ? 'bg-zinc-800' : 'bg-white'
                    } ${
                      msgNeon
                        ? getNeonAvatarRingClass(msgNeon, theme)
                        : isDark
                        ? 'border border-zinc-700/80'
                        : 'border border-zinc-300'
                    } ${!isMe ? 'hover:scale-105 active:scale-95 transition-transform cursor-pointer' : ''}`}
                    title={!isMe ? `Cliquer pour discuter en privé avec ${msg.authorMatricule}` : 'Mon profil'}
                  >
                    <AvatarDisplay avatar={msg.authorAvatar || '⛓️'} alt={msg.authorMatricule} />
                  </button>
                </LiveAvatarWrapper>

                <div
                  className={`max-w-[82%] rounded-2xl p-3 text-xs sm:text-sm space-y-2 border ${
                    isMe
                      ? isDark
                        ? `bg-zinc-900 ${bubbleFrame} text-white rounded-tr-none`
                        : `bg-zinc-900 ${bubbleFrame} text-white rounded-tr-none shadow-sm`
                      : isDark
                      ? `bg-zinc-800 text-zinc-200 rounded-tl-none ${bubbleFrame}`
                      : `bg-white text-zinc-800 rounded-tl-none shadow-2xs ${bubbleFrame}`
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {!isMe &&
                        availableInmates.some(
                          (inm) => inm.id === msg.authorId || inm.matricule === msg.authorMatricule
                        ) && (
                          <span className="relative flex h-2 w-2 shrink-0" title="Détenu en ligne et actif">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                        )}
                      <button
                        type="button"
                        onClick={() => openUserProfile(authorTarget)}
                        className={`font-bold flex items-center gap-1 text-left hover:underline cursor-pointer ${
                          neonStyle
                            ? isMe
                              ? neonStyle.textClass
                              : getNeonTextClass(msgNeon, theme)
                            : 'opacity-80'
                        }`}
                        title={`Voir le profil, l'univers et les clés/cadenas de ${msg.authorMatricule}`}
                      >
                        <span>{isMe ? user.matricule : msg.authorMatricule}</span>
                        {msg.isVip && (
                          <span className="text-amber-400" title="Membre Quartier VIP">
                            👑
                          </span>
                        )}
                      </button>
                      <LivePseudoBadge userId={msg.authorId} matricule={msg.authorMatricule} compact />
                      {!isMe && (
                        <button
                          type="button"
                          onClick={() => selectInmateForTopPrivateChat(authorTarget)}
                          className={`px-1.5 py-0.5 rounded border text-[9px] font-mono transition-colors cursor-pointer ${
                            isDark
                              ? 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/30 text-cyan-300'
                              : 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-700'
                          }`}
                          title="Afficher en haut en discussion privée"
                        >
                          💬 MP
                        </button>
                      )}
                    </div>
                    <span className="opacity-70">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {msg.content && (
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}

                  {msg.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setZoomedImage(msg.imageUrl || null)}
                      className="rounded-xl overflow-hidden border border-black/25 block max-h-56 cursor-pointer"
                    >
                      <SmartImage src={msg.imageUrl} alt="Photo" className="w-full h-auto max-h-56 object-cover" />
                    </button>
                  )}

                  {msg.videoUrl && (
                    <SmartVideoPlayer
                      src={msg.videoUrl}
                      duration={msg.videoDuration}
                      compact={true}
                    />
                  )}

                  {msg.audioNote && msg.audioNote.audioData && (
                    <div className="pt-0.5">
                      <TikTokVoicePlayer
                        audioData={msg.audioNote.audioData}
                        duration={msg.audioNote.duration || 5}
                        compact={true}
                        isMe={isMe}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
        </div>

        {showScrollDownBtn && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className={`absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-full border text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer ${
              isDark
                ? 'bg-zinc-900/95 hover:bg-zinc-800 border-zinc-700 text-white'
                : 'bg-white/95 hover:bg-zinc-50 border-zinc-300 text-zinc-900'
            }`}
            title="Défiler tout en bas vers les derniers messages et la validation"
          >
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>Bas</span>
          </button>
        )}
      </div>

      {/* Attachment previews & 1-tap validation for Photo, Video & Audio */}
      {(attachedImage || attachedVideo || recordedVoice) && (
        <div
          className={`shrink-0 lg:max-h-[40%] lg:overflow-y-auto px-3 py-2.5 border-t space-y-2.5 ${
            isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono font-bold text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>Média prêt à valider et envoyer</span>
            </span>
            {([attachedImage, attachedVideo, recordedVoice].filter(Boolean).length > 1) && (
              <button
                type="button"
                onClick={() => {
                  const targetChan = courtPrivateTarget ? dmChannel : selectedChannel;
                  sendChatMessage(
                    inputText,
                    targetChan,
                    recordedVoice || undefined,
                    attachedImage || undefined,
                    attachedVideo || undefined
                  );
                  setInputText('');
                  setRecordedVoice(null);
                  setAttachedImage(null);
                  setAttachedVideo(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-mono font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Tout envoyer</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {attachedImage && (
              <div
                className={`flex items-center justify-between gap-2.5 flex-wrap p-2 rounded-xl border ${
                  isDark ? 'border-zinc-800/80 bg-zinc-900/50' : 'border-zinc-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative inline-block shrink-0">
                    <button
                      type="button"
                      onClick={() => setZoomedImage(attachedImage)}
                      className="block rounded-xl overflow-hidden border border-zinc-700 cursor-pointer"
                      title="Agrandir la photo"
                    >
                      <SmartImage
                        src={attachedImage}
                        alt="Aperçu photo"
                        className="w-16 h-16 object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        revokeMediaUrlOrRef(attachedImage);
                        setAttachedImage(null);
                      }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer"
                      title="Retirer la photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <span className={`text-xs font-mono ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    Photo sélectionnée
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const targetChan = courtPrivateTarget ? dmChannel : selectedChannel;
                    sendChatMessage(
                      inputText,
                      targetChan,
                      recordedVoice || undefined,
                      attachedImage,
                      attachedVideo || undefined
                    );
                    setInputText('');
                    setRecordedVoice(null);
                    setAttachedImage(null);
                    setAttachedVideo(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-mono font-black flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95 transition-all cursor-pointer ml-auto"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Envoyer la photo</span>
                </button>
              </div>
            )}

            {attachedVideo && (
              <div
                className={`flex items-center justify-between gap-2.5 flex-wrap p-2 rounded-xl border ${
                  isDark ? 'border-zinc-800/80 bg-zinc-900/50' : 'border-zinc-200 bg-white'
                }`}
              >
                <div className="relative w-44 sm:w-52 shrink-0">
                  <SmartVideoPlayer
                    src={attachedVideo.videoUrl}
                    duration={attachedVideo.duration}
                    compact={true}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      revokeMediaUrlOrRef(attachedVideo.videoUrl);
                      setAttachedVideo(null);
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer z-10"
                    title="Retirer la vidéo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const targetChan = courtPrivateTarget ? dmChannel : selectedChannel;
                    sendChatMessage(
                      inputText,
                      targetChan,
                      recordedVoice || undefined,
                      attachedImage || undefined,
                      attachedVideo
                    );
                    setInputText('');
                    setRecordedVoice(null);
                    setAttachedImage(null);
                    setAttachedVideo(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-mono font-black flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95 transition-all cursor-pointer ml-auto"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Envoyer la vidéo</span>
                </button>
              </div>
            )}

            {recordedVoice && (
              <div
                className={`w-full flex items-center gap-2 flex-wrap sm:flex-nowrap p-2 rounded-xl border ${
                  isDark ? 'border-zinc-800/80 bg-zinc-900/50' : 'border-zinc-200 bg-white'
                }`}
              >
                <div className="flex-1 min-w-[200px]">
                  <TikTokVoicePlayer
                    audioData={recordedVoice.audioData}
                    duration={recordedVoice.duration}
                    compact={true}
                    isMe={true}
                    hideSpeed={true}
                    onDelete={() => {
                      revokeMediaUrlOrRef(recordedVoice.audioData);
                      setRecordedVoice(null);
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const targetChan = courtPrivateTarget ? dmChannel : selectedChannel;
                    sendChatMessage(
                      inputText,
                      targetChan,
                      recordedVoice,
                      attachedImage || undefined,
                      attachedVideo || undefined
                    );
                    setInputText('');
                    setRecordedVoice(null);
                    setAttachedImage(null);
                    setAttachedVideo(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-mono font-black flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95 transition-all cursor-pointer ml-auto"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Envoyer l&apos;audio</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick encouragement chips — horizontal-only slide (left <-> right) */}
      <div
        className={`px-2 py-1.5 border-t flex items-center gap-1 ${
          isDark ? 'bg-transparent border-white/10' : 'bg-transparent border-zinc-200/80'
        }`}
      >
        <button
          type="button"
          onClick={() => quickChipsRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
          aria-label="Défiler vers la gauche"
          className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
            isDark
              ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
              : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div
          ref={quickChipsRef}
          className="flex-1 min-w-0 flex items-center justify-start gap-1.5 flex-nowrap overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain scroll-smooth no-scrollbar"
        >
          {[
            '🗝️ Force à toi !',
            '🔓 Bientôt libre !',
            '📵 Je lance ma détox',
            '✨ Donnez vos clés',
            '🕊️ Gardez espoir',
            '🔒 Cadenas scellé',
            '💪 On tient bon',
          ].map((quick, i) => (
            <button
              key={i}
              type="button"
              onClick={() => quickSend(quick)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors border cursor-pointer shrink-0 select-none ${
                isDark
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border-zinc-800'
                  : 'bg-white hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 border-zinc-200'
              }`}
            >
              {quick}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => quickChipsRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
          aria-label="Défiler vers la droite"
          className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
            isDark
              ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
              : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Minimalist Ergonomic Composer */}
      <form
        onSubmit={handleSend}
        className={`p-2 sm:p-2.5 border-t shrink-0 ${
          isDark ? 'bg-transparent border-white/10' : 'bg-transparent border-zinc-200/80'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        <div
          className={`rounded-2xl border transition-colors p-2.5 space-y-2 ${
            isDark ? 'bg-transparent' : 'bg-white/40'
          } ${
            courtPrivateTarget
              ? 'border-cyan-500/60 focus-within:border-cyan-400'
              : isDark
              ? 'border-white/15 focus-within:border-[#f97316]/75'
              : 'border-zinc-200 focus-within:border-red-500'
          }`}
        >
          <textarea
            rows={2}
            maxLength={1000}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputText.trim() || recordedVoice || attachedImage || attachedVideo) {
                  handleSend(e);
                }
              }
            }}
            placeholder={
              courtPrivateTarget
                ? `Message privé en direct à ${courtPrivateTarget.alias || courtPrivateTarget.matricule}...`
                : `Écrire dans la cour (${user.matricule})...`
            }
            className={`w-full min-h-[44px] max-h-[120px] !bg-transparent !border-0 text-xs sm:text-sm focus:outline-none resize-none leading-relaxed ${
              isDark ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400'
            }`}
          />

          {/* Single-row aligned toolbar: Photo, Vidéo, Vocal & Envoyer */}
          <div
            className={`pt-2 border-t flex items-center justify-between gap-1.5 ${
              isDark ? 'border-zinc-800/75' : 'border-zinc-200'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Envoyer une photo"
                className={`px-2 sm:px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  attachedImage
                    ? 'bg-sky-500/20 border-sky-400 text-sky-400'
                    : isDark
                    ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                    : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setIsVideoStudioOpen(true)}
                title="Filmer ou envoyer une vidéo (1 min max)"
                className={`px-2 sm:px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  attachedVideo
                    ? 'bg-[#ff0050]/20 border-[#ff0050] text-pink-400'
                    : isDark
                    ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                    : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-[#ff0050] shrink-0" />
                <span>Vidéo</span>
                <span className="hidden sm:inline">1m</span>
              </button>

              <TikTokVoiceRecorder
                maxSeconds={60}
                compact={true}
                label="Vocal"
                recordedNote={recordedVoice}
                onRecorded={setRecordedVoice}
                onDirectSend={(note) => {
                  if (courtPrivateTarget) {
                    sendChatMessage(
                      inputText,
                      dmChannel,
                      note,
                      attachedImage || undefined,
                      attachedVideo || undefined
                    );
                  } else {
                    sendChatMessage(
                      inputText,
                      selectedChannel,
                      note,
                      attachedImage || undefined,
                      attachedVideo || undefined
                    );
                  }
                  setInputText('');
                  setRecordedVoice(null);
                  setAttachedImage(null);
                  setAttachedVideo(null);
                }}
                hideInlinePreview={true}
              />
            </div>

            <button
              type="submit"
              disabled={!inputText.trim() && !recordedVoice && !attachedImage && !attachedVideo}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 active:scale-95 cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                courtPrivateTarget
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                  : 'evasion-btn-primary text-white'
              }`}
            >
              <span>{courtPrivateTarget ? 'Envoyer MP' : 'Envoyer'}</span>
              <Send className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>
        <div ref={composerEndRef} className="scroll-mb-24" />
      </form>

      <VideoStudioModal
        isOpen={isVideoStudioOpen}
        onClose={() => setIsVideoStudioOpen(false)}
        onVideoReady={(video) => {
          if (attachedVideo?.videoUrl && attachedVideo.videoUrl !== video.videoUrl) {
            revokeMediaUrlOrRef(attachedVideo.videoUrl);
          }
          setAttachedVideo(video);
        }}
        onDirectSend={(video) => {
          const targetChan = courtPrivateTarget ? dmChannel : selectedChannel;
          sendChatMessage(
            inputText,
            targetChan,
            recordedVoice || undefined,
            attachedImage || undefined,
            video
          );
          setInputText('');
          setRecordedVoice(null);
          setAttachedImage(null);
          setAttachedVideo(null);
        }}
        maxSeconds={60}
      />

      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-2xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <SmartImage
              src={zoomedImage}
              alt="Photo agrandie"
              className="max-w-full max-h-[82vh] object-contain rounded-xl border border-zinc-700 shadow-2xl"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => downloadMediaAsset(zoomedImage, `evasion_photo_${Date.now()}`)}
                aria-label="Enregistrer"
                title="Enregistrer"
                className="w-9 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center justify-center cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center border border-zinc-600 shadow-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
