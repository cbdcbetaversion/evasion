import React, { useState, useRef } from 'react';
import {
  Key,
  Lock,
  Unlock,
  Share2,
  Check,
  Crown,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Send,
  X,
  Download,
  Flame,
  RotateCcw,
} from 'lucide-react';
import { ConfessionPost, PostCategory } from '../types';
import { useApp, isMasterPassUser } from '../context/AppContext';
import { TikTokVoicePlayer, TikTokVoiceRecorder } from './TikTokVoiceNote';
import { SmartVideoPlayer, VideoStudioModal, SmartImage, SmartPhotoWithMusic, DocumentFileCard } from './MediaElements';
import { LiveAvatarWrapper, LivePseudoBadge, OnlineStatusBadge } from './LiveBadge';
import { AvatarDisplay } from './AvatarDisplay';
import { ProfileStatusBadges } from './ProfileStatusBadges';
import { processImageFile, downloadMediaAsset, revokeMediaUrlOrRef } from '../utils/mediaStore';
import { getNeonTextClass, getNeonAvatarRingClass, getCellFrameClasses } from '../utils/neonStyles';
import { AmbientMusicBar } from './AmbientMusicBar';

interface PostCardProps {
  post: ConfessionPost;
}

const CATEGORY_LABELS: Record<PostCategory, { label: string; color: string }> = {
  ecrans: { label: '#Écrans', color: 'text-amber-400' },
  routine: { label: '#Routine', color: 'text-blue-400' },
  pression: { label: '#PressionSociale', color: 'text-purple-400' },
  burnout: { label: '#Burnout', color: 'text-rose-400' },
  procrastination: { label: '#Procrastination', color: 'text-orange-400' },
  solitude: { label: '#Solitude', color: 'text-cyan-400' },
};

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "À l'instant";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `il y a ${diffDays} j`;
}

