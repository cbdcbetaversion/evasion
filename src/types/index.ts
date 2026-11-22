export type PostCategory = 'ecrans' | 'routine' | 'pression' | 'procrastination' | 'burnout' | 'solitude';

export interface UserBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: number;
}

export type AppTheme = 'dark' | 'light';
export type NeonColor = 'emerald' | 'red' | 'gold' | 'cyan' | 'purple' | 'pink';
export type CellFrame = 'none' | 'gold' | 'titanium' | 'neon' | 'hologram';

export type UniverseMediaType = 'photo' | 'audio' | 'video' | 'file';

export interface ProfileUniverseItem {
  id: string;
  type: UniverseMediaType;
  url: string;
  caption?: string;
  duration?: number;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  keysCount?: number;
  padlocksCount?: number;
  visibility?: 'public' | 'private';
  bgMusic?: DeezerTrack;
  createdAt: number;
}

export interface PublicUserProfile {
  id: string;
  matricule: string;
  alias: string;
  avatar: string;
  bio?: string;
  cellNumber?: string;
  publicShareSlug?: string;
  detentionDays: number;
  keysAvailable: number;
  keysGivenTotal: number;
  padlocksAvailable: number;
  escapedCount: number;
  points: number;
  isVipCell: boolean;
  neonColor?: NeonColor;
  cellBorderFrame?: CellFrame;
  badges: UserBadge[];
  universeMedia: ProfileUniverseItem[];
  activeFlame?: ActiveFlameItem;
  isUniversePublic?: boolean;
  universeStorageQuota?: number;
  isUniverseStorageUnlimited?: boolean;
  profileType?: 'personal' | 'professional';
  isVerified?: boolean;
  activeLiveId?: string;
  postsCount?: number;
  totalPostKeys?: number;
  totalPostPadlocks?: number;
  profileMusic?: DeezerTrack;
}

export interface FriendEntry {
  id: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: NeonColor;
  cellBorderFrame?: CellFrame;
  isVerified?: boolean;
  profileType?: 'personal' | 'professional';
  activeFlame?: ActiveFlameItem;
  addedAt: number;
}

export interface FriendRequestEntry {
  id: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: NeonColor;
  requestedAt: number;
}

export interface FlameComment {
  id: string;
  authorId: string;
  authorMatricule: string;
  authorAlias: string;
  authorAvatar: string;
  authorNeonColor?: NeonColor;
  authorIsVerified?: boolean;
  content: string;
  giftType?: string;
  createdAt: number;
}

export interface DeezerTrack {
  id: number | string;
  title: string;
  titleShort?: string;
  artist: string;
  cover?: string;
  audioUrl?: string;
  artistPicture?: string;
  albumTitle?: string;
  albumCover?: string;
  previewUrl: string;
  duration?: number;
}

export type MusicTrack = DeezerTrack;

export interface ActiveFlameItem {
  id: string;
  type: 'text' | 'photo' | 'audio' | 'video' | 'file';
  url?: string;
  text?: string;
  caption?: string;
  bgGradient?: string;
  duration?: number;
  fileName?: string;
  createdAt: number;
  expiresAt: number;
  comments?: FlameComment[];
  bgMusic?: DeezerTrack;
}

