import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Send,
  Image as ImageIcon,
  Video,
  Download,
  Users,
  Lock,
  Sparkles,
  MessageSquare,
  Shield,
  Circle,
  UserPlus,
  UserCheck,
  Clock,
} from 'lucide-react';
import { useApp, getDirectChannelId } from '../context/AppContext';
import { TikTokVoicePlayer, TikTokVoiceRecorder } from './TikTokVoiceNote';
import { SmartVideoPlayer, VideoStudioModal, SmartImage } from './MediaElements';
import { processImageFile, downloadMediaAsset, revokeMediaUrlOrRef } from '../utils/mediaStore';
import { KeyAccessGate } from './KeyAccessGate';
import { LiveAvatarWrapper, LivePseudoBadge, OnlineStatusBadge } from './LiveBadge';
import { AvatarDisplay } from './AvatarDisplay';
import {
  getNeonItem,
  getNeonTextClass,
  getNeonAvatarRingClass,
  getCellFrameClasses,
} from '../utils/neonStyles';

export const DirectChatModal: React.FC = () => {
  const {
    user,
    chatMessages,
    directChatTarget,
    closeDirectChat,
    sendDirectMessage,
    availableInmates,
    openDirectChat,
    showToast,
    hasFullKeyAccess,
    theme,
    activeLives,
    sendLiveInvite,
    openUserProfile,
    friends,
    getFriendshipStatus,
    sendFriendRequest,
    acceptFriendRequest,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [recordedVoice, setRecordedVoice] = useState<{ duration: number; audioData: string } | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedVideo, setAttachedVideo] = useState<{ videoUrl: string; duration: number } | null>(null);
  const [isVideoStudioOpen, setIsVideoStudioOpen] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showInmatesDrawer, setShowInmatesDrawer] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dmChannel = useMemo(() => {
    if (!directChatTarget) return '';
    return getDirectChannelId(user.matricule, directChatTarget.matricule);
  }, [user.matricule, directChatTarget]);

  // Filter messages between these two specific convicts
  const conversationMessages = useMemo(() => {
    if (!directChatTarget) return [];
    return chatMessages.filter((m) => {
      if (m.channel === dmChannel) return true;
      const isFromMeToTarget =
        (m.authorId === user.id || m.authorMatricule === user.matricule) &&
        (m.recipientMatricule === directChatTarget.matricule || m.recipientId === directChatTarget.id);
      const isFromTargetToMe =
        (m.authorMatricule === directChatTarget.matricule || m.authorId === directChatTarget.id) &&
        (m.recipientMatricule === user.matricule || m.recipientId === user.id);
      return isFromMeToTarget || isFromTargetToMe;
    });
  }, [chatMessages, dmChannel, directChatTarget, user.id, user.matricule]);

  useEffect(() => {
    const parent = messagesEndRef.current?.parentElement;
    if (parent) {
      parent.scrollTo({ top: parent.scrollHeight, behavior: 'smooth' });
    }
  }, [conversationMessages.length]);

  if (!directChatTarget) return null;

  const targetFriendStatus = getFriendshipStatus(directChatTarget);
  const canChatWithTarget = hasFullKeyAccess || targetFriendStatus === 'friend';

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
        message: err instanceof Error ? err.message : "Impossible d'importer cette photo.",
        type: 'warning',
      });
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !recordedVoice && !attachedImage && !attachedVideo) return;
    sendDirectMessage(
      inputText,
      recordedVoice || undefined,
      attachedImage || undefined,
      attachedVideo || undefined
    );
    setInputText('');
    setRecordedVoice(null);
    setAttachedImage(null);
    setAttachedVideo(null);
  };

  const targetNeon = directChatTarget.neonColor;
  const targetNeonItem = targetNeon ? getNeonItem(targetNeon) : null;
  const myHostedLive = activeLives.find((l) => l.hostId === user.id && l.isActive);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className={`w-full max-w-lg h-[92vh] sm:h-[85vh] max-h-[820px] rounded-3xl border flex flex-col overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] ${
          theme === 'dark' ? 'bg-[#09090b] border-zinc-800' : 'bg-white border-zinc-300'
        }`}
      >
        {/* Top Header */}
        <div
          className={`p-3.5 sm:p-4 border-b flex items-center justify-between gap-3 ${
            theme === 'dark' ? 'bg-zinc-950/90 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <LiveAvatarWrapper userId={directChatTarget.id} matricule={directChatTarget.matricule}>
              <div className="relative shrink-0">
                <span
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-inner select-none overflow-hidden ${
                    theme === 'dark' ? 'bg-zinc-900' : 'bg-white'
                  } ${getNeonAvatarRingClass(targetNeon, theme)}`}
                >
                  <AvatarDisplay avatar={directChatTarget.avatar || '⛓️'} alt={directChatTarget.alias || directChatTarget.matricule} />
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
              </div>
            </LiveAvatarWrapper>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => openUserProfile(directChatTarget)}
                  title="Voir son profil, son univers et ses clés/cadenas"
                  className={`text-sm sm:text-base font-black font-mono truncate hover:underline cursor-pointer ${
                    targetNeon
                      ? getNeonTextClass(targetNeon, theme)
                      : theme === 'dark'
                      ? 'text-white'
                      : 'text-zinc-900'
                  }`}
                >
                  {directChatTarget.alias || directChatTarget.matricule}
                </button>
                <LivePseudoBadge userId={directChatTarget.id} matricule={directChatTarget.matricule} />
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    theme === 'dark'
                      ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                      : 'bg-cyan-50 text-cyan-700 border-cyan-300'
                  }`}
                >
                  MP Clandestin
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                <span>{directChatTarget.matricule}</span>
                <span>·</span>
                <OnlineStatusBadge
                  userId={directChatTarget.id}
                  matricule={directChatTarget.matricule}
                  alias={directChatTarget.alias}
                  size="xs"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {targetFriendStatus === 'friend' ? (
              <span className="px-2 py-1.5 rounded-xl text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ami</span>
              </span>
            ) : targetFriendStatus === 'incoming' ? (
              <button
                type="button"
                onClick={() => void acceptFriendRequest(directChatTarget)}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center gap-1 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Accepter ✓</span>
              </button>
            ) : targetFriendStatus === 'outgoing' ? (
              <span className="px-2 py-1.5 rounded-xl text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">En attente</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void sendFriendRequest(directChatTarget)}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 flex items-center gap-1 cursor-pointer"
                title="Ajouter en ami"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ajouter ami</span>
              </button>
            )}
            {myHostedLive && (
              <button
                type="button"
                onClick={() =>
                  void sendLiveInvite(
                    myHostedLive.id,
                    { targetUserId: directChatTarget.id, targetMatricule: directChatTarget.matricule },
                    'cohost'
                  )
                }
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold bg-[#ff0050] hover:bg-[#ff1a62] text-white flex items-center gap-1 cursor-pointer shadow-xs"
                title="Inviter sur l'écran de ton Live en cours (Live en Live)"
              >
                <Video className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Inviter Live</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowInmatesDrawer(!showInmatesDrawer)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border-zinc-700/60'
                  : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'
              }`}
              title="Voir tous les détenus disponibles"
            >
              <Users className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Dispos ({availableInmates.length})</span>
            </button>
            <button
              type="button"
              onClick={closeDirectChat}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Inmates Strip Drawer (Quick switch to any available convict without needing keys) */}
        {showInmatesDrawer && (
          <div
            className={`p-2.5 border-b animate-slide-down ${
              theme === 'dark' ? 'bg-zinc-950/95 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 mb-1.5 px-1">
              <span>Détenus disponibles (débloqué dès 10 🔑 · clique pour discuter en privé) :</span>
              <button
                type="button"
                onClick={() => setShowInmatesDrawer(false)}
                className={theme === 'dark' ? 'hover:text-white' : 'hover:text-zinc-900'}
              >
                Fermer
              </button>
            </div>
            {friends.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-mono font-bold text-emerald-400 px-1 mb-1">
                  Mes Amis ({friends.length}) :
                </div>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                  {friends.map((f) => {
                    const isCurrent = f.matricule === directChatTarget.matricule;
                    return (
                      <button
                        key={`friend_${f.id || f.matricule}`}
                        type="button"
                        onClick={() => {
                          openDirectChat({
                            id: f.id,
                            matricule: f.matricule,
                            alias: f.alias,
                            avatar: f.avatar,
                            neonColor: f.neonColor,
                          });
                          setShowInmatesDrawer(false);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono shrink-0 transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                            : theme === 'dark'
                            ? 'bg-zinc-900 border-emerald-500/30 text-emerald-300 hover:border-emerald-400'
                            : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        }`}
                      >
                        <span className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                          <AvatarDisplay avatar={f.avatar} alt={f.alias} />
                        </span>
                        <span className="truncate max-w-[100px]">{f.alias || f.matricule}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {availableInmates.map((inmate) => {
                const isCurrent = inmate.matricule === directChatTarget.matricule;
                return (
                  <button
                    key={inmate.matricule}
                    type="button"
                    onClick={() => {
                      openDirectChat(inmate);
                      setShowInmatesDrawer(false);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono shrink-0 transition-all cursor-pointer ${
                      isCurrent
                        ? theme === 'dark'
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                          : 'bg-cyan-50 border-cyan-500 text-cyan-800 font-bold'
                        : theme === 'dark'
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                      <AvatarDisplay avatar={inmate.avatar} alt={inmate.alias} />
                    </span>
                    <span className="truncate max-w-[100px]">{inmate.alias || inmate.matricule}</span>
                    <LivePseudoBadge userId={inmate.id} matricule={inmate.matricule} compact />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Security / Confidentiality Banner */}
        <div
          className={`px-4 py-1.5 border-b flex items-center justify-between text-[11px] font-mono ${
            theme === 'dark'
              ? 'bg-gradient-to-r from-cyan-950/40 via-zinc-950 to-zinc-950 border-cyan-900/30 text-cyan-400/90'
              : 'bg-cyan-50/70 border-cyan-200 text-cyan-800'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Shield className="w-3.5 h-3.5 shrink-0 text-cyan-500" />
            <span className="truncate">Liaison Clandestine Chiffrée P2P · Aucun algorithme de suivi</span>
          </div>
          <span className="text-[10px] text-zinc-500 shrink-0">1-à-1 Direct</span>
        </div>

        {!canChatWithTarget ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex items-center justify-center">
            <KeyAccessGate
              compact
              title="Messages Privés (MP) · 10 🔑 requises"
              description="Les discussions privées 1-à-1 se débloquent à partir de 10 Clés 🔑. Crée des aveux sur Le Mur et valide la Mission du Jour pour y accéder !"
              extraNote="Dès 10 🔑 : MP, La Cour et tout le reste sont débloqués (sauf lancer un Live à 50 🔑)."
            />
          </div>
        ) : (
        <>
        {/* Message Thread Scroll Area */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 no-scrollbar">
          {conversationMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <span className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-4xl bg-zinc-900 border border-zinc-800">
                <AvatarDisplay avatar={directChatTarget.avatar} alt={directChatTarget.alias} />
              </span>
              <div>
                <h4 className={`text-sm font-bold font-mono ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                  Début de la conversation privée avec {directChatTarget.alias || directChatTarget.matricule}
                </h4>
                <p className={`text-xs max-w-xs mt-1 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Échangez des aveux intimes, planifiez votre détox commune, partagez des photos ou des notes vocales en toute discrétion.
                </p>
              </div>
              <div
                className={`p-2.5 rounded-xl border text-[11px] font-mono flex items-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                }`}
              >
                <span>💬</span>
                <span>Envoie un premier message pour briser la glace.</span>
              </div>
            </div>
          ) : (
            conversationMessages.map((msg) => {
              const isMe = msg.authorId === user.id || msg.authorMatricule === user.matricule;
              const msgNeon = isMe ? user.neonColor || msg.neonColor : msg.neonColor || targetNeon;
              const neonStyle = msgNeon ? getNeonItem(msgNeon) : null;
              const bubbleFrame = isMe
                ? getCellFrameClasses(
                    user.cellBorderFrame && user.cellBorderFrame !== 'none' ? user.cellBorderFrame : 'neon',
                    msgNeon,
                    theme
                  )
                : neonStyle
                ? neonStyle.borderClass
                : theme === 'dark'
                ? 'border-zinc-700/60'
                : 'border-zinc-200';

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 select-none overflow-hidden ${
                      theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'
                    } ${
                      msgNeon
                        ? getNeonAvatarRingClass(msgNeon, theme)
                        : theme === 'dark'
                        ? 'border border-zinc-700/80'
                        : 'border border-zinc-300'
                    }`}
                  >
                    <AvatarDisplay avatar={msg.authorAvatar} alt={msg.authorMatricule} />
                  </span>

                  <div
                    className={`max-w-[82%] rounded-2xl p-3 text-xs sm:text-sm space-y-2 border ${
                      isMe
                        ? theme === 'dark'
                          ? `bg-zinc-900 ${bubbleFrame} text-white rounded-tr-none shadow-[0_0_15px_rgba(6,182,212,0.1)]`
                          : `bg-cyan-50 ${bubbleFrame} text-zinc-900 rounded-tr-none`
                        : theme === 'dark'
                        ? `bg-zinc-800 text-zinc-200 rounded-tl-none ${bubbleFrame}`
                        : `bg-zinc-100 text-zinc-900 rounded-tl-none ${bubbleFrame}`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                      <span
                        className={`font-bold flex items-center gap-1 ${
                          neonStyle ? neonStyle.textClass : 'opacity-80'
                        }`}
                      >
                        {isMe ? user.matricule : msg.authorMatricule}
                        {msg.isVip && (
                          <span className="text-amber-400" title="Membre Quartier VIP">
                            👑
                          </span>
                        )}
                      </span>
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
          <div ref={messagesEndRef} />
        </div>

        {/* Ergonomic Composer Bar with Photo, Video, Audio & Valider */}
        <form
          onSubmit={handleSend}
          className={`p-2.5 sm:p-3 border-t shrink-0 ${
            theme === 'dark' ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          <div
            className={`rounded-2xl border transition-colors p-2.5 space-y-2.5 ${
              theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
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
              placeholder={`Écrire en privé à ${directChatTarget.alias || directChatTarget.matricule}...`}
              className={`w-full min-h-[46px] max-h-[120px] !bg-transparent !border-0 text-xs sm:text-sm focus:outline-none resize-none leading-relaxed ${
                theme === 'dark' ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400'
              }`}
            />

            {/* Attachments Preview if any */}
            {(attachedImage || attachedVideo || recordedVoice) && (
              <div className="flex items-center gap-2 flex-wrap pt-1 pb-1 border-t border-zinc-800/40">
                {attachedImage && (
                  <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-500/15 border border-sky-400/30 text-xs font-mono text-sky-300">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    <span>Photo jointe</span>
                    <button
                      type="button"
                      onClick={() => {
                        revokeMediaUrlOrRef(attachedImage);
                        setAttachedImage(null);
                      }}
                      className="ml-1 text-zinc-400 hover:text-white cursor-pointer"
                    >✕</button>
                  </div>
                )}
                {attachedVideo && (
                  <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-pink-500/15 border border-pink-400/30 text-xs font-mono text-pink-300">
                    <span className="w-2 h-2 rounded-full bg-pink-400" />
                    <span>Vidéo ({attachedVideo.duration}s)</span>
                    <button
                      type="button"
                      onClick={() => {
                        revokeMediaUrlOrRef(attachedVideo.videoUrl);
                        setAttachedVideo(null);
                      }}
                      className="ml-1 text-zinc-400 hover:text-white cursor-pointer"
                    >✕</button>
                  </div>
                )}
                {recordedVoice && (
                  <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-400/30 text-xs font-mono text-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Vocal ({recordedVoice.duration}s)</span>
                    <button
                      type="button"
                      onClick={() => {
                        revokeMediaUrlOrRef(recordedVoice.audioData);
                        setRecordedVoice(null);
                      }}
                      className="ml-1 text-zinc-400 hover:text-white cursor-pointer"
                    >✕</button>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-zinc-800/50 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                    attachedImage
                      ? 'bg-sky-500/20 border-sky-400 text-sky-400'
                      : theme === 'dark'
                      ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                      : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-sky-500" />
                  <span>Photo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsVideoStudioOpen(true)}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                    attachedVideo
                      ? 'bg-pink-500/20 border-pink-400 text-pink-400'
                      : theme === 'dark'
                      ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                      : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
                  }`}
                >
                  <Video className="w-3.5 h-3.5 text-[#ff0050]" />
                  <span>Vidéo</span>
                </button>

                <TikTokVoiceRecorder
                  maxSeconds={60}
                  compact={true}
                  label="Vocal"
                  recordedNote={recordedVoice}
                  onRecorded={setRecordedVoice}
                  onDirectSend={(note) => {
                    sendDirectMessage(
                      inputText,
                      note,
                      attachedImage || undefined,
                      attachedVideo || undefined
                    );
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
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-zinc-950 font-bold text-xs font-mono flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.3)] cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Valider</span>
              </button>
            </div>
          </div>
        </form>
        </>
        )}
      </div>

      {/* Video Studio Modal for DM */}
      <VideoStudioModal
        isOpen={isVideoStudioOpen}
        onClose={() => setIsVideoStudioOpen(false)}
        onVideoReady={(video) => {
          if (attachedVideo?.videoUrl && attachedVideo.videoUrl !== video.videoUrl) {
            revokeMediaUrlOrRef(attachedVideo.videoUrl);
          }
          setAttachedVideo(video);
          setIsVideoStudioOpen(false);
        }}
        onDirectSend={(video) => {
          sendDirectMessage(
            inputText,
            recordedVoice || undefined,
            attachedImage || undefined,
            video
          );
          setInputText('');
          setRecordedVoice(null);
          setAttachedImage(null);
          setAttachedVideo(null);
          setIsVideoStudioOpen(false);
        }}
        maxSeconds={60}
      />

      {/* Zoom Modal for Photos */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <SmartImage src={zoomedImage} alt="Agrandissement" className="max-w-full max-h-[85vh] object-contain rounded-xl" />
            <div className="absolute top-2 right-2 flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadMediaAsset(zoomedImage, 'photo-evasion.jpg');
                }}
                className="p-2 rounded-xl bg-black/60 text-white hover:bg-black/80"
                title="Télécharger"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="p-2 rounded-xl bg-black/60 text-white hover:bg-black/80"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
