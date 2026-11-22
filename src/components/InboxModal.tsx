import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Mail,
  MessageSquare,
  Send,
  Lock,
  Image as ImageIcon,
  Video,
  Users,
  Bell,
  UserCheck,
  UserX,
  UserMinus,
  MessageCircle,
  Eye,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ConfessionPost, PostComment, ChatMessage } from '../types';
import { TikTokVoicePlayer, TikTokVoiceRecorder } from './TikTokVoiceNote';
import { SmartVideoPlayer, VideoStudioModal, SmartImage, DocumentFileCard } from './MediaElements';
import { AvatarDisplay } from './AvatarDisplay';
import { OnlineStatusBadge } from './LiveBadge';
import { processImageFile, revokeMediaUrlOrRef } from '../utils/mediaStore';

interface InboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialReplyPostId?: string | null;
  onOpenPhoneNotifications?: () => void;
}

export const isSimulatedComment = (comment: PostComment): boolean => {
  if (!comment) return true;
  if (comment.id.startsWith('comm_live_') || comment.id.startsWith('comm_aveu_')) return true;
  if (comment.authorId.startsWith('usr_v') || comment.authorId.startsWith('inmate_')) return true;
  return false;
};

type InboxTab = 'dm' | 'replies' | 'alerts';