export interface UserProfile {
  id: string;
  matricule: string; // e.g. "Détenu #842"
  alias: string;
  avatar: string;
  bio?: string;
  universeMedia?: ProfileUniverseItem[];
  activeFlame?: ActiveFlameItem;
  profileMusic?: DeezerTrack;
  isUniversePublic?: boolean;
  universeStorageQuota?: number;
  isUniverseStorageUnlimited?: boolean;
  friends?: FriendEntry[];
  friendRequestsIncoming?: FriendRequestEntry[];
  friendRequestsOutgoing?: FriendRequestEntry[];
  cellNumber: string;
  detentionDays: number;
  keysAvailable: number; // Keys the user can give to others
  escapedCount: number; // Number of user's posts that escaped
  keysGivenTotal: number;
  badges: UserBadge[];
  referralCode: string;
  referralsCount: number;
  isVipCell: boolean;
  neonColor?: NeonColor;
  cellBorderFrame?: CellFrame;
  isVipSubscriber?: boolean;
  vipSubscriptionExpiresAt?: number;
  purchasedKits?: string[];
  hasPassePartoutCount?: number;
  streakDays: number; // Compteur de jours passés sur l'app (Flammes 🔥)
  firstJoinedDate?: string; // Date d'arrivée initiale 'YYYY-MM-DD'
  lastActiveDate: string; // 'YYYY-MM-DD'
  points: number; // Points de rébellion
  completedMissionsCount: number;
  dailyMissionCompletedDate?: string;
  padlocksAvailable: number; // Cadenas disponibles pour verrouiller tentations, protéger ses flammes ou sceller un pacte
  heartsAvailable?: number;
  iceConesAvailable?: number;
  waterBottlesAvailable?: number;
  cansAvailable?: number;
  isStreakProtectedByPadlock?: boolean; // Bouclier de Flamme actif jusqu'à minuit
  lockedTemptations?: string[]; // Tentations IRL verrouillées par un cadenas aujourd'hui
  lastMidnightResetDate?: string; // Date 'YYYY-MM-DD' de la dernière mise à jour de minuit
  screenTimeSavedMinutes?: number; // Minutes réelles épargnées du scroll toxique des réseaux
  hasAccountPassword?: boolean; // Indique si un mot de passe personnel protège le compte
  publicShareSlug?: string; // Identifiant opaque public ex: profil-anonyme-k7m2x9 (jamais d'USR dans l'URL)
  profileType?: 'personal' | 'professional';
  isVerified?: boolean;
  supabaseUserId?: string;
}

export interface AuthAccountInfo {
  id: string;
  username: string;
  email?: string | null;
  hasPassword?: boolean;
  supabaseUserId?: string;
  profile: UserProfile;
}

export interface CheckoutItemRequest {
  id: string;
  name: string;
  tagline: string;
  price?: string;
  priceLabel: string;
  amount: number;
  icon: string;
  type:
    | 'keys_pack'
    | 'pack_keys'
    | 'passe_partout'
    | 'neon_pack'
    | 'neon_style'
    | 'vip_sub'
    | 'kit'
    | 'digital_kit'
    | 'storage_pack';
  keys?: number;
  padlocks?: number;
  storageSlots?: number;
  isStorageUnlimited?: boolean;
  isVip?: boolean;
  postId?: string;
  targetPostId?: string;
  neonColor?: NeonColor;
  cellFrame?: CellFrame;
  kitId?: string;
}

export type UserRank = 'Nouveau' | 'Complice' | 'Cerveau' | 'Libéré';

export interface RankInfo {
  rank: UserRank;
  title: string;
  icon: string;
  minKeys: number;
  nextRank: UserRank | null;
  keysForNext: number;
  progressPercent: number;
  color: string;
  badgeBg: string;
  description: string;
}

export interface DailyMission {
  id: string;
  title: string;
  description: string;
  realLifeAction: string;
  icon: string;
  keysReward: number;
  pointsReward: number;
}

export interface AttachedFileMeta {
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorMatricule: string;
  authorAlias?: string;
  authorAvatar: string;
  authorNeonColor?: NeonColor;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  attachedFile?: AttachedFileMeta;
  audioNote?: {
    duration: number; // in seconds (court: 60s max)
    audioData?: string; // idb://, blob:, or /api/media/ URL
  };
  createdAt: number;
}

export interface ConfessionPost {
  id: string;
  authorId: string;
  authorMatricule: string;
  authorAlias: string;
  authorAvatar: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  attachedFile?: AttachedFileMeta;
  category: PostCategory;
  createdAt: number;
  keysCount: number;
  keysRequired: number; // 3, 5, 7, or 10 keys to liberate the inmate
  padlocksSealCount?: number; // Cadenas de solidarité / pacte scellé sur cet aveu
  sealedByMe?: boolean;
  status: 'locked' | 'escaped';
  escapedAt?: number;
  givenByMe: boolean;
  isPinned?: boolean;
  pinnedUntil?: number;
  instantEscaped?: boolean;
  hasGoldBadge?: boolean;
  authorNeonColor?: NeonColor;
  authorFrame?: CellFrame;
  audioNote?: {
    duration: number; // in seconds
    hasVoiceFilter: boolean;
    audioData?: string; // idb://, blob:, or /api/media/ URL
  };
  keyDonors: string[]; // List of matricules who contributed
  comments?: PostComment[];
  bgMusic?: DeezerTrack;
}

