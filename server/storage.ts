import dotenv from 'dotenv';
dotenv.config({ override: true });
import crypto from 'crypto';
import fs from 'fs';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { Pool } from 'pg';
import { cleanupUnusedLocalMediaUrls } from './mediaStorage.ts';

export const MAX_IRREVERSIBLE_POSTS = 10000;
export const MAX_COMMENTS_PER_POST = 300;
export const MAX_CHAT_MESSAGES = 300;
export const MAX_SALONS = 100;
export const MAX_LIVES = 100;

export interface StoredBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: number;
}

export interface StoredProfileUniverseItem {
  id: string;
  type: 'photo' | 'audio' | 'video' | 'file';
  url: string;
  caption?: string;
  duration?: number;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  keysCount?: number;
  padlocksCount?: number;
  visibility?: 'public' | 'private';
  bgMusic?: StoredActiveFlameItem['bgMusic'];
  createdAt: number;
}

export interface StoredFlameComment {
  id: string;
  authorId: string;
  authorMatricule: string;
  authorAlias: string;
  authorAvatar: string;
  authorNeonColor?: string;
  authorIsVerified?: boolean;
  content: string;
  giftType?: string;
  createdAt: number;
}

export interface StoredActiveFlameItem {
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
  comments?: StoredFlameComment[];
  bgMusic?: {
    id: number | string;
    title: string;
    titleShort?: string;
    artist: string;
    artistPicture?: string;
    albumTitle?: string;
    cover?: string;
    albumCover?: string;
    audioUrl?: string;
    previewUrl: string;
    duration?: number;
    link?: string;
  };
}

export interface StoredUserProfile {
  id: string;
  matricule: string;
  alias: string;
  avatar: string;
  bio?: string;
  universeMedia?: StoredProfileUniverseItem[];
  activeFlame?: StoredActiveFlameItem;
  profileMusic?: StoredActiveFlameItem['bgMusic'];
  isUniversePublic?: boolean;
  universeStorageQuota?: number;
  isUniverseStorageUnlimited?: boolean;
  cellNumber: string;
  detentionDays: number;
  keysAvailable: number;
  escapedCount: number;
  keysGivenTotal: number;
  badges: StoredBadge[];
  referralCode: string;
  referralsCount: number;
  isVipCell: boolean;
  neonColor?: string;
  cellBorderFrame?: string;
  isVipSubscriber?: boolean;
  vipSubscriptionExpiresAt?: number;
  purchasedKits?: string[];
  hasPassePartoutCount?: number;
  streakDays: number;
  firstJoinedDate?: string;
  lastActiveDate: string;
  points: number;
  completedMissionsCount: number;
  dailyMissionCompletedDate?: string;
  padlocksAvailable: number;
  heartsAvailable?: number;
  iceConesAvailable?: number;
  waterBottlesAvailable?: number;
  cansAvailable?: number;
  isStreakProtectedByPadlock?: boolean;
  lockedTemptations?: string[];
  lastMidnightResetDate?: string;
  screenTimeSavedMinutes?: number;
  hasAccountPassword?: boolean;
  publicShareSlug?: string;
  profileType?: 'personal' | 'professional';
  isVerified?: boolean;
  supabaseUserId?: string;
  friends?: {
    id: string;
    matricule: string;
    alias: string;
    avatar: string;
    neonColor?: string;
    cellBorderFrame?: string;
    addedAt: number;
  }[];
  friendRequestsIncoming?: {
    id: string;
    matricule: string;
    alias: string;
    avatar: string;
    neonColor?: string;
    requestedAt: number;
  }[];
  friendRequestsOutgoing?: {
    id: string;
    matricule: string;
    alias: string;
    avatar: string;
    neonColor?: string;
    requestedAt: number;
  }[];
}

export interface StoredAccount {
  id: string;
  username: string; // normalized lowercase login identifier (pseudo or email)
  email?: string;
  supabaseUserId?: string;
  passwordSalt: string;
  passwordHash: string;
  hasCustomPassword?: boolean;
  createdAt: number;
  usedReferralCodes: string[];
  profile: StoredUserProfile;
}

export interface StoredAttachedFileMeta {
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface StoredComment {
  id: string;
  postId: string;
  authorId: string;
  authorMatricule: string;
  authorAlias?: string;
  authorAvatar: string;
  authorNeonColor?: string;
  content: string;
  imageUrl?: string;
  audioNote?: { duration: number; audioData?: string };
  videoUrl?: string;
  videoDuration?: number;
  attachedFile?: StoredAttachedFileMeta;
  createdAt: number;
}

export interface StoredPost {
  id: string;
  authorId: string;
  authorMatricule: string;
  authorAlias?: string;
  authorAvatar: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  attachedFile?: StoredAttachedFileMeta;
  category: string;
  createdAt: number;
  keysCount: number;
  keysRequired: number;
  status: 'locked' | 'escaped';
  keyDonors: string[];
  escapedAt?: number;
  isPinned?: boolean;
  pinnedUntil?: number;
  hasGoldBadge?: boolean;
  audioNote?: { duration: number; hasVoiceFilter: boolean; audioData?: string };
  authorNeonColor?: string;
  authorFrame?: string;
  padlocksSealCount?: number;
  comments?: StoredComment[];
  bgMusic?: StoredActiveFlameItem['bgMusic'];
}

export interface StoredChatMessage {
  id: string;
  authorId: string;
  authorMatricule: string;
  authorAvatar: string;
  content: string;
  timestamp: number;
  isSystem?: boolean;
  isVip?: boolean;
  neonColor?: string;
  channel?: string;
  recipientId?: string;
  recipientMatricule?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  audioNote?: { duration: number; audioData: string };
}

export interface StoredSalon {
  id: string;
  tag: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: number;
}

export interface StoredLiveComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  type?: 'chat' | 'key_gift' | 'padlock' | 'ice_cone' | 'water_bottle' | 'canned_food' | 'system';
  timestamp: number;
}

export interface StoredLiveGuestParticipant {
  userId: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: string;
  frame?: string;
  camEnabled: boolean;
  micEnabled: boolean;
  joinedAt: number;
}

export interface StoredLiveGuestRequest {
  userId: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: string;
  requestedAt: number;
}

export interface StoredLivePendingInvite {
  targetUserId: string;
  targetName: string;
  mode: 'viewer' | 'cohost';
  invitedAt: number;
}

export interface StoredLiveViewerParticipant {
  userId: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: string;
  joinedAt: number;
}

export interface StoredLiveSession {
  id: string;
  hostId: string;
  hostName: string;
  hostMatricule: string;
  hostAvatar: string;
  hostNeonColor?: string;
  hostFrame?: string;
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
  guests?: StoredLiveGuestParticipant[];
  pendingInvites?: StoredLivePendingInvite[];
  guestRequests?: StoredLiveGuestRequest[];
  activeViewers?: StoredLiveViewerParticipant[];
  blockedUserIds?: string[];
  comments: StoredLiveComment[];
}

export interface StoredPaymentOrder {
  orderId: string;
  provider: 'paypal';
  externalId?: string;
  userId: string;
  itemId: string;
  itemName: string;
  amountCents: number;
  currency: 'EUR';
  status: 'pending' | 'paid' | 'failed';
  targetPostId?: string;
  neonColor?: string;
  cellFrame?: string;
  createdAt: number;
  paidAt?: number;
}

export interface StoredPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
  userId: string;
  matricule: string;
  notifyAllCour?: boolean;
  userAgent?: string;
  createdAt: number;
  updatedAt: number;
}

interface StoreSnapshot {
  accounts: Record<string, StoredAccount>;
  posts: StoredPost[];
  chatMessages: StoredChatMessage[];
  salons: StoredSalon[];
  lives: StoredLiveSession[];
  paymentOrders: Record<string, StoredPaymentOrder>;
  processedWebhooks: Record<string, number>;
  pushSubscriptions: Record<string, StoredPushSubscription>;
}

const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'evasion-data')
  : path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'evasion-store.json');
const SECRETS_FILE = path.join(DATA_DIR, 'server-secrets.json');

export const SERVER_BADGES: Record<string, Omit<StoredBadge, 'unlockedAt'>> = {
  badge_detainee: {
    id: 'badge_detainee',
    name: 'Matricule Enregistré',
    description: 'Entré dans le collectif ÉVASION',
    icon: '🆔',
  },
  badge_esprit_libre: {
    id: 'badge_esprit_libre',
    name: 'Esprit Libre',
    description: 'A accompli une session complète de Défi Détox',
    icon: '🕊️',
  },
  badge_clef_or: {
    id: 'badge_clef_or',
    name: 'Passe-Partout',
    description: 'A offert 10 clés pour libérer des codétenus',
    icon: '🗝️',
  },
  badge_evade_supreme: {
    id: 'badge_evade_supreme',
    name: 'Grand Libéré',
    description: 'A réussi à faire libérer un défi personnel avec 5 clés',
    icon: '🔓',
  },
  badge_parrain_vip: {
    id: 'badge_parrain_vip',
    name: 'Passeur de Liberté',
    description: 'A recruté 3 codétenus et débloqué la Cellule VIP',
    icon: '⚡',
  },
};

export const TEST_2026_USER_ID = 'USR_77260';
export const TEST_2026_USERNAME = 'test_2026';
export const TEST_2026_KIT_IDS = [
  'kit_detox_7days',
  'kit_morning_routine',
  'kit_business_zero_euro',
];

export function isTest2026Identifier(value?: string | null): boolean {
  const norm = String(value || '').trim().toLowerCase();
  return norm === TEST_2026_USERNAME || norm === 'usr_test_2026';
}

export function isTest2026Account(
  accOrProfile?: StoredAccount | StoredUserProfile | null
): boolean {
  if (!accOrProfile) return false;
  if ('profile' in accOrProfile) {
    return (
      accOrProfile.id === TEST_2026_USER_ID ||
      isTest2026Identifier(accOrProfile.id) ||
      isTest2026Identifier(accOrProfile.username) ||
      accOrProfile.profile?.id === TEST_2026_USER_ID ||
      isTest2026Identifier(accOrProfile.profile?.id) ||
      isTest2026Identifier(accOrProfile.profile?.alias) ||
      isTest2026Identifier(accOrProfile.profile?.referralCode)
    );
  }
  return (
    accOrProfile.id === TEST_2026_USER_ID ||
    isTest2026Identifier(accOrProfile.id) ||
    isTest2026Identifier(accOrProfile.alias) ||
    isTest2026Identifier(accOrProfile.referralCode)
  );
}

export function applyTest2026Privileges(account: StoredAccount): StoredAccount {
  const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
  const existingBadges = Array.isArray(account.profile.badges) ? [...account.profile.badges] : [];
  for (const tpl of Object.values(SERVER_BADGES)) {
    if (!existingBadges.some((b) => b.id === tpl.id)) {
      existingBadges.push({ ...tpl, unlockedAt: Date.now() });
    }
  }
  const existingKits = Array.isArray(account.profile.purchasedKits)
    ? [...account.profile.purchasedKits]
    : [];
  for (const kitId of TEST_2026_KIT_IDS) {
    if (!existingKits.includes(kitId)) {
      existingKits.push(kitId);
    }
  }

  account.username = TEST_2026_USERNAME;
  const currentMat = String(account.profile.matricule || '').trim();
  const currentAlias = String(account.profile.alias || '').trim();
  const currentRef = String(account.profile.referralCode || '').trim();

  account.profile = {
    ...account.profile,
    id: account.id,
    matricule:
      !currentMat || /test_2026/i.test(currentMat) ? 'Détenu #726' : currentMat,
    alias:
      !currentAlias || /test_2026/i.test(currentAlias) || currentAlias === 'Spectre En Quête'
        ? 'Esprit Libre'
        : currentAlias,
    referralCode:
      !currentRef || /test_2026/i.test(currentRef) ? 'EVASION-7726' : currentRef,
    isVipCell: true,
    isVipSubscriber: true,
    vipSubscriptionExpiresAt: Math.max(
      account.profile.vipSubscriptionExpiresAt || 0,
      Date.now() + tenYearsMs
    ),
    keysAvailable: Math.max(account.profile.keysAvailable || 0, 9999),
    padlocksAvailable: Math.max(account.profile.padlocksAvailable || 0, 9999),
    hasPassePartoutCount: Math.max(account.profile.hasPassePartoutCount || 0, 999),
    points: Math.max(account.profile.points || 0, 10000),
    purchasedKits: existingKits,
    badges: existingBadges,
  };
  return account;
}

export function generateAnonymousShareSlug(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `profil-anonyme-${suffix}`;
}

