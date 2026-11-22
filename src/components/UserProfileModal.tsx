import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  Key,
  Lock,
  MessageCircle,
  Radio,
  Download,
  Image as ImageIcon,
  Mic,
  Video,
  Crown,
  Flame,
  Edit3,
  Loader2,
  Sparkles,
  Check,
  Award,
  QrCode,
  Link2,
  Copy,
  FileText,
  UserPlus,
  UserCheck,
  Clock,
  UserMinus,
  Send,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PublicUserProfile, ProfileUniverseItem, ActiveFlameItem } from '../types';
import { AvatarDisplay } from './AvatarDisplay';
import { LiveAvatarWrapper, LivePseudoBadge, OnlineStatusBadge } from './LiveBadge';
import { TikTokVoicePlayer } from './TikTokVoiceNote';
import { SmartVideoPlayer, SmartImage, SmartPhotoWithMusic, DocumentFileCard } from './MediaElements';
import { downloadMediaAsset, formatFileSize } from '../utils/mediaStore';
import { formatDayOrdinal } from '../utils/formatDays';
import { getNeonTextClass, getNeonAvatarRingClass, getCellFrameClasses } from '../utils/neonStyles';
import { RealQRCode } from './RealQRCode';
import { buildUniverseUrl, formatUniverseId, resolveAnonymousShareSlug } from '../utils/universeUrl';
import { ProfileStatusBadges } from './ProfileStatusBadges';
import { FlameViewerModal } from './FlameViewerModal';
import { AmbientMusicBar } from './AmbientMusicBar';

