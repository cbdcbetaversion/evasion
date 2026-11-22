import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Key,
  Award,
  Copy,
  Check,
  Users,
  Sparkles,
  Edit3,
  Crown,
  Sun,
  Moon,
  Share2,
  MessageCircle,
  QrCode,
  Flame,
  Trophy,
  Scale,
  Calendar,
  Image as ImageIcon,
  Video,
  Mic,
  Lock,
  Download,
  Trash2,
  Eye,
  Upload,
  Loader2,
  X,
  Link2,
  FileText,
  HardDrive,
  RefreshCw,
  FolderPlus,
  KeyRound,
  ShieldCheck,
  Zap,
  BadgeCheck,
  Briefcase,
  User,
  Music,
} from 'lucide-react';
import { useApp, isMasterPassUser } from '../context/AppContext';
import { KeyAccessGate } from './KeyAccessGate';
import { ALL_BADGES } from '../data/initialData';
import { RealQRCode } from './RealQRCode';
import { LegalPrivacyModal, LegalTab } from './LegalPrivacyModal';
import { PasswordUnlockModal } from './PasswordUnlockModal';
import { PointsExchangeModal, CantineCreatorsSection } from './PointsExchangeModal';
import { formatDayOrdinal } from '../utils/formatDays';
import { getYearlyTheme, YEARLY_THEMES } from '../utils/yearlyAssets';
import {
  NEON_PALETTE,
  CELL_FRAME_OPTIONS,
  getNeonItem,
  getNeonTextClass,
  getNeonAvatarRingClass,
  getCellFrameClasses,
} from '../utils/neonStyles';
import { NeonColor, CellFrame, ProfileUniverseItem, DeezerTrack } from '../types';
import { PhoneNotificationPanel } from './PhoneNotificationModal';
import { AvatarDisplay } from './AvatarDisplay';
import { LiveAvatarWrapper, LivePseudoBadge } from './LiveBadge';
import { TikTokVoicePlayer, TikTokVoiceRecorder } from './TikTokVoiceNote';
import { SmartVideoPlayer, SmartImage, SmartPhotoWithMusic, DocumentFileCard, VideoStudioModal } from './MediaElements';
import {
  compressImageFileToBlob,
  processUniverseFile,
  downloadMediaAsset,
  formatFileSize,
  formatFileSizeMo,
  revokeMediaUrlOrRef,
  saveMediaBlob,
} from '../utils/mediaStore';
import {
  isSupabaseConfigured,
  saveSupabaseProfilePatch,
  uploadAvatarToSupabaseEvasionBucket,
} from '../utils/supabaseClient';
import { buildUniverseUrl, resolveAnonymousShareSlug } from '../utils/universeUrl';
import { ProfileStatusBadges } from './ProfileStatusBadges';
import { FlameComposerModal } from './FlameComposerModal';
import { FlameViewerModal } from './FlameViewerModal';
import { DeezerMusicPickerModal } from './DeezerMusicPickerModal';
import { AmbientMusicBar } from './AmbientMusicBar';
import { GoogleSignInModal } from './GoogleSignInModal';

interface ProfileViewProps {
  onBackToLanding?: () => void;
}

type ProfileSectionTab = 'identity' | 'universe' | 'keys' | 'settings';