export const InboxModal: React.FC<InboxModalProps> = ({
  isOpen,
  onClose,
  initialReplyPostId,
  onOpenPhoneNotifications,
}) => {
  const {
    user,
    posts,
    chatMessages,
    addCommentToPost,
    theme,
    showToast,
    requireFullKeyAccess,
    openDirectChat,
    openUserProfile,
    friends,
    incomingFriendRequests,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    onlineUsers,
  } = useApp();

  const onlineFriendsCount = useMemo(() => {
    return friends.filter((f) =>
      onlineUsers.some(
        (u) =>
          (f.id && u.id === f.id) ||
          (f.matricule && u.matricule?.toLowerCase() === f.matricule.toLowerCase()) ||
          (f.alias && u.alias?.toLowerCase() === f.alias.toLowerCase())
      )
    ).length;
  }, [friends, onlineUsers]);

  const [activeTab, setActiveTab] = useState<InboxTab>(initialReplyPostId ? 'replies' : 'dm');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(initialReplyPostId || null);
  const [replyText, setReplyText] = useState('');
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [replyVideo, setReplyVideo] = useState<{ videoUrl: string; duration: number } | null>(null);
  const [showVideoStudio, setShowVideoStudio] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{ duration: number; audioData: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === 'dark';

  // 1. Direct Messages (MP 1-à-1) grouped by conversation partner
  const dmConversations = useMemo(() => {
    const map = new Map<
      string,
      {
        partnerId: string;
        partnerMatricule: string;
        partnerAlias: string;
        partnerAvatar: string;
        lastMessage: ChatMessage;
        unreadCount: number;
      }
    >();

    let lastReadInbox = 0;
    try {
      lastReadInbox = Number(localStorage.getItem('evasion_last_read_inbox') || 0);
    } catch {
      lastReadInbox = 0;
    }

    const sorted = [...chatMessages].sort((a, b) => a.timestamp - b.timestamp);

    for (const msg of sorted) {
      const isDmChannel = Boolean(msg.channel && msg.channel.startsWith('dm_'));
      const hasRecipient = Boolean(msg.recipientId || msg.recipientMatricule);
      if (!isDmChannel && !hasRecipient) continue;

      const isFromMe = msg.authorId === user.id || msg.authorMatricule === user.matricule;
      const isToMe =
        msg.recipientId === user.id ||
        msg.recipientMatricule === user.matricule ||
        (isDmChannel && !isFromMe && msg.channel?.includes(user.matricule));

      if (!isFromMe && !isToMe) continue;

      const partnerMatricule = isFromMe
        ? msg.recipientMatricule || msg.recipientId || 'Codétenu'
        : msg.authorMatricule || msg.authorId || 'Codétenu';
      const partnerId = isFromMe
        ? msg.recipientId || partnerMatricule
        : msg.authorId || partnerMatricule;

      if (!partnerMatricule || partnerMatricule === user.matricule) continue;

      const friendMatch = friends.find(
        (f) => f.id === partnerId || f.matricule === partnerMatricule
      );
      const onlineMatch = onlineUsers.find(
        (u) => u.id === partnerId || u.matricule === partnerMatricule
      );

      const partnerAlias =
        friendMatch?.alias || onlineMatch?.alias || partnerMatricule;
      const partnerAvatar =
        (!isFromMe ? msg.authorAvatar : undefined) ||
        friendMatch?.avatar ||
        onlineMatch?.avatar ||
        '⛓️';

      const prev = map.get(partnerMatricule);
      const isUnreadIncoming = !isFromMe && msg.timestamp > lastReadInbox;

      map.set(partnerMatricule, {
        partnerId,
        partnerMatricule,
        partnerAlias,
        partnerAvatar,
        lastMessage: msg,
        unreadCount: (prev?.unreadCount || 0) + (isUnreadIncoming ? 1 : 0),
      });
    }

    return Array.from(map.values()).sort(
      (a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp
    );
  }, [chatMessages, user.id, user.matricule, friends, onlineUsers]);

  // 2. Responses on user's posts
  const myConfessionResponses = useMemo(() => {
    const myPosts = posts.filter(
      (p) => p.authorId === user.id || p.authorMatricule === user.matricule
    );
    const list: { post: ConfessionPost; comment: PostComment }[] = [];
    myPosts.forEach((post) => {
      if (post.comments && post.comments.length > 0) {
        post.comments.forEach((comment) => {
          if (comment.authorMatricule !== user.matricule && !isSimulatedComment(comment)) {
            list.push({ post, comment });
          }
        });
      }
    });
    return list.sort((a, b) => b.comment.createdAt - a.comment.createdAt);
  }, [posts, user.id, user.matricule]);

  // Contacts available to start a direct chat immediately
  const quickContacts = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; matricule: string; alias: string; avatar: string; isFriend: boolean; isOnline: boolean }[] = [];

    for (const f of friends) {
      const key = f.matricule || f.id;
      if (!key || key === user.matricule || seen.has(key)) continue;
      seen.add(key);
      const isOnline = onlineUsers.some((u) => u.id === f.id || u.matricule === f.matricule);
      list.push({
        id: f.id,
        matricule: f.matricule,
        alias: f.alias || f.matricule,
        avatar: f.avatar || '⛓️',
        isFriend: true,
        isOnline,
      });
    }

    for (const u of onlineUsers) {
      const key = u.matricule || u.id;
      if (!key || u.id === user.id || u.matricule === user.matricule || seen.has(key)) continue;
      seen.add(key);
      list.push({
        id: u.id,
        matricule: u.matricule,
        alias: u.alias || u.matricule,
        avatar: u.avatar || '⛓️',
        isFriend: false,
        isOnline: true,
      });
    }

    return list;
  }, [friends, onlineUsers, user.id, user.matricule]);

  useEffect(() => {
    if (isOpen) {
      if (initialReplyPostId) {
        setActiveTab('replies');
        setSelectedPostId(initialReplyPostId);
        window.setTimeout(() => {
          document.getElementById(`inbox-reply-${initialReplyPostId}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }, 120);
      }
      try {
        localStorage.setItem('evasion_last_read_inbox', String(Date.now()));
      } catch {
        // ignore
      }
    }
  }, [isOpen, initialReplyPostId]);

  if (!isOpen) return null;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const processed = await processImageFile(file, 1080);
      setReplyImage((prev) => {
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

  const handleSendReply = (postId: string, overrideAudio?: { duration: number; audioData: string }) => {
    if (!requireFullKeyAccess('Répondre')) return;
    const audioToUse = overrideAudio || recordedAudio;
    if (!replyText.trim() && !audioToUse && !replyImage && !replyVideo) return;
    addCommentToPost(
      postId,
      replyText.trim(),
      replyImage || undefined,
      audioToUse || undefined,
      replyVideo || undefined
    );
    setReplyText('');
    setReplyImage(null);
    setReplyVideo(null);
    setRecordedAudio(null);
    setSelectedPostId(null);
    showToast({
      title: 'Réponse envoyée ! 💬',
      message: 'Ton message (texte, photo, vidéo ou vocal) a été transmis.',
      icon: '✨',
      type: 'success',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className={`relative w-full max-w-xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-center ${
          isDark ? 'bg-[#09090b] border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Header centré */}
        <div className="relative flex flex-col items-center justify-center px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/50 text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-4 w-8 h-8 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-1.5">
            <Mail className="w-5 h-5" />
          </span>
          <h2 className="text-base font-black tracking-tight font-mono">
            Messagerie &amp; Notifications
          </h2>
          <p className="text-xs text-zinc-400 font-mono">
            Messages Privés (MP), réponses sur tes aveux et demandes d&apos;amis
          </p>

          {/* Onglets centrés */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 w-full">
            <button
              type="button"
              onClick={() => setActiveTab('dm')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                activeTab === 'dm'
                  ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-xs'
                  : isDark
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-700'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>MP Privés ({dmConversations.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('replies')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                activeTab === 'replies'
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-xs'
                  : isDark
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Réponses ({myConfessionResponses.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                activeTab === 'alerts'
                  ? 'bg-cyan-500 text-zinc-950 border-cyan-400 shadow-xs'
                  : isDark
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-700'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Amis &amp; Alertes ({friends.length + incomingFriendRequests.length})</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar text-center">
          {/* ONGLET 1 : MESSAGES PRIVÉS (MP 1-à-1) */}
          {activeTab === 'dm' && (
            <div className="space-y-4">
              {/* Démarrer un nouveau MP avec un ami ou un membre connecté */}
              <div
                className={`p-3.5 rounded-2xl border space-y-2.5 ${
                  isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                  <Users className="w-3.5 h-3.5" />
                  <span>Démarrer un MP direct ({quickContacts.length})</span>
                </div>

                {quickContacts.length === 0 ? (
                  <p className="text-[11px] font-mono text-zinc-500">
                    Aucun autre membre en ligne ou dans ta liste d&apos;amis pour l&apos;instant. Clique sur n&apos;importe quel pseudo sur Le Mur ou La Cour pour lui écrire en privé.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {quickContacts.map((c) => (
                      <button
                        key={c.matricule}
                        type="button"
                        onClick={() => {
                          onClose();
                          openDirectChat({
                            id: c.id,
                            matricule: c.matricule,
                            alias: c.alias,
                            avatar: c.avatar,
                          });
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                          isDark
                            ? 'bg-zinc-950 border-zinc-800 hover:border-emerald-500/50 text-zinc-200'
                            : 'bg-white border-zinc-200 hover:border-emerald-400 text-zinc-800'
                        }`}
                      >
                        <span className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                          <AvatarDisplay avatar={c.avatar} alt={c.alias} />
                        </span>
                        <span className="font-bold truncate max-w-[110px]">{c.alias}</span>
                        <OnlineStatusBadge userId={c.id} matricule={c.matricule} alias={c.alias} size="xs" showText={false} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Liste des conversations MP */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Conversations privées ({dmConversations.length})</span>
                </h3>

                {dmConversations.length === 0 ? (
                  <div
                    className={`p-8 rounded-2xl border text-center font-mono text-xs text-zinc-500 space-y-2 ${
                      isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <Mail className="w-6 h-6 mx-auto text-zinc-600 mb-1" />
                    <p className="text-zinc-300 font-semibold">Aucune discussion privée pour le moment.</p>
                    <p className="text-[11px] text-zinc-500">
                      Clique sur un membre ci-dessus ou sur son pseudo dans Le Mur / La Cour pour ouvrir un MP chiffré 1-à-1.
                    </p>
                  </div>
                ) : (
                  dmConversations.map((conv) => {
                    const isFromMe =
                      conv.lastMessage.authorId === user.id ||
                      conv.lastMessage.authorMatricule === user.matricule;
                    const preview =
                      conv.lastMessage.content ||
                      (conv.lastMessage.audioNote
                        ? '🎤 Note vocale'
                        : conv.lastMessage.videoUrl
                        ? '🎬 Vidéo'
                        : conv.lastMessage.imageUrl
                        ? '📷 Photo'
                        : 'Message');

                    return (
                      <button
                        key={conv.partnerMatricule}
                        type="button"
                        onClick={() => {
                          onClose();
                          openDirectChat({
                            id: conv.partnerId,
                            matricule: conv.partnerMatricule,
                            alias: conv.partnerAlias,
                            avatar: conv.partnerAvatar,
                          });
                        }}
                        className={`w-full p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer text-center ${
                          isDark
                            ? 'bg-zinc-900/90 border-zinc-800 hover:border-emerald-500/40'
                            : 'bg-white border-zinc-200 hover:border-emerald-400 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2.5">
                          <span className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-base overflow-hidden shrink-0">
                            <AvatarDisplay avatar={conv.partnerAvatar} alt={conv.partnerAlias} />
                          </span>
                          <div className="text-center">
                            <div className="font-mono font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 flex-wrap">
                              <span>{conv.partnerAlias}</span>
                              <OnlineStatusBadge
                                userId={conv.partnerId}
                                matricule={conv.partnerMatricule}
                                alias={conv.partnerAlias}
                                size="xs"
                              />
                              {conv.unreadCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">
                                  {conv.unreadCount} nouveau{conv.unreadCount > 1 ? 'x' : ''}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500">
                              {conv.partnerMatricule} ·{' '}
                              {new Date(conv.lastMessage.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-zinc-300 line-clamp-2 max-w-md">
                          {isFromMe ? <span className="text-zinc-500 font-mono">Toi : </span> : null}
                          {preview}
                        </p>

                        <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                          Ouvrir la discussion &amp; répondre →
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ONGLET 2 : RÉPONSES SUR MES PUBLICATIONS */}
          {activeTab === 'replies' && (
            <div className="space-y-3">
              <h3 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Réponses reçues sur tes publications ({myConfessionResponses.length})</span>
              </h3>

              {myConfessionResponses.length === 0 ? (
                <div
                  className={`p-8 rounded-2xl border text-center font-mono text-xs text-zinc-500 space-y-2 ${
                    isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <Lock className="w-6 h-6 mx-auto text-zinc-600 mb-1" />
                  <p className="text-zinc-300 font-semibold">Aucune réponse reçue pour le moment.</p>
                  <p className="text-[11px] text-zinc-500">
                    Les commentaires des membres sur tes aveux s&apos;afficheront ici en temps réel.
                  </p>
                </div>
              ) : (
                myConfessionResponses.slice(0, 60).map(({ post, comment }) => {
                  const isReplying = selectedPostId === post.id;

                  return (
                    <div
                      key={comment.id}
                      className={`p-4 rounded-2xl border space-y-2.5 transition-all text-center ${
                        isDark
                          ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                          : 'bg-white border-zinc-200 shadow-xs'
                      }`}
                    >
                      <div className="text-[10px] font-mono text-zinc-500 bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60 truncate">
                        Sur ta publication :{' '}
                        <span className="text-zinc-300 font-bold">
                          « {post.content.slice(0, 50)}... »
                        </span>
                      </div>

                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <span className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm overflow-hidden">
                          <AvatarDisplay avatar={comment.authorAvatar} alt={comment.authorAlias} />
                        </span>
                        <div>
                          <div className="font-mono font-bold text-xs flex items-center justify-center gap-1">
                            <span>{comment.authorMatricule}</span>
                            {comment.authorAlias && (
                              <span className="text-zinc-500 text-[10px]">· {comment.authorAlias}</span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-sky-400">
                            @{(comment.authorAlias || comment.authorMatricule).replace(/\s+/g, '_')}
                          </div>
                        </div>
                      </div>

                      {comment.content && (
                        <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed font-sans">
                          {comment.content}
                        </p>
                      )}

                      {comment.imageUrl && (
                        <div className="rounded-xl overflow-hidden border border-zinc-800 max-h-48 mx-auto">
                          <SmartImage
                            src={comment.imageUrl}
                            alt="Photo"
                            className="w-full h-auto max-h-48 object-cover"
                          />
                        </div>
                      )}

                      {comment.videoUrl && (
                        <SmartVideoPlayer
                          src={comment.videoUrl}
                          duration={comment.videoDuration}
                          compact={true}
                        />
                      )}

                      {comment.attachedFile && comment.attachedFile.url && (
                        <DocumentFileCard file={comment.attachedFile} isDark={isDark} compact={true} />
                      )}

                      {comment.audioNote && comment.audioNote.audioData && (
                        <TikTokVoicePlayer
                          audioData={comment.audioNote.audioData}
                          duration={comment.audioNote.duration || 5}
                          compact={true}
                        />
                      )}

                      <div className="flex items-center justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedPostId(isReplying ? null : post.id)}
                          className="text-xs font-mono text-amber-400 hover:underline flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{isReplying ? 'Fermer la réponse' : 'Répondre sur le post'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            openDirectChat({
                              id: comment.authorId,
                              matricule: comment.authorMatricule,
                              alias: comment.authorAlias || comment.authorMatricule,
                              avatar: comment.authorAvatar || '⛓️',
                            });
                          }}
                          className="text-xs font-mono text-emerald-400 hover:underline flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Répondre en MP privé</span>
                        </button>
                      </div>

                      {isReplying && (
                        <div
                          id={`inbox-reply-${post.id}`}
                          className="pt-3 border-t border-zinc-800 space-y-2.5 animate-fade-in text-center"
                        >
                          {(replyImage || replyVideo) && (
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              {replyImage && (
                                <div className="relative inline-block">
                                  <SmartImage
                                    src={replyImage}
                                    alt="Aperçu"
                                    className="w-16 h-16 object-cover rounded-lg border border-zinc-700"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      revokeMediaUrlOrRef(replyImage);
                                      setReplyImage(null);
                                    }}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              {replyVideo && (
                                <div className="relative w-44">
                                  <SmartVideoPlayer
                                    src={replyVideo.videoUrl}
                                    duration={replyVideo.duration}
                                    compact={true}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      revokeMediaUrlOrRef(replyVideo.videoUrl);
                                      setReplyVideo(null);
                                    }}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center z-10"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <textarea
                            rows={3}
                            maxLength={1000}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Écrire ta réponse avec texte, photo, vidéo (1m) ou vocal..."
                            className="w-full min-h-[84px] p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm leading-relaxed text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-y text-center"
                          />

                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageSelect}
                          />

                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className={`px-2.5 py-1.5 rounded-full border text-xs flex items-center gap-1 cursor-pointer ${
                                  replyImage
                                    ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                }`}
                              >
                                <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                                <span className="text-[11px] font-mono">Photo</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setShowVideoStudio(true)}
                                className={`px-2.5 py-1.5 rounded-full border text-xs flex items-center gap-1 cursor-pointer ${
                                  replyVideo
                                    ? 'bg-[#ff0050]/20 border-[#ff0050] text-pink-300'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                }`}
                              >
                                <Video className="w-3.5 h-3.5 text-[#ff0050]" />
                                <span className="text-[11px] font-mono">Vidéo 1m</span>
                              </button>

                              <TikTokVoiceRecorder
                                maxSeconds={60}
                                compact={true}
                                label="Vocal"
                                recordedNote={recordedAudio}
                                onRecorded={setRecordedAudio}
                                onDirectSend={(note) => handleSendReply(post.id, note)}
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSendReply(post.id)}
                              disabled={!replyText.trim() && !recordedAudio && !replyImage && !replyVideo}
                              className="px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                            >
                              <span>Envoyer</span>
                              <Send className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ONGLET 3 : ALERTES & DEMANDES D'AMIS */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {onOpenPhoneNotifications && (
                <div
                  className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center ${
                    isDark
                      ? 'bg-emerald-950/25 border-emerald-500/30'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  <Bell className="w-5 h-5 text-emerald-400" />
                  <div className="text-xs font-bold">Notifications Téléphone &amp; Alertes Push</div>
                  <p className="text-[11px] font-mono text-zinc-400 max-w-md">
                    Configure ou teste les notifications instantanées sur ton téléphone pour les MP, commentaires et messages de La Cour.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPhoneNotifications();
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Gérer &amp; Tester mes Notifications</span>
                  </button>
                </div>
              )}

              <div className="space-y-2.5">
                <h3 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>Demandes d&apos;amis reçues ({incomingFriendRequests.length})</span>
                </h3>

                {incomingFriendRequests.length === 0 ? (
                  <div
                    className={`p-8 rounded-2xl border text-center font-mono text-xs text-zinc-500 space-y-2 ${
                      isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <Users className="w-6 h-6 mx-auto text-zinc-600 mb-1" />
                    <p className="text-zinc-300 font-semibold">Aucune demande d&apos;ami en attente.</p>
                    <p className="text-[11px] text-zinc-500">
                      Lorsqu&apos;un membre t&apos;ajoute en ami, tu reçois une notification ici pour l&apos;accepter.
                    </p>
                  </div>
                ) : (
                  incomingFriendRequests.map((req) => (
                    <div
                      key={req.id || req.matricule}
                      className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-3 text-center ${
                        isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <span className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-base overflow-hidden">
                          <AvatarDisplay avatar={req.avatar} alt={req.alias || req.matricule} />
                        </span>
                        <div className="font-mono font-bold text-xs sm:text-sm">
                          {req.alias || req.matricule}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500">{req.matricule}</div>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => void acceptFriendRequest({ id: req.id, matricule: req.matricule })}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-black text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Accepter ✓</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void declineFriendRequest({ id: req.id, matricule: req.matricule })}
                          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Refuser</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* LISTE DES AMIS & STATUT EN LIGNE / HORS LIGNE EN TEMPS RÉEL */}
              <div className="space-y-2.5 pt-3 border-t border-zinc-800/60">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>Mes Amis ({friends.length})</span>
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                    {onlineFriendsCount} en ligne
                  </span>
                </div>

                {friends.length === 0 ? (
                  <div
                    className={`p-6 rounded-2xl border text-center font-mono text-xs text-zinc-500 space-y-1.5 ${
                      isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-100/70 border-zinc-300 text-zinc-600'
                    }`}
                  >
                    <p className="text-zinc-300 font-semibold">Aucun ami ajouté pour l&apos;instant.</p>
                    <p className="text-[11px] text-zinc-500">
                      Ouvre le profil d&apos;un membre sur Le Mur ou dans La Cour pour lui envoyer une demande d&apos;ami.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friends.map((friend) => (
                      <div
                        key={friend.matricule || friend.id}
                        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left transition-all ${
                          isDark
                            ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                            : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              openUserProfile({
                                id: friend.id,
                                matricule: friend.matricule,
                                alias: friend.alias,
                                avatar: friend.avatar,
                                neonColor: friend.neonColor,
                              });
                            }}
                            className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-base overflow-hidden shrink-0 hover:scale-105 transition-transform cursor-pointer"
                            title="Voir le profil"
                          >
                            <AvatarDisplay avatar={friend.avatar} alt={friend.alias} />
                          </button>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap justify-center sm:justify-start">
                              <span className="font-mono font-bold text-xs sm:text-sm">
                                {friend.alias}
                              </span>
                              <OnlineStatusBadge
                                userId={friend.id}
                                matricule={friend.matricule}
                                alias={friend.alias}
                                size="xs"
                              />
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500">
                              {friend.matricule}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              openDirectChat({
                                id: friend.id,
                                matricule: friend.matricule,
                                alias: friend.alias,
                                avatar: friend.avatar,
                              });
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                            title="Écrire en privé"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>MP</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              openUserProfile({
                                id: friend.id,
                                matricule: friend.matricule,
                                alias: friend.alias,
                                avatar: friend.avatar,
                                neonColor: friend.neonColor,
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs flex items-center gap-1 transition-all cursor-pointer"
                            title="Consulter le profil et ses médias"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Profil</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeFriend({ id: friend.id, matricule: friend.matricule })}
                            className="p-1.5 rounded-xl bg-zinc-800/80 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Retirer des amis"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <VideoStudioModal
          isOpen={showVideoStudio}
          onClose={() => setShowVideoStudio(false)}
          onVideoReady={(video) => setReplyVideo(video)}
          maxSeconds={60}
        />
      </div>
    </div>
  );
};