const PostCardInner: React.FC<PostCardProps> = ({ post }) => {
  const {
    user,
    authAccount,
    friends,
    onlineUsers,
    giveKey,
    revokeKey,
    openStoryModal,
    buyPassePartout,
    usePassePartoutOnPost,
    sealPostWithPadlock,
    theme,
    addCommentToPost,
    activeTagFilter,
    setActiveTagFilter,
    openUserProfile,
    openDirectChat,
    showToast,
    hasFullKeyAccess,
  } = useApp();

  const [keyAnimating, setKeyAnimating] = useState(false);
  const [padlockAnimating, setPadlockAnimating] = useState(false);

  // Comments state (paginated for 1M-user posts)
  const [showComments, setShowComments] = useState(false);
  const [visibleCommentsLimit, setVisibleCommentsLimit] = useState(20);
  const [commentText, setCommentText] = useState('');
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [commentVideo, setCommentVideo] = useState<{ videoUrl: string; duration: number } | null>(null);
  const [showCommentVideoStudio, setShowCommentVideoStudio] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{ duration: number; audioData: string } | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEscaped = post.status === 'escaped' || post.keysCount >= post.keysRequired;
  const remainingKeys = Math.max(0, post.keysRequired - post.keysCount);
  const progressPercent = Math.min(100, Math.round((post.keysCount / post.keysRequired) * 100));
  const categoryInfo = CATEGORY_LABELS[post.category] || { label: `#${post.category}`, color: 'text-zinc-400' };
  const authorHandle = `@${(post.authorAlias || post.authorMatricule).replace(/\s+/g, '_')}`;
  const isMyPost = post.authorId === user.id || post.authorMatricule === user.matricule;
  const effectiveNeon = isMyPost ? user.neonColor || post.authorNeonColor : post.authorNeonColor;
  const effectiveFrame = isMyPost ? user.cellBorderFrame || post.authorFrame : post.authorFrame;
  const matchedFriend = !isMyPost
    ? friends.find((f) => f.id === post.authorId || f.matricule === post.authorMatricule)
    : undefined;
  const matchedOnline = !isMyPost
    ? onlineUsers.find((u) => u.id === post.authorId || u.matricule === post.authorMatricule)
    : undefined;
  const authorIsVerified = isMyPost
    ? Boolean(user.isVerified || authAccount?.email)
    : Boolean(matchedFriend?.isVerified || matchedOnline?.isVerified);
  const authorProfileType = isMyPost
    ? user.profileType || 'personal'
    : matchedFriend?.profileType || matchedOnline?.profileType || 'personal';
  const authorHasActiveFlame = isMyPost
    ? Boolean(user.activeFlame && user.activeFlame.expiresAt > Date.now())
    : Boolean(
        (matchedFriend?.activeFlame && matchedFriend.activeFlame.expiresAt > Date.now()) ||
          matchedOnline?.hasActiveFlame
      );

  // Interactive parser for #Sujets (with Key/Padlock identity) and @Mentions
  const renderSocialContent = (text: string) => {
    const parts = text.split(/(#[a-zA-Z0-9_À-ÿ]+|@[a-zA-Z0-9_À-ÿ#]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('#') && part.length > 1) {
        const isSelected = activeTagFilter?.toLowerCase() === part.toLowerCase();
        return (
          <button
            key={i}
            type="button"
            onClick={() => setActiveTagFilter(isSelected ? null : part)}
            title={`Explorer le sujet ${part} (Clés 🔑 & Cadenas 🔒)`}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 mx-0.5 rounded-md font-mono text-xs font-bold transition-all cursor-pointer ${
              isSelected
                ? 'bg-amber-500 text-zinc-950 shadow-xs'
                : theme === 'dark'
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30'
                : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
            }`}
          >
            <span>{part}</span>
            <span className="text-[10px] opacity-80">{isEscaped ? '🔑' : '🔒'}</span>
          </button>
        );
      }
      if (part.startsWith('@') && part.length > 1) {
        const isSelected = activeTagFilter?.toLowerCase() === part.toLowerCase();
        return (
          <button
            key={i}
            type="button"
            onClick={() => setActiveTagFilter(isSelected ? null : part)}
            title={`Voir les publications liées à ${part}`}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 mx-0.5 rounded-md font-mono text-xs font-bold transition-all cursor-pointer ${
              isSelected
                ? 'bg-sky-400 text-zinc-950 shadow-xs'
                : theme === 'dark'
                ? 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/30'
                : 'bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300'
            }`}
          >
            <span>{part}</span>
          </button>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const handleGiveKey = () => {
    setKeyAnimating(true);
    giveKey(post.id);
    setTimeout(() => setKeyAnimating(false), 600);
  };

  const handleRevokeKey = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setKeyAnimating(true);
    revokeKey(post.id);
    setTimeout(() => setKeyAnimating(false), 600);
  };

  const handleSealPadlock = () => {
    setPadlockAnimating(true);
    sealPostWithPadlock(post.id);
    setTimeout(() => setPadlockAnimating(false), 600);
  };

  // Bug-free image attachment handler
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const processed = await processImageFile(file, 1080);
      setCommentImage((prev) => {
        if (prev && prev !== processed) revokeMediaUrlOrRef(prev);
        return processed;
      });
    } catch (err) {
      showToast({
        title: 'Photo invalide',
        message: err instanceof Error ? err.message : "Impossible d'importer cette image.",
        icon: '⚠️',
        type: 'warning',
      });
    }
  };

  // Submit comment handler
  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() && !commentImage && !recordedAudio && !commentVideo) return;

    addCommentToPost(
      post.id,
      commentText.trim(),
      commentImage || undefined,
      recordedAudio || undefined,
      commentVideo || undefined
    );

    setCommentText('');
    setCommentImage(null);
    setCommentVideo(null);
    setRecordedAudio(null);
    setShowComments(true);

    showToast({
      title: 'Commentaire publié 💬',
      message: `Réponse postée à ${post.authorAlias || post.authorMatricule}.`,
      type: 'success',
      action: {
        label: 'Discuter en privé 💬',
        onClick: () => {
          openDirectChat({
            id: post.authorId,
            matricule: post.authorMatricule,
            alias: post.authorAlias || post.authorMatricule,
            avatar: post.authorAvatar,
          });
        },
      },
    });
  };

  return (
    <article
      className={`relative rounded-3xl border transition-all duration-300 overflow-hidden ${
        theme === 'dark'
          ? post.isPinned
            ? 'bg-[#120d0d]/95 border-amber-500/60 shadow-[0_0_28px_-4px_rgba(245,158,11,0.3)] ring-1 ring-amber-500/30'
            : effectiveFrame && effectiveFrame !== 'none'
            ? `bg-[#120d0d]/95 ${getCellFrameClasses(effectiveFrame, effectiveNeon, theme)}`
            : isEscaped
            ? 'bg-[#120d0d]/95 border-emerald-500/40 shadow-[0_0_24px_-6px_rgba(16,185,129,0.25)]'
            : 'bg-[#120d0d]/95 border-[#ef4444]/18 hover:border-[#f97316]/35'
          : post.isPinned
          ? 'bg-white border-amber-400 shadow-md ring-1 ring-amber-400/30'
          : effectiveFrame && effectiveFrame !== 'none'
          ? `bg-white shadow-sm ${getCellFrameClasses(effectiveFrame, effectiveNeon, theme)}`
          : isEscaped
          ? 'bg-white border-emerald-400/60 shadow-md'
          : 'bg-white border-zinc-200 shadow-xs hover:border-zinc-300'
      }`}
    >
      {/* Golden Pinned Banner (0,99 € Passe-Partout) */}
      {post.isPinned && (
        <div className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 px-4 py-1.5 flex items-center justify-between text-zinc-950 font-mono text-[10px] font-black tracking-wider uppercase shadow-sm">
          <div className="flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5 fill-zinc-950" />
            <span>👑 Sujet Déverrouillé d'Office & Épinglé 24h</span>
          </div>
          <span className="bg-black/15 px-2 py-0.5 rounded text-[9px] font-bold">Passe-Partout</span>
        </div>
      )}

      {/* Top author profile, @handle, #topic and timestamp */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <LiveAvatarWrapper userId={post.authorId} matricule={post.authorMatricule}>
                <div
                  onClick={() =>
                    openUserProfile({
                      id: post.authorId,
                      matricule: post.authorMatricule,
                      alias: post.authorAlias || post.authorMatricule,
                      avatar: post.authorAvatar,
                      neonColor: effectiveNeon,
                    })
                  }
                  title={
                    authorHasActiveFlame
                      ? `Flamme 24h active 🔥 · Cliquer pour voir le profil de ${post.authorAlias || post.authorMatricule}`
                      : `Voir le profil, les clés/cadenas et l'univers de ${post.authorAlias || post.authorMatricule}`
                  }
                  className={
                    authorHasActiveFlame
                      ? 'p-[2px] rounded-full bg-gradient-to-tr from-orange-500 via-red-500 to-amber-400 shadow-[0_0_12px_rgba(249,115,22,0.55)] cursor-pointer hover:scale-105 transition-transform'
                      : 'cursor-pointer hover:scale-105 transition-transform'
                  }
                >
                  <div
                    className={`w-10 h-10 ${
                      authorHasActiveFlame ? 'rounded-full ring-2 ring-zinc-950' : 'rounded-xl'
                    } flex items-center justify-center text-lg select-none overflow-hidden ${
                      theme === 'dark' ? 'bg-zinc-800/90' : 'bg-zinc-100'
                    } ${
                      authorHasActiveFlame
                        ? ''
                        : effectiveNeon
                        ? getNeonAvatarRingClass(effectiveNeon, theme)
                        : theme === 'dark'
                        ? 'border border-zinc-700/60'
                        : 'border border-zinc-200'
                    }`}
                  >
                    <AvatarDisplay avatar={post.authorAvatar} alt={post.authorAlias || post.authorMatricule} />
                  </div>
                </div>
              </LiveAvatarWrapper>
              {authorHasActiveFlame && (
                <span
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white border border-zinc-950 flex items-center justify-center pointer-events-none"
                  title="Flamme 24h active"
                >
                  <Flame className="w-2.5 h-2.5" />
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() =>
                    openUserProfile({
                      id: post.authorId,
                      matricule: post.authorMatricule,
                      alias: post.authorAlias || post.authorMatricule,
                      avatar: post.authorAvatar,
                      neonColor: effectiveNeon,
                    })
                  }
                  title={`Voir le profil, l'univers et les clés/cadenas de ${post.authorAlias || post.authorMatricule}`}
                  className={`font-sans text-sm font-extrabold tracking-tight hover:underline cursor-pointer text-left ${
                    effectiveNeon
                      ? getNeonTextClass(effectiveNeon, theme)
                      : theme === 'dark'
                      ? 'text-white'
                      : 'text-zinc-950'
                  }`}
                >
                  {post.authorAlias || post.authorMatricule}
                </button>
                <ProfileStatusBadges
                  isVerified={authorIsVerified}
                  profileType={authorProfileType}
                  compact
                />
                <OnlineStatusBadge
                  userId={post.authorId}
                  matricule={post.authorMatricule}
                  alias={post.authorAlias}
                  size="xs"
                />
                <LivePseudoBadge userId={post.authorId} matricule={post.authorMatricule} />
                <button
                  type="button"
                  onClick={() => setActiveTagFilter(activeTagFilter === authorHandle ? null : authorHandle)}
                  title={`Filtrer ou mentionner ${authorHandle}`}
                  className={`font-mono text-xs hover:underline cursor-pointer ${
                    effectiveNeon ? getNeonTextClass(effectiveNeon, theme) : 'text-sky-400 font-semibold'
                  }`}
                >
                  {authorHandle}
                </button>
                <span className="text-[11px] font-mono text-zinc-500">· {post.authorMatricule}</span>
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs font-mono mt-0.5 flex-wrap ${
                  theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'
                }`}
              >
                <span>{formatTimeAgo(post.createdAt)}</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() =>
                    setActiveTagFilter(
                      activeTagFilter === categoryInfo.label ? null : categoryInfo.label
                    )
                  }
                  className={`font-mono font-bold hover:underline cursor-pointer flex items-center gap-0.5 ${categoryInfo.color}`}
                >
                  <span>{categoryInfo.label}</span>
                  <span className="text-[10px]">{isEscaped ? '🔑' : '🔒'}</span>
                </button>
                {(post.padlocksSealCount || 0) > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-sky-400 font-bold text-[11px]">
                      <span>🔒{post.padlocksSealCount}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Status badge: Locked vs Escaped */}
          <div className="shrink-0 flex flex-col items-end gap-1">
            {isEscaped ? (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-bold font-mono">
                <Unlock className="w-3.5 h-3.5" />
                <span className="text-[11px]">Déverrouillé 🔑</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold font-mono">
                <Lock className="w-3.5 h-3.5" />
                <span className="text-[11px]">
                  🔒 {remainingKeys} 🔑
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Social post text with interactive #Sujets and @Mentions */}
        <div
          className={`py-2 px-0.5 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words font-normal mb-4 ${
            theme === 'dark' ? 'text-zinc-100' : 'text-zinc-800'
          }`}
        >
          {renderSocialContent(post.content)}
        </div>

        {/* Attached Post Photo if present */}
        {post.imageUrl && (
          <div className="mb-4 rounded-2xl overflow-hidden border border-zinc-800/80 max-h-80 bg-zinc-950">
            <SmartPhotoWithMusic
              src={post.imageUrl.replace(/^\/src\/assets\/images\//, '/assets/images/')}
              alt="Publication"
              bgMusic={post.bgMusic}
              onClick={() =>
                setZoomedImage(
                  post.imageUrl?.replace(/^\/src\/assets\/images\//, '/assets/images/') || null
                )
              }
              className="w-full h-auto max-h-80 object-cover hover:opacity-95 transition-opacity"
            />
          </div>
        )}

        {/* Attached 1-Minute Video if present */}
        {post.videoUrl && (
          <div className="mb-4">
            <SmartVideoPlayer src={post.videoUrl} duration={post.videoDuration} bgMusic={post.bgMusic} />
          </div>
        )}

        {/* Attached Document / File if present */}
        {post.attachedFile && post.attachedFile.url && (
          <div className="mb-4">
            <DocumentFileCard file={post.attachedFile} isDark={theme === 'dark'} />
          </div>
        )}

        {/* Voice Note Player if present */}
        {post.audioNote && post.audioNote.audioData && (
          <div className="mb-4">
            <TikTokVoicePlayer
              audioData={post.audioNote.audioData}
              duration={post.audioNote.duration || 8}
              isMe={post.authorId === user.id || post.authorMatricule === user.matricule}
            />
          </div>
        )}

        {/* Ambient Background Music on Mur Post */}
        {post.bgMusic && (
          <div className="mb-4">
            <AmbientMusicBar
              track={post.bgMusic}
              sourceId={'post_' + post.id}
              label="Fond sonore"
            />
          </div>
        )}

        {/* Minimalist Footer: All Info + Progress + Actions in a clean, compact footprint */}
        <div
          className={`pt-2.5 border-t space-y-2 ${
            theme === 'dark' ? 'border-zinc-800/60' : 'border-zinc-200'
          }`}
        >
          {/* Row 1: Compact Keys Counter + Mini Visual Locks + Donors */}
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-bold tabular-nums ${isEscaped ? 'text-emerald-500' : 'text-amber-500'}`}>
                🔑 {post.keysCount}/{post.keysRequired}
              </span>

              {/* Visual locks (wrapped cleanly & capped at 10 icons so 25/50-key posts never overflow) */}
              <div className="inline-flex items-center gap-1 flex-wrap">
                {Array.from({ length: Math.min(post.keysRequired, 10) }).map((_, idx) => {
                  const unlocked = idx < post.keysCount;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={!isEscaped ? handleGiveKey : undefined}
                      title={unlocked ? `Cadenas #${idx + 1} ouvert` : `Cadenas #${idx + 1} verrouillé (cliquer pour donner 1 clé)`}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all hover:scale-110 ${
                        unlocked
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                          : 'bg-sky-500/15 border-sky-400/50 text-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.2)]'
                      }`}
                    >
                      {unlocked ? (
                        <Unlock className="w-3 h-3 stroke-[2.5]" />
                      ) : (
                        <Lock className="w-3 h-3 stroke-[2.5]" />
                      )}
                    </button>
                  );
                })}
                {post.keysRequired > 10 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-400/40 text-sky-300 text-[10px] font-bold">
                    +{post.keysRequired - 10} cadenas
                  </span>
                )}
              </div>

              <span className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}>
                {isEscaped ? '· Libéré' : `· Reste ${remainingKeys} clé${remainingKeys > 1 ? 's' : ''}`}
              </span>
            </div>

            {post.keyDonors && post.keyDonors.length > 0 && (
              <div className="text-[10px] text-zinc-500 truncate max-w-[210px]" title={`Libérateurs : ${post.keyDonors.join(', ')}`}>
                par {post.keyDonors.slice(0, 2).join(', ')}
                {post.keyDonors.length > 2 ? ` +${post.keyDonors.length - 2}` : ''}
              </div>
            )}
          </div>

          {/* Ultra-slim 1.5px progress line */}
          <div className={`h-1.5 w-full rounded-full overflow-hidden ${theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-200'}`}>
            <div
              style={{ width: `${progressPercent}%` }}
              className={`h-full rounded-full transition-all duration-500 ${
                isEscaped
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : 'bg-gradient-to-r from-red-600 to-amber-500'
              }`}
            />
          </div>

          {/* Row 2: Barre d'actions ergonomique */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
            {/* 1. Donner 1 clé OU Reprendre son don de clé */}
            {post.givenByMe && !isEscaped ? (
              <button
                type="button"
                onClick={handleRevokeKey}
                title="Tu as offert une clé à cet aveu · Cliquer pour reprendre ton don et récupérer ta clé"
                className={`flex-1 min-w-[96px] h-9 px-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1 transition-all active:scale-95 shrink-0 cursor-pointer ${
                  keyAnimating ? 'scale-105 ring-1 ring-amber-400' : ''
                } ${
                  theme === 'dark'
                    ? 'bg-zinc-800/95 hover:bg-zinc-700 text-amber-400 border border-amber-500/40'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Reprendre don ({post.keysCount}/{post.keysRequired})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGiveKey}
                disabled={post.givenByMe && isEscaped}
                title={
                  isEscaped
                    ? 'Aveu libéré'
                    : 'Offrir 1 Clé Haute Valeur (+100 pts Prestige · 10 clés = +1 Passe-Partout)'
                }
                className={`flex-1 min-w-[74px] h-9 px-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1 transition-all active:scale-95 shrink-0 cursor-pointer ${
                  keyAnimating ? 'scale-105 ring-1 ring-amber-400' : ''
                } ${
                  post.givenByMe
                    ? theme === 'dark'
                      ? 'bg-zinc-800/90 text-emerald-400 border border-zinc-700'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                    : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-xs'
                }`}
              >
                {post.givenByMe ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{post.keysCount}/{post.keysRequired}</span>
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5 fill-zinc-950/20 shrink-0" />
                    <span>1 clé</span>
                  </>
                )}
              </button>
            )}

            {/* 2. Cadenas de solidarité */}
            <button
              type="button"
              onClick={handleSealPadlock}
              title="Sceller un Cadenas Haute Valeur sur ce pacte (+150 pts Prestige)"
              className={`flex-1 min-w-[96px] h-9 px-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1 transition-all active:scale-95 shrink-0 cursor-pointer ${
                padlockAnimating ? 'scale-105 ring-2 ring-sky-400' : ''
              } ${
                post.sealedByMe
                  ? 'bg-sky-500/25 border-sky-400 text-white shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                  : theme === 'dark'
                  ? 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-400/50 text-sky-300'
                  : 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-sky-400 stroke-[2.5] shrink-0" />
              <span>Cadenas</span>
              <span className="px-1.5 py-0.5 rounded bg-black/30 text-white text-[11px] font-black tabular-nums">
                {post.padlocksSealCount || 0}
              </span>
            </button>

            {/* 3. Passe-Partout */}
            {!isEscaped && (
              <button
                type="button"
                onClick={() => {
                  if (user.hasPassePartoutCount && user.hasPassePartoutCount > 0) {
                    usePassePartoutOnPost(post.id);
                  } else {
                    buyPassePartout(post.id);
                  }
                }}
                title={
                  isMasterPassUser(user)
                    ? 'Libérer immédiatement et épingler 24h (Gratuit)'
                    : 'Libérer immédiatement sans attendre et épingler 24h en haut du mur (0,99 €)'
                }
                className={`h-9 px-2 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center gap-1 transition-all active:scale-95 shrink-0 cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
                    : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 font-bold'
                }`}
              >
                <span>🗝️</span>
                <span>
                  {user.hasPassePartoutCount && user.hasPassePartoutCount > 0
                    ? `Passe (${user.hasPassePartoutCount})`
                    : isMasterPassUser(user)
                    ? 'Gratuit'
                    : '0,99€'}
                </span>
              </button>
            )}

            {/* 4. Commentaires */}
            <button
              type="button"
              onClick={() => setShowComments(!showComments)}
              title="Commenter avec texte, photo ou note vocale"
              className={`h-9 px-2.5 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center gap-1 transition-all active:scale-95 shrink-0 cursor-pointer ${
                showComments
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                  : post.comments && post.comments.length > 0
                  ? theme === 'dark'
                    ? 'bg-zinc-800/90 hover:bg-zinc-800 border-zinc-700 text-amber-400'
                    : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-amber-600'
                  : theme === 'dark'
                  ? 'bg-zinc-800/70 hover:bg-zinc-800 border-zinc-700/80 text-zinc-300'
                  : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-600'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">{post.comments?.length || 0}</span>
            </button>

            {/* 5. Partager / Télécharger Story */}
            <button
              type="button"
              onClick={() => openStoryModal(post)}
              title="Télécharger ou partager ce post en Story"
              className={`h-9 px-2.5 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center gap-1 transition-all active:scale-95 shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700/80 text-zinc-200 hover:text-white'
                  : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700'
              }`}
            >
              <Share2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="sr-only">Partager</span>
            </button>
          </div>

          {/* Comments Section Drawer (Texte + Audio + Photo + #Sujets & @Mentions) */}
          {showComments && (
            <div
              className={`mt-3 pt-3 border-t space-y-3 animate-fade-in ${
                theme === 'dark' ? 'border-zinc-800 bg-zinc-950/40' : 'border-zinc-200 bg-zinc-50/70'
              } -mx-4 sm:-mx-5 px-4 sm:px-5 py-3`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                  Commentaires · Texte, Photo, Vidéo 1m & Audio ({post.comments?.length || 0})
                </span>
                <button
                  type="button"
                  onClick={() => setShowComments(false)}
                  className="text-xs font-mono text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  Fermer
                </button>
              </div>

              {/* List of comments */}
              {(!post.comments || post.comments.length === 0) ? (
                <div className="py-3 text-center text-xs text-zinc-500 font-mono">
                  Aucun commentaire pour le moment. Réponds en texte, note vocale 🎙️ ou photo 📸 avec # ou @ !
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {post.comments.length > visibleCommentsLimit && (
                    <button
                      type="button"
                      onClick={() => setVisibleCommentsLimit((c) => c + 30)}
                      className="w-full py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-[11px] font-mono text-amber-300 cursor-pointer"
                    >
                      Voir les commentaires précédents ({post.comments.length - visibleCommentsLimit} de plus)
                    </button>
                  )}
                  {post.comments.slice(-visibleCommentsLimit).map((comment) => {
                    const commentHandle = `@${(comment.authorAlias || comment.authorMatricule).replace(/\s+/g, '_')}`;
                    const isMyComment = comment.authorId === user.id || comment.authorMatricule === user.matricule;
                    const commentNeon = isMyComment
                      ? user.neonColor || comment.authorNeonColor
                      : comment.authorNeonColor;
                    return (
                      <div
                        key={comment.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${
                          theme === 'dark'
                            ? 'bg-zinc-900/90 border-zinc-800/80 text-zinc-200'
                            : 'bg-white border-zinc-200 text-zinc-800 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <LiveAvatarWrapper userId={comment.authorId} matricule={comment.authorMatricule}>
                              <button
                                type="button"
                                onClick={() =>
                                  openUserProfile({
                                    id: comment.authorId,
                                    matricule: comment.authorMatricule,
                                    alias: comment.authorAlias || comment.authorMatricule,
                                    avatar: comment.authorAvatar,
                                    neonColor: commentNeon,
                                  })
                                }
                                title={`Voir le profil public, la bio et les médias de ${comment.authorAlias || comment.authorMatricule}`}
                                className={`w-6 h-6 rounded-md overflow-hidden text-sm shrink-0 inline-flex items-center justify-center hover:scale-110 hover:ring-2 hover:ring-amber-500/80 active:scale-95 transition-all cursor-pointer ${
                                  commentNeon ? getNeonAvatarRingClass(commentNeon, theme) : 'border border-zinc-700/60'
                                }`}
                              >
                                <AvatarDisplay avatar={comment.authorAvatar} alt={comment.authorAlias || comment.authorMatricule} />
                              </button>
                            </LiveAvatarWrapper>
                            <button
                              type="button"
                              onClick={() =>
                                openUserProfile({
                                  id: comment.authorId,
                                  matricule: comment.authorMatricule,
                                  alias: comment.authorAlias || comment.authorMatricule,
                                  avatar: comment.authorAvatar,
                                  neonColor: commentNeon,
                                })
                              }
                              title={`Voir l'univers et les clés/cadenas de ${comment.authorAlias || comment.authorMatricule}`}
                              className={`font-sans font-bold truncate text-[11px] hover:underline cursor-pointer ${
                                commentNeon ? getNeonTextClass(commentNeon, theme) : ''
                              }`}
                            >
                              {comment.authorAlias || comment.authorMatricule}
                            </button>
                            <LivePseudoBadge userId={comment.authorId} matricule={comment.authorMatricule} compact />
                            <OnlineStatusBadge
                              userId={comment.authorId}
                              matricule={comment.authorMatricule}
                              alias={comment.authorAlias}
                              size="xs"
                              showText={false}
                            />
                            <button
                              type="button"
                              onClick={() => setActiveTagFilter(commentHandle)}
                              className={`text-[10px] font-mono hover:underline truncate cursor-pointer ${
                                commentNeon ? getNeonTextClass(commentNeon, theme) : 'text-sky-400'
                              }`}
                            >
                              {commentHandle}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setCommentText((prev) =>
                                  prev.includes(commentHandle) ? prev : `${commentHandle} ${prev}`
                                )
                              }
                              className="text-[10px] font-mono text-amber-400 hover:underline cursor-pointer"
                            >
                              Répondre @
                            </button>
                            <span className="text-[10px] font-mono text-zinc-500">
                              {formatTimeAgo(comment.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Comment text with interactive # and @ */}
                        {comment.content && (
                          <p className="leading-relaxed whitespace-pre-wrap text-[11px] sm:text-xs">
                            {renderSocialContent(comment.content)}
                          </p>
                        )}

                        {/* Attached Image if present */}
                        {comment.imageUrl && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                setZoomedImage(
                                  comment.imageUrl?.replace(/^\/src\/assets\/images\//, '/assets/images/') || null
                                )
                              }
                              className="rounded-lg overflow-hidden border border-zinc-700/60 block hover:opacity-90 transition-opacity max-h-40 cursor-pointer"
                            >
                              <SmartImage
                                src={comment.imageUrl.replace(/^\/src\/assets\/images\//, '/assets/images/')}
                                alt=""
                                className="w-full h-auto object-cover max-h-40"
                              />
                            </button>
                          </div>
                        )}

                        {/* Attached Video if present */}
                        {comment.videoUrl && (
                          <div className="pt-1">
                            <SmartVideoPlayer
                              src={comment.videoUrl}
                              duration={comment.videoDuration}
                              compact={true}
                            />
                          </div>
                        )}

                        {/* Attached Document if present */}
                        {comment.attachedFile && comment.attachedFile.url && (
                          <div className="pt-1">
                            <DocumentFileCard file={comment.attachedFile} isDark={theme === 'dark'} compact={true} />
                          </div>
                        )}

                        {/* Attached Voice Note if present */}
                        {comment.audioNote && comment.audioNote.audioData && (
                          <div className="pt-1">
                            <TikTokVoicePlayer
                              audioData={comment.audioNote.audioData}
                              duration={comment.audioNote.duration || 5}
                              compact={true}
                              isMe={comment.authorMatricule === user.matricule}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Comment Composer Form */}
              <form onSubmit={handleSubmitComment} className="pt-2 space-y-2 border-t border-zinc-800/80">
                {/* Active user badge & Quick # / @ pills */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
                    <span className="w-4 h-4 rounded-md overflow-hidden inline-flex items-center justify-center text-xs shrink-0">
                      <AvatarDisplay avatar={user.avatar} alt={user.alias} />
                    </span>
                    <span className={`font-bold ${user.neonColor ? getNeonTextClass(user.neonColor, theme) : 'text-zinc-300'}`}>
                      @{user.alias || user.matricule}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {[authorHandle, '#Force', '#Détox', '#Respect'].map((token) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() =>
                          setCommentText((prev) =>
                            prev.includes(token) ? prev : `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token} `
                          )
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                          token.startsWith('@')
                            ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                        }`}
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview of photo / video / audio attachments */}
                {(commentImage || commentVideo || recordedAudio) && (
                  <div className="flex items-center gap-2.5 flex-wrap p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
                    {commentImage && (
                      <div className="relative inline-block">
                        <SmartImage
                          src={commentImage}
                          alt="Aperçu photo"
                          className="w-16 h-16 object-cover rounded-lg border border-zinc-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            revokeMediaUrlOrRef(commentImage);
                            setCommentImage(null);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-xs shadow-md cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {commentVideo && (
                      <div className="relative flex-1 min-w-[180px] max-w-xs">
                        <SmartVideoPlayer
                          src={commentVideo.videoUrl}
                          duration={commentVideo.duration}
                          compact={true}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            revokeMediaUrlOrRef(commentVideo.videoUrl);
                            setCommentVideo(null);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-xs shadow-md cursor-pointer z-10"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {recordedAudio && (
                      <div className="w-full sm:w-auto sm:min-w-[230px] max-w-xs">
                        <TikTokVoicePlayer
                          audioData={recordedAudio.audioData}
                          duration={recordedAudio.duration}
                          compact={true}
                          isMe={true}
                          hideSpeed={true}
                          onDelete={() => {
                            revokeMediaUrlOrRef(recordedAudio.audioData);
                            setRecordedAudio(null);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Textarea */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 px-1">
                    <span>Ta réponse</span>
                    <span className="tabular-nums">{commentText.length}/1000</span>
                  </div>
                  <textarea
                    rows={5}
                    maxLength={1000}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={`Répondre à ${authorHandle} avec #sujet, @mention, photo, vidéo (1m) ou vocal...`}
                    className={`w-full min-h-[130px] sm:min-h-[145px] p-3.5 rounded-xl border text-xs sm:text-sm leading-relaxed font-sans resize-y focus:outline-hidden focus:ring-1 transition-all ${
                      theme === 'dark'
                        ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500/70 focus:ring-amber-500/30'
                        : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-amber-500'
                    }`}
                  />
                </div>

                {/* Single-row aligned toolbar: Photo, Vidéo, Vocal & Publier */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Hidden file input for photo */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageSelect}
                    />

                    {/* Photo button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Ajouter une photo en commentaire"
                      className={`px-2 sm:px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        commentImage
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : theme === 'dark'
                          ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                          : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-600'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Photo</span>
                    </button>

                    {/* 1-Min Video button */}
                    <button
                      type="button"
                      onClick={() => setShowCommentVideoStudio(true)}
                      title="Filmer ou importer une vidéo (1 min max)"
                      className={`px-2 sm:px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        commentVideo
                          ? 'bg-[#ff0050]/20 border-[#ff0050] text-pink-300'
                          : theme === 'dark'
                          ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                          : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-600'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5 text-[#ff0050] shrink-0" />
                      <span>Vidéo</span>
                      <span className="hidden sm:inline">1m</span>
                    </button>

                    {/* Voice Recorder (max 60s / 1 min) */}
                    <TikTokVoiceRecorder
                      maxSeconds={60}
                      compact={true}
                      label="Vocal"
                      recordedNote={recordedAudio}
                      onRecorded={setRecordedAudio}
                      hideInlinePreview={true}
                    />
                  </div>

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={!commentText.trim() && !commentImage && !recordedAudio && !commentVideo}
                    className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <span>Publier</span>
                    <Send className="w-3 h-3 shrink-0" />
                  </button>
                </div>
              </form>

              <VideoStudioModal
                isOpen={showCommentVideoStudio}
                onClose={() => setShowCommentVideoStudio(false)}
                onVideoReady={(video) => {
                  if (commentVideo?.videoUrl && commentVideo.videoUrl !== video.videoUrl) {
                    revokeMediaUrlOrRef(commentVideo.videoUrl);
                  }
                  setCommentVideo(video);
                }}
                maxSeconds={60}
              />
            </div>
          )}

          {/* Lightbox / Zoom modal for attached image with Download */}
          {zoomedImage && (
            <div
              className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
              onClick={() => setZoomedImage(null)}
            >
              <div className="relative max-w-2xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <SmartImage
                  src={zoomedImage.replace(/^\/src\/assets\/images\//, '/assets/images/')}
                  alt=""
                  className="max-w-full max-h-[80vh] object-contain rounded-xl border border-zinc-700 shadow-2xl"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadMediaAsset(
                        zoomedImage.replace(/^\/src\/assets\/images\//, '/assets/images/'),
                        `evasion_photo_${Date.now()}`
                      )
                    }
                    aria-label="Enregistrer"
                    title="Enregistrer"
                    className="w-9 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center justify-center shadow-lg cursor-pointer"
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
      </div>
    </article>
  );
};

export const PostCard = React.memo(PostCardInner);