export function createCleanUserProfile(alias?: string, avatar?: string): StoredUserProfile {
  const todayStr = new Date().toISOString().slice(0, 10);
  const blockLetter = String.fromCharCode(65 + Math.floor(Math.random() * 4));
  return {
    id: `USR_${Math.floor(10000 + Math.random() * 90000)}`,
    matricule: `Détenu #${Math.floor(100 + Math.random() * 900)}`,
    alias: (alias || 'Spectre En Quête').trim().slice(0, 32) || 'Spectre En Quête',
    avatar: (avatar || '⛓️').slice(0, 200000),
    cellNumber: `Bloc ${blockLetter}-${Math.floor(1 + Math.random() * 20)}`,
    detentionDays: 1,
    keysAvailable: 3,
    escapedCount: 0,
    keysGivenTotal: 0,
    badges: [],
    referralCode: `EVASION-${Math.floor(1000 + Math.random() * 9000)}`,
    referralsCount: 0,
    isVipCell: false,
    neonColor: 'emerald',
    cellBorderFrame: 'none',
    isVipSubscriber: false,
    purchasedKits: [],
    hasPassePartoutCount: 0,
    streakDays: 1,
    firstJoinedDate: todayStr,
    lastActiveDate: todayStr,
    points: 0,
    completedMissionsCount: 0,
    padlocksAvailable: 1,
    heartsAvailable: 10,
    iceConesAvailable: 5,
    waterBottlesAvailable: 5,
    cansAvailable: 5,
    isStreakProtectedByPadlock: false,
    lockedTemptations: [],
    lastMidnightResetDate: todayStr,
    screenTimeSavedMinutes: 0,
    publicShareSlug: generateAnonymousShareSlug(),
  };
}

export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

let cachedAuthSecret: string | null = null;
function readSecretsFile(): Record<string, unknown> {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(SECRETS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore corrupt secrets file
  }
  return {};
}

function writeSecretsFile(next: Record<string, unknown>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(next), 'utf-8');
  } catch {
    // tolerate read-only/ephemeral fs errors
  }
}

export function getAuthSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim().length >= 16) {
    return process.env.AUTH_SECRET.trim();
  }
  if (cachedAuthSecret) return cachedAuthSecret;

  const existing = readSecretsFile();
  if (typeof existing.authSecret === 'string' && existing.authSecret.length >= 32) {
    cachedAuthSecret = existing.authSecret;
    return cachedAuthSecret;
  }

  const generated = crypto.randomBytes(48).toString('hex');
  writeSecretsFile({ ...existing, authSecret: generated });
  cachedAuthSecret = generated;
  return generated;
}

let cachedVapidKeys: { publicKey: string; privateKey: string } | null = null;
export function getOrCreateVapidKeys(
  generator: () => { publicKey: string; privateKey: string }
): { publicKey: string; privateKey: string } {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    return { publicKey: envPub, privateKey: envPriv };
  }
  if (cachedVapidKeys) return cachedVapidKeys;

  const existing = readSecretsFile();
  const stored = existing.vapidKeys as { publicKey?: string; privateKey?: string } | undefined;
  if (stored?.publicKey && stored?.privateKey) {
    cachedVapidKeys = { publicKey: stored.publicKey, privateKey: stored.privateKey };
    return cachedVapidKeys;
  }

  const fresh = generator();
  writeSecretsFile({ ...existing, vapidKeys: fresh });
  cachedVapidKeys = fresh;
  return fresh;
}

export function signSessionToken(userId: string): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  try {
    const expectedSig = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest();
    const actualSig = Buffer.from(sig, 'base64url');
    if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed.uid;
  } catch {
    return null;
  }
}

function deriveFallbackShareSlug(profileId: string): string {
  const hash = crypto.createHash('sha256').update(`evasion-slug:${profileId}`).digest('hex').slice(0, 6);
  return `profil-anonyme-${hash}`;
}

function synchronizeUserDays(profile: StoredUserProfile): StoredUserProfile {
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstJoined = profile.firstJoinedDate || todayStr;
  const joinTime = new Date(firstJoined).getTime();
  const todayTime = new Date(todayStr).getTime();
  const diffDays = Number.isFinite(joinTime) && Number.isFinite(todayTime)
    ? Math.max(0, Math.round((todayTime - joinTime) / (1000 * 60 * 60 * 24)))
    : 0;
  const exactDays = diffDays + 1;
  const safeSlug =
    profile.publicShareSlug && /^profil-anonyme-[a-z0-9]{4,}$/i.test(profile.publicShareSlug.trim())
      ? profile.publicShareSlug.trim().toLowerCase()
      : deriveFallbackShareSlug(profile.id || profile.matricule);
  return {
    ...profile,
    firstJoinedDate: firstJoined,
    detentionDays: exactDays,
    streakDays: exactDays,
    lastActiveDate: todayStr,
    publicShareSlug: safeSlug,
  };
}

export function normalizePostgresUri(uri: string): string {
  if (!uri) return '';
  let cleaned = uri.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  const match = cleaned.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@\/:]+(?::\d+)?\/.*)$/);
  if (match) {
    const proto = match[1];
    const user = match[2];
    let pass = match[3];
    const rest = match[4];
    if (pass.startsWith('[') && pass.endsWith(']')) {
      pass = pass.slice(1, -1);
    }
    const encodedPass = encodeURIComponent(decodeURIComponent(pass));
    return `${proto}${encodeURIComponent(decodeURIComponent(user))}:${encodedPass}@${rest}`;
  }
  return cleaned;
}

class EvasionStorage {
  private pool: Pool | null = null;
  private mode: 'postgres' | 'disk' = 'disk';
  private snapshot: StoreSnapshot = {
    accounts: {},
    posts: [],
    chatMessages: [],
    salons: [],
    lives: [],
    paymentOrders: {},
    processedWebhooks: {},
    pushSubscriptions: {},
  };
  private writeQueue: Promise<void> = Promise.resolve();
  private initialized = false;
  private lastPgPostsSyncAt = 0;
  private pgPostsSyncInFlight: Promise<StoredPost[]> | null = null;

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const candidates = [
      process.env.SUPABASE_POSTGRES_URL,
      process.env.DATABASE_URL,
      process.env.POSTGRES_URL,
      process.env.SUPABASE_DB_URL,
    ];
    let rawDbUrl = '';
    for (const cand of candidates) {
      if (cand && typeof cand === 'string' && (cand.startsWith('postgres://') || cand.startsWith('postgresql://'))) {
        rawDbUrl = cand.trim();
        break;
      }
    }
    const dbUrl = normalizePostgresUri(rawDbUrl);
    if (dbUrl && !dbUrl.includes('user:password@host')) {
      try {
        const isLocalDb = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
        const pool = new Pool({
          connectionString: dbUrl,
          max: 15,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 8000,
          ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
        });
        await pool.query('SELECT 1');
        await this.bootstrapPostgresSchema(pool);
        this.pool = pool;
        this.mode = 'postgres';
        await this.hydrateFromPostgres();
        this.ensureTest2026Account();
        console.log('🗄️ ÉVASION PostgreSQL (Supabase/Cloud) connected & schema verified');
        return;
      } catch (err) {
        console.warn('[Storage] PostgreSQL unavailable, using atomic disk store:', err);
        this.pool = null;
        this.mode = 'disk';
      }
    }

