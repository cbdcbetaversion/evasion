import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  ConfessionPost,
  PostComment,
  ChatMessage,
  UserProfile,
  AuthAccountInfo,
  PostCategory,
  DetoxSession,
  ToastNotification,
  NeonColor,
  CellFrame,
  KitItem,
  AppTheme,
  RankInfo,
  DailyMission,
  CheckoutItemRequest,
  CustomSalon,
  LiveSession,
  LiveComment,
  DirectChatTarget,
  OnlineUserPresence,
  LiveInvitePayload,
  ProfileUniverseItem,
  ActiveFlameItem,
  DeezerTrack,
  PublicUserProfile,
  FriendEntry,
  FriendRequestEntry,
  AttachedFileMeta,
} from '../types';
import {
  INITIAL_USER,
  createInitialUser,
  INITIAL_POSTS,
  ALL_BADGES,
  getUserRank,
  DAILY_MISSIONS,
} from '../data/initialData';
import { DIGITAL_KITS } from '../data/marketData';
import { soundEngine, resolveFreshTrackPreviewUrl, getPlayableDeezerUrl } from '../utils/audio';
import {
  signInWithGooglePopup,
  syncGoogleAuthLinkToFirestore,
} from '../firebase';
import {
  supabase,
  isSupabaseConfigured,
  signInWithGoogleSupabase,
  signInWithEmailPasswordSupabase,
  signUpWithEmailPasswordSupabase,
  signOutSupabase,
  getOrCreateSupabaseProfile,
  saveSupabaseProfilePatch,
  fetchSupabaseProfileById,
  saveProfileBackupToIdb,
  loadProfileBackupFromIdb,
  saveLatestProfileBackupToIdb,
  loadLatestProfileBackupFromIdb,
  clearLatestProfileBackupFromIdb,
  saveCloudProfileSnapshot,
  loadCloudProfileSnapshot,
  type SupabaseProfileRow,
} from '../utils/supabaseClient';
import {
  clearAllMediaBlobs,
  resolveMediaBlob,
  uploadMediaBlobForSync,
  uploadDataUrlForSync,
  saveDataUrlToBlobRef,
  revokeMediaUrlOrRef,
} from '../utils/mediaStore';
import { formatDayOrdinal } from '../utils/formatDays';
import { getNeonItem } from '../utils/neonStyles';
import {
  dispatchPhoneNotification,
  getNotificationPermission,
  getPhoneNotificationPrefs,
  initPWAAndServiceWorker,
  isStandalonePWA,
  syncPushSubscriptionWithServer,
} from '../utils/phoneNotifications';
import {
  loadOfflineQueue,
  loadOfflineQueueFromIdb,
  enqueueOfflineAction,
  removeOfflineAction,
  getManualOfflineMode,
  setManualOfflineModeStorage,
  type QueuedOfflineAction,
} from '../utils/offlineQueue';

const RESET_EPOCH_KEY = 'evasion_reset_epoch';
const CURRENT_RESET_EPOCH = 'reset_2026_11_14_zero_v5';
const AUTH_TOKEN_KEY = 'evasion_auth_token_v1';
const UNIVERSE_PENDING_STORAGE_KEY = 'evasion_universe_pending_v1';
export const BASE_FREE_UNIVERSE_QUOTA = 25;
const MAX_POSTS_IN_MEMORY = 10000;
const MAX_COMMENTS_PER_POST = 300;
const MAX_CHAT_IN_MEMORY = 300;
const MAX_LIVES_IN_MEMORY = 100;
const MAX_SALONS_IN_MEMORY = 100;

export type UniverseUploadState = 'uploading' | 'saved' | 'local_only' | 'quota_blocked';

const ALL_EVASION_STORAGE_KEYS = [
  'evasion_user',
  'evasion_auth_token_v1',
  'evasion_universe_pending_v1',
  'evasion_google_accounts_v1',
  'evasion_real_posts_v1',
  'evasion_posts',
  'evasion_chat',
  'evasion_detox',
  'evasion_active_lives_v1',
  'evasion_custom_salons',
  'evasion_last_read_inbox',
  'evasion_media_permission',
  'evasion_theme',
  'evasion_muted',
];

export function getDirectChannelId(userMatricule: string, targetMatricule: string): string {
  const normA = (userMatricule || '').trim().toLowerCase();
  const normB = (targetMatricule || '').trim().toLowerCase();
  return `dm_${[normA, normB].sort().join('__')}`;
}

function wipeAllEvasionStorage(): void {
  try {
    ALL_EVASION_STORAGE_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
  void clearAllMediaBlobs();
}

function ensureCleanResetEpoch(): void {
  try {
    if (localStorage.getItem(RESET_EPOCH_KEY) !== CURRENT_RESET_EPOCH) {
      wipeAllEvasionStorage();
      localStorage.setItem(RESET_EPOCH_KEY, CURRENT_RESET_EPOCH);
    }
  } catch {
    // ignore storage access errors
  }
}

ensureCleanResetEpoch();

function readStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

export const MIN_KEYS_FULL_ACCESS = 10;
export const LIVE_MIN_KEYS_REQUIRED = 50;

export function isMasterPassUser(user?: Partial<UserProfile> | null): boolean {
  if (!user) return false;
  const id = String(user.id || '').trim().toUpperCase();
  const alias = String(user.alias || '').trim().toUpperCase();
  const ref = String(user.referralCode || '').trim().toUpperCase();
  return id === 'USR_77260' || id === 'USR_TEST_2026' || alias === 'TEST_2026' || ref === 'TEST_2026';
}

export interface PlatformKeyStats {
  totalKeysSpent: number;
  totalKeysAvailable: number;
  totalPadlocksAvailable: number;
  totalPadlocksSealed: number;
  totalEscapes: number;
  totalPosts: number;
  timestamp?: number;
}

interface AppContextType {
  user: UserProfile;
  authAccount: AuthAccountInfo | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  registerAccount: (params: {
    username: string;
    email?: string;
    password: string;
    alias?: string;
    avatar?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  loginAccount: (
    identifier: string,
    password: string
  ) => Promise<{ success: boolean; requiresDisambiguation?: boolean; error?: string }>;
  logoutAccount: () => Promise<void>;
  enterFreshZeroSession: (customAlias?: string, customAvatar?: string) => Promise<void>;
  createProtectedAnonymousSession: (
    password?: string,
    avatar?: string
  ) => Promise<{ success: boolean; account?: AuthAccountInfo; error?: string }>;
  rotatePublicShareSlug: () => Promise<{ success: boolean; publicShareSlug?: string; error?: string }>;
  connectWithPseudo: (
    pseudo: string,
    avatar?: string,
    password?: string
  ) => Promise<{
    success: boolean;
    restored?: boolean;
    requiresPassword?: boolean;
    account?: AuthAccountInfo;
    error?: string;
  }>;
  connectWithGoogle: (params?: {
    password?: string;
  }) => Promise<{
    success: boolean;
    restored?: boolean;
    redirected?: boolean;
    requiresPassword?: boolean;
    account?: AuthAccountInfo;
    error?: string;
  }>;
  hasAccountPassword: boolean;
  isSensitiveCodesUnlocked: boolean;
  unlockSensitiveCodesWithPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  lockSensitiveCodes: () => void;
  setAccountPassword: (newPassword: string, currentPassword?: string) => Promise<{ success: boolean; error?: string }>;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  isNetworkOnline: boolean;
  manualOfflineMode: boolean;
  isOnlineMode: boolean;
  pendingSyncCount: number;
  isSyncingOfflineQueue: boolean;
  setManualOfflineMode: (offline: boolean) => void;
  toggleOnlineOfflineMode: () => void;
  syncOfflineQueueNow: (forceReconnect?: boolean) => Promise<void>;
  syncServerSession: (account: AuthAccountInfo | null, token?: string | null) => void;
  applyVerifiedServerPurchase: (params: {
    item: CheckoutItemRequest;
    methodLabel: string;
    profile?: UserProfile;
    post?: ConfessionPost | null;
    txId?: string;
  }) => void;
  userRank: RankInfo;
  dailyMission: DailyMission;
  isDailyMissionCompleted: boolean;
  completeDailyMission: () => void;
  posts: ConfessionPost[];
  chatMessages: ChatMessage[];
  authToken: string | null;
  detoxSession: DetoxSession;
  soundMuted: boolean;
  theme: AppTheme;
  toggleTheme: () => void;
  activeStoryPost: ConfessionPost | null;
  liberatedPostCelebration: ConfessionPost | null;
  onlineInmatesCount: number;
  toast: ToastNotification | null;
  showToast: (toast: Omit<ToastNotification, 'id'>) => void;
  hideToast: () => void;
  updateUserProfile: (alias: string, avatar: string | null, bio?: string, silent?: boolean) => void;
  removeUserAvatar: () => Promise<boolean>;
  updateProfileStatus: (params: { profileType?: 'personal' | 'professional' }) => Promise<void>;
  setActiveFlame: (payload: {
    id?: string;
    type: 'text' | 'photo' | 'audio' | 'video' | 'file';
    url?: string;
    text?: string;
    caption?: string;
    bgGradient?: string;
    duration?: number;
    fileName?: string;
    bgMusic?: DeezerTrack;
  }) => Promise<boolean>;
  removeActiveFlame: () => Promise<void>;
  commentOnFlame: (
    targetIdentifier: string,
    content: string,
    giftType?: string
  ) => Promise<{ success: boolean; activeFlame?: ActiveFlameItem; error?: string }>;
  addUniverseMedia: (item: {
    type: 'photo' | 'audio' | 'video' | 'file';
    url: string;
    caption?: string;
    duration?: number;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    visibility?: 'public' | 'private';
    bgMusic?: DeezerTrack;
  }) => Promise<ProfileUniverseItem | null>;
  removeUniverseMedia: (itemId: string) => Promise<void>;
  retryUniverseMediaUpload: (itemId: string) => Promise<void>;
  toggleUniversePublic: (isPublic: boolean, applyToAll?: boolean) => Promise<void>;
  setUniverseItemVisibility: (itemId: string, visibility: 'public' | 'private') => Promise<void>;
  setProfileMusic: (track: DeezerTrack | null) => Promise<boolean>;
  currentAmbientTrack: { id: string; track: DeezerTrack; isPlaying: boolean } | null;
  playAmbientTrack: (id: string, track: DeezerTrack) => void;
  pauseAmbientTrack: () => void;
  stopAmbientTrack: (sourceId?: string) => void;
  toggleAmbientTrack: (id: string, track: DeezerTrack) => void;
  universeUploadStatuses: Record<string, UniverseUploadState>;
  universeStorageInfo: {
    used: number;
    quota: number;
    isUnlimited: boolean;
    remaining: number;
    isFull: boolean;
  };
  giveKey: (postId: string) => boolean;
  revokeKey: (postId: string) => boolean;
  createPost: (
    content: string,
    category: PostCategory,
    audioNote?: { duration: number; hasVoiceFilter: boolean; audioData?: string },
    keysRequired?: number,
    imageUrl?: string,
    videoNote?: { videoUrl: string; duration: number },
    bgMusic?: DeezerTrack,
    attachedFile?: AttachedFileMeta
  ) => void;
  activeTagFilter: string | null;
  setActiveTagFilter: (tag: string | null) => void;
  customSalons: CustomSalon[];
  createCustomSalon: (nameOrTag: string, description?: string) => CustomSalon | null;
  activeLives: LiveSession[];
  startLiveSession: (title: string, topicTag: string, filter?: 'none' | 'neon' | 'mono' | 'warm') => LiveSession | null;
  endLiveSession: (liveId: string) => void;
  joinLiveSession: (liveId: string) => void;
  leaveLiveSession: (liveId: string) => void;
  updateLiveFilter: (liveId: string, filter: 'none' | 'neon' | 'mono' | 'warm') => void;
  sendLiveComment: (liveId: string, content: string) => void;
  sendLiveLike: (liveId: string) => void;
  sendLiveReaction: (liveId: string, emoji: string) => void;
  sendLiveKeyGift: (liveId: string) => boolean;
  sendLivePadlock: (liveId: string) => boolean;
  sendLiveSpecialGift: (liveId: string, giftType: 'ice_cone' | 'water_bottle' | 'canned_food') => boolean;
  redeemPoints: (
    rewardId: 'key_1' | 'padlock_1' | 'keys_3' | 'passe_partout' | 'memory_5' | 'vip_cell',
    validationCode?: string
  ) => Promise<{ success: boolean; error?: string }>;
  addCommentToPost: (
    postId: string,
    content: string,
    imageUrl?: string,
    audioNote?: { duration: number; audioData?: string },
    videoNote?: { videoUrl: string; duration: number },
    attachedFile?: AttachedFileMeta
  ) => void;
  sendChatMessage: (
    content: string,
    channel?: string,
    audioNote?: { duration: number; audioData: string },
    imageUrl?: string,
    videoNote?: { videoUrl: string; duration: number }
  ) => void;
  startDetox: (minutes: number, ambient: boolean, soundscape?: '432hz' | 'silence') => void;
  cancelDetox: () => void;
  completeDetox: () => void;
  openStoryModal: (post?: ConfessionPost | null) => void;
  openWallStoryModal: () => void;
  isWallStoryActive: boolean;
  closeStoryModal: () => void;
  closeLiberationCelebration: () => void;
  toggleSound: () => void;
  claimDailyBonusKeys: () => void;
  applyReferralCode: (code: string) => { success: boolean; message: string };
  simulatedVoiceAudio: (duration: number) => void;
  isShopOpen: boolean;
  checkoutItem: CheckoutItemRequest | null;
  openShop: (item?: CheckoutItemRequest) => void;
  closeShop: () => void;
  buyPassePartout: (postId?: string) => void;
  usePassePartoutOnPost: (postId: string) => boolean;
  buyNeonPack: (neonColor: NeonColor, cellFrame: CellFrame) => void;
  subscribeVip: () => void;
  buyKit: (kitId: string) => void;
  executeFreePassOrder: (item: CheckoutItemRequest) => Promise<boolean>;
  activeReadKit: KitItem | null;
  openKitReader: (kit: KitItem) => void;
  closeKitReader: () => void;
  sealPostWithPadlock: (postId: string) => boolean;
  protectStreakWithPadlock: () => boolean;
  lockRealLifeTemptation: (temptationLabel: string) => boolean;
  claimFreePadlock: () => void;
  triggerMidnightReset: (isManual?: boolean) => void;
  lastMidnightResetTime: number;
  simulationLevel: number;
  resetAllAppData: () => void;
  hasFullKeyAccess: boolean;
  requireFullKeyAccess: (actionName?: string) => boolean;
  directChatTarget: DirectChatTarget | null;
  openDirectChat: (target: DirectChatTarget) => void;
  closeDirectChat: () => void;
  sendDirectMessage: (
    content: string,
    audioNote?: { duration: number; audioData: string },
    imageUrl?: string,
    videoNote?: { videoUrl: string; duration: number }
  ) => void;
  availableInmates: DirectChatTarget[];
  searchInmates: (query: string) => Promise<DirectChatTarget[]>;
  userProfileTarget: DirectChatTarget | null;
  openUserProfile: (target: DirectChatTarget) => void;
  closeUserProfile: () => void;
  fetchPublicUserProfile: (identifier: string) => Promise<PublicUserProfile | null>;
  onlineUsers: OnlineUserPresence[];
  friends: FriendEntry[];
  incomingFriendRequests: FriendRequestEntry[];
  outgoingFriendRequests: FriendRequestEntry[];
  getFriendshipStatus: (target: { id?: string; matricule?: string }) => 'friend' | 'incoming' | 'outgoing' | 'none';
  sendFriendRequest: (target: DirectChatTarget) => Promise<{ success: boolean; status?: string; error?: string }>;
  acceptFriendRequest: (target: { id?: string; matricule?: string }) => Promise<boolean>;
  declineFriendRequest: (target: { id?: string; matricule?: string }) => Promise<boolean>;
  removeFriend: (target: { id?: string; matricule?: string }) => Promise<boolean>;
  getUserLiveSession: (userId?: string, matricule?: string) => LiveSession | undefined;
  requestedLiveId: string | null;
  autoJoinCoHostLiveId: string | null;
  requestOpenLive: (liveId: string, asCoHost?: boolean) => void;
  clearRequestedLive: () => void;
  incomingLiveInvite: LiveInvitePayload | null;
  dismissIncomingLiveInvite: () => void;
  sendLiveInvite: (
    liveId: string,
    target: { targetUserId?: string; targetMatricule?: string },
    mode: 'viewer' | 'cohost'
  ) => Promise<{ success: boolean; error?: string }>;
  respondToLiveInvite: (
    liveId: string,
    accept: boolean,
    media?: { camEnabled?: boolean; micEnabled?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  requestJoinLiveStage: (liveId: string) => Promise<{ success: boolean; error?: string }>;
  approveGuestStageRequest: (
    liveId: string,
    targetUserId: string,
    accept: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  removeOrLeaveLiveStage: (liveId: string, targetUserId?: string) => Promise<{ success: boolean; error?: string }>;
  updateLiveGuestMedia: (
    liveId: string,
    media: { camEnabled?: boolean; micEnabled?: boolean; targetUserId?: string }
  ) => Promise<void>;
  updateLiveAnnouncement: (liveId: string, pinnedAnnouncement: string) => Promise<void>;
  blockLiveViewer: (
    liveId: string,
    target: { targetUserId?: string; targetMatricule?: string; targetAlias?: string }
  ) => Promise<boolean>;
  joinLiveRtcRoom: (liveId: string, role: 'host' | 'guest' | 'viewer') => void;
  leaveLiveRtcRoom: (liveId?: string) => void;
  sendLiveRtcSignal: (
    liveId: string,
    targetUserId: string,
    signalType: string,
    data: unknown
  ) => void;
  sendLiveRelaySubscribe: (liveId: string, targetUserId: string) => void;
  sendLiveRelayUnsubscribe: (liveId: string, targetUserId: string) => void;
  sendLiveRelayMedia: (
    liveId: string,
    payload: {
      mediaKind: 'video' | 'audio';
      data: string;
      w?: number;
      h?: number;
      sampleRate?: number;
    }
  ) => boolean;
  onLiveRtcEvent: (listener: (event: { type: string; payload: any }) => void) => () => void;
  platformKeyStats: PlatformKeyStats;
  refreshPlatformKeyStats: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authAccount, setAuthAccount] = useState<AuthAccountInfo | null>(null);
  const authAccountRef = useRef<AuthAccountInfo | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const authTokenRef = useRef<string | null>(readStoredAuthToken());
  const [authTokenState, setAuthTokenState] = useState<string | null>(() => readStoredAuthToken());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    authAccountRef.current = authAccount;
  }, [authAccount]);

  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [manualOfflineMode, setManualOfflineModeState] = useState<boolean>(() =>
    getManualOfflineMode()
  );
  const isOnlineMode = isNetworkOnline && !manualOfflineMode;
  const isOnlineModeRef = useRef<boolean>(isOnlineMode);
  isOnlineModeRef.current = isOnlineMode;

  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() =>
    loadOfflineQueue().length
  );
  const [isSyncingOfflineQueue, setIsSyncingOfflineQueue] = useState<boolean>(false);
  const isSyncingQueueRef = useRef<boolean>(false);
  const pendingSupabaseSyncRef = useRef<boolean>(
    (() => {
      try {
        return typeof window !== 'undefined' && window.localStorage.getItem('evasion_pending_sb_sync_v1') === '1';
      } catch {
        return false;
      }
    })()
  );

  useEffect(() => {
    const onOnline = () => setIsNetworkOnline(true);
    const onOffline = () => setIsNetworkOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void loadOfflineQueueFromIdb().then((items) => {
      setPendingSyncCount(items.length);
    });
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const parseJsonSafe = useCallback(async <T,>(res: Response): Promise<T | null> => {
    try {
      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }, []);

  const authFetch = useCallback((input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers || {});
    const safeToken = (authTokenRef.current || '').replace(/[^\x20-\x7E]/g, '').trim();
    if (safeToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${safeToken}`);
    }
    const activeUid = (userIdRef.current || userLatestRef.current?.id || '')
      .replace(/[^\x20-\x7E]/g, '')
      .trim();
    if (activeUid && !headers.has('X-Evasion-User-Id')) {
      headers.set('X-Evasion-User-Id', activeUid);
    }
    return fetch(input, {
      ...init,
      headers,
      credentials: 'include',
    });
  }, []);

  // 1. User state (guest starts strictly at 0 keys / 0 padlocks / 0 pts; overwritten authoritatively upon login)
  const [user, setUser] = useState<UserProfile>(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      const saved = localStorage.getItem('evasion_user');
      if (saved) {
        const parsed: UserProfile = JSON.parse(saved);
        if (!parsed.firstJoinedDate) parsed.firstJoinedDate = todayStr;
        const joinDate = new Date(parsed.firstJoinedDate);
        const currDate = new Date(todayStr);
        const diffFromJoin = Math.max(
          0,
          Math.round((currDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24))
        );
        const exactDaysOnApp = diffFromJoin + 1;
        parsed.detentionDays = exactDaysOnApp;
        parsed.streakDays = exactDaysOnApp;
        parsed.lastActiveDate = todayStr;
        if (typeof parsed.keysAvailable !== 'number' || !Number.isFinite(parsed.keysAvailable) || parsed.keysAvailable < 0) {
          parsed.keysAvailable = 0;
        }
        if (typeof parsed.points !== 'number' || !Number.isFinite(parsed.points)) parsed.points = 0;
        if (typeof parsed.completedMissionsCount !== 'number' || !Number.isFinite(parsed.completedMissionsCount)) {
          parsed.completedMissionsCount = 0;
        }
        if (typeof parsed.keysGivenTotal !== 'number' || !Number.isFinite(parsed.keysGivenTotal)) {
          parsed.keysGivenTotal = 0;
        }
        if (typeof parsed.padlocksAvailable !== 'number' || !Number.isFinite(parsed.padlocksAvailable) || parsed.padlocksAvailable < 0) {
          parsed.padlocksAvailable = 0;
        }
        if (!Array.isArray(parsed.lockedTemptations)) parsed.lockedTemptations = [];
        if (!parsed.lastMidnightResetDate) parsed.lastMidnightResetDate = todayStr;
        return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_USER;
  });

  const readPersistedPendingUniverse = useCallback((userId: string): ProfileUniverseItem[] => {
    try {
      const raw = localStorage.getItem(UNIVERSE_PENDING_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { userId?: string; items?: ProfileUniverseItem[] };
      if (!parsed || !Array.isArray(parsed.items)) return [];
      if (parsed.userId && userId && parsed.userId !== userId) return [];
      return parsed.items.filter((m) => m && m.id && m.url);
    } catch {
      return [];
    }
  }, []);

  const stripBase64MediaRef = (val?: string): string | undefined => {
    if (!val || typeof val !== 'string') return val;
    if (val.startsWith('data:') && val.length > 256) return undefined;
    return val;
  };

  const writePersistedPendingUniverse = useCallback((userId: string, items: ProfileUniverseItem[]) => {
    try {
      if (items.length === 0) {
        localStorage.removeItem(UNIVERSE_PENDING_STORAGE_KEY);
      } else {
        const metadataOnly = items
          .slice(0, 200)
          .map((m) => ({
            ...m,
            url: stripBase64MediaRef(m.url) || '',
          }))
          .filter((m) => Boolean(m.url));
        if (metadataOnly.length === 0) {
          localStorage.removeItem(UNIVERSE_PENDING_STORAGE_KEY);
        } else {
          localStorage.setItem(
            UNIVERSE_PENDING_STORAGE_KEY,
            JSON.stringify({ userId, items: metadataOnly })
          );
        }
      }
    } catch {
      // ignore quota error
    }
  }, []);

  const persistUserSafely = useCallback((nextUser: UserProfile) => {
    // Zero Base64 files in localStorage: store metadata + idb:// or public URL refs only
    const sanitizeUser = (u: UserProfile): UserProfile => ({
      ...u,
      avatar: typeof u.avatar === 'string' ? (stripBase64MediaRef(u.avatar) ?? '') : '',
      activeFlame: u.activeFlame
        ? {
            ...u.activeFlame,
            url: stripBase64MediaRef(u.activeFlame.url),
          }
        : undefined,
      universeMedia: (u.universeMedia || []).map((m) => ({
        ...m,
        url: stripBase64MediaRef(m.url) || m.url.slice(0, 64),
      })),
    });
    const cleanUser = sanitizeUser(nextUser);
    try {
      localStorage.setItem('evasion_user', JSON.stringify(cleanUser));
    } catch {
      try {
        localStorage.removeItem('evasion_active_lives_v1');
        localStorage.removeItem('evasion_chat');
        localStorage.setItem('evasion_user', JSON.stringify(cleanUser));
      } catch {
        // ignore quota
      }
    }
    if (cleanUser.id) {
      void saveProfileBackupToIdb(cleanUser.id, cleanUser);
      void saveLatestProfileBackupToIdb(cleanUser);
    }
    if (cleanUser.matricule) {
      void saveProfileBackupToIdb(cleanUser.matricule, cleanUser);
    }
    if (cleanUser.alias && cleanUser.alias.trim() && cleanUser.alias !== 'Spectre En Quête') {
      void saveProfileBackupToIdb(`alias:${cleanUser.alias.trim().toLowerCase()}`, cleanUser);
    }
    if (cleanUser.referralCode && cleanUser.referralCode.trim()) {
      void saveProfileBackupToIdb(`ref:${cleanUser.referralCode.trim().toUpperCase()}`, cleanUser);
    }
    if (cleanUser.supabaseUserId) {
      void saveProfileBackupToIdb(cleanUser.supabaseUserId, cleanUser);
    }
  }, []);

  const isValidRealAudio = (audioData?: string): boolean => {
    if (!audioData || typeof audioData !== 'string') return false;
    if (audioData.includes('simulated') || audioData.includes('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=')) {
      return false;
    }
    if (
      audioData.startsWith('idb://') ||
      audioData.startsWith('blob:') ||
      audioData.startsWith('/api/media/') ||
      audioData.startsWith('http://') ||
      audioData.startsWith('https://')
    ) {
      return true;
    }
    if (audioData.startsWith('data:audio')) {
      return audioData.length > 200;
    }
    return false;
  };

  const isRealComment = (c: PostComment): boolean => {
    if (!c || !c.id) return false;
    if (
      c.id.startsWith('comm_live_') ||
      c.id.startsWith('comm_aveu_') ||
      c.id.startsWith('comm_post_') ||
      c.authorId.startsWith('usr_v') ||
      c.authorId.startsWith('inmate_')
    ) {
      return false;
    }
    return true;
  };

  // 2. Posts state (Synced from server FIFO max 100)
  const [posts, setPosts] = useState<ConfessionPost[]>(() => {
    try {
      localStorage.removeItem('evasion_posts');
      const saved = localStorage.getItem('evasion_real_posts_v1');
      if (saved) {
        const parsed: ConfessionPost[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (p) =>
                p &&
                p.id &&
                !p.id.startsWith('aveu_') &&
                !p.id.startsWith('post_midnight_') &&
                !INITIAL_POSTS.some((init) => init.id === p.id)
            )
            .map((p) => ({
              ...p,
              audioNote: p.audioNote && isValidRealAudio(p.audioNote.audioData) ? p.audioNote : undefined,
              comments: (p.comments || [])
                .filter(isRealComment)
                .map((c) => ({
                  ...c,
                  audioNote: c.audioNote && isValidRealAudio(c.audioNote.audioData) ? c.audioNote : undefined,
                })),
            }));
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  // 3. Chat messages (Synced from server)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('evasion_chat');
      if (saved) {
        const parsed: ChatMessage[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(-MAX_CHAT_IN_MEMORY);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Direct 1-to-1 Clandestine Chat Target
  const [directChatTarget, setDirectChatTarget] = useState<DirectChatTarget | null>(null);
  // Public User Profile & Univers Target
  const [userProfileTarget, setUserProfileTarget] = useState<DirectChatTarget | null>(null);

  // 4. Detox session
  const [detoxSession, setDetoxSession] = useState<DetoxSession>(() => {
    try {
      const saved = localStorage.getItem('evasion_detox');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isActive && parsed.targetEndTime && parsed.targetEndTime > Date.now()) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return {
      isActive: false,
      durationMinutes: 15,
      startedAt: null,
      targetEndTime: null,
      ambientSound: false,
    };
  });

  const [theme, setTheme] = useState<AppTheme>('dark');

  useEffect(() => {
    try {
      localStorage.setItem('evasion_theme', theme);
      if (theme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    } catch {
      // ignore
    }
  }, [theme]);

  const [activeStoryPost, setActiveStoryPost] = useState<ConfessionPost | null>(null);
  const [isWallStoryActive, setIsWallStoryActive] = useState<boolean>(false);
  const [liberatedPostCelebration, setLiberatedPostCelebration] = useState<ConfessionPost | null>(null);
  const [soundMuted, setSoundMuted] = useState<boolean>(soundEngine.getMuted());
  const [onlineInmatesCount, setOnlineInmatesCount] = useState<number>(0);
  const [platformKeyStats, setPlatformKeyStats] = useState<PlatformKeyStats>({
    totalKeysSpent: 0,
    totalKeysAvailable: 0,
    totalPadlocksAvailable: 0,
    totalPadlocksSealed: 0,
    totalEscapes: 0,
    totalPosts: 0,
  });
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserPresence[]>([]);
  const [incomingLiveInvite, setIncomingLiveInvite] = useState<LiveInvitePayload | null>(null);
  const [requestedLiveId, setRequestedLiveId] = useState<string | null>(null);
  const [autoJoinCoHostLiveId, setAutoJoinCoHostLiveId] = useState<string | null>(null);
  const rtcEventListenersRef = useRef<Set<(event: { type: string; payload: any }) => void>>(new Set());
  const activeRtcRoomRef = useRef<{ liveId: string; role: 'host' | 'guest' | 'viewer' } | null>(null);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [isShopOpen, setIsShopOpen] = useState<boolean>(false);
  const [checkoutItem, setCheckoutItem] = useState<CheckoutItemRequest | null>(null);
  const [activeReadKit, setActiveReadKit] = useState<KitItem | null>(null);
  const [lastMidnightResetTime, setLastMidnightResetTime] = useState<number>(() => Date.now());
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // Global ambient music engine (Mur, Profil, Médias, Flamme)
  const [currentAmbientTrack, setCurrentAmbientTrack] = useState<{ id: string; track: DeezerTrack; isPlaying: boolean } | null>(null);
  const currentAmbientTrackRef = useRef<{ id: string; track: DeezerTrack; isPlaying: boolean } | null>(null);
  currentAmbientTrackRef.current = currentAmbientTrack;
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopAmbientTrack = useCallback((sourceId?: string) => {
    const active = currentAmbientTrackRef.current;
    if (sourceId && active && active.id !== sourceId && !active.id.startsWith(sourceId)) {
      return;
    }
    if (ambientAudioRef.current) {
      try {
        ambientAudioRef.current.onerror = null;
        ambientAudioRef.current.pause();
        ambientAudioRef.current.currentTime = 0;
      } catch {
        // ignore audio reset error
      }
      ambientAudioRef.current = null;
    }
    currentAmbientTrackRef.current = null;
    setCurrentAmbientTrack(null);
  }, []);

  const pauseAmbientTrack = useCallback(() => {
    if (ambientAudioRef.current) {
      ambientAudioRef.current.pause();
    }
    setCurrentAmbientTrack((prev) => {
      const next = prev ? { ...prev, isPlaying: false } : null;
      currentAmbientTrackRef.current = next;
      return next;
    });
  }, []);

  const playAmbientTrack = useCallback((id: string, track: DeezerTrack) => {
    if (!track.previewUrl) return;
    // Unmute global sound engine when the user explicitly plays a track
    if (soundEngine.getMuted()) {
      soundEngine.setMuted(false);
      setSoundMuted(false);
    } else {
      soundEngine.unlock();
    }

    const startPlayback = (url: string, allowRetry: boolean) => {
      if (ambientAudioRef.current) {
        try {
          ambientAudioRef.current.onerror = null;
          ambientAudioRef.current.pause();
        } catch {
          // ignore
        }
      }
      const audio = new Audio();
      (audio as unknown as { playsInline: boolean }).playsInline = true;
      audio.loop = true;
      audio.muted = false;
      audio.volume = 0.85;
      audio.preload = 'auto';
      audio.src = getPlayableDeezerUrl(url, track);
      ambientAudioRef.current = audio;

      let retried = false;
      const retryFresh = () => {
        if (!allowRetry || retried || ambientAudioRef.current !== audio) return;
        retried = true;
        void resolveFreshTrackPreviewUrl(track, true).then((freshUrl) => {
          if (ambientAudioRef.current !== audio) return;
          if (freshUrl && freshUrl !== url) {
            startPlayback(freshUrl, false);
          } else {
            const next = { id, track, isPlaying: false };
            currentAmbientTrackRef.current = next;
            setCurrentAmbientTrack(next);
          }
        });
      };

      audio.onerror = retryFresh;
      audio
        .play()
        .then(() => {
          if (ambientAudioRef.current !== audio) return;
          const next = { id, track: { ...track, previewUrl: url }, isPlaying: true };
          currentAmbientTrackRef.current = next;
          setCurrentAmbientTrack(next);
        })
        .catch(() => {
          if (allowRetry) {
            retryFresh();
          } else {
            const next = { id, track, isPlaying: false };
            currentAmbientTrackRef.current = next;
            setCurrentAmbientTrack(next);
          }
        });
    };

    // Resume existing same track if paused and not expired, otherwise start cleanly
    if (
      currentAmbientTrackRef.current?.id === id &&
      ambientAudioRef.current &&
      ambientAudioRef.current.src &&
      ambientAudioRef.current.paused
    ) {
      const audio = ambientAudioRef.current;
      audio.muted = false;
      audio.volume = 0.85;
      audio
        .play()
        .then(() => {
          const next = { id, track, isPlaying: true };
          currentAmbientTrackRef.current = next;
          setCurrentAmbientTrack(next);
        })
        .catch(() => {
          void resolveFreshTrackPreviewUrl(track, true).then((freshUrl) => {
            if (freshUrl) startPlayback(freshUrl, false);
          });
        });
      return;
    }

    startPlayback(track.previewUrl, true);
  }, []);

  const toggleAmbientTrack = useCallback(
    (id: string, track: DeezerTrack) => {
      if (currentAmbientTrack?.id === id && currentAmbientTrack.isPlaying) {
        pauseAmbientTrack();
      } else {
        playAmbientTrack(id, track);
      }
    },
    [currentAmbientTrack, pauseAmbientTrack, playAmbientTrack]
  );

  const [customSalons, setCustomSalons] = useState<CustomSalon[]>(() => {
    try {
      const saved = localStorage.getItem('evasion_custom_salons');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('evasion_custom_salons', JSON.stringify(customSalons));
    } catch {
      // ignore
    }
  }, [customSalons]);

  const [activeLives, setActiveLives] = useState<LiveSession[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem('evasion_active_lives_v1', JSON.stringify(activeLives));
    } catch {
      // ignore
    }
  }, [activeLives]);

  const simulationLevel = useMemo(() => {
    const engagement = (user.keysGivenTotal || 0) * 0.1 + ((user.streakDays || 1) - 1) * 0.3 + (user.escapedCount || 0) * 0.35;
    return Math.max(0, 1 - engagement);
  }, [user.keysGivenTotal, user.streakDays, user.escapedCount]);

  const detoxSessionRef = useRef<DetoxSession>(detoxSession);
  detoxSessionRef.current = detoxSession;
  const keysBalanceRef = useRef<number>(user.keysAvailable || 0);
  const padlocksBalanceRef = useRef<number>(user.padlocksAvailable || 0);
  const dailyMissionGuardRef = useRef<string>(user.dailyMissionCompletedDate || '');
  const userMatriculeRef = useRef<string>(user.matricule);
  const userIdRef = useRef<string>(user.id);
  const supabaseUserIdRef = useRef<string | null>(user.supabaseUserId || null);
  const hydratedSupabaseUidRef = useRef<string | null>(null);
  const hydrationInFlightRef = useRef<{ uid: string; promise: Promise<AuthAccountInfo | null> } | null>(null);
  const hydrateFromSupabaseUserRef = useRef<
    (
      sbUser: {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
        email_confirmed_at?: string;
        identities?: Array<{ provider?: string }>;
      },
      options?: { announceEnter?: boolean; showWelcomeToast?: boolean }
    ) => Promise<AuthAccountInfo | null>
  >(async () => null);
  const cloudSnapshotReadyRef = useRef<boolean>(false);
  const userLatestRef = useRef<UserProfile>(user);
  userLatestRef.current = user;
  const directChatTargetRef = useRef<DirectChatTarget | null>(directChatTarget);
  const seenChatIdsRef = useRef<Set<string>>(new Set());
  const seenCommentIdsRef = useRef<Set<string>>(new Set());
  const initialChatSeededRef = useRef<boolean>(false);
  const initialPostsSeededRef = useRef<boolean>(false);
  const pendingPostIdsRef = useRef<Set<string>>(new Set());
  const pendingCreatedLiveIdsRef = useRef<Set<string>>(new Set());
  const endedLiveIdsRef = useRef<Set<string>>(new Set());
  const pendingUniverseItemsRef = useRef<Map<string, ProfileUniverseItem>>(new Map());
  const deletedUniverseIdsRef = useRef<Set<string>>(new Set());
  const currentUserUniverseRef = useRef<ProfileUniverseItem[]>(user.universeMedia || []);
  const avatarClearedRef = useRef<boolean>(false);
  const musicClearedRef = useRef<boolean>(false);
  const flameClearedRef = useRef<boolean>(false);
  const [universeUploadStatuses, setUniverseUploadStatuses] = useState<
    Record<string, UniverseUploadState>
  >({});
  const openDirectChatRef = useRef<(target: DirectChatTarget) => void>(() => {});
  const openUserProfileRef = useRef<(target: DirectChatTarget) => void>(() => {});
  const acceptFriendRequestRef = useRef<(target: { id?: string; matricule?: string }) => Promise<boolean>>(async () => false);
  const refreshFriendsFromServerRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    keysBalanceRef.current = user.keysAvailable || 0;
    padlocksBalanceRef.current = user.padlocksAvailable || 0;
    dailyMissionGuardRef.current = user.dailyMissionCompletedDate || '';
    userMatriculeRef.current = user.matricule;
    userIdRef.current = user.id;
    if (user.supabaseUserId) {
      supabaseUserIdRef.current = user.supabaseUserId;
    }
    userLatestRef.current = user;
    currentUserUniverseRef.current = Array.isArray(user.universeMedia) ? user.universeMedia : [];
  }, [user]);

  useEffect(() => {
    directChatTargetRef.current = directChatTarget;
  }, [directChatTarget]);

  useEffect(() => {
    initPWAAndServiceWorker();
  }, []);

  useEffect(() => {
    setAuthTokenState(authAccount ? authTokenRef.current : authTokenRef.current);
    if (getNotificationPermission() === 'granted') {
      const prefs = getPhoneNotificationPrefs();
      if (prefs.enabled) {
        void syncPushSubscriptionWithServer(authTokenRef.current, prefs.notifyCourtChat);
      }
    }
  }, [authAccount, user.id]);

  const normalizeServerPost = useCallback(
    (rawPost: any, existingLocal?: ConfessionPost): ConfessionPost => {
      const matricule = userMatriculeRef.current;
      const donors = Array.isArray(rawPost?.keyDonors) ? rawPost.keyDonors : [];
      return {
        id: String(rawPost.id),
        authorId: String(rawPost.authorId || ''),
        authorMatricule: String(rawPost.authorMatricule || '#DÉTENU'),
        authorAlias: String(rawPost.authorAlias || ''),
        authorAvatar: String(rawPost.authorAvatar || '🔒'),
        content: String(rawPost.content || ''),
        imageUrl: typeof rawPost.imageUrl === 'string' ? rawPost.imageUrl : undefined,
        videoUrl: typeof rawPost.videoUrl === 'string' ? rawPost.videoUrl : undefined,
        videoDuration: typeof rawPost.videoDuration === 'number' ? rawPost.videoDuration : undefined,
        category: (rawPost.category || 'ecrans') as PostCategory,
        createdAt: Number(rawPost.createdAt) || Date.now(),
        keysCount: Number(rawPost.keysCount) || 0,
        keysRequired: Math.max(1, Number(rawPost.keysRequired) || 5),
        status: rawPost.status === 'escaped' ? 'escaped' : 'locked',
        escapedAt: typeof rawPost.escapedAt === 'number' ? rawPost.escapedAt : undefined,
        givenByMe: Boolean(existingLocal?.givenByMe || donors.includes(matricule)),
        sealedByMe: Boolean(existingLocal?.sealedByMe),
        isPinned: Boolean(rawPost.isPinned),
        pinnedUntil: typeof rawPost.pinnedUntil === 'number' ? rawPost.pinnedUntil : undefined,
        hasGoldBadge: Boolean(rawPost.hasGoldBadge),
        authorNeonColor: rawPost.authorNeonColor as NeonColor | undefined,
        authorFrame: rawPost.authorFrame as CellFrame | undefined,
        padlocksSealCount: typeof rawPost.padlocksSealCount === 'number' ? rawPost.padlocksSealCount : 1,
        audioNote: rawPost.audioNote,
        attachedFile: rawPost.attachedFile,
        bgMusic: rawPost.bgMusic,
        keyDonors: donors,
        comments: Array.isArray(rawPost.comments) ? rawPost.comments.slice(-MAX_COMMENTS_PER_POST) : [],
      };
    },
    []
  );

  const generateUniqueId = useCallback((prefix: string) => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  const showToast = useCallback((t: Omit<ToastNotification, 'id'>) => {
    const newToast: ToastNotification = {
      ...t,
      id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    setToast(newToast);
  }, []);

  const hideToast = useCallback(() => setToast(null), []);
  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const openShop = useCallback((item?: CheckoutItemRequest) => {
    setCheckoutItem(item || null);
    setIsShopOpen(true);
  }, []);

  const closeShop = useCallback(() => {
    setIsShopOpen(false);
    setCheckoutItem(null);
  }, []);

  const reconcileProfileUniverse = useCallback(
    (profile: UserProfile): UserProfile => {
      const localSnap = userLatestRef.current;
      const isSameLocalUser =
        Boolean(profile.id && profile.id === userIdRef.current) ||
        Boolean(profile.matricule && profile.matricule === userMatriculeRef.current);

      let protectedAvatar = profile.avatar;
      let protectedAlias = profile.alias;
      let protectedBio = profile.bio;

      if (isSameLocalUser && localSnap) {
        const localAv = typeof localSnap.avatar === 'string' ? localSnap.avatar : '';
        const serverAv = typeof profile.avatar === 'string' ? profile.avatar : '';
        const localHasPhotoAvatar =
          Boolean(localAv) &&
          (localAv.startsWith('data:image/') ||
            localAv.startsWith('/api/media/') ||
            localAv.startsWith('idb://') ||
            localAv.startsWith('blob:') ||
            localAv.startsWith('http'));
        const serverHasPhotoAvatar =
          Boolean(serverAv) &&
          (serverAv.startsWith('data:image/') ||
            serverAv.startsWith('/api/media/') ||
            serverAv.startsWith('idb://') ||
            serverAv.startsWith('blob:') ||
            serverAv.startsWith('http'));

        if (avatarClearedRef.current) {
          protectedAvatar = '';
        } else if (
          (localAv && localAv !== '⛓️' && (!serverAv || serverAv === '⛓️')) ||
          (localHasPhotoAvatar && !serverHasPhotoAvatar)
        ) {
          protectedAvatar = localAv;
        }
        if (
          localSnap.alias &&
          localSnap.alias !== 'Spectre En Quête' &&
          (!profile.alias || profile.alias === 'Spectre En Quête')
        ) {
          protectedAlias = localSnap.alias;
        }
        if (localSnap.bio && localSnap.bio.trim() && !profile.bio) {
          protectedBio = localSnap.bio;
        }
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const protectedMidnightDate =
        isSameLocalUser && localSnap?.lastMidnightResetDate === todayIso
          ? todayIso
          : profile.lastMidnightResetDate || (isSameLocalUser ? localSnap?.lastMidnightResetDate : undefined);
      const protectedMissionDate =
        isSameLocalUser && localSnap?.dailyMissionCompletedDate === todayIso
          ? todayIso
          : profile.dailyMissionCompletedDate || (isSameLocalUser ? localSnap?.dailyMissionCompletedDate : undefined);
      const protectedSupabaseId =
        profile.supabaseUserId ||
        (isSameLocalUser ? localSnap?.supabaseUserId || supabaseUserIdRef.current || undefined : undefined);
      const protectedProfileMusic = musicClearedRef.current
        ? undefined
        : profile.profileMusic ?? (isSameLocalUser ? localSnap?.profileMusic : undefined);
      const protectedActiveFlame = flameClearedRef.current
        ? undefined
        : profile.activeFlame ?? (isSameLocalUser ? localSnap?.activeFlame : undefined);

      // Monotonic preservation for the same active user so cold serverless responses NEVER zero out stats/style
      const mergedBadges = (() => {
        if (!isSameLocalUser || !localSnap) return profile.badges || [];
        const bMap = new Map<string, UserProfile['badges'][number]>();
        for (const b of localSnap.badges || []) {
          if (b?.id) bMap.set(b.id, b);
        }
        for (const b of profile.badges || []) {
          if (b?.id && !bMap.has(b.id)) bMap.set(b.id, b);
        }
        return Array.from(bMap.values());
      })();
      const mergedKits = isSameLocalUser && localSnap
        ? Array.from(new Set([...(localSnap.purchasedKits || []), ...(profile.purchasedKits || [])]))
        : profile.purchasedKits || [];
      const mergedTemptations = isSameLocalUser && localSnap
        ? Array.from(new Set([...(localSnap.lockedTemptations || []), ...(profile.lockedTemptations || [])])).slice(0, 8)
        : profile.lockedTemptations || [];
      const pickEarliestIso = (a?: string, b?: string): string | undefined => {
        if (a && b) return a < b ? a : b;
        return a || b;
      };
      const protectedFirstJoined = isSameLocalUser && localSnap
        ? pickEarliestIso(localSnap.firstJoinedDate, profile.firstJoinedDate)
        : profile.firstJoinedDate;
      const protectedNeon =
        isSameLocalUser &&
        localSnap?.neonColor &&
        localSnap.neonColor !== 'red' &&
        (!profile.neonColor || profile.neonColor === 'red')
          ? localSnap.neonColor
          : profile.neonColor || (isSameLocalUser ? localSnap?.neonColor : undefined);
      const protectedFrame =
        isSameLocalUser &&
        localSnap?.cellBorderFrame &&
        localSnap.cellBorderFrame !== 'none' &&
        (!profile.cellBorderFrame || profile.cellBorderFrame === 'none')
          ? localSnap.cellBorderFrame
          : profile.cellBorderFrame || (isSameLocalUser ? localSnap?.cellBorderFrame : undefined);
      const protectedProfileType =
        profile.profileType || (isSameLocalUser ? localSnap?.profileType : undefined);

      const baseProfile: UserProfile = {
        ...profile,
        avatar: protectedAvatar,
        alias: protectedAlias,
        isVerified: Boolean(profile.isVerified || (isSameLocalUser && localSnap?.isVerified)),
        ...(protectedSupabaseId ? { supabaseUserId: protectedSupabaseId } : {}),
        ...(protectedBio !== undefined ? { bio: protectedBio } : {}),
        ...(protectedProfileMusic ? { profileMusic: protectedProfileMusic } : { profileMusic: undefined }),
        ...(protectedActiveFlame ? { activeFlame: protectedActiveFlame } : { activeFlame: undefined }),
        ...(protectedMidnightDate ? { lastMidnightResetDate: protectedMidnightDate } : {}),
        ...(protectedMissionDate ? { dailyMissionCompletedDate: protectedMissionDate } : {}),
        ...(protectedFirstJoined ? { firstJoinedDate: protectedFirstJoined } : {}),
        ...(protectedNeon ? { neonColor: protectedNeon } : {}),
        ...(protectedFrame ? { cellBorderFrame: protectedFrame } : {}),
        ...(protectedProfileType ? { profileType: protectedProfileType } : {}),
        ...(isSameLocalUser && localSnap
          ? {
              keysAvailable: Math.max(profile.keysAvailable || 0, localSnap.keysAvailable || 0),
              padlocksAvailable: Math.max(profile.padlocksAvailable || 0, localSnap.padlocksAvailable || 0),
              points: Math.max(profile.points || 0, localSnap.points || 0),
              completedMissionsCount: Math.max(
                profile.completedMissionsCount || 0,
                localSnap.completedMissionsCount || 0
              ),
              screenTimeSavedMinutes: Math.max(
                profile.screenTimeSavedMinutes || 0,
                localSnap.screenTimeSavedMinutes || 0
              ),
              keysGivenTotal: Math.max(profile.keysGivenTotal || 0, localSnap.keysGivenTotal || 0),
              escapedCount: Math.max(profile.escapedCount || 0, localSnap.escapedCount || 0),
              hasPassePartoutCount: Math.max(
                profile.hasPassePartoutCount || 0,
                localSnap.hasPassePartoutCount || 0
              ),
              streakDays: Math.max(profile.streakDays || 1, localSnap.streakDays || 1),
              isStreakProtectedByPadlock: Boolean(
                profile.isStreakProtectedByPadlock || localSnap.isStreakProtectedByPadlock
              ),
              badges: mergedBadges,
              purchasedKits: mergedKits,
              lockedTemptations: mergedTemptations,
              isUniversePublic: profile.isUniversePublic ?? localSnap.isUniversePublic,
              universeStorageQuota: Math.max(
                profile.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA,
                localSnap.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA
              ),
              isUniverseStorageUnlimited: Boolean(
                profile.isUniverseStorageUnlimited || localSnap.isUniverseStorageUnlimited
              ),
            }
          : {}),
      };

      const serverList = Array.isArray(baseProfile.universeMedia) ? baseProfile.universeMedia : [];
      const localMapById = new Map<string, ProfileUniverseItem>();
      if (isSameLocalUser) {
        const localCandidates = [
          ...(Array.isArray(localSnap?.universeMedia) ? localSnap.universeMedia : []),
          ...(Array.isArray(currentUserUniverseRef.current) ? currentUserUniverseRef.current : []),
        ];
        for (const item of localCandidates) {
          if (item && item.id && item.url && !deletedUniverseIdsRef.current.has(item.id)) {
            const existingLocal = localMapById.get(item.id);
            const isRemote = !item.url.startsWith('idb://') && !item.url.startsWith('blob:');
            if (!existingLocal || isRemote) {
              localMapById.set(item.id, item);
            }
          }
        }
      }

      const filteredServer = serverList
        .filter((m) => m && m.id && !deletedUniverseIdsRef.current.has(m.id))
        .map((m) => {
          const localMatch = localMapById.get(m.id);
          if (
            localMatch?.url &&
            !localMatch.url.startsWith('idb://') &&
            !localMatch.url.startsWith('blob:') &&
            (!m.url || m.url.startsWith('idb://') || m.url.startsWith('blob:'))
          ) {
            return { ...m, url: localMatch.url };
          }
          return m;
        });

      const existingIds = new Set(filteredServer.map((m) => m.id));
      const storedPending = readPersistedPendingUniverse(baseProfile.id);

      const pendingToKeep: ProfileUniverseItem[] = [];
      const seenExtraIds = new Set<string>();

      pendingUniverseItemsRef.current.forEach((pendingItem) => {
        if (
          !deletedUniverseIdsRef.current.has(pendingItem.id) &&
          !existingIds.has(pendingItem.id) &&
          !seenExtraIds.has(pendingItem.id)
        ) {
          seenExtraIds.add(pendingItem.id);
          pendingToKeep.push(pendingItem);
        }
      });

      for (const pItem of storedPending) {
        if (
          !deletedUniverseIdsRef.current.has(pItem.id) &&
          !existingIds.has(pItem.id) &&
          !seenExtraIds.has(pItem.id)
        ) {
          seenExtraIds.add(pItem.id);
          pendingToKeep.push(pItem);
        }
      }

      if (pendingToKeep.length === 0 && storedPending.length > 0) {
        writePersistedPendingUniverse(baseProfile.id, []);
      }

      // Preserve ALL active non-deleted media items for the same user (including Supabase Storage https:// URLs)
      // so cold serverless responses or partial syncs NEVER erase photos/videos/audios/files in "Mes médias".
      const localActiveToKeep: ProfileUniverseItem[] = [];
      if (isSameLocalUser) {
        localMapById.forEach((curItem) => {
          if (
            curItem &&
            curItem.id &&
            curItem.url &&
            !deletedUniverseIdsRef.current.has(curItem.id) &&
            !existingIds.has(curItem.id) &&
            !seenExtraIds.has(curItem.id)
          ) {
            seenExtraIds.add(curItem.id);
            localActiveToKeep.push(curItem);
          }
        });
      }

      if (
        pendingToKeep.length === 0 &&
        localActiveToKeep.length === 0 &&
        filteredServer.length === serverList.length
      ) {
        return baseProfile;
      }

      const isUnlimited =
        Boolean(baseProfile.isUniverseStorageUnlimited) || isMasterPassUser(baseProfile);
      const quota = Math.max(BASE_FREE_UNIVERSE_QUOTA, Number(baseProfile.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA));
      const merged = [...pendingToKeep, ...localActiveToKeep, ...filteredServer];
      const maxCap = isUnlimited ? 5000 : Math.max(quota + pendingToKeep.length, merged.length);

      return {
        ...baseProfile,
        universeMedia: merged.slice(0, maxCap),
      };
    },
    [readPersistedPendingUniverse, writePersistedPendingUniverse]
  );

  const applyServerAccount = useCallback((account: AuthAccountInfo | null, token?: string | null, forceSwitch = false) => {
    if (token !== undefined) {
      authTokenRef.current = token;
      writeStoredAuthToken(token);
      setAuthTokenState(token);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && token) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'AUTH',
              token,
              userId: account?.profile?.id || userIdRef.current,
            })
          );
        } catch {
          // ignore
        }
      }
    } else if (account === null) {
      authTokenRef.current = null;
      writeStoredAuthToken(null);
      setAuthTokenState(null);
    }
    authAccountRef.current = account;
    setAuthAccount(account);
    if (account?.profile) {
      const isSwitchingUser = Boolean(
        userIdRef.current && account.profile.id && account.profile.id !== userIdRef.current
      );
      if (isSwitchingUser && !forceSwitch && authAccountRef.current && authAccountRef.current.id !== account.profile.id) {
        // Strictly prevent accidental profile jumping / account switching during background requests
        return;
      }
      if (isSwitchingUser) {
        pendingUniverseItemsRef.current.clear();
        deletedUniverseIdsRef.current.clear();
        currentUserUniverseRef.current = Array.isArray(account.profile.universeMedia)
          ? account.profile.universeMedia
          : [];
      }
      const reconciled = reconcileProfileUniverse(account.profile);
      const resolvedSupabaseId =
        reconciled.supabaseUserId || account.supabaseUserId || supabaseUserIdRef.current || undefined;
      const finalProfile: UserProfile = resolvedSupabaseId
        ? { ...reconciled, supabaseUserId: resolvedSupabaseId }
        : reconciled;
      if (resolvedSupabaseId) {
        supabaseUserIdRef.current = resolvedSupabaseId;
      }
      userIdRef.current = finalProfile.id;
      userMatriculeRef.current = finalProfile.matricule;
      userLatestRef.current = finalProfile;
      currentUserUniverseRef.current = Array.isArray(finalProfile.universeMedia)
        ? finalProfile.universeMedia
        : [];
      setUser(finalProfile);
      persistUserSafely(finalProfile);
      setPosts((prev) => {
        let changed = false;
        const next = prev.map((post) => {
          const nextGivenByMe = Array.isArray(post.keyDonors) && post.keyDonors.includes(finalProfile.matricule);
          if (Boolean(post.givenByMe) === nextGivenByMe) return post;
          changed = true;
          return {
            ...post,
            givenByMe: nextGivenByMe,
          };
        });
        return changed ? next : prev;
      });
      if (forceSwitch) {
        void refreshFriendsFromServerRef.current();
      }
    } else {
      setIsSensitiveCodesUnlocked(false);
    }
  }, [persistUserSafely, reconcileProfileUniverse]);

  const applyActionServerProfile = useCallback(
    (
      serverProfile: UserProfile | null | undefined,
      overrides?: Partial<UserProfile>
    ) => {
      setUser((prev) => {
        if (!serverProfile) {
          if (!overrides) return prev;
          const nextLocal: UserProfile = { ...prev, ...overrides };
          userLatestRef.current = nextLocal;
          currentUserUniverseRef.current = Array.isArray(nextLocal.universeMedia)
            ? nextLocal.universeMedia
            : [];
          persistUserSafely(nextLocal);
          return nextLocal;
        }

        // Ne jamais écraser la session active avec un autre compte fantôme créé par une instance serverless froide
        if (prev.id && serverProfile.id && prev.id !== serverProfile.id) {
          const safeFallback: UserProfile = overrides ? { ...prev, ...overrides } : prev;
          userLatestRef.current = safeFallback;
          currentUserUniverseRef.current = Array.isArray(safeFallback.universeMedia)
            ? safeFallback.universeMedia
            : [];
          persistUserSafely(safeFallback);
          return safeFallback;
        }

        const todayIso = new Date().toISOString().slice(0, 10);
        const mediaMap = new Map<string, ProfileUniverseItem>();
        const pushMediaList = (list?: ProfileUniverseItem[]) => {
          if (!Array.isArray(list)) return;
          for (const item of list) {
            if (!item || !item.id || deletedUniverseIdsRef.current.has(item.id)) continue;
            const existing = mediaMap.get(item.id);
            const isRemote = Boolean(
              item.url && !item.url.startsWith('idb://') && !item.url.startsWith('blob:')
            );
            if (!existing || isRemote) {
              mediaMap.set(item.id, item);
            }
          }
        };
        pendingUniverseItemsRef.current.forEach((pItem) => {
          if (pItem?.id && !deletedUniverseIdsRef.current.has(pItem.id)) {
            mediaMap.set(pItem.id, pItem);
          }
        });
        pushMediaList(prev.universeMedia);
        pushMediaList(currentUserUniverseRef.current);
        pushMediaList(serverProfile.universeMedia);

        const badgeMap = new Map<string, UserProfile['badges'][number]>();
        for (const b of prev.badges || []) {
          if (b?.id) badgeMap.set(b.id, b);
        }
        for (const b of serverProfile.badges || []) {
          if (b?.id && !badgeMap.has(b.id)) badgeMap.set(b.id, b);
        }

        const mergedTemptations = Array.from(
          new Set([
            ...(Array.isArray(prev.lockedTemptations) ? prev.lockedTemptations : []),
            ...(Array.isArray(serverProfile.lockedTemptations) ? serverProfile.lockedTemptations : []),
          ])
        ).slice(0, 8);

        const prevAv = typeof prev.avatar === 'string' ? prev.avatar : '';
        const srvAv = typeof serverProfile.avatar === 'string' ? serverProfile.avatar : '';
        const srvHasPhoto =
          Boolean(srvAv) &&
          (srvAv.startsWith('http') ||
            srvAv.startsWith('data:image/') ||
            srvAv.startsWith('/api/media/'));
        const prevHasPhoto =
          Boolean(prevAv) &&
          (prevAv.startsWith('http') ||
            prevAv.startsWith('data:image/') ||
            prevAv.startsWith('/api/media/') ||
            prevAv.startsWith('idb://') ||
            prevAv.startsWith('blob:'));

        let safeAvatar = prevAv;
        if (avatarClearedRef.current) {
          safeAvatar = '';
        } else if (!prevHasPhoto && srvHasPhoto) {
          safeAvatar = srvAv;
        } else if ((!prevAv || prevAv === '⛓️') && srvAv && srvAv !== '⛓️') {
          safeAvatar = srvAv;
        }

        const safeAlias =
          prev.alias && prev.alias !== 'Spectre En Quête'
            ? prev.alias
            : serverProfile.alias || prev.alias;
        const safeBio = prev.bio !== undefined ? prev.bio : serverProfile.bio;
        const safeSupabaseId =
          prev.supabaseUserId || serverProfile.supabaseUserId || supabaseUserIdRef.current || undefined;
        const safeMusic = musicClearedRef.current
          ? undefined
          : prev.profileMusic ?? serverProfile.profileMusic;
        const safeFlame = flameClearedRef.current
          ? undefined
          : prev.activeFlame ?? serverProfile.activeFlame;

        const merged: UserProfile = {
          ...prev,
          ...serverProfile,
          ...(safeSupabaseId ? { supabaseUserId: safeSupabaseId } : {}),
          isVerified: Boolean(prev.isVerified || serverProfile.isVerified),
          alias: safeAlias,
          avatar: safeAvatar,
          ...(safeBio !== undefined ? { bio: safeBio } : {}),
          profileMusic: safeMusic,
          activeFlame: safeFlame,
          isUniversePublic: prev.isUniversePublic ?? serverProfile.isUniversePublic,
          universeStorageQuota: Math.max(
            prev.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA,
            serverProfile.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA
          ),
          isUniverseStorageUnlimited: Boolean(
            prev.isUniverseStorageUnlimited || serverProfile.isUniverseStorageUnlimited
          ),
          badges: Array.from(badgeMap.values()),
          lockedTemptations: mergedTemptations,
          universeMedia: Array.from(mediaMap.values()),
          dailyMissionCompletedDate:
            prev.dailyMissionCompletedDate === todayIso ||
            serverProfile.dailyMissionCompletedDate === todayIso
              ? todayIso
              : serverProfile.dailyMissionCompletedDate || prev.dailyMissionCompletedDate,
          lastMidnightResetDate:
            prev.lastMidnightResetDate === todayIso ||
            serverProfile.lastMidnightResetDate === todayIso
              ? todayIso
              : serverProfile.lastMidnightResetDate || prev.lastMidnightResetDate,
          ...(overrides || {}),
        };

        userLatestRef.current = merged;
        currentUserUniverseRef.current = Array.isArray(merged.universeMedia)
          ? merged.universeMedia
          : [];
        persistUserSafely(merged);
        setAuthAccount((accPrev) =>
          accPrev && accPrev.id === merged.id ? { ...accPrev, profile: merged } : accPrev
        );
        return merged;
      });
    },
    [persistUserSafely]
  );

  const syncUserFieldsToSupabase = useCallback(
    (
      snapshotUser: UserProfile,
      patch: {
        username?: string;
        avatar_url?: string | null;
        bio?: string | null;
        is_verified?: boolean;
        profile_music?: DeezerTrack | null;
        universe_media?: ProfileUniverseItem[];
        active_flame?: ActiveFlameItem | null;
      }
    ) => {
      const sbUid = snapshotUser.supabaseUserId || supabaseUserIdRef.current;
      if (!sbUid || !isSupabaseConfigured) return;

      if (!isOnlineModeRef.current) {
        pendingSupabaseSyncRef.current = true;
        try {
          window.localStorage.setItem('evasion_pending_sb_sync_v1', '1');
        } catch {
          // ignore
        }
        return;
      }

      void saveCloudProfileSnapshot(sbUid, snapshotUser);

      void saveSupabaseProfilePatch(sbUid, {
        ...patch,
        evasion_user_id: snapshotUser.id,
        profile_data: {
          id: snapshotUser.id,
          matricule: snapshotUser.matricule,
          referralCode: snapshotUser.referralCode,
          publicShareSlug: snapshotUser.publicShareSlug,
          alias: snapshotUser.alias,
          bio: snapshotUser.bio,
          profileType: snapshotUser.profileType,
          neonColor: snapshotUser.neonColor,
          cellBorderFrame: snapshotUser.cellBorderFrame,
          isUniversePublic: snapshotUser.isUniversePublic,
          keysAvailable: snapshotUser.keysAvailable,
          padlocksAvailable: snapshotUser.padlocksAvailable,
          points: snapshotUser.points,
          completedMissionsCount: snapshotUser.completedMissionsCount,
          screenTimeSavedMinutes: snapshotUser.screenTimeSavedMinutes,
          keysGivenTotal: snapshotUser.keysGivenTotal,
          escapedCount: snapshotUser.escapedCount,
          hasPassePartoutCount: snapshotUser.hasPassePartoutCount,
          dailyMissionCompletedDate: snapshotUser.dailyMissionCompletedDate,
          lastMidnightResetDate: snapshotUser.lastMidnightResetDate,
          firstJoinedDate: snapshotUser.firstJoinedDate,
          streakDays: snapshotUser.streakDays,
          isStreakProtectedByPadlock: snapshotUser.isStreakProtectedByPadlock,
          lockedTemptations: snapshotUser.lockedTemptations,
          badges: snapshotUser.badges,
          purchasedKits: snapshotUser.purchasedKits,
          universeStorageQuota: snapshotUser.universeStorageQuota,
          isUniverseStorageUnlimited: snapshotUser.isUniverseStorageUnlimited,
        },
      }).then((ok) => {
        if (!ok) {
          pendingSupabaseSyncRef.current = true;
          try {
            window.localStorage.setItem('evasion_pending_sb_sync_v1', '1');
          } catch {
            // ignore
          }
        }
      });
    },
    []
  );

  const queueActionForSync = useCallback(
    (action: Omit<QueuedOfflineAction, 'id' | 'createdAt' | 'attempts'>) => {
      const next = enqueueOfflineAction({
        ...action,
        userId: action.userId || userIdRef.current,
      });
      setPendingSyncCount(next.length);
    },
    []
  );

  const syncOfflineQueueNow = useCallback(
    async (forceReconnect = false) => {
      if (isSyncingQueueRef.current) return;
      if (forceReconnect && manualOfflineMode) {
        setManualOfflineModeStorage(false);
        setManualOfflineModeState(false);
      }
      if (!forceReconnect && !isOnlineModeRef.current) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        try {
          const probe = await fetch('/api/health', { cache: 'no-store' });
          if (!probe.ok) {
            if (forceReconnect) {
              showToast({
                title: 'Toujours hors réseau 📡',
                message: 'Tes actions restent en sécurité en file d’attente jusqu’au retour d’Internet.',
                type: 'warning',
              });
            }
            return;
          }
          setIsNetworkOnline(true);
        } catch {
          if (forceReconnect) {
            showToast({
              title: 'Toujours hors réseau 📡',
              message: 'Impossible de joindre le serveur pour le moment.',
              type: 'warning',
            });
          }
          return;
        }
      }

      const items = await loadOfflineQueueFromIdb();
      const hasSbPending = pendingSupabaseSyncRef.current;
      if (items.length === 0 && !hasSbPending) {
        setPendingSyncCount(0);
        return;
      }

      isSyncingQueueRef.current = true;
      setIsSyncingOfflineQueue(true);
      let syncedCount = 0;

      try {
        const ownerSnap = userLatestRef.current;
        const ownerFolderId =
          ownerSnap.supabaseUserId || supabaseUserIdRef.current || ownerSnap.id;

        for (const item of items) {
          if (!forceReconnect && !isOnlineModeRef.current) break;

          let payloadBody = item.body ? { ...item.body } : undefined;
          if (payloadBody && (item.type === 'CREATE_POST' || item.type === 'SEND_CHAT')) {
            const syncMediaField = async (ref?: unknown, folder = 'posts') => {
              if (typeof ref !== 'string') return ref;
              if (ref.startsWith('idb://') || ref.startsWith('blob:')) {
                const uploaded = await uploadMediaBlobForSync(ref, {
                  folder,
                  userId: ownerFolderId,
                });
                if (
                  uploaded &&
                  uploaded !== ref &&
                  !uploaded.startsWith('idb://') &&
                  !uploaded.startsWith('blob:')
                ) {
                  void revokeMediaUrlOrRef(ref);
                  return uploaded;
                }
              }
              return ref;
            };

            const folder = item.type === 'SEND_CHAT' ? 'chat' : 'posts';
            payloadBody.imageUrl = await syncMediaField(payloadBody.imageUrl, folder);
            payloadBody.videoUrl = await syncMediaField(payloadBody.videoUrl, folder);
            if (payloadBody.audioNote && typeof payloadBody.audioNote === 'object') {
              const an = payloadBody.audioNote as { duration?: number; audioData?: string; hasVoiceFilter?: boolean };
              const nextAudioData = await syncMediaField(an.audioData, folder);
              payloadBody.audioNote = { ...an, audioData: nextAudioData as string | undefined };
            }
          }

          try {
            const res = await authFetch(item.endpoint, {
              method: item.method,
              headers: payloadBody ? { 'Content-Type': 'application/json' } : undefined,
              body: payloadBody ? JSON.stringify(payloadBody) : undefined,
            });

            if (res.ok) {
              const remaining = removeOfflineAction(item.id);
              setPendingSyncCount(remaining.length);
              syncedCount++;

              const data = (await res.json().catch(() => null)) as {
                profile?: UserProfile;
                post?: ConfessionPost;
              } | null;
              if (data?.profile) {
                applyActionServerProfile(data.profile);
              }
              if (data?.post) {
                setPosts((prev) => {
                  const idx = prev.findIndex((p) => p.id === data.post!.id);
                  const normalized = normalizeServerPost(
                    data.post,
                    idx >= 0 ? prev[idx] : undefined
                  );
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = normalized;
                    return next;
                  }
                  return [normalized, ...prev];
                });
              }
            } else if (res.status >= 400 && res.status < 500) {
              // Drop invalid / already applied client-side items so queue does not jam
              const remaining = removeOfflineAction(item.id);
              setPendingSyncCount(remaining.length);
            } else {
              break;
            }
          } catch {
            break;
          }
        }

        if (pendingSupabaseSyncRef.current) {
          const latest = userLatestRef.current;
          const sbUid = latest.supabaseUserId || supabaseUserIdRef.current;
          if (sbUid && isSupabaseConfigured) {
            const [snapOk, patchOk] = await Promise.all([
              saveCloudProfileSnapshot(sbUid, latest),
              saveSupabaseProfilePatch(sbUid, {
                username: latest.alias,
                avatar_url: latest.avatar ? latest.avatar : null,
                bio: latest.bio ?? null,
                profile_music: latest.profileMusic ?? null,
                universe_media: latest.universeMedia,
                active_flame: latest.activeFlame ?? null,
                evasion_user_id: latest.id,
                profile_data: {
                  id: latest.id,
                  matricule: latest.matricule,
                  referralCode: latest.referralCode,
                  publicShareSlug: latest.publicShareSlug,
                  alias: latest.alias,
                  bio: latest.bio,
                  profileType: latest.profileType,
                  neonColor: latest.neonColor,
                  cellBorderFrame: latest.cellBorderFrame,
                  isUniversePublic: latest.isUniversePublic,
                  keysAvailable: latest.keysAvailable,
                  padlocksAvailable: latest.padlocksAvailable,
                  points: latest.points,
                  completedMissionsCount: latest.completedMissionsCount,
                  screenTimeSavedMinutes: latest.screenTimeSavedMinutes,
                  keysGivenTotal: latest.keysGivenTotal,
                  escapedCount: latest.escapedCount,
                  hasPassePartoutCount: latest.hasPassePartoutCount,
                  dailyMissionCompletedDate: latest.dailyMissionCompletedDate,
                  lastMidnightResetDate: latest.lastMidnightResetDate,
                  firstJoinedDate: latest.firstJoinedDate,
                  streakDays: latest.streakDays,
                  isStreakProtectedByPadlock: latest.isStreakProtectedByPadlock,
                  lockedTemptations: latest.lockedTemptations,
                  badges: latest.badges,
                  purchasedKits: latest.purchasedKits,
                  universeStorageQuota: latest.universeStorageQuota,
                  isUniverseStorageUnlimited: latest.isUniverseStorageUnlimited,
                },
              }),
            ]);
            if (snapOk || patchOk) {
              pendingSupabaseSyncRef.current = false;
              try {
                window.localStorage.removeItem('evasion_pending_sb_sync_v1');
              } catch {
                // ignore
              }
            }
          } else {
            pendingSupabaseSyncRef.current = false;
            try {
              window.localStorage.removeItem('evasion_pending_sb_sync_v1');
            } catch {
              // ignore
            }
          }
        }

        if (syncedCount > 0) {
          showToast({
            title: `Synchronisation réussie (${syncedCount}) ✅`,
            message: 'Toutes tes actions hors ligne ont été enregistrées sur le serveur.',
            icon: '🔄',
            type: 'success',
          });
        }
      } finally {
        isSyncingQueueRef.current = false;
        setIsSyncingOfflineQueue(false);
      }
    },
    [
      manualOfflineMode,
      authFetch,
      applyActionServerProfile,
      normalizeServerPost,
      showToast,
    ]
  );

  const setManualOfflineMode = useCallback(
    (offline: boolean) => {
      setManualOfflineModeStorage(offline);
      setManualOfflineModeState(offline);

      if (offline) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'SET_PRESENCE_OFFLINE' }));
          } catch {
            // ignore
          }
          try {
            wsRef.current.close();
          } catch {
            // ignore
          }
        }
        showToast({
          title: 'Mode Hors ligne activé 📴',
          message:
            'Tu apparais hors ligne. Continue d’utiliser l’app : tout sera synchronisé au retour en ligne.',
          icon: '📴',
          type: 'info',
        });
      } else {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'SET_PRESENCE_ONLINE' }));
          } catch {
            // ignore
          }
        }
        showToast({
          title: navigator.onLine ? 'Mode En ligne activé 🌐' : 'En attente de réseau 📡',
          message: navigator.onLine
            ? 'Connexion temps réel reprise et synchronisation en cours.'
            : 'Le mode manuel est désactivé, reprise automatique dès que le réseau revient.',
          icon: '🌐',
          type: 'success',
        });
        if (navigator.onLine) {
          void syncOfflineQueueNow(true);
        }
      }
    },
    [showToast, syncOfflineQueueNow]
  );

  const toggleOnlineOfflineMode = useCallback(() => {
    setManualOfflineMode(!manualOfflineMode);
  }, [manualOfflineMode, setManualOfflineMode]);

  useEffect(() => {
    if (!isOnlineMode) return;
    const timer = window.setTimeout(() => {
      void syncOfflineQueueNow();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [isOnlineMode, syncOfflineQueueNow]);

  // Flush profile immediately when mobile Home Screen PWA goes background / closes
  useEffect(() => {
    const flushNow = () => {
      persistUserSafely(userLatestRef.current);
    };
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', flushNow);
      window.removeEventListener('beforeunload', flushNow);
    };
  }, [persistUserSafely]);

  // Dynamic Web App Manifest handoff for mobile browser -> Home Screen PWA continuity
  useEffect(() => {
    if (typeof document === 'undefined' || isStandalonePWA()) return;
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!manifestLink) return;
    const token = authTokenState || authTokenRef.current;
    const sbUid = user.supabaseUserId || supabaseUserIdRef.current;
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (sbUid) params.set('sb_uid', sbUid);
    const qs = params.toString();
    manifestLink.href = qs ? `/api/manifest.webmanifest?${qs}` : '/manifest.webmanifest';
  }, [authTokenState, user.supabaseUserId]);

  const [isSensitiveCodesUnlocked, setIsSensitiveCodesUnlocked] = useState<boolean>(false);
  const hasAccountPassword = Boolean(authAccount?.hasPassword || user.hasAccountPassword);

  const lockSensitiveCodes = useCallback(() => {
    setIsSensitiveCodesUnlocked(false);
  }, []);

  const unlockSensitiveCodesWithPassword = useCallback(
    async (password: string): Promise<{ success: boolean; error?: string }> => {
      const cleanPass = password.trim();
      if (!cleanPass) {
        return { success: false, error: 'Entre ton mot de passe.' };
      }
      if (!authTokenRef.current) {
        return { success: false, error: 'Session requise. Connecte-toi pour vérifier.' };
      }
      try {
        const res = await authFetch('/api/auth/verify-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: cleanPass }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          verified?: boolean;
          error?: string;
        } | null;
        if (!res.ok || !data?.success) {
          return { success: false, error: data?.error || 'Mot de passe incorrect.' };
        }
        setIsSensitiveCodesUnlocked(true);
        soundEngine.playKeyTurn();
        return { success: true };
      } catch {
        return { success: false, error: 'Erreur réseau lors de la vérification.' };
      }
    },
    [authFetch]
  );

  const setAccountPassword = useCallback(
    async (newPassword: string, currentPassword?: string): Promise<{ success: boolean; error?: string }> => {
      const cleanNew = newPassword.trim();
      if (cleanNew.length < 4) {
        return { success: false, error: 'Le mot de passe doit contenir au moins 4 caractères.' };
      }
      try {
        const res = await authFetch('/api/auth/set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newPassword: cleanNew,
            ...(currentPassword ? { currentPassword: currentPassword.trim() } : {}),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          token?: string;
          account?: AuthAccountInfo;
          error?: string;
        } | null;
        if (!res.ok || !data?.success || !data.account) {
          return { success: false, error: data?.error || 'Impossible de définir le mot de passe.' };
        }
        applyServerAccount(data.account, data.token || null, true);
        setIsSensitiveCodesUnlocked(true);
        soundEngine.playLockSound();
        showToast({
          title: 'Compte protégé par mot de passe 🛡️',
          message: "Ton Code d'évasion et ton identifiant USR sont désormais sécurisés.",
          icon: '🔐',
          type: 'success',
        });
        return { success: true };
      } catch {
        return { success: false, error: 'Erreur réseau.' };
      }
    },
    [authFetch, applyServerAccount, showToast]
  );

  const registerAccount = useCallback(
    async (params: {
      username: string;
      email?: string;
      password: string;
      alias?: string;
      avatar?: string;
    }): Promise<{ success: boolean; error?: string }> => {
      try {
        if (params.email && params.email.includes('@') && isSupabaseConfigured) {
          const sbRes = await signUpWithEmailPasswordSupabase(
            params.email,
            params.password,
            params.alias || params.username,
            params.avatar
          );
          if (sbRes.user) {
            supabaseUserIdRef.current = sbRes.user.id;
            await getOrCreateSupabaseProfile(sbRes.user);
          }
        }
        const res = await authFetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = await parseJsonSafe<{
          success?: boolean;
          token?: string;
          account?: AuthAccountInfo;
          error?: string;
        }>(res);
        if (!res.ok || !data?.success || !data.account) {
          return { success: false, error: data?.error || 'Inscription impossible.' };
        }
        applyServerAccount(data.account, data.token || null, true);
        const isMaster = isMasterPassUser(data.account.profile);
        showToast({
          title: isMaster
            ? `Bienvenue ${data.account.profile.alias} 👑`
            : `Compte créé : ${data.account.profile.matricule} 🔐`,
          message: isMaster
            ? 'Accès complet et illimité activé sur tous vos appareils.'
            : 'Tes clés, cadenas et achats sont désormais synchronisés sur tous tes appareils !',
          icon: isMaster ? '👑' : '📱',
          type: 'success',
        });
        return { success: true };
      } catch {
        return { success: false, error: 'Erreur réseau lors de la création du compte.' };
      }
    },
    [authFetch, applyServerAccount, showToast]
  );

  const loginAccount = useCallback(
    async (
      identifier: string,
      password: string
    ): Promise<{ success: boolean; requiresDisambiguation?: boolean; error?: string }> => {
      try {
        const cleanIdentifier = identifier.trim();
        const cleanPass = password.trim();
        if (cleanIdentifier.includes('@') && cleanPass && isSupabaseConfigured) {
          const sbLogin = await signInWithEmailPasswordSupabase(cleanIdentifier, cleanPass);
          if (sbLogin.user) {
            supabaseUserIdRef.current = sbLogin.user.id;
            hydratedSupabaseUidRef.current = sbLogin.user.id;
            const hydrated = await hydrateFromSupabaseUserRef.current(sbLogin.user, {
              announceEnter: true,
              showWelcomeToast: true,
            });
            if (hydrated) {
              return { success: true };
            }
          }
        }
        const res = await authFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: cleanIdentifier,
            password: cleanPass,
          }),
        });
        const data = await parseJsonSafe<{
          success?: boolean;
          recoveredByPasswordOnly?: boolean;
          requiresDisambiguation?: boolean;
          token?: string;
          account?: AuthAccountInfo;
          error?: string;
        }>(res);
        if (!res.ok || !data?.success || !data.account) {
          return {
            success: false,
            requiresDisambiguation: Boolean(data?.requiresDisambiguation),
            error: data?.error || 'Identifiant ou mot de passe incorrect.',
          };
        }

        // Enrichir le profil récupéré avec les sauvegardes cloud (Supabase) et IndexedDB pour ne JAMAIS perdre bio ni médias
        const srvProfile = data.account.profile;
        const sbUid = data.account.supabaseUserId || srvProfile.supabaseUserId;
        const [idbById, idbByMat, idbByAlias, idbByRef, cloudSnap, sbRow] = await Promise.all([
          loadProfileBackupFromIdb(srvProfile.id),
          srvProfile.matricule ? loadProfileBackupFromIdb(srvProfile.matricule) : Promise.resolve(null),
          srvProfile.alias && srvProfile.alias !== 'Spectre En Quête'
            ? loadProfileBackupFromIdb(`alias:${srvProfile.alias.trim().toLowerCase()}`)
            : cleanIdentifier
            ? loadProfileBackupFromIdb(`alias:${cleanIdentifier.toLowerCase()}`)
            : Promise.resolve(null),
          srvProfile.referralCode
            ? loadProfileBackupFromIdb(`ref:${srvProfile.referralCode.trim().toUpperCase()}`)
            : cleanIdentifier
            ? loadProfileBackupFromIdb(`ref:${cleanIdentifier.toUpperCase()}`)
            : Promise.resolve(null),
          sbUid ? loadCloudProfileSnapshot(sbUid) : loadCloudProfileSnapshot(srvProfile.id),
          sbUid ? fetchSupabaseProfileById(sbUid) : Promise.resolve(null),
        ]);
        let localArchive: UserProfile | null = null;
        try {
          const rawArch =
            window.localStorage.getItem(`evasion_archive_${srvProfile.id}`) ||
            (srvProfile.matricule ? window.localStorage.getItem(`evasion_archive_mat_${srvProfile.matricule}`) : null) ||
            (srvProfile.alias ? window.localStorage.getItem(`evasion_archive_alias_${srvProfile.alias.toLowerCase()}`) : null);
          if (rawArch) localArchive = JSON.parse(rawArch);
        } catch {
          // ignore
        }
        const localBackup = idbById || idbByMat || idbByAlias || idbByRef || localArchive;
        const mediaMap = new Map<string, ProfileUniverseItem>();
        const collectMedia = (list?: ProfileUniverseItem[] | null) => {
          if (!Array.isArray(list)) return;
          for (const item of list) {
            if (!item || !item.id || !item.url) continue;
            const prev = mediaMap.get(item.id);
            const isRemote = !item.url.startsWith('idb://') && !item.url.startsWith('blob:');
            if (!prev || isRemote) mediaMap.set(item.id, item);
          }
        };
        collectMedia(localArchive?.universeMedia);
        collectMedia(localBackup?.universeMedia);
        collectMedia(sbRow?.universe_media);
        collectMedia(cloudSnap?.universeMedia);
        collectMedia(srvProfile.universeMedia);

        const enrichedProfile: UserProfile = {
          ...srvProfile,
          alias:
            srvProfile.alias && srvProfile.alias !== 'Spectre En Quête'
              ? srvProfile.alias
              : cloudSnap?.alias || sbRow?.username || localBackup?.alias || srvProfile.alias,
          bio: srvProfile.bio || cloudSnap?.bio || sbRow?.bio || localBackup?.bio,
          avatar:
            srvProfile.avatar && srvProfile.avatar !== '⛓️'
              ? srvProfile.avatar
              : cloudSnap?.avatar || sbRow?.avatar_url || localBackup?.avatar || srvProfile.avatar,
          profileMusic:
            srvProfile.profileMusic || cloudSnap?.profileMusic || sbRow?.profile_music || localBackup?.profileMusic,
          activeFlame:
            srvProfile.activeFlame || cloudSnap?.activeFlame || sbRow?.active_flame || localBackup?.activeFlame,
          universeMedia: Array.from(mediaMap.values()),
          keysAvailable: Math.max(
            srvProfile.keysAvailable || 0,
            cloudSnap?.keysAvailable || 0,
            localBackup?.keysAvailable || 0
          ),
          padlocksAvailable: Math.max(
            srvProfile.padlocksAvailable || 0,
            cloudSnap?.padlocksAvailable || 0,
            localBackup?.padlocksAvailable || 0
          ),
          points: Math.max(srvProfile.points || 0, cloudSnap?.points || 0, localBackup?.points || 0),
          completedMissionsCount: Math.max(
            srvProfile.completedMissionsCount || 0,
            cloudSnap?.completedMissionsCount || 0,
            localBackup?.completedMissionsCount || 0
          ),
          screenTimeSavedMinutes: Math.max(
            srvProfile.screenTimeSavedMinutes || 0,
            cloudSnap?.screenTimeSavedMinutes || 0,
            localBackup?.screenTimeSavedMinutes || 0
          ),
        };
        const enrichedAccount: AuthAccountInfo = {
          ...data.account,
          profile: enrichedProfile,
        };
        try {
          window.localStorage.setItem('evasion_entered_connected', '1');
        } catch {
          // ignore
        }
        applyServerAccount(enrichedAccount, data.token || null, true);
        const isMaster = isMasterPassUser(enrichedProfile);
        const label =
          enrichedProfile.alias && enrichedProfile.alias !== 'Spectre En Quête'
            ? enrichedProfile.alias
            : enrichedProfile.matricule;
        showToast({
          title: isMaster
            ? `Connecté · ${enrichedProfile.alias} 👑`
            : data.recoveredByPasswordOnly
            ? `Compte retrouvé · ${label} 🔐`
            : `Connecté · ${enrichedProfile.matricule} ✅`,
          message: isMaster
            ? 'Accès complet et illimité activé sans contrainte.'
            : `Profil restauré : ${enrichedProfile.keysAvailable} 🔑 · ${enrichedProfile.padlocksAvailable} 🔒 · ${(enrichedProfile.universeMedia || []).length} média(s).`,
          icon: isMaster ? '👑' : '🔄',
          type: 'success',
        });
        return { success: true };
      } catch {
        return { success: false, error: 'Erreur réseau lors de la connexion.' };
      }
    },
    [authFetch, applyServerAccount, showToast]
  );

  const logoutAccount = useCallback(async () => {
    try {
      const activeUser = userLatestRef.current || user;
      if (activeUser && activeUser.id) {
        window.localStorage.setItem(`evasion_archive_${activeUser.id}`, JSON.stringify(activeUser));
        if (activeUser.matricule) {
          window.localStorage.setItem(`evasion_archive_mat_${activeUser.matricule}`, JSON.stringify(activeUser));
        }
        if (activeUser.alias) {
          window.localStorage.setItem(`evasion_archive_alias_${activeUser.alias.toLowerCase()}`, JSON.stringify(activeUser));
        }
        window.localStorage.setItem('evasion_last_active_account_id', activeUser.id);
      }
      window.localStorage.removeItem('evasion_entered_connected');
      window.localStorage.removeItem('evasion_google_accounts_v1');
    } catch {
      // ignore
    }
    // Ne jamais détruire la sauvegarde locale de profil afin de pouvoir reprendre ses médias et clés à la reconnexion
    await signOutSupabase();
    stopAmbientTrack();
    supabaseUserIdRef.current = null;
    hydratedSupabaseUidRef.current = null;
    hydrationInFlightRef.current = null;
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    pendingUniverseItemsRef.current.clear();
    deletedUniverseIdsRef.current.clear();
    currentUserUniverseRef.current = [];
    avatarClearedRef.current = false;
    musicClearedRef.current = false;
    flameClearedRef.current = false;
    applyServerAccount(null, null, true);
    setAuthTokenState(null);
    authTokenRef.current = null;
    writeStoredAuthToken(null);
    const fresh = createInitialUser();
    userIdRef.current = fresh.id;
    userMatriculeRef.current = fresh.matricule;
    userLatestRef.current = fresh;
    setUser(fresh);
    persistUserSafely(fresh);
    try {
      const autoRes = await fetch('/api/auth/auto-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: fresh.id,
          matricule: fresh.matricule,
          alias: fresh.alias,
          avatar: fresh.avatar,
          referralCode: fresh.referralCode,
          forceNewSession: true,
        }),
      });
      if (autoRes.ok) {
        const autoData = (await autoRes.json()) as {
          success?: boolean;
          token?: string;
          account?: AuthAccountInfo;
        };
        if (autoData.success && autoData.account) {
          applyServerAccount(autoData.account, autoData.token || null, true);
        }
      }
    } catch {
      // ignore
    }
    try {
      window.dispatchEvent(new CustomEvent('evasion:logout'));
    } catch {
      // ignore
    }
    showToast({
      title: 'Déconnecté sur cet appareil',
      message: 'Ton profil reste sauvegardé. Reconnecte-toi à tout moment avec Google, ton pseudo ou ton mot de passe.',
      type: 'info',
    });
  }, [authFetch, applyServerAccount, persistUserSafely, showToast]);

  const enterFreshZeroSession = useCallback(
    async (customAlias?: string, customAvatar?: string) => {
      void clearLatestProfileBackupFromIdb();
      try {
        await authFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // ignore network errors during logout
      }
      authTokenRef.current = null;
      writeStoredAuthToken(null);
      setAuthAccount(null);
      setIsSensitiveCodesUnlocked(false);
      pendingUniverseItemsRef.current.clear();
      deletedUniverseIdsRef.current.clear();
      currentUserUniverseRef.current = [];
      avatarClearedRef.current = false;
      musicClearedRef.current = false;
      flameClearedRef.current = false;

      const fresh = createInitialUser();
      if (customAlias && customAlias.trim()) {
        fresh.alias = customAlias.trim().slice(0, 32);
      }
      if (customAvatar && customAvatar.trim()) {
        fresh.avatar = customAvatar.trim().slice(0, 200000);
      }

      userIdRef.current = fresh.id;
      userMatriculeRef.current = fresh.matricule;
      userLatestRef.current = fresh;
      setUser(fresh);
      persistUserSafely(fresh);
      setDetoxSession({
        isActive: false,
        durationMinutes: 15,
        startedAt: null,
        targetEndTime: null,
        ambientSound: false,
      });

      try {
        const autoRes = await fetch('/api/auth/auto-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: fresh.id,
            matricule: fresh.matricule,
            alias: fresh.alias,
            avatar: fresh.avatar,
            referralCode: fresh.referralCode,
            forceNewSession: true,
          }),
        });
        if (autoRes.ok) {
          const autoData = (await autoRes.json()) as {
            success?: boolean;
            token?: string;
            account?: AuthAccountInfo;
          };
          if (autoData.success && autoData.account) {
            applyServerAccount(autoData.account, autoData.token || null, true);
          }
        }
      } catch {
        // fallback stays cleanly zeroed locally
      }
    },
    [authFetch, applyServerAccount, persistUserSafely]
  );

  const createProtectedAnonymousSession = useCallback(
    async (
      password?: string,
      avatar?: string
    ): Promise<{ success: boolean; account?: AuthAccountInfo; error?: string }> => {
      try {
        const res = await authFetch('/api/auth/anonymous-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(typeof password === 'string' && password.trim() ? { password: password.trim() } : {}),
            ...(avatar ? { avatar } : {}),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          token?: string;
          account?: AuthAccountInfo;
          error?: string;
        } | null;
        if (!res.ok || !data?.success || !data.account) {
          return { success: false, error: data?.error || 'Impossible de créer la session anonyme.' };
        }
        applyServerAccount(data.account, data.token || null, true);
        setIsSensitiveCodesUnlocked(false);
        setDetoxSession({
          isActive: false,
          durationMinutes: 15,
          startedAt: null,
          targetEndTime: null,
          ambientSound: false,
        });
        return { success: true, account: data.account };
      } catch {
        return { success: false, error: 'Erreur réseau lors de la création de la session.' };
      }
    },
    [authFetch, applyServerAccount]
  );

  const rotatePublicShareSlug = useCallback(async (): Promise<{
    success: boolean;
    publicShareSlug?: string;
    error?: string;
  }> => {
    try {
      const res = await authFetch('/api/auth/rotate-share-slug', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        account?: AuthAccountInfo;
        error?: string;
      } | null;
      if (!res.ok || !data?.success || !data.account) {
        return { success: false, error: data?.error || "Impossible de changer l'URL anonyme." };
      }
      applyServerAccount(data.account);
      showToast({
        title: 'Nouvelle URL anonyme générée 🔄',
        message: `/?univers=${data.account.profile.publicShareSlug}`,
        icon: '🔗',
        type: 'success',
      });
      return { success: true, publicShareSlug: data.account.profile.publicShareSlug };
    } catch {
      return { success: false, error: 'Erreur réseau.' };
    }
  }, [authFetch, applyServerAccount, showToast]);

  const connectWithPseudo = useCallback(
    async (
      pseudo: string,
      avatar?: string,
      password?: string
    ): Promise<{
      success: boolean;
      restored?: boolean;
      requiresPassword?: boolean;
      account?: AuthAccountInfo;
      error?: string;
    }> => {
      const cleanPseudo = pseudo.trim().slice(0, 32);
      if (cleanPseudo.length < 2) {
        return { success: false, error: 'Entre un pseudo d’au moins 2 caractères.' };
      }

      try {
        const preLocalBackup = await loadProfileBackupFromIdb(`alias:${cleanPseudo.toLowerCase()}`);
        const sanitizedLocalProfile = preLocalBackup
          ? {
              ...preLocalBackup,
              avatar:
                typeof preLocalBackup.avatar === 'string' && !preLocalBackup.avatar.startsWith('data:')
                  ? preLocalBackup.avatar
                  : undefined,
              universeMedia: (preLocalBackup.universeMedia || []).filter(
                (m) => m && m.id && m.url && !m.url.startsWith('data:')
              ),
            }
          : undefined;
        const res = await authFetch('/api/auth/pseudo-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pseudo: cleanPseudo,
            avatar,
            ...(typeof password === 'string' && password.trim() ? { password: password.trim() } : {}),
            ...(sanitizedLocalProfile ? { localProfile: sanitizedLocalProfile } : {}),
          }),
        });
        const data = await parseJsonSafe<{
          success?: boolean;
          restored?: boolean;
          requiresPassword?: boolean;
          token?: string;
          account?: AuthAccountInfo;
          error?: string;
        }>(res);

        if (!res.ok || !data?.success || !data.account) {
          return {
            success: false,
            requiresPassword: Boolean(data?.requiresPassword),
            error: data?.error || 'Connexion impossible avec ce pseudo.',
          };
        }

        const srvProfile = data.account.profile;
        const sbUid = data.account.supabaseUserId || srvProfile.supabaseUserId;
        const [idbById, idbByMat, cloudSnap] = await Promise.all([
          loadProfileBackupFromIdb(srvProfile.id),
          srvProfile.matricule ? loadProfileBackupFromIdb(srvProfile.matricule) : Promise.resolve(null),
          sbUid ? loadCloudProfileSnapshot(sbUid) : loadCloudProfileSnapshot(srvProfile.id),
        ]);
        const localBackup = idbById || idbByMat || preLocalBackup;
        const mediaMap = new Map<string, ProfileUniverseItem>();
        const pushList = (list?: ProfileUniverseItem[] | null) => {
          if (!Array.isArray(list)) return;
          for (const item of list) {
            if (!item || !item.id || !item.url) continue;
            const prev = mediaMap.get(item.id);
            const isRemote = !item.url.startsWith('idb://') && !item.url.startsWith('blob:');
            if (!prev || isRemote) mediaMap.set(item.id, item);
          }
        };
        pushList(localBackup?.universeMedia);
        pushList(cloudSnap?.universeMedia);
        pushList(srvProfile.universeMedia);

        const mergedProfile: UserProfile = {
          ...srvProfile,
          bio: srvProfile.bio || cloudSnap?.bio || localBackup?.bio,
          avatar:
            srvProfile.avatar && srvProfile.avatar !== '⛓️'
              ? srvProfile.avatar
              : cloudSnap?.avatar || localBackup?.avatar || srvProfile.avatar,
          profileMusic: srvProfile.profileMusic || cloudSnap?.profileMusic || localBackup?.profileMusic,
          activeFlame: srvProfile.activeFlame || cloudSnap?.activeFlame || localBackup?.activeFlame,
          universeMedia: Array.from(mediaMap.values()),
          keysAvailable: Math.max(
            srvProfile.keysAvailable || 0,
            cloudSnap?.keysAvailable || 0,
            localBackup?.keysAvailable || 0
          ),
          padlocksAvailable: Math.max(
            srvProfile.padlocksAvailable || 0,
            cloudSnap?.padlocksAvailable || 0,
            localBackup?.padlocksAvailable || 0
          ),
          points: Math.max(srvProfile.points || 0, cloudSnap?.points || 0, localBackup?.points || 0),
        };
        const mergedAcc: AuthAccountInfo = {
          ...data.account,
          profile: mergedProfile,
        };
        try {
          window.localStorage.setItem('evasion_entered_connected', '1');
        } catch {
          // ignore
        }
        applyServerAccount(mergedAcc, data.token || null, true);
        setIsSensitiveCodesUnlocked(false);
        if (!data.restored) {
          setDetoxSession({
            isActive: false,
            durationMinutes: 15,
            startedAt: null,
            targetEndTime: null,
            ambientSound: false,
          });
        }
        const isMaster = isMasterPassUser(mergedProfile);
        const rawAvatar = mergedProfile.avatar || '🆔';
        const safeToastIcon =
          rawAvatar.startsWith('/') ||
          rawAvatar.startsWith('data:') ||
          rawAvatar.startsWith('http') ||
          rawAvatar.startsWith('idb://')
            ? '🆔'
            : rawAvatar;
        showToast({
          title: isMaster
            ? `Connecté · ${mergedProfile.alias} 👑`
            : data.restored
            ? `Bon retour ${mergedProfile.alias} !`
            : `Bienvenue ${mergedProfile.alias} (0 🔑)`,
          message: isMaster
            ? 'Accès complet débloqué sans aucune contrainte.'
            : data.restored
            ? `Profil restauré : ${mergedProfile.keysAvailable} 🔑 · ${mergedProfile.padlocksAvailable} 🔒.`
            : 'Session démarrée avec ton pseudo personnel.',
          icon: isMaster ? '👑' : safeToastIcon,
          type: 'success',
        });
        return { success: true, restored: Boolean(data.restored), account: mergedAcc };
      } catch {
        return { success: false, error: 'Erreur réseau lors de la connexion au serveur.' };
      }
    },
    [authFetch, applyServerAccount, showToast]
  );

  const hydrateFromSupabaseUser = useCallback(
    async (
      sbUser: {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
        email_confirmed_at?: string;
        identities?: Array<{ provider?: string }>;
      },
      options?: { announceEnter?: boolean; showWelcomeToast?: boolean }
    ): Promise<AuthAccountInfo | null> => {
      if (!sbUser?.id) return null;

      // Dédupliquer les appels concurrents (ex: onAuthStateChange + getSession() simultanés)
      if (hydrationInFlightRef.current && hydrationInFlightRef.current.uid === sbUser.id) {
        const res = await hydrationInFlightRef.current.promise;
        if (options?.announceEnter && res && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('evasion:supabase-auth-enter'));
        }
        return res;
      }

      const runHydration = async (): Promise<AuthAccountInfo | null> => {
        supabaseUserIdRef.current = sbUser.id;
        const [sbResult, cloudSnap, idbBackup] = await Promise.all([
          getOrCreateSupabaseProfile(sbUser as Parameters<typeof getOrCreateSupabaseProfile>[0]),
          loadCloudProfileSnapshot(sbUser.id),
          loadProfileBackupFromIdb(sbUser.id),
        ]);
        const localSameUser =
          userLatestRef.current?.supabaseUserId === sbUser.id ? userLatestRef.current : null;

        const meta = (sbUser.user_metadata || {}) as Record<string, unknown>;
        const rawDisplayName =
          (cloudSnap?.alias && cloudSnap.alias !== 'Spectre En Quête' ? cloudSnap.alias : undefined) ||
          (sbResult.profile?.username && sbResult.profile.username !== 'Membre ÉVASION'
            ? sbResult.profile.username
            : undefined) ||
          (localSameUser?.alias && localSameUser.alias !== 'Spectre En Quête'
            ? localSameUser.alias
            : undefined) ||
          (idbBackup?.alias && idbBackup.alias !== 'Spectre En Quête' ? idbBackup.alias : undefined) ||
          (typeof meta.full_name === 'string' ? meta.full_name : undefined) ||
          (typeof meta.name === 'string' ? meta.name : undefined) ||
          sbUser.email?.split('@')[0] ||
          undefined;

        const isExplicitAvatarDeleted = Boolean(
          !sbResult.isNew &&
            sbResult.profile &&
            'avatar_url' in sbResult.profile &&
            sbResult.profile.avatar_url === null &&
            (!cloudSnap || !cloudSnap.avatar)
        );
        const rawPhoto = isExplicitAvatarDeleted
          ? ''
          : (cloudSnap?.avatar && cloudSnap.avatar !== '⛓️' ? cloudSnap.avatar : undefined) ||
            sbResult.profile?.avatar_url ||
            (localSameUser?.avatar && localSameUser.avatar !== '⛓️' ? localSameUser.avatar : undefined) ||
            (idbBackup?.avatar && idbBackup.avatar !== '⛓️' ? idbBackup.avatar : undefined) ||
            (!sbResult.isNew && sbResult.profile
              ? ''
              : (typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined) ||
                (typeof meta.picture === 'string' ? meta.picture : undefined) ||
                undefined);

        const collectUnionMedia = (
          ...lists: Array<ProfileUniverseItem[] | null | undefined>
        ): ProfileUniverseItem[] => {
          const map = new Map<string, ProfileUniverseItem>();
          for (const list of lists) {
            if (!Array.isArray(list)) continue;
            for (const item of list) {
              if (!item || !item.id || !item.url) continue;
              if (deletedUniverseIdsRef.current.has(item.id)) continue;
              const existing = map.get(item.id);
              const isRemote = !item.url.startsWith('idb://') && !item.url.startsWith('blob:');
              if (!existing || isRemote) {
                map.set(item.id, item);
              }
            }
          }
          return Array.from(map.values());
        };

        const preMergedMedia = collectUnionMedia(
          idbBackup?.universeMedia,
          localSameUser?.universeMedia,
          sbResult.profile?.universe_media,
          cloudSnap?.universeMedia
        );

        const pdRaw = (sbResult.profile?.profile_data || {}) as Record<string, unknown>;
        const todayIso = new Date().toISOString().slice(0, 10);

        const pickUnionBadges = (
          ...lists: Array<UserProfile['badges'] | undefined>
        ): UserProfile['badges'] => {
          const bMap = new Map<string, UserProfile['badges'][number]>();
          for (const list of lists) {
            if (!Array.isArray(list)) continue;
            for (const b of list) {
              if (b?.id && !bMap.has(b.id)) bMap.set(b.id, b);
            }
          }
          return Array.from(bMap.values());
        };
        const pickEarliestDate = (...dates: Array<string | undefined>): string | undefined => {
          const valid = dates.filter((d): d is string => Boolean(d && typeof d === 'string'));
          if (valid.length === 0) return undefined;
          return valid.sort()[0];
        };
        const numVal = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

        const preMergedBio =
          cloudSnap?.bio || sbResult.profile?.bio || localSameUser?.bio || idbBackup?.bio || null;
        const isExplicitMusicDeleted = Boolean(
          !sbResult.isNew &&
            sbResult.profile &&
            'profile_music' in sbResult.profile &&
            sbResult.profile.profile_music === null &&
            (!cloudSnap || !cloudSnap.profileMusic)
        );
        const preMergedMusic = isExplicitMusicDeleted
          ? null
          : cloudSnap?.profileMusic ||
            sbResult.profile?.profile_music ||
            localSameUser?.profileMusic ||
            idbBackup?.profileMusic ||
            null;
        const preMergedFlame =
          cloudSnap?.activeFlame ||
          sbResult.profile?.active_flame ||
          localSameUser?.activeFlame ||
          idbBackup?.activeFlame ||
          null;

        const preMergedProfileData: Partial<UserProfile> = {
          ...(pdRaw as Partial<UserProfile>),
          id:
            (typeof pdRaw.id === 'string' && pdRaw.id) ||
            sbResult.profile?.evasion_user_id ||
            cloudSnap?.id ||
            localSameUser?.id ||
            idbBackup?.id ||
            undefined,
          matricule:
            (typeof pdRaw.matricule === 'string' && pdRaw.matricule) ||
            cloudSnap?.matricule ||
            localSameUser?.matricule ||
            idbBackup?.matricule ||
            undefined,
          referralCode:
            (typeof pdRaw.referralCode === 'string' && pdRaw.referralCode) ||
            cloudSnap?.referralCode ||
            localSameUser?.referralCode ||
            idbBackup?.referralCode ||
            undefined,
          alias: rawDisplayName,
          bio: preMergedBio ?? undefined,
          profileType:
            cloudSnap?.profileType ||
            (pdRaw.profileType as UserProfile['profileType']) ||
            localSameUser?.profileType ||
            idbBackup?.profileType,
          neonColor:
            (cloudSnap?.neonColor && cloudSnap.neonColor !== 'red' ? cloudSnap.neonColor : undefined) ||
            (pdRaw.neonColor as NeonColor | undefined) ||
            localSameUser?.neonColor ||
            idbBackup?.neonColor,
          cellBorderFrame:
            (cloudSnap?.cellBorderFrame && cloudSnap.cellBorderFrame !== 'none'
              ? cloudSnap.cellBorderFrame
              : undefined) ||
            (pdRaw.cellBorderFrame as CellFrame | undefined) ||
            localSameUser?.cellBorderFrame ||
            idbBackup?.cellBorderFrame,
          isUniversePublic:
            cloudSnap?.isUniversePublic ??
            (typeof pdRaw.isUniversePublic === 'boolean' ? pdRaw.isUniversePublic : undefined) ??
            localSameUser?.isUniversePublic ??
            idbBackup?.isUniversePublic,
          keysAvailable: Math.max(
            numVal(pdRaw.keysAvailable),
            cloudSnap?.keysAvailable || 0,
            localSameUser?.keysAvailable || 0,
            idbBackup?.keysAvailable || 0
          ),
          padlocksAvailable: Math.max(
            numVal(pdRaw.padlocksAvailable),
            cloudSnap?.padlocksAvailable || 0,
            localSameUser?.padlocksAvailable || 0,
            idbBackup?.padlocksAvailable || 0
          ),
          points: Math.max(
            numVal(pdRaw.points),
            cloudSnap?.points || 0,
            localSameUser?.points || 0,
            idbBackup?.points || 0
          ),
          completedMissionsCount: Math.max(
            numVal(pdRaw.completedMissionsCount),
            cloudSnap?.completedMissionsCount || 0,
            localSameUser?.completedMissionsCount || 0,
            idbBackup?.completedMissionsCount || 0
          ),
          screenTimeSavedMinutes: Math.max(
            numVal(pdRaw.screenTimeSavedMinutes),
            cloudSnap?.screenTimeSavedMinutes || 0,
            localSameUser?.screenTimeSavedMinutes || 0,
            idbBackup?.screenTimeSavedMinutes || 0
          ),
          keysGivenTotal: Math.max(
            numVal(pdRaw.keysGivenTotal),
            cloudSnap?.keysGivenTotal || 0,
            localSameUser?.keysGivenTotal || 0,
            idbBackup?.keysGivenTotal || 0
          ),
          escapedCount: Math.max(
            numVal(pdRaw.escapedCount),
            cloudSnap?.escapedCount || 0,
            localSameUser?.escapedCount || 0,
            idbBackup?.escapedCount || 0
          ),
          hasPassePartoutCount: Math.max(
            numVal(pdRaw.hasPassePartoutCount),
            cloudSnap?.hasPassePartoutCount || 0,
            localSameUser?.hasPassePartoutCount || 0,
            idbBackup?.hasPassePartoutCount || 0
          ),
          streakDays: Math.max(
            1,
            numVal(pdRaw.streakDays),
            cloudSnap?.streakDays || 1,
            localSameUser?.streakDays || 1,
            idbBackup?.streakDays || 1
          ),
          isStreakProtectedByPadlock: Boolean(
            pdRaw.isStreakProtectedByPadlock ||
              cloudSnap?.isStreakProtectedByPadlock ||
              localSameUser?.isStreakProtectedByPadlock ||
              idbBackup?.isStreakProtectedByPadlock
          ),
          badges: pickUnionBadges(
            Array.isArray(pdRaw.badges) ? (pdRaw.badges as UserProfile['badges']) : undefined,
            cloudSnap?.badges,
            localSameUser?.badges,
            idbBackup?.badges
          ),
          purchasedKits: Array.from(
            new Set([
              ...(Array.isArray(pdRaw.purchasedKits) ? (pdRaw.purchasedKits as string[]) : []),
              ...(cloudSnap?.purchasedKits || []),
              ...(localSameUser?.purchasedKits || []),
              ...(idbBackup?.purchasedKits || []),
            ])
          ),
          lockedTemptations: Array.from(
            new Set([
              ...(Array.isArray(pdRaw.lockedTemptations) ? (pdRaw.lockedTemptations as string[]) : []),
              ...(cloudSnap?.lockedTemptations || []),
              ...(localSameUser?.lockedTemptations || []),
              ...(idbBackup?.lockedTemptations || []),
            ])
          ).slice(0, 8),
          firstJoinedDate: pickEarliestDate(
            typeof pdRaw.firstJoinedDate === 'string' ? pdRaw.firstJoinedDate : undefined,
            cloudSnap?.firstJoinedDate,
            localSameUser?.firstJoinedDate,
            idbBackup?.firstJoinedDate
          ),
          dailyMissionCompletedDate:
            pdRaw.dailyMissionCompletedDate === todayIso ||
            cloudSnap?.dailyMissionCompletedDate === todayIso ||
            localSameUser?.dailyMissionCompletedDate === todayIso ||
            idbBackup?.dailyMissionCompletedDate === todayIso
              ? todayIso
              : (typeof pdRaw.dailyMissionCompletedDate === 'string'
                  ? pdRaw.dailyMissionCompletedDate
                  : undefined) ||
                cloudSnap?.dailyMissionCompletedDate ||
                localSameUser?.dailyMissionCompletedDate ||
                idbBackup?.dailyMissionCompletedDate,
          lastMidnightResetDate:
            pdRaw.lastMidnightResetDate === todayIso ||
            cloudSnap?.lastMidnightResetDate === todayIso ||
            localSameUser?.lastMidnightResetDate === todayIso ||
            idbBackup?.lastMidnightResetDate === todayIso
              ? todayIso
              : (typeof pdRaw.lastMidnightResetDate === 'string'
                  ? pdRaw.lastMidnightResetDate
                  : undefined) ||
                cloudSnap?.lastMidnightResetDate ||
                localSameUser?.lastMidnightResetDate ||
                idbBackup?.lastMidnightResetDate,
          universeStorageQuota: Math.max(
            BASE_FREE_UNIVERSE_QUOTA,
            numVal(pdRaw.universeStorageQuota),
            cloudSnap?.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA,
            localSameUser?.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA,
            idbBackup?.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA
          ),
          isUniverseStorageUnlimited: Boolean(
            pdRaw.isUniverseStorageUnlimited ||
              cloudSnap?.isUniverseStorageUnlimited ||
              localSameUser?.isUniverseStorageUnlimited ||
              idbBackup?.isUniverseStorageUnlimited
          ),
        };

        const existingSnapshot: SupabaseProfileRow | null =
          sbResult.profile || cloudSnap || idbBackup || localSameUser
            ? {
                id: sbUser.id,
                email: sbResult.profile?.email ?? sbUser.email ?? null,
                username: rawDisplayName ?? sbResult.profile?.username ?? null,
                avatar_url: isExplicitAvatarDeleted ? null : rawPhoto || null,
                is_verified: Boolean(sbResult.profile?.is_verified ?? true),
                evasion_user_id:
                  sbResult.profile?.evasion_user_id ||
                  cloudSnap?.id ||
                  localSameUser?.id ||
                  idbBackup?.id ||
                  null,
                bio: preMergedBio,
                profile_music: preMergedMusic,
                universe_media: preMergedMedia.length > 0 ? preMergedMedia : null,
                active_flame: preMergedFlame,
                profile_data: preMergedProfileData,
              }
            : null;

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const supabaseAccessToken = sessionData?.session?.access_token;
          if (!supabaseAccessToken) {
            return null;
          }
          const res = await authFetch('/api/auth/google-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supabaseAccessToken,
              existingSupabaseProfile: existingSnapshot,
            }),
          });
          const data = (await res.json().catch(() => null)) as {
            success?: boolean;
            restored?: boolean;
            token?: string;
            account?: AuthAccountInfo;
          } | null;

          if (res.ok && data?.success && data.account) {
            const srvProf = data.account.profile;
            const resolvedMissionDate =
              preMergedProfileData.dailyMissionCompletedDate === todayIso ||
              srvProf.dailyMissionCompletedDate === todayIso
                ? todayIso
                : srvProf.dailyMissionCompletedDate || preMergedProfileData.dailyMissionCompletedDate;
            const resolvedMidnightDate =
              preMergedProfileData.lastMidnightResetDate === todayIso ||
              srvProf.lastMidnightResetDate === todayIso
                ? todayIso
                : srvProf.lastMidnightResetDate || preMergedProfileData.lastMidnightResetDate;

            const finalMedia = collectUnionMedia(preMergedMedia, srvProf.universeMedia);

            const mergedProfile: UserProfile = {
              ...srvProf,
              supabaseUserId: sbUser.id,
              isVerified: Boolean(srvProf.isVerified || sbResult.profile?.is_verified || true),
              alias:
                rawDisplayName && rawDisplayName !== 'Spectre En Quête'
                  ? srvProf.alias === 'Spectre En Quête' || !srvProf.alias
                    ? rawDisplayName
                    : srvProf.alias
                  : srvProf.alias,
              bio: srvProf.bio || preMergedBio || undefined,
              avatar: isExplicitAvatarDeleted
                ? ''
                : srvProf.avatar && srvProf.avatar !== '⛓️'
                ? srvProf.avatar
                : rawPhoto || '',
              profileMusic: isExplicitMusicDeleted
                ? undefined
                : preMergedMusic || srvProf.profileMusic,
              activeFlame: srvProf.activeFlame || preMergedFlame || undefined,
              universeMedia: finalMedia,
              keysAvailable: Math.max(srvProf.keysAvailable || 0, preMergedProfileData.keysAvailable || 0),
              padlocksAvailable: Math.max(
                srvProf.padlocksAvailable || 0,
                preMergedProfileData.padlocksAvailable || 0
              ),
              points: Math.max(srvProf.points || 0, preMergedProfileData.points || 0),
              completedMissionsCount: Math.max(
                srvProf.completedMissionsCount || 0,
                preMergedProfileData.completedMissionsCount || 0
              ),
              screenTimeSavedMinutes: Math.max(
                srvProf.screenTimeSavedMinutes || 0,
                preMergedProfileData.screenTimeSavedMinutes || 0
              ),
              keysGivenTotal: Math.max(srvProf.keysGivenTotal || 0, preMergedProfileData.keysGivenTotal || 0),
              escapedCount: Math.max(srvProf.escapedCount || 0, preMergedProfileData.escapedCount || 0),
              hasPassePartoutCount: Math.max(
                srvProf.hasPassePartoutCount || 0,
                preMergedProfileData.hasPassePartoutCount || 0
              ),
              streakDays: Math.max(srvProf.streakDays || 1, preMergedProfileData.streakDays || 1),
              isStreakProtectedByPadlock: Boolean(
                srvProf.isStreakProtectedByPadlock || preMergedProfileData.isStreakProtectedByPadlock
              ),
              badges: pickUnionBadges(srvProf.badges, preMergedProfileData.badges),
              purchasedKits: Array.from(
                new Set([...(srvProf.purchasedKits || []), ...(preMergedProfileData.purchasedKits || [])])
              ),
              lockedTemptations: Array.from(
                new Set([
                  ...(srvProf.lockedTemptations || []),
                  ...(preMergedProfileData.lockedTemptations || []),
                ])
              ).slice(0, 8),
              ...(preMergedProfileData.firstJoinedDate || srvProf.firstJoinedDate
                ? {
                    firstJoinedDate: pickEarliestDate(
                      srvProf.firstJoinedDate,
                      preMergedProfileData.firstJoinedDate
                    ),
                  }
                : {}),
              ...(preMergedProfileData.neonColor &&
              preMergedProfileData.neonColor !== 'red' &&
              (!srvProf.neonColor || srvProf.neonColor === 'red')
                ? { neonColor: preMergedProfileData.neonColor }
                : {}),
              ...(preMergedProfileData.cellBorderFrame &&
              preMergedProfileData.cellBorderFrame !== 'none' &&
              (!srvProf.cellBorderFrame || srvProf.cellBorderFrame === 'none')
                ? { cellBorderFrame: preMergedProfileData.cellBorderFrame }
                : {}),
              ...(preMergedProfileData.profileType && !srvProf.profileType
                ? { profileType: preMergedProfileData.profileType }
                : {}),
              isUniversePublic: srvProf.isUniversePublic ?? preMergedProfileData.isUniversePublic,
              universeStorageQuota: Math.max(
                srvProf.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA,
                preMergedProfileData.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA
              ),
              isUniverseStorageUnlimited: Boolean(
                srvProf.isUniverseStorageUnlimited || preMergedProfileData.isUniverseStorageUnlimited
              ),
              ...(resolvedMissionDate ? { dailyMissionCompletedDate: resolvedMissionDate } : {}),
              ...(resolvedMidnightDate ? { lastMidnightResetDate: resolvedMidnightDate } : {}),
            };

            const mergedAccount: AuthAccountInfo = {
              ...data.account,
              supabaseUserId: sbUser.id,
              profile: mergedProfile,
            };

            try {
              window.localStorage.setItem('evasion_entered_connected', '1');
            } catch {
              // ignore
            }

            applyServerAccount(mergedAccount, data.token || null, true);
            cloudSnapshotReadyRef.current = true;
            setIsSensitiveCodesUnlocked(false);

            // Garantir que le snapshot cloud complet existe et est à jour dans le bucket Supabase Storage
            if (
              !cloudSnap ||
              (mergedProfile.universeMedia?.length || 0) > (cloudSnap.universeMedia?.length || 0) ||
              (mergedProfile.bio && !cloudSnap.bio) ||
              (mergedProfile.keysAvailable || 0) > (cloudSnap.keysAvailable || 0)
            ) {
              void saveCloudProfileSnapshot(sbUser.id, mergedProfile);
            }

            if (sbResult.isNew) {
              void saveSupabaseProfilePatch(sbUser.id, {
                evasion_user_id: mergedProfile.id,
                is_verified: true,
              });
            }

            if (options?.announceEnter && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('evasion:supabase-auth-enter'));
            }
            if (options?.showWelcomeToast) {
              const label =
                mergedProfile.alias && mergedProfile.alias !== 'Spectre En Quête'
                  ? mergedProfile.alias
                  : mergedProfile.matricule;
              showToast({
                title:
                  !sbResult.isNew || data.restored || Boolean(cloudSnap)
                    ? `Bon retour ${label} !`
                    : `Bienvenue ${label} 🛡️`,
                message:
                  !sbResult.isNew || data.restored || Boolean(cloudSnap)
                    ? `Profil restauré sans perte · ${mergedProfile.keysAvailable} 🔑 · ${(mergedProfile.universeMedia || []).length} média(s)`
                    : 'Compte ÉVASION créé et synchronisé avec Supabase.',
                icon: '🌐',
                type: 'success',
              });
            }
            return mergedAccount;
          }
        } catch {
          // Fallback hors-ligne si serveur injoignable mais session Supabase active ou sauvegarde cloud/locale
          const fallbackBase = cloudSnap || localSameUser || idbBackup || userLatestRef.current;
          const offlineProfile: UserProfile = {
            ...fallbackBase,
            ...preMergedProfileData,
            id: preMergedProfileData.id || fallbackBase.id,
            matricule: preMergedProfileData.matricule || fallbackBase.matricule,
            supabaseUserId: sbUser.id,
            isVerified: Boolean(sbResult.profile?.is_verified ?? fallbackBase.isVerified ?? true),
            alias: rawDisplayName || fallbackBase.alias,
            bio: preMergedBio ?? fallbackBase.bio,
            avatar: isExplicitAvatarDeleted ? '' : rawPhoto || fallbackBase.avatar || '',
            profileMusic: isExplicitMusicDeleted ? undefined : preMergedMusic || fallbackBase.profileMusic,
            activeFlame: preMergedFlame || fallbackBase.activeFlame,
            universeMedia: preMergedMedia.length > 0 ? preMergedMedia : fallbackBase.universeMedia || [],
            lastActiveDate: todayIso,
          };
          const offlineAccount: AuthAccountInfo = {
            id: offlineProfile.id,
            username: offlineProfile.alias,
            email: sbUser.email || undefined,
            supabaseUserId: sbUser.id,
            hasPassword: Boolean(offlineProfile.hasAccountPassword),
            profile: offlineProfile,
          };
          try {
            window.localStorage.setItem('evasion_entered_connected', '1');
          } catch {
            // ignore
          }
          applyServerAccount(offlineAccount, authTokenRef.current || null, true);
          cloudSnapshotReadyRef.current = true;
          if (options?.announceEnter && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('evasion:supabase-auth-enter'));
          }
          return offlineAccount;
        }
        return null;
      };

      const promise = runHydration().finally(() => {
        if (hydrationInFlightRef.current?.uid === sbUser.id) {
          hydrationInFlightRef.current = null;
        }
      });
      hydrationInFlightRef.current = { uid: sbUser.id, promise };
      return promise;
    },
    [authFetch, applyServerAccount, showToast]
  );
  hydrateFromSupabaseUserRef.current = hydrateFromSupabaseUser;

  const connectWithGoogle = useCallback(
    async (params?: {
      password?: string;
    }): Promise<{
      success: boolean;
      restored?: boolean;
      redirected?: boolean;
      requiresPassword?: boolean;
      account?: AuthAccountInfo;
      error?: string;
    }> => {
      try {
        let firebaseIdToken: string | null = null;
        let verifiedEmail: string | undefined = undefined;

        try {
          const fbUser = await signInWithGooglePopup();
          if (fbUser) {
            firebaseIdToken = await fbUser.getIdToken(true);
            verifiedEmail = fbUser.email || undefined;

            if (fbUser.uid) {
              void syncGoogleAuthLinkToFirestore(fbUser, userIdRef.current || '').catch((fsErr) => {
                console.warn('Firestore syncGoogleAuthLink non bloquant:', fsErr);
              });
            }
          }
        } catch (popupErr: unknown) {
          const fbErr = popupErr as { code?: string; message?: string };
          if (
            fbErr.code === 'auth/popup-closed-by-user' ||
            fbErr.code === 'auth/cancelled-popup-request'
          ) {
            return { success: false, error: 'Connexion Google annulée.' };
          }

          // Fallback officiel et sécurisé via Google OAuth (redirection complète, aucune usurpation possible)
          if (isSupabaseConfigured) {
            const oauthRes = await signInWithGoogleSupabase();
            if (!oauthRes.error) {
              return { success: false, redirected: true };
            }
            return {
              success: false,
              error: oauthRes.error || 'Connexion Google indisponible sur ce domaine.',
            };
          }

          return {
            success: false,
            error:
              'La fenêtre Google a été bloquée ou ce domaine n’est pas autorisé. Autorise les popups puis réessaye.',
          };
        }

        if (!firebaseIdToken) {
          return {
            success: false,
            error: 'Impossible de vérifier ton compte Google. Réessaye.',
          };
        }

        // Synchroniser la session auprès du serveur ÉVASION avec preuve cryptographique Firebase ID Token
        const res = await authFetch('/api/auth/google-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firebaseIdToken,
            password: params?.password,
          }),
        });

        const data = await parseJsonSafe<{
          success?: boolean;
          restored?: boolean;
          requiresPassword?: boolean;
          token?: string;
          account?: AuthAccountInfo;
          error?: string;
        }>(res);
        if (!res.ok || !data?.success || !data.account) {
          if (data?.requiresPassword) {
            return {
              success: false,
              requiresPassword: true,
              error: data.error || 'Ce compte est protégé par un mot de passe.',
            };
          }
          const errorMsg = data?.error || 'Impossible de vérifier le compte Google.';
          showToast({
            title: 'Connexion Google refusée',
            message: errorMsg,
            type: 'warning',
          });
          return { success: false, error: errorMsg };
        }

        // Garantir le statut Profil Validé (isVerified)
        if (data.account.profile) {
          data.account.profile.isVerified = true;
        }
        if (verifiedEmail && !data.account.email) {
          data.account.email = verifiedEmail;
        }

        // Appliquer la session sur le client avec forceSwitch=true pour charger toutes ses données et médias
        applyServerAccount(data.account, data.token, true);

        showToast({
          title: 'Authentifié avec Google ✅',
          message: `Bienvenue ${data.account.profile.alias || data.account.profile.matricule} ! Tes données, médias et profil validé sont restaurés.`,
          icon: '🛡️',
          type: 'success',
        });

        if (typeof window !== 'undefined') {
          window.localStorage.setItem('evasion_entered_connected', '1');
          window.dispatchEvent(new CustomEvent('evasion:supabase-auth-enter'));
        }

        return {
          success: true,
          restored: data.restored,
          account: data.account,
        };
      } catch (err: unknown) {
        console.error('Erreur inattendue Google Auth:', err);
        const msg = err instanceof Error ? err.message : 'Erreur de connexion.';
        return { success: false, error: msg };
      }
    },
    [authFetch, applyServerAccount, showToast]
  );

  const isMasterPass = isMasterPassUser(user);
  const hasFullKeyAccess = isMasterPass || (user.keysAvailable || 0) >= MIN_KEYS_FULL_ACCESS;
  const isAuthenticated = Boolean(authAccount);

  const requireFullKeyAccess = useCallback(
    (actionName?: string): boolean => {
      if (isMasterPassUser(user)) return true;
      const currentKeys = user.keysAvailable || 0;
      if (currentKeys >= MIN_KEYS_FULL_ACCESS) return true;
      const missing = MIN_KEYS_FULL_ACCESS - currentKeys;
      showToast({
        title:
          currentKeys === 0
            ? 'Accès verrouillé · 10 🔑 requises 🔒'
            : `${MIN_KEYS_FULL_ACCESS} clés 🔑 requises pour débloquer`,
        message: actionName
          ? `« ${actionName} » se débloque dès ${MIN_KEYS_FULL_ACCESS} 🔑 (il te manque ${missing} clé${missing > 1 ? 's' : ''}). Crée des aveux sur Le Mur, valide la Mission du Jour ou passe par la Boutique !`
          : `Crée des aveux et valide la Mission du Jour pour atteindre ${MIN_KEYS_FULL_ACCESS} 🔑 et tout débloquer (sauf Live à 50 🔑).`,
        icon: '🔒',
        type: 'warning',
        action: {
          label: 'Boutique (+ Clés) 🔑',
          onClick: () => openShop(),
        },
      });
      return false;
    },
    [user, showToast, openShop]
  );

  const openKitReader = useCallback(
    (kit: KitItem) => {
      const alreadyBought = (user.purchasedKits || []).includes(kit.id);
      if (!alreadyBought && !requireFullKeyAccess(`Lire ${kit.title}`)) return;
      setActiveReadKit(kit);
    },
    [requireFullKeyAccess, user.purchasedKits]
  );
  const closeKitReader = useCallback(() => setActiveReadKit(null), []);

  // Auto-hide toast after 4.5 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Persist user & local fallback caches
  useEffect(() => {
    persistUserSafely(user);
  }, [user, persistUserSafely]);

  // Sauvegarde automatique cloud complète (snapshot.json + profiles) à chaque modification du profil
  useEffect(() => {
    if (isAuthLoading || !isOnlineMode || !isSupabaseConfigured) return;
    const sbUid = user.supabaseUserId || supabaseUserIdRef.current;
    if (!sbUid || !cloudSnapshotReadyRef.current) return;
    const timer = window.setTimeout(() => {
      const latest = userLatestRef.current;
      const latestSbUid = latest.supabaseUserId || supabaseUserIdRef.current;
      if (!latestSbUid || !isOnlineModeRef.current) return;
      void saveCloudProfileSnapshot(latestSbUid, latest);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [user, isAuthLoading, isOnlineMode]);

  useEffect(() => {
    try {
      const stripData = (val?: string) => (val && val.startsWith('data:') && val.length > 256 ? undefined : val);
      const cleanPosts = posts.slice(0, 200).map((p) => ({
        ...p,
        authorAvatar: stripData(p.authorAvatar) || '⛓️',
        imageUrl: stripData(p.imageUrl),
        videoUrl: stripData(p.videoUrl),
        audioNote: p.audioNote
          ? { ...p.audioNote, audioData: stripData(p.audioNote.audioData) }
          : undefined,
        attachedFile: p.attachedFile
          ? { ...p.attachedFile, url: stripData(p.attachedFile.url) || '' }
          : undefined,
        comments: (p.comments || []).map((c) => ({
          ...c,
          authorAvatar: stripData(c.authorAvatar) || '⛓️',
          imageUrl: stripData(c.imageUrl),
          videoUrl: stripData(c.videoUrl),
          audioNote: c.audioNote
            ? { ...c.audioNote, audioData: stripData(c.audioNote.audioData) }
            : undefined,
        })),
      }));
      localStorage.setItem('evasion_real_posts_v1', JSON.stringify(cleanPosts));
    } catch {
      // ignore quota
    }
  }, [posts]);

  useEffect(() => {
    try {
      const stripData = (val?: string) => (val && val.startsWith('data:') && val.length > 256 ? undefined : val);
      const capped = (chatMessages.length > MAX_CHAT_IN_MEMORY
        ? chatMessages.slice(-MAX_CHAT_IN_MEMORY)
        : chatMessages
      ).map((m) => ({
        ...m,
        authorAvatar: stripData(m.authorAvatar) || '⛓️',
        imageUrl: stripData(m.imageUrl),
        videoUrl: stripData(m.videoUrl),
        audioNote: m.audioNote
          ? { ...m.audioNote, audioData: stripData(m.audioNote.audioData) || '' }
          : undefined,
      }));
      localStorage.setItem('evasion_chat', JSON.stringify(capped));
    } catch {
      // ignore quota
    }
  }, [chatMessages]);

  useEffect(() => {
    try {
      localStorage.setItem('evasion_detox', JSON.stringify(detoxSession));
    } catch {
      // ignore
    }
  }, [detoxSession]);

  // Hydrate Supabase OAuth session + server session on mount (never overwrite existing profile!)
  useEffect(() => {
    let active = true;
    const isOAuthReturn = (() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const hash = window.location.hash || '';
        return Boolean(
          params.get('code') ||
            hash.includes('access_token=') ||
            hash.includes('refresh_token=')
        );
      } catch {
        return false;
      }
    })();

    const cleanOAuthUrlParams = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        let modified = false;
        ['code', 'state', 'error', 'error_description'].forEach((k) => {
          if (params.has(k)) {
            params.delete(k);
            modified = true;
          }
        });
        const cleanHash =
          window.location.hash &&
          (window.location.hash.includes('access_token=') ||
            window.location.hash.includes('refresh_token='))
            ? ''
            : window.location.hash || '';
        if (modified || cleanHash !== (window.location.hash || '')) {
          const qs = params.toString();
          window.history.replaceState(
            {},
            '',
            `${window.location.pathname}${qs ? `?${qs}` : ''}${cleanHash}`
          );
        }
      } catch {
        // ignore URL cleanup error
      }
    };

    const { data: authListener } = isSupabaseConfigured
      ? supabase.auth.onAuthStateChange((event, session) => {
          if (!active) return;
          if (
            (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') &&
            session?.user &&
            hydratedSupabaseUidRef.current !== session.user.id
          ) {
            hydratedSupabaseUidRef.current = session.user.id;
            void hydrateFromSupabaseUser(session.user, {
              announceEnter: event === 'SIGNED_IN' || isOAuthReturn,
              showWelcomeToast: event === 'SIGNED_IN',
            }).then(() => {
              if (isOAuthReturn) cleanOAuthUrlParams();
            });
          }
        })
      : { data: { subscription: null } };

    void (async () => {
      try {
        let sbUidParam: string | null = null;
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const pwaSessionToken = urlParams.get('pwa_session');
          const rawSbUid = urlParams.get('sb_uid');
          if (rawSbUid && rawSbUid.trim()) {
            sbUidParam = rawSbUid.trim();
            urlParams.delete('sb_uid');
          }
          if (pwaSessionToken && pwaSessionToken.trim()) {
            authTokenRef.current = pwaSessionToken.trim();
            writeStoredAuthToken(pwaSessionToken.trim());
            window.localStorage.setItem('evasion_entered_connected', '1');
            urlParams.delete('pwa_session');
          }
          if (pwaSessionToken || rawSbUid) {
            const qs = urlParams.toString();
            const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
            window.history.replaceState({}, '', cleanUrl);
          }
        } catch {
          // ignore URL parsing errors
        }

        let resolved = false;
        const shouldAutoEnter = (() => {
          try {
            return (
              isOAuthReturn ||
              isStandalonePWA() ||
              window.localStorage.getItem('evasion_entered_connected') === '1'
            );
          } catch {
            return isOAuthReturn;
          }
        })();

        if (isSupabaseConfigured) {
          let {
            data: { session },
          } = await supabase.auth.getSession();

          // Si retour OAuth PKCE (?code=...) et session pas encore échangée, patienter jusqu'à 2.5s au lieu de créer un compte invité
          if (active && !session?.user && isOAuthReturn) {
            for (let waitAttempt = 0; waitAttempt < 10; waitAttempt++) {
              if (!active || hydratedSupabaseUidRef.current) break;
              await new Promise((r) => window.setTimeout(r, 250));
              const retry = await supabase.auth.getSession();
              if (retry.data?.session?.user) {
                session = retry.data.session;
                break;
              }
            }
          }

          if (active && session?.user) {
            hydratedSupabaseUidRef.current = session.user.id;
            const acc = await hydrateFromSupabaseUser(session.user, {
              announceEnter: shouldAutoEnter,
              showWelcomeToast: isOAuthReturn,
            });
            if (isOAuthReturn) cleanOAuthUrlParams();
            if (acc) resolved = true;
          } else if (active && hydratedSupabaseUidRef.current) {
            // Déjà hydraté par onAuthStateChange pendant l'attente OAuth
            resolved = true;
          } else if (active && sbUidParam && hydratedSupabaseUidRef.current !== sbUidParam) {
            // Standalone Home Screen PWA handoff recovery when iOS/Android partitioned cookies/localStorage
            const sbRow = await fetchSupabaseProfileById(sbUidParam);
            if (active && sbRow) {
              hydratedSupabaseUidRef.current = sbUidParam;
              const acc = await hydrateFromSupabaseUser(
                {
                  id: sbUidParam,
                  email: sbRow.email || undefined,
                  user_metadata: {
                    full_name: sbRow.username || undefined,
                    avatar_url: sbRow.avatar_url || undefined,
                  },
                },
                { announceEnter: true, showWelcomeToast: false }
              );
              if (acc) resolved = true;
            }
          }
        }

        if (active && !resolved) {
          try {
            const res = await authFetch('/api/auth/me');
            if (res.ok) {
              const data = (await res.json()) as {
                authenticated?: boolean;
                account?: AuthAccountInfo | null;
              };
              if (active && data.authenticated && data.account) {
                applyServerAccount(data.account, authTokenRef.current || undefined, true);
                resolved = true;
              }
            }
          } catch {
            // Offline fallback handled below
          }
        }

        if (active && !resolved && !isOAuthReturn) {
          // Si localStorage était vide (ex: lancement PWA sur écran d'accueil), récupérer la dernière sauvegarde IndexedDB
          let seedUser = userLatestRef.current;
          const looksBlankLocal =
            (!seedUser.alias || seedUser.alias === 'Spectre En Quête') &&
            (seedUser.keysAvailable || 0) === 0 &&
            (seedUser.universeMedia?.length || 0) === 0 &&
            !seedUser.bio;
          if (looksBlankLocal) {
            const latestIdb = await loadLatestProfileBackupFromIdb();
            if (active && latestIdb && latestIdb.id) {
              seedUser = latestIdb;
              userIdRef.current = latestIdb.id;
              userMatriculeRef.current = latestIdb.matricule;
              userLatestRef.current = latestIdb;
              currentUserUniverseRef.current = Array.isArray(latestIdb.universeMedia)
                ? latestIdb.universeMedia
                : [];
              setUser(latestIdb);
              persistUserSafely(latestIdb);
            }
          }

          try {
            const cleanSeedLocalProfile: Partial<UserProfile> = {
              ...seedUser,
              avatar:
                typeof seedUser.avatar === 'string' && !seedUser.avatar.startsWith('data:')
                  ? seedUser.avatar
                  : '',
              universeMedia: (seedUser.universeMedia || []).filter(
                (m) => m && m.id && m.url && !m.url.startsWith('data:')
              ),
            };
            const autoRes = await authFetch('/api/auth/auto-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: seedUser.id,
                matricule: seedUser.matricule,
                alias: seedUser.alias,
                avatar: cleanSeedLocalProfile.avatar,
                bio: seedUser.bio,
                referralCode: seedUser.referralCode,
                localProfile: cleanSeedLocalProfile,
              }),
            });
            if (autoRes.ok) {
              const autoData = (await autoRes.json()) as {
                success?: boolean;
                token?: string;
                account?: AuthAccountInfo;
              };
              if (active && autoData.success && autoData.account) {
                applyServerAccount(autoData.account, autoData.token || null, true);
                resolved = true;
              }
            }
          } catch {
            // Offline fallback handled below
          }
        }

        // Preserve local/IDB profile & session seamlessly when launching PWA offline
        if (active && !resolved) {
          const idbLocal =
            (await loadProfileBackupFromIdb(
              supabaseUserIdRef.current || userLatestRef.current.id
            )) || (await loadLatestProfileBackupFromIdb());
          const snap = idbLocal || userLatestRef.current;
          if (snap && snap.id) {
            if (idbLocal && (!userLatestRef.current.universeMedia?.length || !userLatestRef.current.avatar || !userLatestRef.current.bio)) {
              setUser(idbLocal);
              userLatestRef.current = idbLocal;
              currentUserUniverseRef.current = Array.isArray(idbLocal.universeMedia)
                ? idbLocal.universeMedia
                : [];
              persistUserSafely(idbLocal);
            }
            const offlineLocalAcc: AuthAccountInfo = {
              id: snap.id,
              username: snap.alias,
              supabaseUserId: snap.supabaseUserId,
              hasPassword: Boolean(snap.hasAccountPassword),
              profile: snap,
            };
            setAuthAccount(offlineLocalAcc);
            authAccountRef.current = offlineLocalAcc;
          }
        }
      } catch {
        // ignore network failure
      } finally {
        if (active) setIsAuthLoading(false);
      }

      try {
        const params = new URLSearchParams(window.location.search);
        const paymentStatus = params.get('payment');
        const paypalToken = params.get('token') || params.get('paypal_order_id') || params.get('internal_order_id');

        if (paymentStatus === 'cancelled') {
          try {
            localStorage.removeItem('evasion_pending_paypal_order');
          } catch {
            // ignore
          }
          showToast({
            title: 'Paiement annulé',
            message: 'Aucun débit effectué.',
            type: 'info',
          });
          window.history.replaceState({}, '', window.location.pathname);
        } else if (paymentStatus === 'paypal_return' && paypalToken) {
          let pendingItem: CheckoutItemRequest | null = null;
          let pendingReferralCode: string | undefined;
          try {
            const rawPending = localStorage.getItem('evasion_pending_paypal_order');
            if (rawPending) {
              const parsedPending = JSON.parse(rawPending) as {
                item?: CheckoutItemRequest;
                referralCode?: string;
              };
              pendingItem = parsedPending.item || null;
              pendingReferralCode = parsedPending.referralCode;
            }
          } catch {
            // ignore
          }

          const capRes = await authFetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: paypalToken,
              referralCode: pendingReferralCode || user.referralCode,
            }),
          });
          const capData = (await capRes.json()) as {
            success?: boolean;
            orderId?: string;
            profile?: UserProfile;
            post?: ConfessionPost | null;
            error?: string;
          };

          if (capRes.ok && capData.success) {
            try {
              localStorage.removeItem('evasion_pending_paypal_order');
            } catch {
              // ignore
            }
            const fallbackItem: CheckoutItemRequest = pendingItem || {
              id: 'paypal_order',
              name: 'Pack ÉVASION PayPal',
              tagline: 'Achat validé via PayPal',
              priceLabel: 'Validé',
              amount: 0,
              icon: '🅿️',
              type: 'keys_pack',
            };
            applyVerifiedServerPurchase({
              item: fallbackItem,
              methodLabel: 'PayPal',
              profile: capData.profile,
              post: capData.post,
              txId: capData.orderId || paypalToken,
            });
          } else {
            showToast({
              title: 'Confirmation PayPal en attente',
              message: capData?.error || 'Clique sur Vérifier dans le guichet si tu viens de valider sur PayPal.',
              type: 'warning',
              action: pendingItem
                ? {
                    label: 'Finaliser',
                    onClick: () => openShop(pendingItem!),
                  }
                : undefined,
            });
          }

          params.delete('payment');
          params.delete('token');
          params.delete('PayerID');
          params.delete('paypal_order_id');
          params.delete('internal_order_id');
          const rest = params.toString();
          window.history.replaceState(
            {},
            '',
            rest ? `${window.location.pathname}?${rest}` : window.location.pathname
          );
        }
      } catch {
        // ignore URL query handling errors
      }
    })();

    return () => {
      active = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [authFetch, applyServerAccount, hydrateFromSupabaseUser, showToast]);

  // Unified Cross-Device Real-Time Sync: REST initial load + WebSocket (/ws) with reconnect + SSE backup
  useEffect(() => {
    if (!isOnlineMode) {
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'SET_PRESENCE_OFFLINE' }));
          } catch {
            // ignore
          }
        }
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      setOnlineUsers([]);
      setOnlineInmatesCount(0);
      return;
    }

    let active = true;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let backoffMs = 1000;

    const notifyIncomingChat = (incoming: ChatMessage) => {
      if (!incoming?.id || seenChatIdsRef.current.has(incoming.id)) return;
      seenChatIdsRef.current.add(incoming.id);
      if (incoming.isSystem) return;

      const myId = userIdRef.current;
      const myMatricule = userMatriculeRef.current;
      if (incoming.authorId === myId || incoming.authorMatricule === myMatricule) return;

      const prefs = getPhoneNotificationPrefs();
      const senderName = incoming.authorMatricule || 'Codétenu';
      const preview =
        (incoming.content || '').trim() ||
        (incoming.audioNote?.audioData
          ? '🎤 Message vocal reçu'
          : incoming.videoUrl
          ? '🎬 Vidéo reçue'
          : incoming.imageUrl
          ? '📷 Photo reçue'
          : 'Nouveau message');

      const isDmForMe =
        Boolean(incoming.recipientId || incoming.recipientMatricule) &&
        (incoming.recipientId === myId || incoming.recipientMatricule === myMatricule);

      if (isDmForMe) {
        const isAlreadyOpenOnSender =
          directChatTargetRef.current &&
          (directChatTargetRef.current.id === incoming.authorId ||
            directChatTargetRef.current.matricule === incoming.authorMatricule);

        const target: DirectChatTarget = {
          id: incoming.authorId,
          matricule: incoming.authorMatricule,
          alias: incoming.authorMatricule,
          avatar: incoming.authorAvatar || '⛓️',
          neonColor: incoming.neonColor,
        };

        if (!isAlreadyOpenOnSender || document.hidden) {
          soundEngine.playChatBlip();
          if (prefs.enabled && prefs.notifyDirectMessages) {
            void dispatchPhoneNotification({
              id: incoming.id,
              title: `ÉVASION · MP de ${senderName}`,
              body: `${preview} · Appuie pour lire et répondre`,
              type: 'dm',
              url: `/?notif=dm&from=${encodeURIComponent(incoming.authorMatricule)}&fromId=${encodeURIComponent(incoming.authorId)}&msgId=${encodeURIComponent(incoming.id)}`,
              data: {
                type: 'dm',
                messageId: incoming.id,
                senderId: incoming.authorId,
                senderMatricule: incoming.authorMatricule,
                senderAlias: incoming.authorMatricule,
                senderAvatar: incoming.authorAvatar || '⛓️',
                senderNeonColor: incoming.neonColor,
              },
            });
          }
          if (!isAlreadyOpenOnSender) {
            showToast({
              title: `ÉVASION · MP de ${senderName}`,
              message: preview,
              icon: 'EVASION_LOGO',
              type: 'info',
              action: {
                label: 'Voir & Répondre',
                onClick: () => openDirectChatRef.current(target),
              },
            });
          }
        }
        return;
      }

      if (!incoming.recipientId && !incoming.recipientMatricule) {
        if (prefs.enabled && prefs.notifyCourtChat && document.hidden) {
          const channelName = incoming.channel || 'main';
          void dispatchPhoneNotification({
            id: incoming.id,
            title: `ÉVASION · ${senderName} dans La Cour`,
            body: preview,
            type: 'cour',
            url: `/?notif=cour&channel=${encodeURIComponent(channelName)}&msgId=${encodeURIComponent(incoming.id)}`,
            data: {
              type: 'cour',
              channel: channelName,
              messageId: incoming.id,
              senderId: incoming.authorId,
              senderMatricule: incoming.authorMatricule,
            },
          });
        }
      }
    };

    const notifyIncomingPostComments = (post: ConfessionPost) => {
      if (!post?.comments || post.comments.length === 0) return;
      const myId = userIdRef.current;
      const myMatricule = userMatriculeRef.current;
      const isMyPost = post.authorId === myId || post.authorMatricule === myMatricule;

      for (const c of post.comments) {
        if (!c?.id || seenCommentIdsRef.current.has(c.id)) continue;
        seenCommentIdsRef.current.add(c.id);
        if (!initialPostsSeededRef.current) continue;
        if (!isMyPost) continue;
        if (c.authorId === myId || c.authorMatricule === myMatricule) continue;
        if (c.id.startsWith('comm_live_') || c.id.startsWith('comm_aveu_') || c.authorId.startsWith('usr_v')) {
          continue;
        }

        const prefs = getPhoneNotificationPrefs();
        const senderName = c.authorAlias || c.authorMatricule;
        const preview =
          (c.content || '').trim() ||
          (c.audioNote?.audioData
            ? '🎤 Message vocal'
            : c.videoUrl
            ? '🎬 Vidéo'
            : c.imageUrl
            ? '📷 Photo'
            : 'Nouveau commentaire');
        const postSnippet = (post.content || '').trim().slice(0, 40);

        soundEngine.playChatBlip();

        if (prefs.enabled && prefs.notifyPostReplies) {
          void dispatchPhoneNotification({
            id: c.id,
            title: `ÉVASION · Commentaire de ${senderName}`,
            body: postSnippet ? `${preview} · Sur « ${postSnippet}... »` : preview,
            type: 'comment',
            url: `/?notif=comment&postId=${encodeURIComponent(post.id)}&commentId=${encodeURIComponent(c.id)}`,
            data: {
              type: 'comment',
              postId: post.id,
              commentId: c.id,
              senderId: c.authorId,
              senderMatricule: c.authorMatricule,
            },
          });
        }

        showToast({
          title: `ÉVASION · Commentaire de ${senderName}`,
          message: preview,
          icon: 'EVASION_LOGO',
          type: 'info',
          action: {
            label: 'Voir & Répondre',
            onClick: () => {
              window.dispatchEvent(
                new CustomEvent('evasion-notif-click', {
                  detail: {
                    type: 'comment',
                    postId: post.id,
                    commentId: c.id,
                  },
                })
              );
            },
          },
        });
      }
    };

    const processChatBatch = (messages: ChatMessage[]) => {
      if (!initialChatSeededRef.current) {
        messages.forEach((m) => {
          if (m?.id) seenChatIdsRef.current.add(m.id);
        });
        initialChatSeededRef.current = true;
      } else {
        messages.forEach((m) => notifyIncomingChat(m));
      }
      setChatMessages((prev) => {
        const map = new Map<string, ChatMessage>();
        prev.forEach((m) => map.set(m.id, m));
        let hasNewOrChanged = false;
        messages.forEach((m) => {
          if (!m?.id) return;
          const old = map.get(m.id);
          if (
            !old ||
            old.content !== m.content ||
            old.timestamp !== m.timestamp ||
            old.imageUrl !== m.imageUrl ||
            old.videoUrl !== m.videoUrl ||
            old.audioNote?.audioData !== m.audioNote?.audioData
          ) {
            hasNewOrChanged = true;
            map.set(m.id, m);
          }
        });
        if (!hasNewOrChanged) return prev;
        const next = Array.from(map.values())
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
          .slice(-MAX_CHAT_IN_MEMORY);
        if (
          next.length === prev.length &&
          next.every((m, idx) => prev[idx] === m)
        ) {
          return prev;
        }
        return next;
      });
    };

    const mergeSinglePostMonotonic = (
      existing: ConfessionPost | undefined,
      incoming: ConfessionPost
    ): ConfessionPost => {
      if (!existing) return incoming;

      const keysCount = Math.max(existing.keysCount || 0, incoming.keysCount || 0);
      const keysRequired = Math.max(1, incoming.keysRequired || existing.keysRequired || 5);
      const padlocksSealCount = Math.max(existing.padlocksSealCount || 0, incoming.padlocksSealCount || 0);
      const status: 'locked' | 'escaped' =
        existing.status === 'escaped' || incoming.status === 'escaped' || keysCount >= keysRequired
          ? 'escaped'
          : 'locked';
      const escapedAt = existing.escapedAt || incoming.escapedAt;
      const isPinned = Boolean(existing.isPinned || incoming.isPinned);
      const pinnedUntil = Math.max(existing.pinnedUntil || 0, incoming.pinnedUntil || 0) || undefined;
      const hasGoldBadge = Boolean(existing.hasGoldBadge || incoming.hasGoldBadge);
      const givenByMe = Boolean(existing.givenByMe || incoming.givenByMe);
      const sealedByMe = Boolean(existing.sealedByMe || incoming.sealedByMe);
      const nextVideoUrl =
        incoming.videoUrl && !incoming.videoUrl.startsWith('idb://')
          ? incoming.videoUrl
          : existing.videoUrl || incoming.videoUrl;
      const nextImageUrl = incoming.imageUrl || existing.imageUrl;
      const nextAudioNote = incoming.audioNote || existing.audioNote;

      // Merge donors monotonically
      const donorSet = new Set<string>();
      const mergedDonors: string[] = [];
      for (const d of [...(incoming.keyDonors || []), ...(existing.keyDonors || [])]) {
        if (d && !donorSet.has(d)) {
          donorSet.add(d);
          mergedDonors.push(d);
        }
      }

      // Merge comments monotonically by id
      const commentMap = new Map<string, PostComment>();
      for (const c of [...(existing.comments || []), ...(incoming.comments || [])]) {
        if (c?.id) commentMap.set(c.id, c);
      }
      const mergedComments = Array.from(commentMap.values())
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .slice(-MAX_COMMENTS_PER_POST);

      const isIdentical =
        existing.content === incoming.content &&
        existing.keysCount === keysCount &&
        existing.keysRequired === keysRequired &&
        existing.status === status &&
        existing.isPinned === isPinned &&
        (existing.padlocksSealCount || 0) === padlocksSealCount &&
        (existing.comments?.length || 0) === mergedComments.length &&
        (existing.keyDonors?.length || 0) === mergedDonors.length &&
        existing.givenByMe === givenByMe &&
        existing.sealedByMe === sealedByMe &&
        existing.imageUrl === nextImageUrl &&
        existing.videoUrl === nextVideoUrl &&
        existing.authorNeonColor === incoming.authorNeonColor &&
        existing.authorFrame === incoming.authorFrame;

      if (isIdentical) {
        return existing;
      }

      return {
        ...existing,
        ...incoming,
        keysCount,
        keysRequired,
        padlocksSealCount,
        status,
        escapedAt,
        isPinned,
        pinnedUntil,
        hasGoldBadge,
        givenByMe,
        sealedByMe,
        videoUrl: nextVideoUrl,
        imageUrl: nextImageUrl,
        audioNote: nextAudioNote,
        keyDonors: mergedDonors,
        comments: mergedComments,
      };
    };

    const applyPostList = (serverPosts: unknown[]) => {
      if (!active || !Array.isArray(serverPosts)) return;
      setPosts((prev) => {
        const mergedMap = new Map<string, ConfessionPost>();
        for (const p of prev) {
          if (p?.id) mergedMap.set(p.id, p);
        }

        for (const sp of serverPosts.slice(0, MAX_POSTS_IN_MEMORY)) {
          const rawId = String((sp as any)?.id || '');
          if (!rawId) continue;
          pendingPostIdsRef.current.delete(rawId);
          const existing = mergedMap.get(rawId);
          const normalized = normalizeServerPost(sp, existing);
          notifyIncomingPostComments(normalized);
          mergedMap.set(rawId, mergeSinglePostMonotonic(existing, normalized));
        }

        const nextList = Array.from(mergedMap.values())
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          .slice(0, MAX_POSTS_IN_MEMORY);

        initialPostsSeededRef.current = true;

        if (
          prev.length === nextList.length &&
          nextList.every((item, idx) => prev[idx] === item)
        ) {
          return prev; // Keep feed 100% static without re-rendering!
        }

        return nextList;
      });
    };

    const upsertSingleServerPost = (rawPost: any) => {
      if (!active || !rawPost?.id) return;
      pendingPostIdsRef.current.delete(String(rawPost.id));
      setPosts((prev) => {
        const idx = prev.findIndex((p) => p.id === rawPost.id);
        const existing = idx >= 0 ? prev[idx] : undefined;
        const normalized = normalizeServerPost(rawPost, existing);
        notifyIncomingPostComments(normalized);
        const merged = mergeSinglePostMonotonic(existing, normalized);
        if (existing && merged === existing) {
          return prev;
        }
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = merged;
          return next;
        }
        return [merged, ...prev];
      });
    };

    const hydrateAllFromRest = async () => {
      try {
        const [pRes, cRes, sRes, lRes, oRes] = await Promise.all([
          fetch('/api/posts', { cache: 'no-store' }),
          fetch('/api/chat', { cache: 'no-store' }),
          fetch('/api/salons', { cache: 'no-store' }),
          fetch('/api/lives', { cache: 'no-store' }),
          fetch('/api/users/online', { cache: 'no-store' }),
        ]);
        if (!active) return;
        if (pRes.ok) {
          const pd = await pRes.json();
          if (Array.isArray(pd?.posts)) applyPostList(pd.posts);
        }
        if (cRes.ok) {
          const cd = await cRes.json();
          if (Array.isArray(cd?.messages)) {
            processChatBatch(cd.messages);
          }
        }
        if (sRes.ok) {
          const sd = await sRes.json();
          if (Array.isArray(sd?.salons)) {
            const incomingSalons = (sd.salons as CustomSalon[]).slice(0, MAX_SALONS_IN_MEMORY);
            setCustomSalons((prev) => {
              if (
                prev.length === incomingSalons.length &&
                incomingSalons.every((s, idx) => prev[idx]?.id === s.id && prev[idx]?.tag === s.tag)
              ) {
                return prev;
              }
              return incomingSalons;
            });
          }
        }
        if (lRes.ok) {
          const ld = await lRes.json();
          if (Array.isArray(ld?.lives)) {
            setActiveLives((prev) => {
              const serverLives = (ld.lives as LiveSession[]).filter(
                (l) => l && l.isActive && !endedLiveIdsRef.current.has(l.id)
              );
              const prevMap = new Map<string, LiveSession>();
              for (const l of prev) {
                if (l && l.isActive) prevMap.set(l.id, l);
              }
              const nextMap = new Map<string, LiveSession>();
              // Always preserve any active live created/hosted by this user (unless explicitly ended by user)
              for (const l of prev) {
                const isMyActiveLive =
                  l &&
                  l.isActive &&
                  !endedLiveIdsRef.current.has(l.id) &&
                  (pendingCreatedLiveIdsRef.current.has(l.id) ||
                    l.hostId === userIdRef.current ||
                    (userMatriculeRef.current && l.hostMatricule === userMatriculeRef.current));
                if (isMyActiveLive) {
                  nextMap.set(l.id, l);
                }
              }
              for (const l of serverLives) {
                const existing = prevMap.get(l.id);
                if (existing) {
                  const nextViewers =
                    typeof l.viewersCount === 'number'
                      ? l.viewersCount
                      : (l.activeViewers?.length || 0);
                  const nextLikes = Math.max(existing.likesCount || 0, l.likesCount || 0);
                  const nextComments =
                    l.comments && l.comments.length >= (existing.comments?.length || 0)
                      ? l.comments
                      : existing.comments;
                  const unchanged =
                    existing.viewersCount === nextViewers &&
                    existing.likesCount === nextLikes &&
                    existing.keysReceived === l.keysReceived &&
                    existing.padlocksReceived === l.padlocksReceived &&
                    existing.iceConesReceived === l.iceConesReceived &&
                    existing.waterBottlesReceived === l.waterBottlesReceived &&
                    existing.cansReceived === l.cansReceived &&
                    (existing.comments?.length || 0) === (nextComments?.length || 0) &&
                    (existing.guests?.length || 0) === (l.guests?.length || 0) &&
                    (existing.guestRequests?.length || 0) === (l.guestRequests?.length || 0) &&
                    (existing.pendingInvites?.length || 0) === (l.pendingInvites?.length || 0) &&
                    (existing.activeViewers?.length || 0) === (l.activeViewers?.length || 0) &&
                    (existing.blockedUserIds?.length || 0) === (l.blockedUserIds?.length || 0) &&
                    existing.pinnedAnnouncement === l.pinnedAnnouncement &&
                    existing.filter === l.filter &&
                    existing.title === l.title;
                  nextMap.set(
                    l.id,
                    unchanged
                      ? existing
                      : {
                          ...existing,
                          ...l,
                          viewersCount: nextViewers,
                          likesCount: nextLikes,
                          comments: nextComments,
                        }
                  );
                } else {
                  nextMap.set(l.id, l);
                }
              }
              const nextList = Array.from(nextMap.values()).slice(0, MAX_LIVES_IN_MEMORY);
              if (
                prev.length === nextList.length &&
                nextList.every((item, idx) => prev[idx] === item)
              ) {
                return prev;
              }
              return nextList;
            });
          }
        }
        if (oRes.ok) {
          const od = await oRes.json();
          if (Array.isArray(od?.users)) {
            const nextOnline = od.users as OnlineUserPresence[];
            setOnlineUsers((prev) => {
              if (
                prev.length === nextOnline.length &&
                nextOnline.every(
                  (u, idx) =>
                    prev[idx]?.id === u.id &&
                    prev[idx]?.matricule === u.matricule &&
                    prev[idx]?.alias === u.alias &&
                    prev[idx]?.avatar === u.avatar
                )
              ) {
                return prev;
              }
              return nextOnline;
            });
          }
          if (typeof od?.onlineInmatesCount === 'number') {
            const nextCount = Math.max(0, od.onlineInmatesCount);
            setOnlineInmatesCount((prev) => (prev === nextCount ? prev : nextCount));
          }
        }
      } catch {
        // keep cached state if temporarily offline
      }
    };

    void hydrateAllFromRest();

    const connectWebSocket = () => {
      if (!active || typeof WebSocket === 'undefined') return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const tokenParam = authTokenRef.current ? `?token=${encodeURIComponent(authTokenRef.current)}` : '';
      const wsUrl = `${proto}//${window.location.host}/ws${tokenParam}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          backoffMs = 300;
          try {
            ws.send(
              JSON.stringify({
                type: 'AUTH',
                token: authTokenRef.current || undefined,
                userId: userIdRef.current,
              })
            );
          } catch {
            // ignore
          }
          if (activeRtcRoomRef.current) {
            const rejoinRoomId = activeRtcRoomRef.current.liveId;
            try {
              ws.send(
                JSON.stringify({
                  type: 'LIVE_ROOM_JOIN',
                  liveId: rejoinRoomId,
                  role: activeRtcRoomRef.current.role,
                  userId: userIdRef.current,
                })
              );
            } catch {
              // ignore
            }
            rtcEventListenersRef.current.forEach((listener) => {
              try {
                listener({ type: 'WS_RECONNECTED', payload: { liveId: rejoinRoomId } });
              } catch {
                // ignore
              }
            });
          }
          if (pingTimer) window.clearInterval(pingTimer);
          pingTimer = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'PING', userId: userIdRef.current }));
              } catch {
                // ignore
              }
            }
          }, 15000);
        };

        ws.onmessage = (ev) => {
          if (!active) return;
          try {
            const msg = JSON.parse(String(ev.data)) as { type?: string; payload?: any };
            if (!msg?.type) return;

            switch (msg.type) {
               case 'SYNC_STATE': {
                if (Array.isArray(msg.payload?.posts)) applyPostList(msg.payload.posts);
                if (Array.isArray(msg.payload?.chatMessages)) {
                  processChatBatch(msg.payload.chatMessages);
                }
                if (Array.isArray(msg.payload?.salons)) {
                  const incomingSalons = (msg.payload.salons as CustomSalon[]).slice(0, MAX_SALONS_IN_MEMORY);
                  setCustomSalons((prev) => {
                    if (
                      prev.length === incomingSalons.length &&
                      incomingSalons.every((s, idx) => prev[idx]?.id === s.id && prev[idx]?.tag === s.tag)
                    ) {
                      return prev;
                    }
                    return incomingSalons;
                  });
                }
                if (Array.isArray(msg.payload?.lives)) {
                  setActiveLives((prev) => {
                    const serverLives = (msg.payload.lives as LiveSession[]).filter(
                      (l) => l && l.isActive && !endedLiveIdsRef.current.has(l.id)
                    );
                    const prevMap = new Map<string, LiveSession>();
                    for (const l of prev) {
                      if (l && l.isActive) prevMap.set(l.id, l);
                    }
                    const nextMap = new Map<string, LiveSession>();
                    for (const l of prev) {
                      const isMyActiveLive =
                        l &&
                        l.isActive &&
                        !endedLiveIdsRef.current.has(l.id) &&
                        (pendingCreatedLiveIdsRef.current.has(l.id) ||
                          l.hostId === userIdRef.current ||
                          (userMatriculeRef.current && l.hostMatricule === userMatriculeRef.current));
                      if (isMyActiveLive) {
                        nextMap.set(l.id, l);
                      }
                    }
                    for (const l of serverLives) {
                      const existing = prevMap.get(l.id);
                      const unchanged =
                        existing &&
                        existing.viewersCount === l.viewersCount &&
                        existing.likesCount === l.likesCount &&
                        (existing.comments?.length || 0) === (l.comments?.length || 0) &&
                        (existing.guests?.length || 0) === (l.guests?.length || 0);
                      nextMap.set(l.id, existing ? (unchanged ? existing : { ...existing, ...l }) : l);
                    }
                    const nextList = Array.from(nextMap.values()).slice(0, MAX_LIVES_IN_MEMORY);
                    if (
                      prev.length === nextList.length &&
                      nextList.every((item, idx) => prev[idx] === item)
                    ) {
                      return prev;
                    }
                    return nextList;
                  });
                }
                if (Array.isArray(msg.payload?.onlineUsers)) {
                  const nextOnline = msg.payload.onlineUsers as OnlineUserPresence[];
                  setOnlineUsers((prev) => {
                    if (
                      prev.length === nextOnline.length &&
                      nextOnline.every(
                        (u, idx) =>
                          prev[idx]?.id === u.id &&
                          prev[idx]?.matricule === u.matricule &&
                          prev[idx]?.alias === u.alias &&
                          prev[idx]?.avatar === u.avatar
                      )
                    ) {
                      return prev;
                    }
                    return nextOnline;
                  });
                }
                if (typeof msg.payload?.onlineInmatesCount === 'number') {
                  const nextCount = Math.max(0, msg.payload.onlineInmatesCount);
                  setOnlineInmatesCount((prev) => (prev === nextCount ? prev : nextCount));
                }
                if (msg.payload?.platformKeyStats) {
                  setPlatformKeyStats(msg.payload.platformKeyStats);
                }
                break;
              }
              case 'POST_CREATED': {
                upsertSingleServerPost(msg.payload?.post);
                break;
              }
              case 'POST_UPDATED': {
                upsertSingleServerPost(msg.payload?.post);
                break;
              }
              case 'CHAT_CREATED': {
                const chatMsg = msg.payload?.message as ChatMessage | undefined;
                if (!chatMsg?.id) break;
                initialChatSeededRef.current = true;
                notifyIncomingChat(chatMsg);
                setChatMessages((prev) => {
                  if (prev.some((m) => m.id === chatMsg.id)) return prev;
                  return [...prev, chatMsg].slice(-MAX_CHAT_IN_MEMORY);
                });
                break;
              }
              case 'SALON_CREATED': {
                const salon = msg.payload?.salon as CustomSalon | undefined;
                if (!salon?.id) break;
                setCustomSalons((prev) => {
                  if (prev.some((s) => s.id === salon.id || s.tag === salon.tag)) return prev;
                  return [salon, ...prev].slice(0, MAX_SALONS_IN_MEMORY);
                });
                break;
              }
              case 'LIVE_CREATED': {
                const live = msg.payload?.live as LiveSession | undefined;
                if (!live?.id || !live.isActive || endedLiveIdsRef.current.has(live.id)) break;
                setActiveLives((prev) => [live, ...prev.filter((l) => l.id !== live.id)].slice(0, MAX_LIVES_IN_MEMORY));
                if (live.hostId !== userIdRef.current) {
                  showToast({
                    title: `🔴 LIVE EN DIRECT · ${live.title}`,
                    message: `${live.hostName} vient de lancer un Live (${live.topicTag}). Rejoins la diffusion !`,
                    icon: '📡',
                    type: 'success',
                    action: {
                      label: 'Voir le Live',
                      onClick: () => {
                        setRequestedLiveId(live.id);
                      },
                    },
                  });
                }
                break;
              }
              case 'LIVE_UPDATED': {
                const live = msg.payload?.live as LiveSession | undefined;
                if (!live?.id) break;
                if (!live.isActive || endedLiveIdsRef.current.has(live.id)) {
                  setActiveLives((prev) => prev.filter((l) => l.id !== live.id));
                  break;
                }
                setActiveLives((prev) => {
                  const map = new Map<string, LiveSession>();
                  for (const l of prev) {
                    if (l && l.isActive && !endedLiveIdsRef.current.has(l.id)) map.set(l.id, l);
                  }
                  map.set(live.id, live);
                  return Array.from(map.values()).slice(0, MAX_LIVES_IN_MEMORY);
                });
                break;
              }
              case 'LIVE_ENDED': {
                const liveId = msg.payload?.liveId;
                if (!liveId) break;
                // Never allow a remote/spurious LIVE_ENDED event to cut the host's own active Live unless the host explicitly ended it
                if (
                  !endedLiveIdsRef.current.has(liveId) &&
                  activeRtcRoomRef.current?.liveId === liveId &&
                  activeRtcRoomRef.current?.role === 'host'
                ) {
                  break;
                }
                pendingCreatedLiveIdsRef.current.delete(liveId);
                endedLiveIdsRef.current.add(liveId);
                setRequestedLiveId((prev) => (prev === liveId ? null : prev));
                setActiveLives((prev) => prev.filter((l) => l.id !== liveId));
                setIncomingLiveInvite((prev) => (prev?.liveId === liveId ? null : prev));
                rtcEventListenersRef.current.forEach((listener) => {
                  try {
                    listener({ type: 'LIVE_ENDED', payload: { liveId } });
                  } catch {
                    // ignore
                  }
                });
                break;
              }
              case 'LIVE_INVITE_RECEIVED': {
                const invite = msg.payload?.invite as LiveInvitePayload | undefined;
                if (!invite || invite.fromUserId === userIdRef.current) break;
                setIncomingLiveInvite(invite);
                soundEngine.playChatBlip();
                showToast({
                  title:
                    invite.mode === 'cohost'
                      ? `🎥 ${invite.fromName} t'invite sur l'écran du Live !`
                      : `📣 ${invite.fromName} t'invite à voir son Live`,
                  message: `${invite.liveTitle} (${invite.topicTag})`,
                  icon: invite.mode === 'cohost' ? '🎥' : '🔴',
                  type: 'success',
                  action: {
                    label: invite.mode === 'cohost' ? 'Monter 🎥' : 'Rejoindre 🔴',
                    onClick: () => {
                      setRequestedLiveId(invite.liveId);
                    },
                  },
                });
                break;
              }
              case 'ONLINE_USERS': {
                if (Array.isArray(msg.payload?.users)) {
                  const nextOnline = msg.payload.users as OnlineUserPresence[];
                  setOnlineUsers((prev) => {
                    if (
                      prev.length === nextOnline.length &&
                      nextOnline.every(
                        (u, idx) =>
                          prev[idx]?.id === u.id &&
                          prev[idx]?.matricule === u.matricule &&
                          prev[idx]?.alias === u.alias &&
                          prev[idx]?.avatar === u.avatar
                      )
                    ) {
                      return prev;
                    }
                    return nextOnline;
                  });
                }
                if (typeof msg.payload?.onlineInmatesCount === 'number') {
                  const nextCount = Math.max(0, msg.payload.onlineInmatesCount);
                  setOnlineInmatesCount((prev) => (prev === nextCount ? prev : nextCount));
                }
                break;
              }
              case 'LIVE_USER_BLOCKED': {
                const blockedLiveId = msg.payload?.liveId as string | undefined;
                const blockedUid = msg.payload?.targetUserId as string | undefined;
                const blockedMat = msg.payload?.targetMatricule as string | undefined;
                if (blockedLiveId && (blockedUid || blockedMat)) {
                  setActiveLives((prev) =>
                    prev.map((l) => {
                      if (l.id !== blockedLiveId) return l;
                      const nextBlocked = Array.from(
                        new Set([
                          ...(l.blockedUserIds || []),
                          ...(blockedUid ? [blockedUid] : []),
                          ...(blockedMat ? [blockedMat] : []),
                        ])
                      );
                      return {
                        ...l,
                        blockedUserIds: nextBlocked,
                        activeViewers: (l.activeViewers || []).filter(
                          (v) => v.userId !== blockedUid && v.matricule !== blockedMat
                        ),
                        guests: (l.guests || []).filter(
                          (g) => g.userId !== blockedUid && g.matricule !== blockedMat
                        ),
                      };
                    })
                  );
                }
                rtcEventListenersRef.current.forEach((listener) => {
                  try {
                    listener({ type: 'LIVE_USER_BLOCKED', payload: msg.payload });
                  } catch {
                    // ignore listener error
                  }
                });
                break;
              }
              case 'LIVE_RTC_ROOM_PEERS':
              case 'LIVE_RTC_PEER_JOINED':
              case 'LIVE_RTC_PEER_LEFT':
              case 'LIVE_RTC_SIGNAL':
              case 'LIVE_REACTION':
              case 'LIVE_RELAY_NEEDED':
              case 'LIVE_RELAY_MEDIA': {
                rtcEventListenersRef.current.forEach((listener) => {
                  try {
                    listener({ type: msg.type!, payload: msg.payload });
                  } catch {
                    // ignore listener error
                  }
                });
                break;
              }
              case 'PRESENCE_COUNT': {
                if (typeof msg.payload?.onlineInmatesCount === 'number') {
                  const nextCount = Math.max(0, msg.payload.onlineInmatesCount);
                  setOnlineInmatesCount((prev) => (prev === nextCount ? prev : nextCount));
                }
                break;
              }
              case 'USER_UPDATED': {
                const updatedProfile = msg.payload?.profile as UserProfile | undefined;
                if (updatedProfile?.id && updatedProfile.id === userIdRef.current) {
                  const reconciled = reconcileProfileUniverse(updatedProfile);
                  let profileChanged = true;
                  try {
                    profileChanged = JSON.stringify(reconciled) !== JSON.stringify(userLatestRef.current);
                  } catch {
                    profileChanged = true;
                  }
                  if (profileChanged) {
                    setUser(reconciled);
                    persistUserSafely(reconciled);
                    setAuthAccount((prev) =>
                      prev && prev.id === reconciled.id ? { ...prev, profile: reconciled } : prev
                    );
                  }
                }
                if (typeof window !== 'undefined' && updatedProfile?.id) {
                  window.dispatchEvent(
                    new CustomEvent('evasion:media-feed-updated', {
                      detail: {
                        action: 'user_updated',
                        ownerId: updatedProfile.id,
                        profile: updatedProfile,
                      },
                    })
                  );
                }
                break;
              }
              case 'FRIEND_UPDATED': {
                const action = msg.payload?.action as string | undefined;
                const actorUser = (msg.payload?.actor || msg.payload?.from || msg.payload?.by) as FriendRequestEntry | undefined;
                void refreshFriendsFromServerRef.current();
                if (action === 'request_received' && actorUser && actorUser.id !== userIdRef.current) {
                  soundEngine.playChatBlip();
                  showToast({
                    title: '👥 Demande d’ami reçue !',
                    message: `${actorUser.alias || actorUser.matricule} souhaite t’ajouter en ami.`,
                    icon: '🤝',
                    type: 'success',
                    action: {
                      label: 'Accepter ✓',
                      onClick: () => {
                        void acceptFriendRequestRef.current({
                          id: actorUser.id,
                          matricule: actorUser.matricule,
                        });
                      },
                    },
                  });
                } else if (action === 'accepted' && actorUser && actorUser.id !== userIdRef.current) {
                  soundEngine.playKeyTurn();
                  showToast({
                    title: '🤝 Nouvel ami ajouté !',
                    message: `${actorUser.alias || actorUser.matricule} a accepté ta demande d’ami.`,
                    icon: '💬',
                    type: 'success',
                    action: {
                      label: 'Discuter 💬',
                      onClick: () => {
                        openDirectChatRef.current({
                          id: actorUser.id,
                          matricule: actorUser.matricule,
                          alias: actorUser.alias,
                          avatar: actorUser.avatar || '⛓️',
                          neonColor: actorUser.neonColor,
                        });
                      },
                    },
                  });
                }
                break;
              }
              case 'FRIEND_NEW_MEDIA': {
                const payload = msg.payload as {
                  kind?: 'flame' | 'universe' | 'post' | 'flame_comment';
                  mediaType?: string;
                  title?: string;
                  body?: string;
                  ownerId?: string;
                  ownerMatricule?: string;
                  ownerAlias?: string;
                  ownerAvatar?: string;
                  ownerNeonColor?: NeonColor;
                  createdAt?: number;
                } | undefined;
                if (payload && payload.ownerId && payload.ownerId !== userIdRef.current) {
                  void refreshFriendsFromServerRef.current();
                  soundEngine.playChatBlip();
                  const targetProfile: DirectChatTarget = {
                    id: payload.ownerId,
                    matricule: payload.ownerMatricule || payload.ownerId,
                    alias: payload.ownerAlias || payload.ownerMatricule || 'Ami',
                    avatar: payload.ownerAvatar || '⛓️',
                    neonColor: payload.ownerNeonColor,
                  };
                  const notifTitle = payload.title || `🔥 Nouveauté de ${targetProfile.alias}`;
                  const notifBody = payload.body || `${targetProfile.alias} a publié un nouveau média.`;

                  const prefs = getPhoneNotificationPrefs();
                  if (prefs.enabled) {
                    void dispatchPhoneNotification({
                      id: `friend_media_${payload.ownerId}_${payload.createdAt || Date.now()}`,
                      title: notifTitle,
                      body: notifBody,
                      type: 'dm',
                      url: `/?u=${encodeURIComponent(payload.ownerId)}`,
                      data: {
                        type: 'profile',
                        ownerId: payload.ownerId,
                        ownerMatricule: targetProfile.matricule,
                        ownerAlias: targetProfile.alias,
                      },
                    });
                  }

                  showToast({
                    title: notifTitle,
                    message: notifBody,
                    icon: payload.kind === 'flame' ? '🔥' : payload.kind === 'flame_comment' ? '💬' : '📸',
                    type: 'success',
                    action:
                      payload.kind === 'flame_comment'
                        ? {
                            label: 'Discuter 💬',
                            onClick: () => openDirectChatRef.current(targetProfile),
                          }
                        : {
                            label: 'Voir 🔥',
                            onClick: () => openUserProfileRef.current(targetProfile),
                          },
                  });

                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('evasion:media-feed-updated', {
                        detail: { action: payload.kind || 'friend_media', ownerId: payload.ownerId },
                      })
                    );
                  }
                }
                break;
              }
              case 'MEDIA_FEED_UPDATED': {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('evasion:media-feed-updated', {
                      detail: msg.payload,
                    })
                  );
                }
                break;
              }
              case 'PLATFORM_KEYS_UPDATED': {
                const stats = msg.payload?.stats as PlatformKeyStats | undefined;
                if (stats) {
                  setPlatformKeyStats(stats);
                }
                break;
              }
              default:
                break;
            }
          } catch {
            // ignore malformed ws payload
          }
        };

        ws.onclose = () => {
          if (wsRef.current === ws) wsRef.current = null;
          if (pingTimer) {
            window.clearInterval(pingTimer);
            pingTimer = null;
          }
          if (!active) return;
          const wait = backoffMs;
          backoffMs = Math.min(2500, Math.round(backoffMs * 1.6));
          reconnectTimer = window.setTimeout(connectWebSocket, wait);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        // retry silently
      }
    };

    connectWebSocket();

    // Real-time synchronization layer: poll REST every 3.5s for instant chat & live messaging
    const restFallbackTimer = window.setInterval(() => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      void hydrateAllFromRest();
    }, 3500);

    // SSE resilience layer for Le Mur confessions
    let evtSource: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      evtSource = new EventSource('/api/posts/stream');
      evtSource.addEventListener('SYNC_ALL', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { posts?: unknown[] };
          if (Array.isArray(data?.posts)) applyPostList(data.posts);
        } catch {
          // ignore
        }
      });
      evtSource.addEventListener('POST_CREATED', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { post?: unknown };
          if (data?.post) upsertSingleServerPost(data.post);
        } catch {
          // ignore
        }
      });
      evtSource.addEventListener('POST_UPDATED', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { post?: unknown };
          if (data?.post) upsertSingleServerPost(data.post);
        } catch {
          // ignore
        }
      });
    }

    let lastWakeSyncAt = 0;
    const handleAppWakeOrFocus = () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastWakeSyncAt < 2500) return;
      lastWakeSyncAt = now;
      void hydrateAllFromRest();
      if (!wsRef.current || (wsRef.current.readyState !== WebSocket.OPEN && wsRef.current.readyState !== WebSocket.CONNECTING)) {
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        backoffMs = 300;
        connectWebSocket();
      } else if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'AUTH',
              token: authTokenRef.current || undefined,
              userId: userIdRef.current,
            })
          );
        } catch {
          // ignore
        }
      }
      if (getNotificationPermission() === 'granted') {
        const prefs = getPhoneNotificationPrefs();
        if (prefs.enabled) {
          void syncPushSubscriptionWithServer(authTokenRef.current, prefs.notifyCourtChat);
        }
      }
    };

    window.addEventListener('focus', handleAppWakeOrFocus);
    window.addEventListener('online', handleAppWakeOrFocus);
    document.addEventListener('visibilitychange', handleAppWakeOrFocus);

    return () => {
      active = false;
      window.removeEventListener('focus', handleAppWakeOrFocus);
      window.removeEventListener('online', handleAppWakeOrFocus);
      document.removeEventListener('visibilitychange', handleAppWakeOrFocus);
      window.clearInterval(restFallbackTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN && manualOfflineMode) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'SET_PRESENCE_OFFLINE' }));
          } catch {
            // ignore
          }
        }
        wsRef.current.close();
        wsRef.current = null;
      }
      if (evtSource) evtSource.close();
    };
  }, [normalizeServerPost, isOnlineMode, manualOfflineMode]);

  // Keep WebSocket AUTH synced whenever authTokenState or user.id changes
  useEffect(() => {
    if (authTokenState && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'AUTH', token: authTokenState }));
        if (activeRtcRoomRef.current) {
          wsRef.current.send(
            JSON.stringify({
              type: 'LIVE_ROOM_JOIN',
              liveId: activeRtcRoomRef.current.liveId,
              role: activeRtcRoomRef.current.role,
              userId: user.id,
            })
          );
        }
      } catch {
        // ignore
      }
    }
  }, [authTokenState, user.id]);

  // Dedicated Live Host Heartbeat (10s WS + HTTP + visibility resume + full live snapshot for auto-recovery)
  const activeLivesLatestRef = useRef<LiveSession[]>(activeLives);
  useEffect(() => {
    activeLivesLatestRef.current = activeLives;
  }, [activeLives]);

  const hostedLiveIdsKey = useMemo(
    () =>
      activeLives
        .filter((l) => l.isActive && (l.hostId === user.id || l.hostMatricule === user.matricule))
        .map((l) => l.id)
        .join(','),
    [activeLives, user.id, user.matricule]
  );

  useEffect(() => {
    if (!hostedLiveIdsKey) return;
    const hostedIds = hostedLiveIdsKey.split(',').filter(Boolean);
    if (hostedIds.length === 0) return;

    const sendHostHeartbeats = () => {
      for (const liveId of hostedIds) {
        if (endedLiveIdsRef.current.has(liveId)) continue;
        const currentSnap = activeLivesLatestRef.current.find((l) => l.id === liveId);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(
              JSON.stringify({ type: 'LIVE_HEARTBEAT', liveId, userId: user.id })
            );
          } catch {
            // ignore
          }
        }
        void authFetch(`/api/lives/${encodeURIComponent(liveId)}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostId: user.id,
            live: currentSnap || undefined,
          }),
        }).catch(() => {});
      }
    };

    sendHostHeartbeats();
    const hbTimer = window.setInterval(sendHostHeartbeats, 8000);
    const onResume = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        sendHostHeartbeats();
      }
    };
    window.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onResume);

    return () => {
      window.clearInterval(hbTimer);
      window.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('online', onResume);
    };
  }, [hostedLiveIdsKey, user.id, authFetch]);

  // 24-hour pin maintenance (only modifies state if a pin actually expired)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPosts((current) => {
        const hasExpired = current.some((p) => p.isPinned && p.pinnedUntil && p.pinnedUntil < now);
        if (!hasExpired) return current;
        return current.map((p) =>
          p.isPinned && p.pinnedUntil && p.pinnedUntil < now ? { ...p, isPinned: false } : p
        );
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleSound = useCallback(() => {
    const isNowMuted = soundEngine.toggleMute();
    setSoundMuted(isNowMuted);
    if (isNowMuted) {
      pauseAmbientTrack();
    } else {
      soundEngine.unlock();
      soundEngine.playChatBlip();
    }
    showToast({
      title: isNowMuted ? 'Son désactivé 🔇' : 'Son activé 🔊',
      message: isNowMuted ? 'Mode silencieux actif.' : 'Son et musiques rétablis dans toute l’app.',
      type: 'info',
    });
  }, [pauseAmbientTrack, showToast]);

  const updateUserProfile = useCallback(
    (alias: string, avatar: string | null, bio?: string, silent?: boolean) => {
      try {
        const currentSnap = userLatestRef.current;
        const cleanAlias =
          (typeof alias === 'string' ? alias.trim().slice(0, 32) : '') || currentSnap.alias;
        const isClearingAvatar = avatar === null || avatar === '';
        const prevAvatar = typeof currentSnap.avatar === 'string' ? currentSnap.avatar : '';
        const cleanAvatar = isClearingAvatar
          ? ''
          : typeof avatar === 'string' && avatar.trim()
          ? avatar.trim()
          : prevAvatar;
        const cleanBio =
          typeof bio === 'string' ? bio.trim().slice(0, 240) : currentSnap.bio;

        if (isClearingAvatar) {
          avatarClearedRef.current = true;
        } else if (cleanAvatar) {
          avatarClearedRef.current = false;
        }

        if (isClearingAvatar && prevAvatar && (prevAvatar.startsWith('blob:') || prevAvatar.startsWith('idb://'))) {
          void revokeMediaUrlOrRef(prevAvatar);
        }

        setUser((prev) => {
          const next: UserProfile = {
            ...prev,
            alias: cleanAlias,
            avatar: cleanAvatar,
            ...(typeof bio === 'string' ? { bio: cleanBio } : {}),
          };
          userLatestRef.current = next;
          persistUserSafely(next);
          return next;
        });
        setAuthAccount((prev) =>
          prev
            ? {
                ...prev,
                profile: {
                  ...prev.profile,
                  alias: cleanAlias,
                  avatar: cleanAvatar,
                  ...(typeof bio === 'string' ? { bio: cleanBio } : {}),
                },
              }
            : prev
        );
        setPosts((prev) =>
          prev.map((post) => {
            const isMine =
              post.authorId === currentSnap.id || post.authorMatricule === currentSnap.matricule;
            const updatedComments = post.comments?.map((c) =>
              c.authorId === currentSnap.id || c.authorMatricule === currentSnap.matricule
                ? { ...c, authorAlias: cleanAlias, authorAvatar: cleanAvatar }
                : c
            );
            if (!isMine && !updatedComments) return post;
            return {
              ...post,
              ...(isMine ? { authorAlias: cleanAlias, authorAvatar: cleanAvatar } : {}),
              comments: updatedComments,
            };
          })
        );
        void (async () => {
          try {
            const ownerFolderId =
              currentSnap.supabaseUserId || supabaseUserIdRef.current || currentSnap.id;
            const syncedAvatar =
              cleanAvatar &&
              (cleanAvatar.startsWith('data:image/') ||
                cleanAvatar.startsWith('idb://') ||
                cleanAvatar.startsWith('blob:'))
                ? await uploadDataUrlForSync(cleanAvatar, {
                    folder: 'avatars',
                    userId: ownerFolderId,
                  })
                : cleanAvatar;
            if (
              syncedAvatar &&
              syncedAvatar !== cleanAvatar &&
              !syncedAvatar.startsWith('idb://')
            ) {
              if (cleanAvatar.startsWith('idb://') || cleanAvatar.startsWith('blob:')) {
                void revokeMediaUrlOrRef(cleanAvatar);
              }
              setUser((prev) => {
                const next = { ...prev, avatar: syncedAvatar };
                userLatestRef.current = next;
                persistUserSafely(next);
                return next;
              });
            }
            const latest = userLatestRef.current;
            syncUserFieldsToSupabase(latest, {
              username: cleanAlias,
              avatar_url: syncedAvatar ? syncedAvatar : null,
              ...(typeof bio === 'string' ? { bio: cleanBio } : {}),
            });
            const profilePayload = {
              id: latest.id,
              matricule: latest.matricule,
              referralCode: latest.referralCode,
              alias: cleanAlias,
              avatar: syncedAvatar ? syncedAvatar : null,
              ...(typeof bio === 'string' ? { bio: cleanBio } : {}),
            };
            if (!isOnlineModeRef.current) {
              queueActionForSync({
                type: 'UPDATE_PROFILE',
                endpoint: '/api/auth/profile',
                method: 'PATCH',
                body: profilePayload,
              });
              return;
            }
            const r = await authFetch('/api/auth/profile', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(profilePayload),
            });
            if (r.ok) {
              const d = (await r.json()) as { token?: string; account?: AuthAccountInfo };
              if (d?.account && (!userIdRef.current || d.account.profile.id === userIdRef.current)) {
                applyServerAccount(d.account, d.token || undefined);
              }
            } else if (r.status >= 500) {
              queueActionForSync({
                type: 'UPDATE_PROFILE',
                endpoint: '/api/auth/profile',
                method: 'PATCH',
                body: profilePayload,
              });
            }
          } catch {
            const latest = userLatestRef.current;
            queueActionForSync({
              type: 'UPDATE_PROFILE',
              endpoint: '/api/auth/profile',
              method: 'PATCH',
              body: {
                id: latest.id,
                matricule: latest.matricule,
                referralCode: latest.referralCode,
                alias: cleanAlias,
                avatar: cleanAvatar ? cleanAvatar : null,
                ...(typeof bio === 'string' ? { bio: cleanBio } : {}),
              },
            });
          }
        })();
        if (!silent) {
          const isPhotoOrPath =
            Boolean(cleanAvatar) &&
            (cleanAvatar.startsWith('/') ||
              cleanAvatar.startsWith('data:') ||
              cleanAvatar.startsWith('http') ||
              cleanAvatar.startsWith('blob:') ||
              cleanAvatar.startsWith('idb:'));
          showToast({
            title: 'Identité mise à jour !',
            message: `Profil enregistré : ${cleanAlias}`,
            icon: isPhotoOrPath || !cleanAvatar ? '🆔' : cleanAvatar,
            type: 'success',
          });
        }
      } catch (err) {
        showToast({
          title: 'Erreur de mise à jour',
          message:
            err instanceof Error
              ? err.message
              : 'Impossible de mettre à jour la photo ou le profil.',
          type: 'warning',
        });
      }
    },
    [authFetch, applyServerAccount, persistUserSafely, syncUserFieldsToSupabase, queueActionForSync, showToast]
  );

  const removeUserAvatar = useCallback(async (): Promise<boolean> => {
    try {
      const currentSnap = userLatestRef.current;
      const previousAvatar = typeof currentSnap?.avatar === 'string' ? currentSnap.avatar : '';
      avatarClearedRef.current = true;
      if (
        previousAvatar &&
        (previousAvatar.startsWith('blob:') || previousAvatar.startsWith('idb://'))
      ) {
        void revokeMediaUrlOrRef(previousAvatar);
      }

      setUser((prev) => {
        const next: UserProfile = {
          ...prev,
          avatar: '',
        };
        userLatestRef.current = next;
        persistUserSafely(next);
        return next;
      });
      setAuthAccount((prev) =>
        prev ? { ...prev, profile: { ...prev.profile, avatar: '' } } : prev
      );
      setPosts((prev) =>
        prev.map((post) => {
          const isMine =
            post.authorId === currentSnap.id || post.authorMatricule === currentSnap.matricule;
          const updatedComments = post.comments?.map((c) =>
            c.authorId === currentSnap.id || c.authorMatricule === currentSnap.matricule
              ? { ...c, authorAvatar: '' }
              : c
          );
          if (!isMine && !updatedComments) return post;
          return {
            ...post,
            ...(isMine ? { authorAvatar: '' } : {}),
            comments: updatedComments,
          };
        })
      );

      const sbUid = currentSnap.supabaseUserId || supabaseUserIdRef.current;
      if (sbUid && isSupabaseConfigured) {
        void saveCloudProfileSnapshot(sbUid, { ...userLatestRef.current, avatar: '' });
        const saved = await saveSupabaseProfilePatch(sbUid, { avatar_url: null });
        if (!saved) {
          showToast({
            title: 'Synchronisation partielle',
            message: 'Photo supprimée localement, mais Supabase n’a pas pu être mis à jour.',
            type: 'warning',
          });
        }
      }

      try {
        await authFetch('/api/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentSnap.id,
            matricule: currentSnap.matricule,
            avatar: null,
          }),
        });
      } catch {
        // offline server patch safe fallback
      }

      showToast({
        title: 'Photo de profil supprimée ✓',
        message: 'Ton icône par défaut est maintenant affichée.',
        type: 'info',
      });
      return true;
    } catch (err) {
      showToast({
        title: 'Erreur lors de la suppression',
        message:
          err instanceof Error ? err.message : 'Impossible de supprimer ta photo de profil.',
        type: 'warning',
      });
      return false;
    }
  }, [authFetch, persistUserSafely, showToast]);

  const updateProfileStatus = useCallback(
    async (params: { profileType?: 'personal' | 'professional' }) => {
      const nextType = params.profileType === 'professional' ? 'professional' : 'personal';
      setUser((prev) => {
        const next: UserProfile = {
          ...prev,
          profileType: nextType,
        };
        userLatestRef.current = next;
        persistUserSafely(next);
        return next;
      });
      setAuthAccount((prev) =>
        prev ? { ...prev, profile: { ...prev.profile, profileType: nextType } } : prev
      );

      showToast({
        title: nextType === 'professional' ? 'Statut Professionnel activé 💼' : 'Statut Particulier activé 👤',
        message:
          nextType === 'professional'
            ? 'La mention « Pro » apparaît désormais à côté de ton pseudo.'
            : 'La mention « Particulier » est maintenant affichée sur ton profil.',
        icon: nextType === 'professional' ? '💼' : '👤',
        type: 'success',
      });

      try {
        const latest = userLatestRef.current;
        const r = await authFetch('/api/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: latest.id,
            matricule: latest.matricule,
            referralCode: latest.referralCode,
            profileType: nextType,
          }),
        });
        if (r.ok) {
          const d = (await r.json()) as { token?: string; account?: AuthAccountInfo };
          if (d?.account && (!userIdRef.current || d.account.profile.id === userIdRef.current)) {
            applyServerAccount(d.account, d.token || undefined);
          }
        }
      } catch {
        // persisted locally
      }
    },
    [authFetch, applyServerAccount, persistUserSafely, showToast]
  );

  const setActiveFlame = useCallback(
    async (payload: {
      id?: string;
      type: 'text' | 'photo' | 'audio' | 'video' | 'file';
      url?: string;
      text?: string;
      caption?: string;
      bgGradient?: string;
      duration?: number;
      fileName?: string;
      bgMusic?: DeezerTrack;
    }): Promise<boolean> => {
      const now = Date.now();
      const expiresAt = now + 24 * 60 * 60 * 1000;
      let resolvedUrl = typeof payload.url === 'string' ? payload.url.trim() : undefined;

      if (payload.type === 'text') {
        if (!payload.text || !payload.text.trim()) {
          showToast({
            title: 'Flamme vide',
            message: 'Écris un message avant de publier ta Flamme 24h.',
            icon: '✍️',
            type: 'warning',
          });
          return false;
        }
      } else {
        if (!resolvedUrl) {
          showToast({
            title: 'Média requis',
            message: 'Sélectionne une photo, vidéo ou note vocale pour ta Flamme 24h.',
            icon: '🔥',
            type: 'warning',
          });
          return false;
        }
        const ownerFolderId =
          userLatestRef.current.supabaseUserId || supabaseUserIdRef.current || userLatestRef.current.id;
        try {
          if (resolvedUrl.startsWith('idb://') || resolvedUrl.startsWith('blob:')) {
            const uploaded = await uploadMediaBlobForSync(resolvedUrl, {
              folder: 'flames',
              fileName: payload.fileName,
              userId: ownerFolderId,
            });
            if (uploaded && !uploaded.startsWith('idb://') && !uploaded.startsWith('blob:') && !uploaded.startsWith('data:')) {
              void revokeMediaUrlOrRef(resolvedUrl);
              resolvedUrl = uploaded;
            }
          } else if (resolvedUrl.startsWith('data:')) {
            const uploaded = await uploadDataUrlForSync(resolvedUrl, {
              folder: 'flames',
              fileName: payload.fileName,
              userId: ownerFolderId,
            });
            if (uploaded && !uploaded.startsWith('idb://') && !uploaded.startsWith('data:')) {
              resolvedUrl = uploaded;
            }
          }
        } catch {
          // fallback to existing url
        }
      }

      const activeFlame: ActiveFlameItem = {
        id: payload.id || `flame_${now}_${Math.random().toString(36).slice(2, 6)}`,
        type: payload.type,
        url: resolvedUrl,
        text: payload.text?.trim().slice(0, 400),
        caption: payload.caption?.trim().slice(0, 180) || undefined,
        bgGradient: payload.bgGradient,
        duration: payload.duration,
        fileName: payload.fileName,
        createdAt: now,
        expiresAt,
        comments: [],
        bgMusic: payload.bgMusic,
      };

      flameClearedRef.current = false;
      setUser((prev) => {
        const next: UserProfile = {
          ...prev,
          activeFlame,
        };
        userLatestRef.current = next;
        persistUserSafely(next);
        syncUserFieldsToSupabase(next, { active_flame: activeFlame });
        return next;
      });
      setAuthAccount((prev) =>
        prev ? { ...prev, profile: { ...prev.profile, activeFlame } } : prev
      );

      soundEngine.playKeyTurn();
      showToast({
        title: 'Flamme 24h allumée 🔥',
        message: 'Visible 24h sur ton profil · Tes amis viennent d’être notifiés !',
        type: 'success',
        icon: '🔥',
      });

      try {
        const res = await authFetch('/api/auth/profile/flame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...activeFlame,
            userId: userLatestRef.current.id,
            matricule: userLatestRef.current.matricule,
            alias: userLatestRef.current.alias,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            success?: boolean;
            account?: AuthAccountInfo;
            profile?: UserProfile;
          };
          const serverFlame = data?.profile?.activeFlame || data?.account?.profile?.activeFlame;
          // Ne JAMAIS écraser tout le profil utilisateur sur un retour de flamme : on met uniquement à jour activeFlame
          if (serverFlame && !flameClearedRef.current) {
            setUser((prev) => {
              const next: UserProfile = {
                ...prev,
                activeFlame: {
                  ...activeFlame,
                  ...serverFlame,
                  bgMusic: serverFlame.bgMusic || activeFlame.bgMusic,
                },
              };
              userLatestRef.current = next;
              persistUserSafely(next);
              return next;
            });
          }
        }
      } catch {
        // saved locally
      }
      return true;
    },
    [authFetch, persistUserSafely, syncUserFieldsToSupabase, showToast]
  );

  const removeActiveFlame = useCallback(async () => {
    const prevFlameUrl = userLatestRef.current.activeFlame?.url;
    flameClearedRef.current = true;
    setUser((prev) => {
      const next: UserProfile = {
        ...prev,
        activeFlame: undefined,
      };
      userLatestRef.current = next;
      persistUserSafely(next);
      syncUserFieldsToSupabase(next, { active_flame: null });
      return next;
    });
    setAuthAccount((prev) =>
      prev ? { ...prev, profile: { ...prev.profile, activeFlame: undefined } } : prev
    );

    if (prevFlameUrl && (prevFlameUrl.startsWith('idb://') || prevFlameUrl.startsWith('blob:'))) {
      void revokeMediaUrlOrRef(prevFlameUrl);
    }
    if (currentAmbientTrackRef.current?.id?.startsWith('flame_')) {
      stopAmbientTrack();
    }

    showToast({
      title: 'Flamme éteinte 🕯️',
      message: 'Ta flamme 24h a été retirée de ton profil.',
      type: 'info',
    });

    try {
      await authFetch('/api/auth/profile/flame', {
        method: 'DELETE',
      });
    } catch {
      // updated locally
    }
  }, [authFetch, persistUserSafely, syncUserFieldsToSupabase, showToast]);

  const commentOnFlame = useCallback(
    async (
      targetIdentifier: string,
      content: string,
      giftType?: string
    ): Promise<{ success: boolean; activeFlame?: ActiveFlameItem; error?: string }> => {
      const cleanId = targetIdentifier.trim();
      const cleanContent = content.trim().slice(0, 300);
      if (!cleanId || !cleanContent) {
        return { success: false, error: 'Écris un commentaire avant d’envoyer.' };
      }
      try {
        const res = await authFetch(`/api/users/${encodeURIComponent(cleanId)}/flame/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: cleanContent, giftType }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          activeFlame?: ActiveFlameItem;
          error?: string;
          authorKeys?: number;
          authorPadlocks?: number;
        };
        if (!res.ok || !data?.success) {
          return { success: false, error: data?.error || 'Impossible de publier ce commentaire.' };
        }
        soundEngine.playChatBlip();
        if (typeof data.authorKeys === 'number' || typeof data.authorPadlocks === 'number') {
          setUser((prev) => {
            const next: UserProfile = {
              ...prev,
              keysAvailable: typeof data.authorKeys === 'number' ? data.authorKeys : prev.keysAvailable,
              padlocksAvailable: typeof data.authorPadlocks === 'number' ? data.authorPadlocks : prev.padlocksAvailable,
            };
            userLatestRef.current = next;
            persistUserSafely(next);
            return next;
          });
        }
        if (
          data.activeFlame &&
          (cleanId === userLatestRef.current.id ||
            cleanId === userLatestRef.current.matricule ||
            cleanId === userLatestRef.current.publicShareSlug)
        ) {
          const updatedFlame = data.activeFlame;
          setUser((prev) => {
            const next: UserProfile = { ...prev, activeFlame: updatedFlame };
            userLatestRef.current = next;
            persistUserSafely(next);
            return next;
          });
        }
        return { success: true, activeFlame: data.activeFlame };
      } catch {
        return { success: false, error: 'Erreur réseau lors de l’envoi du commentaire.' };
      }
    },
    [authFetch, persistUserSafely]
  );

  const universeStorageInfo = useMemo(() => {
    const isUnlimited =
      Boolean(user.isUniverseStorageUnlimited) || isMasterPassUser(user);
    const quota = Math.max(
      BASE_FREE_UNIVERSE_QUOTA,
      Number(user.universeStorageQuota || BASE_FREE_UNIVERSE_QUOTA)
    );
    const used = (user.universeMedia || []).filter(
      (m) => universeUploadStatuses[m.id] !== 'quota_blocked'
    ).length;
    const remaining = isUnlimited ? Infinity : Math.max(0, quota - used);
    const isFull = !isUnlimited && used >= quota;
    return { used, quota, isUnlimited, remaining, isFull };
  }, [user, universeUploadStatuses]);

  const warnedEightyPercentRef = useRef<boolean>(false);

  useEffect(() => {
    if (universeStorageInfo.isUnlimited || universeStorageInfo.quota <= 0) return;
    const ratio = universeStorageInfo.used / universeStorageInfo.quota;
    if (ratio >= 0.8 && !universeStorageInfo.isFull) {
      if (!warnedEightyPercentRef.current) {
        warnedEightyPercentRef.current = true;
        showToast({
          title: `Mémoire Univers à ${Math.round(ratio * 100)}% 🧠`,
          message: `Attention, tu as atteint 80% de ton espace de stockage (${universeStorageInfo.used}/${universeStorageInfo.quota}). Pense à étendre ta mémoire dans la boutique PayPal !`,
          icon: '💾',
          type: 'warning',
          action: {
            label: 'Boutique Stockage (PayPal)',
            onClick: () =>
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
              }),
          },
        });
      }
    } else if (ratio < 0.8) {
      warnedEightyPercentRef.current = false;
    }
  }, [universeStorageInfo.used, universeStorageInfo.quota, universeStorageInfo.isUnlimited, universeStorageInfo.isFull, showToast, openShop]);

  const syncSingleUniverseItemToServer = useCallback(
    async (
      targetItem: ProfileUniverseItem,
      accountSnapshot: { id: string; matricule: string; alias: string; avatar: string }
    ): Promise<'saved' | 'quota_blocked' | 'local_only'> => {
      const clientId = targetItem.id;
      setUniverseUploadStatuses((prev) => ({ ...prev, [clientId]: 'uploading' }));

      try {
        if (targetItem.url.startsWith('idb://')) {
          const blob = await resolveMediaBlob(targetItem.url);
          if (!blob) {
            // Ne JAMAIS supprimer automatiquement un média de l'utilisateur en cas de lecture IDB échouée
            setUniverseUploadStatuses((prev) => ({ ...prev, [clientId]: 'local_only' }));
            return 'local_only';
          }
        }

        const latestUser = userLatestRef.current;
        const ownerFolderId =
          latestUser.supabaseUserId || supabaseUserIdRef.current || latestUser.id || accountSnapshot.id;
        const syncedUrl = await uploadDataUrlForSync(targetItem.url, {
          folder: 'universe',
          fileName: targetItem.fileName,
          userId: ownerFolderId,
        });
        if (syncedUrl.startsWith('idb://') || syncedUrl.startsWith('blob:')) {
          setUniverseUploadStatuses((prev) => ({ ...prev, [clientId]: 'local_only' }));
          return 'local_only';
        }

        const rawUserAvatar =
          typeof latestUser.avatar === 'string'
            ? latestUser.avatar
            : typeof accountSnapshot.avatar === 'string'
            ? accountSnapshot.avatar
            : '';
        const syncedUserAvatar =
          rawUserAvatar &&
          (rawUserAvatar.startsWith('data:image/') ||
            rawUserAvatar.startsWith('idb://') ||
            rawUserAvatar.startsWith('blob:'))
            ? await uploadDataUrlForSync(rawUserAvatar, {
                folder: 'avatars',
                userId: ownerFolderId,
              })
            : rawUserAvatar;

        const savedItemLocal: ProfileUniverseItem = { ...targetItem, url: syncedUrl };
        // Sauvegarder IMMEDIATEMENT l'URL publique dans React + localStorage + IndexedDB + Supabase AVANT tout appel serveur ou nettoyage IDB !
        const nextMediaLocal = (userLatestRef.current.universeMedia || []).some((m) => m.id === clientId)
          ? (userLatestRef.current.universeMedia || []).map((m) =>
              m.id === clientId ? savedItemLocal : m
            )
          : [savedItemLocal, ...(userLatestRef.current.universeMedia || [])];

        pendingUniverseItemsRef.current.set(clientId, savedItemLocal);
        const updatedPending = readPersistedPendingUniverse(
          latestUser.id || accountSnapshot.id
        ).map((m) => (m.id === clientId ? savedItemLocal : m));
        writePersistedPendingUniverse(latestUser.id || accountSnapshot.id, updatedPending);

        setUser((prev) => {
          const prevList = prev.universeMedia || [];
          const mergedList = prevList.some((m) => m.id === clientId)
            ? prevList.map((m) => (m.id === clientId ? savedItemLocal : m))
            : [savedItemLocal, ...prevList];
          const next: UserProfile = {
            ...prev,
            avatar: syncedUserAvatar || prev.avatar,
            universeMedia: mergedList,
          };
          userLatestRef.current = next;
          currentUserUniverseRef.current = mergedList;
          persistUserSafely(next);
          return next;
        });

        syncUserFieldsToSupabase(
          { ...userLatestRef.current, avatar: syncedUserAvatar, universeMedia: nextMediaLocal },
          {
            universe_media: nextMediaLocal,
            avatar_url: syncedUserAvatar ? syncedUserAvatar : null,
          }
        );

        // Ne libérer le blob local IndexedDB QUE si l'URL est une URL Cloud HTTPS permanente (jamais avant !)
        if (
          targetItem.url !== syncedUrl &&
          (syncedUrl.startsWith('https://') || syncedUrl.startsWith('http://')) &&
          (targetItem.url.startsWith('idb://') || targetItem.url.startsWith('blob:'))
        ) {
          void revokeMediaUrlOrRef(targetItem.url);
        }

        const res = await authFetch('/api/auth/universe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: latestUser.id || accountSnapshot.id,
            matricule: latestUser.matricule || accountSnapshot.matricule,
            referralCode: latestUser.referralCode,
            alias: latestUser.alias || accountSnapshot.alias,
            avatar: syncedUserAvatar,
            bio: latestUser.bio,
            clientId,
            type: targetItem.type,
            url: syncedUrl,
            caption: targetItem.caption,
            duration: targetItem.duration,
            fileName: targetItem.fileName,
            mimeType: targetItem.mimeType,
            fileSize: targetItem.fileSize,
            visibility: targetItem.visibility,
            bgMusic: targetItem.bgMusic,
          }),
        });

        if (res.status === 402) {
          setUniverseUploadStatuses((prev) => ({ ...prev, [clientId]: 'quota_blocked' }));
          return 'quota_blocked';
        }

        if (res.ok) {
          const data = (await res.json()) as {
            success?: boolean;
            token?: string;
            item?: ProfileUniverseItem;
            account?: AuthAccountInfo;
          };
          pendingUniverseItemsRef.current.delete(clientId);
          const remainingPending = readPersistedPendingUniverse(
            latestUser.id || accountSnapshot.id
          ).filter((m) => m.id !== clientId);
          writePersistedPendingUniverse(latestUser.id || accountSnapshot.id, remainingPending);
          setUniverseUploadStatuses((prev) => ({ ...prev, [clientId]: 'saved' }));

          const savedItem = data?.item || savedItemLocal;
          currentUserUniverseRef.current = (currentUserUniverseRef.current || []).map((m) =>
            m.id === clientId ? savedItem : m
          );
          if (data?.account?.profile) {
            applyServerAccount(data.account, data.token || undefined);
          } else {
            setUser((prev) => {
              const next: UserProfile = {
                ...prev,
                universeMedia: (prev.universeMedia || []).map((m) =>
                  m.id === clientId ? savedItem : m
                ),
              };
              userLatestRef.current = next;
              currentUserUniverseRef.current = Array.isArray(next.universeMedia)
                ? next.universeMedia
                : [];
              persistUserSafely(next);
              return next;
            });
          }
          return 'saved';
        }
      } catch {
        // fallback stays retained locally
      }

      setUniverseUploadStatuses((prev) => ({ ...prev, [clientId]: 'local_only' }));
      return 'local_only';
    },
    [
      authFetch,
      applyServerAccount,
      persistUserSafely,
      syncUserFieldsToSupabase,
      readPersistedPendingUniverse,
      writePersistedPendingUniverse,
    ]
  );

  const addUniverseMedia = useCallback(
    async (item: {
      type: 'photo' | 'audio' | 'video' | 'file';
      url: string;
      caption?: string;
      duration?: number;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      visibility?: 'public' | 'private';
      bgMusic?: DeezerTrack;
    }): Promise<ProfileUniverseItem | null> => {
      try {
        const clientId = `uni_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const cleanCaption = item.caption?.trim().slice(0, 140) || undefined;

        // Compact oversized data URLs to IndexedDB refs immediately so localStorage NEVER overflows
        let safeLocalUrl = item.url;
        if (safeLocalUrl.startsWith('data:') && safeLocalUrl.length > 48_000) {
          const blobRef = await saveDataUrlToBlobRef(safeLocalUrl);
          if (blobRef) safeLocalUrl = blobRef;
        }

        const defaultVisibility: 'public' | 'private' =
          item.visibility || (user.isUniversePublic === false ? 'private' : 'public');

        const optimisticItem: ProfileUniverseItem = {
          id: clientId,
          type: item.type,
          url: safeLocalUrl,
          caption: cleanCaption,
          duration: item.duration,
          fileName: item.fileName,
          mimeType: item.mimeType,
          fileSize: item.fileSize,
          visibility: defaultVisibility,
          bgMusic: item.bgMusic,
          createdAt: Date.now(),
        };

        const isQuotaReachedNow = universeStorageInfo.isFull;
        pendingUniverseItemsRef.current.set(clientId, optimisticItem);
        const currentPending = readPersistedPendingUniverse(user.id).filter((m) => m.id !== clientId);
        writePersistedPendingUniverse(user.id, [optimisticItem, ...currentPending]);

        setUser((prev) => {
          const nextMedia = [optimisticItem, ...(prev.universeMedia || [])];
          const next: UserProfile = {
            ...prev,
            universeMedia: nextMedia,
          };
          userLatestRef.current = next;
          currentUserUniverseRef.current = nextMedia;
          persistUserSafely(next);
          return next;
        });

        if (isQuotaReachedNow) {
          setUniverseUploadStatuses((prev) => ({ ...prev, [clientId]: 'quota_blocked' }));
          showToast({
            title: `Mémoire pleine (${universeStorageInfo.used}/${universeStorageInfo.quota}) 🧠`,
            message:
              'Ton fichier est retenu en attente. Agrandis ta mémoire Univers pour le valider sans rien effacer !',
            icon: '💾',
            type: 'warning',
            action: {
              label: 'Agrandir mémoire',
              onClick: () =>
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
                }),
            },
          });
          return optimisticItem;
        }

        const outcome = await syncSingleUniverseItemToServer(
          { ...optimisticItem, url: item.url.startsWith('data:') ? item.url : safeLocalUrl },
          {
            id: user.id,
            matricule: user.matricule,
            alias: user.alias,
            avatar: typeof user.avatar === 'string' ? user.avatar : '',
          }
        );

        if (outcome === 'quota_blocked') {
          showToast({
            title: `Limite mémoire atteinte (${universeStorageInfo.quota}) 🧠`,
            message:
              'Fichier retenu en attente. Débloque plus de mémoire pour l’enregistrer sur ton profil !',
            icon: '💾',
            type: 'warning',
            action: {
              label: 'Agrandir mémoire',
              onClick: () =>
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
                }),
            },
          });
        }

        return optimisticItem;
      } catch (err) {
        showToast({
          title: 'Erreur lors de l’ajout du média',
          message: err instanceof Error ? err.message : 'Impossible d’ajouter ce média.',
          type: 'warning',
        });
        return null;
      }
    },
    [
      user.id,
      user.matricule,
      user.alias,
      user.avatar,
      user.isUniversePublic,
      universeStorageInfo,
      readPersistedPendingUniverse,
      writePersistedPendingUniverse,
      persistUserSafely,
      syncSingleUniverseItemToServer,
      showToast,
      openShop,
    ]
  );

  const toggleUniversePublic = useCallback(
    async (isPublic: boolean, applyToAll = false): Promise<void> => {
      setUser((prev) => {
        const nextMedia = applyToAll
          ? (prev.universeMedia || []).map((m) => ({
              ...m,
              visibility: (isPublic ? 'public' : 'private') as 'public' | 'private',
            }))
          : prev.universeMedia;
        const next: UserProfile = {
          ...prev,
          isUniversePublic: isPublic,
          universeMedia: nextMedia,
        };
        userLatestRef.current = next;
        currentUserUniverseRef.current = Array.isArray(next.universeMedia) ? next.universeMedia : [];
        persistUserSafely(next);
        syncUserFieldsToSupabase(next, { universe_media: currentUserUniverseRef.current });
        return next;
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('evasion:media-feed-updated', {
            detail: { action: 'visibility_updated', ownerId: user.id, isUniversePublic: isPublic },
          })
        );
      }

      try {
        const res = await authFetch('/api/auth/universe/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isUniversePublic: isPublic, applyToAll }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            success?: boolean;
            token?: string;
            account?: AuthAccountInfo;
          };
          if (data.account) {
            applyServerAccount(data.account, data.token || undefined);
          }
        }
      } catch {
        // optimistic state already saved locally
      }

      showToast({
        title: isPublic ? 'Médias en mode Public 🌍' : 'Médias en mode Privé 🔒',
        message: isPublic
          ? 'Tes médias publics sont visibles sur ton profil et dans le Live Média.'
          : 'Tes médias sont désormais privés et masqués du Live Média et des visiteurs.',
        type: 'info',
      });
    },
    [user.id, authFetch, applyServerAccount, persistUserSafely, syncUserFieldsToSupabase, showToast]
  );

  const setUniverseItemVisibility = useCallback(
    async (itemId: string, visibility: 'public' | 'private'): Promise<void> => {
      let targetUrl: string | undefined;
      setUser((prev) => {
        const nextMedia = (prev.universeMedia || []).map((m) => {
          if (m.id === itemId) {
            targetUrl = m.url;
            return { ...m, visibility };
          }
          return m;
        });
        const next: UserProfile = {
          ...prev,
          universeMedia: nextMedia,
        };
        userLatestRef.current = next;
        currentUserUniverseRef.current = nextMedia;
        persistUserSafely(next);
        syncUserFieldsToSupabase(next, { universe_media: nextMedia });
        return next;
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('evasion:media-feed-updated', {
            detail: {
              action: visibility === 'private' ? 'deleted' : 'added',
              ownerId: user.id,
              itemId,
              url: targetUrl,
            },
          })
        );
      }

      try {
        const res = await authFetch('/api/auth/universe/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, visibility }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            success?: boolean;
            token?: string;
            account?: AuthAccountInfo;
          };
          if (data.account) {
            applyServerAccount(data.account, data.token || undefined);
          }
        }
      } catch {
        // optimistic update already applied
      }

      showToast({
        title: visibility === 'public' ? 'Média partagé en Public 🌍' : 'Média passé en Privé 🔒',
        message:
          visibility === 'public'
            ? 'Ce média est visible dans ton profil public et dans le Live Média.'
            : 'Ce média est masqué des autres utilisateurs et du Live Média.',
        type: 'info',
      });
    },
    [user.id, authFetch, applyServerAccount, persistUserSafely, syncUserFieldsToSupabase, showToast]
  );

  const retryUniverseMediaUpload = useCallback(
    async (itemId: string): Promise<void> => {
      const target =
        (user.universeMedia || []).find((m) => m.id === itemId) ||
        pendingUniverseItemsRef.current.get(itemId);
      if (!target) return;
      const outcome = await syncSingleUniverseItemToServer(target, {
        id: user.id,
        matricule: user.matricule,
        alias: user.alias,
        avatar: user.avatar,
      });
      if (outcome === 'saved') {
        showToast({
          title: 'Média synchronisé ✓',
          message: 'Enregistré sur ton profil Univers.',
          type: 'success',
        });
      } else if (outcome === 'quota_blocked') {
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
      }
    },
    [
      user.id,
      user.matricule,
      user.alias,
      user.avatar,
      user.universeMedia,
      syncSingleUniverseItemToServer,
      showToast,
      openShop,
    ]
  );

  // Auto-resume any retained unsynced/local_only uploads after reload, memory upgrade, or returning online
  useEffect(() => {
    if (isAuthLoading || !isOnlineMode) return;
    const retained = readPersistedPendingUniverse(user.id);
    const unsynced = (user.universeMedia || []).filter(
      (m) =>
        m.url.startsWith('idb://') ||
        m.url.startsWith('data:') ||
        retained.some((r) => r.id === m.id)
    );
    if (unsynced.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const pendingItem of unsynced) {
        if (cancelled || !isOnlineModeRef.current) break;
        const status = universeUploadStatuses[pendingItem.id];
        if (status === 'uploading' || status === 'saved') continue;
        if (status === 'quota_blocked' && universeStorageInfo.isFull) continue;
        await syncSingleUniverseItemToServer(pendingItem, {
          id: user.id,
          matricule: user.matricule,
          alias: user.alias,
          avatar: user.avatar,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isAuthLoading,
    isOnlineMode,
    user.id,
    user.universeStorageQuota,
    user.isUniverseStorageUnlimited,
    universeStorageInfo.isFull,
    readPersistedPendingUniverse,
    syncSingleUniverseItemToServer,
  ]);

  const removeUniverseMedia = useCallback(
    async (itemId: string): Promise<void> => {
      try {
        const targetItem = (currentUserUniverseRef.current || []).find((m) => m.id === itemId);
        const removedUrl = targetItem?.url;

        if (removedUrl) {
          void revokeMediaUrlOrRef(removedUrl);
        }
        const activeTrack = currentAmbientTrackRef.current;
        if (
          activeTrack &&
          (activeTrack.id === `universe_${itemId}` ||
            (targetItem?.bgMusic?.previewUrl &&
              activeTrack.track?.previewUrl === targetItem.bgMusic.previewUrl) ||
            (removedUrl && activeTrack.track?.previewUrl === removedUrl))
        ) {
          stopAmbientTrack();
        }

        pendingUniverseItemsRef.current.delete(itemId);
        deletedUniverseIdsRef.current.add(itemId);
        currentUserUniverseRef.current = (currentUserUniverseRef.current || []).filter(
          (m) => m.id !== itemId && (!removedUrl || m.url !== removedUrl)
        );

        const remainingPending = readPersistedPendingUniverse(user.id).filter(
          (m) => m.id !== itemId && (!removedUrl || m.url !== removedUrl)
        );
        writePersistedPendingUniverse(user.id, remainingPending);
        setUniverseUploadStatuses((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        setUser((prev) => {
          const filtered = (prev.universeMedia || []).filter(
            (m) => m.id !== itemId && (!removedUrl || m.url !== removedUrl)
          );
          const next: UserProfile = {
            ...prev,
            universeMedia: filtered,
          };
          userLatestRef.current = next;
          persistUserSafely(next);
          syncUserFieldsToSupabase(next, { universe_media: filtered });
          return next;
        });
        if (removedUrl) {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.authorId !== user.id && p.authorMatricule !== user.matricule) return p;
              const matchesVideo = p.videoUrl === removedUrl;
              const matchesImage = p.imageUrl === removedUrl;
              const matchesAudio = p.audioNote?.audioData === removedUrl;
              if (!matchesVideo && !matchesImage && !matchesAudio) return p;
              return {
                ...p,
                videoUrl: matchesVideo ? undefined : p.videoUrl,
                videoDuration: matchesVideo ? undefined : p.videoDuration,
                imageUrl: matchesImage ? undefined : p.imageUrl,
                audioNote: matchesAudio ? undefined : p.audioNote,
              };
            })
          );
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('evasion:media-feed-updated', {
              detail: {
                action: 'deleted',
                ownerId: user.id,
                itemId,
                url: removedUrl,
              },
            })
          );
        }
        try {
          const query = removedUrl ? `?url=${encodeURIComponent(removedUrl)}` : '';
          const res = await authFetch(`/api/auth/universe/${encodeURIComponent(itemId)}${query}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            const data = (await res.json()) as { account?: AuthAccountInfo };
            if (data?.account) applyServerAccount(data.account);
          }
        } catch {
          // ignore network hiccup
        }
      } catch (err) {
        showToast({
          title: 'Erreur de suppression',
          message: err instanceof Error ? err.message : 'Impossible de supprimer ce média.',
          type: 'warning',
        });
      }
    },
    [
      user.id,
      user.matricule,
      authFetch,
      applyServerAccount,
      persistUserSafely,
      syncUserFieldsToSupabase,
      readPersistedPendingUniverse,
      writePersistedPendingUniverse,
      showToast,
    ]
  );

  const openUserProfile = useCallback((target: DirectChatTarget) => {
    setUserProfileTarget(target);
  }, []);

  useEffect(() => {
    openUserProfileRef.current = openUserProfile;
  }, [openUserProfile]);

  const closeUserProfile = useCallback(() => {
    setUserProfileTarget(null);
  }, []);

  const fetchPublicUserProfile = useCallback(
    async (identifier: string): Promise<PublicUserProfile | null> => {
      const cleanId = identifier.trim();
      if (!cleanId) return null;
      try {
        const res = await authFetch(`/api/users/${encodeURIComponent(cleanId)}/profile`, {
          cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { success?: boolean; profile?: PublicUserProfile };
        return data?.success && data.profile ? data.profile : null;
      } catch {
        return null;
      }
    },
    [authFetch]
  );

  const refreshPlatformKeyStats = useCallback(async () => {
    try {
      const res = await authFetch('/api/platform/keys-stats', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { success?: boolean; stats?: PlatformKeyStats };
        if (data?.success && data.stats) {
          setPlatformKeyStats(data.stats);
        }
      }
    } catch {
      setPlatformKeyStats((prev) => ({
        ...prev,
        totalKeysSpent: posts.reduce((sum, p) => sum + (p.keysCount || 0), 0) + (user.keysGivenTotal || 0),
        totalPadlocksSealed: posts.reduce((sum, p) => sum + (p.padlocksSealCount || 1), 0),
        totalEscapes: posts.filter((p) => p.status === 'escaped').length,
        totalPosts: posts.length,
      }));
    }
  }, [authFetch, posts, user.keysGivenTotal]);

  const claimDailyBonusKeys = useCallback(() => {
    if (!requireFullKeyAccess('Bonus +3 Clés')) return;
    setUser((prev) => {
      const next: UserProfile = { ...prev, keysAvailable: prev.keysAvailable + 3 };
      userLatestRef.current = next;
      persistUserSafely(next);
      syncUserFieldsToSupabase(next, {});
      return next;
    });
    soundEngine.playKeyTurn();
    showToast({
      title: '+3 Clés ajoutées ! 🔑',
      message: 'Cadeau de la maison mon pote. Va libérer un camarade !',
      icon: '🎁',
      type: 'key',
    });
    if (!isOnlineModeRef.current) {
      queueActionForSync({
        type: 'CLAIM_KEYS',
        endpoint: '/api/account/claim-keys',
        method: 'POST',
      });
    } else if (isAuthenticated) {
      void authFetch('/api/account/claim-keys', { method: 'POST' })
        .then(async (r) => {
          if (r.ok) {
            const d = await r.json().catch(() => null);
            if (d?.profile) applyActionServerProfile(d.profile);
          } else if (r.status >= 500) {
            queueActionForSync({
              type: 'CLAIM_KEYS',
              endpoint: '/api/account/claim-keys',
              method: 'POST',
            });
          }
        })
        .catch(() => {
          queueActionForSync({
            type: 'CLAIM_KEYS',
            endpoint: '/api/account/claim-keys',
            method: 'POST',
          });
        });
    }
  }, [requireFullKeyAccess, showToast, isAuthenticated, authFetch, persistUserSafely, syncUserFieldsToSupabase, applyActionServerProfile, queueActionForSync]);

  const claimFreePadlock = useCallback(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const missionDone =
      user.dailyMissionCompletedDate === todayIso || (user.completedMissionsCount || 0) > 0;
    if (
      !isMasterPassUser(user) &&
      !missionDone &&
      (user.padlocksAvailable || 0) <= 0 &&
      !hasFullKeyAccess
    ) {
      showToast({
        title: 'Cadenas 🔒 · Mission du Jour requise',
        message: 'Valide ta Mission du Jour sur Le Mur pour débloquer les Cadenas (+4 🔑 & +1 🔒) !',
        icon: '🔒',
        type: 'warning',
      });
      return;
    }
    setUser((prev) => {
      const next: UserProfile = { ...prev, padlocksAvailable: (prev.padlocksAvailable || 0) + 2 };
      userLatestRef.current = next;
      persistUserSafely(next);
      syncUserFieldsToSupabase(next, {});
      return next;
    });
    soundEngine.playLockSound();
    showToast({
      title: '+2 Cadenas ajoutés ! 🔒',
      message: 'Utilise tes cadenas pour protéger ta flamme, verrouiller une tentation ou sceller un pacte !',
      icon: '🔒',
      type: 'success',
    });
    const payload = {
      id: user.id,
      matricule: user.matricule,
      alias: user.alias,
      avatar: user.avatar,
      referralCode: user.referralCode,
    };
    if (!isOnlineModeRef.current) {
      queueActionForSync({
        type: 'CLAIM_PADLOCKS',
        endpoint: '/api/account/claim-padlocks',
        method: 'POST',
        body: payload,
      });
      return;
    }
    void authFetch('/api/account/claim-padlocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json().catch(() => null);
          if (d?.profile) applyActionServerProfile(d.profile);
        } else if (r.status >= 500) {
          queueActionForSync({
            type: 'CLAIM_PADLOCKS',
            endpoint: '/api/account/claim-padlocks',
            method: 'POST',
            body: payload,
          });
        }
      })
      .catch(() => {
        queueActionForSync({
          type: 'CLAIM_PADLOCKS',
          endpoint: '/api/account/claim-padlocks',
          method: 'POST',
          body: payload,
        });
      });
  }, [user, hasFullKeyAccess, showToast, authFetch, persistUserSafely, syncUserFieldsToSupabase, applyActionServerProfile, queueActionForSync]);

  const triggerConfettiLiberation = useCallback(() => {
    const end = Date.now() + 2.5 * 1000;
    const colors = ['#10b981', '#34d399', '#6ee7b7', '#f59e0b', '#ffffff'];
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, []);

  const applyVerifiedServerPurchase = useCallback(
    ({
      item,
      methodLabel,
      profile,
      post,
      txId,
    }: {
      item: CheckoutItemRequest;
      methodLabel: string;
      profile?: UserProfile;
      post?: ConfessionPost | null;
      txId?: string;
    }) => {
      try {
        soundEngine.playLiberationFanfare();
        triggerConfettiLiberation();
      } catch {
        // ignore audio errors
      }

      if (profile) {
        applyActionServerProfile(profile);
      }
      if (post) {
        setPosts((prev) => {
          const idx = prev.findIndex((p) => p.id === post.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = normalizeServerPost(post, prev[idx]);
          return next;
        });
      }

      showToast({
        title: `Paiement ${methodLabel} vérifié ✅`,
        message: `${item.name} activé sur ton compte (${item.priceLabel})${txId ? ` · Réf: ${txId}` : ''}`,
        icon: '💎',
        type: 'success',
      });

      if ((item.type === 'kit' || item.type === 'digital_kit') && item.kitId) {
        const kit = DIGITAL_KITS.find((k) => k.id === item.kitId);
        if (kit) setActiveReadKit(kit);
      }
    },
    [triggerConfettiLiberation, persistUserSafely, normalizeServerPost, showToast]
  );

  // Give a key to a post (unlocked even at 4+ keys or whenever user has keys in pocket)
  const giveKey = useCallback(
    (postId: string): boolean => {
      if (keysBalanceRef.current <= 0 || user.keysAvailable <= 0) {
        showToast({
          title: 'Poche vide mon pote ! 🗝️',
          message:
            "Tu n'as plus de clé pour le moment. Valide la Mission du Jour (+4 🔑), publie un aveu (+2 🔑) ou passe par la Boutique !",
          icon: '🔒',
          type: 'warning',
          action: hasFullKeyAccess
            ? { label: '+3 Clés gratuites', onClick: claimDailyBonusKeys }
            : { label: 'Boutique (+ Clés) 🔑', onClick: () => openShop() },
        });
        return false;
      }

      const targetPost = posts.find((p) => p.id === postId);
      if (!targetPost || targetPost.status === 'escaped' || targetPost.keysCount >= targetPost.keysRequired) {
        return false;
      }

      keysBalanceRef.current = Math.max(0, keysBalanceRef.current - 1);
      const prevRank = getUserRank(user.keysGivenTotal).rank;
      const nextKeysGivenTotal = user.keysGivenTotal + 1;
      const nextRankInfo = getUserRank(nextKeysGivenTotal);
      const earnedMilestonePassePartout = nextKeysGivenTotal % 10 === 0;

      setUser((prev) => {
        if (prev.keysAvailable <= 0) return prev;
        const newKeysGivenTotal = prev.keysGivenTotal + 1;
        const newBadges = [...prev.badges];
        if (newKeysGivenTotal >= 10 && !newBadges.some((b) => b.id === 'badge_clef_or')) {
          const badgeTemplate = ALL_BADGES.find((b) => b.id === 'badge_clef_or');
          if (badgeTemplate) newBadges.push({ ...badgeTemplate, unlockedAt: Date.now() });
        }
        return {
          ...prev,
          keysAvailable: Math.max(0, prev.keysAvailable - 1),
          keysGivenTotal: newKeysGivenTotal,
          hasPassePartoutCount: (prev.hasPassePartoutCount || 0) + (newKeysGivenTotal % 10 === 0 ? 1 : 0),
          badges: newBadges,
        };
      });

      if (earnedMilestonePassePartout) {
        triggerConfettiLiberation();
        setTimeout(() => {
          showToast({
            title: '🏆 Palier Haute Valeur : +1 Passe-Partout offert !',
            message: `${nextKeysGivenTotal} clés offertes ! Chaque tranche de 10 clés débloque 1 Passe-Partout gratuit.`,
            icon: '🗝️',
            type: 'success',
          });
        }, 700);
      }

      if (nextRankInfo.rank !== prevRank) {
        triggerConfettiLiberation();
        setTimeout(() => {
          showToast({
            title: `Nouveau Grade : ${nextRankInfo.rank} ${nextRankInfo.icon} !`,
            message: `Avec ${nextKeysGivenTotal} clés offertes, tu passes au grade « ${nextRankInfo.title} » !`,
            icon: nextRankInfo.icon,
            type: 'success',
          });
        }, 1200);
      }

      soundEngine.playKeyTurn();

      let justEscaped = false;
      let updatedTargetPost: ConfessionPost | null = null;
      let resultingKeysCount = targetPost.keysCount + 1;

      setPosts((prevPosts) =>
        prevPosts.map((post) => {
          if (post.id !== postId) return post;
          const newKeysCount = post.keysCount + 1;
          resultingKeysCount = newKeysCount;
          const isNowEscaped = newKeysCount >= post.keysRequired && post.status !== 'escaped';
          if (isNowEscaped) justEscaped = true;
          const updated: ConfessionPost = {
            ...post,
            keysCount: newKeysCount,
            givenByMe: true,
            status: newKeysCount >= post.keysRequired ? 'escaped' : post.status,
            escapedAt: isNowEscaped ? Date.now() : post.escapedAt,
            keyDonors: post.keyDonors.includes(user.matricule) ? post.keyDonors : [...post.keyDonors, user.matricule],
          };
          updatedTargetPost = updated;
          return updated;
        })
      );

      if (resultingKeysCount >= targetPost.keysRequired) {
        showToast({
          title: '🔓 ÉVASION ACCOMPLIE (+100 pts) !',
          message: `${targetPost.authorMatricule} est officiellement libéré des barreaux (${targetPost.keysRequired}/${targetPost.keysRequired} clés) !`,
          icon: '✨',
          type: 'success',
        });
      } else {
        const remaining = Math.max(0, targetPost.keysRequired - resultingKeysCount);
        showToast({
          title: 'Clé Haute Valeur offerte (+100 pts) ! 🔑',
          message: `Plus que ${remaining} clé${remaining > 1 ? 's' : ''} pour libérer ${targetPost.authorMatricule}.`,
          icon: '🗝️',
          type: 'key',
        });
      }

      if (!isOnlineModeRef.current) {
        queueActionForSync({
          type: 'GIVE_KEY',
          endpoint: `/api/posts/${encodeURIComponent(postId)}/key`,
          method: 'POST',
        });
      } else {
        void authFetch(`/api/posts/${encodeURIComponent(postId)}/key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
          .then(async (r) => {
            if (r.ok) {
              const d = await r.json().catch(() => null);
              if (d?.profile) applyActionServerProfile(d.profile);
              if (d?.post) {
                setPosts((prev) => prev.map((p) => (p.id === d.post.id ? normalizeServerPost(d.post, p) : p)));
              }
            } else if (r.status >= 500) {
              queueActionForSync({
                type: 'GIVE_KEY',
                endpoint: `/api/posts/${encodeURIComponent(postId)}/key`,
                method: 'POST',
              });
            }
          })
          .catch(() => {
            queueActionForSync({
              type: 'GIVE_KEY',
              endpoint: `/api/posts/${encodeURIComponent(postId)}/key`,
              method: 'POST',
            });
          });
      }

      if (justEscaped && updatedTargetPost) {
        soundEngine.playLiberationFanfare();
        triggerConfettiLiberation();
        setLiberatedPostCelebration(updatedTargetPost);
        if (targetPost.authorId === user.id) {
          setUser((prev) => {
            const newBadges = [...prev.badges];
            if (!newBadges.some((b) => b.id === 'badge_evade_supreme')) {
              const b = ALL_BADGES.find((bg) => bg.id === 'badge_evade_supreme');
              if (b) newBadges.push({ ...b, unlockedAt: Date.now() });
            }
            return { ...prev, escapedCount: prev.escapedCount + 1, badges: newBadges };
          });
        }
      }
      return true;
    },
    [posts, user, hasFullKeyAccess, triggerConfettiLiberation, showToast, claimDailyBonusKeys, openShop, authFetch, normalizeServerPost, applyActionServerProfile, queueActionForSync]
  );

  // Reprendre son don de clé sur un aveu non encore libéré
  const revokeKey = useCallback(
    (postId: string): boolean => {
      const targetPost = posts.find((p) => p.id === postId);
      if (!targetPost) return false;

      if (targetPost.status === 'escaped') {
        showToast({
          title: 'Aveu déjà libéré ! 🔒',
          message: 'Impossible de reprendre ta clé : ce camarade a déjà franchi les barreaux.',
          icon: '⚠️',
          type: 'warning',
        });
        return false;
      }

      const hasGiven = targetPost.givenByMe || targetPost.keyDonors.includes(user.matricule);
      if (!hasGiven) {
        showToast({
          title: 'Aucun don à reprendre',
          message: 'Tu n’as pas offert de clé sur cette publication.',
          icon: 'ℹ️',
          type: 'info',
        });
        return false;
      }

      keysBalanceRef.current += 1;
      setUser((prev) => ({
        ...prev,
        keysAvailable: prev.keysAvailable + 1,
        keysGivenTotal: Math.max(0, prev.keysGivenTotal - 1),
      }));

      soundEngine.playKeyTurn();

      setPosts((prevPosts) =>
        prevPosts.map((post) => {
          if (post.id !== postId) return post;
          const nextCount = Math.max(0, post.keysCount - 1);
          return {
            ...post,
            keysCount: nextCount,
            givenByMe: false,
            keyDonors: post.keyDonors.filter((m) => m !== user.matricule),
          };
        })
      );

      showToast({
        title: 'Don de clé repris ↩️',
        message: `Ta clé a été remise dans ton trousseau (${user.keysAvailable + 1} clés disponibles).`,
        icon: '🗝️',
        type: 'info',
      });

      if (!isOnlineModeRef.current) {
        queueActionForSync({
          type: 'REVOKE_KEY',
          endpoint: `/api/posts/${encodeURIComponent(postId)}/revoke-key`,
          method: 'POST',
        });
      } else {
        void authFetch(`/api/posts/${encodeURIComponent(postId)}/revoke-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
          .then(async (r) => {
            if (r.ok) {
              const d = await r.json().catch(() => null);
              if (d?.profile) applyActionServerProfile(d.profile);
              if (d?.post) {
                setPosts((prev) => prev.map((p) => (p.id === d.post.id ? normalizeServerPost(d.post, p) : p)));
              }
            }
          })
          .catch(() => {
            queueActionForSync({
              type: 'REVOKE_KEY',
              endpoint: `/api/posts/${encodeURIComponent(postId)}/revoke-key`,
              method: 'POST',
            });
          });
      }

      return true;
    },
    [posts, user.matricule, user.keysAvailable, showToast, queueActionForSync, authFetch, applyActionServerProfile, normalizeServerPost]
  );

  // Create a new confession post (irreversible FIFO 100 on server, unlocked even at 0 keys)
  const createPost = useCallback(
    (
      content: string,
      category: PostCategory,
      audioNote?: { duration: number; hasVoiceFilter: boolean; audioData?: string },
      keysRequired = 5,
      imageUrl?: string,
      videoNote?: { videoUrl: string; duration: number },
      bgMusic?: DeezerTrack,
      attachedFile?: AttachedFileMeta
    ) => {
      const validKeysRequired = Math.max(1, Math.min(50, keysRequired));
      const newPost: ConfessionPost = {
        id: generateUniqueId('post'),
        authorId: user.id,
        authorMatricule: user.matricule,
        authorAlias: user.alias,
        authorAvatar: user.avatar,
        content: content.trim(),
        imageUrl,
        videoUrl: videoNote?.videoUrl,
        videoDuration: videoNote?.duration,
        attachedFile,
        category,
        createdAt: Date.now(),
        keysCount: 0,
        keysRequired: validKeysRequired,
        status: 'locked',
        givenByMe: false,
        keyDonors: [],
        audioNote,
        authorNeonColor: user.neonColor,
        authorFrame: user.cellBorderFrame,
        padlocksSealCount: 1,
        bgMusic,
      };

      pendingPostIdsRef.current.add(newPost.id);
      setPosts((prev) => [newPost, ...prev]);
      setUser((prev) => ({
        ...prev,
        keysAvailable: (prev.keysAvailable || 0) + 2,
        padlocksAvailable: (prev.padlocksAvailable || 0) + 1,
        points: (prev.points || 0) + 50,
      }));
      soundEngine.playLockSound();

      showToast({
        title: `Aveu publié (+2 🔑 & +1 🔒) !`,
        message: 'Ton aveu reste gravé en permanence sur Le Mur. Offre tes clés ou valide la Mission du Jour !',
        icon: '🔥',
        type: 'success',
      });

      void (async () => {
        try {
          const ownerFolderId = user.supabaseUserId || supabaseUserIdRef.current || user.id;
          const syncRef = async (ref?: string, folder = 'posts', fileName?: string) => {
            if (!ref) return ref;
            if (ref.startsWith('idb://') || ref.startsWith('blob:')) {
              const uploaded = await uploadMediaBlobForSync(ref, {
                folder,
                fileName,
                userId: ownerFolderId,
              });
              if (uploaded && uploaded !== ref && !uploaded.startsWith('idb://') && !uploaded.startsWith('blob:')) {
                void revokeMediaUrlOrRef(ref);
              }
              return uploaded || ref;
            }
            return ref;
          };

          const [syncedImageUrl, syncedVideoUrl, syncedAudioData, syncedFileUrl] = await Promise.all([
            syncRef(newPost.imageUrl, 'posts'),
            syncRef(newPost.videoUrl, 'posts'),
            syncRef(newPost.audioNote?.audioData, 'posts'),
            syncRef(newPost.attachedFile?.url, 'documents', newPost.attachedFile?.fileName),
          ]);

          const syncedAuthorAvatar =
            newPost.authorAvatar.startsWith('idb://') || newPost.authorAvatar.startsWith('blob:')
              ? (await uploadMediaBlobForSync(newPost.authorAvatar, {
                  folder: 'avatars',
                  userId: ownerFolderId,
                })) || newPost.authorAvatar
              : newPost.authorAvatar;

          const syncedAudioNote = newPost.audioNote
            ? { ...newPost.audioNote, audioData: syncedAudioData }
            : undefined;
          const syncedAttachedFile = newPost.attachedFile
            ? { ...newPost.attachedFile, url: syncedFileUrl || newPost.attachedFile.url }
            : undefined;

          if (
            syncedImageUrl !== newPost.imageUrl ||
            syncedVideoUrl !== newPost.videoUrl ||
            syncedAudioData !== newPost.audioNote?.audioData ||
            syncedFileUrl !== newPost.attachedFile?.url
          ) {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === newPost.id
                  ? {
                      ...p,
                      imageUrl: syncedImageUrl,
                      videoUrl: syncedVideoUrl,
                      audioNote: syncedAudioNote,
                      attachedFile: syncedAttachedFile,
                    }
                  : p
              )
            );
          }

          if (!isOnlineModeRef.current) {
            queueActionForSync({
              type: 'CREATE_POST',
              endpoint: '/api/posts',
              method: 'POST',
              body: {
                ...newPost,
                authorAvatar: syncedAuthorAvatar,
                imageUrl: syncedImageUrl,
                videoUrl: syncedVideoUrl,
                audioNote: syncedAudioNote,
                attachedFile: syncedAttachedFile,
                bgMusic,
              },
            });
            return;
          }

          const res = await authFetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...newPost,
              authorAvatar: syncedAuthorAvatar,
              imageUrl: syncedImageUrl,
              videoUrl: syncedVideoUrl,
              audioNote: syncedAudioNote,
              attachedFile: syncedAttachedFile,
              bgMusic,
            }),
          });
          if (res.status === 400) {
            pendingPostIdsRef.current.delete(newPost.id);
            setPosts((prev) => prev.filter((p) => p.id !== newPost.id));
          } else if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data?.profile) {
              applyActionServerProfile(data.profile);
            }
          } else if (res.status >= 500) {
            queueActionForSync({
              type: 'CREATE_POST',
              endpoint: '/api/posts',
              method: 'POST',
              body: {
                ...newPost,
                authorAvatar: syncedAuthorAvatar,
                imageUrl: syncedImageUrl,
                videoUrl: syncedVideoUrl,
                audioNote: syncedAudioNote,
                attachedFile: syncedAttachedFile,
                bgMusic,
              },
            });
          }
        } catch {
          queueActionForSync({
            type: 'CREATE_POST',
            endpoint: '/api/posts',
            method: 'POST',
            body: {
              ...newPost,
              bgMusic,
            },
          });
        }
      })();
    },
    [user, generateUniqueId, showToast, authFetch, applyActionServerProfile, queueActionForSync]
  );

  const setProfileMusic = useCallback(
    async (track: DeezerTrack | null): Promise<boolean> => {
      try {
        const currentSnap = userLatestRef.current;
        const prevMusic = currentSnap?.profileMusic;
        const activeAmbient = currentAmbientTrackRef.current;

        // Arrêter immédiatement la musique de profil si elle est supprimée ou remplacée
        if (!track) {
          if (
            (activeAmbient &&
              (activeAmbient.id.startsWith('profile_') ||
                (prevMusic?.previewUrl &&
                  activeAmbient.track?.previewUrl === prevMusic.previewUrl))) ||
            (ambientAudioRef.current &&
              prevMusic?.previewUrl &&
              ambientAudioRef.current.src === prevMusic.previewUrl)
          ) {
            stopAmbientTrack();
          }
        } else if (
          activeAmbient &&
          activeAmbient.id.startsWith('profile_') &&
          activeAmbient.track?.previewUrl !== track.previewUrl
        ) {
          stopAmbientTrack();
        }

        musicClearedRef.current = !track;
        setUser((prev) => {
          const next: UserProfile = { ...prev, profileMusic: track || undefined };
          userLatestRef.current = next;
          persistUserSafely(next);
          syncUserFieldsToSupabase(next, { profile_music: track || null });
          return next;
        });
        setAuthAccount((prev) =>
          prev ? { ...prev, profile: { ...prev.profile, profileMusic: track || undefined } } : prev
        );

        if (!track) {
          showToast({
            title: 'Musique de profil retirée ✓',
            message: 'La lecture a été arrêtée et retirée de ton profil.',
            type: 'info',
          });
        }

        const res = await authFetch('/api/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileMusic: track }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [authFetch, persistUserSafely, syncUserFieldsToSupabase, stopAmbientTrack, showToast]
  );

  const addCommentToPost = useCallback(
    (
      postId: string,
      content: string,
      imageUrl?: string,
      audioNote?: { duration: number; audioData?: string },
      videoNote?: { videoUrl: string; duration: number },
      attachedFile?: AttachedFileMeta
    ) => {
      if (!requireFullKeyAccess('Commenter')) return;
      if (!content.trim() && !imageUrl && !audioNote && !videoNote && !attachedFile) return;

      const newComment: PostComment = {
        id: generateUniqueId('comm'),
        postId,
        authorId: user.id,
        authorMatricule: user.matricule,
        authorAlias: user.alias,
        authorAvatar: user.avatar,
        authorNeonColor: user.neonColor,
        content: content.trim(),
        imageUrl,
        audioNote,
        videoUrl: videoNote?.videoUrl,
        videoDuration: videoNote?.duration,
        attachedFile,
        createdAt: Date.now(),
      };

      setPosts((prevPosts) =>
        prevPosts.map((post) => {
          if (post.id !== postId) return post;
          return { ...post, comments: [...(post.comments || []), newComment].slice(-MAX_COMMENTS_PER_POST) };
        })
      );

      soundEngine.playChatBlip();
      showToast({
        title: 'Commentaire publié ! 💬',
        message: 'Ton message a été gravé sous cet aveu.',
        icon: '💬',
        type: 'success',
      });

      void (async () => {
        const ownerFolderId = user.supabaseUserId || supabaseUserIdRef.current || user.id;
        const syncRef = async (ref?: string, folder = 'comments', fileName?: string) => {
          if (!ref) return ref;
          if (ref.startsWith('idb://') || ref.startsWith('blob:')) {
            const uploaded = await uploadMediaBlobForSync(ref, {
              folder,
              fileName,
              userId: ownerFolderId,
            });
            if (uploaded && uploaded !== ref && !uploaded.startsWith('idb://') && !uploaded.startsWith('blob:')) {
              void revokeMediaUrlOrRef(ref);
            }
            return uploaded || ref;
          }
          return ref;
        };
        const [syncedImageUrl, syncedVideoUrl, syncedAudioData, syncedFileUrl] = await Promise.all([
          syncRef(newComment.imageUrl, 'comments'),
          syncRef(newComment.videoUrl, 'comments'),
          syncRef(newComment.audioNote?.audioData, 'comments'),
          syncRef(newComment.attachedFile?.url, 'documents', newComment.attachedFile?.fileName),
        ]);

        const syncedAudioNote = newComment.audioNote
          ? { ...newComment.audioNote, audioData: syncedAudioData }
          : undefined;
        const syncedAttachedFile = newComment.attachedFile
          ? { ...newComment.attachedFile, url: syncedFileUrl || newComment.attachedFile.url }
          : undefined;

        await authFetch(`/api/posts/${encodeURIComponent(postId)}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newComment,
            imageUrl: syncedImageUrl,
            videoUrl: syncedVideoUrl,
            audioNote: syncedAudioNote,
            attachedFile: syncedAttachedFile,
          }),
        });
      })().catch(() => {});
    },
    [user, generateUniqueId, showToast, requireFullKeyAccess, authFetch]
  );

  // Padlocks (unlocked dès validation de la Mission du Jour / dès qu'un cadenas est disponible)
  const sealPostWithPadlock = useCallback(
    (postId: string): boolean => {
      const todayIso = new Date().toISOString().slice(0, 10);
      const missionDone =
        user.dailyMissionCompletedDate === todayIso || (user.completedMissionsCount || 0) > 0;
      if (padlocksBalanceRef.current <= 0 || (user.padlocksAvailable || 0) <= 0) {
        showToast({
          title: missionDone ? 'Plus de cadenas en poche ! 🔒' : 'Valide la Mission du Jour 🔒',
          message: missionDone
            ? 'Récupère +2 cadenas gratuits ou prends un pack en boutique.'
            : 'Valide ta Mission du Jour sur Le Mur pour recevoir +1 Cadenas 🔒 et +4 Clés 🔑 !',
          icon: '🔒',
          type: 'warning',
          action: missionDone ? { label: '+2 Cadenas gratuits', onClick: claimFreePadlock } : undefined,
        });
        return false;
      }

      padlocksBalanceRef.current = Math.max(0, padlocksBalanceRef.current - 1);
      soundEngine.playLockSound();
      setUser((prev) => ({
        ...prev,
        padlocksAvailable: Math.max(0, (prev.padlocksAvailable || 1) - 1),
      }));
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, padlocksSealCount: (post.padlocksSealCount || 0) + 1, sealedByMe: true }
            : post
        )
      );

      showToast({
        title: '🔒 Cadenas offert au créateur !',
        message: 'Le créateur de ce contenu reçoit +150 pts pour la Cantine des Créateurs.',
        icon: '🔒',
        type: 'success',
      });

      if (!isOnlineModeRef.current) {
        queueActionForSync({
          type: 'SEAL_PADLOCK',
          endpoint: `/api/posts/${encodeURIComponent(postId)}/padlock`,
          method: 'POST',
        });
      } else {
        void authFetch(`/api/posts/${encodeURIComponent(postId)}/padlock`, { method: 'POST' })
          .then(async (r) => {
            if (r.ok) {
              const d = await r.json().catch(() => null);
              if (d?.profile) applyActionServerProfile(d.profile);
            } else if (r.status >= 500) {
              queueActionForSync({
                type: 'SEAL_PADLOCK',
                endpoint: `/api/posts/${encodeURIComponent(postId)}/padlock`,
                method: 'POST',
              });
            }
          })
          .catch(() => {
            queueActionForSync({
              type: 'SEAL_PADLOCK',
              endpoint: `/api/posts/${encodeURIComponent(postId)}/padlock`,
              method: 'POST',
            });
          });
      }

      return true;
    },
    [user.padlocksAvailable, user.dailyMissionCompletedDate, user.completedMissionsCount, showToast, claimFreePadlock, authFetch, applyActionServerProfile, queueActionForSync]
  );

  const protectStreakWithPadlock = useCallback((): boolean => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const missionDone =
      user.dailyMissionCompletedDate === todayIso || (user.completedMissionsCount || 0) > 0;
    if (user.isStreakProtectedByPadlock) {
      showToast({
        title: 'Bouclier de Flamme déjà actif ! 🔥🔒',
        message: 'Ta série de jours consécutifs est déjà cadenassée et protégée pour les prochaines 24h.',
        type: 'info',
      });
      return false;
    }
    if (padlocksBalanceRef.current <= 0 || (user.padlocksAvailable || 0) <= 0) {
      showToast({
        title: missionDone ? 'Aucun cadenas disponible ! 🔒' : 'Valide la Mission du Jour 🔒',
        message: missionDone
          ? 'Récupère 2 cadenas gratuits pour verrouiller et protéger ta Flamme.'
          : 'Valide ta Mission du Jour pour débloquer +1 Cadenas 🔒 et protéger ta Flamme.',
        icon: '🔒',
        type: 'warning',
        action: missionDone ? { label: '+2 Cadenas gratuits', onClick: claimFreePadlock } : undefined,
      });
      return false;
    }

    padlocksBalanceRef.current = Math.max(0, padlocksBalanceRef.current - 1);
    soundEngine.playLockSound();
    setUser((prev) => {
      const next: UserProfile = {
        ...prev,
        padlocksAvailable: Math.max(0, (prev.padlocksAvailable || 1) - 1),
        isStreakProtectedByPadlock: true,
        points: (prev.points || 0) + 250,
      };
      userLatestRef.current = next;
      persistUserSafely(next);
      syncUserFieldsToSupabase(next, {});
      return next;
    });

    const protectPayload = {
      id: user.id,
      matricule: user.matricule,
      alias: user.alias,
      avatar: user.avatar,
      referralCode: user.referralCode,
    };

    if (!isOnlineModeRef.current) {
      queueActionForSync({
        type: 'PROTECT_STREAK',
        endpoint: '/api/account/protect-streak',
        method: 'POST',
        body: protectPayload,
      });
    } else {
      void authFetch('/api/account/protect-streak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(protectPayload),
      })
        .then(async (r) => {
          if (r.ok) {
            const d = await r.json().catch(() => null);
            if (d?.profile) applyActionServerProfile(d.profile);
          } else if (r.status >= 500) {
            queueActionForSync({
              type: 'PROTECT_STREAK',
              endpoint: '/api/account/protect-streak',
              method: 'POST',
              body: protectPayload,
            });
          }
        })
        .catch(() => {
          queueActionForSync({
            type: 'PROTECT_STREAK',
            endpoint: '/api/account/protect-streak',
            method: 'POST',
            body: protectPayload,
          });
        });
    }

    showToast({
      title: '🔥🔒 Flamme Cadenassée (+250 pts) !',
      message: `Ta série de ${user.streakDays || 1} jours consécutifs est verrouillée contre toute perte à minuit (+250 pts Prestige) !`,
      icon: '🛡️',
      type: 'success',
    });
    return true;
  }, [
    user.id,
    user.matricule,
    user.alias,
    user.avatar,
    user.referralCode,
    user.isStreakProtectedByPadlock,
    user.padlocksAvailable,
    user.dailyMissionCompletedDate,
    user.completedMissionsCount,
    user.streakDays,
    showToast,
    claimFreePadlock,
    authFetch,
    persistUserSafely,
    syncUserFieldsToSupabase,
    applyActionServerProfile,
    queueActionForSync,
  ]);

  const lockRealLifeTemptation = useCallback(
    (temptationLabel: string): boolean => {
      const todayIso = new Date().toISOString().slice(0, 10);
      const missionDone =
        user.dailyMissionCompletedDate === todayIso || (user.completedMissionsCount || 0) > 0;
      const cleanLabel = temptationLabel.trim();
      if (!cleanLabel) return false;
      if (padlocksBalanceRef.current <= 0 || (user.padlocksAvailable || 0) <= 0) {
        showToast({
          title: missionDone ? 'Aucun cadenas en réserve ! 🔒' : 'Valide la Mission du Jour 🔒',
          message: missionDone
            ? 'Récupère +2 cadenas gratuits pour verrouiller cette tentation.'
            : 'Valide ta Mission du Jour pour gagner +1 Cadenas 🔒 et verrouiller tes tentations.',
          icon: '🔒',
          type: 'warning',
          action: missionDone ? { label: '+2 Cadenas gratuits', onClick: claimFreePadlock } : undefined,
        });
        return false;
      }

      padlocksBalanceRef.current = Math.max(0, padlocksBalanceRef.current - 1);
      soundEngine.playLockSound();
      setUser((prev) => {
        const currentLocks = prev.lockedTemptations || [];
        const updatedLocks = currentLocks.includes(cleanLabel) ? currentLocks : [cleanLabel, ...currentLocks.slice(0, 5)];
        const next: UserProfile = {
          ...prev,
          padlocksAvailable: Math.max(0, (prev.padlocksAvailable || 1) - 1),
          keysAvailable: prev.keysAvailable + 2,
          points: (prev.points || 0) + 200,
          lockedTemptations: updatedLocks,
        };
        userLatestRef.current = next;
        persistUserSafely(next);
        syncUserFieldsToSupabase(next, {});
        return next;
      });

      const lockPayload = {
        label: cleanLabel,
        id: user.id,
        matricule: user.matricule,
        alias: user.alias,
        avatar: user.avatar,
        referralCode: user.referralCode,
      };

      if (!isOnlineModeRef.current) {
        queueActionForSync({
          type: 'LOCK_TEMPTATION',
          endpoint: '/api/account/lock-temptation',
          method: 'POST',
          body: lockPayload,
        });
      } else {
        void authFetch('/api/account/lock-temptation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lockPayload),
        })
          .then(async (r) => {
            if (r.ok) {
              const d = await r.json().catch(() => null);
              if (d?.profile) applyActionServerProfile(d.profile);
            } else if (r.status >= 500) {
              queueActionForSync({
                type: 'LOCK_TEMPTATION',
                endpoint: '/api/account/lock-temptation',
                method: 'POST',
                body: lockPayload,
              });
            }
          })
          .catch(() => {
            queueActionForSync({
              type: 'LOCK_TEMPTATION',
              endpoint: '/api/account/lock-temptation',
              method: 'POST',
              body: lockPayload,
            });
          });
      }

      showToast({
        title: `🔒 Tentation verrouillée : « ${cleanLabel} » !`,
        message: 'Tu gagnes +200 pts et +2 Clés 🔑 Haute Valeur pour avoir cadenassé cette distraction !',
        icon: '🗝️',
        type: 'success',
      });
      return true;
    },
    [
      user.id,
      user.matricule,
      user.alias,
      user.avatar,
      user.referralCode,
      user.padlocksAvailable,
      user.dailyMissionCompletedDate,
      user.completedMissionsCount,
      showToast,
      claimFreePadlock,
      authFetch,
      persistUserSafely,
      syncUserFieldsToSupabase,
      applyActionServerProfile,
      queueActionForSync,
    ]
  );

  const lastAutoMidnightResetRef = useRef<string>((() => {
    try {
      return window.localStorage.getItem('evasion_last_auto_midnight_date') || '';
    } catch {
      return '';
    }
  })());

  // Midnight Autonomous Update
  const triggerMidnightReset = useCallback(
    (isManual = false) => {
      if (!hasFullKeyAccess) {
        if (isManual) requireFullKeyAccess('Relève de Minuit');
        return;
      }
      const todayIso = new Date().toISOString().slice(0, 10);
      if (!isManual) {
        if (lastAutoMidnightResetRef.current === todayIso) {
          return;
        }
        lastAutoMidnightResetRef.current = todayIso;
        try {
          window.localStorage.setItem('evasion_last_auto_midnight_date', todayIso);
        } catch {
          // ignore
        }
      }
      const now = Date.now();
      setLastMidnightResetTime(now);
      setPosts((prevPosts) =>
        prevPosts.map((p) => (p.isPinned && p.pinnedUntil && p.pinnedUntil < now ? { ...p, isPinned: false } : p))
      );
      setUser((prev) => {
        const updated: UserProfile = {
          ...prev,
          keysAvailable: prev.keysAvailable + 3,
          padlocksAvailable: (prev.padlocksAvailable || 0) + 1,
          points: (prev.points || 0) + 20,
          lastMidnightResetDate: todayIso,
        };
        userLatestRef.current = updated;
        persistUserSafely(updated);
        return updated;
      });
      void authFetch('/api/account/midnight-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceManual: isManual }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.profile) {
            applyActionServerProfile(d.profile, { lastMidnightResetDate: todayIso });
          }
        })
        .catch(() => {});
      soundEngine.playLiberationFanfare();
      confetti({ particleCount: 35, spread: 65, origin: { y: 0.6 } });
      showToast({
        title: isManual ? '🕛 Relève de Minuit Exécutée !' : '🕛 Mise à jour de Minuit (00:00) effectuée !',
        message: 'Nouvelle mission 24h débloquée, et tu reçois +3 Clés 🔑 & +1 Cadenas 🔒 !',
        icon: '🌙',
        type: 'success',
      });
    },
    [hasFullKeyAccess, requireFullKeyAccess, showToast, authFetch, persistUserSafely]
  );

  useEffect(() => {
    const checkMidnight = () => {
      if (isAuthLoading) return;
      const todayIso = new Date().toISOString().slice(0, 10);
      if (
        user.lastMidnightResetDate &&
        user.lastMidnightResetDate !== todayIso &&
        lastAutoMidnightResetRef.current !== todayIso
      ) {
        triggerMidnightReset(false);
      }
    };
    checkMidnight();
    const timer = setInterval(checkMidnight, 30000);
    return () => clearInterval(timer);
  }, [user.lastMidnightResetDate, isAuthLoading, triggerMidnightReset]);

  // Cross-Device Chat ("La Cour")
  const sendChatMessage = useCallback(
    (
      content: string,
      channel: string = 'main',
      audioNote?: { duration: number; audioData: string },
      imageUrl?: string,
      videoNote?: { videoUrl: string; duration: number }
    ) => {
      if (!requireFullKeyAccess('Envoyer dans La Cour')) return;
      if (!content.trim() && !audioNote && !imageUrl && !videoNote) return;

      const newMsg: ChatMessage = {
        id: generateUniqueId('chat_usr'),
        authorId: user.id,
        authorMatricule: user.matricule,
        authorAvatar: user.avatar,
        content: content.trim(),
        audioNote,
        imageUrl,
        videoUrl: videoNote?.videoUrl,
        videoDuration: videoNote?.duration,
        timestamp: Date.now(),
        isVip: Boolean(user.isVipSubscriber || user.isVipCell),
        neonColor: user.neonColor,
        channel,
      };

      setChatMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg].slice(-MAX_CHAT_IN_MEMORY);
      });
      soundEngine.playChatBlip();

      void (async () => {
        const ownerFolderId = user.supabaseUserId || supabaseUserIdRef.current || user.id;
        const syncRef = async (ref?: string) => {
          if (!ref) return ref;
          if (ref.startsWith('idb://') || ref.startsWith('blob:')) {
            const uploaded = await uploadMediaBlobForSync(ref, {
              folder: 'chat',
              userId: ownerFolderId,
            });
            if (uploaded && uploaded !== ref && !uploaded.startsWith('idb://') && !uploaded.startsWith('blob:')) {
              void revokeMediaUrlOrRef(ref);
            }
            return uploaded || ref;
          }
          return ref;
        };
        const [syncedImageUrl, syncedVideoUrl, syncedAudioData] = await Promise.all([
          syncRef(newMsg.imageUrl),
          syncRef(newMsg.videoUrl),
          syncRef(newMsg.audioNote?.audioData),
        ]);
        const syncedAudioNote = newMsg.audioNote
          ? { ...newMsg.audioNote, audioData: syncedAudioData || newMsg.audioNote.audioData }
          : undefined;
        if (syncedImageUrl !== newMsg.imageUrl || syncedVideoUrl !== newMsg.videoUrl) {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === newMsg.id
                ? { ...m, imageUrl: syncedImageUrl, videoUrl: syncedVideoUrl, audioNote: syncedAudioNote }
                : m
            )
          );
        }
        const chatPayload = {
          ...newMsg,
          imageUrl: syncedImageUrl,
          videoUrl: syncedVideoUrl,
          audioNote: syncedAudioNote,
        };
        if (!isOnlineModeRef.current) {
          queueActionForSync({
            type: 'SEND_CHAT',
            endpoint: '/api/chat',
            method: 'POST',
            body: chatPayload,
          });
          return;
        }
        try {
          const r = await authFetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatPayload),
          });
          if (!r.ok && r.status >= 500) {
            queueActionForSync({
              type: 'SEND_CHAT',
              endpoint: '/api/chat',
              method: 'POST',
              body: chatPayload,
            });
          }
        } catch {
          queueActionForSync({
            type: 'SEND_CHAT',
            endpoint: '/api/chat',
            method: 'POST',
            body: chatPayload,
          });
        }
      })().catch(() => {});
    },
    [user, generateUniqueId, requireFullKeyAccess, authFetch, queueActionForSync]
  );

  // Only other real currently connected users (never show the current user to themselves as "connected")
  const otherOnlineUsers = useMemo<OnlineUserPresence[]>(() => {
    return onlineUsers.filter(
      (u) =>
        u.id &&
        u.id !== user.id &&
        (!user.matricule || u.matricule !== user.matricule) &&
        u.id !== 'USR_77260' &&
        u.id !== 'USR_TEST_2026' &&
        !/test_2026/i.test(u.alias || '') &&
        !/test_2026/i.test(u.matricule || '')
    );
  }, [onlineUsers, user.id, user.matricule]);

  // Available inmates for private messaging & live invites: ONLY real currently connected online users (no offline history)
  const availableInmates = useMemo<DirectChatTarget[]>(() => {
    const map = new Map<string, DirectChatTarget>();

    otherOnlineUsers.forEach((u) => {
      if (u.matricule) {
        map.set(u.matricule, {
          id: u.id,
          matricule: u.matricule,
          alias: u.alias,
          avatar: u.avatar || '⛓️',
          neonColor: u.neonColor,
        });
      }
    });

    return Array.from(map.values());
  }, [otherOnlineUsers]);

  // Real-time Friends state hydrated with live presence
  const friends = useMemo<FriendEntry[]>(() => {
    const raw = Array.isArray(user.friends) ? user.friends : [];
    const onlineById = new Map<string, OnlineUserPresence>();
    const onlineByMat = new Map<string, OnlineUserPresence>();
    onlineUsers.forEach((u) => {
      if (u.id) onlineById.set(u.id, u);
      if (u.matricule) onlineByMat.set(u.matricule.toLowerCase(), u);
    });
    return raw.map((f) => {
      const liveInfo = onlineById.get(f.id) || onlineByMat.get((f.matricule || '').toLowerCase());
      if (!liveInfo) return f;
      return {
        ...f,
        alias: liveInfo.alias || f.alias,
        avatar: liveInfo.avatar || f.avatar,
        neonColor: liveInfo.neonColor || f.neonColor,
      };
    });
  }, [user.friends, onlineUsers]);

  const incomingFriendRequests = useMemo<FriendRequestEntry[]>(
    () => (Array.isArray(user.friendRequestsIncoming) ? user.friendRequestsIncoming : []),
    [user.friendRequestsIncoming]
  );

  const outgoingFriendRequests = useMemo<FriendRequestEntry[]>(
    () => (Array.isArray(user.friendRequestsOutgoing) ? user.friendRequestsOutgoing : []),
    [user.friendRequestsOutgoing]
  );

  const applyFriendSnapshotToUser = useCallback(
    (payload: {
      friends?: FriendEntry[];
      friendRequestsIncoming?: FriendRequestEntry[];
      friendRequestsOutgoing?: FriendRequestEntry[];
      profile?: UserProfile;
    }) => {
      if (payload.profile) {
        const reconciled = reconcileProfileUniverse(payload.profile);
        setUser(reconciled);
        persistUserSafely(reconciled);
        setAuthAccount((prev) =>
          prev && prev.id === reconciled.id ? { ...prev, profile: reconciled } : prev
        );
        return;
      }
      setUser((prev) => {
        const next: UserProfile = {
          ...prev,
          ...(Array.isArray(payload.friends) ? { friends: payload.friends } : {}),
          ...(Array.isArray(payload.friendRequestsIncoming)
            ? { friendRequestsIncoming: payload.friendRequestsIncoming }
            : {}),
          ...(Array.isArray(payload.friendRequestsOutgoing)
            ? { friendRequestsOutgoing: payload.friendRequestsOutgoing }
            : {}),
        };
        persistUserSafely(next);
        return next;
      });
    },
    [persistUserSafely, reconcileProfileUniverse]
  );

  const refreshFriendsFromServer = useCallback(async () => {
    if (!authTokenRef.current) return;
    try {
      const res = await authFetch('/api/friends', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        success?: boolean;
        friends?: FriendEntry[];
        incoming?: FriendRequestEntry[];
        outgoing?: FriendRequestEntry[];
      };
      if (data?.success) {
        applyFriendSnapshotToUser({
          friends: data.friends || [],
          friendRequestsIncoming: data.incoming || [],
          friendRequestsOutgoing: data.outgoing || [],
        });
      }
    } catch {
      // ignore transient offline error
    }
  }, [authFetch, applyFriendSnapshotToUser]);

  useEffect(() => {
    refreshFriendsFromServerRef.current = refreshFriendsFromServer;
  }, [refreshFriendsFromServer]);

  useEffect(() => {
    void refreshPlatformKeyStats();
    if (authTokenState && user.id) {
      void refreshFriendsFromServer();
    }
  }, [authTokenState, user.id, refreshFriendsFromServer, refreshPlatformKeyStats]);

  const getFriendshipStatus = useCallback(
    (target: { id?: string; matricule?: string }): 'friend' | 'incoming' | 'outgoing' | 'none' => {
      const tid = (target.id || '').trim();
      const tmat = (target.matricule || '').trim().toLowerCase();
      const matches = (item: { id?: string; matricule?: string }) =>
        (tid && item.id === tid) || (tmat && (item.matricule || '').trim().toLowerCase() === tmat);
      if (friends.some(matches)) return 'friend';
      if (incomingFriendRequests.some(matches)) return 'incoming';
      if (outgoingFriendRequests.some(matches)) return 'outgoing';
      return 'none';
    },
    [friends, incomingFriendRequests, outgoingFriendRequests]
  );

  const sendFriendRequest = useCallback(
    async (target: DirectChatTarget): Promise<{ success: boolean; status?: string; error?: string }> => {
      if (!authTokenRef.current) {
        openAuthModal();
        return { success: false, error: 'Connecte-toi avec ton compte pour ajouter des amis.' };
      }
      if (!target || (target.id && target.id === user.id) || (target.matricule && target.matricule === user.matricule)) {
        return { success: false, error: 'Tu ne peux pas t’ajouter toi-même.' };
      }
      try {
        const res = await authFetch('/api/friends/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId: target.id,
            targetMatricule: target.matricule,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          status?: string;
          error?: string;
          friends?: FriendEntry[];
          incoming?: FriendRequestEntry[];
          outgoing?: FriendRequestEntry[];
          profile?: UserProfile;
        } | null;
        if (!res.ok || !data?.success) {
          const errMsg = data?.error || "Impossible d'envoyer la demande d'ami.";
          showToast({ title: 'Ajout impossible', message: errMsg, type: 'warning' });
          return { success: false, error: errMsg };
        }
        applyFriendSnapshotToUser({
          friends: data.friends,
          friendRequestsIncoming: data.incoming,
          friendRequestsOutgoing: data.outgoing,
          profile: data.profile,
        });
        if (data.status === 'accepted') {
          soundEngine.playKeyTurn();
          showToast({
            title: `🤝 ${target.alias || target.matricule} est maintenant ton ami !`,
            message: 'Tu peux discuter avec lui en privé à tout moment.',
            icon: '💬',
            type: 'success',
          });
        } else {
          soundEngine.playChatBlip();
          showToast({
            title: 'Demande d’ami envoyée ✉️',
            message: `En attente de la confirmation de ${target.alias || target.matricule}.`,
            icon: '👥',
            type: 'success',
          });
        }
        return { success: true, status: data.status };
      } catch {
        showToast({ title: 'Erreur réseau', message: 'Réessaye dans un instant.', type: 'warning' });
        return { success: false, error: 'Erreur réseau.' };
      }
    },
    [authFetch, openAuthModal, showToast, applyFriendSnapshotToUser, user.id, user.matricule]
  );

  const acceptFriendRequest = useCallback(
    async (target: { id?: string; matricule?: string }): Promise<boolean> => {
      if (!authTokenRef.current) {
        openAuthModal();
        return false;
      }
      try {
        const res = await authFetch('/api/friends/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId: target.id,
            targetMatricule: target.matricule,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          friends?: FriendEntry[];
          incoming?: FriendRequestEntry[];
          outgoing?: FriendRequestEntry[];
          profile?: UserProfile;
        } | null;
        if (!res.ok || !data?.success) return false;
        applyFriendSnapshotToUser({
          friends: data.friends,
          friendRequestsIncoming: data.incoming,
          friendRequestsOutgoing: data.outgoing,
          profile: data.profile,
        });
        soundEngine.playKeyTurn();
        showToast({
          title: 'Nouvel ami confirmé 🤝',
          message: 'Vous pouvez maintenant discuter directement en privé !',
          icon: '💬',
          type: 'success',
        });
        return true;
      } catch {
        return false;
      }
    },
    [authFetch, openAuthModal, applyFriendSnapshotToUser, showToast]
  );

  useEffect(() => {
    acceptFriendRequestRef.current = acceptFriendRequest;
  }, [acceptFriendRequest]);

  const declineFriendRequest = useCallback(
    async (target: { id?: string; matricule?: string }): Promise<boolean> => {
      if (!authTokenRef.current) return false;
      try {
        const res = await authFetch('/api/friends/decline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId: target.id,
            targetMatricule: target.matricule,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          friends?: FriendEntry[];
          incoming?: FriendRequestEntry[];
          outgoing?: FriendRequestEntry[];
          profile?: UserProfile;
        } | null;
        if (!res.ok || !data?.success) return false;
        applyFriendSnapshotToUser({
          friends: data.friends,
          friendRequestsIncoming: data.incoming,
          friendRequestsOutgoing: data.outgoing,
          profile: data.profile,
        });
        return true;
      } catch {
        return false;
      }
    },
    [authFetch, applyFriendSnapshotToUser]
  );

  const removeFriend = useCallback(
    async (target: { id?: string; matricule?: string }): Promise<boolean> => {
      if (!authTokenRef.current) return false;
      const targetId = target.id || target.matricule;
      if (!targetId) return false;
      try {
        const res = await authFetch(`/api/friends/${encodeURIComponent(targetId)}`, {
          method: 'DELETE',
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          friends?: FriendEntry[];
          incoming?: FriendRequestEntry[];
          outgoing?: FriendRequestEntry[];
          profile?: UserProfile;
        } | null;
        if (!res.ok || !data?.success) return false;
        applyFriendSnapshotToUser({
          friends: data.friends,
          friendRequestsIncoming: data.incoming,
          friendRequestsOutgoing: data.outgoing,
          profile: data.profile,
        });
        showToast({
          title: 'Ami retiré',
          message: 'Ce contact a été retiré de ta liste d’amis.',
          type: 'info',
        });
        return true;
      } catch {
        return false;
      }
    },
    [authFetch, applyFriendSnapshotToUser, showToast]
  );

  const searchInmates = useCallback(
    async (query: string): Promise<DirectChatTarget[]> => {
      const q = query.trim().replace(/^@+/, '').toLowerCase();
      if (!q) return [];
      const map = new Map<string, DirectChatTarget>();

      // 1. Prioritize confirmed friends first
      friends.forEach((f) => {
        if (
          f.matricule.toLowerCase().includes(q) ||
          (f.alias && f.alias.toLowerCase().includes(q)) ||
          (f.id && f.id.toLowerCase().includes(q))
        ) {
          map.set(f.matricule, {
            id: f.id,
            matricule: f.matricule,
            alias: f.alias,
            avatar: f.avatar || '⛓️',
            neonColor: f.neonColor,
          });
        }
      });

      // 2. Check currently active inmates
      availableInmates.forEach((inmate) => {
        if (
          inmate.matricule.toLowerCase().includes(q) ||
          (inmate.alias && inmate.alias.toLowerCase().includes(q)) ||
          (inmate.id && inmate.id.toLowerCase().includes(q))
        ) {
          if (!map.has(inmate.matricule)) {
            map.set(inmate.matricule, inmate);
          }
        }
      });

      // 3. Query real accounts in database / server
      try {
        const res = await authFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = (await res.json()) as { success?: boolean; users?: DirectChatTarget[] };
          if (data.success && Array.isArray(data.users)) {
            data.users.forEach((u) => {
              if (u.matricule !== user.matricule && !map.has(u.matricule)) {
                map.set(u.matricule, {
                  id: u.id,
                  matricule: u.matricule,
                  alias: u.alias,
                  avatar: u.avatar || '⛓️',
                  neonColor: u.neonColor,
                });
              }
            });
          }
        }
      } catch {
        // tolerate network glitch
      }

      return Array.from(map.values());
    },
    [friends, availableInmates, authFetch, user.matricule]
  );

  const openDirectChat = useCallback(
    (target: DirectChatTarget) => {
      const isFriendTarget = getFriendshipStatus(target) === 'friend';
      if (!isFriendTarget && !requireFullKeyAccess('Messages Privés (MP)')) return;
      setDirectChatTarget(target);
      soundEngine.playChatBlip();
    },
    [getFriendshipStatus, requireFullKeyAccess]
  );

  useEffect(() => {
    openDirectChatRef.current = openDirectChat;
  }, [openDirectChat]);

  const closeDirectChat = useCallback(() => {
    setDirectChatTarget(null);
  }, []);

  const sendDirectMessage = useCallback(
    (
      content: string,
      audioNote?: { duration: number; audioData: string },
      imageUrl?: string,
      videoNote?: { videoUrl: string; duration: number }
    ) => {
      if (!directChatTarget) return;
      const isFriendTarget = getFriendshipStatus(directChatTarget) === 'friend';
      if (!isFriendTarget && !requireFullKeyAccess('Envoyer un Message Privé')) return;
      if (!content.trim() && !audioNote && !imageUrl && !videoNote) return;

      const dmChannel = getDirectChannelId(user.matricule, directChatTarget.matricule);
      const newMsg: ChatMessage = {
        id: generateUniqueId('chat_dm'),
        authorId: user.id,
        authorMatricule: user.matricule,
        authorAvatar: user.avatar,
        content: content.trim(),
        audioNote,
        imageUrl,
        videoUrl: videoNote?.videoUrl,
        videoDuration: videoNote?.duration,
        timestamp: Date.now(),
        isVip: Boolean(user.isVipSubscriber || user.isVipCell),
        neonColor: user.neonColor,
        channel: dmChannel,
        recipientId: directChatTarget.id,
        recipientMatricule: directChatTarget.matricule,
      };

      setChatMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg].slice(-MAX_CHAT_IN_MEMORY);
      });
      soundEngine.playChatBlip();

      void (async () => {
        const ownerFolderId = user.supabaseUserId || supabaseUserIdRef.current || user.id;
        const syncRef = async (ref?: string) => {
          if (!ref) return ref;
          if (ref.startsWith('idb://') || ref.startsWith('blob:')) {
            const uploaded = await uploadMediaBlobForSync(ref, {
              folder: 'dm',
              userId: ownerFolderId,
            });
            if (uploaded && uploaded !== ref && !uploaded.startsWith('idb://') && !uploaded.startsWith('blob:')) {
              void revokeMediaUrlOrRef(ref);
            }
            return uploaded || ref;
          }
          return ref;
        };
        const [syncedImageUrl, syncedVideoUrl, syncedAudioData] = await Promise.all([
          syncRef(newMsg.imageUrl),
          syncRef(newMsg.videoUrl),
          syncRef(newMsg.audioNote?.audioData),
        ]);
        const syncedAudioNote = newMsg.audioNote
          ? { ...newMsg.audioNote, audioData: syncedAudioData || newMsg.audioNote.audioData }
          : undefined;
        if (syncedImageUrl !== newMsg.imageUrl || syncedVideoUrl !== newMsg.videoUrl) {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === newMsg.id
                ? { ...m, imageUrl: syncedImageUrl, videoUrl: syncedVideoUrl, audioNote: syncedAudioNote }
                : m
            )
          );
        }
        const dmPayload = {
          ...newMsg,
          imageUrl: syncedImageUrl,
          videoUrl: syncedVideoUrl,
          audioNote: syncedAudioNote,
        };
        if (!isOnlineModeRef.current) {
          queueActionForSync({
            type: 'SEND_CHAT',
            endpoint: '/api/chat',
            method: 'POST',
            body: dmPayload,
          });
          return;
        }
        try {
          const r = await authFetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dmPayload),
          });
          if (!r.ok && r.status >= 500) {
            queueActionForSync({
              type: 'SEND_CHAT',
              endpoint: '/api/chat',
              method: 'POST',
              body: dmPayload,
            });
          }
        } catch {
          queueActionForSync({
            type: 'SEND_CHAT',
            endpoint: '/api/chat',
            method: 'POST',
            body: dmPayload,
          });
        }
      })().catch(() => {});
    },
    [user, directChatTarget, generateUniqueId, authFetch, getFriendshipStatus, requireFullKeyAccess, queueActionForSync]
  );

  // Cross-Device Salons
  const createCustomSalon = useCallback(
    (nameOrTag: string, description?: string): CustomSalon | null => {
      if (!requireFullKeyAccess('Créer un Salon')) return null;
      const cleanName = nameOrTag.trim().replace(/^#+/, '').trim();
      if (!cleanName) return null;

      const formattedTag = `#${cleanName
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('')}`;

      const existing = customSalons.find(
        (s) => s.tag.toLowerCase() === formattedTag.toLowerCase() || s.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (existing) {
        showToast({
          title: `Salon ${existing.tag} déjà actif`,
          message: "Ce salon / sujet existe déjà, nous t'y connectons directement.",
          icon: '🔑',
          type: 'info',
        });
        return existing;
      }

      const newSalon: CustomSalon = {
        id: `salon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tag: formattedTag,
        name: cleanName,
        description: description?.trim() || `Salon communautaire autour de ${formattedTag}`,
        createdBy: user.alias || user.matricule,
        createdAt: Date.now(),
      };

      setCustomSalons((prev) => [newSalon, ...prev].slice(0, MAX_SALONS_IN_MEMORY));
      soundEngine.playLockSound();
      showToast({
        title: `Nouveau Salon & Sujet créé : ${newSalon.tag} 🔑`,
        message: 'Ton salon est maintenant disponible sur Le Mur (#Sujet) et dans La Cour !',
        icon: '✨',
        type: 'success',
      });

      void authFetch('/api/salons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newSalon.id, nameOrTag: cleanName, description }),
      }).catch(() => {});

      return newSalon;
    },
    [customSalons, user.alias, user.matricule, showToast, requireFullKeyAccess, authFetch]
  );

  // Cross-Device Live Streaming Controls (50 keys minimum)
  const startLiveSession = useCallback(
    (title: string, topicTag: string, filter: 'none' | 'neon' | 'mono' | 'warm' = 'none'): LiveSession | null => {
      if (!isMasterPassUser(user) && (user.keysAvailable || 0) < LIVE_MIN_KEYS_REQUIRED) {
        const missing = LIVE_MIN_KEYS_REQUIRED - (user.keysAvailable || 0);
        showToast({
          title: `${LIVE_MIN_KEYS_REQUIRED} Clés 🔑 requises pour lancer un Live`,
          message: `Il te manque encore ${missing} clé${missing > 1 ? 's' : ''} pour lancer un Live.`,
          icon: '🔒',
          type: 'warning',
          action: { label: 'Obtenir des clés', onClick: () => openShop() },
        });
        return null;
      }
      const cleanTitle = title.trim() || 'Live Évasion en direct 🔴';
      const cleanTag = topicTag.trim().startsWith('#') ? topicTag.trim() : `#${topicTag.trim() || 'Détox'}`;

      const newLive: LiveSession = {
        id: `live_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        hostId: user.id,
        hostName: user.alias || user.matricule,
        hostMatricule: user.matricule,
        hostAvatar: user.avatar,
        hostNeonColor: user.neonColor,
        hostFrame: user.cellBorderFrame,
        title: cleanTitle,
        topicTag: cleanTag,
        startedAt: Date.now(),
        viewersCount: 0,
        likesCount: 0,
        keysReceived: 0,
        padlocksReceived: 0,
        iceConesReceived: 0,
        waterBottlesReceived: 0,
        cansReceived: 0,
        isActive: true,
        filter,
        comments: [
          {
            id: `lc_init_${Date.now()}`,
            authorId: 'system',
            authorName: 'ÉVASION LIVE',
            authorAvatar: '🔴',
            content: `Le Live « ${cleanTitle} » vient de démarrer dans ${cleanTag} !`,
            type: 'system',
            timestamp: Date.now(),
          },
        ],
      };

      pendingCreatedLiveIdsRef.current.add(newLive.id);
      endedLiveIdsRef.current.delete(newLive.id);
      setRequestedLiveId(newLive.id);
      setActiveLives((prev) => [newLive, ...prev].slice(0, MAX_LIVES_IN_MEMORY));
      soundEngine.playLiberationFanfare();

      const persistLiveToServer = async (attempt = 0): Promise<void> => {
        try {
          const res = await authFetch('/api/lives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: newLive.id,
              hostId: user.id,
              hostMatricule: user.matricule,
              hostAlias: user.alias || user.matricule,
              hostAvatar: user.avatar,
              title: cleanTitle,
              topicTag: cleanTag,
              filter,
            }),
          });
          if (endedLiveIdsRef.current.has(newLive.id)) {
            pendingCreatedLiveIdsRef.current.delete(newLive.id);
            await authFetch(`/api/lives/${encodeURIComponent(newLive.id)}/end`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hostId: userIdRef.current, matricule: userMatriculeRef.current }),
            }).catch(() => {});
            return;
          }
          if (res.ok) {
            pendingCreatedLiveIdsRef.current.delete(newLive.id);
            const data = (await res.json().catch(() => null)) as {
              live?: LiveSession;
              token?: string;
            } | null;
            if (data?.token && data.token !== authTokenRef.current) {
              authTokenRef.current = data.token;
              writeStoredAuthToken(data.token);
              setAuthTokenState(data.token);
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                try {
                  wsRef.current.send(JSON.stringify({ type: 'AUTH', token: data.token }));
                } catch {
                  // ignore
                }
              }
            }
            if (data?.live) {
              setActiveLives((prev) =>
                prev.map((l) =>
                  l.id === newLive.id
                    ? {
                        ...l,
                        ...data.live!,
                        hostId: user.id,
                        hostMatricule: user.matricule,
                      }
                    : l
                )
              );
            }
            if (
              activeRtcRoomRef.current?.liveId === newLive.id &&
              wsRef.current &&
              wsRef.current.readyState === WebSocket.OPEN
            ) {
              try {
                wsRef.current.send(
                  JSON.stringify({
                    type: 'LIVE_ROOM_JOIN',
                    liveId: newLive.id,
                    role: 'host',
                    userId: userIdRef.current,
                  })
                );
              } catch {
                // ignore
              }
            }
            return;
          }
          if (attempt < 2 && res.status >= 500) {
            await new Promise((r) => setTimeout(r, 1500));
            return persistLiveToServer(attempt + 1);
          }
          pendingCreatedLiveIdsRef.current.delete(newLive.id);
        } catch {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1500));
            return persistLiveToServer(attempt + 1);
          }
          pendingCreatedLiveIdsRef.current.delete(newLive.id);
        }
      };

      void persistLiveToServer(0);

      showToast({
        title: 'Tu es EN DIRECT 🔴 !',
        message: `Ton Live « ${cleanTitle} » est ouvert à la communauté.`,
        icon: '📡',
        type: 'success',
      });
      return newLive;
    },
    [user, showToast, requireFullKeyAccess, openShop, authFetch]
  );

  const endLiveSession = useCallback(
    (liveId: string) => {
      pendingCreatedLiveIdsRef.current.delete(liveId);
      endedLiveIdsRef.current.add(liveId);
      if (activeRtcRoomRef.current?.liveId === liveId) {
        activeRtcRoomRef.current = null;
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'LIVE_ROOM_LEAVE', liveId, userId: userIdRef.current }));
          } catch {
            // ignore
          }
        }
      }
      setRequestedLiveId((prev) => (prev === liveId ? null : prev));
      setIncomingLiveInvite((prev) => (prev?.liveId === liveId ? null : prev));
      setActiveLives((prev) => prev.filter((l) => l.id !== liveId));
      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: userIdRef.current, matricule: userMatriculeRef.current }),
        keepalive: true,
      }).catch(() => {});
      showToast({
        title: 'Live terminé',
        message: 'Merci pour ce moment de partage en direct !',
        icon: '🎬',
        type: 'info',
      });
    },
    [showToast, authFetch]
  );

  const joinLiveSession = useCallback(
    (liveId: string) => {
      setActiveLives((prev) =>
        prev.map((live) =>
          live.id === liveId && live.hostId !== user.id
            ? { ...live, viewersCount: (live.viewersCount || 0) + 1 }
            : live
        )
      );
      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/join`, { method: 'POST' })
        .then(async (res) => {
          const data = (await res.json().catch(() => null)) as {
            success?: boolean;
            blocked?: boolean;
            live?: LiveSession;
          } | null;
          if (res.status === 403 && data?.blocked) {
            setActiveLives((prev) =>
              prev.map((l) =>
                l.id === liveId
                  ? {
                      ...l,
                      blockedUserIds: Array.from(
                        new Set([...(l.blockedUserIds || []), user.id, user.matricule].filter(Boolean))
                      ),
                    }
                  : l
              )
            );
            rtcEventListenersRef.current.forEach((listener) => {
              try {
                listener({
                  type: 'LIVE_USER_BLOCKED',
                  payload: { liveId, targetUserId: user.id, targetMatricule: user.matricule },
                });
              } catch {
                // ignore
              }
            });
          } else if (res.ok && data?.live) {
            setActiveLives((prev) => prev.map((l) => (l.id === liveId ? data.live! : l)));
          }
        })
        .catch(() => {});
    },
    [user.id, user.matricule, authFetch]
  );

  const leaveLiveSession = useCallback(
    (liveId: string) => {
      setActiveLives((prev) =>
        prev.map((live) =>
          live.id === liveId && live.hostId !== user.id
            ? { ...live, viewersCount: Math.max(0, (live.viewersCount || 0) - 1) }
            : live
        )
      );
      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userIdRef.current, matricule: userMatriculeRef.current }),
        keepalive: true,
      }).catch(() => {});
    },
    [user.id, authFetch]
  );

  const updateLiveFilter = useCallback(
    (liveId: string, filter: 'none' | 'neon' | 'mono' | 'warm') => {
      setActiveLives((prev) => prev.map((live) => (live.id === liveId ? { ...live, filter } : live)));
      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter, hostId: userIdRef.current, matricule: userMatriculeRef.current }),
      }).catch(() => {});
    },
    [authFetch]
  );

  const sendLiveComment = useCallback(
    (liveId: string, content: string) => {
      const text = content.trim();
      if (!text) return;
      const newComment: LiveComment = {
        id: generateUniqueId('lc'),
        authorId: user.id,
        authorName: user.alias || user.matricule,
        authorAvatar: user.avatar,
        content: text,
        type: 'chat',
        timestamp: Date.now(),
      };
      setActiveLives((prev) =>
        prev.map((live) =>
          live.id === liveId ? { ...live, comments: [...live.comments.slice(-60), newComment] } : live
        )
      );
      soundEngine.playChatBlip();
      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      }).catch(() => {});
    },
    [user, generateUniqueId, authFetch]
  );

  const sendLiveReaction = useCallback(
    (liveId: string, emoji: string) => {
      const cleanEmoji = emoji.trim() || '❤️';
      if (cleanEmoji === '❤️') {
        setActiveLives((prev) =>
          prev.map((live) => (live.id === liveId ? { ...live, likesCount: live.likesCount + 1 } : live))
        );
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'LIVE_REACTION',
              liveId,
              emoji: cleanEmoji,
              userId: userIdRef.current,
            })
          );
        } catch {
          // ignore
        }
      }
      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji: cleanEmoji }),
      }).catch(() => {});
    },
    [authFetch]
  );

  const sendLiveLike = useCallback(
    (liveId: string) => {
      sendLiveReaction(liveId, '❤️');
    },
    [sendLiveReaction]
  );

  // Detect if a user (by id or matricule) is currently Live (either host or co-host guest)
  const getUserLiveSession = useCallback(
    (userId?: string, matricule?: string): LiveSession | undefined => {
      if (!userId && !matricule) return undefined;
      return activeLives.find((l) => {
        if (!l.isActive) return false;
        if (userId && (l.hostId === userId || l.guests?.some((g) => g.userId === userId))) {
          return true;
        }
        if (
          matricule &&
          (l.hostMatricule === matricule || l.guests?.some((g) => g.matricule === matricule))
        ) {
          return true;
        }
        return false;
      });
    },
    [activeLives]
  );

  const requestOpenLive = useCallback((liveId: string, asCoHost = false) => {
    setRequestedLiveId(liveId);
    if (asCoHost) {
      setAutoJoinCoHostLiveId(liveId);
    }
  }, []);

  const clearRequestedLive = useCallback(() => {
    setRequestedLiveId(null);
    setAutoJoinCoHostLiveId(null);
  }, []);

  const dismissIncomingLiveInvite = useCallback(() => {
    setIncomingLiveInvite(null);
  }, []);

  const sendLiveInvite = useCallback(
    async (
      liveId: string,
      target: { targetUserId?: string; targetMatricule?: string },
      mode: 'viewer' | 'cohost'
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await authFetch(`/api/lives/${encodeURIComponent(liveId)}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...target, mode }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string; live?: LiveSession };
        if (res.ok && data.success) {
          if (data.live) {
            setActiveLives((prev) => prev.map((l) => (l.id === liveId ? data.live! : l)));
          }
          showToast({
            title:
              target.targetUserId === 'ALL'
                ? 'Invitation envoyée à tous les connectés 📣'
                : mode === 'cohost'
                ? 'Invitation Live en Live envoyée 🎥'
                : 'Invitation Live envoyée 🔴',
            message:
              mode === 'cohost'
                ? "Le codétenu a reçu la demande pour monter sur l'écran avec toi."
                : 'Notification envoyée instantanément !',
            type: 'success',
          });
          return { success: true };
        }
        showToast({
          title: 'Invitation impossible',
          message: data.error || 'Réessaie dans un instant.',
          type: 'warning',
        });
        return { success: false, error: data.error };
      } catch {
        return { success: false, error: 'Erreur réseau.' };
      }
    },
    [authFetch, showToast]
  );

  const respondToLiveInvite = useCallback(
    async (
      liveId: string,
      accept: boolean,
      media?: { camEnabled?: boolean; micEnabled?: boolean }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await authFetch(`/api/lives/${encodeURIComponent(liveId)}/cohost/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accept, ...media }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string; live?: LiveSession };
        if (res.ok && data.success && data.live) {
          setActiveLives((prev) => {
            const exists = prev.some((l) => l.id === liveId);
            return exists ? prev.map((l) => (l.id === liveId ? data.live! : l)) : [data.live!, ...prev];
          });
          if (accept) {
            setRequestedLiveId(liveId);
            setAutoJoinCoHostLiveId(liveId);
          }
          setIncomingLiveInvite((prev) => (prev?.liveId === liveId ? null : prev));
          return { success: true };
        }
        showToast({
          title: 'Impossible de monter sur écran',
          message: data.error || 'Place indisponible.',
          type: 'warning',
        });
        return { success: false, error: data.error };
      } catch {
        return { success: false, error: 'Erreur réseau.' };
      }
    },
    [authFetch, showToast]
  );

  const requestJoinLiveStage = useCallback(
    async (liveId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await authFetch(`/api/lives/${encodeURIComponent(liveId)}/cohost/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = (await res.json()) as { success?: boolean; error?: string; live?: LiveSession };
        if (res.ok && data.success && data.live) {
          setActiveLives((prev) => prev.map((l) => (l.id === liveId ? data.live! : l)));
          showToast({
            title: 'Demande envoyée à l’hôte 🙋',
            message: 'Dès qu’il accepte, tu apparaîtras en direct sur son écran !',
            type: 'success',
          });
          return { success: true };
        }
        showToast({
          title: 'Demande impossible',
          message: data.error || 'Écran complet.',
          type: 'warning',
        });
        return { success: false, error: data.error };
      } catch {
        return { success: false, error: 'Erreur réseau.' };
      }
    },
    [authFetch, showToast]
  );

  const approveGuestStageRequest = useCallback(
    async (
      liveId: string,
      targetUserId: string,
      accept: boolean
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await authFetch(`/api/lives/${encodeURIComponent(liveId)}/cohost/approve-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId,
            accept,
            hostId: userIdRef.current,
            matricule: userMatriculeRef.current,
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string; live?: LiveSession };
        if (res.ok && data.success && data.live) {
          setActiveLives((prev) => prev.map((l) => (l.id === liveId ? data.live! : l)));
          return { success: true };
        }
        if (data.error) {
          showToast({ title: 'Action impossible', message: data.error, type: 'warning' });
        }
        return { success: false, error: data.error };
      } catch {
        return { success: false, error: 'Erreur réseau.' };
      }
    },
    [authFetch, showToast]
  );

  const removeOrLeaveLiveStage = useCallback(
    async (liveId: string, targetUserId?: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await authFetch(`/api/lives/${encodeURIComponent(liveId)}/cohost/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId,
            userId: userIdRef.current,
            hostId: userIdRef.current,
            matricule: userMatriculeRef.current,
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string; live?: LiveSession };
        if (res.ok && data.success && data.live) {
          setActiveLives((prev) => prev.map((l) => (l.id === liveId ? data.live! : l)));
          return { success: true };
        }
        return { success: false, error: data.error };
      } catch {
        return { success: false, error: 'Erreur réseau.' };
      }
    },
    [authFetch]
  );

  const updateLiveGuestMedia = useCallback(
    async (liveId: string, media: { camEnabled?: boolean; micEnabled?: boolean; targetUserId?: string }) => {
      try {
        const res = await authFetch(`/api/lives/${encodeURIComponent(liveId)}/cohost/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...media,
            userId: userIdRef.current,
            matricule: userMatriculeRef.current,
          }),
        });
        const data = (await res.json()) as { success?: boolean; live?: LiveSession };
        if (res.ok && data.success && data.live) {
          setActiveLives((prev) => prev.map((l) => (l.id === liveId ? data.live! : l)));
        }
      } catch {
        // ignore
      }
    },
    [authFetch]
  );

  const updateLiveAnnouncement = useCallback(
    async (liveId: string, pinnedAnnouncement: string) => {
      setActiveLives((prev) =>
        prev.map((l) => (l.id === liveId ? { ...l, pinnedAnnouncement: pinnedAnnouncement.trim() || undefined } : l))
      );
      try {
        await authFetch(`/api/lives/${encodeURIComponent(liveId)}/announcement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pinnedAnnouncement,
            hostId: userIdRef.current,
            matricule: userMatriculeRef.current,
          }),
        });
      } catch {
        // ignore
      }
    },
    [authFetch]
  );

  const blockLiveViewer = useCallback(
    async (
      liveId: string,
      target: { targetUserId?: string; targetMatricule?: string; targetAlias?: string }
    ): Promise<boolean> => {
      const uid = target.targetUserId?.trim();
      const mat = target.targetMatricule?.trim();
      if (!uid && !mat) return false;
      if (uid === user.id || (mat && mat === user.matricule)) return false;

      setActiveLives((prev) =>
        prev.map((l) => {
          if (l.id !== liveId) return l;
          const nextBlocked = Array.from(
            new Set([...(l.blockedUserIds || []), ...(uid ? [uid] : []), ...(mat ? [mat] : [])])
          );
          const nextViewers = (l.activeViewers || []).filter(
            (v) => v.userId !== uid && v.matricule !== mat
          );
          const removedViewer = (l.activeViewers || []).length > nextViewers.length;
          return {
            ...l,
            blockedUserIds: nextBlocked,
            activeViewers: nextViewers,
            guests: (l.guests || []).filter((g) => g.userId !== uid && g.matricule !== mat),
            guestRequests: (l.guestRequests || []).filter(
              (r) => r.userId !== uid && r.matricule !== mat
            ),
            pendingInvites: (l.pendingInvites || []).filter((p) => p.targetUserId !== uid),
            viewersCount: Math.max(
              nextViewers.length,
              Math.max(0, (l.viewersCount || 0) - (removedViewer ? 1 : 0))
            ),
          };
        })
      );

      try {
        const res = await authFetch(`/api/lives/${encodeURIComponent(liveId)}/block`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId: uid,
            targetMatricule: mat,
            hostId: userIdRef.current,
            matricule: userMatriculeRef.current,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          live?: LiveSession;
          error?: string;
        } | null;
        if (res.ok && data?.success) {
          if (data.live) {
            setActiveLives((prev) => prev.map((l) => (l.id === liveId ? data.live! : l)));
          }
          showToast({
            title: `${target.targetAlias || mat || 'Spectateur'} bloqué`,
            message: 'Son accès au Live a été coupé : son écran affiche Live terminé.',
            type: 'info',
          });
          return true;
        }
        if (data?.error) {
          showToast({ title: 'Blocage impossible', message: data.error, type: 'warning' });
        }
        return false;
      } catch {
        return false;
      }
    },
    [authFetch, showToast, user.id, user.matricule]
  );

  const joinLiveRtcRoom = useCallback(
    (liveId: string, role: 'host' | 'guest' | 'viewer') => {
      activeRtcRoomRef.current = { liveId, role };
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'LIVE_ROOM_JOIN', liveId, role, userId: user.id }));
        } catch {
          // ignore
        }
      }
    },
    [user.id]
  );

  const leaveLiveRtcRoom = useCallback(
    (liveId?: string) => {
      if (!liveId || activeRtcRoomRef.current?.liveId === liveId) {
        activeRtcRoomRef.current = null;
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'LIVE_ROOM_LEAVE', liveId, userId: user.id }));
        } catch {
          // ignore
        }
      }
    },
    [user.id]
  );

  const sendLiveRtcSignal = useCallback(
    (liveId: string, targetUserId: string, signalType: string, data: unknown) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'LIVE_RTC_SIGNAL',
              liveId,
              targetUserId,
              signalType,
              data,
              fromUserId: user.id,
            })
          );
        } catch {
          // ignore
        }
      }
    },
    [user.id]
  );

  const sendLiveRelaySubscribe = useCallback(
    (liveId: string, targetUserId: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'LIVE_RELAY_SUBSCRIBE',
              liveId,
              targetUserId,
              userId: userIdRef.current,
            })
          );
        } catch {
          // ignore
        }
      }
    },
    []
  );

  const sendLiveRelayUnsubscribe = useCallback((liveId: string, targetUserId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'LIVE_RELAY_UNSUBSCRIBE',
            liveId,
            targetUserId,
            userId: userIdRef.current,
          })
        );
      } catch {
        // ignore
      }
    }
  }, []);

  const sendLiveRelayMedia = useCallback(
    (
      liveId: string,
      payload: {
        mediaKind: 'video' | 'audio';
        data: string;
        w?: number;
        h?: number;
        sampleRate?: number;
      }
    ): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      if (payload.mediaKind === 'video' && ws.bufferedAmount > 350_000) {
        return false;
      }
      try {
        ws.send(
          JSON.stringify({
            type: 'LIVE_RELAY_MEDIA',
            liveId,
            userId: userIdRef.current,
            ts: Date.now(),
            ...payload,
          })
        );
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const onLiveRtcEvent = useCallback(
    (listener: (event: { type: string; payload: any }) => void) => {
      rtcEventListenersRef.current.add(listener);
      return () => {
        rtcEventListenersRef.current.delete(listener);
      };
    },
    []
  );

  const sendLiveKeyGift = useCallback(
    (liveId: string): boolean => {
      const targetLive = activeLives.find((l) => l.id === liveId);
      if (!targetLive || targetLive.hostId === user.id) return false;
      if (keysBalanceRef.current <= 0 || user.keysAvailable <= 0) {
        showToast({
          title: 'Plus de clé disponible ! 🔑',
          message: 'Valide la Mission du Jour (+4 🔑) ou publie un aveu (+2 🔑) pour soutenir ce Live.',
          type: 'warning',
        });
        return false;
      }

      keysBalanceRef.current = Math.max(0, keysBalanceRef.current - 1);
      const prevRank = getUserRank(user.keysGivenTotal).rank;
      const nextKeysGivenTotal = (user.keysGivenTotal || 0) + 1;
      const nextRankInfo = getUserRank(nextKeysGivenTotal);
      const earnedMilestonePassePartout = nextKeysGivenTotal % 10 === 0;

      setUser((prev) => {
        if (prev.keysAvailable <= 0) return prev;
        const newKeysGivenTotal = (prev.keysGivenTotal || 0) + 1;
        const newBadges = [...prev.badges];
        if (newKeysGivenTotal >= 10 && !newBadges.some((b) => b.id === 'badge_clef_or')) {
          const badgeTemplate = ALL_BADGES.find((b) => b.id === 'badge_clef_or');
          if (badgeTemplate) newBadges.push({ ...badgeTemplate, unlockedAt: Date.now() });
        }
        return {
          ...prev,
          keysAvailable: Math.max(0, prev.keysAvailable - 1),
          keysGivenTotal: newKeysGivenTotal,
          hasPassePartoutCount: (prev.hasPassePartoutCount || 0) + (newKeysGivenTotal % 10 === 0 ? 1 : 0),
          badges: newBadges,
        };
      });
      soundEngine.playKeyTurn();

      if (earnedMilestonePassePartout) {
        triggerConfettiLiberation();
        showToast({
          title: '🏆 Palier Haute Valeur : +1 Passe-Partout offert !',
          message: `${nextKeysGivenTotal} clés offertes ! +1 Passe-Partout ajouté à ton inventaire.`,
          icon: '🗝️',
          type: 'success',
        });
      }
      if (nextRankInfo.rank !== prevRank) {
        triggerConfettiLiberation();
        setTimeout(() => {
          showToast({
            title: `Nouveau Grade : ${nextRankInfo.rank} ${nextRankInfo.icon} !`,
            message: `Avec ${nextKeysGivenTotal} clés offertes, tu passes au grade « ${nextRankInfo.title} » !`,
            icon: nextRankInfo.icon,
            type: 'success',
          });
        }, 900);
      }

      const giftComment: LiveComment = {
        id: generateUniqueId('lc_key'),
        authorId: user.id,
        authorName: user.alias || user.matricule,
        authorAvatar: user.avatar,
        content: 'a offert 1 Clé Haute Valeur 🔑 au créateur (+100 pts Cantine) !',
        type: 'key_gift',
        timestamp: Date.now(),
      };
      setActiveLives((prev) =>
        prev.map((live) =>
          live.id === liveId && live.hostId !== user.id
            ? { ...live, keysReceived: live.keysReceived + 1, comments: [...live.comments.slice(-60), giftComment] }
            : live
        )
      );

      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/key`, { method: 'POST' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.profile) applyActionServerProfile(d.profile);
        })
        .catch(() => {});
      return true;
    },
    [activeLives, user, generateUniqueId, showToast, triggerConfettiLiberation, authFetch]
  );

  const sendLivePadlock = useCallback(
    (liveId: string): boolean => {
      const targetLive = activeLives.find((l) => l.id === liveId);
      if (!targetLive || targetLive.hostId === user.id) return false;
      if (padlocksBalanceRef.current <= 0 || (user.padlocksAvailable || 0) <= 0) {
        showToast({
          title: 'Plus de cadenas en réserve ! 🔒',
          message: 'Valide la Mission du Jour sur Le Mur pour gagner +1 Cadenas 🔒.',
          type: 'warning',
        });
        return false;
      }

      padlocksBalanceRef.current = Math.max(0, padlocksBalanceRef.current - 1);
      setUser((prev) => ({
        ...prev,
        padlocksAvailable: Math.max(0, (prev.padlocksAvailable || 1) - 1),
      }));
      soundEngine.playLockSound();

      const lockComment: LiveComment = {
        id: generateUniqueId('lc_lock'),
        authorId: user.id,
        authorName: user.alias || user.matricule,
        authorAvatar: user.avatar,
        content: 'a offert 1 Cadenas 🔒 au créateur (+150 pts Cantine) !',
        type: 'padlock',
        timestamp: Date.now(),
      };
      setActiveLives((prev) =>
        prev.map((live) =>
          live.id === liveId && live.hostId !== user.id
            ? {
                ...live,
                padlocksReceived: live.padlocksReceived + 1,
                comments: [...live.comments.slice(-60), lockComment],
              }
            : live
        )
      );

      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/padlock`, { method: 'POST' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.profile) applyActionServerProfile(d.profile);
        })
        .catch(() => {});
      return true;
    },
    [activeLives, user, generateUniqueId, showToast, authFetch]
  );

  const sendLiveSpecialGift = useCallback(
    (liveId: string, giftType: 'ice_cone' | 'water_bottle' | 'canned_food'): boolean => {
      const targetLive = activeLives.find((l) => l.id === liveId);
      if (!targetLive || targetLive.hostId === user.id) return false;

      const giftMeta: Record<
        'ice_cone' | 'water_bottle' | 'canned_food',
        { label: string; pts: number; idPrefix: string }
      > = {
        ice_cone: {
          label: 'a offert une Glace Cornet 🍦 au créateur (+50 pts Cantine) !',
          pts: 50,
          idPrefix: 'lc_cone',
        },
        water_bottle: {
          label: 'a offert une Bouteille d’eau 💧 au créateur (+75 pts Cantine) !',
          pts: 75,
          idPrefix: 'lc_water',
        },
        canned_food: {
          label: 'a offert une Boîte de Conserve 🥫 au créateur (+80 pts Cantine) !',
          pts: 80,
          idPrefix: 'lc_can',
        },
      };

      const meta = giftMeta[giftType];
      soundEngine.playKeyTurn();

      const giftComment: LiveComment = {
        id: generateUniqueId(meta.idPrefix),
        authorId: user.id,
        authorName: user.alias || user.matricule,
        authorAvatar: user.avatar,
        content: meta.label,
        type: giftType,
        timestamp: Date.now(),
      };

      setActiveLives((prev) =>
        prev.map((live) =>
          live.id === liveId && live.hostId !== user.id
            ? {
                ...live,
                iceConesReceived: (live.iceConesReceived || 0) + (giftType === 'ice_cone' ? 1 : 0),
                waterBottlesReceived:
                  (live.waterBottlesReceived || 0) + (giftType === 'water_bottle' ? 1 : 0),
                cansReceived: (live.cansReceived || 0) + (giftType === 'canned_food' ? 1 : 0),
                comments: [...live.comments.slice(-60), giftComment],
              }
            : live
        )
      );

      void authFetch(`/api/lives/${encodeURIComponent(liveId)}/gift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftType }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.profile) applyActionServerProfile(d.profile);
        })
        .catch(() => {});

      return true;
    },
    [activeLives, user, generateUniqueId, authFetch]
  );

  const redeemPoints = useCallback(
    async (
      rewardId: 'key_1' | 'padlock_1' | 'keys_3' | 'passe_partout' | 'memory_5' | 'vip_cell',
      validationCode?: string
    ): Promise<{ success: boolean; error?: string }> => {
      const REWARDS: Record<
        'key_1' | 'padlock_1' | 'keys_3' | 'passe_partout' | 'memory_5' | 'vip_cell',
        { cost: number; label: string; apply: (p: UserProfile) => UserProfile }
      > = {
        key_1: {
          cost: 300,
          label: '+1 Clé Haute Valeur 🔑',
          apply: (p) => ({ ...p, keysAvailable: (p.keysAvailable || 0) + 1 }),
        },
        padlock_1: {
          cost: 450,
          label: '+1 Cadenas Scellé 🔒',
          apply: (p) => ({ ...p, padlocksAvailable: (p.padlocksAvailable || 0) + 1 }),
        },
        keys_3: {
          cost: 800,
          label: '+3 Clés 🔑 + 1 Cadenas 🔒',
          apply: (p) => ({
            ...p,
            keysAvailable: (p.keysAvailable || 0) + 3,
            padlocksAvailable: (p.padlocksAvailable || 0) + 1,
          }),
        },
        passe_partout: {
          cost: 1000,
          label: '+1 Passe-Partout ⚡',
          apply: (p) => ({
            ...p,
            hasPassePartoutCount: (p.hasPassePartoutCount || 0) + 1,
          }),
        },
        memory_5: {
          cost: 1200,
          label: '+5 Emplacements Mémoire Univers 📦',
          apply: (p) => ({
            ...p,
            universeStorageQuota: Math.max(20, p.universeStorageQuota || 20) + 5,
          }),
        },
        vip_cell: {
          cost: 2500,
          label: 'Statut Cellule VIP 👑 + Style Néon',
          apply: (p) => ({
            ...p,
            isVipCell: true,
            isVipSubscriber: true,
            neonColor: p.neonColor || 'gold',
            cellBorderFrame:
              !p.cellBorderFrame || p.cellBorderFrame === 'none' ? 'gold' : p.cellBorderFrame,
          }),
        },
      };

      const reward = REWARDS[rewardId];
      if (!reward) return { success: false, error: 'Récompense invalide.' };
      const isMaster = isMasterPassUser(user);
      const cleanCode = (validationCode || '').trim();

      if (!isMaster && !cleanCode) {
        return {
          success: false,
          error: "Entre ton Code USR, ton Code d'évasion ou ton Mot de passe pour valider l'échange.",
        };
      }

      const matchesLocalCode =
        isMaster ||
        cleanCode.toUpperCase() === (user.id || '').toUpperCase() ||
        cleanCode.toUpperCase() === (user.referralCode || '').toUpperCase();

      const currentPoints = user.points || 0;
      if (!isMaster && currentPoints < reward.cost) {
        const msg = `Points insuffisants (${currentPoints} / ${reward.cost} pts) ⚡`;
        showToast({
          title: msg,
          message:
            'Offre ou reçois Glace 🍦 (+50 pts), Eau 💧 (+75 pts) ou Conserve 🥫 (+80 pts) pour gagner des points !',
          type: 'warning',
        });
        return { success: false, error: msg };
      }

      try {
        const res = await authFetch('/api/account/redeem-points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rewardId, validationCode: cleanCode }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          profile?: UserProfile;
          error?: string;
        } | null;

        if (!res.ok || !data?.success) {
          if (!matchesLocalCode) {
            return {
              success: false,
              error:
                data?.error ||
                "Code invalide. Vérifie ton Code USR, ton Code d'évasion ou ton Mot de passe.",
            };
          }
        } else if (data.profile) {
          applyActionServerProfile(data.profile);
          soundEngine.playKeyTurn();
          showToast({
            title: `Échange validé : ${reward.label}`,
            message: isMaster
              ? 'Débloqué instantanément avec ton accès Maître.'
              : `${reward.cost} points payés et validés par code à la Cantine !`,
            type: 'success',
          });
          return { success: true };
        }
      } catch {
        if (!matchesLocalCode) {
          return {
            success: false,
            error: "Code invalide. Entre ton Code USR ou ton Code d'évasion exact.",
          };
        }
      }

      if (!matchesLocalCode) {
        return {
          success: false,
          error: "Code invalide. Entre ton Code USR, ton Code d'évasion ou ton Mot de passe.",
        };
      }

      setUser((prev) => {
        const nextPts = isMaster ? prev.points || 0 : Math.max(0, (prev.points || 0) - reward.cost);
        return reward.apply({ ...prev, points: nextPts });
      });
      soundEngine.playKeyTurn();
      showToast({
        title: `Échange validé : ${reward.label}`,
        message: isMaster
          ? 'Débloqué instantanément avec ton accès Maître.'
          : `${reward.cost} points payés et validés par code à la Cantine !`,
        type: 'success',
      });
      return { success: true };
    },
    [user, showToast, authFetch]
  );

  // Detox controls
  const startDetox = useCallback(
    (minutes: number, ambient: boolean, soundscape: '432hz' | 'silence' = '432hz') => {
      if (!requireFullKeyAccess('Bouclier Détox')) return;
      const startedAt = Date.now();
      const targetEndTime = startedAt + minutes * 60 * 1000;
      setDetoxSession({ isActive: true, durationMinutes: minutes, startedAt, targetEndTime, ambientSound: ambient, soundscape });
      soundEngine.playLockSound();
      if (ambient && soundscape !== 'silence') soundEngine.startAmbientSound(soundscape);
      showToast({
        title: 'Bouclier Anti-Scroll activé 📵',
        message: `C'est parti pour ${minutes} min de calme absolu (${soundscape === '432hz' ? 'Fréquence 432Hz Douce' : 'Silence'}).`,
        icon: '🛡️',
        type: 'info',
      });
    },
    [requireFullKeyAccess, showToast]
  );

  const cancelDetox = useCallback(() => {
    soundEngine.stopAmbientSound();
    setDetoxSession({ isActive: false, durationMinutes: 15, startedAt: null, targetEndTime: null, ambientSound: false });
    showToast({
      title: 'Détox interrompue',
      message: 'Pas de pression mon pote, tu réessaieras quand tu te sentiras prêt.',
      icon: '🕊️',
    });
  }, [showToast]);

  const completeDetox = useCallback(() => {
    const activeSnapshot = detoxSessionRef.current;
    if (!activeSnapshot.isActive) return;
    const completedMinutes = activeSnapshot.durationMinutes || 15;
    detoxSessionRef.current = { isActive: false, durationMinutes: 15, startedAt: null, targetEndTime: null, ambientSound: false };
    soundEngine.stopAmbientSound();
    soundEngine.playZenChime();
    triggerConfettiLiberation();

    setUser((prev) => {
      const newBadges = [...prev.badges];
      if (!newBadges.some((b) => b.id === 'badge_esprit_libre')) {
        const b = ALL_BADGES.find((bg) => bg.id === 'badge_esprit_libre');
        if (b) newBadges.push({ ...b, unlockedAt: Date.now() });
      }
      const next: UserProfile = {
        ...prev,
        keysAvailable: prev.keysAvailable + 5,
        padlocksAvailable: (prev.padlocksAvailable || 0) + 1,
        screenTimeSavedMinutes: (prev.screenTimeSavedMinutes || 0) + completedMinutes,
        badges: newBadges,
      };
      userLatestRef.current = next;
      persistUserSafely(next);
      syncUserFieldsToSupabase(next, {});
      return next;
    });

    if (!isOnlineModeRef.current) {
      queueActionForSync({
        type: 'COMPLETE_DETOX',
        endpoint: '/api/account/complete-detox',
        method: 'POST',
        body: { durationMinutes: completedMinutes },
      });
    } else if (isAuthenticated) {
      void authFetch('/api/account/complete-detox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: completedMinutes }),
      })
        .then(async (r) => {
          if (r.ok) {
            const d = await r.json().catch(() => null);
            if (d?.profile) applyActionServerProfile(d.profile);
          } else if (r.status >= 500) {
            queueActionForSync({
              type: 'COMPLETE_DETOX',
              endpoint: '/api/account/complete-detox',
              method: 'POST',
              body: { durationMinutes: completedMinutes },
            });
          }
        })
        .catch(() => {
          queueActionForSync({
            type: 'COMPLETE_DETOX',
            endpoint: '/api/account/complete-detox',
            method: 'POST',
            body: { durationMinutes: completedMinutes },
          });
        });
    }

    setDetoxSession({ isActive: false, durationMinutes: 15, startedAt: null, targetEndTime: null, ambientSound: false });
    showToast({
      title: 'DÉFI RÉUSSI ! 🕊️',
      message: `Badge "Esprit Libre" débloqué, +5 clés, +1 cadenas 🔒 et +${completedMinutes} min épargnées !`,
      icon: '✨',
      type: 'success',
    });
  }, [triggerConfettiLiberation, showToast, isAuthenticated, authFetch, persistUserSafely, syncUserFieldsToSupabase, applyActionServerProfile, queueActionForSync]);

  const openStoryModal = useCallback(
    (post?: ConfessionPost | null) => {
      if (!requireFullKeyAccess('Partage Story 9:16')) return;
      setActiveStoryPost(post || null);
      setIsWallStoryActive(!post);
    },
    [requireFullKeyAccess]
  );

  const openWallStoryModal = useCallback(() => {
    if (!requireFullKeyAccess('Partage Story 9:16')) return;
    setActiveStoryPost(null);
    setIsWallStoryActive(true);
  }, [requireFullKeyAccess]);

  const closeStoryModal = useCallback(() => {
    setActiveStoryPost(null);
    setIsWallStoryActive(false);
  }, []);

  const closeLiberationCelebration = useCallback(() => setLiberatedPostCelebration(null), []);

  const applyReferralCode = useCallback(
    (code: string): { success: boolean; message: string } => {
      if (!hasFullKeyAccess) {
        return { success: false, message: `Accès verrouillé : ${MIN_KEYS_FULL_ACCESS} clés 🔑 requises avant d'activer un code.` };
      }
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) return { success: false, message: "Le code ou l'ID ne peut pas être vide." };
      if (cleanCode === user.referralCode || cleanCode === user.id) {
        return { success: false, message: "C'est ton propre code ou ID d'invitation, donne-le à un ami !" };
      }

      setUser((prev) => {
        const nextCount = prev.referralsCount + 1;
        const isNowVip = nextCount >= 3;
        const newBadges = [...prev.badges];
        if (isNowVip && !newBadges.some((b) => b.id === 'badge_parrain_vip')) {
          const b = ALL_BADGES.find((bg) => bg.id === 'badge_parrain_vip');
          if (b) newBadges.push({ ...b, unlockedAt: Date.now() });
        }
        return {
          ...prev,
          referralsCount: nextCount,
          isVipCell: isNowVip || prev.isVipCell,
          keysAvailable: prev.keysAvailable + 3,
          padlocksAvailable: (prev.padlocksAvailable || 0) + 1,
          badges: newBadges,
        };
      });

      if (isAuthenticated) {
        void authFetch('/api/account/apply-referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: cleanCode }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.profile) applyActionServerProfile(d.profile);
          })
          .catch(() => {});
      }

      soundEngine.playLiberationFanfare();
      showToast({
        title: 'Code de codétenu validé ! 🤝',
        message: '+3 clés et +1 cadenas 🔒 offerts. Solidarité entre détenus renforcée !',
        icon: '⚡',
        type: 'success',
      });
      return { success: true, message: 'Code validé ! +3 clés et +1 cadenas accordés.' };
    },
    [hasFullKeyAccess, user.referralCode, user.id, showToast, isAuthenticated, authFetch, applyActionServerProfile]
  );

  const simulatedVoiceAudio = useCallback((duration: number) => {
    if (soundEngine.getMuted()) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + duration * 0.4);
      osc.frequency.exponentialRampToValueAtTime(130, now + duration);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 3.5;
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = () => ctx.close().catch(() => {});
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // ignore
    }
  }, []);

  const executeFreePassOrder = useCallback(
    async (item: CheckoutItemRequest): Promise<boolean> => {
      try {
        const res = await authFetch('/api/payments/free-pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: item.id,
            targetPostId: item.postId || item.targetPostId,
            neonColor: item.neonColor,
            cellFrame: item.cellFrame,
          }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          orderId?: string;
          profile?: UserProfile;
          post?: ConfessionPost | null;
          error?: string;
        };
        if (res.ok && data.success) {
          applyVerifiedServerPurchase({
            item: { ...item, priceLabel: '0,00 €' },
            methodLabel: 'Accès Gratuit',
            profile: data.profile,
            post: data.post,
            txId: data.orderId,
          });
          return true;
        }
      } catch {
        // fallback below if network temporarily unreachable
      }

      if (!isMasterPassUser(user)) return false;

      if (item.type === 'neon_pack' || item.type === 'neon_style') {
        const nextNeon = item.neonColor || user.neonColor || 'emerald';
        const nextFrame = item.cellFrame || 'neon';
        setUser((prev) => ({ ...prev, neonColor: nextNeon, cellBorderFrame: nextFrame }));
        setPosts((prev) =>
          prev.map((p) =>
            p.authorId === user.id || p.authorMatricule === user.matricule
              ? { ...p, authorNeonColor: nextNeon, authorFrame: nextFrame }
              : p
          )
        );
      } else if ((item.type === 'kit' || item.type === 'digital_kit') && item.kitId) {
        setUser((prev) => ({
          ...prev,
          purchasedKits: Array.from(new Set([...(prev.purchasedKits || []), item.kitId!])),
        }));
      } else if (item.type === 'vip_sub') {
        setUser((prev) => ({ ...prev, isVipCell: true, isVipSubscriber: true }));
      }

      applyVerifiedServerPurchase({
        item: { ...item, priceLabel: '0,00 €' },
        methodLabel: 'Accès Gratuit',
      });
      return true;
    },
    [authFetch, applyVerifiedServerPurchase, user]
  );

  const buyPassePartout = useCallback(
    (postId?: string) => {
      const item: CheckoutItemRequest = {
        id: postId ? `passe_partout_${postId}` : 'passe_partout_single',
        name: 'Le « Passe-Partout » 24h',
        tagline: postId
          ? 'Libère immédiatement ce détenu sans attendre et épingle son message 24h avec badge doré.'
          : "Libère immédiatement n'importe quel message + épingle 24h en haut du mur + 1 Cadenas bonus.",
        priceLabel: isMasterPassUser(user) ? '0,00 €' : '0,99 €',
        amount: isMasterPassUser(user) ? 0 : 0.99,
        icon: '🗝️',
        type: 'passe_partout',
        postId,
        targetPostId: postId,
        padlocks: 1,
      };
      if (isMasterPassUser(user)) {
        void executeFreePassOrder(item);
        return;
      }
      openShop(item);
    },
    [openShop, user, executeFreePassOrder]
  );

  const usePassePartoutOnPost = useCallback(
    (postId: string): boolean => {
      const isMaster = isMasterPassUser(user);
      if (!isMaster && (!user.hasPassePartoutCount || user.hasPassePartoutCount <= 0)) {
        buyPassePartout(postId);
        return false;
      }

      const donorLabel = isMaster ? 'Passe-Partout 👑' : 'Passe-Partout 0,99€';
      setUser((prev) => ({
        ...prev,
        hasPassePartoutCount: isMaster
          ? Math.max(999, prev.hasPassePartoutCount || 999)
          : Math.max(0, (prev.hasPassePartoutCount || 1) - 1),
      }));
      soundEngine.playLiberationFanfare();
      triggerConfettiLiberation();
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                status: 'escaped',
                keysCount: Math.max(post.keysCount, post.keysRequired),
                isPinned: true,
                hasGoldBadge: true,
                escapedAt: Date.now(),
                pinnedUntil: Date.now() + 24 * 60 * 60 * 1000,
                keyDonors: post.keyDonors.includes(donorLabel)
                  ? post.keyDonors
                  : [donorLabel, ...post.keyDonors],
              }
            : post
        )
      );

      showToast({
        title: '👑 Message libéré & épinglé 24h !',
        message: 'Le Passe-Partout a fait sauter les barreaux immédiatement.',
        icon: '✨',
        type: 'success',
      });

      void authFetch(`/api/posts/${encodeURIComponent(postId)}/passe-partout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.profile) applyActionServerProfile(d.profile);
        })
        .catch(() => {});
      return true;
    },
    [user, buyPassePartout, triggerConfettiLiberation, showToast, authFetch, applyActionServerProfile]
  );

  const buyNeonPack = useCallback(
    (neonColor: NeonColor, cellFrame: CellFrame) => {
      const neonInfo = getNeonItem(neonColor);
      const isMaster = isMasterPassUser(user);
      const item: CheckoutItemRequest = {
        id: `neon_pack_${neonColor}_${cellFrame}`,
        name: `Style Néon · ${neonInfo.label}`,
        tagline: `Changement de couleur néon (${neonInfo.shortLabel}) + cadre de cellule « ${cellFrame} » sur Le Mur, La Cour & Profil.`,
        priceLabel: isMaster ? '0,00 €' : '0,50 €',
        amount: isMaster ? 0 : 0.5,
        icon: '🎨',
        type: 'neon_pack',
        neonColor,
        cellFrame,
      };
      if (isMaster) {
        void executeFreePassOrder(item);
        return;
      }
      openShop(item);
    },
    [openShop, user, executeFreePassOrder]
  );

  const subscribeVip = useCallback(() => {
    const isMaster = isMasterPassUser(user);
    const item: CheckoutItemRequest = {
      id: 'vip_esprit_libre_monthly',
      name: 'Abonnement Quartier VIP · Esprit Libre',
      tagline: 'Salons privés entre amis, modificateur de voix, stats détox + 10 Clés 🔑 & 3 Cadenas 🔒.',
      priceLabel: isMaster ? '0,00 €' : '1,99 €',
      amount: isMaster ? 0 : 1.99,
      icon: '👑',
      type: 'vip_sub',
      isVip: true,
      keys: 10,
      padlocks: 3,
    };
    if (isMaster) {
      void executeFreePassOrder(item);
      return;
    }
    openShop(item);
  }, [openShop, user, executeFreePassOrder]);

  const buyKit = useCallback(
    (kitId: string) => {
      const kit = DIGITAL_KITS.find((k) => k.id === kitId);
      if (!kit) return;
      const isMaster = isMasterPassUser(user);
      const numericPrice = parseFloat(kit.price.replace(',', '.').replace(/[^0-9.]/g, '')) || 2.99;
      const item: CheckoutItemRequest = {
        id: kit.id,
        name: `Kit d'Évasion : ${kit.title}`,
        tagline: kit.subtitle,
        priceLabel: isMaster ? '0,00 €' : kit.price,
        amount: isMaster ? 0 : numericPrice,
        icon: kit.icon,
        type: 'kit',
        kitId: kit.id,
      };
      if (isMaster) {
        void executeFreePassOrder(item);
        return;
      }
      openShop(item);
    },
    [openShop, user, executeFreePassOrder]
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: AppTheme = prev === 'dark' ? 'light' : 'dark';
      soundEngine.playKeyTurn();
      showToast({
        title: next === 'light' ? 'Mode Jour activé ☀️' : 'Mode Nuit activé 🌙',
        message:
          next === 'light'
            ? 'Lumière du jour dans la cellule. Meilleur contraste en plein jour.'
            : 'Ambiance clandestine sombre. Économie de batterie OLED.',
        icon: next === 'light' ? '☀️' : '🌙',
        type: 'info',
      });
      return next;
    });
  }, [showToast]);

  const userRank = useMemo(() => getUserRank(user.keysGivenTotal || 0), [user.keysGivenTotal]);

  const dailyMission = useMemo(() => {
    const dayEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const dayIndex = dayEpoch % DAILY_MISSIONS.length;
    return DAILY_MISSIONS[dayIndex];
  }, [user.lastMidnightResetDate, lastMidnightResetTime]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isDailyMissionCompleted = user.dailyMissionCompletedDate === todayStr;

  const completeDailyMission = useCallback(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const currentSnap = userLatestRef.current;
      if (dailyMissionGuardRef.current === today || currentSnap.dailyMissionCompletedDate === today) {
        showToast({
          title: 'Mission déjà validée ! ✅',
          message: 'Reviens demain pour une nouvelle mission dans la vraie vie.',
          type: 'info',
        });
        return;
      }

      dailyMissionGuardRef.current = today;
      try {
        soundEngine.playLiberationFanfare();
        triggerConfettiLiberation();
      } catch {
        // Ne jamais bloquer ou faire planter la validation si l'audio ou les confettis échouent
      }

      const expectedKeys = (currentSnap.keysAvailable || 0) + dailyMission.keysReward;
      const expectedPadlocks = (currentSnap.padlocksAvailable || 0) + 1;
      const expectedPoints = (currentSnap.points || 0) + dailyMission.pointsReward;
      const expectedMissions = (currentSnap.completedMissionsCount || 0) + 1;
      const expectedMinutes = (currentSnap.screenTimeSavedMinutes || 0) + 30;

      setUser((prev) => {
        if (prev.dailyMissionCompletedDate === today) return prev;
        const next: UserProfile = {
          ...prev,
          keysAvailable: prev.keysAvailable + dailyMission.keysReward,
          padlocksAvailable: (prev.padlocksAvailable || 0) + 1,
          points: (prev.points || 0) + dailyMission.pointsReward,
          completedMissionsCount: (prev.completedMissionsCount || 0) + 1,
          screenTimeSavedMinutes: (prev.screenTimeSavedMinutes || 0) + 30,
          dailyMissionCompletedDate: today,
          lastActiveDate: today,
        };
        userLatestRef.current = next;
        currentUserUniverseRef.current = Array.isArray(next.universeMedia)
          ? next.universeMedia
          : currentUserUniverseRef.current;
        persistUserSafely(next);
        syncUserFieldsToSupabase(next, {});
        return next;
      });

      const missionPayload = {
        id: currentSnap.id,
        matricule: currentSnap.matricule,
        alias: currentSnap.alias,
        avatar: currentSnap.avatar,
        referralCode: currentSnap.referralCode,
      };
      if (!isOnlineModeRef.current) {
        queueActionForSync({
          type: 'COMPLETE_DAILY_MISSION',
          endpoint: '/api/account/complete-mission',
          method: 'POST',
          body: missionPayload,
        });
      } else {
        void authFetch('/api/account/complete-mission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(missionPayload),
        })
          .then(async (r) => {
            if (r.ok) {
              const d = await r.json().catch(() => null);
              if (d?.profile) {
                // Préserver impérativement les médias ("Mes médias"), l'avatar, la bio, la musique et les récompenses de mission
                applyActionServerProfile(d.profile, {
                  dailyMissionCompletedDate: today,
                  lastActiveDate: today,
                  keysAvailable: Math.max(d.profile.keysAvailable || 0, expectedKeys),
                  padlocksAvailable: Math.max(d.profile.padlocksAvailable || 0, expectedPadlocks),
                  points: Math.max(d.profile.points || 0, expectedPoints),
                  completedMissionsCount: Math.max(
                    d.profile.completedMissionsCount || 0,
                    expectedMissions
                  ),
                  screenTimeSavedMinutes: Math.max(
                    d.profile.screenTimeSavedMinutes || 0,
                    expectedMinutes
                  ),
                });
              }
            } else if (r.status >= 500) {
              queueActionForSync({
                type: 'COMPLETE_DAILY_MISSION',
                endpoint: '/api/account/complete-mission',
                method: 'POST',
                body: missionPayload,
              });
            }
          })
          .catch(() => {
            queueActionForSync({
              type: 'COMPLETE_DAILY_MISSION',
              endpoint: '/api/account/complete-mission',
              method: 'POST',
              body: missionPayload,
            });
          });
      }

      showToast({
        title: `Mission accomplie ! +${dailyMission.pointsReward} pts 🔥`,
        message: `Bravo ! Tu gagnes +${dailyMission.keysReward} clés 🔑 (offrir des clés débloqué) et +1 Cadenas 🔒 (Cadenas débloqué) !`,
        icon: '🔥',
        type: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Erreur lors de la validation',
        message: err instanceof Error ? err.message : 'Impossible de valider la mission.',
        type: 'warning',
      });
    }
  }, [
    dailyMission,
    showToast,
    triggerConfettiLiberation,
    authFetch,
    persistUserSafely,
    syncUserFieldsToSupabase,
    applyActionServerProfile,
    queueActionForSync,
  ]);

  const resetAllAppData = useCallback(() => {
    void clearLatestProfileBackupFromIdb();
    wipeAllEvasionStorage();
    try {
      localStorage.setItem(RESET_EPOCH_KEY, CURRENT_RESET_EPOCH);
    } catch {
      // ignore
    }
    soundEngine.resetMute();
    setSoundMuted(false);
    setTheme('dark');
    writeStoredAuthToken(null);
    setAuthAccount(null);
    setIsSensitiveCodesUnlocked(false);
    setUser(createInitialUser());
    setPosts([]);
    setChatMessages([]);
    setCustomSalons([]);
    setActiveLives([]);
    setDirectChatTarget(null);
    setDetoxSession({ isActive: false, durationMinutes: 15, startedAt: null, targetEndTime: null, ambientSound: false });
    setActiveTagFilter(null);
    setActiveStoryPost(null);
    setIsWallStoryActive(false);
    setLiberatedPostCelebration(null);
    setIsShopOpen(false);
    setCheckoutItem(null);
    setActiveReadKit(null);
    setLastMidnightResetTime(Date.now());
  }, []);

  const value = useMemo(
    () => ({
      user,
      authAccount,
      isAuthenticated,
      isAuthLoading,
      isAuthModalOpen,
      openAuthModal,
      closeAuthModal,
      registerAccount,
      loginAccount,
      logoutAccount,
      enterFreshZeroSession,
      createProtectedAnonymousSession,
      rotatePublicShareSlug,
      connectWithPseudo,
      connectWithGoogle,
      hasAccountPassword,
      isSensitiveCodesUnlocked,
      unlockSensitiveCodesWithPassword,
      lockSensitiveCodes,
      setAccountPassword,
      authFetch,
      isNetworkOnline,
      manualOfflineMode,
      isOnlineMode,
      pendingSyncCount,
      isSyncingOfflineQueue,
      setManualOfflineMode,
      toggleOnlineOfflineMode,
      syncOfflineQueueNow,
      syncServerSession: applyServerAccount,
      applyVerifiedServerPurchase,
      userRank,
      dailyMission,
      isDailyMissionCompleted,
      completeDailyMission,
      posts,
      chatMessages,
      authToken: authTokenState,
      detoxSession,
      soundMuted,
      theme,
      toggleTheme,
      activeStoryPost,
      liberatedPostCelebration,
      onlineInmatesCount,
      toast,
      showToast,
      hideToast,
      updateUserProfile,
      removeUserAvatar,
      updateProfileStatus,
      setActiveFlame,
      removeActiveFlame,
      commentOnFlame,
      giveKey,
      revokeKey,
      createPost,
      addCommentToPost,
      sendChatMessage,
      startDetox,
      cancelDetox,
      completeDetox,
      openStoryModal,
      openWallStoryModal,
      isWallStoryActive,
      closeStoryModal,
      closeLiberationCelebration,
      toggleSound,
      claimDailyBonusKeys,
      applyReferralCode,
      simulatedVoiceAudio,
      isShopOpen,
      checkoutItem,
      openShop,
      closeShop,
      buyPassePartout,
      usePassePartoutOnPost,
      buyNeonPack,
      subscribeVip,
      buyKit,
      executeFreePassOrder,
      activeReadKit,
      openKitReader,
      closeKitReader,
      sealPostWithPadlock,
      protectStreakWithPadlock,
      lockRealLifeTemptation,
      claimFreePadlock,
      triggerMidnightReset,
      lastMidnightResetTime,
      simulationLevel,
      activeTagFilter,
      setActiveTagFilter,
      customSalons,
      createCustomSalon,
      activeLives,
      startLiveSession,
      endLiveSession,
      joinLiveSession,
      leaveLiveSession,
      updateLiveFilter,
      sendLiveComment,
      sendLiveLike,
      sendLiveReaction,
      sendLiveKeyGift,
      sendLivePadlock,
      sendLiveSpecialGift,
      redeemPoints,
      resetAllAppData,
      hasFullKeyAccess,
      requireFullKeyAccess,
      directChatTarget,
      openDirectChat,
      closeDirectChat,
      sendDirectMessage,
      availableInmates,
      searchInmates,
      userProfileTarget,
      openUserProfile,
      closeUserProfile,
      fetchPublicUserProfile,
      addUniverseMedia,
      removeUniverseMedia,
      retryUniverseMediaUpload,
      toggleUniversePublic,
      setUniverseItemVisibility,
      setProfileMusic,
      currentAmbientTrack,
      playAmbientTrack,
      pauseAmbientTrack,
      stopAmbientTrack,
      toggleAmbientTrack,
      universeUploadStatuses,
      universeStorageInfo,
      onlineUsers: otherOnlineUsers,
      friends,
      incomingFriendRequests,
      outgoingFriendRequests,
      getFriendshipStatus,
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      removeFriend,
      getUserLiveSession,
      requestedLiveId,
      autoJoinCoHostLiveId,
      requestOpenLive,
      clearRequestedLive,
      incomingLiveInvite,
      dismissIncomingLiveInvite,
      sendLiveInvite,
      respondToLiveInvite,
      requestJoinLiveStage,
      approveGuestStageRequest,
      removeOrLeaveLiveStage,
      updateLiveGuestMedia,
      updateLiveAnnouncement,
      blockLiveViewer,
      joinLiveRtcRoom,
      leaveLiveRtcRoom,
      sendLiveRtcSignal,
      sendLiveRelaySubscribe,
      sendLiveRelayUnsubscribe,
      sendLiveRelayMedia,
      onLiveRtcEvent,
      platformKeyStats,
      refreshPlatformKeyStats,
    }),
    [
      user,
      authAccount,
      isAuthenticated,
      isAuthLoading,
      isAuthModalOpen,
      openAuthModal,
      closeAuthModal,
      registerAccount,
      loginAccount,
      logoutAccount,
      enterFreshZeroSession,
      createProtectedAnonymousSession,
      rotatePublicShareSlug,
      connectWithPseudo,
      connectWithGoogle,
      hasAccountPassword,
      isSensitiveCodesUnlocked,
      unlockSensitiveCodesWithPassword,
      lockSensitiveCodes,
      setAccountPassword,
      authFetch,
      isNetworkOnline,
      manualOfflineMode,
      isOnlineMode,
      pendingSyncCount,
      isSyncingOfflineQueue,
      setManualOfflineMode,
      toggleOnlineOfflineMode,
      syncOfflineQueueNow,
      applyVerifiedServerPurchase,
      userRank,
      dailyMission,
      isDailyMissionCompleted,
      completeDailyMission,
      posts,
      chatMessages,
      authTokenState,
      detoxSession,
      soundMuted,
      theme,
      toggleTheme,
      activeStoryPost,
      isWallStoryActive,
      liberatedPostCelebration,
      onlineInmatesCount,
      toast,
      showToast,
      hideToast,
      updateUserProfile,
      removeUserAvatar,
      updateProfileStatus,
      setActiveFlame,
      removeActiveFlame,
      commentOnFlame,
      giveKey,
      revokeKey,
      createPost,
      addCommentToPost,
      sendChatMessage,
      startDetox,
      cancelDetox,
      completeDetox,
      openStoryModal,
      openWallStoryModal,
      closeStoryModal,
      closeLiberationCelebration,
      toggleSound,
      claimDailyBonusKeys,
      applyReferralCode,
      simulatedVoiceAudio,
      isShopOpen,
      checkoutItem,
      openShop,
      closeShop,
      buyPassePartout,
      usePassePartoutOnPost,
      buyNeonPack,
      subscribeVip,
      buyKit,
      executeFreePassOrder,
      activeReadKit,
      openKitReader,
      closeKitReader,
      sealPostWithPadlock,
      protectStreakWithPadlock,
      lockRealLifeTemptation,
      claimFreePadlock,
      triggerMidnightReset,
      lastMidnightResetTime,
      simulationLevel,
      activeTagFilter,
      customSalons,
      createCustomSalon,
      activeLives,
      startLiveSession,
      endLiveSession,
      joinLiveSession,
      leaveLiveSession,
      updateLiveFilter,
      sendLiveComment,
      sendLiveLike,
      sendLiveReaction,
      sendLiveKeyGift,
      sendLivePadlock,
      sendLiveSpecialGift,
      redeemPoints,
      resetAllAppData,
      hasFullKeyAccess,
      requireFullKeyAccess,
      directChatTarget,
      openDirectChat,
      closeDirectChat,
      sendDirectMessage,
      availableInmates,
      searchInmates,
      userProfileTarget,
      openUserProfile,
      closeUserProfile,
      fetchPublicUserProfile,
      addUniverseMedia,
      removeUniverseMedia,
      retryUniverseMediaUpload,
      toggleUniversePublic,
      setUniverseItemVisibility,
      setProfileMusic,
      currentAmbientTrack,
      playAmbientTrack,
      pauseAmbientTrack,
      stopAmbientTrack,
      toggleAmbientTrack,
      universeUploadStatuses,
      universeStorageInfo,
      otherOnlineUsers,
      friends,
      incomingFriendRequests,
      outgoingFriendRequests,
      getFriendshipStatus,
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      removeFriend,
      getUserLiveSession,
      requestedLiveId,
      autoJoinCoHostLiveId,
      requestOpenLive,
      clearRequestedLive,
      incomingLiveInvite,
      dismissIncomingLiveInvite,
      sendLiveInvite,
      respondToLiveInvite,
      requestJoinLiveStage,
      approveGuestStageRequest,
      removeOrLeaveLiveStage,
      updateLiveGuestMedia,
      updateLiveAnnouncement,
      blockLiveViewer,
      joinLiveRtcRoom,
      leaveLiveRtcRoom,
      sendLiveRtcSignal,
      sendLiveRelaySubscribe,
      sendLiveRelayUnsubscribe,
      sendLiveRelayMedia,
      onLiveRtcEvent,
      platformKeyStats,
      refreshPlatformKeyStats,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