export type LiveGiftKind = 'key_gift' | 'padlock' | 'ice_cone' | 'water_bottle' | 'canned_food';

export interface LiveComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  type?: 'chat' | LiveGiftKind | 'system';
  timestamp: number;
}

export interface LiveGuestParticipant {
  userId: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: NeonColor;
  frame?: CellFrame;
  camEnabled: boolean;
  micEnabled: boolean;
  joinedAt: number;
}

export interface LiveGuestRequest {
  userId: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: NeonColor;
  requestedAt: number;
}

export interface LiveViewerParticipant {
  userId: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: NeonColor;
  joinedAt: number;
}

export interface LivePendingInvite {
  targetUserId: string;
  targetName: string;
  mode: 'viewer' | 'cohost';
  invitedAt: number;
}

export interface LiveInvitePayload {
  id: string;
  liveId: string;
  liveTitle: string;
  topicTag: string;
  fromUserId: string;
  fromName: string;
  fromAvatar: string;
  targetUserId: string; // specific user id or 'ALL'
  mode: 'viewer' | 'cohost';
  createdAt: number;
}

export interface OnlineUserPresence {
  id: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: NeonColor;
  cellBorderFrame?: CellFrame;
  isVerified?: boolean;
  profileType?: 'personal' | 'professional';
  hasActiveFlame?: boolean;
  activeLiveId?: string;
  isCoHost?: boolean;
  connectedAt: number;
}

export interface LiveSession {
  id: string;
  hostId: string;
  hostName: string;
  hostMatricule: string;
  hostAvatar: string;
  hostNeonColor?: NeonColor;
  hostFrame?: CellFrame;
  title: string;
  topicTag: string;
  startedAt: number;
  viewersCount: number;
  likesCount: number;
  keysReceived: number;
  padlocksReceived: number;
  iceConesReceived?: number;
  waterBottlesReceived?: number;
  cansReceived?: number;
  isActive: boolean;
  filter?: 'none' | 'neon' | 'mono' | 'warm';
  pinnedAnnouncement?: string;
  guests?: LiveGuestParticipant[];
  pendingInvites?: LivePendingInvite[];
  guestRequests?: LiveGuestRequest[];
  activeViewers?: LiveViewerParticipant[];
  blockedUserIds?: string[];
  comments: LiveComment[];
}

export interface CustomSalon {
  id: string;
  tag: string; // e.g. "#Sport"
  name: string; // e.g. "Sport & Énergie"
  description?: string;
  createdBy: string;
  createdAt: number;
}

export interface DirectChatTarget {
  id?: string;
  matricule: string;
  alias?: string;
  avatar: string;
  neonColor?: NeonColor;
  readOnlyFromUrl?: boolean;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorMatricule: string;
  authorAvatar: string;
  content: string;
  timestamp: number;
  isSystem?: boolean;
  isVip?: boolean;
  neonColor?: NeonColor;
  channel?: string;
  recipientId?: string;
  recipientMatricule?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  audioNote?: {
    duration: number;
    audioData: string;
  };
}

export interface DetoxSession {
  isActive: boolean;
  durationMinutes: number;
  startedAt: number | null;
  targetEndTime: number | null;
  ambientSound: boolean;
  soundscape?: '432hz' | 'silence';
}

export interface ToastNotification {
  id: string;
  title: string;
  message?: string;
  icon?: string;
  type?: 'success' | 'key' | 'warning' | 'info';
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface KitChapter {
  title: string;
  points: string[];
  keyTakeaway: string;
}

export interface KitItem {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  amount: number;
  category: string;
  readingTime: string;
  icon: string;
  badge?: string;
  description: string;
  summary: string;
  chapters: KitChapter[];
}

export interface AffiliateResource {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  commissionRate: string;
  icon: string;
  url: string;
  description: string;
  features: string[];
}

export interface ViralVideoScript {
  id: string;
  title: string;
  targetViews: string;
  hook: string;
  visualConcept: string;
  voiceover: string;
  callToAction: string;
  hashtags: string[];
}