    this.loadSnapshotFromDiskSync();
    this.pruneExpiredLives();
    this.ensureTest2026Account();
  }

  public getMode(): 'postgres' | 'disk' {
    return this.mode;
  }

  private async bootstrapPostgresSchema(pool: Pool): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS evasion_accounts (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        data JSONB NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evasion_posts (
        id TEXT PRIMARY KEY,
        created_at BIGINT NOT NULL,
        data JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evasion_chat_messages (
        id TEXT PRIMARY KEY,
        ts BIGINT NOT NULL,
        data JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evasion_salons (
        id TEXT PRIMARY KEY,
        tag TEXT UNIQUE NOT NULL,
        created_at BIGINT NOT NULL,
        data JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evasion_lives (
        id TEXT PRIMARY KEY,
        started_at BIGINT NOT NULL,
        data JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evasion_payment_orders (
        order_id TEXT PRIMARY KEY,
        external_id TEXT,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evasion_processed_webhooks (
        event_id TEXT PRIMARY KEY,
        processed_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evasion_push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evasion_media_blobs (
        id TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        data BYTEA NOT NULL,
        created_at BIGINT NOT NULL
      );
    `);
  }

  private async hydrateFromPostgres(): Promise<void> {
    if (!this.pool) return;
    const [accRes, postRes, chatRes, salonRes, liveRes, orderRes, hookRes, pushRes] = await Promise.all([
      this.pool.query('SELECT data FROM evasion_accounts'),
      this.pool.query('SELECT data FROM evasion_posts ORDER BY created_at DESC'),
      this.pool.query('SELECT data FROM evasion_chat_messages ORDER BY ts DESC LIMIT $1', [MAX_CHAT_MESSAGES]),
      this.pool.query('SELECT data FROM evasion_salons ORDER BY created_at DESC LIMIT $1', [MAX_SALONS]),
      this.pool.query('SELECT data FROM evasion_lives ORDER BY started_at DESC LIMIT $1', [MAX_LIVES]),
      this.pool.query('SELECT data FROM evasion_payment_orders'),
      this.pool.query('SELECT event_id, processed_at FROM evasion_processed_webhooks'),
      this.pool.query('SELECT data FROM evasion_push_subscriptions'),
    ]);

    const accounts: Record<string, StoredAccount> = {};
    for (const row of accRes.rows) {
      const acc = row.data as StoredAccount;
      if (acc?.id) accounts[acc.id] = acc;
    }

    const paymentOrders: Record<string, StoredPaymentOrder> = {};
    for (const row of orderRes.rows) {
      const ord = row.data as StoredPaymentOrder;
      if (ord?.orderId) paymentOrders[ord.orderId] = ord;
    }

    const processedWebhooks: Record<string, number> = {};
    for (const row of hookRes.rows) {
      processedWebhooks[String(row.event_id)] = Number(row.processed_at) || Date.now();
    }

    const pushSubscriptions: Record<string, StoredPushSubscription> = {};
    for (const row of pushRes.rows) {
      const sub = row.data as StoredPushSubscription;
      if (sub?.endpoint) pushSubscriptions[sub.endpoint] = sub;
    }

    this.snapshot = {
      accounts,
      posts: postRes.rows.map((r) => r.data as StoredPost),
      chatMessages: chatRes.rows.map((r) => r.data as StoredChatMessage).reverse(),
      salons: salonRes.rows.map((r) => r.data as StoredSalon),
      lives: liveRes.rows.map((r) => r.data as StoredLiveSession).filter((l) => l && l.isActive),
      paymentOrders,
      processedWebhooks,
      pushSubscriptions,
    };
    this.pruneExpiredLives();
  }

  private ensureDirsSync(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  private loadSnapshotFromDiskSync(): void {
    this.ensureDirsSync();
    try {
      if (!fs.existsSync(STORE_FILE)) return;
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoreSnapshot>;
      this.snapshot = {
        accounts: parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {},
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages.slice(-MAX_CHAT_MESSAGES) : [],
        salons: Array.isArray(parsed.salons) ? parsed.salons.slice(0, MAX_SALONS) : [],
        lives: Array.isArray(parsed.lives) ? parsed.lives.slice(0, MAX_LIVES) : [],
        paymentOrders:
          parsed.paymentOrders && typeof parsed.paymentOrders === 'object' ? parsed.paymentOrders : {},
        processedWebhooks:
          parsed.processedWebhooks && typeof parsed.processedWebhooks === 'object'
            ? parsed.processedWebhooks
            : {},
        pushSubscriptions:
          parsed.pushSubscriptions && typeof parsed.pushSubscriptions === 'object'
            ? parsed.pushSubscriptions
            : {},
      };
    } catch {
      this.snapshot = {
        accounts: {},
        posts: [],
        chatMessages: [],
        salons: [],
        lives: [],
        paymentOrders: {},
        processedWebhooks: {},
        pushSubscriptions: {},
      };
    }
  }

  private scheduleDiskFlush(): void {
    const serialized = JSON.stringify(this.snapshot);
    if (IS_VERCEL) {
      try {
        this.ensureDirsSync();
        fs.writeFileSync(STORE_FILE, serialized, 'utf-8');
      } catch {
        // ignore transient serverless IO error
      }
      return;
    }
    this.writeQueue = this.writeQueue
      .then(async () => {
        this.ensureDirsSync();
        const tmpPath = `${STORE_FILE}.tmp`;
        await fsp.writeFile(tmpPath, serialized, 'utf-8');
        await fsp.rename(tmpPath, STORE_FILE);
      })
      .catch(() => {
        // tolerate transient IO errors
      });
  }

  private persistAccountPg(account: StoredAccount): void {
    if (!this.pool) return;
    void this.pool
      .query(
        `INSERT INTO evasion_accounts (id, username, email, data, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email, data = EXCLUDED.data`,
        [account.id, account.username, account.email || null, JSON.stringify(account), account.createdAt]
      )
      .catch((err) => console.warn('[PG] account save warning:', err?.message));
  }

  private persistPostPg(post: StoredPost): Promise<void> {
    if (!this.pool) return Promise.resolve();
    return this.pool
      .query(
        `INSERT INTO evasion_posts (id, created_at, data)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [post.id, post.createdAt, JSON.stringify(post)]
      )
      .then(() => undefined)
      .catch((err) => {
        console.warn('[PG] post save warning:', err?.message);
      });
  }

  public persistPostAsync(post: StoredPost): Promise<void> {
    return this.persistPostPg(post);
  }

  private deletePostsPg(ids: string[]): void {
    if (!this.pool || ids.length === 0) return;
    void this.pool
      .query('DELETE FROM evasion_posts WHERE id = ANY($1::text[])', [ids])
      .catch(() => {});
  }

  private persistChatPg(msg: StoredChatMessage): void {
    if (!this.pool) return;
    void this.pool
      .query(
        `INSERT INTO evasion_chat_messages (id, ts, data)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [msg.id, msg.timestamp, JSON.stringify(msg)]
      )
      .catch(() => {});
  }

  private persistSalonPg(salon: StoredSalon): void {
    if (!this.pool) return;
    void this.pool
      .query(
        `INSERT INTO evasion_salons (id, tag, created_at, data)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [salon.id, salon.tag, salon.createdAt, JSON.stringify(salon)]
      )
      .catch(() => {});
  }

  private persistLivePg(live: StoredLiveSession): void {
    if (!this.pool) return;
    void this.pool
      .query(
        `INSERT INTO evasion_lives (id, started_at, data)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [live.id, live.startedAt, JSON.stringify(live)]
      )
      .catch(() => {});
  }

  private deleteLivePg(liveId: string): void {
    if (!this.pool) return;
    void this.pool.query('DELETE FROM evasion_lives WHERE id = $1', [liveId]).catch(() => {});
  }

  private persistOrderPg(order: StoredPaymentOrder): void {
    if (!this.pool) return;
    void this.pool
      .query(
        `INSERT INTO evasion_payment_orders (order_id, external_id, user_id, status, data, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (order_id) DO UPDATE SET external_id = EXCLUDED.external_id, status = EXCLUDED.status, data = EXCLUDED.data`,
        [
          order.orderId,
          order.externalId || null,
          order.userId,
          order.status,
          JSON.stringify(order),
          order.createdAt,
        ]
      )
      .catch(() => {});
  }

  private pruneExpiredLives(): void {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    this.snapshot.lives = this.snapshot.lives.filter((l) => l && l.isActive && l.startedAt > sixHoursAgo);
  }

  public ensureTest2026Account(customAvatar?: string): StoredAccount {
    let existing: StoredAccount | undefined = this.snapshot.accounts[TEST_2026_USER_ID];
    if (!existing) {
      for (const acc of Object.values(this.snapshot.accounts)) {
        if (isTest2026Account(acc)) {
          existing = acc;
          break;
        }
      }
    }

    if (existing) {
      if (existing.id === 'USR_TEST_2026') {
        delete this.snapshot.accounts['USR_TEST_2026'];
        existing.id = TEST_2026_USER_ID;
        existing.profile.id = TEST_2026_USER_ID;
      }
      if (customAvatar && customAvatar.trim() && customAvatar.trim() !== '⛓️') {
        existing.profile.avatar = customAvatar.trim().slice(0, 200000);
      } else if (!existing.profile.avatar || existing.profile.avatar === '⛓️') {
        existing.profile.avatar = '🐺';
      }
      applyTest2026Privileges(existing);
      existing.profile = synchronizeUserDays(existing.profile);
      this.snapshot.accounts[existing.id] = existing;
      this.persistAccountPg(existing);
      this.scheduleDiskFlush();
      return existing;
    }

    const baseProfile = createCleanUserProfile(
      'Esprit Libre',
      customAvatar && customAvatar.trim() && customAvatar.trim() !== '⛓️'
        ? customAvatar.trim()
        : '🐺'
    );
    baseProfile.id = TEST_2026_USER_ID;
    baseProfile.matricule = 'Détenu #726';
    baseProfile.referralCode = 'EVASION-7726';
    baseProfile.cellNumber = 'Bloc A-07';
    baseProfile.neonColor = 'gold';
    baseProfile.cellBorderFrame = 'gold';
    const { salt, hash } = hashPassword('TEST_2026');

    const account: StoredAccount = {
      id: TEST_2026_USER_ID,
      username: TEST_2026_USERNAME,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: Date.now(),
      usedReferralCodes: [],
      profile: baseProfile,
    };

    applyTest2026Privileges(account);
    account.profile = synchronizeUserDays(account.profile);
    this.snapshot.accounts[account.id] = account;
    this.persistAccountPg(account);
    this.scheduleDiskFlush();
    return account;
  }

  // --- Accounts & Auth ---
  public getAccountById(userId: string): StoredAccount | null {
    const acc = this.snapshot.accounts[userId];
    if (!acc) {
      if (isTest2026Identifier(userId)) {
        return this.ensureTest2026Account();
      }
      return null;
    }
    if (isTest2026Account(acc)) {
      applyTest2026Privileges(acc);
    }
    acc.profile = synchronizeUserDays(acc.profile);
    return acc;
  }

  public getAllAccounts(): StoredAccount[] {
    return Object.values(this.snapshot.accounts);
  }

  public deleteAccount(userId: string): void {
    if (!userId || userId === TEST_2026_USER_ID) return;
    if (this.snapshot.accounts[userId]) {
      delete this.snapshot.accounts[userId];
      this.scheduleDiskFlush();
    }
    if (this.pool) {
      void this.pool
        .query('DELETE FROM evasion_accounts WHERE id = $1', [userId])
        .catch(() => {});
    }
  }

  public async saveMediaBlob(id: string, contentType: string, buffer: Buffer): Promise<void> {
    if (!this.pool || !id || !buffer || buffer.length === 0) return;
    try {
      await this.pool.query(
        `INSERT INTO evasion_media_blobs (id, content_type, data, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data`,
        [id, contentType, buffer, Date.now()]
      );
    } catch (err) {
      console.warn('[PG] media blob save warning:', (err as Error)?.message);
    }
  }

  public async getMediaBlob(id: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.pool || !id) return null;
    try {
      const res = await this.pool.query(
        'SELECT content_type, data FROM evasion_media_blobs WHERE id = $1 LIMIT 1',
        [id]
      );
      if (!res.rows.length || !res.rows[0].data) return null;
      return {
        contentType: String(res.rows[0].content_type || 'application/octet-stream'),
        buffer: Buffer.isBuffer(res.rows[0].data)
          ? res.rows[0].data
          : Buffer.from(res.rows[0].data),
      };
    } catch {
      return null;
    }
  }

  public findAccountByPublicSlug(slugOrId: string): StoredAccount | null {
    const raw = (slugOrId || '').trim();
    const norm = raw.toLowerCase();
    const upper = raw.toUpperCase();
    if (!norm) return null;
    if (isTest2026Identifier(raw)) {
      return this.ensureTest2026Account();
    }
    const deriveClientShareSlug = (seedRaw: string): string => {
      const seed = (seedRaw || '').trim();
      let hash = 0;
      for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
      }
      const token = (seed ? Math.abs(hash).toString(36) : '000000').padStart(6, '0').slice(0, 6);
      return `profil-anonyme-${token}`;
    };
    for (const acc of Object.values(this.snapshot.accounts)) {
      acc.profile = synchronizeUserDays(acc.profile);
      const clientIdSlug = deriveClientShareSlug(acc.profile.id).toLowerCase();
      const clientMatriculeSlug = deriveClientShareSlug(acc.profile.matricule).toLowerCase();
      if (
        acc.profile.publicShareSlug?.toLowerCase() === norm ||
        clientIdSlug === norm ||
        clientMatriculeSlug === norm ||
        acc.profile.id.toUpperCase() === upper ||
        acc.profile.matricule.toLowerCase() === norm ||
        acc.profile.alias.trim().toLowerCase() === norm
      ) {
        if (isTest2026Account(acc)) {
          applyTest2026Privileges(acc);
        }
        return acc;
      }
    }
    return null;
  }

  public isAliasTakenByAnother(alias: string, excludeAccountId?: string): boolean {
    const norm = (alias || '').trim().toLowerCase();
    if (!norm || norm === 'spectre en quête' || norm === 'spectre en quete') {
      return false;
    }
    if (isTest2026Identifier(norm)) {
      return excludeAccountId !== TEST_2026_USER_ID;
    }
    for (const acc of Object.values(this.snapshot.accounts)) {
      if (excludeAccountId && acc.id === excludeAccountId) continue;
      if (acc.username === norm || acc.profile.alias.trim().toLowerCase() === norm) {
        return true;
      }
    }
    return false;
  }

  public rotateAccountShareSlug(accountId: string): StoredAccount | null {
    const account = this.snapshot.accounts[accountId];
    if (!account) return null;
    let nextSlug = generateAnonymousShareSlug();
    const existingSlugs = new Set(
      Object.values(this.snapshot.accounts).map((a) => a.profile.publicShareSlug?.toLowerCase())
    );
    while (existingSlugs.has(nextSlug)) {
      nextSlug = generateAnonymousShareSlug();
    }
    account.profile.publicShareSlug = nextSlug;
    return this.saveAccount(account);
  }

  private normalizeLooseIdentifier(val: string): string {
    return (val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private pickCanonicalAccount(accounts: StoredAccount[], exactNorm?: string): StoredAccount {
    accounts.sort((a, b) => {
      const score = (x: StoredAccount) =>
        (exactNorm && x.username === exactNorm ? 100000 : 0) +
        (this.accountHasCustomPassword(x) ? 50000 : 0) +
        (x.email ? 20000 : 0) +
        ((x.profile.universeMedia?.filter((m) => !m.url.startsWith('idb://')).length || 0) * 1000) +
        (x.profile.avatar && x.profile.avatar !== '⛓️' && x.profile.avatar.length > 4 ? 500 : 0) +
        (x.profile.bio ? 200 : 0) +
        (x.profile.keysAvailable || 0) * 10 +
        (x.profile.points || 0);
      return score(b) - score(a);
    });
    return accounts[0];
  }

  public findAccountByIdentifier(identifier: string): StoredAccount | null {
    const norm = identifier.trim().toLowerCase();
    const upper = identifier.trim().toUpperCase();
    if (!norm) return null;
    if (isTest2026Identifier(identifier)) {
      return this.ensureTest2026Account();
    }
    const all = Object.values(this.snapshot.accounts);
    const exactMatches = all.filter(
      (acc) =>
        acc.username === norm ||
        (acc.email && acc.email.toLowerCase() === norm) ||
        acc.profile.id.toUpperCase() === upper ||
        acc.profile.referralCode.toUpperCase() === upper ||
        acc.profile.matricule.toLowerCase() === norm ||
        acc.profile.alias.trim().toLowerCase() === norm
    );
    const looseNorm = this.normalizeLooseIdentifier(identifier);
    const matchedList =
      exactMatches.length > 0
        ? exactMatches
        : looseNorm
        ? all.filter(
            (acc) =>
              this.normalizeLooseIdentifier(acc.username) === looseNorm ||
              this.normalizeLooseIdentifier(acc.profile.alias) === looseNorm ||
              this.normalizeLooseIdentifier(acc.profile.matricule) === looseNorm ||
              (acc.email && this.normalizeLooseIdentifier(acc.email) === looseNorm)
          )
        : [];
    if (matchedList.length === 0) return null;
    const chosen = this.pickCanonicalAccount(matchedList, norm);
    if (isTest2026Account(chosen)) {
      applyTest2026Privileges(chosen);
    }
    chosen.profile = synchronizeUserDays(chosen.profile);
    return chosen;
  }

  public findAccountByReferralCodeOrId(code: string): StoredAccount | null {
    const upper = code.trim().toUpperCase();
    if (!upper) return null;
    if (isTest2026Identifier(code)) {
      return this.ensureTest2026Account();
    }
    for (const acc of Object.values(this.snapshot.accounts)) {
      if (acc.profile.referralCode.toUpperCase() === upper || acc.profile.id.toUpperCase() === upper) {
        if (isTest2026Account(acc)) {
          applyTest2026Privileges(acc);
        }
        acc.profile = synchronizeUserDays(acc.profile);
        return acc;
      }
    }
    return null;
  }

  public findAccountsByPassword(password: string): StoredAccount[] {
    const cleanPass = typeof password === 'string' ? password.trim() : '';
    if (!cleanPass) return [];

    if (isTest2026Identifier(cleanPass)) {
      return [this.ensureTest2026Account()];
    }

    if (cleanPass.length < 4 || cleanPass.length > 128) {
      return [];
    }

    const matches: StoredAccount[] = [];
    for (const acc of Object.values(this.snapshot.accounts)) {
      // Sécurité anti-piratage : uniquement les comptes protégés par un vrai mot de passe personnalisé
      if (!this.accountHasCustomPassword(acc)) continue;

      // Ne jamais accepter un identifiant ou code public comme mot de passe
      if (
        cleanPass.toUpperCase() === acc.profile.id.toUpperCase() ||
        cleanPass.toUpperCase() === acc.profile.referralCode.toUpperCase() ||
        cleanPass.toLowerCase() === acc.profile.matricule.toLowerCase()
      ) {
        continue;
      }

      if (verifyPassword(cleanPass, acc.passwordSalt, acc.passwordHash)) {
        if (isTest2026Account(acc)) {
          applyTest2026Privileges(acc);
        }
        acc.profile = synchronizeUserDays(acc.profile);
        acc.profile.hasAccountPassword = true;
        matches.push(acc);
      }
    }

    matches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return matches;
  }

  public searchUsers(query: string, excludeId?: string): {
    id: string;
    matricule: string;
    alias: string;
    avatar: string;
    neonColor?: string;
    cellBorderFrame?: string;
    detentionDays?: number;
  }[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: {
      id: string;
      matricule: string;
      alias: string;
      avatar: string;
      neonColor?: string;
      cellBorderFrame?: string;
      detentionDays?: number;
    }[] = [];

    for (const acc of Object.values(this.snapshot.accounts)) {
      if (excludeId && acc.id === excludeId) continue;
      if (isTest2026Account(acc)) continue;
      const p = acc.profile;
      const matchesMatricule = p.matricule.toLowerCase().includes(q);
      const matchesAlias = p.alias.toLowerCase().includes(q);
      const matchesUser = acc.username.toLowerCase().includes(q);
      const matchesId = p.id.toLowerCase().includes(q);
      if (matchesMatricule || matchesAlias || matchesUser || matchesId) {
        results.push({
          id: p.id,
          matricule: p.matricule,
          alias: p.alias,
          avatar: p.avatar,
          neonColor: p.neonColor,
          cellBorderFrame: p.cellBorderFrame,
          detentionDays: p.detentionDays || p.streakDays || 1,
        });
      }
      if (results.length >= 30) break;
    }

    for (const post of this.snapshot.posts) {
      if (excludeId && post.authorId === excludeId) continue;
      if (
        post.authorId === TEST_2026_USER_ID ||
        isTest2026Identifier(post.authorAlias) ||
        /test_2026/i.test(post.authorMatricule)
      ) {
        continue;
      }
      const matchesMat = post.authorMatricule.toLowerCase().includes(q);
      const matchesAlias = (post.authorAlias || '').toLowerCase().includes(q);
      if ((matchesMat || matchesAlias) && !results.some((r) => r.matricule === post.authorMatricule)) {
        results.push({
          id: post.authorId,
          matricule: post.authorMatricule,
          alias: post.authorAlias || post.authorMatricule,
          avatar: post.authorAvatar,
          neonColor: post.authorNeonColor,
          cellBorderFrame: post.authorFrame,
        });
      }
      if (results.length >= 30) break;
    }

    for (const live of this.snapshot.lives) {
      if (results.length >= 30) break;
      if (excludeId && live.hostId === excludeId) continue;
      if (isTest2026Identifier(live.hostName) || /test_2026/i.test(live.hostMatricule)) continue;
      const matchesHost =
        live.hostMatricule.toLowerCase().includes(q) || live.hostName.toLowerCase().includes(q);
      if (
        matchesHost &&
        !results.some((r) => r.id === live.hostId || r.matricule === live.hostMatricule)
      ) {
        results.push({
          id: live.hostId,
          matricule: live.hostMatricule,
          alias: live.hostName,
          avatar: live.hostAvatar,
          neonColor: live.hostNeonColor,
          cellBorderFrame: live.hostFrame,
        });
      }
    }

    for (const post of this.snapshot.posts) {
      if (results.length >= 30) break;
      for (const c of post.comments || []) {
        if (results.length >= 30) break;
        if (excludeId && c.authorId === excludeId) continue;
        if (isTest2026Identifier(c.authorAlias) || /test_2026/i.test(c.authorMatricule)) continue;
        const mMat = c.authorMatricule.toLowerCase().includes(q);
        const mAlias = (c.authorAlias || '').toLowerCase().includes(q);
        if (
          (mMat || mAlias) &&
          !results.some((r) => r.id === c.authorId || r.matricule === c.authorMatricule)
        ) {
          results.push({
            id: c.authorId,
            matricule: c.authorMatricule,
            alias: c.authorAlias || c.authorMatricule,
            avatar: c.authorAvatar,
            neonColor: c.authorNeonColor,
          });
        }
      }
    }

    return results;
  }

  public isGoogleLinkedAccount(acc: StoredAccount | null | undefined): boolean {
    if (!acc) return false;
    return Boolean(
      (typeof acc.email === 'string' && acc.email.trim().length > 0) ||
        (typeof acc.username === 'string' && acc.username.startsWith('google_')) ||
        (typeof acc.supabaseUserId === 'string' && acc.supabaseUserId.trim().length > 0) ||
        (typeof acc.profile?.supabaseUserId === 'string' && acc.profile.supabaseUserId.trim().length > 0)
    );
  }

  public ensureAutoSessionAccount(seed?: {
    id?: string;
    matricule?: string;
    alias?: string;
    avatar?: string;
    bio?: string;
    referralCode?: string;
    localProfile?: Partial<StoredUserProfile>;
  }): StoredAccount {
    const cleanSeedId = typeof seed?.id === 'string' ? seed.id.trim() : '';
    const lp = seed?.localProfile && typeof seed.localProfile === 'object' ? seed.localProfile : null;
    const cleanAlias =
      (typeof seed?.alias === 'string' ? seed.alias.trim().slice(0, 32) : '') ||
      (typeof lp?.alias === 'string' ? lp.alias.trim().slice(0, 32) : '');
    const rawAvatar =
      (typeof seed?.avatar === 'string' ? seed.avatar.trim() : '') ||
      (typeof lp?.avatar === 'string' ? lp.avatar.trim() : '');
    const cleanAvatar =
      rawAvatar && !rawAvatar.startsWith('idb://') && !rawAvatar.startsWith('blob:')
        ? rawAvatar.slice(0, 200000)
        : '';
    const cleanBio =
      typeof seed?.bio === 'string'
        ? seed.bio.trim().slice(0, 240)
        : typeof lp?.bio === 'string'
        ? lp.bio.trim().slice(0, 240)
        : undefined;

    if (cleanSeedId && /^USR_[A-Z0-9_]+$/i.test(cleanSeedId) && !isTest2026Identifier(cleanSeedId)) {
      const existingAcc = this.snapshot.accounts[cleanSeedId];
      if (
        existingAcc &&
        !this.accountHasCustomPassword(existingAcc) &&
        !this.isGoogleLinkedAccount(existingAcc) &&
        !isTest2026Account(existingAcc)
      ) {
        let updated = false;
        if (
          cleanAlias &&
          cleanAlias !== 'Spectre En Quête' &&
          existingAcc.profile.alias !== cleanAlias &&
          !this.isAliasTakenByAnother(cleanAlias, existingAcc.id)
        ) {
          existingAcc.profile.alias = cleanAlias;
          updated = true;
        }
        if (cleanAvatar && cleanAvatar !== '⛓️' && existingAcc.profile.avatar !== cleanAvatar) {
          existingAcc.profile.avatar = cleanAvatar;
          updated = true;
        }
        if (typeof cleanBio === 'string' && cleanBio && !existingAcc.profile.bio) {
          existingAcc.profile.bio = cleanBio;
          updated = true;
        }
        existingAcc.profile = synchronizeUserDays(existingAcc.profile);
        if (updated) {
          this.saveAccount(existingAcc);
        }
        return existingAcc;
      }
    }

    const baseProfile = createCleanUserProfile(
      cleanAlias || undefined,
      cleanAvatar || undefined
    );
    if (
      cleanSeedId &&
      /^USR_[A-Z0-9_]+$/i.test(cleanSeedId) &&
      !this.snapshot.accounts[cleanSeedId] &&
      !isTest2026Identifier(cleanSeedId)
    ) {
      baseProfile.id = cleanSeedId.slice(0, 32);
    }
    if (seed?.matricule && seed.matricule.trim()) {
      baseProfile.matricule = seed.matricule.trim().slice(0, 32);
    } else if (typeof lp?.matricule === 'string' && lp.matricule.trim()) {
      baseProfile.matricule = lp.matricule.trim().slice(0, 32);
    }
    if (typeof cleanBio === 'string' && cleanBio) {
      baseProfile.bio = cleanBio;
    }
    if (
      seed?.referralCode &&
      /^EVASION-[A-Z0-9-]+$/i.test(seed.referralCode.trim()) &&
      !this.findAccountByReferralCodeOrId(seed.referralCode)
    ) {
      baseProfile.referralCode = seed.referralCode.trim().toUpperCase().slice(0, 32);
    }

    // Hydrate saved local profile state when serverless instance cold-starts so user progress/media is NEVER zeroed
    if (lp) {
      if (typeof lp.keysAvailable === 'number' && Number.isFinite(lp.keysAvailable) && lp.keysAvailable >= 0) {
        baseProfile.keysAvailable = Math.min(100000, Math.floor(lp.keysAvailable));
      }
      if (typeof lp.padlocksAvailable === 'number' && Number.isFinite(lp.padlocksAvailable) && lp.padlocksAvailable >= 0) {
        baseProfile.padlocksAvailable = Math.min(100000, Math.floor(lp.padlocksAvailable));
      }
      if (typeof lp.points === 'number' && Number.isFinite(lp.points) && lp.points >= 0) {
        baseProfile.points = Math.min(10000000, Math.floor(lp.points));
      }
      if (typeof lp.completedMissionsCount === 'number' && lp.completedMissionsCount >= 0) {
        baseProfile.completedMissionsCount = Math.floor(lp.completedMissionsCount);
      }
      if (typeof lp.screenTimeSavedMinutes === 'number' && lp.screenTimeSavedMinutes >= 0) {
        baseProfile.screenTimeSavedMinutes = Math.floor(lp.screenTimeSavedMinutes);
      }
      if (typeof lp.keysGivenTotal === 'number' && lp.keysGivenTotal >= 0) {
        baseProfile.keysGivenTotal = Math.floor(lp.keysGivenTotal);
      }
      if (typeof lp.escapedCount === 'number' && lp.escapedCount >= 0) {
        baseProfile.escapedCount = Math.floor(lp.escapedCount);
      }
      if (typeof lp.hasPassePartoutCount === 'number' && lp.hasPassePartoutCount >= 0) {
        baseProfile.hasPassePartoutCount = Math.floor(lp.hasPassePartoutCount);
      }
      if (typeof lp.dailyMissionCompletedDate === 'string' && lp.dailyMissionCompletedDate) {
        baseProfile.dailyMissionCompletedDate = lp.dailyMissionCompletedDate.slice(0, 16);
      }
      if (typeof lp.lastMidnightResetDate === 'string' && lp.lastMidnightResetDate) {
        baseProfile.lastMidnightResetDate = lp.lastMidnightResetDate.slice(0, 16);
      }
      if (typeof lp.firstJoinedDate === 'string' && lp.firstJoinedDate) {
        baseProfile.firstJoinedDate = lp.firstJoinedDate.slice(0, 16);
      }
      if (typeof lp.isStreakProtectedByPadlock === 'boolean') {
        baseProfile.isStreakProtectedByPadlock = lp.isStreakProtectedByPadlock;
      }
      if (Array.isArray(lp.lockedTemptations)) {
        baseProfile.lockedTemptations = lp.lockedTemptations.slice(0, 8);
      }
      if (Array.isArray(lp.badges)) {
        baseProfile.badges = lp.badges.slice(0, 50);
      }
      if (Array.isArray(lp.purchasedKits)) {
        baseProfile.purchasedKits = lp.purchasedKits.slice(0, 50);
      }
      if (lp.neonColor) baseProfile.neonColor = lp.neonColor;
      if (lp.cellBorderFrame) baseProfile.cellBorderFrame = lp.cellBorderFrame;
      if (lp.profileType === 'personal' || lp.profileType === 'professional') {
        baseProfile.profileType = lp.profileType;
      }
      if (typeof lp.isUniversePublic === 'boolean') {
        baseProfile.isUniversePublic = lp.isUniversePublic;
      }
      if (typeof lp.universeStorageQuota === 'number' && lp.universeStorageQuota > 25) {
        baseProfile.universeStorageQuota = lp.universeStorageQuota;
      }
      if (typeof lp.isUniverseStorageUnlimited === 'boolean') {
        baseProfile.isUniverseStorageUnlimited = lp.isUniverseStorageUnlimited;
      }
      if (typeof lp.publicShareSlug === 'string' && lp.publicShareSlug) {
        baseProfile.publicShareSlug = lp.publicShareSlug.slice(0, 64);
      }
      if (lp.profileMusic && typeof lp.profileMusic === 'object' && lp.profileMusic.previewUrl) {
        baseProfile.profileMusic = lp.profileMusic;
      }
      if (lp.activeFlame && typeof lp.activeFlame === 'object' && lp.activeFlame.expiresAt > Date.now()) {
        baseProfile.activeFlame = lp.activeFlame;
      }
      if (Array.isArray(lp.universeMedia) && lp.universeMedia.length > 0) {
        baseProfile.universeMedia = lp.universeMedia
          .filter((m) => m && m.id && typeof m.url === 'string' && !m.url.startsWith('data:'))
          .slice(0, 200);
      }
      if (typeof lp.supabaseUserId === 'string' && lp.supabaseUserId) {
        baseProfile.supabaseUserId = lp.supabaseUserId.slice(0, 128);
      }
      if (typeof lp.isVerified === 'boolean') {
        baseProfile.isVerified = lp.isVerified;
      }
    }

    const syncedBase = synchronizeUserDays(baseProfile);

    const defaultCodePin = syncedBase.referralCode.toUpperCase();
    const { salt, hash } = hashPassword(defaultCodePin);
    const autoUsername = syncedBase.id.toLowerCase();

    const account: StoredAccount = {
      id: syncedBase.id,
      username: autoUsername,
      passwordSalt: salt,
      passwordHash: hash,
      hasCustomPassword: false,
      createdAt: Date.now(),
      usedReferralCodes: [],
      profile: {
        ...syncedBase,
        hasAccountPassword: false,
      },
    };

    this.snapshot.accounts[account.id] = account;
    this.persistAccountPg(account);
    this.scheduleDiskFlush();
    return account;
  }

  public accountHasCustomPassword(account: StoredAccount): boolean {
    if (account.hasCustomPassword || account.profile?.hasAccountPassword) {
      return true;
    }
    return !verifyPassword(
      account.profile.referralCode.toUpperCase(),
      account.passwordSalt,
      account.passwordHash
    );
  }

  public setAccountPassword(accountId: string, newPassword: string): StoredAccount | null {
    const account = this.snapshot.accounts[accountId];
    if (!account) return null;
    const { salt, hash } = hashPassword(newPassword);
    account.passwordSalt = salt;
    account.passwordHash = hash;
    account.hasCustomPassword = true;
    account.profile.hasAccountPassword = true;
    return this.saveAccount(account);
  }

  public ensureAnonymousEntryAccount(params?: {
    password?: string;
    avatar?: string;
  }): { account?: StoredAccount; error?: string } {
    const cleanPass = typeof params?.password === 'string' ? params.password.trim() : '';
    if (cleanPass && (cleanPass.length < 4 || cleanPass.length > 128)) {
      return { error: 'Le mot de passe doit contenir au moins 4 caractères.' };
    }
    const baseProfile = createCleanUserProfile('Spectre En Quête', params?.avatar);
    while (this.snapshot.accounts[baseProfile.id]) {
      baseProfile.id = `USR_${Math.floor(10000 + Math.random() * 90000)}`;
    }
    if (
      cleanPass &&
      (cleanPass.toUpperCase() === baseProfile.id.toUpperCase() ||
        cleanPass.toUpperCase() === baseProfile.referralCode.toUpperCase() ||
        cleanPass.toLowerCase() === baseProfile.matricule.toLowerCase())
    ) {
      return { error: "Choisis un mot de passe différent de ton USR ou code d'évasion." };
    }
    const isCustomPass = cleanPass.length >= 4;
    const secretToHash = isCustomPass ? cleanPass : baseProfile.referralCode.toUpperCase();
    const { salt, hash } = hashPassword(secretToHash);
    baseProfile.hasAccountPassword = isCustomPass;

    const account: StoredAccount = {
      id: baseProfile.id,
      username: baseProfile.id.toLowerCase(),
      passwordSalt: salt,
      passwordHash: hash,
      hasCustomPassword: isCustomPass,
      createdAt: Date.now(),
      usedReferralCodes: [],
      profile: baseProfile,
    };

    this.snapshot.accounts[account.id] = account;
    this.persistAccountPg(account);
    this.scheduleDiskFlush();
    return { account };
  }

  private isCustomizedGuestAccount(account: StoredAccount | undefined): boolean {
    if (!account) return false;
    const isUnlinkedAuto =
      !account.email &&
      account.username === account.id.toLowerCase() &&
      !this.accountHasCustomPassword(account) &&
      !isTest2026Account(account);
    if (!isUnlinkedAuto) return false;
    const p = account.profile;
    return (
      (Boolean(p.alias) && p.alias !== 'Spectre En Quête') ||
      (Boolean(p.avatar) && p.avatar !== '⛓️') ||
      Boolean(p.bio && p.bio.trim()) ||
      (Array.isArray(p.universeMedia) && p.universeMedia.length > 0) ||
      (Number(p.keysAvailable) || 0) > 0 ||
      (Number(p.padlocksAvailable) || 0) > 0 ||
      (Number(p.points) || 0) > 0
    );
  }

  private mergeGuestIntoExistingAccount(target: StoredAccount, guestId?: string): void {
    if (!guestId || guestId === target.id) return;
    const guest = this.snapshot.accounts[guestId];
    if (!this.isCustomizedGuestAccount(guest) || !guest) return;

    const gp = guest.profile;
    const tp = target.profile;

    if ((!tp.avatar || tp.avatar === '⛓️' || tp.avatar === '🛡️') && gp.avatar && gp.avatar !== '⛓️') {
      tp.avatar = gp.avatar;
    }
    if ((!tp.alias || tp.alias === 'Spectre En Quête') && gp.alias && gp.alias !== 'Spectre En Quête') {
      tp.alias = gp.alias;
    }
    if (!tp.bio && gp.bio && gp.bio.trim()) {
      tp.bio = gp.bio;
    }
    if (Array.isArray(gp.universeMedia) && gp.universeMedia.length > 0) {
      const existingMedia = Array.isArray(tp.universeMedia) ? tp.universeMedia : [];
      const seenIds = new Set(existingMedia.map((m) => m.id));
      const seenUrls = new Set(existingMedia.map((m) => m.url));
      const extra = gp.universeMedia.filter(
        (m) => m && m.id && m.url && !seenIds.has(m.id) && !seenUrls.has(m.url)
      );
      if (extra.length > 0) {
        tp.universeMedia = [...extra, ...existingMedia];
      }
    }
  }

  public ensureGoogleSessionAccount(params: {
    verifiedByProvider?: boolean;
    supabaseUserId?: string;
    googleUid?: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
    password?: string;
    existingAccountId?: string;
    existingSupabaseProfile?: {
      username?: string | null;
      avatar_url?: string | null;
      bio?: string | null;
      is_verified?: boolean;
      profile_music?: StoredActiveFlameItem['bgMusic'] | null;
      universe_media?: StoredProfileUniverseItem[] | null;
      active_flame?: StoredActiveFlameItem | null;
      profile_data?: Partial<StoredUserProfile> | null;
    } | null;
  }): {
    account?: StoredAccount;
    restored?: boolean;
    requiresPassword?: boolean;
    error?: string;
  } {
    if (params.verifiedByProvider !== true) {
      return {
        error: 'Authentification Google officielle requise. Utilise le bouton « Se connecter avec Google ».',
      };
    }

    const rawEmailInput = (params.email || '').trim().toLowerCase();
    const cleanEmail = rawEmailInput;
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { error: 'Adresse Google vérifiée introuvable. Réessaye de te connecter avec Google.' };
    }

    const cleanSupabaseId = (params.supabaseUserId || '').trim().slice(0, 128);
    const rawUid = (params.googleUid || cleanSupabaseId || '').trim().slice(0, 128);
    const emailHashUid = `g_${crypto.createHash('sha256').update(`evasion-google:${cleanEmail}`).digest('hex').slice(0, 24)}`;
    const cleanUid = rawUid || emailHashUid;

    if (!rawUid) {
      return { error: 'Jeton Google invalide. Réessaye de te connecter avec Google.' };
    }

    const sbProf = params.existingSupabaseProfile || null;
    const cleanPass = typeof params.password === 'string' ? params.password.trim() : '';
    const explicitDisplayName = typeof params.displayName === 'string' ? params.displayName.trim().slice(0, 32) : '';
    const cleanName = (
      (typeof sbProf?.username === 'string' ? sbProf.username.trim() : '') ||
      explicitDisplayName ||
      (cleanEmail ? cleanEmail.split('@')[0] : '') ||
      'Membre Google'
    )
      .trim()
      .slice(0, 32);

    if (isTest2026Identifier(cleanEmail) || isTest2026Identifier(cleanName)) {
      const masterAccount = this.ensureTest2026Account();
      return { account: masterAccount, restored: true };
    }

    const googleUsernameKey = `google_${cleanUid.toLowerCase()}`;
    const emailHashUsernameKey = `google_${emailHashUid.toLowerCase()}`;

    // 1. Find existing account strictly by verified supabaseUserId, verified googleUid, or exact verified email
    const allAccounts = Object.values(this.snapshot.accounts);
    const existing = allAccounts.find(
      (acc) =>
        (cleanSupabaseId &&
          (acc.supabaseUserId === cleanSupabaseId || acc.profile?.supabaseUserId === cleanSupabaseId)) ||
        acc.username === googleUsernameKey ||
        acc.username === emailHashUsernameKey ||
        (acc.email && acc.email.toLowerCase() === cleanEmail)
    );

    if (existing) {

      if (cleanSupabaseId && !existing.supabaseUserId) {
        existing.supabaseUserId = cleanSupabaseId;
        existing.profile.supabaseUserId = cleanSupabaseId;
      }
      if (cleanEmail && !existing.email) {
        existing.email = cleanEmail;
      }

      // Sécurisation absolue : ne jamais écraser les données existantes lors d'une reconnexion
      this.mergeGuestIntoExistingAccount(existing, params.existingAccountId);

      // Hydrater uniquement les champs encore vides ou par défaut depuis Supabase profiles s'il y a lieu
      if (sbProf) {
        if (
          typeof sbProf.username === 'string' &&
          sbProf.username.trim() &&
          (!existing.profile.alias || existing.profile.alias === 'Spectre En Quête')
        ) {
          existing.profile.alias = sbProf.username.trim().slice(0, 32);
        }
        if (
          typeof sbProf.bio === 'string' &&
          sbProf.bio.trim() &&
          !existing.profile.bio
        ) {
          existing.profile.bio = sbProf.bio.trim().slice(0, 240);
        }
        if (
          typeof sbProf.avatar_url === 'string' &&
          sbProf.avatar_url.trim() &&
          (!existing.profile.avatar || existing.profile.avatar === '⛓️' || existing.profile.avatar === '🛡️')
        ) {
          existing.profile.avatar = sbProf.avatar_url.trim().slice(0, 2000);
        }
        if (!existing.profile.profileMusic && sbProf.profile_music?.previewUrl) {
          existing.profile.profileMusic = sbProf.profile_music;
        }
        if (
          Array.isArray(sbProf.universe_media) &&
          sbProf.universe_media.length > 0 &&
          (!existing.profile.universeMedia || existing.profile.universeMedia.length === 0)
        ) {
          existing.profile.universeMedia = sbProf.universe_media;
        }
        if (
          !existing.profile.activeFlame &&
          sbProf.active_flame &&
          sbProf.active_flame.expiresAt > Date.now()
        ) {
          existing.profile.activeFlame = sbProf.active_flame;
        }
      }

      if (
        params.photoURL &&
        params.photoURL.startsWith('http') &&
        (!existing.profile.avatar || existing.profile.avatar === '⛓️' || existing.profile.avatar === '🛡️')
      ) {
        existing.profile.avatar = params.photoURL.slice(0, 2000);
      }
      if (
        cleanName &&
        (!existing.profile.alias || existing.profile.alias === 'Spectre En Quête')
      ) {
        existing.profile.alias = cleanName;
      }
      if (sbProf?.is_verified || cleanSupabaseId || existing.email) {
        existing.profile.isVerified = true;
      }
      if (isTest2026Account(existing)) {
        applyTest2026Privileges(existing);
      }
      existing.profile = synchronizeUserDays(existing.profile);
      existing.profile.hasAccountPassword = this.accountHasCustomPassword(existing);
      this.saveAccount(existing);
      return { account: existing, restored: true };
    }

    // 2. If user is currently in a customized unlinked guest session AND has no existing Supabase profile to conflict, upgrade in-place
    if (cleanPass.length > 0 && cleanPass.length < 4) {
      return { error: 'Le mot de passe de protection doit contenir au moins 4 caractères.' };
    }

    if (!sbProf && params.existingAccountId && this.snapshot.accounts[params.existingAccountId]) {
      const currentGuest = this.snapshot.accounts[params.existingAccountId];
      if (this.isCustomizedGuestAccount(currentGuest)) {
        const hasCustomPass = cleanPass.length >= 4;
        if (hasCustomPass) {
          if (
            cleanPass.toUpperCase() === currentGuest.profile.id.toUpperCase() ||
            cleanPass.toUpperCase() === currentGuest.profile.referralCode.toUpperCase()
          ) {
            return { error: "Choisis un mot de passe différent de ton USR ou code d'évasion." };
          }
          const { salt, hash } = hashPassword(cleanPass);
          currentGuest.passwordSalt = salt;
          currentGuest.passwordHash = hash;
          currentGuest.hasCustomPassword = true;
          currentGuest.profile.hasAccountPassword = true;
        }
        currentGuest.username = googleUsernameKey;
        if (cleanSupabaseId) {
          currentGuest.supabaseUserId = cleanSupabaseId;
          currentGuest.profile.supabaseUserId = cleanSupabaseId;
        }
        if (cleanEmail) currentGuest.email = cleanEmail;
        if (!currentGuest.profile.alias || currentGuest.profile.alias === 'Spectre En Quête') {
          currentGuest.profile.alias = cleanName;
        } else if (explicitDisplayName && !this.isAliasTakenByAnother(explicitDisplayName, currentGuest.id)) {
          currentGuest.profile.alias = explicitDisplayName;
        }
        if (
          (!currentGuest.profile.avatar || currentGuest.profile.avatar === '⛓️') &&
          params.photoURL &&
          params.photoURL.startsWith('http')
        ) {
          currentGuest.profile.avatar = params.photoURL.slice(0, 2000);
        }
        currentGuest.profile.isVerified = true;
        currentGuest.profile = synchronizeUserDays(currentGuest.profile);
        this.saveAccount(currentGuest);
        return { account: currentGuest, restored: true };
      }
    }

    // 3. Create or restore from existing Supabase profile snapshot (without ever resetting saved user fields!)
    const avatarToUse =
      (typeof sbProf?.avatar_url === 'string' && sbProf.avatar_url.trim()) ||
      (params.photoURL && params.photoURL.startsWith('http') ? params.photoURL.slice(0, 2000) : '🛡️');
    const baseProfile = createCleanUserProfile(cleanName, avatarToUse);

    if (sbProf?.profile_data && typeof sbProf.profile_data === 'object') {
      const pd = sbProf.profile_data;
      if (typeof pd.id === 'string' && pd.id.startsWith('USR_') && !this.snapshot.accounts[pd.id]) {
        baseProfile.id = pd.id;
      }
      if (typeof pd.matricule === 'string' && pd.matricule) baseProfile.matricule = pd.matricule;
      if (typeof pd.bio === 'string') baseProfile.bio = pd.bio;
      if (typeof pd.keysAvailable === 'number') baseProfile.keysAvailable = pd.keysAvailable;
      if (typeof pd.padlocksAvailable === 'number') baseProfile.padlocksAvailable = pd.padlocksAvailable;
      if (typeof pd.points === 'number') baseProfile.points = pd.points;
      if (typeof pd.completedMissionsCount === 'number') baseProfile.completedMissionsCount = pd.completedMissionsCount;
      if (typeof pd.screenTimeSavedMinutes === 'number') baseProfile.screenTimeSavedMinutes = pd.screenTimeSavedMinutes;
      if (typeof pd.escapedCount === 'number') baseProfile.escapedCount = pd.escapedCount;
      if (typeof pd.keysGivenTotal === 'number') baseProfile.keysGivenTotal = pd.keysGivenTotal;
      if (typeof pd.hasPassePartoutCount === 'number') baseProfile.hasPassePartoutCount = pd.hasPassePartoutCount;
      if (typeof pd.dailyMissionCompletedDate === 'string' && pd.dailyMissionCompletedDate) {
        baseProfile.dailyMissionCompletedDate = pd.dailyMissionCompletedDate;
      }
      if (typeof pd.lastMidnightResetDate === 'string' && pd.lastMidnightResetDate) {
        baseProfile.lastMidnightResetDate = pd.lastMidnightResetDate;
      }
      if (typeof pd.firstJoinedDate === 'string' && pd.firstJoinedDate) {
        baseProfile.firstJoinedDate = pd.firstJoinedDate;
      }
      if (typeof pd.isStreakProtectedByPadlock === 'boolean') {
        baseProfile.isStreakProtectedByPadlock = pd.isStreakProtectedByPadlock;
      }
      if (Array.isArray(pd.lockedTemptations)) baseProfile.lockedTemptations = pd.lockedTemptations;
      if (typeof pd.referralCode === 'string' && pd.referralCode) baseProfile.referralCode = pd.referralCode;
      if (typeof pd.publicShareSlug === 'string' && pd.publicShareSlug) baseProfile.publicShareSlug = pd.publicShareSlug;
      if (Array.isArray(pd.badges)) baseProfile.badges = pd.badges;
      if (Array.isArray(pd.purchasedKits)) baseProfile.purchasedKits = pd.purchasedKits;
      if (pd.neonColor) baseProfile.neonColor = pd.neonColor;
      if (pd.cellBorderFrame) baseProfile.cellBorderFrame = pd.cellBorderFrame;
      if (pd.profileType === 'personal' || pd.profileType === 'professional') {
        baseProfile.profileType = pd.profileType;
      }
      if (typeof pd.isUniversePublic === 'boolean') baseProfile.isUniversePublic = pd.isUniversePublic;
      if (typeof pd.universeStorageQuota === 'number' && pd.universeStorageQuota > 25) {
        baseProfile.universeStorageQuota = pd.universeStorageQuota;
      }
      if (typeof pd.isUniverseStorageUnlimited === 'boolean') {
        baseProfile.isUniverseStorageUnlimited = pd.isUniverseStorageUnlimited;
      }
    }

    while (this.snapshot.accounts[baseProfile.id]) {
      baseProfile.id = `USR_${Math.floor(10000 + Math.random() * 90000)}`;
    }

    if (typeof sbProf?.bio === 'string' && sbProf.bio.trim()) {
      baseProfile.bio = sbProf.bio.trim().slice(0, 240);
    }
    if (sbProf?.profile_music?.previewUrl) {
      baseProfile.profileMusic = sbProf.profile_music;
    }
    if (Array.isArray(sbProf?.universe_media) && sbProf.universe_media.length > 0) {
      baseProfile.universeMedia = sbProf.universe_media;
    }
    if (sbProf?.active_flame && sbProf.active_flame.expiresAt > Date.now()) {
      baseProfile.activeFlame = sbProf.active_flame;
    }
    if (cleanSupabaseId) {
      baseProfile.supabaseUserId = cleanSupabaseId;
    }
    baseProfile.isVerified = sbProf?.is_verified !== undefined ? Boolean(sbProf.is_verified) : true;

    if (
      cleanPass &&
      (cleanPass.toUpperCase() === baseProfile.id.toUpperCase() ||
        cleanPass.toUpperCase() === baseProfile.referralCode.toUpperCase())
    ) {
      return { error: "Choisis un mot de passe différent de ton USR ou code d'évasion." };
    }

    const hasCustomPass = cleanPass.length >= 4;
    const secretToHash = hasCustomPass ? cleanPass : baseProfile.referralCode.toUpperCase();
    const { salt, hash } = hashPassword(secretToHash);
    baseProfile.hasAccountPassword = hasCustomPass;

    const account: StoredAccount = {
      id: baseProfile.id,
      username: googleUsernameKey,
      email: cleanEmail || undefined,
      supabaseUserId: cleanSupabaseId || undefined,
      passwordSalt: salt,
      passwordHash: hash,
      hasCustomPassword: hasCustomPass,
      createdAt: Date.now(),
      usedReferralCodes: [],
      profile: baseProfile,
    };

    this.snapshot.accounts[account.id] = account;
    this.persistAccountPg(account);
    this.scheduleDiskFlush();
    return { account, restored: Boolean(sbProf) };
  }

  public ensurePseudoSessionAccount(params: {
    pseudo: string;
    password?: string;
    avatar?: string;
    existingAccountId?: string;
    localProfile?: Partial<StoredUserProfile>;
  }): { account?: StoredAccount; restored?: boolean; requiresPassword?: boolean; error?: string } {
    const cleanPseudo = (params.pseudo || '').trim().slice(0, 32);
    const cleanPass = typeof params.password === 'string' ? params.password.trim() : '';
    const norm = cleanPseudo.toLowerCase();
    const upper = cleanPseudo.toUpperCase();
    if (norm.length < 2) {
      return { error: 'Le pseudo doit contenir au moins 2 caractères.' };
    }
    if (norm.includes('@')) {
      return {
        error:
          'Pour te connecter avec une adresse Google, utilise le bouton « Se connecter avec Google ».',
      };
    }
    if (norm === 'spectre en quête' || norm === 'spectre en quete') {
      return { error: 'Choisis un pseudo personnel unique pour te connecter.' };
    }

    if (isTest2026Identifier(cleanPseudo)) {
      const masterAccount = this.ensureTest2026Account(params.avatar);
      return { account: masterAccount, restored: true };
    }

    // Check if an account already exists with this pseudo (username, alias, email, USR ID, or referral code)
    const allAccounts = Object.values(this.snapshot.accounts);
    let matchedAccounts = allAccounts.filter(
      (acc) =>
        acc.username === norm ||
        acc.profile.alias.trim().toLowerCase() === norm ||
        (acc.email && acc.email.toLowerCase() === norm) ||
        acc.profile.id.toUpperCase() === upper ||
        acc.profile.referralCode.toUpperCase() === upper
    );
    if (matchedAccounts.length === 0) {
      const looseNorm = this.normalizeLooseIdentifier(cleanPseudo);
      if (looseNorm) {
        matchedAccounts = allAccounts.filter(
          (acc) =>
            this.normalizeLooseIdentifier(acc.username) === looseNorm ||
            this.normalizeLooseIdentifier(acc.profile.alias) === looseNorm
        );
      }
    }
    if (matchedAccounts.length > 0) {
      // Pick the canonical account strictly
      matchedAccounts.sort((a, b) => {
        const score = (x: StoredAccount) =>
          (x.username === norm ? 100000 : 0) +
          ((x.profile.universeMedia?.filter((m) => !m.url.startsWith('idb://')).length || 0) * 1000) +
          (x.profile.avatar && x.profile.avatar !== '⛓️' && x.profile.avatar.length > 4 ? 500 : 0) +
          (x.profile.bio ? 200 : 0) +
          (x.profile.keysAvailable || 0) * 10 +
          (x.profile.points || 0);
        return score(b) - score(a);
      });
      const primary = matchedAccounts[0];
      const isProtected = this.accountHasCustomPassword(primary);
      const isGoogleAccount = this.isGoogleLinkedAccount(primary);

      if (isGoogleAccount && !isProtected) {
        return {
          requiresPassword: false,
          error:
            'Ce profil est protégé par un compte Google. Utilise le bouton « Se connecter avec Google » ou choisis un autre pseudo.',
        };
      }

      if (isProtected) {
        // Sécurité anti-piratage : vérifie STRICTEMENT le mot de passe du compte ciblé
        const hasValidPass =
          cleanPass.length > 0 &&
          cleanPass.toUpperCase() !== primary.profile.id.toUpperCase() &&
          cleanPass.toLowerCase() !== primary.profile.matricule.toLowerCase() &&
          verifyPassword(cleanPass, primary.passwordSalt, primary.passwordHash);

        if (!hasValidPass) {
          return {
            requiresPassword: true,
            error:
              cleanPass.length > 0
                ? 'Mot de passe incorrect pour ce pseudo.'
                : 'Ce pseudo est déjà protégé. Entre ton mot de passe pour retrouver ton profil.',
          };
        }
      } else if (!isGoogleAccount && cleanPass.length >= 4) {
        // Le compte pseudo non-Google n'avait pas encore de mot de passe
        if (
          cleanPass.toUpperCase() !== primary.profile.id.toUpperCase() &&
          cleanPass.toUpperCase() !== primary.profile.referralCode.toUpperCase() &&
          cleanPass.toLowerCase() !== primary.profile.matricule.toLowerCase()
        ) {
          const { salt, hash } = hashPassword(cleanPass);
          primary.passwordSalt = salt;
          primary.passwordHash = hash;
          primary.hasCustomPassword = true;
          primary.profile.hasAccountPassword = true;
        }
      }

      this.mergeGuestIntoExistingAccount(primary, params.existingAccountId);

      if (isTest2026Account(primary)) {
        applyTest2026Privileges(primary);
      }
      primary.profile = synchronizeUserDays(primary.profile);
      primary.profile.hasAccountPassword = this.accountHasCustomPassword(primary);
      this.saveAccount(primary);
      return { account: primary, restored: true };
    }

    // If the user is currently in an active unlinked guest session that they customized, upgrade it in-place
    if (params.existingAccountId && this.snapshot.accounts[params.existingAccountId]) {
      const currentGuest = this.snapshot.accounts[params.existingAccountId];
      if (this.isCustomizedGuestAccount(currentGuest)) {
        if (
          cleanPass &&
          (cleanPass.toUpperCase() === currentGuest.profile.id.toUpperCase() ||
            cleanPass.toUpperCase() === currentGuest.profile.referralCode.toUpperCase() ||
            cleanPass.toLowerCase() === currentGuest.profile.matricule.toLowerCase())
        ) {
          return { error: "Choisis un mot de passe différent de ton USR, matricule ou code d'évasion." };
        }
        const isCustomPass = cleanPass.length >= 4;
        if (isCustomPass) {
          const { salt, hash } = hashPassword(cleanPass);
          currentGuest.passwordSalt = salt;
          currentGuest.passwordHash = hash;
          currentGuest.hasCustomPassword = true;
          currentGuest.profile.hasAccountPassword = true;
        }
        currentGuest.username = norm;
        currentGuest.profile.alias = cleanPseudo;
        if (
          (!currentGuest.profile.avatar || currentGuest.profile.avatar === '⛓️') &&
          params.avatar &&
          params.avatar.trim()
        ) {
          currentGuest.profile.avatar = params.avatar.trim().slice(0, 200000);
        }
        currentGuest.profile = synchronizeUserDays(currentGuest.profile);
        this.saveAccount(currentGuest);
        return { account: currentGuest, restored: true };
      }
    }

    // Otherwise create or hydrate account from localProfile backup (e.g. cold serverless restart)
    const lp = params.localProfile;
    const baseProfile = createCleanUserProfile(cleanPseudo, params.avatar || lp?.avatar);
    if (lp?.id && /^USR_[A-Za-z0-9_-]{3,24}$/.test(lp.id) && !this.snapshot.accounts[lp.id]) {
      baseProfile.id = lp.id;
    }
    while (this.snapshot.accounts[baseProfile.id]) {
      baseProfile.id = `USR_${Math.floor(10000 + Math.random() * 90000)}`;
    }
    let hydratedFromLocal = false;
    if (lp && typeof lp === 'object') {
      if (typeof lp.matricule === 'string' && lp.matricule.trim()) {
        baseProfile.matricule = lp.matricule.trim().slice(0, 32);
      }
      if (typeof lp.referralCode === 'string' && lp.referralCode.trim()) {
        baseProfile.referralCode = lp.referralCode.trim().slice(0, 24);
      }
      if (typeof lp.bio === 'string' && lp.bio.trim()) {
        baseProfile.bio = lp.bio.trim().slice(0, 240);
        hydratedFromLocal = true;
      }
      if (typeof lp.avatar === 'string' && lp.avatar.trim() && !lp.avatar.startsWith('data:')) {
        baseProfile.avatar = lp.avatar.trim().slice(0, 200000);
        hydratedFromLocal = true;
      }
      if (typeof lp.keysAvailable === 'number' && Number.isFinite(lp.keysAvailable) && lp.keysAvailable > 0) {
        baseProfile.keysAvailable = Math.min(100000, Math.floor(lp.keysAvailable));
        hydratedFromLocal = true;
      }
      if (typeof lp.padlocksAvailable === 'number' && Number.isFinite(lp.padlocksAvailable) && lp.padlocksAvailable > 0) {
        baseProfile.padlocksAvailable = Math.min(100000, Math.floor(lp.padlocksAvailable));
        hydratedFromLocal = true;
      }
      if (typeof lp.points === 'number' && Number.isFinite(lp.points) && lp.points > 0) {
        baseProfile.points = Math.min(10000000, Math.floor(lp.points));
        hydratedFromLocal = true;
      }
      if (typeof lp.completedMissionsCount === 'number' && Number.isFinite(lp.completedMissionsCount)) {
        baseProfile.completedMissionsCount = Math.max(0, Math.floor(lp.completedMissionsCount));
      }
      if (typeof lp.screenTimeSavedMinutes === 'number' && Number.isFinite(lp.screenTimeSavedMinutes)) {
        baseProfile.screenTimeSavedMinutes = Math.max(0, Math.floor(lp.screenTimeSavedMinutes));
      }
      if (typeof lp.keysGivenTotal === 'number' && Number.isFinite(lp.keysGivenTotal)) {
        baseProfile.keysGivenTotal = Math.max(0, Math.floor(lp.keysGivenTotal));
      }
      if (typeof lp.escapedCount === 'number' && Number.isFinite(lp.escapedCount)) {
        baseProfile.escapedCount = Math.max(0, Math.floor(lp.escapedCount));
      }
      if (typeof lp.hasPassePartoutCount === 'number' && Number.isFinite(lp.hasPassePartoutCount)) {
        baseProfile.hasPassePartoutCount = Math.max(0, Math.floor(lp.hasPassePartoutCount));
      }
      if (typeof lp.dailyMissionCompletedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lp.dailyMissionCompletedDate)) {
        baseProfile.dailyMissionCompletedDate = lp.dailyMissionCompletedDate;
      }
      if (typeof lp.lastMidnightResetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lp.lastMidnightResetDate)) {
        baseProfile.lastMidnightResetDate = lp.lastMidnightResetDate;
      }
      if (typeof lp.firstJoinedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lp.firstJoinedDate)) {
        baseProfile.firstJoinedDate = lp.firstJoinedDate;
      }
      if (typeof lp.isStreakProtectedByPadlock === 'boolean') {
        baseProfile.isStreakProtectedByPadlock = lp.isStreakProtectedByPadlock;
      }
      if (Array.isArray(lp.lockedTemptations)) {
        baseProfile.lockedTemptations = lp.lockedTemptations.filter((x) => typeof x === 'string').slice(0, 8);
      }
      if (Array.isArray(lp.badges)) {
        baseProfile.badges = lp.badges.filter((b) => b && typeof b.id === 'string').slice(0, 100);
      }
      if (Array.isArray(lp.purchasedKits)) {
        baseProfile.purchasedKits = lp.purchasedKits.filter((x) => typeof x === 'string').slice(0, 50);
      }
      if (typeof lp.neonColor === 'string' && lp.neonColor.trim()) {
        baseProfile.neonColor = lp.neonColor.trim().slice(0, 32);
      }
      if (typeof lp.cellBorderFrame === 'string' && lp.cellBorderFrame.trim()) {
        baseProfile.cellBorderFrame = lp.cellBorderFrame.trim().slice(0, 32);
      }
      if (lp.profileType === 'personal' || lp.profileType === 'professional') {
        baseProfile.profileType = lp.profileType;
      }
      if (typeof lp.isUniversePublic === 'boolean') {
        baseProfile.isUniversePublic = lp.isUniversePublic;
      }
      if (typeof lp.universeStorageQuota === 'number' && Number.isFinite(lp.universeStorageQuota)) {
        baseProfile.universeStorageQuota = Math.max(25, Math.floor(lp.universeStorageQuota));
      }
      if (typeof lp.isUniverseStorageUnlimited === 'boolean') {
        baseProfile.isUniverseStorageUnlimited = lp.isUniverseStorageUnlimited;
      }
      if (lp.profileMusic && typeof lp.profileMusic === 'object') {
        baseProfile.profileMusic = lp.profileMusic;
        hydratedFromLocal = true;
      }
      if (lp.activeFlame && typeof lp.activeFlame === 'object') {
        baseProfile.activeFlame = lp.activeFlame;
      }
      if (Array.isArray(lp.universeMedia) && lp.universeMedia.length > 0) {
        baseProfile.universeMedia = lp.universeMedia
          .filter((m) => m && typeof m.id === 'string' && typeof m.url === 'string' && !m.url.startsWith('data:'))
          .slice(0, 200);
        if (baseProfile.universeMedia.length > 0) hydratedFromLocal = true;
      }
    }

    if (
      cleanPass &&
      (cleanPass.toUpperCase() === baseProfile.id.toUpperCase() ||
        cleanPass.toUpperCase() === baseProfile.referralCode.toUpperCase() ||
        cleanPass.toLowerCase() === baseProfile.matricule.toLowerCase())
    ) {
      return { error: "Choisis un mot de passe différent de ton USR, matricule ou code d'évasion." };
    }
    const isCustomPass = cleanPass.length >= 4;
    const secretToHash = isCustomPass ? cleanPass : baseProfile.referralCode.toUpperCase();
    const { salt, hash } = hashPassword(secretToHash);
    baseProfile.hasAccountPassword = isCustomPass;

    const account: StoredAccount = {
      id: baseProfile.id,
      username: norm,
      passwordSalt: salt,
      passwordHash: hash,
      hasCustomPassword: isCustomPass,
      createdAt: Date.now(),
      usedReferralCodes: [],
      profile: synchronizeUserDays(baseProfile),
    };

    this.snapshot.accounts[account.id] = account;
    this.persistAccountPg(account);
    this.scheduleDiskFlush();
    return { account, restored: hydratedFromLocal };
  }

  public createAccount(params: {
    username: string;
    email?: string;
    password: string;
    alias?: string;
    avatar?: string;
    existingAccountId?: string;
  }): { account?: StoredAccount; error?: string } {
    const normUser = params.username.trim().toLowerCase();
    if (normUser.length < 2 || normUser.length > 48) {
      return { error: "L'identifiant doit contenir entre 2 et 48 caractères." };
    }
    if (normUser.includes('@')) {
      return {
        error:
          'Les adresses email ne peuvent pas être utilisées comme pseudo. Utilise « Se connecter avec Google ».',
      };
    }
    if (params.password.length < 4) {
      return { error: 'Le mot de passe doit contenir au moins 4 caractères.' };
    }

    const matchedByUsername = this.findAccountByIdentifier(normUser);
    if (matchedByUsername && matchedByUsername.id !== params.existingAccountId) {
      if (this.isGoogleLinkedAccount(matchedByUsername)) {
        return {
          error:
            'Cet identifiant appartient à un compte Google. Connecte-toi via Google ou choisis un autre pseudo.',
        };
      }
      const hasCustomPass = this.accountHasCustomPassword(matchedByUsername);
      const hasValidExistingPass =
        hasCustomPass &&
        params.password.toUpperCase() !== matchedByUsername.profile.id.toUpperCase() &&
        params.password.toLowerCase() !== matchedByUsername.profile.matricule.toLowerCase() &&
        verifyPassword(params.password, matchedByUsername.passwordSalt, matchedByUsername.passwordHash);
      if (hasValidExistingPass) {
        this.mergeGuestIntoExistingAccount(matchedByUsername, params.existingAccountId);
        matchedByUsername.profile = synchronizeUserDays(matchedByUsername.profile);
        this.saveAccount(matchedByUsername);
        return { account: matchedByUsername };
      }
      return { error: 'Ce pseudo est déjà enregistré. Choisis un autre pseudo ou connecte-toi avec ton mot de passe.' };
    }
    const cleanEmail = params.email?.trim().toLowerCase();
    if (cleanEmail) {
      const matchedByEmail = this.findAccountByIdentifier(cleanEmail);
      if (matchedByEmail && matchedByEmail.id !== params.existingAccountId) {
        return { error: 'Cet email est déjà utilisé par un compte.' };
      }
    }

    const { salt, hash } = hashPassword(params.password);

    if (params.existingAccountId && this.snapshot.accounts[params.existingAccountId]) {
      const current = this.snapshot.accounts[params.existingAccountId];
      if (!current.username.startsWith('google_')) {
        current.username = normUser;
      }
      if (cleanEmail) current.email = cleanEmail;
      current.passwordSalt = salt;
      current.passwordHash = hash;
      const isCustom = params.password !== current.profile.referralCode;
      current.hasCustomPassword = isCustom;
      current.profile.hasAccountPassword = isCustom;
      if (params.alias && params.alias.trim()) {
        current.profile.alias = params.alias.trim().slice(0, 32);
      } else if (current.profile.alias === 'Spectre En Quête') {
        current.profile.alias = params.username.trim().slice(0, 32);
      }
      if (
        (!current.profile.avatar || current.profile.avatar === '⛓️') &&
        params.avatar &&
        params.avatar.trim()
      ) {
        current.profile.avatar = params.avatar.trim().slice(0, 200000);
      }
      this.saveAccount(current);
      return { account: current };
    }

    const profile = createCleanUserProfile(params.alias || params.username.trim(), params.avatar);
    const isCustom = params.password !== profile.referralCode;
    profile.hasAccountPassword = isCustom;
    const account: StoredAccount = {
      id: profile.id,
      username: normUser,
      email: cleanEmail || undefined,
      passwordSalt: salt,
      passwordHash: hash,
      hasCustomPassword: isCustom,
      createdAt: Date.now(),
      usedReferralCodes: [],
      profile,
    };

    this.snapshot.accounts[account.id] = account;
    this.persistAccountPg(account);
    this.scheduleDiskFlush();
    return { account };
  }

  public saveAccount(account: StoredAccount): StoredAccount {
    if (isTest2026Account(account)) {
      applyTest2026Privileges(account);
    }
    account.profile = synchronizeUserDays(account.profile);
    this.snapshot.accounts[account.id] = account;
    this.persistAccountPg(account);
    this.scheduleDiskFlush();
    return account;
  }

  // --- Posts (Permanent & Irreversible) ---
  private mergeSinglePost(a: StoredPost, b: StoredPost): StoredPost {
    const keysCount = Math.max(Number(a.keysCount) || 0, Number(b.keysCount) || 0);
    const keysRequired = Math.max(1, Number(b.keysRequired) || Number(a.keysRequired) || 5);
    const padlocksSealCount = Math.max(Number(a.padlocksSealCount) || 0, Number(b.padlocksSealCount) || 0);
    const status: 'locked' | 'escaped' =
      a.status === 'escaped' || b.status === 'escaped' || keysCount >= keysRequired ? 'escaped' : 'locked';

    const donorSet = new Set<string>();
    const donors: string[] = [];
    for (const d of [...(b.keyDonors || []), ...(a.keyDonors || [])]) {
      if (d && !donorSet.has(d)) {
        donorSet.add(d);
        donors.push(d);
      }
    }

    const commentMap = new Map<string, StoredComment>();
    for (const c of [...(a.comments || []), ...(b.comments || [])]) {
      if (c?.id) commentMap.set(c.id, c);
    }
    const mergedComments = Array.from(commentMap.values())
      .sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0))
      .slice(-MAX_COMMENTS_PER_POST);

    return {
      ...a,
      ...b,
      keysCount,
      keysRequired,
      padlocksSealCount,
      status,
      escapedAt: a.escapedAt || b.escapedAt,
      isPinned: Boolean(a.isPinned || b.isPinned),
      pinnedUntil: Math.max(a.pinnedUntil || 0, b.pinnedUntil || 0) || undefined,
      hasGoldBadge: Boolean(a.hasGoldBadge || b.hasGoldBadge),
      keyDonors: donors,
      comments: mergedComments,
      imageUrl: b.imageUrl || a.imageUrl,
      videoUrl: b.videoUrl || a.videoUrl,
      audioNote: b.audioNote || a.audioNote,
    };
  }

  private mergePostListsMonotonic(localPosts: StoredPost[], dbPosts: StoredPost[]): StoredPost[] {
    const map = new Map<string, StoredPost>();
    for (const p of dbPosts) {
      if (p?.id) map.set(p.id, p);
    }
    for (const p of localPosts) {
      if (!p?.id) continue;
      const existing = map.get(p.id);
      map.set(p.id, existing ? this.mergeSinglePost(existing, p) : p);
    }
    return Array.from(map.values())
      .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))
      .slice(0, MAX_IRREVERSIBLE_POSTS);
  }

  public async syncPostsFromPostgres(force = false): Promise<StoredPost[]> {
    if (!this.pool) {
      return this.snapshot.posts;
    }
    if (!force && Date.now() - this.lastPgPostsSyncAt < 1200) {
      return this.snapshot.posts;
    }
    if (this.pgPostsSyncInFlight) {
      return this.pgPostsSyncInFlight;
    }

    this.pgPostsSyncInFlight = this.pool
      .query('SELECT data FROM evasion_posts ORDER BY created_at DESC LIMIT $1', [MAX_IRREVERSIBLE_POSTS])
      .then((res) => {
        const dbPosts = res.rows.map((r) => r.data as StoredPost).filter((p) => Boolean(p?.id));
        this.snapshot.posts = this.mergePostListsMonotonic(this.snapshot.posts, dbPosts);
        this.lastPgPostsSyncAt = Date.now();
        return this.snapshot.posts;
      })
      .catch((err) => {
        console.warn('[PG] posts sync warning:', err?.message);
        return this.snapshot.posts;
      })
      .finally(() => {
        this.pgPostsSyncInFlight = null;
      });

    return this.pgPostsSyncInFlight;
  }

  public getPosts(): StoredPost[] {
    return this.snapshot.posts;
  }

  public getPostById(id: string): StoredPost | undefined {
    return this.snapshot.posts.find((p) => p.id === id);
  }

  public async getPostByIdSync(id: string): Promise<StoredPost | undefined> {
    const local = this.getPostById(id);
    if (local) return local;
    if (!this.pool) return undefined;
    try {
      const res = await this.pool.query('SELECT data FROM evasion_posts WHERE id = $1 LIMIT 1', [id]);
      const row = res.rows[0]?.data as StoredPost | undefined;
      if (row?.id) {
        this.snapshot.posts = this.mergePostListsMonotonic(this.snapshot.posts, [row]);
        return this.getPostById(id);
      }
    } catch {
      // ignore transient query error
    }
    return undefined;
  }

  public createPost(post: StoredPost): { post: StoredPost; evictedIds: string[]; alreadyExisted: boolean } {
    const existing = this.snapshot.posts.find((p) => p.id === post.id);
    if (existing) {
      return { post: existing, evictedIds: [], alreadyExisted: true };
    }

    const nextPosts = [post, ...this.snapshot.posts];
    this.snapshot.posts = nextPosts;

    void this.persistPostPg(post);
    this.scheduleDiskFlush();

    return { post, evictedIds: [], alreadyExisted: false };
  }

  public updatePost(post: StoredPost): StoredPost {
    const idx = this.snapshot.posts.findIndex((p) => p.id === post.id);
    if (idx !== -1) {
      this.snapshot.posts[idx] = post;
    } else {
      this.snapshot.posts = [post, ...this.snapshot.posts];
    }
    void this.persistPostPg(post);
    this.scheduleDiskFlush();
    return post;
  }

  public propagateAuthorNeonStyle(userId: string, matricule: string, neonColor: string, cellFrame: string): StoredPost[] {
    const changedPosts: StoredPost[] = [];
    this.snapshot.posts = this.snapshot.posts.map((post) => {
      const isMine = post.authorId === userId || post.authorMatricule === matricule;
      let commentChanged = false;
      const updatedComments = post.comments?.map((c) => {
        if (c.authorId === userId || c.authorMatricule === matricule) {
          commentChanged = true;
          return { ...c, authorNeonColor: neonColor };
        }
        return c;
      });
      if (isMine || commentChanged) {
        const nextPost = {
          ...post,
          ...(isMine ? { authorNeonColor: neonColor, authorFrame: cellFrame } : {}),
          comments: updatedComments,
        };
        changedPosts.push(nextPost);
        this.persistPostPg(nextPost);
        return nextPost;
      }
      return post;
    });

    this.snapshot.chatMessages = this.snapshot.chatMessages.map((msg) =>
      msg.authorId === userId || msg.authorMatricule === matricule ? { ...msg, neonColor } : msg
    );

    this.snapshot.lives = this.snapshot.lives.map((live) => {
      const isHost = live.hostId === userId || live.hostMatricule === matricule;
      const hasGuest = live.guests?.some((g) => g.userId === userId || g.matricule === matricule);
      if (isHost || hasGuest) {
        const nextLive = {
          ...live,
          ...(isHost ? { hostNeonColor: neonColor, hostFrame: cellFrame } : {}),
          ...(hasGuest
            ? {
                guests: live.guests?.map((g) =>
                  g.userId === userId || g.matricule === matricule
                    ? { ...g, neonColor, frame: cellFrame }
                    : g
                ),
              }
            : {}),
        };
        this.persistLivePg(nextLive);
        return nextLive;
      }
      return live;
    });

    this.scheduleDiskFlush();
    return changedPosts;
  }

  public propagateAuthorIdentity(
    userId: string,
    matricule: string,
    alias: string,
    avatar: string
  ): StoredPost[] {
    const changedPosts: StoredPost[] = [];
    this.snapshot.posts = this.snapshot.posts.map((post) => {
      const isMine = post.authorId === userId || post.authorMatricule === matricule;
      let commentChanged = false;
      const updatedComments = post.comments?.map((c) => {
        if (c.authorId === userId || c.authorMatricule === matricule) {
          commentChanged = true;
          return { ...c, authorAlias: alias, authorAvatar: avatar };
        }
        return c;
      });
      if (isMine || commentChanged) {
        const nextPost = {
          ...post,
          ...(isMine ? { authorAlias: alias, authorAvatar: avatar } : {}),
          comments: updatedComments,
        };
        changedPosts.push(nextPost);
        this.persistPostPg(nextPost);
        return nextPost;
      }
      return post;
    });

    this.snapshot.chatMessages = this.snapshot.chatMessages.map((msg) =>
      msg.authorId === userId || msg.authorMatricule === matricule
        ? { ...msg, authorAvatar: avatar }
        : msg
    );

    this.snapshot.lives = this.snapshot.lives.map((live) => {
      const isHost = live.hostId === userId || live.hostMatricule === matricule;
      const hasGuest = live.guests?.some((g) => g.userId === userId || g.matricule === matricule);
      if (isHost || hasGuest) {
        const nextLive = {
          ...live,
          ...(isHost ? { hostName: alias, hostAvatar: avatar } : {}),
          ...(hasGuest
            ? {
                guests: live.guests?.map((g) =>
                  g.userId === userId || g.matricule === matricule
                    ? { ...g, alias, avatar }
                    : g
                ),
              }
            : {}),
        };
        this.persistLivePg(nextLive);
        return nextLive;
      }
      return live;
    });

    this.scheduleDiskFlush();
    return changedPosts;
  }

  // --- Chat Messages ---
  public getChatMessages(): StoredChatMessage[] {
    return this.snapshot.chatMessages;
  }

  public addChatMessage(msg: StoredChatMessage): { msg: StoredChatMessage; alreadyExisted: boolean } {
    const existing = this.snapshot.chatMessages.find((m) => m.id === msg.id);
    if (existing) return { msg: existing, alreadyExisted: true };

    const next = [...this.snapshot.chatMessages, msg];
    this.snapshot.chatMessages = next.length > MAX_CHAT_MESSAGES ? next.slice(-MAX_CHAT_MESSAGES) : next;
    this.persistChatPg(msg);
    this.scheduleDiskFlush();
    return { msg, alreadyExisted: false };
  }

  // --- Salons ---
  public getSalons(): StoredSalon[] {
    return this.snapshot.salons;
  }

  public addSalon(salon: StoredSalon): { salon: StoredSalon; alreadyExisted: boolean } {
    const existing = this.snapshot.salons.find(
      (s) => s.tag.toLowerCase() === salon.tag.toLowerCase() || s.name.toLowerCase() === salon.name.toLowerCase()
    );
    if (existing) return { salon: existing, alreadyExisted: true };

    this.snapshot.salons = [salon, ...this.snapshot.salons].slice(0, MAX_SALONS);
    this.persistSalonPg(salon);
    this.scheduleDiskFlush();
    return { salon, alreadyExisted: false };
  }

  // --- Lives ---
  public getLives(): StoredLiveSession[] {
    this.pruneExpiredLives();
    return this.snapshot.lives;
  }

  public getLiveById(liveId: string): StoredLiveSession | undefined {
    this.pruneExpiredLives();
    return this.snapshot.lives.find((l) => l.id === liveId);
  }

  public createLive(live: StoredLiveSession): StoredLiveSession {
    this.pruneExpiredLives();
    this.snapshot.lives = [live, ...this.snapshot.lives.filter((l) => l.id !== live.id)].slice(0, MAX_LIVES);
    this.persistLivePg(live);
    this.scheduleDiskFlush();
    return live;
  }

  public updateLive(live: StoredLiveSession): StoredLiveSession {
    const idx = this.snapshot.lives.findIndex((l) => l.id === live.id);
    if (idx !== -1) {
      this.snapshot.lives[idx] = live;
      this.persistLivePg(live);
      this.scheduleDiskFlush();
    }
    return live;
  }

  public endLive(liveId: string): boolean {
    const before = this.snapshot.lives.length;
    this.snapshot.lives = this.snapshot.lives.filter((l) => l.id !== liveId);
    if (this.snapshot.lives.length !== before) {
      this.deleteLivePg(liveId);
      this.scheduleDiskFlush();
      return true;
    }
    return false;
  }

  // --- Payment Orders & Webhooks (Replay-Safe Idempotency) ---
  public savePaymentOrder(order: StoredPaymentOrder): StoredPaymentOrder {
    this.snapshot.paymentOrders[order.orderId] = order;
    this.persistOrderPg(order);
    this.scheduleDiskFlush();
    return order;
  }

  public getPaymentOrder(orderId: string): StoredPaymentOrder | null {
    return this.snapshot.paymentOrders[orderId] || null;
  }

  public findPaymentOrderByExternalId(externalId: string): StoredPaymentOrder | null {
    for (const order of Object.values(this.snapshot.paymentOrders)) {
      if (order.externalId === externalId || order.orderId === externalId) {
        return order;
      }
    }
    return null;
  }

  public hasProcessedWebhook(eventId: string): boolean {
    return Boolean(this.snapshot.processedWebhooks[eventId]);
  }

  public markWebhookProcessed(eventId: string): void {
    const ts = Date.now();
    this.snapshot.processedWebhooks[eventId] = ts;
    if (this.pool) {
      void this.pool
        .query(
          `INSERT INTO evasion_processed_webhooks (event_id, processed_at) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
          [eventId, ts]
        )
        .catch(() => {});
    }
    this.scheduleDiskFlush();
  }

  // --- Autonomous Web Push Subscriptions ---
  public savePushSubscription(sub: StoredPushSubscription): StoredPushSubscription {
    if (!this.snapshot.pushSubscriptions) this.snapshot.pushSubscriptions = {};
    this.snapshot.pushSubscriptions[sub.endpoint] = sub;
    if (this.pool) {
      void this.pool
        .query(
          `INSERT INTO evasion_push_subscriptions (endpoint, user_id, data, updated_at)
           VALUES ($1, $2, $3::jsonb, $4)
           ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
          [sub.endpoint, sub.userId, JSON.stringify(sub), sub.updatedAt]
        )
        .catch(() => {});
    }
    this.scheduleDiskFlush();
    return sub;
  }

  public removePushSubscription(endpoint: string): boolean {
    if (!this.snapshot.pushSubscriptions || !this.snapshot.pushSubscriptions[endpoint]) return false;
    delete this.snapshot.pushSubscriptions[endpoint];
    if (this.pool) {
      void this.pool.query('DELETE FROM evasion_push_subscriptions WHERE endpoint = $1', [endpoint]).catch(() => {});
    }
    this.scheduleDiskFlush();
    return true;
  }

  public getPushSubscriptionsForUser(userId?: string, matricule?: string): StoredPushSubscription[] {
    const subs = Object.values(this.snapshot.pushSubscriptions || {});
    return subs.filter((s) => {
      if (userId && s.userId === userId) return true;
      if (matricule && s.matricule.toLowerCase() === matricule.toLowerCase()) return true;
      return false;
    });
  }

  public getAllPushSubscriptions(): StoredPushSubscription[] {
    return Object.values(this.snapshot.pushSubscriptions || {});
  }
}

export const evasionStorage = new EvasionStorage();