export const ProfileView: React.FC<ProfileViewProps> = ({ onBackToLanding }) => {
  const {
    user,
    posts,
    userRank,
    updateUserProfile,
    removeUserAvatar,
    updateProfileStatus,
    setActiveFlame,
    addUniverseMedia,
    removeUniverseMedia,
    toggleUniversePublic,
    setUniverseItemVisibility,
    retryUniverseMediaUpload,
    universeUploadStatuses,
    universeStorageInfo,
    openUserProfile,
    applyReferralCode,
    claimDailyBonusKeys,
    openShop,
    buyNeonPack,
    theme,
    toggleTheme,
    openWallStoryModal,
    protectStreakWithPadlock,
    showToast,
    hasFullKeyAccess,
    requireFullKeyAccess,
    authToken,
    authAccount,
    logoutAccount,
    hasAccountPassword,
    openAuthModal,
    rotatePublicShareSlug,
    setProfileMusic,
    stopAmbientTrack,
  } = useApp();

  const [activeSection, setActiveSection] = useState<ProfileSectionTab>('universe');
  const [isEditing, setIsEditing] = useState(false);
  const [isFlameComposerOpen, setIsFlameComposerOpen] = useState(false);
  const [isFlameViewerOpen, setIsFlameViewerOpen] = useState(false);
  const [isProfileMusicPickerOpen, setIsProfileMusicPickerOpen] = useState(false);
  const [mediaBgMusic, setMediaBgMusic] = useState<DeezerTrack | null>(null);
  const [isMediaMusicPickerOpen, setIsMediaMusicPickerOpen] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const isUserVerified = Boolean(user.isVerified || authAccount?.email);
  const activeFlameValid =
    user.activeFlame && user.activeFlame.expiresAt > Date.now() ? user.activeFlame : null;

  const [aliasInput, setAliasInput] = useState(user.alias || '');
  const [avatarInput, setAvatarInput] = useState(typeof user.avatar === 'string' ? user.avatar : '');
  const [bioInput, setBioInput] = useState(user.bio || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [pickedNeon, setPickedNeon] = useState<NeonColor>(user.neonColor || 'emerald');
  const [pickedFrame, setPickedFrame] = useState<CellFrame>(
    user.cellBorderFrame && user.cellBorderFrame !== 'none' ? user.cellBorderFrame : 'neon'
  );
  const [previewSampleText, setPreviewSampleText] = useState(
    'Je reprends le contrôle de mon temps et je lâche les écrans ce soir.'
  );

  // Universe Upload & Download State
  const [universeFilter, setUniverseFilter] = useState<'all' | 'photo' | 'audio' | 'video' | 'file'>('all');
  const [universeCaption, setUniverseCaption] = useState('');
  const [newMediaVisibility, setNewMediaVisibility] = useState<'public' | 'private'>(() =>
    user.isUniversePublic === false ? 'private' : 'public'
  );
  const [activeUploadsCount, setActiveUploadsCount] = useState(0);
  const [isVideoStudioOpen, setIsVideoStudioOpen] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [downloadingUniverseId, setDownloadingUniverseId] = useState<string | null>(null);
  const [downloadedUniverseId, setDownloadedUniverseId] = useState<string | null>(null);
  const [previewFileModalItem, setPreviewFileModalItem] = useState<ProfileUniverseItem | null>(null);

  // Referral & QR & Legal
  const [copiedUniverseUrl, setCopiedUniverseUrl] = useState(false);
  const [rotatingSlug, setRotatingSlug] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [referralFeedback, setReferralFeedback] = useState<{ success: boolean; msg: string } | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [showUniverseQr, setShowUniverseQr] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab | null>(null);
  const [passwordModalState, setPasswordModalState] = useState<{
    open: boolean;
    mode: 'auto' | 'change';
    afterUnlock?: () => void;
  }>({ open: false, mode: 'change' });
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);

  const avatarPhotoInputRef = useRef<HTMLInputElement>(null);
  const universePhotoInputRef = useRef<HTMLInputElement>(null);
  const universeAnyFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) return;
    setAliasInput(user.alias || '');
    setAvatarInput(typeof user.avatar === 'string' ? user.avatar : '');
    setBioInput(user.bio || '');
  }, [user.alias, user.avatar, user.bio, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    if (user.neonColor) setPickedNeon(user.neonColor);
    if (user.cellBorderFrame) setPickedFrame(user.cellBorderFrame);
  }, [user.neonColor, user.cellBorderFrame, isEditing]);

  const openEditModal = () => {
    setAliasInput(user.alias || '');
    setAvatarInput(typeof user.avatar === 'string' ? user.avatar : '');
    setBioInput(user.bio || '');
    if (user.neonColor) setPickedNeon(user.neonColor);
    if (user.cellBorderFrame) setPickedFrame(user.cellBorderFrame);
    setIsEditing(true);
  };

  const AVATARS = [
    '⛓️',
    '🐺',
    '⚡',
    '🦅',
    '🗝️',
    '🌿',
    '🔥',
    '🕊️',
    '💀',
    '🛡️',
    '🎭',
    '🦉',
    '🥷',
    '👑',
    '🌒',
    '🎧',
  ];

  const isDark = theme === 'dark';

  const commitPendingProfileEdits = (overrideAvatar?: string) => {
    try {
      const nextAlias = aliasInput.trim() || user.alias;
      const currentAvatar = typeof user.avatar === 'string' ? user.avatar : '';
      const nextAvatar = overrideAvatar !== undefined ? overrideAvatar : avatarInput;
      const nextBio = bioInput.trim();
      if (
        nextAlias !== user.alias ||
        nextAvatar !== currentAvatar ||
        nextBio !== (user.bio || '').trim()
      ) {
        updateUserProfile(nextAlias, nextAvatar || null, nextBio, true);
      }
    } catch (err) {
      showToast({
        title: 'Erreur de sauvegarde',
        message: err instanceof Error ? err.message : 'Impossible de sauvegarder le profil.',
        type: 'warning',
      });
    }
  };

  useEffect(() => {
    if (!isEditing) return;
    const timer = window.setTimeout(() => {
      try {
        const nextAlias = aliasInput.trim() || user.alias;
        const currentAvatar = typeof user.avatar === 'string' ? user.avatar : '';
        const nextAvatar = avatarInput;
        const nextBio = bioInput.trim();
        if (
          nextAlias !== user.alias ||
          nextAvatar !== currentAvatar ||
          nextBio !== (user.bio || '').trim()
        ) {
          updateUserProfile(nextAlias, nextAvatar || null, nextBio, true);
        }
      } catch {
        // guarded auto-save
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [isEditing, aliasInput, avatarInput, bioInput, user.alias, user.avatar, user.bio, updateUserProfile]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      updateUserProfile(aliasInput, avatarInput || null, bioInput);
      setIsEditing(false);
    } catch (err) {
      showToast({
        title: 'Erreur de profil',
        message: err instanceof Error ? err.message : 'Impossible de sauvegarder les modifications.',
        type: 'warning',
      });
    }
  };

  const handleCustomAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isUploadingAvatar) return;

    setIsUploadingAvatar(true);
    try {
      const compressedBlob = await compressImageFileToBlob(file, 512, 0.82);
      const sbUid = user.supabaseUserId;
      const ownerId = sbUid || user.id;

      let finalAvatarUrl: string | null = null;
      let uploadErrMsg: string | undefined;

      if (isSupabaseConfigured) {
        const uploaded = await uploadAvatarToSupabaseEvasionBucket(
          compressedBlob,
          ownerId,
          file.name
        );
        finalAvatarUrl = uploaded.publicUrl;
        uploadErrMsg = uploaded.error;
      }

      if (finalAvatarUrl) {
        if (sbUid) {
          const saved = await saveSupabaseProfilePatch(sbUid, { avatar_url: finalAvatarUrl });
          if (!saved) {
            showToast({
              title: 'Profil partiellement synchronisé',
              message: 'Photo envoyée, mais la table profiles Supabase n’a pas répondu.',
              type: 'warning',
            });
          }
        }
      } else {
        if (sbUid && isSupabaseConfigured) {
          throw new Error(
            uploadErrMsg ||
              "Impossible d'envoyer la photo vers le bucket Supabase Storage 'evasion'."
          );
        }
        // Mode local / invité hors Supabase Auth : zéro localStorage ni Base64 -> IndexedDB persistant (survit au rechargement)
        finalAvatarUrl = await saveMediaBlob(compressedBlob);
      }

      if (
        typeof user.avatar === 'string' &&
        (user.avatar.startsWith('idb://') || user.avatar.startsWith('blob:')) &&
        user.avatar !== finalAvatarUrl
      ) {
        void revokeMediaUrlOrRef(user.avatar);
      }

      setAvatarInput(finalAvatarUrl);
      updateUserProfile(aliasInput.trim() || user.alias, finalAvatarUrl, bioInput, true);
      showToast({
        title: 'Photo de profil enregistrée ✓',
        message: 'Ta nouvelle photo de profil est active et sauvegardée.',
        type: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Erreur photo de profil',
        message:
          err instanceof Error
            ? err.message
            : "Impossible de modifier la photo de profil pour le moment.",
        type: 'warning',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      setAvatarInput('');
      await removeUserAvatar();
    } catch (err) {
      showToast({
        title: 'Erreur suppression photo',
        message:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer la photo de profil.',
        type: 'warning',
      });
    }
  };

  const handleUniverseFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    commitPendingProfileEdits();
    const captionSnapshot = universeCaption.trim() || undefined;
    if (captionSnapshot) setUniverseCaption('');
    setActiveUploadsCount((c) => c + files.length);

    let addedCount = 0;
    try {
      for (const file of files) {
        try {
          const processed = await processUniverseFile(file);
          if (universeFilter !== 'all' && universeFilter !== processed.type) {
            setUniverseFilter('all');
          }
          await addUniverseMedia({
            type: processed.type,
            url: processed.url,
            duration: processed.duration,
            fileName: processed.fileName,
            mimeType: processed.mimeType,
            fileSize: processed.fileSize,
            caption: captionSnapshot,
            visibility: newMediaVisibility,
            bgMusic: mediaBgMusic || undefined,
          });
          addedCount += 1;
        } catch (err) {
          showToast({
            title: `Fichier ignoré (${file.name})`,
            message: err instanceof Error ? err.message : "Impossible d'importer ce fichier.",
            type: 'warning',
          });
        } finally {
          setActiveUploadsCount((c) => Math.max(0, c - 1));
        }
      }

      if (mediaBgMusic) {
        setMediaBgMusic(null);
      }

      if (addedCount > 0 && !universeStorageInfo.isFull) {
        showToast({
          title:
            addedCount > 1
              ? `${addedCount} médias ajoutés à ton Univers ✨`
              : 'Ajouté à ton Univers ✨',
          message: 'Chargement retenu et conservé sur ton profil.',
          type: 'success',
        });
      }
    } catch (err) {
      setActiveUploadsCount(0);
      showToast({
        title: "Erreur d'importation",
        message: err instanceof Error ? err.message : "Impossible d'importer ces fichiers.",
        type: 'warning',
      });
    }
  };

  const openMemoryUpgradeShop = () => {
    openShop({
      id: 'pack_storage_50',
      name: 'Extension Mémoire Univers (+50 Médias)',
      tagline: '+50 emplacements photos, vidéos, audios & fichiers + 2 Clés 🔑.',
      priceLabel: '1,99 €',
      amount: 1.99,
      storageSlots: 50,
      keys: 2,
      icon: '🧠',
      type: 'storage_pack',
    });
  };

  const handleDownloadUniverseItem = async (item: ProfileUniverseItem) => {
    if (downloadingUniverseId === item.id) return;
    setDownloadingUniverseId(item.id);
    const res = await downloadMediaAsset(
      item.url,
      item.fileName || `evasion_univers_${item.type}_${item.id.slice(-5)}`
    );
    setDownloadingUniverseId(null);
    if (res.ok) {
      setDownloadedUniverseId(item.id);
      window.setTimeout(() => setDownloadedUniverseId(null), 2200);
      showToast({
        title: 'Téléchargement lancé ⬇️',
        message: 'Média enregistré sans quitter la page.',
        type: 'success',
      });
    } else {
      showToast({
        title: 'Téléchargement impossible',
        message: 'Ce média n’a pas pu être récupéré.',
        type: 'warning',
      });
    }
  };

  const openPasswordSettings = (mode: 'auto' | 'change' = 'auto') => {
    setPasswordModalState({ open: true, mode });
  };

  const handleApplyFriendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendCodeInput.trim()) return;
    const res = applyReferralCode(friendCodeInput);
    setReferralFeedback({ success: res.success, msg: res.message });
    if (res.success) setFriendCodeInput('');
  };

  const RANK_TIERS = [
    { rank: 'Nouveau', min: 0, icon: '⛓️', label: '0 clé' },
    { rank: 'Complice', min: 10, icon: '🗝️', label: '10 clés' },
    { rank: 'Cerveau', min: 50, icon: '🧠', label: '50 clés' },
    { rank: 'Libéré', min: 100, icon: '🕊️', label: '100 clés' },
  ];

  const myPosts = posts.filter(
    (p) => p.authorId === user.id || p.authorMatricule === user.matricule
  );
  const keysEarnedFromAveux = myPosts.reduce((acc, p) => acc + (p.keysCount || 0), 0);
  const padlocksEarnedFromAveux = myPosts.reduce(
    (acc, p) => acc + (p.padlocksSealCount || 1),
    0
  );
  const commentsEarnedFromAveux = myPosts.reduce(
    (acc, p) => acc + (p.comments ? p.comments.length : 0),
    0
  );
  const popularityScore =
    keysEarnedFromAveux * 100 + padlocksEarnedFromAveux * 150 + commentsEarnedFromAveux * 50;
  const unlockProgressPercent = Math.min(100, Math.round(((user.keysAvailable || 0) / 10) * 100));

  const universeList: ProfileUniverseItem[] = user.universeMedia || [];
  const filteredUniverse =
    universeFilter === 'all'
      ? universeList
      : universeList.filter((item) => item.type === universeFilter);

  const previewAlias = aliasInput.trim() || user.alias || user.matricule;
  const previewHandle = `@${previewAlias.replace(/\s+/g, '_')}`;
  const previewBio = bioInput.trim();
  const hasNeonChanged =
    pickedNeon !== (user.neonColor || 'emerald') ||
    pickedFrame !== (user.cellBorderFrame || 'none');

  const anonShareSlug = resolveAnonymousShareSlug(user.publicShareSlug || user.id);
  const universeUrl = buildUniverseUrl(anonShareSlug);

  const handleCopyUniverseUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(universeUrl);
      }
      setCopiedUniverseUrl(true);
      showToast({
        title: 'URL anonyme copiée !',
        message: universeUrl,
        icon: '🔗',
        type: 'success',
      });
      window.setTimeout(() => setCopiedUniverseUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleRotateShareSlug = async () => {
    if (rotatingSlug) return;
    setRotatingSlug(true);
    try {
      await rotatePublicShareSlug();
    } finally {
      setRotatingSlug(false);
    }
  };

  const sectionTabs: { id: ProfileSectionTab; label: string; count?: number }[] = [
    { id: 'universe', label: '🌌 Mon Univers', count: universeList.length },
    { id: 'identity', label: '👤 Profil & Édition' },
    { id: 'keys', label: '🔑 Clés & Grades' },
    { id: 'settings', label: '⚙️ Réglages' },
  ];

  return (
    <div className="space-y-4 pb-24 w-full min-w-0 overflow-hidden">
      {!hasFullKeyAccess && (
        <KeyAccessGate
          compact
          extraNote="Publie sur Le Mur (0 🔑) pour cumuler Clés 🔑 et Cadenas 🔒."
        />
      )}

      <input
        ref={avatarPhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCustomAvatarUpload}
      />

      {/* 1. HERO PROFIL CENTRÉ */}
      <div
        className={`rounded-3xl p-4 sm:p-6 border text-center transition-all ${
          user.cellBorderFrame && user.cellBorderFrame !== 'none'
            ? `${isDark ? 'bg-transparent' : 'bg-white/40 backdrop-blur-xs'} ${getCellFrameClasses(
                user.cellBorderFrame,
                user.neonColor,
                theme
              )}`
            : isDark
            ? 'bg-transparent border-white/15'
            : 'bg-white/40 border-zinc-200/80 backdrop-blur-xs'
        }`}
      >
        <div className="flex flex-col items-center gap-3.5 max-w-md mx-auto">
          <div className="relative inline-flex items-center justify-center">
            <LiveAvatarWrapper userId={user.id} matricule={user.matricule}>
              <div
                onClick={() => {
                  if (activeFlameValid) {
                    setIsFlameViewerOpen(true);
                  } else {
                    avatarPhotoInputRef.current?.click();
                  }
                }}
                title={
                  activeFlameValid
                    ? 'Cliquer pour voir ta Flamme 24h active 🔥'
                    : 'Cliquer pour changer ta photo de profil'
                }
                className={`rounded-full mx-auto cursor-pointer transition-transform active:scale-95 ${
                  activeFlameValid
                    ? 'p-[3px] bg-gradient-to-tr from-orange-500 via-red-500 to-amber-400 shadow-[0_0_24px_rgba(249,115,22,0.55)]'
                    : ''
                }`}
              >
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-3xl overflow-hidden ${
                    isDark ? 'bg-[#0b0808]' : 'bg-zinc-100'
                  } ${activeFlameValid ? 'ring-2 ring-zinc-950' : getNeonAvatarRingClass(user.neonColor, theme)}`}
                >
                  <AvatarDisplay avatar={user.avatar} alt={user.alias} />
                </div>
              </div>
            </LiveAvatarWrapper>
            {activeFlameValid && (
              <button
                type="button"
                onClick={() => setIsFlameViewerOpen(true)}
                title="Voir ma Flamme 24h"
                className="absolute -top-1 -left-1 w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white border-2 border-zinc-950 flex items-center justify-center shadow-md cursor-pointer animate-pulse"
              >
                <Flame className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              disabled={isUploadingAvatar}
              onClick={() => avatarPhotoInputRef.current?.click()}
              title="Changer la photo de profil"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 border-2 border-zinc-950 flex items-center justify-center shadow-md cursor-pointer"
            >
              {isUploadingAvatar ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
            </button>
            {typeof user.avatar === 'string' && user.avatar.trim().length > 0 && (
              <button
                type="button"
                onClick={() => void handleRemoveAvatar()}
                title="Supprimer la photo de profil"
                aria-label="Supprimer la photo de profil"
                className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-zinc-900 hover:bg-red-600 text-zinc-300 hover:text-white border-2 border-zinc-950 flex items-center justify-center shadow-md cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="min-w-0 w-full space-y-1.5">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <h2
                className={`text-lg sm:text-xl font-black tracking-tight ${
                  user.neonColor
                    ? getNeonTextClass(user.neonColor, theme)
                    : isDark
                    ? 'text-white'
                    : 'text-zinc-950'
                }`}
              >
                {user.alias}
              </h2>
              <ProfileStatusBadges
                isVerified={isUserVerified}
                profileType={user.profileType || 'personal'}
                showPersonalLabel
              />
              <LivePseudoBadge userId={user.id} matricule={user.matricule} />
              {user.isVipCell && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  <Crown className="w-3 h-3" />
                  VIP
                </span>
              )}
            </div>

            <div className={`flex items-center justify-center gap-2 text-xs font-mono flex-wrap ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <span>{user.matricule}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-bold ${isDark ? 'text-[#fb923c]' : 'text-orange-600'}`}>
                🔥 {formatDayOrdinal(user.detentionDays || user.streakDays || 1)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{userRank.icon} {userRank.rank}</span>
            </div>

            {user.bio && (
              <p className={`text-xs leading-relaxed max-w-sm mx-auto ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                {user.bio}
              </p>
            )}
          </div>

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  setIsEditing(false);
                } else {
                  openEditModal();
                }
              }}
              className={`min-h-[42px] px-3 py-2 rounded-full text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                isEditing
                  ? 'bg-[#ef4444] text-white'
                  : 'evasion-btn-primary'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{isEditing ? 'Fermer Édition' : 'Éditer Profil'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                openUserProfile({
                  id: user.id,
                  matricule: user.matricule,
                  alias: user.alias,
                  avatar: user.avatar,
                  neonColor: user.neonColor,
                  readOnlyFromUrl: true,
                })
              }
              className={`min-h-[42px] px-3 py-2 rounded-full border text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                isDark
                  ? 'bg-[#181212] hover:bg-[#221818] border-[#ef4444]/30 text-zinc-200'
                  : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800'
              }`}
              title="Voir mon profil tel que les autres le voient"
            >
              <Eye className="w-3.5 h-3.5 text-[#fb923c] shrink-0" />
              <span className="truncate">Vue Publique</span>
            </button>
          </div>

          {/* Flamme 24h Quick Action Strip */}
          <div className="flex flex-col items-center gap-1.5 w-full max-w-sm">
            <div className="flex items-center justify-center gap-2 w-full">
              {activeFlameValid ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsFlameViewerOpen(true)}
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/50 text-orange-300 text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-110 transition-all cursor-pointer"
                  >
                    <Flame className="w-3.5 h-3.5 text-orange-400" />
                    <span>Voir ma Flamme 24h ({activeFlameValid.comments?.length || 0} 💬)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFlameComposerOpen(true)}
                    title="Publier une nouvelle Flamme 24h"
                    className="min-h-[38px] px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-orange-500/50 transition-colors cursor-pointer"
                  >
                    + Nouvelle
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsFlameComposerOpen(true)}
                  className="w-full min-h-[38px] px-4 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-red-600 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 hover:brightness-110 transition-all cursor-pointer active:scale-95"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Publier une Flamme 24h (Texte / Photo / Vidéo / Vocal)</span>
                </button>
              )}
            </div>

            {activeFlameValid?.bgMusic && (
              <div
                onClick={() => setIsFlameViewerOpen(true)}
                className="w-full px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-between text-[11px] text-zinc-300 cursor-pointer hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span>🎵</span>
                  <span className="font-semibold text-white truncate">{activeFlameValid.bgMusic.title}</span>
                  <span className="text-zinc-400 truncate">· {activeFlameValid.bgMusic.artist}</span>
                </div>
                <span className="text-[10px] font-mono text-orange-400/90 font-bold shrink-0">
                  Fond Flamme
                </span>
              </div>
            )}

            {/* Profile Ambient Music Widget */}
            <div className="w-full pt-0.5">
              {user.profileMusic ? (
                <AmbientMusicBar
                  track={user.profileMusic}
                  sourceId={'profile_' + user.id}
                  label="Profil"
                  onChange={() => setIsProfileMusicPickerOpen(true)}
                  onRemove={() => void setProfileMusic(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsProfileMusicPickerOpen(true)}
                  className={`w-full py-2 px-3 rounded-2xl border text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-zinc-950/70 hover:bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-orange-500/40'
                      : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-700 hover:text-zinc-900 hover:border-orange-400'
                  }`}
                  title="Choisir une musique de fond pour ton profil"
                >
                  <Music className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span>+ Musique de profil 🎵</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Centered KPI & Actions Strip */}
        <div
          className={`mt-4 pt-3.5 border-t space-y-3 text-xs font-mono ${
            isDark ? 'border-white/10' : 'border-zinc-200'
          }`}
        >
          <div className="grid grid-cols-4 gap-2 max-w-md mx-auto text-center">
            <div>
              <div className={`font-black tabular-nums ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{user.keysAvailable} 🔑</div>
              <div className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Clés</div>
            </div>
            <div>
              <div className={`font-black tabular-nums ${isDark ? 'text-indigo-400' : 'text-indigo-700'}`}>{user.padlocksAvailable ?? 0} 🔒</div>
              <div className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Cadenas</div>
            </div>
            <div>
              <div className={`font-black tabular-nums ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{user.escapedCount}</div>
              <div className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Évasions</div>
            </div>
            <button
              type="button"
              onClick={() => setIsPointsModalOpen(true)}
              className="hover:scale-105 transition-transform cursor-pointer"
              title="Ouvrir la Cantine des Créateurs"
            >
              <div className={`font-black tabular-nums ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                ⚡ {user.points || 0}
              </div>
              <div className={`text-[10px] font-bold underline ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Cantine</div>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
            <button
              type="button"
              onClick={claimDailyBonusKeys}
              className={`min-h-[36px] px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                isDark ? 'bg-transparent hover:bg-white/5 text-zinc-200 border border-white/15' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300'
              } ${!hasFullKeyAccess ? 'opacity-65' : ''}`}
            >
              +3 Clés
            </button>
            <button
              type="button"
              onClick={() => setIsPointsModalOpen(true)}
              className={`min-h-[36px] px-3 py-1.5 rounded-full border text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                isDark
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/50 text-amber-300'
                  : 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900'
              }`}
            >
              <Zap className="w-3 h-3 shrink-0" />
              <span className="truncate">Cantine</span>
            </button>
            <button
              type="button"
              onClick={() => openShop()}
              className={`min-h-[36px] px-3 py-1.5 rounded-full border text-[11px] font-bold transition-colors cursor-pointer ${
                isDark
                  ? 'bg-[#ef4444]/15 hover:bg-[#ef4444]/25 border-[#f97316]/45 text-[#fb923c]'
                  : 'bg-orange-100 hover:bg-orange-200 border-orange-300 text-orange-800'
              }`}
            >
              Boutique
            </button>
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION CENTRÉE EN GRILLE (4 ONGLETS VISIBLES SANS COUPURE) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {sectionTabs.map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`min-h-[42px] px-3 py-2 rounded-full text-xs font-mono font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                isActive
                  ? 'evasion-btn-primary border-transparent shadow-md'
                  : isDark
                  ? 'bg-transparent hover:bg-white/5 border-white/15 text-zinc-300'
                  : 'bg-white/75 hover:bg-zinc-100 border-zinc-300 text-zinc-800 shadow-2xs'
              }`}
            >
              <span className="truncate">{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums shrink-0 ${
                    isActive
                      ? 'bg-black/25 text-white'
                      : isDark
                      ? 'bg-zinc-800 text-zinc-300'
                      : 'bg-zinc-200 text-zinc-800'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* ONGLET 2 : IDENTITÉ, APERÇU & QR CODE                                     */}
      {/* ========================================================================= */}
      {activeSection === 'identity' && (
        <div className="space-y-4">
          <div
            className={`rounded-2xl p-4 sm:p-5 border space-y-4 text-center ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <div className="flex flex-col items-center text-center gap-2.5 max-w-md mx-auto">
              <div className="space-y-1">
                <h3 className="text-sm font-black">Aperçu de ton Identité Réseau</h3>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Clique sur « Modifier » pour changer pseudo, photo/symbole, bio et style.
                </p>
              </div>
              <button
                type="button"
                onClick={openEditModal}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>Modifier</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-md mx-auto">
              <button
                type="button"
                onClick={() => setActiveSection('universe')}
                className={`min-h-[42px] px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-gradient-to-r from-indigo-600/20 to-cyan-600/20 border-cyan-500/40 text-cyan-300'
                    : 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-800'
                }`}
              >
                <ImageIcon className="w-4 h-4 shrink-0" />
                <span>Gérer Mon Univers ({universeList.length} médias)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrCode((v) => !v)}
                className={`min-h-[42px] px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDark ? 'bg-zinc-950 border-zinc-800 text-amber-400' : 'bg-zinc-50 border-zinc-200 text-amber-700'
                }`}
              >
                <QrCode className="w-4 h-4 text-red-500 shrink-0" />
                <span>{showQrCode ? 'Masquer QR Code' : 'Mon QR Code Réel'}</span>
              </button>
            </div>

            {showQrCode && (
              <div className="pt-3 border-t border-zinc-800/80 animate-fade-in max-w-xs mx-auto">
                <RealQRCode
                  id={user.id}
                  shareSlug={anonShareSlug}
                  size={165}
                  label={`Lien Public Anonyme · ${user.alias || user.matricule}`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 1 : ESPACE PERSO · MON UNIVERS (MINIMALISTE & ERGONOMIQUE)         */}
      {/* ========================================================================= */}
      {activeSection === 'universe' && (
        <div
          className={`w-full min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5 border space-y-3.5 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
          }`}
        >
          {/* En-tête minimaliste + 2 actions */}
          <div className="flex flex-col items-center text-center gap-2.5">
            <div className="space-y-0.5">
              <h3 className="text-base font-black flex items-center justify-center gap-2 flex-wrap">
                <span>🌌 Mon Univers</span>
                <span className={`text-xs font-mono tabular-nums ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  {user.keysAvailable} 🔑 · {user.padlocksAvailable ?? 0} 🔒
                </span>
              </h3>
              <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Photos, audios et vidéos
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              <button
                type="button"
                onClick={() => setShowUniverseQr((prev) => !prev)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  showUniverseQr
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : isDark
                    ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-amber-400'
                    : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-amber-700'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                <span>{showUniverseQr ? 'Masquer QR' : 'QR Code'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openUserProfile({
                    id: user.id,
                    matricule: user.matricule,
                    alias: user.alias,
                    avatar: user.avatar,
                    neonColor: user.neonColor,
                    readOnlyFromUrl: true,
                  })
                }
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/35 text-cyan-300'
                    : 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>Vue publique</span>
              </button>
            </div>
          </div>

          {/* Barre URL publique anonyme (profil-anonyme-xxx, jamais d'USR) */}
          <div className="w-full max-w-sm mx-auto min-w-0 space-y-2.5">
            <div
              className={`w-full min-w-0 overflow-hidden px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <a
                href={universeUrl}
                onClick={(e) => {
                  e.preventDefault();
                  openUserProfile({
                    id: user.id,
                    matricule: user.matricule,
                    alias: user.alias,
                    avatar: user.avatar,
                    neonColor: user.neonColor,
                    readOnlyFromUrl: true,
                  });
                }}
                className={`flex-1 min-w-0 flex items-center gap-1.5 text-xs font-mono font-medium truncate cursor-pointer text-left ${
                  isDark ? 'text-cyan-300 hover:text-cyan-200' : 'text-cyan-700 hover:text-cyan-600'
                }`}
                title={universeUrl}
              >
                <Link2 className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                <span className="truncate">/?univers={anonShareSlug}</span>
              </a>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleRotateShareSlug}
                  disabled={rotatingSlug}
                  title="Changer la fin de l'URL anonyme"
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    isDark
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${rotatingSlug ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleCopyUniverseUrl}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer transition-colors ${
                    copiedUniverseUrl
                      ? 'bg-emerald-500 text-zinc-950'
                      : isDark
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      : 'bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-800'
                  }`}
                >
                  {copiedUniverseUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedUniverseUrl ? 'Copié' : 'Copier'}</span>
                </button>
              </div>
            </div>

            {showUniverseQr && (
              <div className="pt-1 animate-fade-in max-w-xs mx-auto">
                <RealQRCode
                  id={user.id}
                  shareSlug={anonShareSlug}
                  size={152}
                  label={`Espace Perso · ${user.alias}`}
                />
              </div>
            )}
          </div>

          {/* Mémoire Univers & Jauge */}
          <div
            className={`w-full max-w-sm mx-auto p-3 rounded-2xl border space-y-2 ${
              universeStorageInfo.isFull
                ? isDark
                  ? 'bg-amber-950/25 border-amber-500/50'
                  : 'bg-amber-50 border-amber-300'
                : isDark
                ? 'bg-zinc-950/70 border-zinc-800'
                : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono">
              <span className={`inline-flex items-center gap-1.5 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                <HardDrive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {universeStorageInfo.isUnlimited
                    ? `Mémoire : ${universeStorageInfo.used} · ∞ Illimitée`
                    : `Mémoire : ${universeStorageInfo.used} / ${universeStorageInfo.quota}`}
                </span>
              </span>
              {!universeStorageInfo.isUnlimited && (
                <button
                  type="button"
                  onClick={openMemoryUpgradeShop}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[10px] uppercase cursor-pointer transition-colors shrink-0"
                >
                  + Mémoire
                </button>
              )}
            </div>

            {!universeStorageInfo.isUnlimited && (
              <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    universeStorageInfo.isFull
                      ? 'bg-red-500'
                      : universeStorageInfo.used / Math.max(1, universeStorageInfo.quota) >= 0.8
                      ? 'bg-amber-400'
                      : 'bg-emerald-500'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.round((universeStorageInfo.used / Math.max(1, universeStorageInfo.quota)) * 100))}%`,
                  }}
                />
              </div>
            )}

            {!universeStorageInfo.isUnlimited && universeStorageInfo.used / Math.max(1, universeStorageInfo.quota) >= 0.8 && !universeStorageInfo.isFull && (
              <p className={`text-[11px] leading-snug text-center font-mono ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                ⚠️ Mémoire à 80%+ ({universeStorageInfo.used}/{universeStorageInfo.quota}). Pense à étendre ton espace dans la boutique PayPal !
              </p>
            )}

            {universeStorageInfo.isFull && (
              <p className={`text-[11px] leading-snug text-center ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                Limite atteinte sans rien effacer. Étends ta mémoire pour ajouter encore plus de photos, vidéos &amp; fichiers.
              </p>
            )}
          </div>

          {/* Réglage de confidentialité : Partager ses médias en Public 🌍 ou en Privé 🔒 */}
          <div
            className={`w-full max-w-sm mx-auto p-3 rounded-2xl border space-y-2 ${
              user.isUniversePublic === false
                ? isDark
                  ? 'bg-indigo-950/25 border-indigo-500/45'
                  : 'bg-indigo-50 border-indigo-300'
                : isDark
                ? 'bg-emerald-950/20 border-emerald-500/35'
                : 'bg-emerald-50/75 border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono">
              <span className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                <span>{user.isUniversePublic === false ? '🔒' : '🌍'}</span>
                <span>
                  Partage de mes médias :{' '}
                  <strong className={user.isUniversePublic === false ? 'text-indigo-400' : 'text-emerald-400'}>
                    {user.isUniversePublic === false ? 'Privé' : 'Public'}
                  </strong>
                </span>
              </span>
            </div>

            <p className={`text-[11px] leading-snug text-center ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {user.isUniversePublic === false
                ? 'Tes médias sont privés : seul toi peux les voir dans ton profil (masqués du Live Média et de la Vue Publique).'
                : 'Tes médias publics sont visibles dans le Live Média et sur ta Vue Publique. Tu peux aussi régler chaque média individuellement.'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewMediaVisibility('public');
                  void toggleUniversePublic(true, true);
                }}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  user.isUniversePublic !== false
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-sm'
                    : isDark
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                    : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
                }`}
              >
                <span>🌍</span>
                <span>Public</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewMediaVisibility('private');
                  void toggleUniversePublic(false, true);
                }}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  user.isUniversePublic === false
                    ? 'bg-indigo-500 text-white border-indigo-400 shadow-sm'
                    : isDark
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                    : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
                }`}
              >
                <span>🔒</span>
                <span>Privé</span>
              </button>
            </div>
          </div>

          {/* Ajout rapide multi-médias non bloquant : Photo + Vidéo + Audio + Autres */}
          <div
            className={`w-full max-w-sm mx-auto min-w-0 p-3 rounded-2xl border space-y-2.5 ${
              isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>Visibilité du prochain ajout :</span>
              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setNewMediaVisibility('public')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                    newMediaVisibility === 'public'
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  🌍 Public
                </button>
                <button
                  type="button"
                  onClick={() => setNewMediaVisibility('private')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                    newMediaVisibility === 'private'
                      ? 'bg-indigo-500 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  🔒 Privé
                </button>
              </div>
            </div>

            <input
              type="text"
              value={universeCaption}
              onChange={(e) => setUniverseCaption(e.target.value)}
              maxLength={140}
              placeholder="Légende (optionnel)..."
              className={`w-full min-w-0 rounded-xl px-3 py-2 text-xs text-center border focus:outline-none focus:border-amber-500 ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500' : 'bg-white border-zinc-300 text-zinc-900'
              }`}
            />

            <input
              ref={universePhotoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUniverseFilesUpload}
            />

            <input
              ref={universeAnyFileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.csv,.json,*"
              multiple
              className="hidden"
              onChange={handleUniverseFilesUpload}
            />

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full">
              <button
                type="button"
                onClick={() => universePhotoInputRef.current?.click()}
                className={`w-full min-h-[40px] px-2 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  isDark
                    ? 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-400/35 text-sky-300'
                    : 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setIsVideoStudioOpen(true)}
                className={`w-full min-h-[40px] px-2 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  isDark
                    ? 'bg-[#ff0050]/15 hover:bg-[#ff0050]/25 border-[#ff0050]/40 text-pink-300'
                    : 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-800'
                }`}
              >
                <Video className="w-3.5 h-3.5 shrink-0" />
                <span>Vidéo</span>
              </button>

              <TikTokVoiceRecorder
                maxSeconds={60}
                compact={true}
                label="Audio"
                recordedNote={null}
                hideInlinePreview={true}
                buttonClassName={`w-full min-h-[40px] px-2 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  isDark
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-100'
                    : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-800'
                }`}
                onRecorded={async (note) => {
                  if (!note) return;
                  try {
                    commitPendingProfileEdits();
                    if (universeFilter !== 'all' && universeFilter !== 'audio') {
                      setUniverseFilter('all');
                    }
                    const cap = universeCaption.trim() || undefined;
                    if (cap) setUniverseCaption('');
                    const trackAttached = mediaBgMusic;
                    if (mediaBgMusic) setMediaBgMusic(null);
                    setActiveUploadsCount((c) => c + 1);
                    await addUniverseMedia({
                      type: 'audio',
                      url: note.audioData,
                      duration: note.duration,
                      caption: cap,
                      visibility: newMediaVisibility,
                      bgMusic: trackAttached || undefined,
                    });
                  } catch (err) {
                    showToast({
                      title: 'Erreur audio',
                      message:
                        err instanceof Error ? err.message : "Impossible d'enregistrer cet audio.",
                      type: 'warning',
                    });
                  } finally {
                    setActiveUploadsCount((c) => Math.max(0, c - 1));
                  }
                }}
              />

              <button
                type="button"
                onClick={() => setIsMediaMusicPickerOpen(true)}
                className={`w-full min-h-[40px] px-2 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  mediaBgMusic
                    ? isDark
                      ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                      : 'bg-orange-100 border-orange-400 text-orange-800'
                    : isDark
                    ? 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-400'
                    : 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700'
                }`}
                title="Choisir une musique de fond ou ajouter un titre à Mon Univers"
              >
                <Music className="w-3.5 h-3.5 shrink-0" />
                <span>{mediaBgMusic ? 'Fond 🎵' : '+ Musique'}</span>
              </button>

              <button
                type="button"
                onClick={() => universeAnyFileInputRef.current?.click()}
                className={`w-full min-h-[40px] px-2 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  isDark
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/35 text-amber-300'
                    : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                }`}
                title="Ajouter plusieurs photos, vidéos, musiques ou documents"
              >
                <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Autres</span>
              </button>
            </div>

            {/* Attached Ambient Track Banner for Univers Media */}
            {mediaBgMusic && (
              <div className="w-full space-y-1.5">
                <AmbientMusicBar
                  track={mediaBgMusic}
                  sourceId="pending_media_music"
                  label="Fond sonore média"
                  onRemove={() => setMediaBgMusic(null)}
                  onChange={() => setIsMediaMusicPickerOpen(true)}
                />
                <div className="flex items-center justify-between gap-2 px-1 text-[11px] font-mono text-zinc-400">
                  <span>Sera associé au prochain média importé</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!mediaBgMusic) return;
                      try {
                        commitPendingProfileEdits();
                        const trackToSave = mediaBgMusic;
                        setMediaBgMusic(null);
                        setActiveUploadsCount((c) => c + 1);
                        await addUniverseMedia({
                          type: 'audio',
                          url: trackToSave.previewUrl,
                          fileName: `${trackToSave.title} - ${trackToSave.artist}.mp3`,
                          caption: `${trackToSave.title} · ${trackToSave.artist}`,
                          bgMusic: trackToSave,
                          visibility: newMediaVisibility,
                        });
                      } catch (err) {
                        showToast({
                          title: 'Erreur musique',
                          message:
                            err instanceof Error
                              ? err.message
                              : "Impossible d'ajouter cette musique.",
                          type: 'warning',
                        });
                      } finally {
                        setActiveUploadsCount((c) => Math.max(0, c - 1));
                      }
                    }}
                    className="text-orange-400 font-bold hover:underline cursor-pointer"
                  >
                    + Enregistrer en média direct ➔
                  </button>
                </div>
              </div>
            )}

            {activeUploadsCount > 0 && (
              <div
                className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl border text-[11px] font-mono ${
                  isDark
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                }`}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>
                  {activeUploadsCount} chargement{activeUploadsCount > 1 ? 's' : ''} retenu{activeUploadsCount > 1 ? 's' : ''} en cours...
                </span>
              </div>
            )}
          </div>

          {/* Filtres compacts sans troncature */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 w-full max-w-md mx-auto">
            {(
              [
                { id: 'all', label: 'Tout', count: universeList.length },
                {
                  id: 'photo',
                  label: 'Photos',
                  count: universeList.filter((m) => m.type === 'photo').length,
                },
                {
                  id: 'video',
                  label: 'Vidéos',
                  count: universeList.filter((m) => m.type === 'video').length,
                },
                {
                  id: 'audio',
                  label: 'Audios',
                  count: universeList.filter((m) => m.type === 'audio').length,
                },
                {
                  id: 'file',
                  label: 'Autres',
                  count: universeList.filter((m) => m.type === 'file').length,
                },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setUniverseFilter(f.id)}
                className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  universeFilter === f.id
                    ? 'bg-amber-500 text-zinc-950'
                    : isDark
                    ? 'bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300'
                    : 'bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-700'
                }`}
              >
                <span>{f.label}</span>
                <span className="text-[10px] opacity-75 tabular-nums">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Flamme 24h active également visible dans Mes médias */}
          {activeFlameValid &&
            (universeFilter === 'all' ||
              activeFlameValid.type === universeFilter ||
              (universeFilter === 'file' && activeFlameValid.type === 'text')) && (
              <div
                onClick={() => {
                  stopAmbientTrack();
                  setIsFlameViewerOpen(true);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    stopAmbientTrack();
                    setIsFlameViewerOpen(true);
                  }
                }}
                className={`w-full rounded-2xl border p-3 flex items-center justify-between gap-3 cursor-pointer transition-all hover:scale-[1.005] active:scale-[0.99] ${
                  isDark
                    ? 'bg-gradient-to-r from-orange-500/15 via-red-500/10 to-amber-500/10 border-orange-500/40 hover:border-orange-400'
                    : 'bg-gradient-to-r from-orange-50 via-red-50 to-amber-50 border-orange-300 hover:border-orange-400'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-orange-400/50 shrink-0 bg-zinc-900 flex items-center justify-center relative">
                    {activeFlameValid.type === 'photo' && activeFlameValid.url ? (
                      <SmartImage
                        src={activeFlameValid.url}
                        alt="Ma Flamme 24h"
                        className="w-full h-full object-cover"
                      />
                    ) : activeFlameValid.type === 'text' ? (
                      <div
                        className={`w-full h-full flex items-center justify-center p-1 text-[9px] font-black text-white text-center leading-tight bg-gradient-to-br ${
                          activeFlameValid.bgGradient || 'from-orange-500 to-red-600'
                        }`}
                      >
                        <span className="line-clamp-3">{activeFlameValid.text}</span>
                      </div>
                    ) : activeFlameValid.type === 'video' ? (
                      <div className="w-full h-full bg-gradient-to-br from-orange-600 to-rose-700 flex items-center justify-center text-white">
                        <Video className="w-5 h-5" />
                      </div>
                    ) : activeFlameValid.type === 'audio' ? (
                      <div className="w-full h-full bg-gradient-to-br from-orange-600 to-pink-600 flex items-center justify-center text-white">
                        <Mic className="w-5 h-5" />
                      </div>
                    ) : (
                      <Flame className="w-5 h-5 text-orange-400" />
                    )}
                    <span className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-orange-500 text-white text-[8px] font-black">
                      🔥 24h
                    </span>
                  </div>

                  <div className="min-w-0 text-left space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-xs font-black ${
                          isDark ? 'text-orange-300' : 'text-orange-700'
                        }`}
                      >
                        Ma Flamme 24h active
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                          isDark
                            ? 'bg-orange-500/20 text-orange-200'
                            : 'bg-orange-200/70 text-orange-900'
                        }`}
                      >
                        {activeFlameValid.type === 'text'
                          ? 'Texte'
                          : activeFlameValid.type === 'photo'
                          ? 'Photo'
                          : activeFlameValid.type === 'video'
                          ? 'Vidéo'
                          : activeFlameValid.type === 'audio'
                          ? 'Vocal'
                          : 'Fichier'}
                      </span>
                    </div>
                    {(activeFlameValid.caption || activeFlameValid.text) && (
                      <p
                        className={`text-[11px] truncate max-w-[200px] sm:max-w-xs ${
                          isDark ? 'text-zinc-300' : 'text-zinc-700'
                        }`}
                      >
                        {activeFlameValid.caption || activeFlameValid.text}
                      </p>
                    )}
                    {activeFlameValid.bgMusic && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 truncate max-w-[210px]">
                        <Music className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {activeFlameValid.bgMusic.title}
                          {activeFlameValid.bgMusic.artist ? ` · ${activeFlameValid.bgMusic.artist}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <span className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white text-[10px] font-mono font-black shrink-0 shadow">
                  Ouvrir 🔥
                </span>
              </div>
            )}

          {/* Galerie Univers centrée */}
          {filteredUniverse.length === 0 && !activeFlameValid ? (
            <div
              className={`p-6 rounded-2xl border text-center text-xs font-mono ${
                isDark ? 'bg-zinc-950/60 border-zinc-800 text-zinc-500' : 'bg-zinc-50 border-zinc-200 text-zinc-500'
              }`}
            >
              Ton univers est vide pour ce filtre. Ajoute photos, vidéos, audios ou fichiers ci-dessus !
            </div>
          ) : filteredUniverse.length === 0 ? null : (
            <div
              className={
                filteredUniverse.length === 1
                  ? 'max-w-xs mx-auto w-full'
                  : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
              }
            >
              {filteredUniverse.map((item) => {
                const uploadState = universeUploadStatuses[item.id];
                return (
                <div
                  key={item.id}
                  className={`w-full rounded-2xl border p-3 flex flex-col justify-between gap-2.5 ${
                    uploadState === 'quota_blocked'
                      ? 'bg-amber-950/20 border-amber-500/50'
                      : isDark
                      ? 'bg-zinc-950 border-zinc-800'
                      : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono text-zinc-400">
                    <span className="inline-flex items-center gap-1 font-bold uppercase min-w-0">
                      {item.type === 'photo' && <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                      {item.type === 'audio' && <Mic className="w-3.5 h-3.5 text-[#ff0050] shrink-0" />}
                      {item.type === 'video' && <Video className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      {item.type === 'file' && <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      <span>{item.type === 'file' ? 'Fichier' : item.type}</span>
                      {uploadState === 'uploading' && (
                        <span className="inline-flex items-center gap-0.5 text-sky-400 lowercase font-normal">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>envoi</span>
                        </span>
                      )}
                      {uploadState === 'local_only' && (
                        <button
                          type="button"
                          onClick={() => void retryUniverseMediaUpload(item.id)}
                          className="inline-flex items-center gap-0.5 text-amber-400 hover:underline lowercase font-normal cursor-pointer"
                          title="Retenu localement · Cliquer pour synchroniser"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>sync</span>
                        </button>
                      )}
                      {uploadState === 'quota_blocked' && (
                        <button
                          type="button"
                          onClick={openMemoryUpgradeShop}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500 text-zinc-950 font-black lowercase cursor-pointer"
                        >
                          <span>+ mémoire</span>
                        </button>
                      )}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const isItemPrivate =
                            user.isUniversePublic === false || item.visibility === 'private';
                          if (user.isUniversePublic === false && isItemPrivate) {
                            void toggleUniversePublic(true, false);
                          }
                          void setUniverseItemVisibility(
                            item.id,
                            isItemPrivate ? 'public' : 'private'
                          );
                        }}
                        title={
                          user.isUniversePublic === false || item.visibility === 'private'
                            ? 'Ce média est Privé (cliquer pour le passer en Public 🌍)'
                            : 'Ce média est Public (cliquer pour le passer en Privé 🔒)'
                        }
                        className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                          user.isUniversePublic === false || item.visibility === 'private'
                            ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25'
                            : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                        }`}
                      >
                        <span>
                          {user.isUniversePublic === false || item.visibility === 'private'
                            ? '🔒 Privé'
                            : '🌍 Public'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void setActiveFlame({
                            id: item.id,
                            type: item.type,
                            url: item.url,
                            caption: item.caption,
                            duration: item.duration,
                            fileName: item.fileName,
                          })
                        }
                        title="Mettre en Flamme 24h sur mon profil (notifie mes amis 🔥)"
                        className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                          activeFlameValid?.id === item.id
                            ? 'text-orange-400 bg-orange-500/20 border border-orange-500/40'
                            : 'text-zinc-500 hover:text-orange-400 hover:bg-orange-500/15'
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={downloadingUniverseId === item.id}
                        onClick={() => void handleDownloadUniverseItem(item)}
                        aria-label="Enregistrer"
                        className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                          downloadedUniverseId === item.id
                            ? 'text-emerald-400 bg-emerald-500/15'
                            : 'text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                      >
                        {downloadingUniverseId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : downloadedUniverseId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await removeUniverseMedia(item.id);
                          } catch (err) {
                            showToast({
                              title: 'Erreur de suppression',
                              message:
                                err instanceof Error
                                  ? err.message
                                  : 'Impossible de supprimer ce média.',
                              type: 'warning',
                            });
                          }
                        }}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                        title="Supprimer de mon univers"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {item.type === 'photo' && (
                    <div className="w-full h-44 rounded-xl overflow-hidden bg-black border border-zinc-800">
                      <SmartPhotoWithMusic
                        src={item.url}
                        alt={item.caption || item.fileName || 'Photo Univers'}
                        bgMusic={item.bgMusic}
                        onClick={() => setZoomedPhoto(item.url)}
                        className="w-full h-full object-cover"
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
                        isMe={true}
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
                    <DocumentFileCard
                      file={item}
                      isDark={isDark}
                      compact={true}
                      onPreview={() => setPreviewFileModalItem(item)}
                    />
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
                    <p className={`text-xs line-clamp-2 text-center ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {item.caption}
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 3 : CANTINE DES CRÉATEURS, CLÉS, CADENAS, FLAMME, GRADES & BADGES  */}
      {/* ========================================================================= */}
      {activeSection === 'keys' && (
        <div className="space-y-4">
          {/* Cantine des Créateurs en pleine largeur */}
          <CantineCreatorsSection />

          {/* Flamme & Bouclier Cadenas */}
          <div
            className={`rounded-2xl p-4 border flex flex-col items-center text-center gap-3 ${
              isDark
                ? 'bg-transparent border-orange-500/40'
                : 'bg-orange-50/70 border-orange-300'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-11 h-11 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
              </div>
              <div>
                <div className="text-base font-black font-mono text-orange-600">
                  🔥 {formatDayOrdinal(user.detentionDays || user.streakDays || 1)} sur l&apos;app
                </div>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Score Rébellion : <strong className={isDark ? 'text-amber-400' : 'text-amber-700'}>{user.points || 0} pts</strong>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={protectStreakWithPadlock}
              className={`px-4 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                user.isStreakProtectedByPadlock
                  ? isDark
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : isDark
                  ? 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-500/40 text-indigo-300'
                  : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-300 text-indigo-800'
              }`}
            >
              <span>🔒</span>
              <span>
                {user.isStreakProtectedByPadlock
                  ? 'Flamme Cadenassée ✓'
                  : !hasFullKeyAccess
                  ? '10 🔑 requises'
                  : 'Cadenasser ma Flamme'}
              </span>
            </button>
          </div>

          {/* Grades Évolutifs (grille centrée) */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border space-y-3 text-center ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <div className="space-y-1">
              <span className="text-[11px] font-mono uppercase text-zinc-500">Grade Actuel</span>
              <h3 className="text-base font-black">
                {userRank.icon} {userRank.rank} — {userRank.title}
              </h3>
              <div className="flex items-center justify-center gap-2 font-mono text-xs flex-wrap">
                <span className="font-bold">{user.keysGivenTotal} clés offertes</span>
                <span aria-hidden="true">·</span>
                <span className={isDark ? 'text-amber-500' : 'text-amber-700 font-semibold'}>
                  {userRank.nextRank
                    ? `+${userRank.keysForNext} pour « ${userRank.nextRank} »`
                    : 'Grade Max 👑'}
                </span>
              </div>
            </div>

            <div className={`h-2 w-full max-w-md mx-auto rounded-full overflow-hidden ${isDark ? 'bg-zinc-950' : 'bg-zinc-200'}`}>
              <div
                style={{ width: `${userRank.progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-500"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-md mx-auto">
              {RANK_TIERS.map((tier) => {
                const reached = user.keysGivenTotal >= tier.min;
                const isCurrent = userRank.rank === tier.rank;
                return (
                  <div
                    key={tier.rank}
                    className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center ${
                      isCurrent
                        ? isDark
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                          : 'bg-amber-100 border-amber-400 text-amber-900 font-bold'
                        : reached
                        ? isDark
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : isDark
                        ? 'bg-zinc-950/60 border-zinc-800 text-zinc-500 opacity-60'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 opacity-80'
                    }`}
                  >
                    <span className="text-lg">{tier.icon}</span>
                    <span className="text-[11px] font-bold">{tier.rank}</span>
                    <span className="text-[10px] font-mono">{reached ? 'Acquis ✓' : tier.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Popularité & Aveux (centré) */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border space-y-3 text-center ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <div className="space-y-1">
              <h3 className="text-sm font-black flex items-center justify-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Clés &amp; Cadenas de mes Aveux</span>
              </h3>
              <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {myPosts.length} aveux · +{keysEarnedFromAveux} 🔑 · +{padlocksEarnedFromAveux} 🔒 ·{' '}
                {popularityScore} pts
              </p>
              <div className={`text-xs font-mono font-bold tabular-nums ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                Déblocage : {unlockProgressPercent}%
              </div>
            </div>

            {myPosts.length > 0 ? (
              <div
                className={
                  myPosts.length === 1
                    ? 'max-w-xs mx-auto w-full'
                    : 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
                }
              >
                {myPosts.slice(0, 12).map((mp) => (
                  <div
                    key={mp.id}
                    className={`p-3 rounded-xl border space-y-1.5 text-center ${
                      isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 text-[10px] font-mono">
                      <span className={`font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>#{mp.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        +{mp.keysCount} 🔑 · +{mp.padlocksSealCount || 1} 🔒
                      </span>
                    </div>
                    <p className="text-xs line-clamp-2">{mp.content || 'Aveu multimédia'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs font-mono text-zinc-500">
                Publie ton 1er aveu sur Le Mur pour accumuler Clés 🔑 et Cadenas 🔒.
              </div>
            )}
          </div>

          {/* Badges (grille centrée) */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border space-y-3 text-center ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Award className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
              <h3 className="text-sm font-bold">Badges de Résistance</h3>
              <span className={`text-xs font-mono tabular-nums ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                ({user.badges.length}/{ALL_BADGES.length})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {ALL_BADGES.map((badge) => {
                const isUnlocked = user.badges.some((b) => b.id === badge.id);
                return (
                  <div
                    key={badge.id}
                    className={`p-3 rounded-xl border space-y-1 text-center flex flex-col items-center ${
                      isUnlocked
                        ? isDark
                          ? 'bg-zinc-950 border-emerald-500/40'
                          : 'bg-emerald-50 border-emerald-300'
                        : isDark
                        ? 'bg-zinc-950/40 border-zinc-800 opacity-45'
                        : 'bg-zinc-50 border-zinc-200 opacity-65'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-xl">{badge.icon}</span>
                      {isUnlocked && (
                        <span className={`text-[10px] font-mono font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>Acquis ✓</span>
                      )}
                    </div>
                    <div className="text-xs font-bold truncate w-full">{badge.name}</div>
                    <p className={`text-[10px] line-clamp-2 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>{badge.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 4 : PARTAGE, THÈME, NOTIFS & RÉGLAGES (CENTRÉ)                    */}
      {/* ========================================================================= */}
      {activeSection === 'settings' && (
        <div className="space-y-4">
          {/* Parrainage & Story */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border space-y-3.5 text-center ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-bold">Parrainage &amp; Partage Réseaux</h3>
              </div>
              <span className="text-xs font-mono text-amber-400 tabular-nums">
                {user.referralsCount}/3 invités
              </span>
            </div>

            {/* Sécurité Anti-Piratage : Mot de passe + Coffre-Fort séparé (aucune donnée sensible dans la vue profil) */}
            <div
              className={`p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-2 max-w-md mx-auto ${
                hasAccountPassword
                  ? isDark
                    ? 'bg-emerald-950/25 border-emerald-500/35'
                    : 'bg-emerald-50 border-emerald-300'
                  : isDark
                  ? 'bg-amber-950/25 border-amber-500/40'
                  : 'bg-amber-50 border-amber-300'
              }`}
            >
              <div className="flex items-center gap-2 text-left">
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 ${
                    hasAccountPassword ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                />
                <div>
                  <div className="text-xs font-bold">
                    {hasAccountPassword ? 'Compte protégé par mot de passe 🛡️' : 'Mot de passe recommandé ⚠️'}
                  </div>
                  <div className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Tes codes USR &amp; Évasion sont masqués du profil par sécurité.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openPasswordSettings(hasAccountPassword ? 'change' : 'auto')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer ${
                    isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                  }`}
                >
                  <KeyRound className="w-3 h-3 text-amber-400" />
                  <span>{hasAccountPassword ? 'Modifier' : 'Définir'}</span>
                </button>
                <button
                  type="button"
                  onClick={openAuthModal}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Lock className="w-3 h-3" />
                  <span>Coffre Codes</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto">
              <button
                type="button"
                onClick={openWallStoryModal}
                className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shrink-0 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Story 9:16</span>
              </button>
              <button
                type="button"
                onClick={() => openShop()}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold shrink-0 cursor-pointer"
              >
                🪙 Boutique
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className={`px-3.5 py-2 rounded-xl border text-xs font-bold shrink-0 cursor-pointer flex items-center justify-center gap-1.5 ${
                  isDark ? 'bg-zinc-950 border-zinc-800 text-amber-400' : 'bg-zinc-100 border-zinc-300 text-zinc-900'
                }`}
              >
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{isDark ? 'Mode Jour' : 'Mode Nuit'}</span>
              </button>
            </div>

            <form onSubmit={handleApplyFriendCode} className="flex gap-2 max-w-md mx-auto">
              <input
                type="text"
                placeholder="Code parrain d'un ami..."
                value={friendCodeInput}
                onChange={(e) => setFriendCodeInput(e.target.value)}
                className={`flex-1 min-w-0 text-center rounded-xl px-3 py-2 text-xs font-mono uppercase border ${
                  isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                }`}
              />
              <button
                type="submit"
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer shrink-0 ${
                  isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                }`}
              >
                Valider
              </button>
            </form>
            {referralFeedback && (
              <div
                className={`text-xs p-2 rounded-lg font-mono max-w-md mx-auto ${
                  referralFeedback.success
                    ? isDark
                      ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/60'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                    : isDark
                    ? 'bg-red-950/50 text-red-300 border border-red-800/60'
                    : 'bg-red-50 text-red-800 border border-red-300'
                }`}
              >
                {referralFeedback.msg}
              </div>
            )}
          </div>

          {/* Notifications Téléphone & PWA */}
          <PhoneNotificationPanel
            authToken={authToken}
            theme={theme}
            onToast={showToast}
          />

          {/* Rotation Annuelle (grille centrée 3 colonnes sans coupure) */}
          <div
            className={`rounded-2xl p-4 border space-y-3 text-center ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-center gap-3 text-xs font-mono flex-wrap">
              <span className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-indigo-400' : 'text-indigo-700'}`}>
                <Calendar className="w-4 h-4" />
                <span>Éditions Annuelles</span>
              </span>
              <span className={isDark ? 'text-amber-400' : 'text-amber-700 font-bold'}>⏳ {getYearlyTheme().daysUntilNextYear}j</span>
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
              {Object.values(YEARLY_THEMES).map((th) => {
                const isCurrent = th.year === new Date().getFullYear();
                return (
                  <div
                    key={th.year}
                    className={`p-2 rounded-xl border text-center ${
                      isCurrent
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : isDark
                        ? 'border-zinc-800 bg-zinc-950/60 opacity-75'
                        : 'border-zinc-200 bg-zinc-50 opacity-90'
                    }`}
                  >
                    <div
                      className={`h-8 rounded-lg bg-gradient-to-br ${th.accentColor} flex items-center justify-center font-mono text-xs font-black text-white mb-1.5`}
                    >
                      {th.year}
                    </div>
                    <div className="text-[11px] font-bold truncate">{th.title}</div>
                    <div className={`text-[9px] truncate ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>{th.tagline}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Légal, Contact & Retour Démarrage (grille centrée 2x2) */}
          <div
            className={`rounded-2xl p-4 border ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto">
              <button
                type="button"
                onClick={() => setLegalModalTab('privacy')}
                className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-mono flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
                    : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-300 text-zinc-800'
                }`}
              >
                <Shield className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <span className="truncate">Confidentialité</span>
              </button>
              <button
                type="button"
                onClick={() => setLegalModalTab('cgv')}
                className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-mono flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
                    : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-300 text-zinc-800'
                }`}
              >
                <Scale className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                <span className="truncate">CGV / CGU</span>
              </button>
              <a
                href="https://wa.me/33684242949?text=Bonjour%20Digital%20Agency%2C%20je%20vous%20contacte%20depuis%20l%27application%20%C3%89VASION."
                target="_blank"
                rel="noopener noreferrer"
                className={`min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 ${
                  onBackToLanding ? '' : 'col-span-2'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Support WhatsApp</span>
              </a>

              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-mono flex items-center justify-center cursor-pointer ${
                    isDark
                      ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
                      : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-300 text-zinc-700 hover:text-zinc-950'
                  }`}
                >
                  <span className="truncate">← Accueil</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  await logoutAccount();
                  if (onBackToLanding) onBackToLanding();
                }}
                className="col-span-2 min-h-[40px] px-3 py-2 rounded-xl border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>Se déconnecter ({authAccount?.email || user.alias})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Studio Modal for Mon Univers */}
      <VideoStudioModal
        isOpen={isVideoStudioOpen}
        onClose={() => setIsVideoStudioOpen(false)}
        maxSeconds={60}
        onVideoReady={async (video) => {
          try {
            if (universeFilter !== 'all' && universeFilter !== 'video') {
              setUniverseFilter('all');
            }
            const cap = universeCaption.trim() || undefined;
            if (cap) setUniverseCaption('');
            const trackAttached = mediaBgMusic;
            if (mediaBgMusic) setMediaBgMusic(null);
            setActiveUploadsCount((c) => c + 1);
            await addUniverseMedia({
              type: 'video',
              url: video.videoUrl,
              duration: video.duration,
              caption: cap,
              visibility: newMediaVisibility,
              bgMusic: trackAttached || undefined,
            });
          } catch (err) {
            showToast({
              title: 'Erreur vidéo',
              message: err instanceof Error ? err.message : "Impossible d'ajouter cette vidéo.",
              type: 'warning',
            });
          } finally {
            setActiveUploadsCount((c) => Math.max(0, c - 1));
          }
        }}
      />

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

      {legalModalTab && (
        <LegalPrivacyModal
          isOpen={true}
          initialTab={legalModalTab}
          onClose={() => setLegalModalTab(null)}
        />
      )}

      {/* Modal Édition Profil sans quitter ni faire sauter Mon Univers */}
      {isEditing && (
        <div
          className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsEditing(false)}
        >
          <form
            onSubmit={handleSaveProfile}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xl max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border overflow-hidden shadow-2xl ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            {/* Header sticky */}
            <div
              className={`shrink-0 px-4 py-3 border-b flex items-center justify-between gap-2 ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="min-w-0">
                <h3 className="text-sm font-black truncate">
                  ✏️ Éditer Profil &amp; Identité Réseau
                </h3>
                <p className="text-[11px] text-zinc-400 truncate">
                  Tes médias Mon Univers restent intacts en arrière-plan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                  isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700'
                }`}
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-5">
              {/* Champs Identité : Pseudonyme & Bio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                    <label htmlFor="profile-alias-input">Pseudonyme</label>
                    <span className="tabular-nums">{aliasInput.length}/32</span>
                  </div>
                  <input
                    id="profile-alias-input"
                    type="text"
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    maxLength={32}
                    placeholder="Ton pseudo sur le réseau..."
                    className={`w-full rounded-xl px-3.5 py-2.5 text-sm border focus:outline-none focus:border-amber-500 ${
                      isDark
                        ? 'bg-zinc-950 border-zinc-800 text-white'
                        : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                    <label htmlFor="profile-bio-input">Bio personnelle</label>
                    <span className="tabular-nums">{bioInput.length}/240</span>
                  </div>
                  <textarea
                    id="profile-bio-input"
                    rows={2}
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    maxLength={240}
                    placeholder="Décris ton état d'esprit, ton combat ou ton univers..."
                    className={`w-full rounded-xl px-3.5 py-2 text-xs sm:text-sm border resize-none focus:outline-none focus:border-amber-500 ${
                      isDark
                        ? 'bg-zinc-950 border-zinc-800 text-white'
                        : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                    }`}
                  />
                </div>
              </div>

              {/* Sélecteur Avatar centré */}
              <div className="space-y-2.5 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  <span className="text-xs font-mono text-zinc-400">
                    Avatar (symbole ou photo de ton appareil)
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={isUploadingAvatar}
                      onClick={() => avatarPhotoInputRef.current?.click()}
                      className={`px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                        isDark
                          ? 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-400/40 text-sky-300'
                          : 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800'
                      }`}
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{isUploadingAvatar ? 'Envoi...' : 'Importer une photo'}</span>
                    </button>
                    {typeof avatarInput === 'string' && avatarInput.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveAvatar()}
                        className={`px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                          isDark
                            ? 'bg-red-500/15 hover:bg-red-500/25 border-red-500/40 text-red-300'
                            : 'bg-red-50 hover:bg-red-100 border-red-300 text-red-700'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer la photo</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 py-1">
                  {AVATARS.map((av) => (
                    <button
                      type="button"
                      key={av}
                      onClick={() => {
                        setAvatarInput(av);
                        commitPendingProfileEdits(av);
                      }}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border shrink-0 transition-all cursor-pointer ${
                        avatarInput === av
                          ? 'bg-red-500/20 border-red-500 text-white scale-105'
                          : isDark
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mention à côté du profil : Particulier / Professionnel & Profil Vérifié (Google) */}
              <div className="space-y-3 pt-2 border-t border-zinc-800/80 text-center">
                <div className="flex flex-col items-center justify-center gap-1">
                  <span className="text-xs font-mono font-bold flex items-center justify-center gap-1.5 text-sky-400">
                    <BadgeCheck className="w-4 h-4 text-sky-400" />
                    <span>Mention à côté du profil · Vérifié &amp; Statut</span>
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    Affiché directement à côté de ton pseudo sur ton profil, Le Mur et tes Flammes.
                  </p>
                </div>

                {/* Choix Particulier / Professionnel */}
                <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                  <button
                    type="button"
                    onClick={() => void updateProfileStatus({ profileType: 'personal' })}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      (user.profileType || 'personal') === 'personal'
                        ? 'bg-zinc-800 border-zinc-500 text-white shadow-sm'
                        : isDark
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Particulier</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateProfileStatus({ profileType: 'professional' })}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      user.profileType === 'professional'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                        : isDark
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Professionnel</span>
                  </button>
                </div>

                {/* Badge Profil Vérifié automatique par Google */}
                <div
                  className={`max-w-md mx-auto p-3 rounded-2xl border text-left flex items-center justify-between gap-3 ${
                    isUserVerified
                      ? 'bg-sky-500/10 border-sky-400/40'
                      : isDark
                      ? 'bg-zinc-950 border-zinc-800'
                      : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isUserVerified ? 'bg-sky-500/20 text-sky-400' : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      <BadgeCheck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black flex items-center gap-1.5 flex-wrap">
                        <span className={isUserVerified ? 'text-sky-300' : isDark ? 'text-zinc-200' : 'text-zinc-800'}>
                          {isUserVerified ? 'Profil Vérifié via Google ✓' : 'Profil non vérifié'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-snug">
                        {isUserVerified
                          ? `La mention « Vérifié » est active à côté de ton pseudo (${authAccount?.email || 'Google'}).`
                          : 'Connecte-toi avec Google pour obtenir automatiquement la mention « Vérifié » à côté de ton profil.'}
                      </p>
                    </div>
                  </div>
                  {!isUserVerified && (
                    <button
                      type="button"
                      onClick={() => setShowGoogleModal(true)}
                      className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 font-black text-[11px] shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <span>Synchroniser</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sélecteurs Aura de Pseudo & Style de Message centrés */}
              <div className="space-y-2.5 pt-2 border-t border-zinc-800/80 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  <span className="text-xs font-mono font-bold flex items-center justify-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Tester Aura de Pseudo &amp; Style de Message</span>
                  </span>
                  {hasNeonChanged && (
                    <button
                      type="button"
                      onClick={() =>
                        buyNeonPack(
                          pickedNeon,
                          pickedFrame === 'none' ? 'neon' : pickedFrame
                        )
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-mono font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>
                        {isMasterPassUser(user)
                          ? 'Activer ce Style (0 €)'
                          : 'Débloquer ce Style (0,50 €)'}
                      </span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1.5 pb-0.5">
                  {NEON_PALETTE.map((col) => {
                    const isPicked = pickedNeon === col.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => {
                          setPickedNeon(col.id);
                          if (pickedFrame === 'none') setPickedFrame('neon');
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                          isPicked
                            ? `${col.borderClass} ${col.bgClass} ${
                                theme === 'light' ? col.textLightClass : col.textClass
                              } font-bold`
                            : isDark
                            ? 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${col.dotClass}`} />
                        <span>{col.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1.5 pb-0.5">
                  {CELL_FRAME_OPTIONS.map((fr) => {
                    const isPicked = pickedFrame === fr.id;
                    return (
                      <button
                        key={fr.id}
                        type="button"
                        onClick={() => setPickedFrame(fr.id)}
                        className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                          isPicked
                            ? isDark
                              ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300 font-bold'
                              : 'border-cyan-600 bg-cyan-50 text-cyan-700 font-bold'
                            : isDark
                            ? 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        {fr.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PRÉVISUALISATION EN TEMPS RÉEL SUR LE RÉSEAU */}
              <div className="space-y-2.5 pt-2 border-t border-zinc-800/80 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                    👁️ Prévisualisation temps réel sur le réseau
                  </span>
                  <input
                    type="text"
                    value={previewSampleText}
                    onChange={(e) => setPreviewSampleText(e.target.value)}
                    maxLength={100}
                    placeholder="Texte test..."
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono text-center w-full max-w-xs ${
                      isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  />
                </div>

                {/* Carrousel horizontal des 3 aperçus réseau */}
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                  {/* 1. Aperçu sur Le Mur */}
                  <div
                    className={`w-[285px] sm:w-[320px] shrink-0 snap-start rounded-2xl p-3.5 border space-y-2 text-left ${
                      isDark ? 'bg-zinc-950' : 'bg-zinc-50'
                    } ${getCellFrameClasses(pickedFrame, pickedNeon, theme)}`}
                  >
                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                      1 · Ton aspect sur Le Mur
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg overflow-hidden shrink-0 ${
                          isDark ? 'bg-zinc-900' : 'bg-white'
                        } ${getNeonAvatarRingClass(pickedNeon, theme)}`}
                      >
                        <AvatarDisplay avatar={avatarInput} alt={previewAlias} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-sm truncate ${getNeonTextClass(pickedNeon, theme)}`}>
                            {previewAlias}
                          </span>
                          <ProfileStatusBadges
                            isVerified={isUserVerified}
                            profileType={user.profileType || 'personal'}
                            showPersonalLabel
                            compact
                          />
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 truncate">
                          {previewHandle} · {user.matricule}
                        </div>
                      </div>
                    </div>
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      {previewSampleText || 'Ton aveu apparaîtra avec ce style.'}
                    </p>
                  </div>

                  {/* 2. Aperçu Bulle de Message (La Cour / MP) */}
                  <div
                    className={`w-[285px] sm:w-[320px] shrink-0 snap-start rounded-2xl p-3.5 border space-y-2 text-left ${
                      isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                      2 · Style de message (La Cour &amp; MP)
                    </div>
                    <div className="flex items-start gap-2">
                      <span
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm overflow-hidden shrink-0 ${
                          isDark ? 'bg-zinc-900' : 'bg-white'
                        } ${getNeonAvatarRingClass(pickedNeon, theme)}`}
                      >
                        <AvatarDisplay avatar={avatarInput} alt={previewAlias} />
                      </span>
                      <div
                        className={`flex-1 rounded-2xl rounded-tl-none p-2.5 border text-xs space-y-1 ${
                          isDark ? 'bg-zinc-900 text-zinc-100' : 'bg-white text-zinc-900'
                        } ${getCellFrameClasses(pickedFrame, pickedNeon, theme)}`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[11px] font-bold ${getNeonTextClass(pickedNeon, theme)}`}>
                            {previewAlias}
                          </span>
                          <ProfileStatusBadges
                            isVerified={isUserVerified}
                            profileType={user.profileType || 'personal'}
                            compact
                          />
                        </div>
                        <p className="leading-snug">
                          {previewSampleText || 'Salut la cour, force à tous !'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 3. Aperçu Carte Publique (Bio + Clés & Cadenas) */}
                  <div
                    className={`w-[270px] sm:w-[300px] shrink-0 snap-start rounded-2xl p-3.5 border space-y-2 text-left ${
                      isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                      3 · À l&apos;appui sur ton pseudo
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg overflow-hidden shrink-0 ${
                          isDark ? 'bg-zinc-900' : 'bg-white'
                        } ${getNeonAvatarRingClass(pickedNeon, theme)}`}
                      >
                        <AvatarDisplay avatar={avatarInput} alt={previewAlias} />
                      </span>
                      <div className="min-w-0">
                        <div className={`text-sm truncate ${getNeonTextClass(pickedNeon, theme)}`}>
                          {previewAlias}
                        </div>
                        <div className="text-[11px] font-mono text-amber-400 tabular-nums">
                          {user.keysAvailable} 🔑 · {user.padlocksAvailable ?? 0} 🔒
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-2">
                      {previewBio || 'Ta bio personnelle apparaîtra ici.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer sticky actions */}
            <div
              className={`shrink-0 px-4 py-3 border-t flex items-center justify-center gap-2.5 flex-wrap ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-black text-xs cursor-pointer shadow-md"
              >
                Enregistrer Identité &amp; Bio
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className={`px-4 py-2.5 rounded-xl font-mono text-xs cursor-pointer ${
                  isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
                }`}
              >
                Fermer
              </button>
            </div>
          </form>
        </div>
      )}
      {previewFileModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className={`relative w-full max-w-lg border rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 ${
            isDark ? 'bg-[#120d0d] border-[#ef4444]/35 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold truncate">
                    {previewFileModalItem.fileName || 'Aperçu du fichier'}
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-400">
                    {previewFileModalItem.fileSize ? formatFileSizeMo(previewFileModalItem.fileSize) : 'Document joint'} · {new Date(previewFileModalItem.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFileModalItem(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer bg-white/5 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File preview / ObjectURL card */}
            <div className={`p-4 rounded-2xl border max-h-[60vh] overflow-y-auto space-y-3 ${
              isDark ? 'bg-black/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}>
              {(previewFileModalItem.mimeType?.startsWith('image/') ||
                /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(previewFileModalItem.fileName || '')) && (
                <div className="flex flex-col items-center gap-3">
                  <SmartImage
                    src={previewFileModalItem.url}
                    alt={previewFileModalItem.fileName || 'Aperçu'}
                    className="max-h-64 rounded-xl object-contain mx-auto"
                  />
                </div>
              )}

              <DocumentFileCard file={previewFileModalItem} isDark={isDark} />

              {previewFileModalItem.caption && (
                <div className="mt-3 pt-3 border-t border-white/10 text-xs text-zinc-300 italic">
                  « {previewFileModalItem.caption} »
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleDownloadUniverseItem(previewFileModalItem)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger le fichier</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewFileModalItem(null)}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs cursor-pointer ${
                  isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
                }`}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      <PasswordUnlockModal
        isOpen={passwordModalState.open}
        initialMode={passwordModalState.mode}
        onClose={() => setPasswordModalState({ open: false, mode: 'auto' })}
        onUnlocked={() => {
          passwordModalState.afterUnlock?.();
        }}
      />
      <PointsExchangeModal
        isOpen={isPointsModalOpen}
        onClose={() => setIsPointsModalOpen(false)}
      />
      <FlameComposerModal
        isOpen={isFlameComposerOpen}
        onClose={() => setIsFlameComposerOpen(false)}
      />
      {activeFlameValid && (
        <FlameViewerModal
          isOpen={isFlameViewerOpen}
          onClose={() => setIsFlameViewerOpen(false)}
          flame={activeFlameValid}
          owner={{
            id: user.id,
            matricule: user.matricule,
            alias: user.alias,
            avatar: user.avatar,
            neonColor: user.neonColor,
            isVerified: isUserVerified,
            profileType: user.profileType || 'personal',
            detentionDays: user.detentionDays,
          }}
          isOwnProfile={true}
          onOpenComposer={() => setIsFlameComposerOpen(true)}
        />
      )}

      {/* Profile Background Music Picker Modal */}
      <DeezerMusicPickerModal
        isOpen={isProfileMusicPickerOpen}
        onClose={() => setIsProfileMusicPickerOpen(false)}
        selectedTrack={user.profileMusic}
        onSelectTrack={(track) => void setProfileMusic(track)}
        title="Musique de profil"
        subtitle="Choisis une musique de fond pour accueillir les visiteurs de ton profil"
      />

      {/* Univers Media Background Music Picker Modal */}
      <DeezerMusicPickerModal
        isOpen={isMediaMusicPickerOpen}
        onClose={() => setIsMediaMusicPickerOpen(false)}
        selectedTrack={mediaBgMusic}
        onSelectTrack={(track) => setMediaBgMusic(track)}
        title="Fond sonore média"
        subtitle="Choisis une musique pour accompagner tes photos et vidéos dans ton Univers"
      />

      {/* Modal Google Sign-In direct pour la vérification de profil */}
      <GoogleSignInModal
        isOpen={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
      />
    </div>
  );
};