interface UserProfileModalProps {
  onOpenOwnProfile?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ onOpenOwnProfile }) => {
  const {
    user,
    authAccount,
    userProfileTarget,
    openUserProfile,
    closeUserProfile,
    fetchPublicUserProfile,
    openDirectChat,
    requestOpenLive,
    getUserLiveSession,
    posts,
    theme,
    showToast,
    getFriendshipStatus,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    commentOnFlame,
  } = useApp();

  const [profileData, setProfileData] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'photo' | 'audio' | 'video' | 'file'>('all');
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  const [showQrAndUrl, setShowQrAndUrl] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isFlameViewerOpen, setIsFlameViewerOpen] = useState(false);
  const [quickFlameComment, setQuickFlameComment] = useState('');
  const [sendingFlameComment, setSendingFlameComment] = useState(false);
  const [justCommentedFlame, setJustCommentedFlame] = useState(false);

  const isUrlReadOnly = Boolean(userProfileTarget?.readOnlyFromUrl);

  const isOwnProfile = useMemo(() => {
    if (!userProfileTarget) return false;
    return (
      userProfileTarget.id === user.id ||
      userProfileTarget.matricule === user.matricule ||
      (userProfileTarget.id
        ? formatUniverseId(userProfileTarget.id) === formatUniverseId(user.id)
        : false)
    );
  }, [userProfileTarget, user.id, user.matricule]);

  const canEditProfile = isOwnProfile && !isUrlReadOnly && Boolean(onOpenOwnProfile);

  const targetKey = userProfileTarget ? `${userProfileTarget.id || ''}:${userProfileTarget.matricule || ''}` : '';
  useEffect(() => {
    if (!userProfileTarget) {
      setProfileData(null);
      setMediaFilter('all');
      setZoomedPhoto(null);
      setShowQrAndUrl(false);
      setIsFlameViewerOpen(false);
      setQuickFlameComment('');
      setJustCommentedFlame(false);
      return;
    }

    const identifier = userProfileTarget.id || userProfileTarget.matricule;
    let active = true;
    setLoading(true);
    fetchPublicUserProfile(identifier)
      .then((fetched) => {
        if (!active) return;
        if (fetched) {
          setProfileData(fetched);
        } else {
          // Local fallback computed from loaded posts if offline/not yet persisted
          const matchedPosts = posts.filter(
            (p) =>
              p.authorId === userProfileTarget.id ||
              p.authorMatricule === userProfileTarget.matricule
          );
          const totalPostKeys = matchedPosts.reduce((acc, p) => acc + (p.keysCount || 0), 0);
          const totalPostPadlocks = matchedPosts.reduce(
            (acc, p) => acc + (p.padlocksSealCount || 1),
            0
          );
          setProfileData({
            id: userProfileTarget.id || userProfileTarget.matricule,
            matricule: userProfileTarget.matricule,
            alias: userProfileTarget.alias || userProfileTarget.matricule,
            avatar: userProfileTarget.avatar || '⛓️',
            bio: isOwnProfile ? user.bio || '' : '',
            detentionDays: isOwnProfile ? user.detentionDays || 1 : 1,
            keysAvailable: isOwnProfile ? user.keysAvailable : totalPostKeys,
            keysGivenTotal: isOwnProfile ? user.keysGivenTotal : 0,
            padlocksAvailable: isOwnProfile ? user.padlocksAvailable : totalPostPadlocks,
            escapedCount: isOwnProfile
              ? user.escapedCount
              : matchedPosts.filter((p) => p.status === 'escaped').length,
            points: isOwnProfile ? user.points : totalPostKeys * 100 + totalPostPadlocks * 150,
            isVipCell: isOwnProfile ? user.isVipCell : false,
            neonColor: isOwnProfile ? user.neonColor : userProfileTarget.neonColor,
            cellBorderFrame: isOwnProfile ? user.cellBorderFrame : undefined,
            badges: isOwnProfile ? user.badges : [],
            universeMedia: isOwnProfile ? user.universeMedia || [] : [],
            postsCount: matchedPosts.length,
            totalPostKeys,
            totalPostPadlocks,
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const handleRealtimeUpdate = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ ownerId?: string; userId?: string }>;
      const detail = customEvt.detail;
      if (!detail) return;
      if (
        detail.ownerId === identifier ||
        detail.userId === identifier ||
        detail.ownerId === userProfileTarget.matricule ||
        detail.userId === userProfileTarget.matricule
      ) {
        fetchPublicUserProfile(identifier).then((refreshed) => {
          if (active && refreshed) setProfileData(refreshed);
        });
      }
    };

    window.addEventListener('evasion:media-feed-updated', handleRealtimeUpdate);
    window.addEventListener('evasion:user-updated', handleRealtimeUpdate);

    return () => {
      active = false;
      window.removeEventListener('evasion:media-feed-updated', handleRealtimeUpdate);
      window.removeEventListener('evasion:user-updated', handleRealtimeUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, fetchPublicUserProfile]);

  // Keep own profile immediately fresh if user updates it
  const effectiveProfile: PublicUserProfile | null = !userProfileTarget
    ? null
    : isOwnProfile
    ? {
        id: user.id,
        matricule: user.matricule,
        alias: user.alias,
        avatar: user.avatar,
        bio: user.bio || '',
        cellNumber: user.cellNumber,
        publicShareSlug: user.publicShareSlug,
        isUniversePublic: user.isUniversePublic !== false,
        detentionDays: user.detentionDays || user.streakDays || 1,
        keysAvailable: user.keysAvailable,
        keysGivenTotal: user.keysGivenTotal,
        padlocksAvailable: user.padlocksAvailable ?? 0,
        escapedCount: user.escapedCount,
        points: user.points,
        isVipCell: user.isVipCell,
        neonColor: user.neonColor,
        cellBorderFrame: user.cellBorderFrame,
        badges: user.badges,
        universeMedia: user.universeMedia || [],
        activeFlame: user.activeFlame,
        profileMusic: user.profileMusic,
        isVerified: Boolean(user.isVerified || authAccount?.email),
        profileType: user.profileType || 'personal',
        activeLiveId: profileData?.activeLiveId,
        postsCount: profileData?.postsCount,
        totalPostKeys: profileData?.totalPostKeys,
        totalPostPadlocks: profileData?.totalPostPadlocks,
      }
    : profileData || {
        id: userProfileTarget.id || userProfileTarget.matricule,
        matricule: userProfileTarget.matricule,
        alias: userProfileTarget.alias || userProfileTarget.matricule,
        avatar: userProfileTarget.avatar || '⛓️',
        bio: '',
        isUniversePublic: true,
        detentionDays: 1,
        keysAvailable: 0,
        keysGivenTotal: 0,
        padlocksAvailable: 0,
        escapedCount: 0,
        points: 0,
        isVipCell: false,
        neonColor: userProfileTarget.neonColor,
        badges: [],
        universeMedia: [],
      };

  // Extract all media from this user's confessions/posts
  const userConfessionsMedia = useMemo(() => {
    if (!effectiveProfile) return [];
    const targetId = effectiveProfile.id;
    const targetMatricule = effectiveProfile.matricule;
    const targetAlias = effectiveProfile.alias;
    const userPosts = posts.filter(
      (p) =>
        (targetId && p.authorId === targetId) ||
        (targetMatricule && p.authorMatricule?.toLowerCase() === targetMatricule.toLowerCase()) ||
        (targetAlias && p.authorAlias?.toLowerCase() === targetAlias.toLowerCase())
    );
    const postMediaItems: ProfileUniverseItem[] = [];
    const seen = new Set<string>();

    for (const post of userPosts) {
      if (post.videoUrl && !post.videoUrl.startsWith('idb://') && !seen.has(post.videoUrl)) {
        seen.add(post.videoUrl);
        postMediaItems.push({
          id: `post_vid_${post.id}`,
          type: 'video',
          url: post.videoUrl,
          caption: post.content || 'Vidéo d’aveu',
          duration: post.videoDuration,
          bgMusic: post.bgMusic,
          keysCount: Number(post.keysCount || 0),
          padlocksCount: Number(post.padlocksSealCount || 1),
          visibility: 'public',
          createdAt: Number(post.createdAt || Date.now()),
        });
      }
      if (post.imageUrl && !post.imageUrl.startsWith('idb://') && !seen.has(post.imageUrl)) {
        seen.add(post.imageUrl);
        postMediaItems.push({
          id: `post_img_${post.id}`,
          type: 'photo',
          url: post.imageUrl,
          caption: post.content || 'Photo d’aveu',
          bgMusic: post.bgMusic,
          keysCount: Number(post.keysCount || 0),
          padlocksCount: Number(post.padlocksSealCount || 1),
          visibility: 'public',
          createdAt: Number(post.createdAt || Date.now()),
        });
      }
      if (post.audioNote?.audioData && !post.audioNote.audioData.startsWith('idb://') && !seen.has(post.audioNote.audioData)) {
        seen.add(post.audioNote.audioData);
        postMediaItems.push({
          id: `post_aud_${post.id}`,
          type: 'audio',
          url: post.audioNote.audioData,
          caption: post.content || 'Note vocale d’aveu',
          duration: post.audioNote.duration,
          bgMusic: post.bgMusic,
          keysCount: Number(post.keysCount || 0),
          padlocksCount: Number(post.padlocksSealCount || 1),
          visibility: 'public',
          createdAt: Number(post.createdAt || Date.now()),
        });
      }
    }
    return postMediaItems;
  }, [posts, effectiveProfile?.id, effectiveProfile?.matricule, effectiveProfile?.alias]);

  // Media is ALWAYS visible to all users who request it
  const universeList: ProfileUniverseItem[] = useMemo(() => {
    const rawUniverseList: ProfileUniverseItem[] = effectiveProfile?.universeMedia || [];
    const combined = [...rawUniverseList];
    const seen = new Set(rawUniverseList.map((m) => m?.url).filter(Boolean));
    for (const item of userConfessionsMedia) {
      if (item.url && !seen.has(item.url)) {
        seen.add(item.url);
        combined.push(item);
      }
    }
    return combined;
  }, [effectiveProfile?.universeMedia, userConfessionsMedia]);

  if (!userProfileTarget || !effectiveProfile) return null;

  const liveSession = getUserLiveSession(effectiveProfile.id, effectiveProfile.matricule);

  const filteredMedia =
    mediaFilter === 'all' ? universeList : universeList.filter((m) => m.type === mediaFilter);

  const photosCount = universeList.filter((m) => m.type === 'photo').length;
  const audiosCount = universeList.filter((m) => m.type === 'audio').length;
  const videosCount = universeList.filter((m) => m.type === 'video').length;
  const filesCount = universeList.filter((m) => m.type === 'file').length;

  const isDark = theme === 'dark';
  const activeFlameValid: ActiveFlameItem | null =
    effectiveProfile.activeFlame && effectiveProfile.activeFlame.expiresAt > Date.now()
      ? effectiveProfile.activeFlame
      : null;

  const handleQuickFlameComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickFlameComment.trim();
    if (!clean || sendingFlameComment || !activeFlameValid) return;
    setSendingFlameComment(true);
    try {
      const res = await commentOnFlame(effectiveProfile.id || effectiveProfile.matricule, clean);
      if (!res.success) {
        showToast({
          title: 'Commentaire non envoyé',
          message: res.error || 'Réessaie dans un instant.',
          type: 'warning',
        });
        return;
      }
      if (res.activeFlame) {
        setProfileData((prev) => (prev ? { ...prev, activeFlame: res.activeFlame } : prev));
      }
      setQuickFlameComment('');
      setJustCommentedFlame(true);
    } finally {
      setSendingFlameComment(false);
    }
  };

  const handleDownloadItem = async (item: ProfileUniverseItem) => {
    setDownloadingId(item.id);
    const res = await downloadMediaAsset(
      item.url,
      item.fileName || `evasion_${effectiveProfile.alias.replace(/\s+/g, '_')}_${item.type}_${item.id.slice(-5)}`
    );
    setDownloadingId(null);
    if (res.ok) {
      setDownloadedId(item.id);
      window.setTimeout(() => setDownloadedId(null), 2200);
      showToast({
        title: 'Téléchargement réussi ⬇️',
        message: 'Le fichier de cet univers a été enregistré sur ton appareil.',
        type: 'success',
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={closeUserProfile}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border overflow-hidden shadow-2xl ${
          isDark ? 'bg-[#09090b] border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
        } ${
          effectiveProfile.cellBorderFrame && effectiveProfile.cellBorderFrame !== 'none'
            ? getCellFrameClasses(effectiveProfile.cellBorderFrame, effectiveProfile.neonColor, theme)
            : ''
        }`}
      >
        {/* Top Modal Bar */}
        <div
          className={`shrink-0 px-4 py-3 border-b flex items-center justify-between gap-2 ${
            isDark ? 'bg-zinc-950/90 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isUrlReadOnly
                ? 'Profil Public · Lecture seule'
                : isOwnProfile
                ? 'Vue Publique du Profil'
                : 'Profil Public & Univers'}
            </span>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
          </div>
          <button
            type="button"
            onClick={closeUserProfile}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              isDark ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700'
            }`}
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-5">
          {/* Profile Identity Header (Centré) */}
          <div className="flex flex-col items-center text-center gap-3.5 max-w-md mx-auto">
            <div className="relative inline-flex items-center justify-center">
              <LiveAvatarWrapper userId={effectiveProfile.id} matricule={effectiveProfile.matricule}>
                <div
                  onClick={() => {
                    if (activeFlameValid) setIsFlameViewerOpen(true);
                  }}
                  title={activeFlameValid ? 'Cliquer pour voir sa Flamme 24h 🔥' : undefined}
                  className={`mx-auto transition-transform ${
                    activeFlameValid
                      ? 'p-[3px] rounded-full bg-gradient-to-tr from-orange-500 via-red-500 to-amber-400 shadow-[0_0_24px_rgba(249,115,22,0.55)] cursor-pointer active:scale-95'
                      : ''
                  }`}
                >
                  <div
                    className={`w-16 h-16 sm:w-20 sm:h-20 ${
                      activeFlameValid ? 'rounded-full ring-2 ring-zinc-950' : 'rounded-2xl'
                    } flex items-center justify-center text-3xl overflow-hidden ${
                      isDark ? 'bg-zinc-900' : 'bg-zinc-100'
                    } ${activeFlameValid ? '' : getNeonAvatarRingClass(effectiveProfile.neonColor, theme)}`}
                  >
                    <AvatarDisplay avatar={effectiveProfile.avatar} alt={effectiveProfile.alias} />
                  </div>
                </div>
              </LiveAvatarWrapper>
              {activeFlameValid && (
                <button
                  type="button"
                  onClick={() => setIsFlameViewerOpen(true)}
                  title="Flamme 24h active · Cliquer pour ouvrir"
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white border-2 border-zinc-950 flex items-center justify-center shadow-lg cursor-pointer animate-pulse"
                >
                  <Flame className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="min-w-0 w-full space-y-1">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h2
                  className={`text-lg sm:text-xl font-black tracking-tight ${
                    effectiveProfile.neonColor
                      ? getNeonTextClass(effectiveProfile.neonColor, theme)
                      : isDark
                      ? 'text-white'
                      : 'text-zinc-950'
                  }`}
                >
                  {effectiveProfile.alias || effectiveProfile.matricule}
                </h2>
                <OnlineStatusBadge
                  userId={effectiveProfile.id}
                  matricule={effectiveProfile.matricule}
                  alias={effectiveProfile.alias}
                  size="sm"
                />
                <ProfileStatusBadges
                  isVerified={Boolean(effectiveProfile.isVerified)}
                  profileType={effectiveProfile.profileType || 'personal'}
                  showPersonalLabel
                />
                <LivePseudoBadge userId={effectiveProfile.id} matricule={effectiveProfile.matricule} />
                {effectiveProfile.isVipCell && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400">
                    <Crown className="w-3 h-3" />
                    VIP
                  </span>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-mono text-zinc-400 flex-wrap">
                <span>{effectiveProfile.matricule}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-orange-400">
                  <Flame className="w-3.5 h-3.5" />
                  {formatDayOrdinal(effectiveProfile.detentionDays || 1)}
                </span>
                {effectiveProfile.badges.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Award className="w-3.5 h-3.5" />
                      {effectiveProfile.badges.length} badge{effectiveProfile.badges.length > 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons centrés */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {liveSession && (
                <button
                  type="button"
                  onClick={() => {
                    closeUserProfile();
                    requestOpenLive(liveSession.id);
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-[#ff0050] hover:bg-[#ff1a62] text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition-transform"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Voir son Live</span>
                </button>
              )}

              {canEditProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    closeUserProfile();
                    onOpenOwnProfile?.();
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Éditer mon Profil</span>
                </button>
              ) : !isOwnProfile ? (
                <>
                  {(() => {
                    const status = getFriendshipStatus({
                      id: effectiveProfile.id,
                      matricule: effectiveProfile.matricule,
                    });
                    if (status === 'friend') {
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            void removeFriend({
                              id: effectiveProfile.id,
                              matricule: effectiveProfile.matricule,
                            })
                          }
                          className="px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-red-500/20 border border-emerald-500/40 hover:border-red-500/40 text-emerald-300 hover:text-red-300 font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors group"
                          title="Cliquer pour retirer des amis"
                        >
                          <UserCheck className="w-3.5 h-3.5 group-hover:hidden" />
                          <UserMinus className="w-3.5 h-3.5 hidden group-hover:inline" />
                          <span className="group-hover:hidden">Ami ✓</span>
                          <span className="hidden group-hover:inline">Retirer</span>
                        </button>
                      );
                    }
                    if (status === 'incoming') {
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            void acceptFriendRequest({
                              id: effectiveProfile.id,
                              matricule: effectiveProfile.matricule,
                            })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Accepter l’ami ✓</span>
                        </button>
                      );
                    }
                    if (status === 'outgoing') {
                      return (
                        <span className="px-3 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-bold text-xs flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Demande envoyée</span>
                        </span>
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          void sendFriendRequest({
                            id: effectiveProfile.id,
                            matricule: effectiveProfile.matricule,
                            alias: effectiveProfile.alias,
                            avatar: effectiveProfile.avatar,
                            neonColor: effectiveProfile.neonColor,
                          })
                        }
                        className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Ajouter en ami</span>
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => {
                      closeUserProfile();
                      openDirectChat({
                        id: effectiveProfile.id,
                        matricule: effectiveProfile.matricule,
                        alias: effectiveProfile.alias,
                        avatar: effectiveProfile.avatar,
                        neonColor: effectiveProfile.neonColor,
                      });
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Message Privé</span>
                  </button>
                </>
              ) : (
                <span
                  className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 ${
                    isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lecture seule</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowQrAndUrl((prev) => !prev)}
                className={`px-3 py-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  showQrAndUrl
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : isDark
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-amber-400'
                    : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-amber-700'
                }`}
                title="QR Code et URL de l'espace perso"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR &amp; URL</span>
              </button>
            </div>

            {/* Profile Ambient Music if set by the user */}
            {effectiveProfile.profileMusic && (
              <div className="w-full max-w-sm pt-1">
                <AmbientMusicBar
                  track={effectiveProfile.profileMusic}
                  sourceId={'profile_' + effectiveProfile.id}
                  label="Profil"
                />
              </div>
            )}
          </div>

          {/* Carte interactive Flamme 24h (visible au clic sur la tête du profil ou le pseudo) */}
          {activeFlameValid && (
            <div
              className={`rounded-2xl border p-3.5 space-y-3 ${
                isDark
                  ? 'bg-gradient-to-br from-orange-500/12 via-zinc-950 to-zinc-950 border-orange-500/40'
                  : 'bg-orange-50/70 border-orange-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center shrink-0 shadow">
                    <Flame className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-orange-400 flex items-center gap-1.5">
                      <span>Flamme 24h active</span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        · {activeFlameValid.comments?.length || 0} commentaire{(activeFlameValid.comments?.length || 0) > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400">
                      Présence régulière · Visible 24h sur le profil
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFlameViewerOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white text-[11px] font-black hover:brightness-110 transition-all shrink-0 cursor-pointer"
                >
                  Ouvrir 🔥
                </button>
              </div>

              {activeFlameValid.bgMusic && (
                <div
                  onClick={() => setIsFlameViewerOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-2 text-xs text-zinc-300 cursor-pointer hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">🎵</span>
                    <span className="font-semibold text-white truncate">{activeFlameValid.bgMusic.title}</span>
                    <span className="text-zinc-400 text-[11px] truncate">· {activeFlameValid.bgMusic.artist}</span>
                  </div>
                  <span className="text-[10px] font-mono text-orange-400/90 font-bold shrink-0">
                    Fond sonore
                  </span>
                </div>
              )}

              {/* Aperçu rapide de la Flamme */}
              <div
                onClick={() => setIsFlameViewerOpen(true)}
                className="cursor-pointer rounded-xl overflow-hidden border border-orange-500/25 bg-black/40"
              >
                {activeFlameValid.type === 'text' && (
                  <div
                    className={`p-4 text-center bg-gradient-to-br ${
                      activeFlameValid.bgGradient || 'from-orange-600 via-red-600 to-rose-700'
                    }`}
                  >
                    <p className="text-sm font-black text-white line-clamp-3 whitespace-pre-wrap">
                      {activeFlameValid.text}
                    </p>
                  </div>
                )}
                {activeFlameValid.type === 'photo' && activeFlameValid.url && (
                  <SmartImage
                    src={activeFlameValid.url}
                    alt={activeFlameValid.caption || 'Flamme photo'}
                    className="w-full max-h-44 object-cover"
                  />
                )}
                {activeFlameValid.type === 'video' && activeFlameValid.url && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <SmartVideoPlayer src={activeFlameValid.url} duration={activeFlameValid.duration} compact />
                  </div>
                )}
                {activeFlameValid.type === 'audio' && activeFlameValid.url && (
                  <div className="p-3" onClick={(e) => e.stopPropagation()}>
                    <TikTokVoicePlayer
                      audioData={activeFlameValid.url}
                      duration={activeFlameValid.duration || 10}
                      compact
                    />
                  </div>
                )}
                {activeFlameValid.caption && (
                  <p className="px-3 py-2 text-xs text-zinc-200 bg-zinc-950/70">
                    {activeFlameValid.caption}
                  </p>
                )}
              </div>

              {/* Commentaire rapide + Passer en discussion juste après */}
              <form onSubmit={(e) => void handleQuickFlameComment(e)} className="flex items-center gap-2">
                <input
                  type="text"
                  value={quickFlameComment}
                  onChange={(e) => setQuickFlameComment(e.target.value.slice(0, 300))}
                  placeholder={`Commenter la Flamme de ${effectiveProfile.alias}…`}
                  className={`flex-1 px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-orange-500/60 ${
                    isDark
                      ? 'bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500'
                      : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400'
                  }`}
                />
                <button
                  type="submit"
                  disabled={!quickFlameComment.trim() || sendingFlameComment}
                  className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer transition-all ${
                    quickFlameComment.trim() && !sendingFlameComment
                      ? 'bg-orange-500 hover:bg-orange-400 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {sendingFlameComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </form>

              {justCommentedFlame && !isOwnProfile && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-emerald-300">
                    Commentaire envoyé ! Passer en discussion privée ?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      closeUserProfile();
                      openDirectChat({
                        id: effectiveProfile.id,
                        matricule: effectiveProfile.matricule,
                        alias: effectiveProfile.alias,
                        avatar: effectiveProfile.avatar,
                        neonColor: effectiveProfile.neonColor,
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Discuter 💬</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {showQrAndUrl && (
            <div className="space-y-2.5 animate-fade-in w-full max-w-sm mx-auto min-w-0 text-center">
              {(() => {
                const anonSlug = resolveAnonymousShareSlug(
                  effectiveProfile.publicShareSlug || effectiveProfile.id
                );
                const publicUrl = buildUniverseUrl(anonSlug);
                return (
                  <>
                    <div
                      className={`w-full min-w-0 overflow-hidden px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                        isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <a
                        href={publicUrl}
                        title={publicUrl}
                        onClick={(e) => {
                          e.preventDefault();
                          setShowQrAndUrl(false);
                          openUserProfile({
                            id: effectiveProfile.id,
                            matricule: effectiveProfile.matricule,
                            alias: effectiveProfile.alias,
                            avatar: effectiveProfile.avatar,
                            neonColor: effectiveProfile.neonColor,
                            readOnlyFromUrl: true,
                          });
                        }}
                        className={`flex-1 min-w-0 flex items-center gap-1.5 text-xs font-mono font-medium truncate cursor-pointer text-left ${
                          isDark ? 'text-cyan-300 hover:text-cyan-200' : 'text-cyan-700 hover:text-cyan-600'
                        }`}
                      >
                        <Link2 className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                        <span className="truncate">/?univers={anonSlug}</span>
                      </a>

                      <button
                        type="button"
                        onClick={async () => {
                          if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(publicUrl);
                          }
                          setCopiedUrl(true);
                          showToast({ title: 'URL anonyme copiée !', message: publicUrl, icon: '🔗', type: 'success' });
                          window.setTimeout(() => setCopiedUrl(false), 2000);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-mono font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedUrl ? 'Copié' : 'Copier'}</span>
                      </button>
                    </div>

                    <RealQRCode
                      id={effectiveProfile.id}
                      shareSlug={anonSlug}
                      size={150}
                      label={`Espace Perso · ${effectiveProfile.alias || effectiveProfile.matricule}`}
                    />
                  </>
                );
              })()}
            </div>
          )}

          {/* Bio Block */}
          <div
            className={`p-3.5 rounded-2xl border text-xs sm:text-sm leading-relaxed text-center ${
              isDark ? 'bg-zinc-900/70 border-zinc-800 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-800'
            }`}
          >
            {effectiveProfile.bio && effectiveProfile.bio.trim() ? (
              <p className="whitespace-pre-wrap">{effectiveProfile.bio}</p>
            ) : (
              <p className="italic text-zinc-500 text-xs font-mono">
                Aucune bio renseignée pour le moment.
              </p>
            )}
          </div>

          {/* Keys & Padlocks Scoreboard (Nombre de Clés & Cadenas) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div
              className={`p-3 rounded-2xl border text-center ${
                isDark ? 'bg-zinc-950 border-amber-500/35' : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-lg sm:text-xl font-black font-mono tabular-nums text-amber-400">
                <Key className="w-4 h-4 shrink-0" />
                <span>{effectiveProfile.keysAvailable}</span>
              </div>
              <div className={`text-[11px] font-bold mt-0.5 ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                Clés 🔑
              </div>
              <div className="text-[10px] font-mono text-amber-400/80 tabular-nums">
                {effectiveProfile.keysGivenTotal} offertes
              </div>
            </div>

            <div
              className={`p-3 rounded-2xl border text-center ${
                isDark ? 'bg-zinc-950 border-indigo-500/35' : 'bg-indigo-50 border-indigo-200'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-lg sm:text-xl font-black font-mono tabular-nums text-indigo-400">
                <Lock className="w-4 h-4 shrink-0" />
                <span>{effectiveProfile.padlocksAvailable}</span>
              </div>
              <div className={`text-[11px] font-bold mt-0.5 ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                Cadenas 🔒
              </div>
              <div className="text-[10px] font-mono text-indigo-300/80 tabular-nums">
                {effectiveProfile.totalPostPadlocks || 0} scellés
              </div>
            </div>

            <div
              className={`p-3 rounded-2xl border text-center ${
                isDark ? 'bg-zinc-950 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-emerald-400">
                {effectiveProfile.totalPostKeys ?? 0} 🔑
              </div>
              <div className={`text-[11px] font-bold mt-0.5 ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                Clés sur Aveux
              </div>
              <div className="text-[10px] font-mono text-emerald-400/80 tabular-nums">
                {effectiveProfile.postsCount ?? 0} aveu{(effectiveProfile.postsCount ?? 0) > 1 ? 'x' : ''}
              </div>
            </div>

            <div
              className={`p-3 rounded-2xl border text-center ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-orange-400">
                {effectiveProfile.escapedCount}
              </div>
              <div className={`text-[11px] font-bold mt-0.5 ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                Évasions
              </div>
              <div className="text-[10px] font-mono text-zinc-400 tabular-nums">
                {effectiveProfile.points} pts
              </div>
            </div>
          </div>

          {/* Son Univers : Photos, Audios & Vidéos (Centré) */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-col items-center text-center gap-2.5">
              <div>
                <h3 className="text-sm font-black flex items-center justify-center gap-1.5">
                  <span>🌌 Univers Perso</span>
                  <span className="text-xs font-mono text-zinc-400 tabular-nums">
                    ({universeList.length})
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-500 font-mono">
                  Photos, vidéos, audios et fichiers
                </p>
              </div>

              {/* Filter Buttons centrés sans troncature */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 w-full max-w-md mx-auto">
                {(
                  [
                    { id: 'all', label: 'Tout', count: universeList.length },
                    { id: 'photo', label: 'Photos', count: photosCount },
                    { id: 'video', label: 'Vidéos', count: videosCount },
                    { id: 'audio', label: 'Audios', count: audiosCount },
                    { id: 'file', label: 'Autres', count: filesCount },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMediaFilter(tab.id)}
                    className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      mediaFilter === tab.id
                        ? 'bg-amber-500 text-zinc-950'
                        : isDark
                        ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] opacity-75 tabular-nums">{tab.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {filteredMedia.length === 0 ? (
              <div
                className={`p-6 rounded-2xl border text-center text-xs font-mono ${
                  isDark ? 'bg-zinc-950/60 border-zinc-800 text-zinc-500' : 'bg-zinc-50 border-zinc-200 text-zinc-500'
                }`}
              >
                Aucun média {mediaFilter !== 'all' ? `(${mediaFilter})` : ''} pour l&apos;instant.
              </div>
            ) : (
              <div
                className={
                  filteredMedia.length === 1
                    ? 'max-w-xs mx-auto w-full'
                    : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                }
              >
                {filteredMedia.map((item) => (
                  <div
                    key={item.id}
                    className={`w-full rounded-2xl border p-3 flex flex-col justify-between gap-2.5 ${
                      isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
                      <span className="inline-flex items-center gap-1 font-bold uppercase">
                        {item.type === 'photo' && <ImageIcon className="w-3.5 h-3.5 text-sky-400" />}
                        {item.type === 'audio' && <Mic className="w-3.5 h-3.5 text-[#ff0050]" />}
                        {item.type === 'video' && <Video className="w-3.5 h-3.5 text-emerald-400" />}
                        {item.type === 'file' && <FileText className="w-3.5 h-3.5 text-amber-400" />}
                        <span>{item.type === 'file' ? 'Fichier' : item.type}</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        <button
                          type="button"
                          disabled={downloadingId === item.id}
                          onClick={() => handleDownloadItem(item)}
                          aria-label="Enregistrer"
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                            downloadedId === item.id
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : isDark
                              ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200'
                              : 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800'
                          }`}
                        >
                          {downloadingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : downloadedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {item.type === 'photo' && (
                      <div className="w-full h-44 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
                        <SmartPhotoWithMusic
                          src={item.url}
                          alt={item.caption || item.fileName || 'Photo Univers'}
                          bgMusic={item.bgMusic}
                          onClick={() => setZoomedPhoto(item.url)}
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
                        />
                      </div>
                    )}

                    {item.type === 'audio' && (
                      <div className="py-2 flex flex-col items-center gap-1.5">
                        {item.fileName && (
                          <span className="text-[10px] font-mono text-zinc-400 truncate max-w-full">
                            {item.fileName}
                          </span>
                        )}
                        <TikTokVoicePlayer
                          audioData={item.url}
                          duration={item.duration || 10}
                          compact={true}
                          isMe={isOwnProfile && !isUrlReadOnly}
                        />
                      </div>
                    )}

                    {item.type === 'video' && (
                      <SmartVideoPlayer
                        src={item.url}
                        duration={item.duration}
                        compact={true}
                        bgMusic={item.bgMusic}
                      />
                    )}

                    {item.type === 'file' && (
                      <DocumentFileCard file={item} isDark={isDark} compact={true} />
                    )}

                    {item.bgMusic && item.type !== 'photo' && item.type !== 'video' && (
                      <div className="pt-1">
                        <AmbientMusicBar
                          track={item.bgMusic}
                          sourceId={'universe_' + item.id}
                          label="Fond sonore"
                          variant="compact"
                        />
                      </div>
                    )}

                    {item.caption && (
                      <p className={`text-xs leading-snug line-clamp-2 text-center ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        {item.caption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Photo Lightbox */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setZoomedPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-zinc-900 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <SmartImage
            src={zoomedPhoto}
            alt="Aperçu photo"
            className="max-w-full max-h-[85dvh] rounded-2xl object-contain"
          />
        </div>
      )}

      {activeFlameValid && (
        <FlameViewerModal
          isOpen={isFlameViewerOpen}
          onClose={() => setIsFlameViewerOpen(false)}
          flame={activeFlameValid}
          owner={{
            id: effectiveProfile.id,
            matricule: effectiveProfile.matricule,
            alias: effectiveProfile.alias,
            avatar: effectiveProfile.avatar,
            neonColor: effectiveProfile.neonColor,
            isVerified: Boolean(effectiveProfile.isVerified),
            profileType: effectiveProfile.profileType || 'personal',
            detentionDays: effectiveProfile.detentionDays,
          }}
          isOwnProfile={isOwnProfile}
          onFlameUpdated={(updated) => {
            setProfileData((prev) => (prev ? { ...prev, activeFlame: updated } : prev));
          }}
          onStartDirectChat={() => {
            closeUserProfile();
            openDirectChat({
              id: effectiveProfile.id,
              matricule: effectiveProfile.matricule,
              alias: effectiveProfile.alias,
              avatar: effectiveProfile.avatar,
              neonColor: effectiveProfile.neonColor,
            });
          }}
        />
      )}
    </div>
  );
};
