import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import type { Request, Response } from 'express';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import firebaseAppletConfig from './firebase-applet-config.json';
import { resolveCatalogOrderSpec } from './server/catalog.ts';
import { realtimePubSub } from './server/pubsub.ts';
import {
  getMediaStorageMode,
  isServerMediaOpenable,
  registerMediaBlobPersistence,
  sanitizeDownloadFileName,
  serveLocalMediaWithRanges,
  storeMediaBuffer,
} from './server/mediaStorage.ts';
import {
  evasionStorage,
  isTest2026Account,
  isTest2026Identifier,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  MAX_IRREVERSIBLE_POSTS,
  MAX_COMMENTS_PER_POST,
  SERVER_BADGES,
  type StoredAccount,
  type StoredPost,
  type StoredComment,
  type StoredChatMessage,
  type StoredSalon,
  type StoredLiveSession,
  type StoredLiveComment,
  type StoredPaymentOrder,
  type StoredPushSubscription,
  type StoredActiveFlameItem,
  type StoredProfileUniverseItem,
  type StoredUserProfile,
} from './server/storage.ts';
import {
  formatMessagePreview,
  getVapidPublicKey,
  notifyCourWebPush,
  notifyUserByWebPush,
  sendWebPushToSubscriptions,
} from './server/push.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveInitialPort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const fromArg = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(fromArg) && fromArg > 0) return fromArg;
  }
  return Number(process.env.PORT) || 3000;
}

const PORT = resolveInitialPort();
const MIN_KEYS_FULL_ACCESS = 10;
const LIVE_MIN_KEYS_REQUIRED = 0;

const PAYPAL_CLIENT_ID = (
  process.env.PAYPAL_CLIENT_ID ||
  'BAAnPrAdD2PEa9t3gisksnKFdvFOj7zn6zJLIn8Nd9Fn0u-1jpjP6R5Arj9i2vBGUOmR34XVpYyzjAtGIg'
).trim();
const PAYPAL_CLIENT_SECRET = (
  process.env.PAYPAL_CLIENT_SECRET ||
  'EH_OWvgNPJlytXYqPEuYHavm7usiLhqyjHG-l2TK9n3hAXcS6HjJUpT9xaXS6TGIT5l9Ukg9k7EPpPza'
).trim();

const PAYPAL_ENDPOINTS = ['https://api-m.paypal.com', 'https://api-m.sandbox.paypal.com'];

const DAILY_MISSIONS_CATALOG = [
  { id: 'mission_meal_no_screen', keysReward: 4, pointsReward: 50 },
  { id: 'mission_walk_eyes_up', keysReward: 4, pointsReward: 50 },
  { id: 'mission_call_friend', keysReward: 4, pointsReward: 60 },
  { id: 'mission_paper_read', keysReward: 4, pointsReward: 50 },
  { id: 'mission_morning_delayed', keysReward: 4, pointsReward: 70 },
  { id: 'mission_tidy_cell', keysReward: 4, pointsReward: 50 },
  { id: 'mission_deep_work', keysReward: 4, pointsReward: 60 },
];

interface AuthedWebSocket extends WebSocket {
  clientUserId?: string;
  connectedAt?: number;
  activeLiveRoomId?: string;
  liveRole?: 'host' | 'guest' | 'viewer';
  relaySubscriptions?: Set<string>;
  presenceHidden?: boolean;
}

const sseClients = new Set<Response>();
const wsClients = new Set<AuthedWebSocket>();
const liveHostHeartbeats = new Map<string, number>();

function notifyRelaySubscribersCount(roomId: string, broadcasterId?: string) {
  if (!roomId || !broadcasterId) return;
  const targetLive = evasionStorage.getLiveById(roomId);
  let count = 0;
  for (const peer of wsClients) {
    if (peer.readyState !== WebSocket.OPEN || peer.activeLiveRoomId !== roomId) continue;
    if (!peer.relaySubscriptions || peer.relaySubscriptions.size === 0) continue;
    if (
      peer.relaySubscriptions.has(broadcasterId) ||
      (targetLive &&
        targetLive.hostId === broadcasterId &&
        (peer.relaySubscriptions.has(targetLive.hostId) ||
          peer.relaySubscriptions.has(targetLive.hostMatricule)))
    ) {
      count += 1;
    }
  }
  const statusFrame = JSON.stringify({
    type: 'LIVE_RELAY_NEEDED',
    payload: {
      liveId: roomId,
      broadcasterId,
      needed: count > 0,
      subscribersCount: count,
    },
  });
  for (const peer of wsClients) {
    if (peer.readyState !== WebSocket.OPEN || peer.activeLiveRoomId !== roomId) continue;
    const isTarget =
      peer.clientUserId === broadcasterId ||
      (targetLive &&
        targetLive.hostId === broadcasterId &&
        (peer.liveRole === 'host' ||
          peer.clientUserId === targetLive.hostId ||
          peer.clientUserId === targetLive.hostMatricule));
    if (isTarget) {
      try {
        peer.send(statusFrame);
      } catch {
        // ignore
      }
    }
  }
}

function getPresenceCount(): number {
  const uniqueIds = new Set<string>();
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN && ws.clientUserId && !ws.presenceHidden) {
      uniqueIds.add(ws.clientUserId);
    }
  }
  return Math.max(0, uniqueIds.size - 1);
}

interface OnlineUserPresenceItem {
  id: string;
  matricule: string;
  alias: string;
  avatar: string;
  neonColor?: string;
  cellBorderFrame?: string;
  isVerified?: boolean;
  profileType?: 'personal' | 'professional';
  hasActiveFlame?: boolean;
  activeLiveId?: string;
  isCoHost?: boolean;
  connectedAt: number;
}

function getValidActiveFlame(account: StoredAccount | null | undefined) {
  const f = account?.profile?.activeFlame;
  if (!f || !f.expiresAt || f.expiresAt <= Date.now()) return undefined;
  return f;
}

function isAccountVerified(account: StoredAccount | null | undefined): boolean {
  if (!account) return false;
  return Boolean(account.email || account.profile?.isVerified);
}

function notifyFriendsOfNewMedia(
  authorAccount: StoredAccount,
  opts: {
    kind: 'flame' | 'universe' | 'post' | 'flame_comment';
    mediaType?: string;
    title: string;
    body: string;
    recipientIdsOverride?: string[];
  }
) {
  const friendIds = Array.isArray(opts.recipientIdsOverride)
    ? opts.recipientIdsOverride
    : (authorAccount.profile.friends || []).map((f) => f.id).filter(Boolean);
  const uniqueIds = Array.from(new Set(friendIds)).filter((id) => id && id !== authorAccount.id);
  if (uniqueIds.length === 0) return;

  const ownerAlias = authorAccount.profile.alias || authorAccount.profile.matricule;
  realtimePubSub.publish('FRIEND_NEW_MEDIA', {
    recipientUserIds: uniqueIds,
    kind: opts.kind,
    mediaType: opts.mediaType || 'media',
    title: opts.title,
    body: opts.body,
    ownerId: authorAccount.id,
    ownerMatricule: authorAccount.profile.matricule,
    ownerAlias,
    ownerAvatar: authorAccount.profile.avatar || '⛓️',
    ownerNeonColor: authorAccount.profile.neonColor,
    createdAt: Date.now(),
  });

  for (const friendId of uniqueIds) {
    const friendAcc = evasionStorage.getAccountById(friendId);
    if (!friendAcc) continue;
    void notifyUserByWebPush(friendAcc.id, friendAcc.profile.matricule, {
      title: opts.title,
      body: opts.body,
      tag: `evasion-${opts.kind}-${authorAccount.id}-${Date.now()}`,
      url: `/?u=${encodeURIComponent(authorAccount.profile.publicShareSlug || authorAccount.id)}`,
      type: 'dm',
      data: {
        type: 'profile',
        ownerId: authorAccount.id,
        ownerMatricule: authorAccount.profile.matricule,
        ownerAlias,
      },
    });
  }
}

function getOnlineUsersRoster(): OnlineUserPresenceItem[] {
  const activeLives = evasionStorage.getLives().filter((l) => l.isActive);
  const byId = new Map<string, OnlineUserPresenceItem>();

  for (const ws of wsClients) {
    if (ws.readyState !== WebSocket.OPEN || !ws.clientUserId || ws.presenceHidden) continue;
    const acc = evasionStorage.getAccountById(ws.clientUserId);
    if (!acc) continue;
    const p = acc.profile;

    const hostedLive = activeLives.find(
      (l) => l.hostId === acc.id || l.hostMatricule === p.matricule
    );
    const guestLive = !hostedLive
      ? activeLives.find((l) =>
          l.guests?.some((g) => g.userId === acc.id || g.matricule === p.matricule)
        )
      : undefined;
    const matchedLive = hostedLive || guestLive;

    const existing = byId.get(acc.id);
    const connAt = ws.connectedAt || Date.now();
    if (!existing || connAt < existing.connectedAt) {
      byId.set(acc.id, {
        id: acc.id,
        matricule: p.matricule,
        alias: p.alias || p.matricule,
        avatar: p.avatar,
        neonColor: p.neonColor,
        cellBorderFrame: p.cellBorderFrame,
        isVerified: isAccountVerified(acc),
        profileType: p.profileType || 'personal',
        hasActiveFlame: Boolean(getValidActiveFlame(acc)),
        activeLiveId: matchedLive?.id,
        isCoHost: Boolean(guestLive),
        connectedAt: existing ? Math.min(existing.connectedAt, connAt) : connAt,
      });
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (Boolean(b.activeLiveId) !== Boolean(a.activeLiveId)) {
      return b.activeLiveId ? 1 : -1;
    }
    return a.connectedAt - b.connectedAt;
  });
}

function broadcastOnlineUsers() {
  realtimePubSub.publish('ONLINE_USERS', {
    users: getOnlineUsersRoster(),
    onlineInmatesCount: getPresenceCount(),
  });
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function extractSessionToken(req: { headers: http.IncomingHttpHeaders }): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies.evasion_session || null;
}

function getAuthenticatedAccount(req: Request): StoredAccount | null {
  const token = extractSessionToken(req);
  const uid = verifySessionToken(token);
  if (!uid) return null;
  return evasionStorage.getAccountById(uid);
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase().includes('https');
  const maxAge = 30 * 24 * 60 * 60;
  const parts = [
    `evasion_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAge}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase().includes('https');
  const parts = [
    'evasion_session=',
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function toPublicAuthPayload(account: StoredAccount) {
  const hasPassword = evasionStorage.accountHasCustomPassword(account);
  const validFlame = getValidActiveFlame(account);
  return {
    id: account.id,
    username: account.username,
    email: account.email || null,
    supabaseUserId: account.supabaseUserId || account.profile.supabaseUserId || undefined,
    hasPassword,
    profile: {
      ...account.profile,
      supabaseUserId: account.supabaseUserId || account.profile.supabaseUserId || undefined,
      activeFlame: validFlame,
      isVerified: isAccountVerified(account),
      profileType: account.profile.profileType || 'personal',
      hasAccountPassword: hasPassword,
    },
  };
}

function unlockBadgeIfMissing(account: StoredAccount, badgeId: string): void {
  if (account.profile.badges.some((b) => b.id === badgeId)) return;
  const tpl = SERVER_BADGES[badgeId];
  if (tpl) {
    account.profile.badges.push({ ...tpl, unlockedAt: Date.now() });
  }
}

function getOrProvisionAccount(req: Request, res: Response): StoredAccount {
  const body = (req.body || {}) as Record<string, unknown>;
  const reqAlias =
    typeof body.hostAlias === 'string'
      ? body.hostAlias
      : typeof body.authorAlias === 'string'
      ? body.authorAlias
      : typeof body.alias === 'string'
      ? body.alias
      : undefined;
  const reqAvatar =
    typeof body.hostAvatar === 'string'
      ? body.hostAvatar
      : typeof body.authorAvatar === 'string'
      ? body.authorAvatar
      : typeof body.avatar === 'string'
      ? body.avatar
      : undefined;
  const reqBio = typeof body.bio === 'string' ? body.bio : undefined;

  const existing = getAuthenticatedAccount(req);
  if (existing) {
    let hydrated = false;
    if (
      typeof reqAlias === 'string' &&
      reqAlias.trim() &&
      reqAlias.trim() !== 'Spectre En Quête' &&
      existing.profile.alias === 'Spectre En Quête' &&
      !evasionStorage.isAliasTakenByAnother(reqAlias.trim(), existing.id)
    ) {
      existing.profile.alias = reqAlias.trim().slice(0, 32);
      hydrated = true;
    }
    if (
      typeof reqAvatar === 'string' &&
      reqAvatar.trim() &&
      reqAvatar.trim() !== '⛓️' &&
      !reqAvatar.trim().startsWith('idb://') &&
      existing.profile.avatar === '⛓️'
    ) {
      existing.profile.avatar = reqAvatar.trim().slice(0, 200000);
      hydrated = true;
    }
    if (typeof reqBio === 'string' && reqBio.trim() && !existing.profile.bio) {
      existing.profile.bio = reqBio.trim().slice(0, 240);
      hydrated = true;
    }
    if (hydrated) {
      evasionStorage.saveAccount(existing);
    }
    return existing;
  }

  const verifiedTokenUid = verifySessionToken(extractSessionToken(req));
  const rawHeaderUid =
    typeof req.headers['x-evasion-user-id'] === 'string'
      ? req.headers['x-evasion-user-id'].trim()
      : '';
  const safeHeaderUid =
    rawHeaderUid &&
    !rawHeaderUid.startsWith('live_') &&
    !rawHeaderUid.startsWith('post_') &&
    !rawHeaderUid.startsWith('chat_') &&
    !rawHeaderUid.startsWith('salon_') &&
    !rawHeaderUid.startsWith('flame_') &&
    !rawHeaderUid.startsWith('uni_') &&
    !rawHeaderUid.startsWith('media_')
      ? rawHeaderUid
      : undefined;

  const rawBodyId =
    verifiedTokenUid ||
    safeHeaderUid ||
    (typeof body.hostId === 'string'
      ? body.hostId
      : typeof body.userId === 'string'
      ? body.userId
      : typeof body.authorId === 'string'
      ? body.authorId
      : typeof body.id === 'string' &&
        !body.id.startsWith('live_') &&
        !body.id.startsWith('post_') &&
        !body.id.startsWith('chat_') &&
        !body.id.startsWith('salon_') &&
        !body.id.startsWith('flame_') &&
        !body.id.startsWith('uni_') &&
        !body.id.startsWith('media_') &&
        !body.id.startsWith('track_') &&
        !body.id.startsWith('m_') &&
        !body.id.startsWith('msg_')
      ? body.id
      : undefined);
  const account = evasionStorage.ensureAutoSessionAccount({
    id: rawBodyId,
    matricule:
      typeof body.hostMatricule === 'string'
        ? body.hostMatricule
        : typeof body.authorMatricule === 'string'
        ? body.authorMatricule
        : typeof body.matricule === 'string'
        ? body.matricule
        : undefined,
    alias: reqAlias,
    avatar: reqAvatar,
    bio: reqBio,
    referralCode: typeof body.referralCode === 'string' ? body.referralCode : undefined,
  });
  // Never overwrite an existing verified session cookie with a different account ID (prevents profile jumping on cold starts)
  if (!verifiedTokenUid || verifiedTokenUid === account.id) {
    const token = signSessionToken(account.id);
    setSessionCookie(req, res, token);
  }
  return account;
}

function requireAuthAndMinKeys(
  req: Request,
  res: Response,
  minKeys = MIN_KEYS_FULL_ACCESS
): StoredAccount | null {
  const account = getOrProvisionAccount(req, res);
  if (isTest2026Account(account)) {
    return account;
  }
  if ((account.profile.keysAvailable || 0) < minKeys) {
    res.status(403).json({
      success: false,
      code: 'INSUFFICIENT_KEYS',
      requiredKeys: minKeys,
      currentKeys: account.profile.keysAvailable || 0,
      error: `${minKeys} clés 🔑 requises pour débloquer cette activation.`,
    });
    return null;
  }
  return account;
}

let cachedPayPalMode: { mode: 'live' | 'sandbox'; checkedAt: number } | null = null;
let cachedPayPalClientToken: { token: string; expiresAt: number } | null = null;

async function getPayPalAccessToken(baseUrl: string): Promise<string | null> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) return null;
  try {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function getPayPalClientToken(): Promise<string | null> {
  if (cachedPayPalClientToken && Date.now() < cachedPayPalClientToken.expiresAt) {
    return cachedPayPalClientToken.token;
  }
  for (const baseUrl of PAYPAL_ENDPOINTS) {
    const accessToken = await getPayPalAccessToken(baseUrl);
    if (!accessToken) continue;
    try {
      const res = await fetch(`${baseUrl}/v1/identity/generate-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { client_token?: string; expires_in?: number };
      if (data.client_token) {
        const ttlMs = Math.max(60_000, ((data.expires_in || 3600) - 300) * 1000);
        cachedPayPalClientToken = {
          token: data.client_token,
          expiresAt: Date.now() + ttlMs,
        };
        return data.client_token;
      }
    } catch {
      // ignore and try next endpoint
    }
  }
  return null;
}

async function resolveActivePayPalMode(): Promise<'live' | 'sandbox' | 'unconfigured'> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) return 'unconfigured';
  if (cachedPayPalMode && Date.now() - cachedPayPalMode.checkedAt < 10 * 60 * 1000) {
    return cachedPayPalMode.mode;
  }
  for (const baseUrl of PAYPAL_ENDPOINTS) {
    const token = await getPayPalAccessToken(baseUrl);
    if (token) {
      const mode = baseUrl.includes('sandbox') ? 'sandbox' : 'live';
      cachedPayPalMode = { mode, checkedAt: Date.now() };
      return mode;
    }
  }
  return 'unconfigured';
}

function getRequestOrigin(req: Request): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && envUrl !== 'MY_APP_URL') return envUrl;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`)
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function fulfillPaymentOrder(order: StoredPaymentOrder): {
  order: StoredPaymentOrder;
  account: StoredAccount | null;
  updatedPost: StoredPost | null;
} {
  if (order.status === 'paid') {
    const acc = evasionStorage.getAccountById(order.userId);
    const post = order.targetPostId ? evasionStorage.getPostById(order.targetPostId) || null : null;
    return { order, account: acc, updatedPost: post };
  }

  const paidOrder: StoredPaymentOrder = {
    ...order,
    status: 'paid',
    paidAt: Date.now(),
  };
  evasionStorage.savePaymentOrder(paidOrder);

  const account = evasionStorage.getAccountById(paidOrder.userId);
  const spec = resolveCatalogOrderSpec({
    itemId: paidOrder.itemId,
    targetPostId: paidOrder.targetPostId,
    neonColor: paidOrder.neonColor,
    cellFrame: paidOrder.cellFrame,
  });

  if (!account || !spec) {
    return { order: paidOrder, account, updatedPost: null };
  }

  let updatedPost: StoredPost | null = null;
  const prod = spec.product;

  if (prod.type === 'keys_pack') {
    account.profile.keysAvailable = (account.profile.keysAvailable || 0) + (prod.keys || 0);
    account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + (prod.padlocks || 0);
    if (prod.isVip) {
      account.profile.isVipCell = true;
      unlockBadgeIfMissing(account, 'badge_parrain_vip');
    }
  } else if (prod.type === 'vip_sub') {
    account.profile.isVipSubscriber = true;
    account.profile.isVipCell = true;
    account.profile.keysAvailable = (account.profile.keysAvailable || 0) + (prod.keys || 10);
    account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + (prod.padlocks || 3);
    account.profile.vipSubscriptionExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    unlockBadgeIfMissing(account, 'badge_parrain_vip');
  } else if (prod.type === 'passe_partout') {
    const targetId = paidOrder.targetPostId || spec.targetPostId;
    const existingPost = targetId ? evasionStorage.getPostById(targetId) : undefined;
    if (existingPost) {
      const donorLabel =
        paidOrder.externalId === 'VIP_FREE_PASS' ||
        paidOrder.externalId === 'TEST_2026_FREE_PASS' ||
        isTest2026Account(account)
          ? 'Passe-Partout 👑'
          : 'Passe-Partout 0,99€';
      updatedPost = {
        ...existingPost,
        status: 'escaped',
        keysCount: Math.max(existingPost.keysCount, existingPost.keysRequired),
        isPinned: true,
        hasGoldBadge: true,
        escapedAt: existingPost.escapedAt || Date.now(),
        pinnedUntil: Date.now() + 24 * 60 * 60 * 1000,
        keyDonors: existingPost.keyDonors.includes(donorLabel)
          ? existingPost.keyDonors
          : [donorLabel, ...existingPost.keyDonors],
      };
      evasionStorage.updatePost(updatedPost);
      realtimePubSub.publish('POST_UPDATED', { post: updatedPost });
    } else {
      account.profile.hasPassePartoutCount = (account.profile.hasPassePartoutCount || 0) + 1;
      account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + 1;
    }
  } else if (prod.type === 'neon_pack') {
    const nextNeon = spec.neonColor || 'emerald';
    const nextFrame = spec.cellFrame || 'neon';
    account.profile.neonColor = nextNeon;
    account.profile.cellBorderFrame = nextFrame;
    const affectedPosts = evasionStorage.propagateAuthorNeonStyle(
      account.id,
      account.profile.matricule,
      nextNeon,
      nextFrame
    );
    for (const p of affectedPosts) {
      realtimePubSub.publish('POST_UPDATED', { post: p });
    }
  } else if (prod.type === 'kit' && prod.kitId) {
    const currentKits = account.profile.purchasedKits || [];
    if (!currentKits.includes(prod.kitId)) {
      account.profile.purchasedKits = [...currentKits, prod.kitId];
    }
  } else if (prod.type === 'storage_pack') {
    if (prod.isStorageUnlimited) {
      account.profile.isUniverseStorageUnlimited = true;
    } else if (prod.storageSlots) {
      const currentQuota = Math.max(25, Number(account.profile.universeStorageQuota || 25));
      account.profile.universeStorageQuota = currentQuota + prod.storageSlots;
    }
    if (prod.keys) {
      account.profile.keysAvailable = (account.profile.keysAvailable || 0) + prod.keys;
    }
    if (prod.padlocks) {
      account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + prod.padlocks;
    }
    if (prod.isVip) {
      account.profile.isVipCell = true;
      unlockBadgeIfMissing(account, 'badge_parrain_vip');
    }
  }

  evasionStorage.saveAccount(account);
  realtimePubSub.publish('USER_UPDATED', {
    userId: account.id,
    profile: account.profile,
  });

  return { order: paidOrder, account, updatedPost };
}

function wirePubSubFanout() {
  realtimePubSub.subscribe((envelope) => {
    // 1. WebSocket fan-out
    const rawMsg = JSON.stringify({ type: envelope.type, payload: envelope.payload });
    for (const ws of wsClients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (envelope.type === 'USER_UPDATED') {
        const targetUid = (envelope.payload as { userId?: string })?.userId;
        if (!targetUid || ws.clientUserId !== targetUid) continue;
      }
      if (envelope.type === 'LIVE_INVITE_RECEIVED') {
        const invite = (envelope.payload as {
          invite?: { targetUserId?: string; fromUserId?: string };
        })?.invite;
        if (!invite) continue;
        if (invite.targetUserId === 'ALL') {
          if (ws.clientUserId && ws.clientUserId === invite.fromUserId) continue;
        } else if (!ws.clientUserId || ws.clientUserId !== invite.targetUserId) {
          continue;
        }
      }
      if (envelope.type === 'LIVE_USER_BLOCKED') {
        const payload = envelope.payload as { targetUserId?: string; targetMatricule?: string };
        if (
          !ws.clientUserId ||
          (ws.clientUserId !== payload?.targetUserId && ws.clientUserId !== payload?.targetMatricule)
        ) {
          continue;
        }
      }
      if (envelope.type === 'FRIEND_UPDATED' || envelope.type === 'FRIEND_NEW_MEDIA') {
        const payload = envelope.payload as { recipientUserIds?: string[] };
        if (
          !ws.clientUserId ||
          !Array.isArray(payload?.recipientUserIds) ||
          !payload.recipientUserIds.includes(ws.clientUserId)
        ) {
          continue;
        }
      }
      try {
        ws.send(rawMsg);
      } catch {
        wsClients.delete(ws);
      }
    }

    // 2. SSE fan-out for Le Mur backward-compatible listeners
    if (envelope.type === 'POST_CREATED' || envelope.type === 'POST_UPDATED') {
      const frame = `event: ${envelope.type}\ndata: ${JSON.stringify(envelope.payload)}\n\n`;
      for (const client of sseClients) {
        try {
          client.write(frame);
        } catch {
          sseClients.delete(client);
        }
      }
    }
  });
}

async function purgeBrokenMediaAndSyntheticAccounts(): Promise<void> {
  for (const acc of evasionStorage.getAllAccounts()) {
    const email = (acc.email || '').toLowerCase();
    const alias = (acc.profile?.alias || '').trim();
    if (
      email.startsWith('test.google.') ||
      email.startsWith('test.media.') ||
      email.startsWith('linked.') ||
      alias.startsWith('Rebel_') ||
      alias === 'Guest_Custom_User' ||
      alias === 'Capitaine_777' ||
      alias === 'Capitaine_Google_Pro' ||
      alias === 'MediaUser'
    ) {
      evasionStorage.deleteAccount(acc.id);
      continue;
    }

    const list = Array.isArray(acc.profile?.universeMedia) ? acc.profile.universeMedia : [];
    if (list.length > 0) {
      const kept = [];
      let changed = false;
      for (const m of list) {
        if (!m || !m.url) {
          changed = true;
          continue;
        }
        const ok = await isServerMediaOpenable(m.url, m.type);
        if (ok) {
          kept.push(m);
        } else {
          changed = true;
        }
      }
      if (changed) {
        acc.profile.universeMedia = kept;
        evasionStorage.saveAccount(acc);
      }
    }
  }

  for (const post of evasionStorage.getPosts()) {
    let postChanged = false;
    let nextVideoUrl = post.videoUrl;
    let nextVideoDuration = post.videoDuration;
    let nextImageUrl = post.imageUrl;
    let nextAudioNote = post.audioNote;

    if (nextVideoUrl && !(await isServerMediaOpenable(nextVideoUrl, 'video'))) {
      nextVideoUrl = undefined;
      nextVideoDuration = undefined;
      postChanged = true;
    }
    if (nextImageUrl && !(await isServerMediaOpenable(nextImageUrl, 'photo'))) {
      nextImageUrl = undefined;
      postChanged = true;
    }
    if (nextAudioNote?.audioData && !(await isServerMediaOpenable(nextAudioNote.audioData, 'audio'))) {
      nextAudioNote = undefined;
      postChanged = true;
    }

    if (postChanged) {
      const updatedPost: StoredPost = {
        ...post,
        videoUrl: nextVideoUrl,
        videoDuration: nextVideoDuration,
        imageUrl: nextImageUrl,
        audioNote: nextAudioNote,
      };
      evasionStorage.updatePost(updatedPost);
    }
  }
}

async function startServer() {
  await evasionStorage.init();
  registerMediaBlobPersistence({
    save: (id, contentType, buffer) => evasionStorage.saveMediaBlob(id, contentType, buffer),
    load: (id) => evasionStorage.getMediaBlob(id),
  });
  await purgeBrokenMediaAndSyntheticAccounts();
  wirePubSubFanout();

  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '4mb' }));

  // --- Dynamic Web App Manifest so Home Screen PWAs inherit the active user session & Supabase ID ---
  app.get(['/manifest.webmanifest', '/api/manifest.webmanifest'], (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const authAcc = getAuthenticatedAccount(req);
    const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
    const verifiedQueryUid = queryToken ? verifySessionToken(queryToken) : null;
    const resolvedToken = verifiedQueryUid
      ? queryToken
      : authAcc
      ? signSessionToken(authAcc.id)
      : '';
    const sbUid = typeof req.query?.sb_uid === 'string' ? req.query.sb_uid.trim() : '';

    const params = new URLSearchParams();
    if (resolvedToken) params.set('pwa_session', resolvedToken);
    if (sbUid) params.set('sb_uid', sbUid);
    const qs = params.toString();
    const startUrl = qs ? `/?${qs}` : '/';

    return res.send(
      JSON.stringify({
        id: '/',
        name: 'ÉVASION - Réseau Social & Libération Collective',
        short_name: 'ÉVASION',
        description:
          'Réseau social anti-algorithmes toxiques : entraide anonyme, messagerie et libération numérique.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        start_url: startUrl,
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      })
    );
  });

  // --- 1. Health & Architecture Status ---
  app.get('/api/health', (_req, res) => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    res.json({
      status: 'ok',
      app: 'ÉVASION',
      version: '2.0.0',
      currentDate: now.toISOString().slice(0, 10),
      msUntilMidnight: midnight.getTime() - now.getTime(),
      activePostsCount: evasionStorage.getPosts().length,
      maxIrreversiblePosts: MAX_IRREVERSIBLE_POSTS,
      activeChatCount: evasionStorage.getChatMessages().length,
      activeLivesCount: evasionStorage.getLives().length,
      activeSalonsCount: evasionStorage.getSalons().length,
      storageBackend: evasionStorage.getMode(),
      pubsubBackend: realtimePubSub.getMode(),
      mediaBackend: getMediaStorageMode(),
    });
  });

  // --- 2. Real Server Authentication & Multi-Device Accounts ---
  app.post('/api/auth/auto-session', (req, res) => {
    const body = (req.body || {}) as {
      id?: string;
      matricule?: string;
      alias?: string;
      avatar?: string;
      bio?: string;
      referralCode?: string;
      forceNewSession?: boolean;
      localProfile?: Partial<StoredUserProfile>;
    };
    const existing = body.forceNewSession ? null : getAuthenticatedAccount(req);
    if (existing) {
      let updated = false;
      if (
        typeof body.alias === 'string' &&
        body.alias.trim() &&
        body.alias.trim() !== 'Spectre En Quête' &&
        (!existing.profile.alias || existing.profile.alias === 'Spectre En Quête') &&
        !evasionStorage.isAliasTakenByAnother(body.alias.trim(), existing.id)
      ) {
        existing.profile.alias = body.alias.trim().slice(0, 32);
        updated = true;
      }
      if (
        typeof body.avatar === 'string' &&
        body.avatar.trim() &&
        body.avatar.trim() !== '⛓️' &&
        !body.avatar.trim().startsWith('idb://') &&
        (!existing.profile.avatar || existing.profile.avatar === '⛓️')
      ) {
        existing.profile.avatar = body.avatar.trim().slice(0, 200000);
        updated = true;
      }
      if (updated) {
        evasionStorage.saveAccount(existing);
      }
      const token = signSessionToken(existing.id);
      setSessionCookie(req, res, token);
      return res.json({
        success: true,
        token,
        account: toPublicAuthPayload(existing),
      });
    }

    const account = evasionStorage.ensureAutoSessionAccount(body);
    const token = signSessionToken(account.id);
    setSessionCookie(req, res, token);
    return res.json({
      success: true,
      token,
      account: toPublicAuthPayload(account),
    });
  });

  app.post('/api/auth/anonymous-entry', (req, res) => {
    const body = (req.body || {}) as { password?: string; avatar?: string };
    const result = evasionStorage.ensureAnonymousEntryAccount({
      password: typeof body.password === 'string' ? body.password : undefined,
      avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
    });
    if (result.error || !result.account) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Impossible de créer la session anonyme.',
      });
    }
    const token = signSessionToken(result.account.id);
    setSessionCookie(req, res, token);
    return res.json({
      success: true,
      token,
      account: toPublicAuthPayload(result.account),
    });
  });

  interface VerifiedGoogleIdentity {
    provider: 'firebase' | 'supabase';
    googleUid?: string;
    supabaseUserId?: string;
    email: string;
    displayName?: string;
    photoURL?: string;
  }

  async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedGoogleIdentity | null> {
    const cleanToken = idToken.trim();
    if (!cleanToken || cleanToken.length > 8192) return null;
    const parts = cleanToken.split('.');
    if (parts.length !== 3) return null;

    const projectId = (process.env.FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId || '').trim();
    const apiKey = (process.env.FIREBASE_API_KEY || firebaseAppletConfig.apiKey || '').trim();
    if (!projectId || !apiKey) return null;

    try {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
      const payload = JSON.parse(payloadJson) as {
        aud?: string;
        iss?: string;
        sub?: string;
        exp?: number;
      };
      const nowSec = Math.floor(Date.now() / 1000);
      if (
        payload.aud !== projectId ||
        payload.iss !== `https://securetoken.google.com/${projectId}` ||
        !payload.sub ||
        typeof payload.exp !== 'number' ||
        payload.exp < nowSec - 30
      ) {
        return null;
      }

      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: cleanToken }),
        }
      );
      if (!lookupRes.ok) return null;
      const lookupData = (await lookupRes.json().catch(() => null)) as {
        users?: Array<{
          localId?: string;
          email?: string;
          emailVerified?: boolean;
          displayName?: string;
          photoUrl?: string;
          disabled?: boolean;
          providerUserInfo?: Array<{ providerId?: string; email?: string }>;
        }>;
      } | null;

      const user = lookupData?.users?.[0];
      if (!user || user.disabled || !user.localId || !user.email) return null;
      if (user.localId !== payload.sub) return null;

      const hasGoogleProvider = Array.isArray(user.providerUserInfo)
        ? user.providerUserInfo.some((p) => p?.providerId === 'google.com')
        : false;
      if (!hasGoogleProvider && user.emailVerified !== true) return null;

      return {
        provider: 'firebase',
        googleUid: user.localId,
        email: user.email.trim().toLowerCase(),
        displayName: typeof user.displayName === 'string' ? user.displayName.trim() : undefined,
        photoURL: typeof user.photoUrl === 'string' ? user.photoUrl.trim() : undefined,
      };
    } catch {
      return null;
    }
  }

  async function verifySupabaseAccessToken(accessToken: string): Promise<VerifiedGoogleIdentity | null> {
    const cleanToken = accessToken.trim();
    if (!cleanToken || cleanToken.length > 8192) return null;

    const sbUrl = (
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');
    const sbApiKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    ).trim();
    if (!sbUrl || !sbApiKey) return null;

    try {
      const res = await fetch(`${sbUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          apikey: sbApiKey,
        },
      });
      if (!res.ok) return null;
      const user = (await res.json().catch(() => null)) as {
        id?: string;
        email?: string;
        email_confirmed_at?: string | null;
        app_metadata?: { provider?: string; providers?: string[] };
        user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
      } | null;

      if (!user || !user.id || !user.email) return null;
      const isGoogleOrConfirmed =
        user.app_metadata?.provider === 'google' ||
        (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google')) ||
        Boolean(user.email_confirmed_at);
      if (!isGoogleOrConfirmed) return null;

      const meta = user.user_metadata || {};
      return {
        provider: 'supabase',
        supabaseUserId: user.id,
        googleUid: user.id,
        email: user.email.trim().toLowerCase(),
        displayName:
          typeof meta.full_name === 'string'
            ? meta.full_name.trim()
            : typeof meta.name === 'string'
            ? meta.name.trim()
            : undefined,
        photoURL:
          typeof meta.avatar_url === 'string'
            ? meta.avatar_url.trim()
            : typeof meta.picture === 'string'
            ? meta.picture.trim()
            : undefined,
      };
    } catch {
      return null;
    }
  }

  app.post('/api/auth/google-session', async (req, res) => {
    const currentAccount = getAuthenticatedAccount(req);
    const body = (req.body || {}) as {
      firebaseIdToken?: string;
      supabaseAccessToken?: string;
      password?: string;
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
    };

    let verified: VerifiedGoogleIdentity | null = null;
    if (typeof body.firebaseIdToken === 'string' && body.firebaseIdToken.trim()) {
      verified = await verifyFirebaseIdToken(body.firebaseIdToken);
    }
    if (!verified && typeof body.supabaseAccessToken === 'string' && body.supabaseAccessToken.trim()) {
      verified = await verifySupabaseAccessToken(body.supabaseAccessToken);
    }

    if (!verified) {
      return res.status(401).json({
        success: false,
        error: 'Authentification Google officielle requise. Clique sur « Se connecter avec Google » pour confirmer ton identité.',
      });
    }

    const result = evasionStorage.ensureGoogleSessionAccount({
      verifiedByProvider: true,
      supabaseUserId: verified.supabaseUserId,
      googleUid: verified.googleUid,
      email: verified.email,
      displayName: verified.displayName,
      photoURL: verified.photoURL,
      password: typeof body.password === 'string' ? body.password : undefined,
      existingAccountId: currentAccount?.id,
      existingSupabaseProfile: verified.supabaseUserId ? body.existingSupabaseProfile || null : null,
    });
    if (result.error || !result.account) {
      return res.status(result.requiresPassword ? 401 : 400).json({
        success: false,
        requiresPassword: Boolean(result.requiresPassword),
        error: result.error || 'Connexion Google impossible.',
      });
    }
    if (!result.account.profile.isVerified) {
      result.account.profile.isVerified = true;
      evasionStorage.saveAccount(result.account);
    }
    const token = signSessionToken(result.account.id);
    setSessionCookie(req, res, token);
    return res.json({
      success: true,
      restored: Boolean(result.restored),
      token,
      account: toPublicAuthPayload(result.account),
    });
  });

  app.post('/api/auth/rotate-share-slug', (req, res) => {
    const account = getAuthenticatedAccount(req);
    if (!account) {
      return res.status(401).json({ success: false, error: 'Session expirée. Reconnecte-toi.' });
    }
    const updated = evasionStorage.rotateAccountShareSlug(account.id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    }
    realtimePubSub.publish('USER_UPDATED', { userId: updated.id, profile: updated.profile });
    return res.json({
      success: true,
      account: toPublicAuthPayload(updated),
    });
  });

  app.post('/api/auth/pseudo-session', (req, res) => {
    const currentAccount = getAuthenticatedAccount(req);
    const body = (req.body || {}) as {
      pseudo?: string;
      password?: string;
      avatar?: string;
      localProfile?: Partial<StoredUserProfile>;
    };
    const result = evasionStorage.ensurePseudoSessionAccount({
      pseudo: typeof body.pseudo === 'string' ? body.pseudo : '',
      password: typeof body.password === 'string' ? body.password : undefined,
      avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
      existingAccountId: currentAccount?.id,
      localProfile: body.localProfile && typeof body.localProfile === 'object' ? body.localProfile : undefined,
    });
    if (result.error || !result.account) {
      return res.status(result.requiresPassword ? 401 : 400).json({
        success: false,
        requiresPassword: Boolean(result.requiresPassword),
        error: result.error || 'Impossible de se connecter avec ce pseudo.',
      });
    }
    const token = signSessionToken(result.account.id);
    setSessionCookie(req, res, token);
    return res.json({
      success: true,
      restored: Boolean(result.restored),
      token,
      account: toPublicAuthPayload(result.account),
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const { username, email, password, alias, avatar } = (req.body || {}) as {
      username?: string;
      email?: string;
      password?: string;
      alias?: string;
      avatar?: string;
    };
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Pseudo et mot de passe requis.' });
    }
    if (isTest2026Identifier(username) || isTest2026Identifier(alias)) {
      const masterAcc = evasionStorage.ensureTest2026Account(avatar);
      const masterToken = signSessionToken(masterAcc.id);
      setSessionCookie(req, res, masterToken);
      return res.json({
        success: true,
        token: masterToken,
        account: toPublicAuthPayload(masterAcc),
      });
    }
    const currentAccount = getAuthenticatedAccount(req);
    const created = evasionStorage.createAccount({
      username,
      email,
      password,
      alias,
      avatar,
      existingAccountId: currentAccount?.id,
    });
    if (created.error || !created.account) {
      return res.status(400).json({ success: false, error: created.error || 'Inscription impossible.' });
    }
    const token = signSessionToken(created.account.id);
    setSessionCookie(req, res, token);
    return res.json({
      success: true,
      token,
      account: toPublicAuthPayload(created.account),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = (req.body || {}) as {
      identifier?: string;
      password?: string;
    };
    const cleanIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
    const cleanPass = typeof password === 'string' ? password.trim() : '';

    // Mode 1 : Récupération / Connexion uniquement par mot de passe (identifiant laissé vide)
    if (!cleanIdentifier) {
      if (!cleanPass) {
        return res.status(400).json({
          success: false,
          error: 'Entre ton pseudo, ton adresse Google ou ton mot de passe pour retrouver ton compte.',
        });
      }
      if (!isTest2026Identifier(cleanPass) && cleanPass.length < 4) {
        return res.status(400).json({
          success: false,
          error: 'Le mot de passe doit contenir au moins 4 caractères.',
        });
      }

      const matches = evasionStorage.findAccountsByPassword(cleanPass);
      if (matches.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Aucun compte protégé trouvé avec ce mot de passe.',
        });
      }
      if (matches.length > 1) {
        return res.status(409).json({
          success: false,
          requiresDisambiguation: true,
          error:
            "Plusieurs comptes utilisent ce mot de passe. Ajoute ton pseudo ou code d'évasion pour confirmer le tien.",
        });
      }

      const recovered = matches[0];
      const token = signSessionToken(recovered.id);
      setSessionCookie(req, res, token);
      return res.json({
        success: true,
        recoveredByPasswordOnly: true,
        token,
        account: toPublicAuthPayload(recovered),
      });
    }

    // Mode 2 : Connexion classique avec identifiant (pseudo / EVASION-XXXX / USR_) + mot de passe
    const account = evasionStorage.findAccountByIdentifier(cleanIdentifier);
    if (!account) {
      return res.status(401).json({
        success: false,
        error: cleanIdentifier.includes('@')
          ? 'Pour les comptes Google, clique sur le bouton « Se connecter avec Google » ci-dessous.'
          : 'Aucun compte trouvé avec cet identifiant. Clique sur S’inscrire ou Se connecter avec Google.',
      });
    }

    if (
      isTest2026Account(account) &&
      (isTest2026Identifier(cleanPass) || isTest2026Identifier(cleanIdentifier))
    ) {
      const token = signSessionToken(account.id);
      setSessionCookie(req, res, token);
      return res.json({
        success: true,
        token,
        account: toPublicAuthPayload(account),
      });
    }

    const isProtected = evasionStorage.accountHasCustomPassword(account);
    const isGoogleAccount = evasionStorage.isGoogleLinkedAccount(account);

    // Protection stricte des profils Google : impossible d'y accéder sans authentification Google officielle (ou mot de passe déjà défini par le propriétaire)
    if (isGoogleAccount && !isProtected) {
      return res.status(401).json({
        success: false,
        requiresGoogleAuth: true,
        error:
          'Ce profil est protégé par Google. Utilise le bouton « Se connecter avec Google » pour t’y connecter.',
      });
    }

    if (!isProtected) {
      // Compte pseudo rapide sans mot de passe
      if (
        cleanPass.length >= 4 &&
        cleanPass.toUpperCase() !== account.profile.id.toUpperCase() &&
        cleanPass.toUpperCase() !== account.profile.referralCode.toUpperCase() &&
        cleanPass.toLowerCase() !== account.profile.matricule.toLowerCase()
      ) {
        evasionStorage.setAccountPassword(account.id, cleanPass);
      }
      const token = signSessionToken(account.id);
      setSessionCookie(req, res, token);
      return res.json({
        success: true,
        token,
        account: toPublicAuthPayload(account),
      });
    }

    if (!cleanPass) {
      return res.status(401).json({
        success: false,
        requiresPassword: true,
        error: 'Ce compte est protégé par un mot de passe. Entre ton mot de passe ci-dessous.',
      });
    }

    // Sécurité anti-piratage : empêcher toute connexion via le seul USR_ ou matricule public
    if (
      cleanPass.toUpperCase() === account.profile.id.toUpperCase() ||
      cleanPass.toLowerCase() === account.profile.matricule.toLowerCase()
    ) {
      return res.status(401).json({
        success: false,
        error: 'Mot de passe incorrect.',
      });
    }

    if (!verifyPassword(cleanPass, account.passwordSalt, account.passwordHash)) {
      return res.status(401).json({
        success: false,
        error: 'Mot de passe incorrect pour ce compte.',
      });
    }

    const token = signSessionToken(account.id);
    setSessionCookie(req, res, token);
    return res.json({
      success: true,
      token,
      account: toPublicAuthPayload(account),
    });
  });

  app.post('/api/auth/verify-password', (req, res) => {
    const account = getAuthenticatedAccount(req);
    if (!account) {
      return res.status(401).json({ success: false, error: 'Session expirée. Reconnecte-toi.' });
    }
    const cleanPass = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (!cleanPass) {
      return res.status(400).json({ success: false, error: 'Entre ton mot de passe.' });
    }
    if (isTest2026Account(account) && isTest2026Identifier(cleanPass)) {
      return res.json({ success: true, verified: true });
    }
    if (!verifyPassword(cleanPass, account.passwordSalt, account.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Mot de passe incorrect.' });
    }
    return res.json({ success: true, verified: true });
  });

  app.post('/api/auth/set-password', (req, res) => {
    const account = getAuthenticatedAccount(req);
    if (!account) {
      return res.status(401).json({
        success: false,
        error: 'Session expirée. Reconnecte-toi pour définir ou modifier ton mot de passe.',
      });
    }
    const body = (req.body || {}) as { currentPassword?: string; newPassword?: string };
    const newPass = typeof body.newPassword === 'string' ? body.newPassword.trim() : '';
    const currentPass = typeof body.currentPassword === 'string' ? body.currentPassword.trim() : '';

    if (newPass.length < 4 || newPass.length > 128) {
      return res.status(400).json({
        success: false,
        error: 'Le mot de passe doit contenir au moins 4 caractères.',
      });
    }
    if (
      newPass.toUpperCase() === account.profile.id.toUpperCase() ||
      newPass.toUpperCase() === account.profile.referralCode.toUpperCase() ||
      newPass.toLowerCase() === account.profile.matricule.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        error: "Choisis un mot de passe différent de ton USR, matricule ou code d'évasion.",
      });
    }

    const alreadyHasCustom = evasionStorage.accountHasCustomPassword(account);
    if (alreadyHasCustom) {
      if (!currentPass || !verifyPassword(currentPass, account.passwordSalt, account.passwordHash)) {
        return res.status(401).json({
          success: false,
          error: 'Mot de passe actuel incorrect.',
        });
      }
    }

    const updated = evasionStorage.setAccountPassword(account.id, newPass);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    }
    const token = signSessionToken(updated.id);
    setSessionCookie(req, res, token);
    return res.json({
      success: true,
      token,
      account: toPublicAuthPayload(updated),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    return res.json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const account = getAuthenticatedAccount(req);
    if (!account) {
      return res.json({ success: true, authenticated: false, account: null });
    }
    return res.json({
      success: true,
      authenticated: true,
      account: toPublicAuthPayload(account),
    });
  });

  app.get('/api/users/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const account = getAuthenticatedAccount(req);
    const onlineIds = new Set<string>();
    for (const peer of wsClients) {
      if (peer.readyState === WebSocket.OPEN && peer.clientUserId) {
        onlineIds.add(peer.clientUserId);
      }
    }
    const users = evasionStorage.searchUsers(q, account?.id).map((u) => ({
      ...u,
      isOnline: onlineIds.has(u.id),
    }));
    return res.json({ success: true, users });
  });

  // --- Real-Time Friends ("Amis") Management ---
  function isUserConnectedOnline(userId: string): boolean {
    for (const peer of wsClients) {
      if (peer.readyState === WebSocket.OPEN && peer.clientUserId === userId) {
        return true;
      }
    }
    return false;
  }

  function resolveFriendTargetAccount(body: {
    targetUserId?: unknown;
    targetMatricule?: unknown;
  }): StoredAccount | null {
    const rawId = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : '';
    const rawMat = typeof body?.targetMatricule === 'string' ? body.targetMatricule.trim() : '';
    if (rawId) {
      const byId = evasionStorage.getAccountById(rawId);
      if (byId) return byId;
      const byIdent = evasionStorage.findAccountByIdentifier(rawId);
      if (byIdent) return byIdent;
    }
    if (rawMat) {
      const byMat = evasionStorage.findAccountByIdentifier(rawMat);
      if (byMat) return byMat;
    }
    return null;
  }

  function hydrateFriendsSnapshot(account: StoredAccount) {
    const friends = (account.profile.friends || []).map((f) => {
      const liveAcc = evasionStorage.getAccountById(f.id);
      return {
        ...f,
        alias: liveAcc?.profile?.alias || f.alias,
        matricule: liveAcc?.profile?.matricule || f.matricule,
        avatar: liveAcc?.profile?.avatar || f.avatar,
        neonColor: liveAcc?.profile?.neonColor || f.neonColor,
        cellBorderFrame: liveAcc?.profile?.cellBorderFrame || f.cellBorderFrame,
        isVerified: isAccountVerified(liveAcc),
        profileType: liveAcc?.profile?.profileType || 'personal',
        activeFlame: getValidActiveFlame(liveAcc),
        isOnline: isUserConnectedOnline(f.id),
      };
    });
    const incoming = (account.profile.friendRequestsIncoming || []).map((r) => {
      const liveAcc = evasionStorage.getAccountById(r.id);
      return {
        ...r,
        alias: liveAcc?.profile?.alias || r.alias,
        matricule: liveAcc?.profile?.matricule || r.matricule,
        avatar: liveAcc?.profile?.avatar || r.avatar,
        neonColor: liveAcc?.profile?.neonColor || r.neonColor,
        isOnline: isUserConnectedOnline(r.id),
      };
    });
    const outgoing = (account.profile.friendRequestsOutgoing || []).map((r) => {
      const liveAcc = evasionStorage.getAccountById(r.id);
      return {
        ...r,
        alias: liveAcc?.profile?.alias || r.alias,
        matricule: liveAcc?.profile?.matricule || r.matricule,
        avatar: liveAcc?.profile?.avatar || r.avatar,
        neonColor: liveAcc?.profile?.neonColor || r.neonColor,
        isOnline: isUserConnectedOnline(r.id),
      };
    });
    return { friends, incoming, outgoing };
  }

  app.get('/api/friends', (req, res) => {
    const account = getAuthenticatedAccount(req);
    if (!account) {
      return res.json({ success: true, friends: [], incoming: [], outgoing: [] });
    }
    return res.json({ success: true, ...hydrateFriendsSnapshot(account) });
  });

  app.post('/api/friends/request', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const target = resolveFriendTargetAccount((req.body || {}) as { targetUserId?: unknown; targetMatricule?: unknown });
    if (!target) {
      return res.status(404).json({
        success: false,
        error: "Ce membre n'a pas encore de compte actif pour être ajouté en ami.",
      });
    }
    if (target.id === account.id) {
      return res.status(400).json({ success: false, error: 'Tu ne peux pas t’ajouter toi-même.' });
    }

    const myFriends = account.profile.friends || [];
    if (myFriends.some((f) => f.id === target.id)) {
      return res.json({
        success: true,
        status: 'already_friends',
        ...hydrateFriendsSnapshot(account),
      });
    }

    const now = Date.now();
    // If target already sent us an incoming request, accept mutually right away!
    const alreadyIncoming = (account.profile.friendRequestsIncoming || []).some(
      (r) => r.id === target.id
    );
    if (alreadyIncoming) {
      account.profile.friendRequestsIncoming = (account.profile.friendRequestsIncoming || []).filter(
        (r) => r.id !== target.id
      );
      account.profile.friendRequestsOutgoing = (account.profile.friendRequestsOutgoing || []).filter(
        (r) => r.id !== target.id
      );
      target.profile.friendRequestsIncoming = (target.profile.friendRequestsIncoming || []).filter(
        (r) => r.id !== account.id
      );
      target.profile.friendRequestsOutgoing = (target.profile.friendRequestsOutgoing || []).filter(
        (r) => r.id !== account.id
      );

      account.profile.friends = [
        {
          id: target.id,
          matricule: target.profile.matricule,
          alias: target.profile.alias || target.profile.matricule,
          avatar: target.profile.avatar,
          neonColor: target.profile.neonColor,
          cellBorderFrame: target.profile.cellBorderFrame,
          addedAt: now,
        },
        ...(account.profile.friends || []).filter((f) => f.id !== target.id),
      ];
      target.profile.friends = [
        {
          id: account.id,
          matricule: account.profile.matricule,
          alias: account.profile.alias || account.profile.matricule,
          avatar: account.profile.avatar,
          neonColor: account.profile.neonColor,
          cellBorderFrame: account.profile.cellBorderFrame,
          addedAt: now,
        },
        ...(target.profile.friends || []).filter((f) => f.id !== account.id),
      ];

      evasionStorage.saveAccount(account);
      evasionStorage.saveAccount(target);
      realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
      realtimePubSub.publish('USER_UPDATED', { userId: target.id, profile: target.profile });
      realtimePubSub.publish('FRIEND_UPDATED', {
        action: 'accepted',
        recipientUserIds: [account.id, target.id],
        actor: {
          id: account.id,
          matricule: account.profile.matricule,
          alias: account.profile.alias || account.profile.matricule,
          avatar: account.profile.avatar,
          neonColor: account.profile.neonColor,
        },
        target: {
          id: target.id,
          matricule: target.profile.matricule,
          alias: target.profile.alias || target.profile.matricule,
          avatar: target.profile.avatar,
          neonColor: target.profile.neonColor,
        },
      });
      return res.json({
        success: true,
        status: 'accepted',
        ...hydrateFriendsSnapshot(account),
      });
    }

    const alreadyOutgoing = (account.profile.friendRequestsOutgoing || []).some(
      (r) => r.id === target.id
    );
    if (!alreadyOutgoing) {
      account.profile.friendRequestsOutgoing = [
        {
          id: target.id,
          matricule: target.profile.matricule,
          alias: target.profile.alias || target.profile.matricule,
          avatar: target.profile.avatar,
          neonColor: target.profile.neonColor,
          requestedAt: now,
        },
        ...(account.profile.friendRequestsOutgoing || []),
      ];
    }
    const targetAlreadyHasIncoming = (target.profile.friendRequestsIncoming || []).some(
      (r) => r.id === account.id
    );
    if (!targetAlreadyHasIncoming) {
      target.profile.friendRequestsIncoming = [
        {
          id: account.id,
          matricule: account.profile.matricule,
          alias: account.profile.alias || account.profile.matricule,
          avatar: account.profile.avatar,
          neonColor: account.profile.neonColor,
          requestedAt: now,
        },
        ...(target.profile.friendRequestsIncoming || []),
      ];
    }

    evasionStorage.saveAccount(account);
    evasionStorage.saveAccount(target);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    realtimePubSub.publish('USER_UPDATED', { userId: target.id, profile: target.profile });
    realtimePubSub.publish('FRIEND_UPDATED', {
      action: 'request_received',
      recipientUserIds: [target.id],
      actor: {
        id: account.id,
        matricule: account.profile.matricule,
        alias: account.profile.alias || account.profile.matricule,
        avatar: account.profile.avatar,
        neonColor: account.profile.neonColor,
      },
    });

    try {
      const senderName = account.profile.alias || account.profile.matricule;
      void notifyUserByWebPush(target.id, target.profile.matricule, {
        title: `👥 Demande d'ami de ${senderName}`,
        body: `${senderName} souhaite t'ajouter en ami et discuter avec toi.`,
        tag: `evasion-friend-${account.id}`,
        url: '/',
        type: 'cour',
        data: {
          type: 'friend_request',
          fromId: account.id,
          from: account.profile.matricule,
          fromAlias: senderName,
        },
      });
    } catch {
      // ignore push errors
    }

    return res.json({
      success: true,
      status: 'requested',
      ...hydrateFriendsSnapshot(account),
    });
  });

  app.post('/api/friends/accept', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const target = resolveFriendTargetAccount((req.body || {}) as { targetUserId?: unknown; targetMatricule?: unknown });
    if (!target) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    }
    const now = Date.now();

    account.profile.friendRequestsIncoming = (account.profile.friendRequestsIncoming || []).filter(
      (r) => r.id !== target.id
    );
    account.profile.friendRequestsOutgoing = (account.profile.friendRequestsOutgoing || []).filter(
      (r) => r.id !== target.id
    );
    target.profile.friendRequestsIncoming = (target.profile.friendRequestsIncoming || []).filter(
      (r) => r.id !== account.id
    );
    target.profile.friendRequestsOutgoing = (target.profile.friendRequestsOutgoing || []).filter(
      (r) => r.id !== account.id
    );

    account.profile.friends = [
      {
        id: target.id,
        matricule: target.profile.matricule,
        alias: target.profile.alias || target.profile.matricule,
        avatar: target.profile.avatar,
        neonColor: target.profile.neonColor,
        cellBorderFrame: target.profile.cellBorderFrame,
        addedAt: now,
      },
      ...(account.profile.friends || []).filter((f) => f.id !== target.id),
    ];
    target.profile.friends = [
      {
        id: account.id,
        matricule: account.profile.matricule,
        alias: account.profile.alias || account.profile.matricule,
        avatar: account.profile.avatar,
        neonColor: account.profile.neonColor,
        cellBorderFrame: account.profile.cellBorderFrame,
        addedAt: now,
      },
      ...(target.profile.friends || []).filter((f) => f.id !== account.id),
    ];

    evasionStorage.saveAccount(account);
    evasionStorage.saveAccount(target);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    realtimePubSub.publish('USER_UPDATED', { userId: target.id, profile: target.profile });
    realtimePubSub.publish('FRIEND_UPDATED', {
      action: 'accepted',
      recipientUserIds: [target.id],
      actor: {
        id: account.id,
        matricule: account.profile.matricule,
        alias: account.profile.alias || account.profile.matricule,
        avatar: account.profile.avatar,
        neonColor: account.profile.neonColor,
      },
    });

    return res.json({
      success: true,
      status: 'accepted',
      ...hydrateFriendsSnapshot(account),
    });
  });

  app.post('/api/friends/decline', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const target = resolveFriendTargetAccount((req.body || {}) as { targetUserId?: unknown; targetMatricule?: unknown });
    const rawId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
    const removeId = target?.id || rawId;

    if (removeId) {
      account.profile.friendRequestsIncoming = (account.profile.friendRequestsIncoming || []).filter(
        (r) => r.id !== removeId
      );
      account.profile.friendRequestsOutgoing = (account.profile.friendRequestsOutgoing || []).filter(
        (r) => r.id !== removeId
      );
      evasionStorage.saveAccount(account);
      realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    }

    if (target) {
      target.profile.friendRequestsIncoming = (target.profile.friendRequestsIncoming || []).filter(
        (r) => r.id !== account.id
      );
      target.profile.friendRequestsOutgoing = (target.profile.friendRequestsOutgoing || []).filter(
        (r) => r.id !== account.id
      );
      evasionStorage.saveAccount(target);
      realtimePubSub.publish('USER_UPDATED', { userId: target.id, profile: target.profile });
      realtimePubSub.publish('FRIEND_UPDATED', {
        action: 'declined',
        recipientUserIds: [target.id],
        actorId: account.id,
      });
    }

    return res.json({ success: true, ...hydrateFriendsSnapshot(account) });
  });

  app.delete('/api/friends/:targetId', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const rawTarget = decodeURIComponent(String(req.params.targetId || '')).trim();
    const target =
      evasionStorage.getAccountById(rawTarget) ||
      evasionStorage.findAccountByIdentifier(rawTarget);
    const targetId = target?.id || rawTarget;

    account.profile.friends = (account.profile.friends || []).filter(
      (f) => f.id !== targetId && f.matricule !== rawTarget
    );
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });

    if (target) {
      target.profile.friends = (target.profile.friends || []).filter(
        (f) => f.id !== account.id && f.matricule !== account.profile.matricule
      );
      evasionStorage.saveAccount(target);
      realtimePubSub.publish('USER_UPDATED', { userId: target.id, profile: target.profile });
      realtimePubSub.publish('FRIEND_UPDATED', {
        action: 'removed',
        recipientUserIds: [target.id],
        actorId: account.id,
      });
    }

    return res.json({ success: true, ...hydrateFriendsSnapshot(account) });
  });

  app.patch('/api/auth/profile', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const { alias, avatar, bio, isUniversePublic, profileType } = (req.body || {}) as {
      alias?: string;
      avatar?: string;
      bio?: string;
      isUniversePublic?: boolean;
      profileType?: 'personal' | 'professional';
    };
    if (typeof alias === 'string' && alias.trim()) {
      const nextAlias = alias.trim().slice(0, 32);
      if (evasionStorage.isAliasTakenByAnother(nextAlias, account.id)) {
        return res.status(409).json({
          success: false,
          error: 'Ce pseudo est déjà réservé par un autre compte. Choisis-en un autre.',
        });
      }
      account.profile.alias = nextAlias;
    }
    if (avatar === null || avatar === '') {
      account.profile.avatar = '';
    } else if (typeof avatar === 'string' && avatar.trim()) {
      // Allow short emoji OR /api/media/... OR Supabase Storage public URL
      account.profile.avatar = avatar.trim().slice(0, 200000);
    }
    if (typeof bio === 'string') {
      account.profile.bio = bio.trim().slice(0, 240);
    }
    if (typeof isUniversePublic === 'boolean') {
      account.profile.isUniversePublic = isUniversePublic;
    }
    if (profileType === 'personal' || profileType === 'professional') {
      account.profile.profileType = profileType;
    }
    if (req.body && 'profileMusic' in req.body) {
      const pm = req.body.profileMusic;
      const pmAudioUrl =
        typeof pm?.audioUrl === 'string' && pm.audioUrl.trim()
          ? pm.audioUrl.trim()
          : typeof pm?.previewUrl === 'string'
          ? pm.previewUrl.trim()
          : '';
      const pmCoverUrl =
        typeof pm?.cover === 'string' && pm.cover.trim()
          ? pm.cover.trim()
          : typeof pm?.albumCover === 'string'
          ? pm.albumCover.trim()
          : undefined;
      if (pm === null || pm === false || pm === '') {
        account.profile.profileMusic = undefined;
      } else if (
        pm &&
        typeof pm === 'object' &&
        pmAudioUrl &&
        (pmAudioUrl.startsWith('http') || pmAudioUrl.startsWith('/api/music/'))
      ) {
        account.profile.profileMusic = {
          id: pm.id || `pm_${Date.now()}`,
          title: typeof pm.title === 'string' ? pm.title.slice(0, 100) : 'Titre',
          titleShort: typeof pm.titleShort === 'string' ? pm.titleShort.slice(0, 100) : undefined,
          artist: typeof pm.artist === 'string' ? pm.artist.slice(0, 80) : 'Artiste',
          artistPicture: typeof pm.artistPicture === 'string' ? pm.artistPicture : undefined,
          albumTitle: typeof pm.albumTitle === 'string' ? pm.albumTitle.slice(0, 100) : undefined,
          cover: pmCoverUrl,
          albumCover: pmCoverUrl,
          audioUrl: pmAudioUrl,
          previewUrl: pmAudioUrl,
          duration: typeof pm.duration === 'number' ? pm.duration : 30,
        };
      }
    }
    // Google-connected accounts are automatically verified
    account.profile.isVerified = isAccountVerified(account);
    evasionStorage.saveAccount(account);
    const changedPosts = evasionStorage.propagateAuthorIdentity(
      account.id,
      account.profile.matricule,
      account.profile.alias,
      account.profile.avatar
    );
    changedPosts.forEach((p) => {
      realtimePubSub.publish('POST_UPDATED', { post: p });
    });
    broadcastOnlineUsers();
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    if (typeof isUniversePublic === 'boolean') {
      realtimePubSub.publish('MEDIA_FEED_UPDATED', {
        action: 'visibility_updated',
        ownerId: account.id,
        isUniversePublic,
      });
    }
    const token = signSessionToken(account.id);
    setSessionCookie(req, res, token);
    return res.json({ success: true, token, account: toPublicAuthPayload(account) });
  });

  app.post('/api/auth/profile/flame', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const flame = (req.body || {}) as {
      id?: string;
      type?: 'text' | 'photo' | 'audio' | 'video' | 'file';
      url?: string;
      text?: string;
      caption?: string;
      bgGradient?: string;
      duration?: number;
      fileName?: string;
      createdAt?: number;
      expiresAt?: number;
    };
    const allowedTypes = new Set(['text', 'photo', 'audio', 'video', 'file']);
    if (!flame || !flame.type || !allowedTypes.has(flame.type)) {
      return res.status(400).json({ success: false, error: 'Type de flamme invalide.' });
    }
    const cleanText = typeof flame.text === 'string' ? flame.text.trim().slice(0, 400) : undefined;
    const cleanUrl = typeof flame.url === 'string' ? flame.url.trim() : undefined;
    if (flame.type === 'text' && !cleanText) {
      return res.status(400).json({ success: false, error: 'Écris un message pour ta flamme texte.' });
    }
    if (flame.type !== 'text' && (!cleanUrl || cleanUrl.startsWith('idb://'))) {
      return res.status(400).json({ success: false, error: 'Média valide requis pour cette flamme.' });
    }
    const rawBgMusic = (flame as Record<string, unknown>).bgMusic as
      | {
          id?: number | string;
          title?: string;
          titleShort?: string;
          artist?: string;
          artistPicture?: string;
          albumTitle?: string;
          cover?: string;
          albumCover?: string;
          audioUrl?: string;
          previewUrl?: string;
          duration?: number;
        }
      | undefined;
    let cleanBgMusic: StoredActiveFlameItem['bgMusic'] = undefined;
    const rawFlameAudioUrl =
      typeof rawBgMusic?.audioUrl === 'string' && rawBgMusic.audioUrl.trim()
        ? rawBgMusic.audioUrl.trim()
        : typeof rawBgMusic?.previewUrl === 'string'
        ? rawBgMusic.previewUrl.trim()
        : '';
    const rawFlameCoverUrl =
      typeof rawBgMusic?.cover === 'string' && rawBgMusic.cover.trim()
        ? rawBgMusic.cover.trim()
        : typeof rawBgMusic?.albumCover === 'string'
        ? rawBgMusic.albumCover.trim()
        : undefined;
    if (
      rawBgMusic &&
      typeof rawBgMusic === 'object' &&
      rawFlameAudioUrl &&
      (rawFlameAudioUrl.startsWith('http') || rawFlameAudioUrl.startsWith('/api/music/'))
    ) {
      cleanBgMusic = {
        id: rawBgMusic.id || `m_${Date.now()}`,
        title: typeof rawBgMusic.title === 'string' ? rawBgMusic.title.slice(0, 100) : 'Titre',
        titleShort: typeof rawBgMusic.titleShort === 'string' ? rawBgMusic.titleShort.slice(0, 100) : undefined,
        artist: typeof rawBgMusic.artist === 'string' ? rawBgMusic.artist.slice(0, 80) : 'Artiste',
        artistPicture:
          typeof rawBgMusic.artistPicture === 'string' &&
          (rawBgMusic.artistPicture.startsWith('http') || rawBgMusic.artistPicture.startsWith('/api/music/'))
            ? rawBgMusic.artistPicture
            : undefined,
        albumTitle: typeof rawBgMusic.albumTitle === 'string' ? rawBgMusic.albumTitle.slice(0, 100) : undefined,
        cover:
          rawFlameCoverUrl && (rawFlameCoverUrl.startsWith('http') || rawFlameCoverUrl.startsWith('/api/music/'))
            ? rawFlameCoverUrl
            : undefined,
        albumCover:
          rawFlameCoverUrl && (rawFlameCoverUrl.startsWith('http') || rawFlameCoverUrl.startsWith('/api/music/'))
            ? rawFlameCoverUrl
            : undefined,
        audioUrl: rawFlameAudioUrl,
        previewUrl: rawFlameAudioUrl,
        duration: typeof rawBgMusic.duration === 'number' ? rawBgMusic.duration : 30,
      };
    }

    const now = Date.now();
    account.profile.activeFlame = {
      id: flame.id || `flame_${now}_${Math.random().toString(36).slice(2, 6)}`,
      type: flame.type,
      url: cleanUrl,
      text: cleanText,
      caption: typeof flame.caption === 'string' && flame.caption.trim() ? flame.caption.trim().slice(0, 180) : undefined,
      bgGradient: typeof flame.bgGradient === 'string' ? flame.bgGradient.slice(0, 64) : undefined,
      duration: typeof flame.duration === 'number' && isFinite(flame.duration) ? Math.max(1, Math.round(flame.duration)) : undefined,
      fileName: typeof flame.fileName === 'string' ? flame.fileName.slice(0, 120) : undefined,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      comments: [],
      bgMusic: cleanBgMusic,
    };
    evasionStorage.saveAccount(account);
    broadcastOnlineUsers();
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    realtimePubSub.publish('MEDIA_FEED_UPDATED', {
      action: 'flame_added',
      ownerId: account.id,
      itemId: account.profile.activeFlame.id,
      url: account.profile.activeFlame.url,
    });

    const ownerAlias = account.profile.alias || account.profile.matricule;
    const labelMap: Record<string, string> = {
      text: 'une Flamme texte ✍️',
      photo: 'une Flamme photo 📸',
      video: 'une Flamme vidéo 🎬',
      audio: 'une Flamme audio 🎙️',
      file: 'une Flamme fichier 📄',
    };
    const musicMention = cleanBgMusic ? ` 🎵 avec le titre « ${cleanBgMusic.title} » de ${cleanBgMusic.artist}` : '';
    notifyFriendsOfNewMedia(account, {
      kind: 'flame',
      mediaType: flame.type,
      title: `🔥 Nouvelle Flamme 24h de ${ownerAlias}`,
      body: `${ownerAlias} a partagé ${labelMap[flame.type] || 'une Flamme'}${musicMention} visible pendant 24h sur son profil !`,
    });

    return res.json({ success: true, account: toPublicAuthPayload(account), profile: account.profile });
  });

  app.delete('/api/auth/profile/flame', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const removedFlame = account.profile.activeFlame;
    delete account.profile.activeFlame;
    evasionStorage.saveAccount(account);
    broadcastOnlineUsers();
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    realtimePubSub.publish('MEDIA_FEED_UPDATED', {
      action: 'deleted',
      ownerId: account.id,
      itemId: removedFlame?.id,
      url: removedFlame?.url,
    });
    return res.json({ success: true, account: toPublicAuthPayload(account), profile: account.profile });
  });

  // Music Library Search, Refresh, Stream, Cover & Chart Proxy Routes (100% internal, zero external branding)
  function buildInternalCoverUrl(rawCover?: string | null): string {
    if (!rawCover || !rawCover.startsWith('http')) return '';
    return `/api/music/cover?url=${encodeURIComponent(rawCover)}`;
  }

  function buildInternalAudioStreamUrl(opts: {
    id: number | string;
    title: string;
    artist: string;
    preview: string;
  }): string {
    const params = new URLSearchParams();
    params.set('id', String(opts.id));
    params.set('title', opts.title);
    params.set('artist', opts.artist);
    if (opts.preview && opts.preview.startsWith('http')) {
      params.set('url', opts.preview);
    }
    return `/api/music/stream?${params.toString()}`;
  }

  async function fetchItunesFallbackTracks(query: string, limit = 15) {
    try {
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (!itunesRes.ok) return [];
      const data = (await itunesRes.json()) as {
        results?: Array<{
          trackId?: number;
          trackName?: string;
          artistName?: string;
          collectionName?: string;
          artworkUrl100?: string;
          previewUrl?: string;
          trackTimeMillis?: number;
        }>;
      };
      return (data.results || [])
        .filter((item) => item && item.previewUrl && item.previewUrl.startsWith('http'))
        .map((item) => {
          const id = item.trackId || Math.floor(Math.random() * 1e9);
          const title = item.trackName || 'Titre';
          const artist = item.artistName || 'Artiste';
          const rawCover = (item.artworkUrl100 || '').replace('100x100bb', '300x300bb');
          const cover = buildInternalCoverUrl(rawCover);
          const audioUrl = buildInternalAudioStreamUrl({
            id,
            title,
            artist,
            preview: item.previewUrl!,
          });
          return {
            id,
            title,
            titleShort: title,
            artist,
            cover,
            albumCover: cover,
            albumTitle: item.collectionName || '',
            audioUrl,
            previewUrl: audioUrl,
            duration: 30,
          };
        });
    } catch {
      return [];
    }
  }

  async function resolveFreshMusicPreview(opts: {
    id?: string;
    title?: string;
    artist?: string;
  }): Promise<string | null> {
    const rawId = (opts.id || '').trim();
    const rawTitle = (opts.title || '').trim();
    const rawArtist = (opts.artist || '').trim();
    try {
      if (/^\d+$/.test(rawId)) {
        const trackRes = await fetch(`https://api.deezer.com/track/${encodeURIComponent(rawId)}`, {
          headers: { 'User-Agent': 'Evasion-App/1.0' },
        });
        if (trackRes.ok) {
          const trackData = (await trackRes.json()) as { preview?: string };
          if (trackData?.preview && trackData.preview.startsWith('http')) {
            return trackData.preview;
          }
        }
      }
      const searchQuery = `${rawTitle} ${rawArtist}`.trim();
      if (searchQuery) {
        const searchRes = await fetch(
          `https://api.deezer.com/search?q=${encodeURIComponent(searchQuery)}&limit=5`,
          { headers: { 'User-Agent': 'Evasion-App/1.0' } }
        );
        if (searchRes.ok) {
          const searchData = (await searchRes.json()) as {
            data?: Array<{ preview?: string }>;
          };
          const match = (searchData?.data || []).find(
            (t) => t && typeof t.preview === 'string' && t.preview.startsWith('http')
          );
          if (match?.preview) {
            return match.preview;
          }
        }

        // Secondary fallback via iTunes audio preview
        const itunesRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&media=music&entity=song&limit=3`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (itunesRes.ok) {
          const itunesData = (await itunesRes.json()) as {
            results?: Array<{ previewUrl?: string }>;
          };
          const itMatch = (itunesData?.results || []).find(
            (t) => t && typeof t.previewUrl === 'string' && t.previewUrl.startsWith('http')
          );
          if (itMatch?.previewUrl) {
            return itMatch.previewUrl;
          }
        }
      }
    } catch {
      // ignore transient upstream failure
    }
    return null;
  }

  function isUpstreamAudioUrlExpired(candidate: string): boolean {
    if (!candidate) return true;
    let decoded = candidate;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      // keep raw
    }
    const match = decoded.match(/exp=(\d{9,12})/);
    if (!match) return false;
    const expSec = Number(match[1]);
    if (!Number.isFinite(expSec)) return false;
    return expSec <= Math.floor(Date.now() / 1000) + 30;
  }

  function mapMusicTrackList(
    rawList: Array<{
      id: number;
      title: string;
      title_short?: string;
      duration?: number;
      preview?: string;
      artist?: {
        id: number;
        name: string;
        picture?: string;
        picture_medium?: string;
      };
      album?: {
        id: number;
        title: string;
        cover?: string;
        cover_medium?: string;
      };
    }>
  ) {
    return rawList
      .filter((item) => item && item.preview && item.preview.startsWith('http'))
      .map((item) => {
        const title = item.title_short || item.title || 'Titre';
        const artist = item.artist?.name || 'Artiste';
        const rawCover = item.album?.cover_medium || item.album?.cover || '';
        const cover = buildInternalCoverUrl(rawCover);
        const audioUrl = buildInternalAudioStreamUrl({
          id: item.id,
          title,
          artist,
          preview: item.preview!,
        });
        return {
          id: item.id,
          title,
          titleShort: title,
          artist,
          cover,
          albumCover: cover,
          albumTitle: item.album?.title || '',
          audioUrl,
          previewUrl: audioUrl,
          duration: item.duration || 30,
        };
      });
  }

  // Primary internal music search endpoint: GET /api/music?q=${encodeURIComponent(query)}
  app.all('/api/music', async (req, res) => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      return res.status(400).json({ error: 'Veuillez fournir un terme de recherche' });
    }

    try {
      const deezerResponse = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`,
        { headers: { 'User-Agent': 'Evasion-App/1.0' } }
      );

      let tracks: ReturnType<typeof mapMusicTrackList> = [];
      if (deezerResponse.ok) {
        const rawData = (await deezerResponse.json()) as {
          data?: Parameters<typeof mapMusicTrackList>[0];
        };
        tracks = mapMusicTrackList(rawData.data || []);
      }

      if (tracks.length === 0) {
        tracks = await fetchItunesFallbackTracks(q, 15);
      }

      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).json(tracks);
    } catch (error) {
      console.error('Erreur Proxy:', error);
      const fallback = await fetchItunesFallbackTracks(q, 15);
      if (fallback.length > 0) {
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).json(fallback);
      }
      return res.status(500).json({ error: 'Impossible de récupérer les musiques' });
    }
  });

  // Internal cover image proxy so no external image domain is ever requested by the client
  app.get('/api/music/cover', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const isAllowedImageCdn =
      rawUrl.startsWith('https://') &&
      (rawUrl.includes('dzcdn.net') ||
        rawUrl.includes('deezer.com') ||
        rawUrl.includes('mzstatic.com') ||
        rawUrl.includes('apple.com'));
    if (!isAllowedImageCdn) {
      return res.status(400).send('Invalid cover image URL');
    }
    try {
      const upstream = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!upstream.ok) {
        return res.status(upstream.status).send('Cover unavailable');
      }
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.send(buf);
    } catch {
      return res.status(502).send('Error proxying cover image');
    }
  });

  app.get(['/api/music/stream', '/api/music/deezer/stream'], async (req, res) => {
    let rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const rawTitle = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    const rawArtist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';

    if ((!rawUrl || isUpstreamAudioUrlExpired(rawUrl)) && (rawId || rawTitle)) {
      const fresh = await resolveFreshMusicPreview({ id: rawId, title: rawTitle, artist: rawArtist });
      if (fresh) {
        rawUrl = fresh;
      }
    }

    const isAllowedAudioCdn =
      rawUrl.startsWith('http') &&
      (rawUrl.includes('dzcdn.net') ||
        rawUrl.includes('deezer.com') ||
        rawUrl.includes('mzstatic.com') ||
        rawUrl.includes('apple.com'));

    if (!isAllowedAudioCdn) {
      return res.status(400).send('Invalid audio stream URL');
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      let upstream = await fetch(rawUrl, { headers });
      if (!upstream.ok && upstream.status !== 206 && (rawId || rawTitle)) {
        const fresh = await resolveFreshMusicPreview({ id: rawId, title: rawTitle, artist: rawArtist });
        if (fresh && fresh !== rawUrl) {
          upstream = await fetch(fresh, { headers });
        }
      }

      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).send('Upstream stream error');
      }

      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      if (upstream.headers.has('content-length')) {
        res.setHeader('Content-Length', upstream.headers.get('content-length')!);
      }
      if (upstream.headers.has('content-range')) {
        res.setHeader('Content-Range', upstream.headers.get('content-range')!);
        res.status(206);
      }
      const arrayBuffer = await upstream.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    } catch {
      return res.status(502).send('Error proxying audio stream');
    }
  });

  app.get(['/api/music/refresh', '/api/music/deezer/refresh'], async (req, res) => {
    const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const rawTitle = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    const rawArtist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
    const fresh = await resolveFreshMusicPreview({ id: rawId, title: rawTitle, artist: rawArtist });
    if (fresh) {
      const proxied = buildInternalAudioStreamUrl({
        id: rawId || '0',
        title: rawTitle,
        artist: rawArtist,
        preview: fresh,
      });
      return res.json({ success: true, previewUrl: proxied, audioUrl: proxied });
    }
    return res.json({ success: false, previewUrl: null, audioUrl: null });
  });

  app.get(['/api/music/search', '/api/music/deezer/search'], async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      return res.json({ success: true, tracks: [] });
    }
    try {
      const musicRes = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`,
        { headers: { 'User-Agent': 'Evasion-App/1.0' } }
      );
      let tracks: ReturnType<typeof mapMusicTrackList> = [];
      if (musicRes.ok) {
        const data = (await musicRes.json()) as { data?: Parameters<typeof mapMusicTrackList>[0] };
        const rawList = Array.isArray(data?.data) ? data.data : [];
        tracks = mapMusicTrackList(rawList);
      }
      if (tracks.length === 0) {
        tracks = await fetchItunesFallbackTracks(q, 15);
      }
      return res.json({ success: true, tracks });
    } catch {
      const fallback = await fetchItunesFallbackTracks(q, 15);
      return res.json({ success: true, tracks: fallback });
    }
  });

  app.get(['/api/music/chart', '/api/music/deezer/chart'], async (_req, res) => {
    try {
      const musicRes = await fetch('https://api.deezer.com/chart/0/tracks?limit=15', {
        headers: { 'User-Agent': 'Evasion-App/1.0' },
      });
      if (musicRes.ok) {
        const data = (await musicRes.json()) as { data?: Parameters<typeof mapMusicTrackList>[0] };
        const rawList = Array.isArray(data?.data) ? data.data : [];
        const tracks = mapMusicTrackList(rawList);
        if (tracks.length > 0) {
          return res.json({ success: true, tracks });
        }
      }
      const fallback = await fetchItunesFallbackTracks('top hits', 15);
      return res.json({ success: true, tracks: fallback });
    } catch {
      const fallback = await fetchItunesFallbackTracks('top hits', 15);
      return res.json({ success: true, tracks: fallback });
    }
  });

  app.post('/api/users/:identifier/flame/comment', (req, res) => {
    const author = getOrProvisionAccount(req, res);
    const rawIdentifier = decodeURIComponent(String(req.params.identifier || '')).trim();
    const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 300) : '';
    if (!rawIdentifier || !content) {
      return res.status(400).json({ success: false, error: 'Commentaire vide ou profil manquant.' });
    }
    const target =
      evasionStorage.findAccountByPublicSlug(rawIdentifier) ||
      evasionStorage.getAccountById(rawIdentifier) ||
      evasionStorage.findAccountByIdentifier(rawIdentifier);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Profil introuvable.' });
    }
    const activeFlame = getValidActiveFlame(target);
    if (!activeFlame) {
      return res.status(404).json({ success: false, error: 'Cette flamme 24h a expiré ou a été retirée.' });
    }
    const giftType = typeof req.body?.giftType === 'string' ? req.body.giftType.slice(0, 40) : undefined;
    if (giftType === 'key' && author.id !== target.id) {
      if ((author.profile.keysAvailable || 0) > 0) {
        author.profile.keysAvailable = Math.max(0, (author.profile.keysAvailable || 0) - 1);
        author.profile.keysGivenTotal = (author.profile.keysGivenTotal || 0) + 1;
        target.profile.keysAvailable = (target.profile.keysAvailable || 0) + 1;
        evasionStorage.saveAccount(author);
      }
    } else if (giftType === 'padlock' && author.id !== target.id) {
      if ((author.profile.padlocksAvailable || 0) > 0) {
        author.profile.padlocksAvailable = Math.max(0, (author.profile.padlocksAvailable || 0) - 1);
        target.profile.padlocksAvailable = (target.profile.padlocksAvailable || 0) + 1;
        evasionStorage.saveAccount(author);
      }
    }

    const newComment = {
      id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      authorId: author.id,
      authorMatricule: author.profile.matricule,
      authorAlias: author.profile.alias || author.profile.matricule,
      authorAvatar: author.profile.avatar || '⛓️',
      authorNeonColor: author.profile.neonColor,
      authorIsVerified: isAccountVerified(author),
      content,
      giftType,
      createdAt: Date.now(),
    };
    activeFlame.comments = [...(activeFlame.comments || []), newComment].slice(-100);
    target.profile.activeFlame = activeFlame;
    evasionStorage.saveAccount(target);
    realtimePubSub.publish('USER_UPDATED', { userId: target.id, profile: target.profile });

    if (target.id !== author.id) {
      notifyFriendsOfNewMedia(author, {
        kind: 'flame_comment',
        mediaType: 'comment',
        title: giftType ? `🎁 ${newComment.authorAlias} t’a offert un cadeau sur ta Flamme !` : `💬 ${newComment.authorAlias} a commenté ta Flamme 🔥`,
        body: `« ${content.slice(0, 90)} »`,
        recipientIdsOverride: [target.id],
      });
    }

    return res.json({
      success: true,
      comment: newComment,
      activeFlame,
      authorKeys: author.profile.keysAvailable,
      authorPadlocks: author.profile.padlocksAvailable,
    });
  });

  const computePlatformKeyStats = () => {
    const allPosts = evasionStorage.getPosts();
    const allAccounts = evasionStorage.getAllAccounts();

    // Total keys spent to unlock confessions
    const postKeysSpent = allPosts.reduce((sum, p) => sum + (p.keysCount || 0), 0);

    // Total keys given / spent by registered users
    const userKeysGiven = allAccounts.reduce((sum, a) => sum + (a.profile?.keysGivenTotal || 0), 0);

    // Authoritative total keys spent on the platform
    const totalKeysSpent = Math.max(postKeysSpent, userKeysGiven);

    // Total keys available across all accounts
    const totalKeysAvailable = allAccounts.reduce((sum, a) => sum + (a.profile?.keysAvailable || 0), 0);

    // Total padlocks available
    const totalPadlocksAvailable = allAccounts.reduce((sum, a) => sum + (a.profile?.padlocksAvailable || 0), 0);

    // Total padlocks sealed on posts
    const totalPadlocksSealed = allPosts.reduce((sum, p) => sum + (p.padlocksSealCount || 1), 0);

    // Escaped confessions
    const totalEscapes = allPosts.filter((p) => p.status === 'escaped').length;

    return {
      totalKeysSpent,
      totalKeysAvailable,
      totalPadlocksAvailable,
      totalPadlocksSealed,
      totalEscapes,
      totalPosts: allPosts.length,
      timestamp: Date.now(),
    };
  };

  app.get('/api/platform/keys-stats', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      stats: computePlatformKeyStats(),
    });
  });

  app.get('/api/users/:identifier/profile', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const rawIdentifier = decodeURIComponent(String(req.params.identifier || '')).trim();
    if (!rawIdentifier) {
      return res.status(400).json({ success: false, error: 'Identifiant requis.' });
    }
    const account =
      evasionStorage.findAccountByPublicSlug(rawIdentifier) ||
      evasionStorage.getAccountById(rawIdentifier) ||
      evasionStorage.findAccountByIdentifier(rawIdentifier);

    const allPosts = evasionStorage.getPosts();
    const allLives = evasionStorage.getLives();

    if (account) {
      const p = account.profile;
      const rawMedia = Array.isArray(p.universeMedia) ? p.universeMedia : [];
      const userPosts = allPosts.filter(
        (post) => post.authorId === p.id || post.authorMatricule === p.matricule
      );

      // Merge user's universeMedia with any media from their posts so all media is visible
      const combinedMedia = [...rawMedia];
      const seenMediaUrls = new Set(rawMedia.map((m) => m?.url).filter(Boolean));
      for (const post of userPosts) {
        if (post.videoUrl && !post.videoUrl.startsWith('idb://') && !seenMediaUrls.has(post.videoUrl)) {
          seenMediaUrls.add(post.videoUrl);
          combinedMedia.push({
            id: `post_vid_${post.id}`,
            type: 'video' as const,
            url: post.videoUrl,
            caption: post.content || 'Vidéo de confession',
            duration: post.videoDuration,
            bgMusic: post.bgMusic,
            keysCount: Number(post.keysCount || 0),
            padlocksCount: Number(post.padlocksSealCount || 1),
            visibility: 'public' as const,
            createdAt: Number(post.createdAt || Date.now()),
          });
        }
        if (post.imageUrl && !post.imageUrl.startsWith('idb://') && !seenMediaUrls.has(post.imageUrl)) {
          seenMediaUrls.add(post.imageUrl);
          combinedMedia.push({
            id: `post_img_${post.id}`,
            type: 'photo' as const,
            url: post.imageUrl,
            caption: post.content || 'Photo de confession',
            bgMusic: post.bgMusic,
            keysCount: Number(post.keysCount || 0),
            padlocksCount: Number(post.padlocksSealCount || 1),
            visibility: 'public' as const,
            createdAt: Number(post.createdAt || Date.now()),
          });
        }
        if (post.audioNote?.audioData && !post.audioNote.audioData.startsWith('idb://') && !seenMediaUrls.has(post.audioNote.audioData)) {
          seenMediaUrls.add(post.audioNote.audioData);
          combinedMedia.push({
            id: `post_aud_${post.id}`,
            type: 'audio' as const,
            url: post.audioNote.audioData,
            caption: post.content || 'Note vocale',
            duration: post.audioNote.duration,
            bgMusic: post.bgMusic,
            keysCount: Number(post.keysCount || 0),
            padlocksCount: Number(post.padlocksSealCount || 1),
            visibility: 'public' as const,
            createdAt: Number(post.createdAt || Date.now()),
          });
        }
      }

      // Media is always visible to all users
      const visibleMedia = combinedMedia.filter((m) => m && m.url && !m.url.startsWith('idb://'));
      const totalPostKeys = userPosts.reduce((sum, post) => sum + (post.keysCount || 0), 0);
      const totalPostPadlocks = userPosts.reduce(
        (sum, post) => sum + (post.padlocksSealCount || 1),
        0
      );
      const activeLive = allLives.find(
        (l) =>
          l.isActive &&
          (l.hostId === p.id ||
            l.hostMatricule === p.matricule ||
            l.guests?.some((g) => g.userId === p.id || g.matricule === p.matricule))
      );
      return res.json({
        success: true,
        profile: {
          id: p.id,
          matricule: p.matricule,
          alias: p.alias,
          avatar: p.avatar,
          bio: p.bio || '',
          cellNumber: p.cellNumber,
          publicShareSlug: p.publicShareSlug,
          detentionDays: p.detentionDays || p.streakDays || 1,
          keysAvailable: p.keysAvailable || 0,
          keysGivenTotal: p.keysGivenTotal || 0,
          padlocksAvailable: p.padlocksAvailable || 0,
          escapedCount: p.escapedCount || 0,
          points: p.points || 0,
          isVipCell: !!p.isVipCell,
          neonColor: p.neonColor,
          cellBorderFrame: p.cellBorderFrame,
          badges: Array.isArray(p.badges) ? p.badges : [],
          universeMedia: visibleMedia,
          activeFlame: getValidActiveFlame(account),
          isUniversePublic: true,
          universeStorageQuota: Math.max(25, Number(p.universeStorageQuota || 25)),
          isUniverseStorageUnlimited: !!p.isUniverseStorageUnlimited,
          profileType: p.profileType || 'personal',
          isVerified: isAccountVerified(account),
          activeLiveId: activeLive?.id,
          postsCount: userPosts.length,
          totalPostKeys,
          totalPostPadlocks,
        },
      });
    }

    // Fallback: build profile snapshot from posts/lives/online presence if user isn't registered yet
    const matchedPosts = allPosts.filter(
      (post) =>
        post.authorId === rawIdentifier ||
        post.authorMatricule.toLowerCase() === rawIdentifier.toLowerCase() ||
        (post.authorAlias && post.authorAlias.toLowerCase() === rawIdentifier.toLowerCase())
    );
    const activeLive = allLives.find(
      (l) =>
        l.isActive &&
        (l.hostId === rawIdentifier ||
          l.hostMatricule.toLowerCase() === rawIdentifier.toLowerCase() ||
          l.hostName.toLowerCase() === rawIdentifier.toLowerCase())
    );
    const firstPost = matchedPosts[0];
    if (!firstPost && !activeLive) {
      return res.status(404).json({ success: false, error: 'Profil introuvable.' });
    }

    const fallbackMedia = [];
    const seenFallbackUrls = new Set<string>();
    for (const mp of matchedPosts) {
      if (mp.videoUrl && !mp.videoUrl.startsWith('idb://') && !seenFallbackUrls.has(mp.videoUrl)) {
        seenFallbackUrls.add(mp.videoUrl);
        fallbackMedia.push({
          id: `post_vid_${mp.id}`,
          type: 'video' as const,
          url: mp.videoUrl,
          caption: mp.content || 'Vidéo de confession',
          duration: mp.videoDuration,
          bgMusic: mp.bgMusic,
          keysCount: Number(mp.keysCount || 0),
          padlocksCount: Number(mp.padlocksSealCount || 1),
          visibility: 'public' as const,
          createdAt: Number(mp.createdAt || Date.now()),
        });
      }
      if (mp.imageUrl && !mp.imageUrl.startsWith('idb://') && !seenFallbackUrls.has(mp.imageUrl)) {
        seenFallbackUrls.add(mp.imageUrl);
        fallbackMedia.push({
          id: `post_img_${mp.id}`,
          type: 'photo' as const,
          url: mp.imageUrl,
          caption: mp.content || 'Photo de confession',
          bgMusic: mp.bgMusic,
          keysCount: Number(mp.keysCount || 0),
          padlocksCount: Number(mp.padlocksSealCount || 1),
          visibility: 'public' as const,
          createdAt: Number(mp.createdAt || Date.now()),
        });
      }
      if (mp.audioNote?.audioData && !mp.audioNote.audioData.startsWith('idb://') && !seenFallbackUrls.has(mp.audioNote.audioData)) {
        seenFallbackUrls.add(mp.audioNote.audioData);
        fallbackMedia.push({
          id: `post_aud_${mp.id}`,
          type: 'audio' as const,
          url: mp.audioNote.audioData,
          caption: mp.content || 'Note vocale',
          duration: mp.audioNote.duration,
          bgMusic: mp.bgMusic,
          keysCount: Number(mp.keysCount || 0),
          padlocksCount: Number(mp.padlocksSealCount || 1),
          visibility: 'public' as const,
          createdAt: Number(mp.createdAt || Date.now()),
        });
      }
    }

    const totalPostKeys = matchedPosts.reduce((sum, post) => sum + (post.keysCount || 0), 0);
    const totalPostPadlocks = matchedPosts.reduce(
      (sum, post) => sum + (post.padlocksSealCount || 1),
      0
    );
    return res.json({
      success: true,
      profile: {
        id: firstPost?.authorId || activeLive?.hostId || rawIdentifier,
        matricule: firstPost?.authorMatricule || activeLive?.hostMatricule || rawIdentifier,
        alias: firstPost?.authorAlias || activeLive?.hostName || firstPost?.authorMatricule || rawIdentifier,
        avatar: firstPost?.authorAvatar || activeLive?.hostAvatar || '⛓️',
        bio: '',
        detentionDays: 1,
        keysAvailable: totalPostKeys,
        keysGivenTotal: 0,
        padlocksAvailable: totalPostPadlocks,
        escapedCount: matchedPosts.filter((p) => p.status === 'escaped').length,
        points: totalPostKeys * 100 + totalPostPadlocks * 150,
        isVipCell: false,
        neonColor: firstPost?.authorNeonColor || activeLive?.hostNeonColor,
        cellBorderFrame: firstPost?.authorFrame || activeLive?.hostFrame,
        badges: [],
        universeMedia: fallbackMedia,
        activeLiveId: activeLive?.id,
        postsCount: matchedPosts.length,
        totalPostKeys,
        totalPostPadlocks,
      },
    });
  });

  app.post('/api/auth/universe', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const {
      type,
      url,
      caption,
      duration,
      clientId,
      fileName,
      mimeType,
      fileSize,
      visibility,
      alias,
      avatar,
      bio,
    } = (req.body || {}) as {
      type?: 'photo' | 'audio' | 'video' | 'file';
      url?: string;
      caption?: string;
      duration?: number;
      clientId?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      visibility?: 'public' | 'private';
      alias?: string;
      avatar?: string;
      bio?: string;
    };
    if (type !== 'photo' && type !== 'audio' && type !== 'video' && type !== 'file') {
      return res.status(400).json({ success: false, error: 'Type média invalide (photo, audio, video ou file).' });
    }
    const cleanUrl = typeof url === 'string' ? url.trim() : '';
    if (!cleanUrl || cleanUrl.startsWith('idb://')) {
      return res.status(400).json({ success: false, error: 'URL serveur ou donnée média valide requise.' });
    }

    // Preserve active custom identity (alias, avatar, bio) sent with media upload so the profile never resets
    if (
      typeof alias === 'string' &&
      alias.trim() &&
      alias.trim() !== 'Spectre En Quête' &&
      account.profile.alias !== alias.trim() &&
      !evasionStorage.isAliasTakenByAnother(alias.trim(), account.id)
    ) {
      account.profile.alias = alias.trim().slice(0, 32);
    }
    if (
      typeof avatar === 'string' &&
      avatar.trim() &&
      avatar.trim() !== '⛓️' &&
      !avatar.trim().startsWith('idb://') &&
      account.profile.avatar !== avatar.trim()
    ) {
      account.profile.avatar = avatar.trim().slice(0, 200000);
    }
    if (typeof bio === 'string' && bio.trim() && account.profile.bio !== bio.trim()) {
      account.profile.bio = bio.trim().slice(0, 240);
    }

    const safeId =
      typeof clientId === 'string' && /^uni_[a-zA-Z0-9_]+$/.test(clientId.trim())
        ? clientId.trim().slice(0, 64)
        : `uni_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const existing = Array.isArray(account.profile.universeMedia) ? account.profile.universeMedia : [];
    const previousMatch = existing.find((m) => m.id === safeId);
    const isUnlimited =
      Boolean(account.profile.isUniverseStorageUnlimited) || isTest2026Account(account);
    const effectiveQuota = Math.max(25, Number(account.profile.universeStorageQuota || 25));

    if (!previousMatch && !isUnlimited && existing.length >= effectiveQuota) {
      return res.status(402).json({
        success: false,
        code: 'STORAGE_LIMIT_REACHED',
        currentCount: existing.length,
        quota: effectiveQuota,
        error: `Mémoire pleine (${existing.length}/${effectiveQuota} médias). Débloque plus de mémoire pour continuer sans rien effacer.`,
      });
    }

    const resolvedVisibility: 'public' | 'private' =
      visibility === 'private' || visibility === 'public'
        ? visibility
        : previousMatch?.visibility ||
          (account.profile.isUniversePublic === false ? 'private' : 'public');

    const rawBg = req.body?.bgMusic;
    let cleanMediaBgMusic: StoredActiveFlameItem['bgMusic'] = undefined;
    const rawMediaAudioUrl =
      typeof rawBg?.audioUrl === 'string' && rawBg.audioUrl.trim()
        ? rawBg.audioUrl.trim()
        : typeof rawBg?.previewUrl === 'string'
        ? rawBg.previewUrl.trim()
        : '';
    const rawMediaCoverUrl =
      typeof rawBg?.cover === 'string' && rawBg.cover.trim()
        ? rawBg.cover.trim()
        : typeof rawBg?.albumCover === 'string'
        ? rawBg.albumCover.trim()
        : undefined;
    if (
      rawBg &&
      typeof rawBg === 'object' &&
      rawMediaAudioUrl &&
      (rawMediaAudioUrl.startsWith('http') || rawMediaAudioUrl.startsWith('/api/music/'))
    ) {
      cleanMediaBgMusic = {
        id: rawBg.id || `mb_${Date.now()}`,
        title: typeof rawBg.title === 'string' ? rawBg.title.slice(0, 100) : 'Titre',
        titleShort: typeof rawBg.titleShort === 'string' ? rawBg.titleShort.slice(0, 100) : undefined,
        artist: typeof rawBg.artist === 'string' ? rawBg.artist.slice(0, 80) : 'Artiste',
        artistPicture: typeof rawBg.artistPicture === 'string' ? rawBg.artistPicture : undefined,
        albumTitle: typeof rawBg.albumTitle === 'string' ? rawBg.albumTitle.slice(0, 100) : undefined,
        cover: rawMediaCoverUrl,
        albumCover: rawMediaCoverUrl,
        audioUrl: rawMediaAudioUrl,
        previewUrl: rawMediaAudioUrl,
        duration: typeof rawBg.duration === 'number' ? rawBg.duration : 30,
      };
    }

    const item = {
      id: safeId,
      type,
      url: cleanUrl,
      caption: typeof caption === 'string' && caption.trim() ? caption.trim().slice(0, 140) : undefined,
      duration: typeof duration === 'number' && isFinite(duration) ? Math.max(1, Math.round(duration)) : undefined,
      fileName: typeof fileName === 'string' && fileName.trim() ? fileName.trim().slice(0, 120) : undefined,
      mimeType: typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim().slice(0, 80) : undefined,
      fileSize: typeof fileSize === 'number' && isFinite(fileSize) && fileSize > 0 ? Math.round(fileSize) : undefined,
      keysCount: previousMatch?.keysCount || 0,
      padlocksCount: previousMatch?.padlocksCount || 0,
      visibility: resolvedVisibility,
      bgMusic: cleanMediaBgMusic || previousMatch?.bgMusic,
      createdAt: previousMatch?.createdAt || Date.now(),
    };
    const maxCap = isUnlimited ? 5000 : Math.max(effectiveQuota, existing.length + 1);
    account.profile.universeMedia = [
      item,
      ...existing.filter((m) => m.id !== item.id),
    ].slice(0, maxCap);
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    realtimePubSub.publish('MEDIA_FEED_UPDATED', {
      action: resolvedVisibility === 'private' ? 'deleted' : 'added',
      ownerId: account.id,
      itemId: item.id,
      url: item.url,
    });
    if (resolvedVisibility !== 'private' && !previousMatch) {
      const ownerAlias = account.profile.alias || account.profile.matricule;
      const typeLabel =
        type === 'photo'
          ? 'une nouvelle photo 📸'
          : type === 'video'
          ? 'une nouvelle vidéo 🎬'
          : type === 'audio'
          ? 'un nouvel audio 🎙️'
          : 'un nouveau fichier 📄';
      notifyFriendsOfNewMedia(account, {
        kind: 'universe',
        mediaType: type,
        title: `✨ Nouveau média de ${ownerAlias}`,
        body: `${ownerAlias} a publié ${typeLabel} sur son profil !`,
      });
    }
    const token = signSessionToken(account.id);
    setSessionCookie(req, res, token);
    return res.json({ success: true, token, item, account: toPublicAuthPayload(account) });
  });

  app.post('/api/auth/universe/visibility', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const { itemId, visibility, isUniversePublic, applyToAll } = (req.body || {}) as {
      itemId?: string;
      visibility?: 'public' | 'private';
      isUniversePublic?: boolean;
      applyToAll?: boolean;
    };

    if (typeof isUniversePublic === 'boolean') {
      account.profile.isUniversePublic = isUniversePublic;
      if (applyToAll && Array.isArray(account.profile.universeMedia)) {
        const nextVis: 'public' | 'private' = isUniversePublic ? 'public' : 'private';
        account.profile.universeMedia = account.profile.universeMedia.map((m) => ({
          ...m,
          visibility: nextVis,
        }));
      }
    }

    if (typeof itemId === 'string' && itemId.trim() && (visibility === 'public' || visibility === 'private')) {
      const targetId = itemId.trim();
      const list = Array.isArray(account.profile.universeMedia) ? account.profile.universeMedia : [];
      account.profile.universeMedia = list.map((m) =>
        m.id === targetId ? { ...m, visibility } : m
      );
      const updatedItem = account.profile.universeMedia.find((m) => m.id === targetId);
      if (updatedItem) {
        realtimePubSub.publish('MEDIA_FEED_UPDATED', {
          action: visibility === 'private' ? 'deleted' : 'added',
          ownerId: account.id,
          itemId: updatedItem.id,
          url: updatedItem.url,
        });
      }
    } else {
      realtimePubSub.publish('MEDIA_FEED_UPDATED', {
        action: 'visibility_updated',
        ownerId: account.id,
        isUniversePublic: account.profile.isUniversePublic !== false,
      });
    }

    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    const token = signSessionToken(account.id);
    setSessionCookie(req, res, token);
    return res.json({ success: true, token, account: toPublicAuthPayload(account) });
  });

  const removeCreatorMediaEverywhere = (
    account: StoredAccount,
    itemId: string,
    explicitUrl?: string
  ) => {
    const existing = Array.isArray(account.profile.universeMedia) ? account.profile.universeMedia : [];
    const matched = existing.find((m) => m.id === itemId);
    const targetUrl = (explicitUrl || matched?.url || '').trim();

    account.profile.universeMedia = existing.filter(
      (m) => m.id !== itemId && (!targetUrl || m.url !== targetUrl)
    );
    evasionStorage.saveAccount(account);

    // If any post by this creator references the deleted media item or URL, strip the media from that post
    for (const post of evasionStorage.getPosts()) {
      const isOwner =
        post.authorId === account.id || post.authorMatricule === account.profile.matricule;
      if (!isOwner) continue;
      const matchesPostId = post.id === itemId;
      const matchesVideo = Boolean(targetUrl && post.videoUrl === targetUrl);
      const matchesImage = Boolean(targetUrl && post.imageUrl === targetUrl);
      const matchesAudio = Boolean(targetUrl && post.audioNote?.audioData === targetUrl);

      if (matchesPostId || matchesVideo || matchesImage || matchesAudio) {
        const updatedPost: StoredPost = {
          ...post,
          videoUrl: matchesPostId || matchesVideo ? undefined : post.videoUrl,
          videoDuration: matchesPostId || matchesVideo ? undefined : post.videoDuration,
          imageUrl: matchesPostId || matchesImage ? undefined : post.imageUrl,
          audioNote: matchesPostId || matchesAudio ? undefined : post.audioNote,
        };
        evasionStorage.updatePost(updatedPost);
        realtimePubSub.publish('POST_UPDATED', { post: updatedPost });
      }
    }

    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    realtimePubSub.publish('MEDIA_FEED_UPDATED', {
      action: 'deleted',
      ownerId: account.id,
      itemId,
      url: targetUrl || undefined,
    });
  };

  app.delete('/api/auth/universe/:itemId', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const itemId = String(req.params.itemId || '').trim();
    const queryUrl = typeof req.query?.url === 'string' ? req.query.url.trim() : undefined;
    removeCreatorMediaEverywhere(account, itemId, queryUrl);
    return res.json({ success: true, account: toPublicAuthPayload(account) });
  });

  app.post('/api/media-feed/delete', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId.trim() : '';
    const mediaUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!itemId && !mediaUrl) {
      return res.status(400).json({ success: false, error: 'Identifiant média requis.' });
    }
    removeCreatorMediaEverywhere(account, itemId, mediaUrl);
    return res.json({ success: true, account: toPublicAuthPayload(account) });
  });

  app.post('/api/media-feed/report-broken', async (req, res) => {
    const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId.trim() : '';
    const mediaUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const ownerId = typeof req.body?.ownerId === 'string' ? req.body.ownerId.trim() : '';
    if (!itemId && !mediaUrl) {
      return res.status(400).json({ success: false, error: 'Identifiant média requis.' });
    }

    // Verify if the media is genuinely broken on the server OR if reported by its owner
    const caller = getAuthenticatedAccount(req);
    const isOwnerCall = Boolean(caller && (caller.id === ownerId || !ownerId));
    const isOpenable = mediaUrl ? await isServerMediaOpenable(mediaUrl) : false;

    if (!isOpenable || isOwnerCall) {
      for (const acc of evasionStorage.getAllAccounts()) {
        if (ownerId && acc.id !== ownerId && acc.profile.matricule !== ownerId) continue;
        const list = Array.isArray(acc.profile.universeMedia) ? acc.profile.universeMedia : [];
        const hasMatch = list.some(
          (m) => (itemId && m.id === itemId) || (mediaUrl && m.url === mediaUrl)
        );
        if (hasMatch) {
          removeCreatorMediaEverywhere(acc, itemId, mediaUrl);
        }
      }

      for (const post of evasionStorage.getPosts()) {
        const matchesPostId = Boolean(itemId && post.id === itemId);
        const matchesVideo = Boolean(mediaUrl && post.videoUrl === mediaUrl);
        const matchesImage = Boolean(mediaUrl && post.imageUrl === mediaUrl);
        const matchesAudio = Boolean(mediaUrl && post.audioNote?.audioData === mediaUrl);
        if (matchesPostId || matchesVideo || matchesImage || matchesAudio) {
          const updatedPost: StoredPost = {
            ...post,
            videoUrl: matchesPostId || matchesVideo ? undefined : post.videoUrl,
            videoDuration: matchesPostId || matchesVideo ? undefined : post.videoDuration,
            imageUrl: matchesPostId || matchesImage ? undefined : post.imageUrl,
            audioNote: matchesPostId || matchesAudio ? undefined : post.audioNote,
          };
          evasionStorage.updatePost(updatedPost);
          realtimePubSub.publish('POST_UPDATED', { post: updatedPost });
          realtimePubSub.publish('MEDIA_FEED_UPDATED', {
            action: 'deleted',
            ownerId: post.authorId,
            itemId: post.id,
            url: mediaUrl || undefined,
          });
        }
      }
    }

    return res.json({ success: true, removed: !isOpenable || isOwnerCall });
  });

  // --- Global Community Media Feed (All Users' Active 24h Flames + Public Universe Media + Valid Media Posts) ---
  app.get('/api/media-feed', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await purgeBrokenMediaAndSyntheticAccounts();

    const items: Array<{
      feedId: string;
      source: 'universe' | 'post' | 'flame';
      itemId: string;
      postId?: string;
      ownerId: string;
      ownerMatricule: string;
      ownerAlias: string;
      ownerAvatar: string;
      ownerNeonColor?: string;
      ownerFrame?: string;
      type: 'photo' | 'video' | 'audio' | 'file' | 'text';
      url: string;
      text?: string;
      bgGradient?: string;
      caption?: string;
      duration?: number;
      fileName?: string;
      bgMusic?: StoredActiveFlameItem['bgMusic'];
      expiresAt?: number;
      keysCount: number;
      padlocksCount: number;
      createdAt: number;
    }> = [];

    const seenUrls = new Set<string>();
    const seenFlameIds = new Set<string>();

    for (const acc of evasionStorage.getAllAccounts()) {
      const p = acc.profile;

      // 1. Active 24h Flame (visible in Média Live regardless of universe privacy)
      const fl = getValidActiveFlame(acc);
      if (fl && fl.type !== 'file') {
        const hasValidFlameContent =
          fl.type === 'text'
            ? Boolean(fl.text && fl.text.trim())
            : Boolean(fl.url && !fl.url.startsWith('idb://'));
        const flameFeedId = `flame_${p.id}_${fl.id}`;
        if (hasValidFlameContent && !seenFlameIds.has(flameFeedId)) {
          seenFlameIds.add(flameFeedId);
          items.push({
            feedId: flameFeedId,
            source: 'flame',
            itemId: fl.id,
            ownerId: p.id,
            ownerMatricule: p.matricule,
            ownerAlias: p.alias || p.matricule,
            ownerAvatar: p.avatar || '⛓️',
            ownerNeonColor: p.neonColor,
            ownerFrame: p.cellBorderFrame,
            type: fl.type,
            url: fl.url || '',
            text: fl.text,
            bgGradient: fl.bgGradient,
            caption: fl.caption,
            duration: fl.duration,
            fileName: fl.fileName,
            bgMusic: fl.bgMusic,
            expiresAt: fl.expiresAt,
            keysCount: 0,
            padlocksCount: 0,
            createdAt: Number(fl.createdAt || Date.now()),
          });
        }
      }

      const mediaList = Array.isArray(p.universeMedia) ? p.universeMedia : [];
      for (const m of mediaList) {
        if (!m || !m.url || m.url.startsWith('idb://') || m.type === 'file') continue;
        const dedupKey = m.url;
        if (seenUrls.has(dedupKey)) continue;
        seenUrls.add(dedupKey);
        items.push({
          feedId: `uni_${p.id}_${m.id}`,
          source: 'universe',
          itemId: m.id,
          ownerId: p.id,
          ownerMatricule: p.matricule,
          ownerAlias: p.alias || p.matricule,
          ownerAvatar: p.avatar || '⛓️',
          ownerNeonColor: p.neonColor,
          ownerFrame: p.cellBorderFrame,
          type: m.type,
          url: m.url,
          caption: m.caption,
          duration: m.duration,
          fileName: m.fileName,
          bgMusic: m.bgMusic,
          keysCount: Number(m.keysCount || 0),
          padlocksCount: Number(m.padlocksCount || 0),
          createdAt: Number(m.createdAt || Date.now()),
        });
      }
    }

    for (const post of evasionStorage.getPosts()) {
      if (post.videoUrl && !post.videoUrl.startsWith('idb://')) {
        if (seenUrls.has(post.videoUrl)) continue;
        seenUrls.add(post.videoUrl);
        items.push({
          feedId: `post_vid_${post.id}`,
          source: 'post',
          itemId: post.id,
          postId: post.id,
          ownerId: post.authorId,
          ownerMatricule: post.authorMatricule,
          ownerAlias: post.authorAlias || post.authorMatricule,
          ownerAvatar: post.authorAvatar || '⛓️',
          ownerNeonColor: post.authorNeonColor,
          ownerFrame: post.authorFrame,
          type: 'video',
          url: post.videoUrl,
          caption: post.content,
          duration: post.videoDuration,
          bgMusic: post.bgMusic,
          keysCount: Number(post.keysCount || 0),
          padlocksCount: Number(post.padlocksSealCount || 1),
          createdAt: Number(post.createdAt || Date.now()),
        });
      } else if (post.imageUrl && !post.imageUrl.startsWith('idb://')) {
        if (seenUrls.has(post.imageUrl)) continue;
        seenUrls.add(post.imageUrl);
        items.push({
          feedId: `post_img_${post.id}`,
          source: 'post',
          itemId: post.id,
          postId: post.id,
          ownerId: post.authorId,
          ownerMatricule: post.authorMatricule,
          ownerAlias: post.authorAlias || post.authorMatricule,
          ownerAvatar: post.authorAvatar || '⛓️',
          ownerNeonColor: post.authorNeonColor,
          ownerFrame: post.authorFrame,
          type: 'photo',
          url: post.imageUrl,
          caption: post.content,
          bgMusic: post.bgMusic,
          keysCount: Number(post.keysCount || 0),
          padlocksCount: Number(post.padlocksSealCount || 1),
          createdAt: Number(post.createdAt || Date.now()),
        });
      } else if (post.audioNote?.audioData && !post.audioNote.audioData.startsWith('idb://')) {
        if (seenUrls.has(post.audioNote.audioData)) continue;
        seenUrls.add(post.audioNote.audioData);
        items.push({
          feedId: `post_aud_${post.id}`,
          source: 'post',
          itemId: post.id,
          postId: post.id,
          ownerId: post.authorId,
          ownerMatricule: post.authorMatricule,
          ownerAlias: post.authorAlias || post.authorMatricule,
          ownerAvatar: post.authorAvatar || '⛓️',
          ownerNeonColor: post.authorNeonColor,
          ownerFrame: post.authorFrame,
          type: 'audio',
          url: post.audioNote.audioData,
          caption: post.content,
          duration: post.audioNote.duration,
          bgMusic: post.bgMusic,
          keysCount: Number(post.keysCount || 0),
          padlocksCount: Number(post.padlocksSealCount || 1),
          createdAt: Number(post.createdAt || Date.now()),
        });
      }
    }

    items.sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ success: true, items: items.slice(0, 300) });
  });

  app.post('/api/media-feed/react', (req, res) => {
    const sender = getOrProvisionAccount(req, res);
    const { source, itemId, ownerId, giftType } = (req.body || {}) as {
      source?: 'universe' | 'post' | 'flame';
      itemId?: string;
      ownerId?: string;
      giftType?: 'key' | 'padlock' | 'heart' | 'ice_cone' | 'water_bottle' | 'canned_food';
    };

    const validGifts = ['key', 'padlock', 'heart', 'ice_cone', 'water_bottle', 'canned_food'];
    if (!giftType || !validGifts.includes(giftType) || !itemId) {
      return res.status(400).json({ success: false, error: 'Paramètres invalides.' });
    }

    const isMaster = isTest2026Account(sender);
    if (giftType === 'key') {
      if (!isMaster && (sender.profile.keysAvailable || 0) <= 0) {
        return res.status(400).json({ success: false, error: 'Tu n’as plus de clés disponibles.' });
      }
      if (!isMaster) {
        sender.profile.keysAvailable = Math.max(0, (sender.profile.keysAvailable || 0) - 1);
      }
      sender.profile.keysGivenTotal = (sender.profile.keysGivenTotal || 0) + 1;
    } else if (giftType === 'padlock') {
      if (!isMaster && (sender.profile.padlocksAvailable || 0) <= 0) {
        return res.status(400).json({ success: false, error: 'Tu n’as plus de cadenas disponibles.' });
      }
      if (!isMaster) {
        sender.profile.padlocksAvailable = Math.max(0, (sender.profile.padlocksAvailable || 0) - 1);
      }
    } else if (giftType === 'heart') {
      const cur = sender.profile.heartsAvailable ?? 10;
      if (!isMaster && cur <= 0) {
        return res.status(400).json({ success: false, error: 'Tu n’as plus de cœurs disponibles.' });
      }
      if (!isMaster) {
        sender.profile.heartsAvailable = Math.max(0, cur - 1);
      }
    } else if (giftType === 'ice_cone') {
      const cur = sender.profile.iceConesAvailable ?? 5;
      if (!isMaster && cur <= 0) {
        return res.status(400).json({ success: false, error: 'Tu n’as plus de glaces disponibles.' });
      }
      if (!isMaster) {
        sender.profile.iceConesAvailable = Math.max(0, cur - 1);
      }
    } else if (giftType === 'water_bottle') {
      const cur = sender.profile.waterBottlesAvailable ?? 5;
      if (!isMaster && cur <= 0) {
        return res.status(400).json({ success: false, error: 'Tu n’as plus d’eau disponible.' });
      }
      if (!isMaster) {
        sender.profile.waterBottlesAvailable = Math.max(0, cur - 1);
      }
    } else if (giftType === 'canned_food') {
      const cur = sender.profile.cansAvailable ?? 5;
      if (!isMaster && cur <= 0) {
        return res.status(400).json({ success: false, error: 'Tu n’as plus de conserves disponibles.' });
      }
      if (!isMaster) {
        sender.profile.cansAvailable = Math.max(0, cur - 1);
      }
    }
    evasionStorage.saveAccount(sender);

    let updatedKeysCount = 0;
    let updatedPadlocksCount = 0;

    if (source === 'post') {
      const post = evasionStorage.getPosts().find((p) => p.id === itemId);
      if (post) {
        if (giftType === 'key') {
          post.keysCount = (post.keysCount || 0) + 1;
          if (post.keysCount >= (post.keysRequired || 5)) {
            post.status = 'escaped';
          }
        } else if (giftType === 'padlock') {
          post.padlocksSealCount = (post.padlocksSealCount || 1) + 1;
        }
        updatedKeysCount = post.keysCount || 0;
        updatedPadlocksCount = post.padlocksSealCount || 1;
        evasionStorage.updatePost(post);
        realtimePubSub.publish('POST_UPDATED', { post });
      }
    }

    if (ownerId) {
      const targetAcc =
        evasionStorage.getAccountById(ownerId) ||
        evasionStorage.findAccountByIdentifier(ownerId);
      if (targetAcc) {
        // C'est uniquement le détenu créateur du média qui reçoit les points pour la Cantine
        if (targetAcc.id !== sender.id) {
          if (giftType === 'key') {
            targetAcc.profile.keysAvailable = (targetAcc.profile.keysAvailable || 0) + 1;
            targetAcc.profile.points = (targetAcc.profile.points || 0) + 100;
          } else if (giftType === 'padlock') {
            targetAcc.profile.padlocksAvailable = (targetAcc.profile.padlocksAvailable || 0) + 1;
            targetAcc.profile.points = (targetAcc.profile.points || 0) + 150;
          } else if (giftType === 'ice_cone') {
            targetAcc.profile.points = (targetAcc.profile.points || 0) + 50;
          } else if (giftType === 'water_bottle') {
            targetAcc.profile.points = (targetAcc.profile.points || 0) + 75;
          } else if (giftType === 'canned_food') {
            targetAcc.profile.points = (targetAcc.profile.points || 0) + 80;
          } else {
            targetAcc.profile.points = (targetAcc.profile.points || 0) + 25;
          }
        }
        if (source === 'universe' && Array.isArray(targetAcc.profile.universeMedia)) {
          targetAcc.profile.universeMedia = targetAcc.profile.universeMedia.map((m) => {
            if (m.id !== itemId) return m;
            const nextKeys = (m.keysCount || 0) + (giftType === 'key' ? 1 : 0);
            const nextPadlocks = (m.padlocksCount || 0) + (giftType === 'padlock' ? 1 : 0);
            updatedKeysCount = nextKeys;
            updatedPadlocksCount = nextPadlocks;
            return { ...m, keysCount: nextKeys, padlocksCount: nextPadlocks };
          });
        }
        evasionStorage.saveAccount(targetAcc);
        realtimePubSub.publish('USER_UPDATED', { userId: targetAcc.id, profile: targetAcc.profile });
      }
    }

    realtimePubSub.publish('USER_UPDATED', { userId: sender.id, profile: sender.profile });
    realtimePubSub.publish('PLATFORM_KEYS_UPDATED', { stats: computePlatformKeyStats() });
    realtimePubSub.publish('MEDIA_FEED_UPDATED', {
      action: 'reacted',
      source: source || 'universe',
      itemId,
      ownerId,
      giftType,
      keysCount: updatedKeysCount,
      padlocksCount: updatedPadlocksCount,
    });
    return res.json({
      success: true,
      keysCount: updatedKeysCount,
      padlocksCount: updatedPadlocksCount,
      senderProfile: sender.profile,
    });
  });

  // --- 3. Authoritative Economy Routes ---
  app.post('/api/account/redeem-points', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    const rewardId = String(req.body?.rewardId || '');
    const REWARDS: Record<
      string,
      { cost: number; label: string; apply: (p: typeof account.profile) => void }
    > = {
      key_1: {
        cost: 300,
        label: '+1 Clé Haute Valeur 🔑',
        apply: (p) => {
          p.keysAvailable = (p.keysAvailable || 0) + 1;
        },
      },
      padlock_1: {
        cost: 450,
        label: '+1 Cadenas Scellé 🔒',
        apply: (p) => {
          p.padlocksAvailable = (p.padlocksAvailable || 0) + 1;
        },
      },
      keys_3: {
        cost: 800,
        label: '+3 Clés 🔑 + 1 Cadenas 🔒',
        apply: (p) => {
          p.keysAvailable = (p.keysAvailable || 0) + 3;
          p.padlocksAvailable = (p.padlocksAvailable || 0) + 1;
        },
      },
      passe_partout: {
        cost: 1000,
        label: '+1 Passe-Partout ⚡',
        apply: (p) => {
          p.hasPassePartoutCount = (p.hasPassePartoutCount || 0) + 1;
        },
      },
      memory_5: {
        cost: 1200,
        label: '+5 Emplacements Mémoire Univers 📦',
        apply: (p) => {
          p.universeStorageQuota = Math.max(20, p.universeStorageQuota || 20) + 5;
        },
      },
      vip_cell: {
        cost: 2500,
        label: 'Statut Cellule VIP 👑 + Style Néon',
        apply: (p) => {
          p.isVipCell = true;
          p.isVipSubscriber = true;
          if (!p.neonColor) p.neonColor = 'gold';
          if (!p.cellBorderFrame || p.cellBorderFrame === 'none') p.cellBorderFrame = 'gold';
        },
      },
    };

    const reward = REWARDS[rewardId];
    if (!reward) {
      return res.status(400).json({ success: false, error: 'Récompense invalide.' });
    }

    const rawCode =
      typeof req.body?.validationCode === 'string' ? req.body.validationCode.trim() : '';
    const isMaster = isTest2026Account(account);
    const matchesUsr =
      rawCode.length > 0 && rawCode.toUpperCase() === account.profile.id.toUpperCase();
    const matchesEvasion =
      rawCode.length > 0 && rawCode.toUpperCase() === account.profile.referralCode.toUpperCase();
    const matchesPassword =
      rawCode.length >= 4 && verifyPassword(rawCode, account.passwordSalt, account.passwordHash);
    const matchesMaster = isMaster && (rawCode === '' || isTest2026Identifier(rawCode));

    if (!matchesUsr && !matchesEvasion && !matchesPassword && !matchesMaster) {
      return res.status(401).json({
        success: false,
        requiresValidationCode: true,
        error:
          "Code invalide. Entre ton Code USR, ton Code d'évasion ou ton Mot de passe pour valider le paiement en points.",
      });
    }

    const currentPoints = account.profile.points || 0;
    if (!isMaster && currentPoints < reward.cost) {
      return res.status(400).json({
        success: false,
        error: `Il te faut ${reward.cost} pts (tu as ${currentPoints} pts). Offre ou reçois 🍦 (+50), 💧 (+75), 🥫 (+80) pour gagner des points !`,
      });
    }

    if (!isMaster) {
      account.profile.points = Math.max(0, currentPoints - reward.cost);
    }
    reward.apply(account.profile);
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({
      success: true,
      rewardLabel: reward.label,
      profile: account.profile,
    });
  });

  app.post('/api/account/claim-keys', (req, res) => {
    const account = requireAuthAndMinKeys(req, res, MIN_KEYS_FULL_ACCESS);
    if (!account) return;
    account.profile.keysAvailable = (account.profile.keysAvailable || 0) + 3;
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, profile: account.profile });
  });

  app.post('/api/account/claim-padlocks', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const missionValidated =
      account.profile.dailyMissionCompletedDate === todayStr ||
      (account.profile.completedMissionsCount || 0) > 0;
    if (
      !isTest2026Account(account) &&
      !missionValidated &&
      (account.profile.padlocksAvailable || 0) <= 0 &&
      (account.profile.keysAvailable || 0) < MIN_KEYS_FULL_ACCESS
    ) {
      return res.status(403).json({
        success: false,
        code: 'MISSION_REQUIRED',
        error: 'Valide d’abord la Mission du Jour pour débloquer les Cadenas 🔒 !',
      });
    }
    account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + 2;
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, profile: account.profile });
  });

  app.post('/api/account/protect-streak', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    if (account.profile.isStreakProtectedByPadlock) {
      return res.json({ success: true, alreadyProtected: true, profile: account.profile });
    }
    if ((account.profile.padlocksAvailable || 0) <= 0) {
      return res.status(400).json({ success: false, error: 'Aucun cadenas disponible.' });
    }
    account.profile.padlocksAvailable -= 1;
    account.profile.isStreakProtectedByPadlock = true;
    account.profile.points = (account.profile.points || 0) + 250;
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, profile: account.profile });
  });

  app.post('/api/account/lock-temptation', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 60) : '';
    if (!label) return res.status(400).json({ success: false, error: 'Tentation invalide.' });
    if ((account.profile.padlocksAvailable || 0) <= 0) {
      return res.status(400).json({ success: false, error: 'Aucun cadenas disponible.' });
    }
    account.profile.padlocksAvailable -= 1;
    account.profile.keysAvailable += 2;
    account.profile.points = (account.profile.points || 0) + 200;
    const currentLocks = account.profile.lockedTemptations || [];
    if (!currentLocks.includes(label)) {
      account.profile.lockedTemptations = [label, ...currentLocks.slice(0, 5)];
    }
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, profile: account.profile });
  });

  app.post('/api/account/complete-mission', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (account.profile.dailyMissionCompletedDate === todayStr) {
      return res.json({ success: true, alreadyCompleted: true, profile: account.profile });
    }
    const dayIndex =
      Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % DAILY_MISSIONS_CATALOG.length;
    const mission = DAILY_MISSIONS_CATALOG[dayIndex];

    account.profile.keysAvailable += mission.keysReward;
    account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + 1;
    account.profile.points = (account.profile.points || 0) + mission.pointsReward;
    account.profile.completedMissionsCount = (account.profile.completedMissionsCount || 0) + 1;
    account.profile.screenTimeSavedMinutes = (account.profile.screenTimeSavedMinutes || 0) + 30;
    account.profile.dailyMissionCompletedDate = todayStr;
    account.profile.lastActiveDate = todayStr;
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, profile: account.profile });
  });

  app.post('/api/account/complete-detox', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    const minutes = Math.max(1, Math.min(180, Math.round(Number(req.body?.durationMinutes) || 15)));
    account.profile.keysAvailable += 5;
    account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + 1;
    account.profile.screenTimeSavedMinutes = (account.profile.screenTimeSavedMinutes || 0) + minutes;
    unlockBadgeIfMissing(account, 'badge_esprit_libre');
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, profile: account.profile });
  });

  app.post('/api/account/apply-referral', (req, res) => {
    const account = requireAuthAndMinKeys(req, res, MIN_KEYS_FULL_ACCESS);
    if (!account) return;
    const cleanCode = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    if (!cleanCode) {
      return res.status(400).json({ success: false, message: 'Code vide.' });
    }
    if (
      cleanCode === account.profile.referralCode.toUpperCase() ||
      cleanCode === account.profile.id.toUpperCase()
    ) {
      return res.status(400).json({
        success: false,
        message: "C'est ton propre code d'invitation, donne-le à un ami !",
      });
    }
    if (account.usedReferralCodes.includes(cleanCode)) {
      return res.status(400).json({
        success: false,
        message: 'Tu as déjà utilisé ce code de parrainage.',
      });
    }
    account.usedReferralCodes.push(cleanCode);
    account.profile.referralsCount += 1;
    if (account.profile.referralsCount >= 3) {
      account.profile.isVipCell = true;
      unlockBadgeIfMissing(account, 'badge_parrain_vip');
    }
    account.profile.keysAvailable += 3;
    account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + 1;
    evasionStorage.saveAccount(account);

    // Reward referrer if found on server
    const referrer = evasionStorage.findAccountByReferralCodeOrId(cleanCode);
    if (referrer && referrer.id !== account.id) {
      referrer.profile.referralsCount += 1;
      if (referrer.profile.referralsCount >= 3) {
        referrer.profile.isVipCell = true;
        unlockBadgeIfMissing(referrer, 'badge_parrain_vip');
      }
      referrer.profile.keysAvailable += 3;
      evasionStorage.saveAccount(referrer);
      realtimePubSub.publish('USER_UPDATED', { userId: referrer.id, profile: referrer.profile });
    }

    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({
      success: true,
      message: 'Code validé ! +3 clés et +1 cadenas accordés.',
      profile: account.profile,
    });
  });

  app.post('/api/account/midnight-reset', (req, res) => {
    const account = requireAuthAndMinKeys(req, res, MIN_KEYS_FULL_ACCESS);
    if (!account) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (account.profile.lastMidnightResetDate === todayIso && !req.body?.forceManual) {
      return res.json({ success: true, profile: account.profile });
    }
    account.profile.keysAvailable += 3;
    account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + 1;
    account.profile.points = (account.profile.points || 0) + 20;
    account.profile.lastMidnightResetDate = todayIso;
    evasionStorage.saveAccount(account);
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, profile: account.profile });
  });

  // --- 4. Cross-Device Media Upload & Streaming (S3/CDN or Local Range Disk) ---
  app.post('/api/media', express.raw({ type: '*/*', limit: '25mb' }), async (req: Request, res: Response) => {
    try {
      const buf = Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string'
        ? Buffer.from(req.body, 'utf-8')
        : req.body && typeof req.body === 'object'
        ? Buffer.from(JSON.stringify(req.body), 'utf-8')
        : null;
      if (!buf || buf.length === 0) {
        return res.status(400).json({ success: false, error: 'Empty media body' });
      }
      if (buf.length > 20 * 1024 * 1024) {
        return res.status(413).json({ success: false, error: 'Fichier trop volumineux (max 20 Mo).' });
      }
      const contentType = String(req.headers['content-type'] || 'application/octet-stream').slice(0, 80);
      const stored = await storeMediaBuffer(buf, contentType);
      return res.json({ success: true, id: stored.id, url: stored.url, backend: stored.backend });
    } catch {
      return res.status(500).json({ success: false, error: 'Failed to store media' });
    }
  });

  app.get('/api/media/direct-download', async (req: Request, res: Response) => {
    try {
      const targetUrl = String(req.query?.url || '').trim();
      const rawFilename = typeof req.query?.filename === 'string' ? req.query.filename : undefined;
      if (!targetUrl) {
        return res.status(400).json({ success: false, error: 'URL requise.' });
      }
      if (targetUrl.startsWith('/api/media/')) {
        const cleanId = targetUrl.replace(/^\/api\/media\//, '').split('?')[0];
        req.params.id = cleanId;
        req.query.download = '1';
        await serveLocalMediaWithRanges(req, res);
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
      } catch {
        return res.status(400).json({ success: false, error: 'URL invalide.' });
      }
      const hostLower = parsed.hostname.toLowerCase();
      if (
        (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
        hostLower === 'localhost' ||
        hostLower === '127.0.0.1' ||
        hostLower === '::1' ||
        hostLower.startsWith('10.') ||
        hostLower.startsWith('192.168.') ||
        hostLower.startsWith('169.254.')
      ) {
        return res.status(403).json({ success: false, error: 'Source non autorisée.' });
      }
      const upstream = await fetch(parsed.toString());
      if (!upstream.ok) {
        return res.status(502).json({ success: false, error: 'Téléchargement impossible.' });
      }
      const contentType = (upstream.headers.get('content-type') || 'application/octet-stream').split(';')[0];
      const buf = Buffer.from(await upstream.arrayBuffer());
      const fileName = sanitizeDownloadFileName(rawFilename, contentType, `media_${Date.now()}`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', buf.length);
      res.send(buf);
    } catch {
      res.status(500).end();
    }
  });

  app.get('/api/media/:id', (req: Request, res: Response) => {
    void serveLocalMediaWithRanges(req, res);
  });

  // --- 5. Global Irreversible Confessions Feed ("Le Mur" - Permanent 10 000) ---
  app.get('/api/posts', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const posts = await evasionStorage.syncPostsFromPostgres();
    return res.json({
      success: true,
      posts,
      maxPosts: MAX_IRREVERSIBLE_POSTS,
      serverTime: Date.now(),
    });
  });

  app.get('/api/posts/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const posts = await evasionStorage.syncPostsFromPostgres();
    if (req.destroyed || res.writableEnded) return;

    res.write(
      `retry: 5000\nevent: SYNC_ALL\ndata: ${JSON.stringify({
        posts,
        maxPosts: MAX_IRREVERSIBLE_POSTS,
      })}\n\n`
    );

    if (process.env.VERCEL) {
      res.end();
      return;
    }

    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.post('/api/posts', async (req, res) => {
    const account = getOrProvisionAccount(req, res);

    const incoming = req.body as Partial<StoredPost> | undefined;
    if (!incoming || typeof incoming.id !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid post payload' });
    }
    const content = typeof incoming.content === 'string' ? incoming.content.trim().slice(0, 2500) : '';
    const hasAttachedFile = Boolean(
      incoming.attachedFile &&
        typeof incoming.attachedFile.url === 'string' &&
        incoming.attachedFile.url.trim()
    );
    let cleanPostBgMusic: StoredActiveFlameItem['bgMusic'] = undefined;
    const rawPostAudioUrl =
      typeof incoming.bgMusic?.audioUrl === 'string' && incoming.bgMusic.audioUrl.trim()
        ? incoming.bgMusic.audioUrl.trim()
        : typeof incoming.bgMusic?.previewUrl === 'string'
        ? incoming.bgMusic.previewUrl.trim()
        : '';
    const rawPostCoverUrl =
      typeof incoming.bgMusic?.cover === 'string' && incoming.bgMusic.cover.trim()
        ? incoming.bgMusic.cover.trim()
        : typeof incoming.bgMusic?.albumCover === 'string'
        ? incoming.bgMusic.albumCover.trim()
        : undefined;
    if (
      incoming.bgMusic &&
      typeof incoming.bgMusic === 'object' &&
      rawPostAudioUrl &&
      (rawPostAudioUrl.startsWith('http') || rawPostAudioUrl.startsWith('/api/music/'))
    ) {
      cleanPostBgMusic = {
        id: incoming.bgMusic.id || `mp_${Date.now()}`,
        title: typeof incoming.bgMusic.title === 'string' ? incoming.bgMusic.title.slice(0, 100) : 'Titre',
        titleShort: typeof incoming.bgMusic.titleShort === 'string' ? incoming.bgMusic.titleShort.slice(0, 100) : undefined,
        artist: typeof incoming.bgMusic.artist === 'string' ? incoming.bgMusic.artist.slice(0, 80) : 'Artiste',
        artistPicture: typeof incoming.bgMusic.artistPicture === 'string' ? incoming.bgMusic.artistPicture : undefined,
        albumTitle: typeof incoming.bgMusic.albumTitle === 'string' ? incoming.bgMusic.albumTitle.slice(0, 100) : undefined,
        cover: rawPostCoverUrl,
        albumCover: rawPostCoverUrl,
        audioUrl: rawPostAudioUrl,
        previewUrl: rawPostAudioUrl,
        duration: typeof incoming.bgMusic.duration === 'number' ? incoming.bgMusic.duration : 30,
      };
    }

    if (
      !content &&
      !incoming.imageUrl &&
      !incoming.videoUrl &&
      !incoming.audioNote?.audioData &&
      !hasAttachedFile &&
      !cleanPostBgMusic
    ) {
      return res.status(400).json({ success: false, error: 'Post content cannot be empty' });
    }

    const authorAlias =
      typeof incoming.authorAlias === 'string' && incoming.authorAlias.trim()
        ? incoming.authorAlias.trim().slice(0, 32)
        : account.profile.alias;
    const authorMatricule =
      typeof incoming.authorMatricule === 'string' && incoming.authorMatricule.trim()
        ? incoming.authorMatricule.trim().slice(0, 32)
        : account.profile.matricule;
    const authorAvatar =
      typeof incoming.authorAvatar === 'string' && incoming.authorAvatar.trim()
        ? incoming.authorAvatar.trim().slice(0, 200000)
        : account.profile.avatar;

    const cleanAttachedFile =
      hasAttachedFile && incoming.attachedFile
        ? {
            url: String(incoming.attachedFile.url).slice(0, 1000),
            fileName: String(incoming.attachedFile.fileName || 'Document').slice(0, 160),
            mimeType: String(incoming.attachedFile.mimeType || 'application/octet-stream').slice(0, 100),
            fileSize: Math.max(0, Number(incoming.attachedFile.fileSize) || 0),
          }
        : undefined;

    const keysRequired = Math.max(1, Math.min(50, Math.round(Number(incoming.keysRequired) || 5)));
    const newPost: StoredPost = {
      id: incoming.id.slice(0, 96),
      authorId: account.id,
      authorMatricule,
      authorAlias,
      authorAvatar,
      content,
      imageUrl: typeof incoming.imageUrl === 'string' ? incoming.imageUrl.slice(0, 1000) : undefined,
      videoUrl: typeof incoming.videoUrl === 'string' ? incoming.videoUrl.slice(0, 1000) : undefined,
      videoDuration: typeof incoming.videoDuration === 'number' ? incoming.videoDuration : undefined,
      attachedFile: cleanAttachedFile,
      category: String(incoming.category || 'ecrans').slice(0, 40),
      createdAt:
        typeof incoming.createdAt === 'number' && Number.isFinite(incoming.createdAt)
          ? incoming.createdAt
          : Date.now(),
      keysCount: 0,
      keysRequired,
      status: 'locked',
      keyDonors: [],
      audioNote:
        incoming.audioNote && typeof incoming.audioNote.audioData === 'string'
          ? {
              duration: Number(incoming.audioNote.duration) || 5,
              hasVoiceFilter: Boolean(incoming.audioNote.hasVoiceFilter),
              audioData: incoming.audioNote.audioData,
            }
          : undefined,
      authorNeonColor: account.profile.neonColor,
      authorFrame: account.profile.cellBorderFrame,
      padlocksSealCount: 1,
      comments: [],
      bgMusic: cleanPostBgMusic,
    };

    const result = evasionStorage.createPost(newPost);
    if (!result.alreadyExisted) {
      await evasionStorage.persistPostAsync(result.post);

      // Credit initial keys (+2 🔑), seal padlock (+1 🔒) + points for publishing an aveu
      account.profile.keysAvailable = (account.profile.keysAvailable || 0) + 2;
      account.profile.padlocksAvailable = (account.profile.padlocksAvailable || 0) + 1;
      account.profile.points = (account.profile.points || 0) + 50;
      evasionStorage.saveAccount(account);

      realtimePubSub.publish('POST_CREATED', {
        post: result.post,
        evictedIds: result.evictedIds,
        totalCount: evasionStorage.getPosts().length,
      });
      realtimePubSub.publish('USER_UPDATED', {
        userId: account.id,
        profile: account.profile,
      });

      const mediaKindLabel = newPost.videoUrl
        ? 'une vidéo 🎬'
        : newPost.imageUrl
        ? 'une photo 📸'
        : newPost.audioNote
        ? 'un vocal 🎙️'
        : 'un nouvel aveu 📝';
      notifyFriendsOfNewMedia(account, {
        kind: 'post',
        mediaType: newPost.videoUrl ? 'video' : newPost.imageUrl ? 'photo' : newPost.audioNote ? 'audio' : 'text',
        title: `📢 ${authorAlias} a publié ${mediaKindLabel}`,
        body: content ? content.slice(0, 90) : 'Clique pour découvrir sa nouvelle publication sur ÉVASION.',
      });

      try {
        const allSubs = evasionStorage.getAllPushSubscriptions();
        const targets = allSubs.filter((s) => s.userId !== account.id);
        void sendWebPushToSubscriptions(targets, {
          title: `📢 Nouvel Aveu de @${authorAlias} sur Le Mur`,
          body: content ? content.slice(0, 80) + '...' : 'Découvre ce nouveau secret publié dans ÉVASION',
          tag: `evasion-post-${result.post.id}`,
          url: `/?notif=post&postId=${encodeURIComponent(result.post.id)}`,
          type: 'cour',
          data: {
            type: 'post',
            postId: result.post.id,
            authorName: authorAlias,
          },
        });
      } catch {
        // ignore push errors
      }

      // Popularity engine: an aveu earns keys & padlocks based on its popularity & impact
      let targetPopularityKeys = 2; // +2 initial above = min 4 keys total per aveu
      if (content.length >= 30) targetPopularityKeys += 2;
      if (content.length >= 90) targetPopularityKeys += 2;
      if (content.includes('#')) targetPopularityKeys += 2;
      if (newPost.imageUrl || newPost.videoUrl || newPost.audioNote) targetPopularityKeys += 2;
      targetPopularityKeys = Math.min(10, targetPopularityKeys);

      const donorPool = [
        'Détenu #108',
        'Détenu #404',
        'Détenu #719',
        'Détenu #212',
        'Détenu #890',
        'Détenu #531',
        'Détenu #307',
        'Détenu #654',
        'Détenu #918',
        'Détenu #144',
      ];

      if (process.env.VERCEL) {
        const earnedPadlocks = Math.floor(targetPopularityKeys / 3);
        const finalKeysCount = result.post.keysCount + targetPopularityKeys;
        const isEscapedNow = finalKeysCount >= result.post.keysRequired;
        const updatedPost: StoredPost = {
          ...result.post,
          keysCount: finalKeysCount,
          padlocksSealCount: (result.post.padlocksSealCount || 1) + earnedPadlocks + (isEscapedNow ? 1 : 0),
          status: isEscapedNow ? 'escaped' : result.post.status,
          escapedAt: isEscapedNow ? Date.now() : result.post.escapedAt,
          keyDonors: donorPool.slice(0, targetPopularityKeys),
        };
        evasionStorage.updatePost(updatedPost);
        result.post = updatedPost;

        account.profile.keysAvailable = (account.profile.keysAvailable || 0) + targetPopularityKeys;
        account.profile.padlocksAvailable =
          (account.profile.padlocksAvailable || 0) + earnedPadlocks + (isEscapedNow ? 1 : 0);
        account.profile.points =
          (account.profile.points || 0) +
          targetPopularityKeys * 100 +
          (earnedPadlocks + (isEscapedNow ? 1 : 0)) * 150;
        if (isEscapedNow) {
          account.profile.escapedCount = (account.profile.escapedCount || 0) + 1;
          unlockBadgeIfMissing(account, 'badge_evade_supreme');
        }
        evasionStorage.saveAccount(account);
      } else {
        for (let step = 1; step <= targetPopularityKeys; step++) {
          setTimeout(() => {
            const livePost = evasionStorage.getPostById(newPost.id);
            const liveAuthor = evasionStorage.getAccountById(account.id);
            if (!livePost || !liveAuthor) return;

            const nextKeysCount = livePost.keysCount + 1;
            const isJustEscaped = nextKeysCount >= livePost.keysRequired && livePost.status !== 'escaped';
            const earnedPadlock = step % 3 === 0 || isJustEscaped ? 1 : 0;
            const donorName = donorPool[(step - 1) % donorPool.length];

            const updatedPost: StoredPost = {
              ...livePost,
              keysCount: nextKeysCount,
              padlocksSealCount: (livePost.padlocksSealCount || 1) + earnedPadlock,
              status: nextKeysCount >= livePost.keysRequired ? 'escaped' : livePost.status,
              escapedAt: isJustEscaped ? Date.now() : livePost.escapedAt,
              keyDonors: livePost.keyDonors.includes(donorName)
                ? livePost.keyDonors
                : [...livePost.keyDonors, donorName],
            };
            evasionStorage.updatePost(updatedPost);

            liveAuthor.profile.keysAvailable = (liveAuthor.profile.keysAvailable || 0) + 1;
            liveAuthor.profile.padlocksAvailable =
              (liveAuthor.profile.padlocksAvailable || 0) + earnedPadlock;
            liveAuthor.profile.points =
              (liveAuthor.profile.points || 0) + 100 + earnedPadlock * 150;
            if (isJustEscaped) {
              liveAuthor.profile.escapedCount = (liveAuthor.profile.escapedCount || 0) + 1;
              unlockBadgeIfMissing(liveAuthor, 'badge_evade_supreme');
            }
            evasionStorage.saveAccount(liveAuthor);

            realtimePubSub.publish('POST_UPDATED', { post: updatedPost });
            realtimePubSub.publish('USER_UPDATED', {
              userId: liveAuthor.id,
              profile: liveAuthor.profile,
            });
            realtimePubSub.publish('PLATFORM_KEYS_UPDATED', { stats: computePlatformKeyStats() });
          }, step * 2200);
        }
      }
    }

    return res.json({
      success: true,
      post: result.post,
      profile: account.profile,
      evictedIds: result.evictedIds,
      totalCount: evasionStorage.getPosts().length,
    });
  });

  app.post('/api/posts/:id/key', async (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;

    const postId = String(req.params.id || '');
    const current = await evasionStorage.getPostByIdSync(postId);
    if (!current) return res.status(404).json({ success: false, error: 'Post not found' });

    if (current.status === 'escaped' || current.keysCount >= current.keysRequired) {
      return res.json({ success: true, post: current, profile: account.profile });
    }
    if (account.profile.keysAvailable <= 0) {
      return res.status(400).json({ success: false, error: 'Aucune clé disponible.' });
    }

    account.profile.keysAvailable = Math.max(0, account.profile.keysAvailable - 1);
    account.profile.keysGivenTotal = (account.profile.keysGivenTotal || 0) + 1;
    if (account.profile.keysGivenTotal % 10 === 0) {
      account.profile.hasPassePartoutCount = (account.profile.hasPassePartoutCount || 0) + 1;
    }
    if (account.profile.keysGivenTotal >= 10) {
      unlockBadgeIfMissing(account, 'badge_clef_or');
    }

    const nextKeysCount = current.keysCount + 1;
    const isNowEscaped = nextKeysCount >= current.keysRequired;
    const updated: StoredPost = {
      ...current,
      keysCount: nextKeysCount,
      status: isNowEscaped ? 'escaped' : current.status,
      escapedAt: isNowEscaped ? Date.now() : current.escapedAt,
      keyDonors: current.keyDonors.includes(account.profile.matricule)
        ? current.keyDonors
        : [...current.keyDonors, account.profile.matricule],
    };

    evasionStorage.updatePost(updated);

    // Credit the author of the aveu for its popularity (+1 key, and +2 keys / +1 padlock if escaped)
    const authorAcc = evasionStorage.getAccountById(current.authorId);
    if (authorAcc) {
      const targetProfile = authorAcc.id === account.id ? account.profile : authorAcc.profile;
      targetProfile.keysAvailable = (targetProfile.keysAvailable || 0) + (isNowEscaped ? 3 : 1);
      if (isNowEscaped) {
        targetProfile.padlocksAvailable = (targetProfile.padlocksAvailable || 0) + 1;
        targetProfile.escapedCount = (targetProfile.escapedCount || 0) + 1;
        unlockBadgeIfMissing(authorAcc, 'badge_evade_supreme');
      }
      targetProfile.points = (targetProfile.points || 0) + (isNowEscaped ? 300 : 100);
      if (authorAcc.id !== account.id) {
        evasionStorage.saveAccount(authorAcc);
        realtimePubSub.publish('USER_UPDATED', { userId: authorAcc.id, profile: authorAcc.profile });
      }
    }

    evasionStorage.saveAccount(account);
    realtimePubSub.publish('POST_UPDATED', { post: updated });
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    realtimePubSub.publish('PLATFORM_KEYS_UPDATED', { stats: computePlatformKeyStats() });

    return res.json({ success: true, post: updated, profile: account.profile });
  });

  app.post('/api/posts/:id/revoke-key', async (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;

    const postId = String(req.params.id || '');
    const current = await evasionStorage.getPostByIdSync(postId);
    if (!current) return res.status(404).json({ success: false, error: 'Post not found' });

    if (current.status === 'escaped') {
      return res.status(400).json({
        success: false,
        error: 'Impossible de reprendre la clé : cet aveu a déjà franchi les barreaux !',
      });
    }

    const hasGiven =
      (Array.isArray(current.keyDonors) && current.keyDonors.includes(account.profile.matricule)) ||
      current.keysCount > 0;

    if (!hasGiven) {
      return res.status(400).json({
        success: false,
        error: 'Tu n’as pas offert de clé sur cette publication.',
      });
    }

    const nextKeysCount = Math.max(0, current.keysCount - 1);
    const updatedDonors = Array.isArray(current.keyDonors)
      ? current.keyDonors.filter((d) => d !== account.profile.matricule)
      : [];

    const updated: StoredPost = {
      ...current,
      keysCount: nextKeysCount,
      keyDonors: updatedDonors,
    };

    evasionStorage.updatePost(updated);

    // Return key to user
    account.profile.keysAvailable = (account.profile.keysAvailable || 0) + 1;
    account.profile.keysGivenTotal = Math.max(0, (account.profile.keysGivenTotal || 1) - 1);

    // Also deduct point from author if author received it
    const authorAcc = evasionStorage.getAccountById(current.authorId);
    if (authorAcc && authorAcc.id !== account.id) {
      authorAcc.profile.points = Math.max(0, (authorAcc.profile.points || 0) - 100);
      authorAcc.profile.keysAvailable = Math.max(0, (authorAcc.profile.keysAvailable || 1) - 1);
      evasionStorage.saveAccount(authorAcc);
      realtimePubSub.publish('USER_UPDATED', { userId: authorAcc.id, profile: authorAcc.profile });
    }

    evasionStorage.saveAccount(account);
    realtimePubSub.publish('POST_UPDATED', { post: updated });
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    realtimePubSub.publish('PLATFORM_KEYS_UPDATED', { stats: computePlatformKeyStats() });

    return res.json({ success: true, post: updated, profile: account.profile });
  });

  app.post('/api/posts/:id/comment', async (req, res) => {
    const account = requireAuthAndMinKeys(req, res, MIN_KEYS_FULL_ACCESS);
    if (!account) return;

    const postId = String(req.params.id || '');
    const current = await evasionStorage.getPostByIdSync(postId);
    if (!current) return res.status(404).json({ success: false, error: 'Post not found' });

    const incoming = req.body as Partial<StoredComment> | undefined;
    if (!incoming || typeof incoming.id !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid comment' });
    }

    const existingComments = current.comments || [];
    if (existingComments.some((c) => c.id === incoming.id)) {
      return res.json({ success: true, post: current });
    }

    const comment: StoredComment = {
      id: incoming.id.slice(0, 96),
      postId,
      authorId: account.id,
      authorMatricule: account.profile.matricule,
      authorAlias: account.profile.alias,
      authorAvatar: account.profile.avatar,
      authorNeonColor: account.profile.neonColor,
      content: typeof incoming.content === 'string' ? incoming.content.trim().slice(0, 1000) : '',
      imageUrl: typeof incoming.imageUrl === 'string' ? incoming.imageUrl.slice(0, 1000) : undefined,
      audioNote: incoming.audioNote,
      videoUrl: typeof incoming.videoUrl === 'string' ? incoming.videoUrl.slice(0, 1000) : undefined,
      videoDuration: typeof incoming.videoDuration === 'number' ? incoming.videoDuration : undefined,
      attachedFile:
        incoming.attachedFile && typeof incoming.attachedFile.url === 'string' && incoming.attachedFile.url.trim()
          ? {
              url: String(incoming.attachedFile.url).slice(0, 1000),
              fileName: String(incoming.attachedFile.fileName || 'Document').slice(0, 160),
              mimeType: String(incoming.attachedFile.mimeType || 'application/octet-stream').slice(0, 100),
              fileSize: Math.max(0, Number(incoming.attachedFile.fileSize) || 0),
            }
          : undefined,
      createdAt: typeof incoming.createdAt === 'number' ? incoming.createdAt : Date.now(),
    };

    const updated: StoredPost = {
      ...current,
      comments: [...existingComments, comment].slice(-MAX_COMMENTS_PER_POST),
    };
    evasionStorage.updatePost(updated);

    // Every comment boosts the aveu's popularity and rewards the author with +1 key
    const authorAcc = evasionStorage.getAccountById(current.authorId);
    if (authorAcc && authorAcc.id !== account.id) {
      authorAcc.profile.keysAvailable = (authorAcc.profile.keysAvailable || 0) + 1;
      authorAcc.profile.points = (authorAcc.profile.points || 0) + 50;
      evasionStorage.saveAccount(authorAcc);
      realtimePubSub.publish('USER_UPDATED', { userId: authorAcc.id, profile: authorAcc.profile });
    }

    realtimePubSub.publish('POST_UPDATED', { post: updated });

    if (current.authorId !== account.id && current.authorMatricule !== account.profile.matricule) {
      const senderLabel = account.profile.alias || account.profile.matricule;
      const preview = formatMessagePreview({
        content: comment.content,
        hasImage: Boolean(comment.imageUrl),
        hasVideo: Boolean(comment.videoUrl),
        hasAudio: Boolean(comment.audioNote?.audioData),
      });
      const postSnippet = (current.content || '').trim().slice(0, 40);
      const deepLink = `/?notif=comment&postId=${encodeURIComponent(current.id)}&commentId=${encodeURIComponent(comment.id)}`;
      void notifyUserByWebPush(current.authorId, current.authorMatricule, {
        title: `ÉVASION · Commentaire de ${senderLabel}`,
        body: postSnippet ? `${preview} · Sur « ${postSnippet}... »` : preview,
        tag: `evasion-msg-${comment.id}`,
        url: deepLink,
        type: 'comment',
        data: {
          type: 'comment',
          url: deepLink,
          postId: current.id,
          commentId: comment.id,
          senderId: account.id,
          senderMatricule: account.profile.matricule,
          senderAlias: account.profile.alias,
        },
      });
    }

    return res.json({ success: true, post: updated });
  });

  app.post('/api/posts/:id/padlock', async (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;

    const postId = String(req.params.id || '');
    const current = await evasionStorage.getPostByIdSync(postId);
    if (!current) return res.status(404).json({ success: false, error: 'Post not found' });

    if ((account.profile.padlocksAvailable || 0) <= 0) {
      return res.status(400).json({ success: false, error: 'Aucun cadenas disponible.' });
    }

    account.profile.padlocksAvailable -= 1;

    const updated: StoredPost = {
      ...current,
      padlocksSealCount: (current.padlocksSealCount || 0) + 1,
    };
    evasionStorage.updatePost(updated);

    // Credit the author of the aveu with +1 padlock and +1 key for the popularity seal
    const authorAcc = evasionStorage.getAccountById(current.authorId);
    if (authorAcc && authorAcc.id !== account.id) {
      authorAcc.profile.padlocksAvailable = (authorAcc.profile.padlocksAvailable || 0) + 1;
      authorAcc.profile.keysAvailable = (authorAcc.profile.keysAvailable || 0) + 1;
      authorAcc.profile.points = (authorAcc.profile.points || 0) + 150;
      evasionStorage.saveAccount(authorAcc);
      realtimePubSub.publish('USER_UPDATED', { userId: authorAcc.id, profile: authorAcc.profile });
    }

    evasionStorage.saveAccount(account);
    realtimePubSub.publish('POST_UPDATED', { post: updated });
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, post: updated, profile: account.profile });
  });

  app.post('/api/posts/:id/passe-partout', async (req, res) => {
    const account = requireAuthAndMinKeys(req, res, MIN_KEYS_FULL_ACCESS);
    if (!account) return;

    const postId = String(req.params.id || '');
    const current = await evasionStorage.getPostByIdSync(postId);
    if (!current) return res.status(404).json({ success: false, error: 'Post not found' });

    if ((account.profile.hasPassePartoutCount || 0) <= 0) {
      return res.status(403).json({
        success: false,
        error: 'Aucun Passe-Partout en inventaire.',
      });
    }

    account.profile.hasPassePartoutCount = Math.max(0, (account.profile.hasPassePartoutCount || 1) - 1);

    const donorLabel = isTest2026Account(account) ? 'Passe-Partout 👑' : 'Passe-Partout 0,99€';
    const updated: StoredPost = {
      ...current,
      status: 'escaped',
      keysCount: Math.max(current.keysCount, current.keysRequired),
      isPinned: true,
      hasGoldBadge: true,
      escapedAt: current.escapedAt || Date.now(),
      pinnedUntil: Date.now() + 24 * 60 * 60 * 1000,
      keyDonors: current.keyDonors.includes(donorLabel) ? current.keyDonors : [donorLabel, ...current.keyDonors],
    };
    evasionStorage.updatePost(updated);

    const authorAcc = evasionStorage.getAccountById(current.authorId);
    if (authorAcc) {
      const targetProfile = authorAcc.id === account.id ? account.profile : authorAcc.profile;
      targetProfile.keysAvailable = (targetProfile.keysAvailable || 0) + 5;
      targetProfile.padlocksAvailable = (targetProfile.padlocksAvailable || 0) + 1;
      targetProfile.escapedCount = (targetProfile.escapedCount || 0) + 1;
      unlockBadgeIfMissing(authorAcc, 'badge_evade_supreme');
      if (authorAcc.id !== account.id) {
        evasionStorage.saveAccount(authorAcc);
        realtimePubSub.publish('USER_UPDATED', { userId: authorAcc.id, profile: authorAcc.profile });
      }
    }

    evasionStorage.saveAccount(account);
    realtimePubSub.publish('POST_UPDATED', { post: updated });
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, post: updated, profile: account.profile });
  });

  // --- 6. Cross-Device Chat ("La Cour") & Salons ---
  app.get('/api/chat', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      messages: evasionStorage.getChatMessages(),
    });
  });

  app.post('/api/chat', (req, res) => {
    const account = requireAuthAndMinKeys(req, res, MIN_KEYS_FULL_ACCESS);
    if (!account) return;

    const incoming = req.body as Partial<StoredChatMessage> | undefined;
    if (!incoming || typeof incoming.id !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid chat message' });
    }
    const channel = typeof incoming.channel === 'string' ? incoming.channel.slice(0, 64) : 'main';
    if (channel === 'private' && !account.profile.isVipSubscriber && !account.profile.isVipCell) {
      return res.status(403).json({ success: false, error: 'Accès VIP requis pour la Cellule Privée.' });
    }

    const content = typeof incoming.content === 'string' ? incoming.content.trim().slice(0, 1200) : '';
    if (!content && !incoming.imageUrl && !incoming.videoUrl && !incoming.audioNote?.audioData) {
      return res.status(400).json({ success: false, error: 'Message vide.' });
    }

    const newMsg: StoredChatMessage = {
      id: incoming.id.slice(0, 96),
      authorId: account.id,
      authorMatricule: account.profile.matricule,
      authorAvatar: account.profile.avatar,
      content,
      audioNote: incoming.audioNote,
      imageUrl: typeof incoming.imageUrl === 'string' ? incoming.imageUrl.slice(0, 1000) : undefined,
      videoUrl: typeof incoming.videoUrl === 'string' ? incoming.videoUrl.slice(0, 1000) : undefined,
      videoDuration: typeof incoming.videoDuration === 'number' ? incoming.videoDuration : undefined,
      timestamp: typeof incoming.timestamp === 'number' ? incoming.timestamp : Date.now(),
      isVip: Boolean(account.profile.isVipSubscriber || account.profile.isVipCell),
      neonColor: account.profile.neonColor,
      channel,
      recipientId: typeof incoming.recipientId === 'string' ? incoming.recipientId.slice(0, 64) : undefined,
      recipientMatricule:
        typeof incoming.recipientMatricule === 'string' ? incoming.recipientMatricule.slice(0, 64) : undefined,
    };

    const result = evasionStorage.addChatMessage(newMsg);
    if (!result.alreadyExisted) {
      realtimePubSub.publish('CHAT_CREATED', { message: result.msg });

      const senderLabel = account.profile.alias || account.profile.matricule;
      const preview = formatMessagePreview({
        content: newMsg.content,
        hasImage: Boolean(newMsg.imageUrl),
        hasVideo: Boolean(newMsg.videoUrl),
        hasAudio: Boolean(newMsg.audioNote?.audioData),
      });

      if (newMsg.recipientId || newMsg.recipientMatricule) {
        const deepLink = `/?notif=dm&from=${encodeURIComponent(account.profile.matricule)}&fromId=${encodeURIComponent(account.id)}&fromAlias=${encodeURIComponent(senderLabel)}&msgId=${encodeURIComponent(newMsg.id)}`;
        void notifyUserByWebPush(newMsg.recipientId, newMsg.recipientMatricule, {
          title: `ÉVASION · MP de ${senderLabel}`,
          body: `${preview} · Appuie pour lire et répondre`,
          tag: `evasion-msg-${newMsg.id}`,
          url: deepLink,
          type: 'dm',
          data: {
            type: 'dm',
            url: deepLink,
            messageId: newMsg.id,
            senderId: account.id,
            senderMatricule: account.profile.matricule,
            senderAlias: account.profile.alias,
            senderAvatar: account.profile.avatar,
            senderNeonColor: account.profile.neonColor,
          },
        });
      } else {
        const channelName = newMsg.channel || 'main';
        const deepLink = `/?notif=cour&channel=${encodeURIComponent(channelName)}&msgId=${encodeURIComponent(newMsg.id)}`;
        void notifyCourWebPush(account.id, account.profile.matricule, {
          title: `ÉVASION · ${senderLabel} dans La Cour`,
          body: preview,
          tag: `evasion-msg-${newMsg.id}`,
          url: deepLink,
          type: 'cour',
          data: {
            type: 'cour',
            url: deepLink,
            messageId: newMsg.id,
            channel: channelName,
            senderId: account.id,
            senderMatricule: account.profile.matricule,
          },
        });
      }
    }
    return res.json({ success: true, message: result.msg });
  });

  app.get('/api/salons', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      salons: evasionStorage.getSalons(),
    });
  });

  app.post('/api/salons', (req, res) => {
    const account = requireAuthAndMinKeys(req, res, MIN_KEYS_FULL_ACCESS);
    if (!account) return;

    const rawName = typeof req.body?.nameOrTag === 'string' ? req.body.nameOrTag.trim().replace(/^#+/, '').trim() : '';
    if (!rawName) return res.status(400).json({ success: false, error: 'Nom de salon invalide.' });

    const formattedTag = `#${rawName
      .slice(0, 32)
      .split(/\s+/)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')}`;
    const desc =
      typeof req.body?.description === 'string' && req.body.description.trim()
        ? req.body.description.trim().slice(0, 160)
        : `Salon communautaire autour de ${formattedTag}`;

    const providedSalonId =
      typeof req.body?.id === 'string' && req.body.id.startsWith('salon_')
        ? req.body.id.slice(0, 64)
        : `salon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const newSalon: StoredSalon = {
      id: providedSalonId,
      tag: formattedTag,
      name: rawName.slice(0, 40),
      description: desc,
      createdBy: account.profile.alias || account.profile.matricule,
      createdAt: Date.now(),
    };

    const result = evasionStorage.addSalon(newSalon);
    if (!result.alreadyExisted) {
      realtimePubSub.publish('SALON_CREATED', { salon: result.salon });
    }
    return res.json({ success: true, salon: result.salon, alreadyExisted: result.alreadyExisted });
  });

  // --- 7. Cross-Device Live Video Sync (Enforces strict 50 keys to start Live) ---
  app.get('/api/lives', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      lives: evasionStorage.getLives(),
    });
  });

  app.post('/api/lives', (req, res) => {
    const account = requireAuthAndMinKeys(req, res, LIVE_MIN_KEYS_REQUIRED);
    if (!account) return;

    const rawTitle = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 80) : '';
    const rawTag = typeof req.body?.topicTag === 'string' ? req.body.topicTag.trim().slice(0, 40) : '';
    const filter = ['none', 'neon', 'mono', 'warm'].includes(req.body?.filter) ? req.body.filter : 'none';
    const cleanTitle = rawTitle || 'Live Évasion en direct 🔴';
    const cleanTag = rawTag ? (rawTag.startsWith('#') ? rawTag : `#${rawTag}`) : '#Détox';
    const providedLiveId =
      typeof req.body?.id === 'string' && req.body.id.startsWith('live_')
        ? req.body.id.slice(0, 64)
        : `live_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const newLive: StoredLiveSession = {
      id: providedLiveId,
      hostId: account.id,
      hostName: account.profile.alias || account.profile.matricule,
      hostMatricule: account.profile.matricule,
      hostAvatar: account.profile.avatar,
      hostNeonColor: account.profile.neonColor,
      hostFrame: account.profile.cellBorderFrame,
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

    // End any existing active live session for this host (except the same liveId if re-syncing)
    for (const l of evasionStorage.getLives()) {
      if (
        l.id !== newLive.id &&
        l.isActive &&
        (l.hostId === account.id || l.hostMatricule === account.profile.matricule)
      ) {
        evasionStorage.endLive(l.id);
        realtimePubSub.publish('LIVE_ENDED', { liveId: l.id });
      }
    }

    const existingSameLive = evasionStorage.getLiveById(newLive.id);
    if (existingSameLive && existingSameLive.isActive) {
      liveHostHeartbeats.set(existingSameLive.id, Date.now());
      return res.json({
        success: true,
        live: existingSameLive,
        token: signSessionToken(account.id),
      });
    }

    evasionStorage.createLive(newLive);
    liveHostHeartbeats.set(newLive.id, Date.now());
    realtimePubSub.publish('LIVE_CREATED', { live: newLive });

    // Upgrade any WebSocket of this host that already joined the room before POST /api/lives finished
    const hostBodyId = typeof req.body?.hostId === 'string' ? req.body.hostId.trim() : '';
    const hostIdsSet = new Set([account.id, ...(hostBodyId ? [hostBodyId] : [])]);
    const hostReadyPeers: { userId: string; role: string }[] = [];
    for (const peer of wsClients) {
      if (peer.readyState !== WebSocket.OPEN || peer.activeLiveRoomId !== newLive.id) continue;
      if (peer.clientUserId && !hostIdsSet.has(peer.clientUserId)) {
        hostReadyPeers.push({ userId: peer.clientUserId, role: peer.liveRole || 'viewer' });
      }
    }
    for (const peer of wsClients) {
      if (peer.readyState !== WebSocket.OPEN || peer.activeLiveRoomId !== newLive.id) continue;
      if (peer.clientUserId && hostIdsSet.has(peer.clientUserId)) {
        peer.liveRole = 'host';
        notifyRelaySubscribersCount(newLive.id, account.id);
        try {
          peer.send(
            JSON.stringify({
              type: 'LIVE_RTC_ROOM_PEERS',
              payload: { liveId: newLive.id, peers: hostReadyPeers },
            })
          );
        } catch {
          // ignore
        }
      } else if (peer.clientUserId) {
        try {
          peer.send(
            JSON.stringify({
              type: 'LIVE_RTC_PEER_JOINED',
              payload: { liveId: newLive.id, userId: account.id, role: 'host' },
            })
          );
        } catch {
          // ignore
        }
      }
    }

    broadcastOnlineUsers();

    try {
      const allSubs = evasionStorage.getAllPushSubscriptions();
      const targets = allSubs.filter((s) => s.userId !== account.id);
      void sendWebPushToSubscriptions(targets, {
        title: `🔴 LIVE EN DIRECT · ${cleanTitle}`,
        body: `${account.profile.alias || account.profile.matricule} vient de lancer un Live dans ${cleanTag} ! Rejoins la diffusion.`,
        tag: `evasion-live-${newLive.id}`,
        url: `/?notif=live&liveId=${encodeURIComponent(newLive.id)}`,
        type: 'cour',
        data: {
          type: 'live',
          liveId: newLive.id,
          hostId: account.id,
          hostName: account.profile.alias || account.profile.matricule,
          title: cleanTitle,
          topicTag: cleanTag,
        },
      });
    } catch {
      // ignore push errors
    }

    return res.json({ success: true, live: newLive, token: signSessionToken(account.id) });
  });

  app.get('/api/rtc/ice-servers', (_req, res) => {
    const iceServers: RTCIceServer[] = [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
          'stun:stun.cloudflare.com:3478',
        ],
      },
    ];
    const customTurnUrls = (process.env.TURN_URLS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (customTurnUrls.length > 0 && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: customTurnUrls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    } else {
      iceServers.push(
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turns:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        }
      );
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, iceServers });
  });

  app.get('/api/users/online', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      users: getOnlineUsersRoster(),
      onlineInmatesCount: getPresenceCount(),
      lives: evasionStorage.getLives(),
    });
  });

  app.post('/api/lives/:id/invite', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || !live.isActive) {
      return res.status(404).json({ success: false, error: 'Live introuvable ou terminé.' });
    }

    const mode: 'viewer' | 'cohost' = req.body?.mode === 'cohost' ? 'cohost' : 'viewer';
    const rawTargetId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
    const rawTargetMatricule =
      typeof req.body?.targetMatricule === 'string' ? req.body.targetMatricule.trim() : '';

    const senderName = account.profile.alias || account.profile.matricule;

    if (rawTargetId === 'ALL') {
      if (mode === 'cohost') {
        return res.status(400).json({
          success: false,
          error: 'Sélectionne un utilisateur précis pour monter sur écran (max 5).',
        });
      }
      const invitePayload = {
        id: `linv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        liveId: live.id,
        liveTitle: live.title,
        topicTag: live.topicTag,
        fromUserId: account.id,
        fromName: senderName,
        fromAvatar: account.profile.avatar,
        targetUserId: 'ALL',
        mode: 'viewer' as const,
        createdAt: Date.now(),
      };
      realtimePubSub.publish('LIVE_INVITE_RECEIVED', { invite: invitePayload });

      try {
        const allSubs = evasionStorage.getAllPushSubscriptions();
        const targets = allSubs.filter((s) => s.userId !== account.id);
        void sendWebPushToSubscriptions(targets, {
          title: `📣 ${senderName} t'invite dans son Live !`,
          body: `${live.title} (${live.topicTag}) · Appuie pour rejoindre maintenant`,
          tag: `evasion-live-invite-${live.id}`,
          url: `/?notif=live_invite&liveId=${encodeURIComponent(live.id)}&inviteMode=viewer`,
          type: 'cour',
          data: {
            type: 'live_invite',
            liveId: live.id,
            inviteMode: 'viewer',
            fromName: senderName,
          },
        });
      } catch {
        // ignore push errors
      }
      return res.json({ success: true, invitedCount: Math.max(0, getOnlineUsersRoster().length - 1) });
    }

    let targetAcc = rawTargetId ? evasionStorage.getAccountById(rawTargetId) : null;
    if (!targetAcc && rawTargetMatricule) {
      targetAcc = evasionStorage.findAccountByIdentifier(rawTargetMatricule);
    }
    if (!targetAcc) {
      return res.status(404).json({ success: false, error: 'Codétenu introuvable.' });
    }
    if (targetAcc.id === account.id) {
      return res.status(400).json({ success: false, error: 'Tu es déjà dans ce Live.' });
    }

    const currentGuests = live.guests || [];
    if (mode === 'cohost') {
      if (live.hostId !== account.id) {
        return res.status(403).json({
          success: false,
          error: "Seul l'hôte du Live peut inviter à monter sur l'écran.",
        });
      }
      if (currentGuests.length >= 4) {
        return res.status(400).json({
          success: false,
          error: 'Écran complet (5 participants max : 1 hôte + 4 invités).',
        });
      }
      if (currentGuests.some((g) => g.userId === targetAcc!.id)) {
        return res.status(400).json({
          success: false,
          error: `${targetAcc.profile.alias || targetAcc.profile.matricule} est déjà à l'écran.`,
        });
      }

      const pending = (live.pendingInvites || []).filter((p) => p.targetUserId !== targetAcc!.id);
      pending.push({
        targetUserId: targetAcc.id,
        targetName: targetAcc.profile.alias || targetAcc.profile.matricule,
        mode: 'cohost',
        invitedAt: Date.now(),
      });
      const updated = { ...live, pendingInvites: pending.slice(-20) };
      evasionStorage.updateLive(updated);
      realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    }

    const invitePayload = {
      id: `linv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      liveId: live.id,
      liveTitle: live.title,
      topicTag: live.topicTag,
      fromUserId: account.id,
      fromName: senderName,
      fromAvatar: account.profile.avatar,
      targetUserId: targetAcc.id,
      mode,
      createdAt: Date.now(),
    };
    realtimePubSub.publish('LIVE_INVITE_RECEIVED', { invite: invitePayload });

    try {
      void notifyUserByWebPush(targetAcc.id, targetAcc.profile.matricule, {
        title:
          mode === 'cohost'
            ? `🎥 ${senderName} t'invite sur l'écran du Live !`
            : `🔴 ${senderName} t'invite à regarder son Live`,
        body:
          mode === 'cohost'
            ? `Live en Live à plusieurs sur « ${live.title} » · Monte à l'écran !`
            : `${live.title} (${live.topicTag})`,
        tag: `evasion-live-invite-${live.id}-${targetAcc.id}`,
        url: `/?notif=live_invite&liveId=${encodeURIComponent(live.id)}&inviteMode=${mode}`,
        type: 'cour',
        data: {
          type: 'live_invite',
          liveId: live.id,
          inviteMode: mode,
          fromName: senderName,
        },
      });
    } catch {
      // ignore push errors
    }

    return res.json({ success: true, invite: invitePayload, live: evasionStorage.getLiveById(live.id) });
  });

  app.post('/api/lives/:id/cohost/respond', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || !live.isActive) {
      return res.status(404).json({ success: false, error: 'Live introuvable ou terminé.' });
    }
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({ success: false, blocked: true, liveId: live.id, error: 'Live terminé.' });
    }
    const accept = Boolean(req.body?.accept);
    const pendingInvites = (live.pendingInvites || []).filter((p) => p.targetUserId !== account.id);
    const guestRequests = (live.guestRequests || []).filter((r) => r.userId !== account.id);

    if (!accept) {
      const updated = { ...live, pendingInvites, guestRequests };
      evasionStorage.updateLive(updated);
      realtimePubSub.publish('LIVE_UPDATED', { live: updated });
      return res.json({ success: true, live: updated });
    }

    const currentGuests = live.guests || [];
    if (live.hostId === account.id) {
      return res.json({ success: true, live });
    }
    const alreadyOnStage = currentGuests.some((g) => g.userId === account.id);
    if (!alreadyOnStage && currentGuests.length >= 4) {
      return res.status(400).json({
        success: false,
        error: "Toutes les places sur l'écran sont prises (5 participants max).",
      });
    }

    const nextGuests = alreadyOnStage
      ? currentGuests
      : [
          ...currentGuests,
          {
            userId: account.id,
            matricule: account.profile.matricule,
            alias: account.profile.alias || account.profile.matricule,
            avatar: account.profile.avatar,
            neonColor: account.profile.neonColor,
            frame: account.profile.cellBorderFrame,
            camEnabled: req.body?.camEnabled !== false,
            micEnabled: req.body?.micEnabled !== false,
            joinedAt: Date.now(),
          },
        ];

    const joinComment: StoredLiveComment = {
      id: `lc_cohost_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      authorId: account.id,
      authorName: account.profile.alias || account.profile.matricule,
      authorAvatar: account.profile.avatar,
      content: `🎥 ${account.profile.alias || account.profile.matricule} a rejoint l'écran du Live (${nextGuests.length + 1}/5) !`,
      type: 'system',
      timestamp: Date.now(),
    };

    const updated: StoredLiveSession = {
      ...live,
      guests: nextGuests,
      pendingInvites,
      guestRequests,
      comments: [...live.comments.slice(-60), joinComment],
    };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    broadcastOnlineUsers();
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/cohost/request', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || !live.isActive) {
      return res.status(404).json({ success: false, error: 'Live introuvable.' });
    }
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({ success: false, blocked: true, liveId: live.id, error: 'Live terminé.' });
    }
    if (live.hostId === account.id || live.guests?.some((g) => g.userId === account.id)) {
      return res.status(400).json({ success: false, error: "Tu es déjà sur l'écran." });
    }
    if ((live.guests || []).length >= 4) {
      return res.status(400).json({ success: false, error: 'Écran complet (5/5 participants).' });
    }

    const existingReqs = (live.guestRequests || []).filter((r) => r.userId !== account.id);
    existingReqs.push({
      userId: account.id,
      matricule: account.profile.matricule,
      alias: account.profile.alias || account.profile.matricule,
      avatar: account.profile.avatar,
      neonColor: account.profile.neonColor,
      requestedAt: Date.now(),
    });

    const updated: StoredLiveSession = {
      ...live,
      guestRequests: existingReqs.slice(-15),
    };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/cohost/approve-request', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    const isHostCaller = Boolean(
      live &&
        (live.hostId === account.id ||
          live.hostMatricule === account.profile.matricule ||
          (typeof req.body?.hostId === 'string' && req.body.hostId === live.hostId))
    );
    if (!live || !isHostCaller) {
      return res.status(403).json({ success: false, error: "Seul l'hôte peut approuver." });
    }

    const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
    const accept = req.body?.accept !== false;
    const guestRequests = (live.guestRequests || []).filter((r) => r.userId !== targetUserId);

    if (!accept) {
      const updated = { ...live, guestRequests };
      evasionStorage.updateLive(updated);
      realtimePubSub.publish('LIVE_UPDATED', { live: updated });
      return res.json({ success: true, live: updated });
    }

    const targetAcc = evasionStorage.getAccountById(targetUserId);
    if (!targetAcc) {
      const updated = { ...live, guestRequests };
      evasionStorage.updateLive(updated);
      realtimePubSub.publish('LIVE_UPDATED', { live: updated });
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    }

    const currentGuests = live.guests || [];
    if (!currentGuests.some((g) => g.userId === targetUserId) && currentGuests.length >= 4) {
      return res.status(400).json({ success: false, error: 'Écran complet (5/5 max).' });
    }

    const nextGuests = currentGuests.some((g) => g.userId === targetUserId)
      ? currentGuests
      : [
          ...currentGuests,
          {
            userId: targetAcc.id,
            matricule: targetAcc.profile.matricule,
            alias: targetAcc.profile.alias || targetAcc.profile.matricule,
            avatar: targetAcc.profile.avatar,
            neonColor: targetAcc.profile.neonColor,
            frame: targetAcc.profile.cellBorderFrame,
            camEnabled: true,
            micEnabled: true,
            joinedAt: Date.now(),
          },
        ];

    const joinComment: StoredLiveComment = {
      id: `lc_cohost_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      authorId: targetAcc.id,
      authorName: targetAcc.profile.alias || targetAcc.profile.matricule,
      authorAvatar: targetAcc.profile.avatar,
      content: `🎥 ${targetAcc.profile.alias || targetAcc.profile.matricule} monte sur l'écran (${nextGuests.length + 1}/5) !`,
      type: 'system',
      timestamp: Date.now(),
    };

    const updated: StoredLiveSession = {
      ...live,
      guests: nextGuests,
      guestRequests,
      comments: [...live.comments.slice(-60), joinComment],
    };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    broadcastOnlineUsers();
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/cohost/remove', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live) return res.status(404).json({ success: false });

    const targetUserId =
      typeof req.body?.targetUserId === 'string' && req.body.targetUserId.trim()
        ? req.body.targetUserId.trim()
        : account.id;

    const isHostCaller = Boolean(
      live.hostId === account.id ||
        live.hostMatricule === account.profile.matricule ||
        (typeof req.body?.hostId === 'string' && req.body.hostId === live.hostId)
    );
    const isSelfLeave =
      targetUserId === account.id ||
      (typeof req.body?.userId === 'string' && req.body.userId === targetUserId);
    if (!isHostCaller && !isSelfLeave) {
      return res.status(403).json({ success: false });
    }

    const targetGuest = (live.guests || []).find(
      (g) => g.userId === targetUserId || g.matricule === account.profile.matricule
    );
    const nextGuests = (live.guests || []).filter(
      (g) => g.userId !== targetUserId && (!isSelfLeave || g.matricule !== account.profile.matricule)
    );

    const leaveComment: StoredLiveComment | null = targetGuest
      ? {
          id: `lc_cohost_leave_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          authorId: targetGuest.userId,
          authorName: targetGuest.alias || targetGuest.matricule,
          authorAvatar: targetGuest.avatar,
          content: `${targetGuest.alias || targetGuest.matricule} a quitté l'écran du Live.`,
          type: 'system',
          timestamp: Date.now(),
        }
      : null;

    const updated: StoredLiveSession = {
      ...live,
      guests: nextGuests,
      comments: leaveComment ? [...live.comments.slice(-60), leaveComment] : live.comments,
    };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    broadcastOnlineUsers();
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/cohost/media', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live) return res.status(404).json({ success: false });

    const isHostCaller = Boolean(
      live.hostId === account.id || live.hostMatricule === account.profile.matricule
    );
    const targetUserId =
      typeof req.body?.targetUserId === 'string' && isHostCaller
        ? req.body.targetUserId.trim()
        : account.id;

    const nextGuests = (live.guests || []).map((g) => {
      if (g.userId !== targetUserId && g.matricule !== account.profile.matricule) return g;
      return {
        ...g,
        camEnabled: typeof req.body?.camEnabled === 'boolean' ? req.body.camEnabled : g.camEnabled,
        micEnabled: typeof req.body?.micEnabled === 'boolean' ? req.body.micEnabled : g.micEnabled,
      };
    });

    const updated = { ...live, guests: nextGuests };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/announcement', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    const isHostCaller = Boolean(
      live &&
        (live.hostId === account.id ||
          live.hostMatricule === account.profile.matricule ||
          (typeof req.body?.hostId === 'string' && req.body.hostId === live.hostId))
    );
    if (!live || !isHostCaller) {
      return res.status(403).json({ success: false });
    }
    const text =
      typeof req.body?.pinnedAnnouncement === 'string'
        ? req.body.pinnedAnnouncement.trim().slice(0, 140)
        : '';
    const updated = { ...live, pinnedAnnouncement: text || undefined };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/heartbeat', (req, res) => {
    const liveId = String(req.params.id || '');
    if (!liveId) return res.status(400).json({ success: false });

    const nowTs = Date.now();
    liveHostHeartbeats.set(liveId, nowTs);

    let live = evasionStorage.getLiveById(liveId);
    if (!live && req.body?.live && typeof req.body.live === 'object') {
      const account = getOrProvisionAccount(req, res);
      const snap = req.body.live as Partial<StoredLiveSession>;
      const restoredLive: StoredLiveSession = {
        id: liveId,
        hostId: snap.hostId || account.id,
        hostName: snap.hostName || account.profile.alias || account.profile.matricule,
        hostMatricule: snap.hostMatricule || account.profile.matricule,
        hostAvatar: snap.hostAvatar || account.profile.avatar,
        hostNeonColor: snap.hostNeonColor || account.profile.neonColor,
        hostFrame: snap.hostFrame || account.profile.cellBorderFrame,
        title: snap.title || 'Live Évasion en direct 🔴',
        topicTag: snap.topicTag || '#Détox',
        startedAt: typeof snap.startedAt === 'number' ? snap.startedAt : nowTs,
        viewersCount: Array.isArray(snap.activeViewers) ? snap.activeViewers.length : 0,
        likesCount: typeof snap.likesCount === 'number' ? snap.likesCount : 0,
        keysReceived: typeof snap.keysReceived === 'number' ? snap.keysReceived : 0,
        padlocksReceived: typeof snap.padlocksReceived === 'number' ? snap.padlocksReceived : 0,
        iceConesReceived: typeof snap.iceConesReceived === 'number' ? snap.iceConesReceived : 0,
        waterBottlesReceived: typeof snap.waterBottlesReceived === 'number' ? snap.waterBottlesReceived : 0,
        cansReceived: typeof snap.cansReceived === 'number' ? snap.cansReceived : 0,
        isActive: true,
        filter: snap.filter || 'none',
        comments: Array.isArray(snap.comments) ? snap.comments : [],
        guests: Array.isArray(snap.guests) ? snap.guests : [],
        activeViewers: Array.isArray(snap.activeViewers) ? snap.activeViewers : [],
      };
      evasionStorage.createLive(restoredLive);
      realtimePubSub.publish('LIVE_CREATED', { live: restoredLive });
      live = restoredLive;
    }

    return res.json({ success: true, ts: nowTs, live });
  });

  app.post('/api/lives/:id/end', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const liveId = String(req.params.id || '');
    const live = evasionStorage.getLiveById(liveId);
    if (!live) {
      liveHostHeartbeats.delete(liveId);
      realtimePubSub.publish('LIVE_ENDED', { liveId });
      return res.json({ success: true });
    }
    if (
      account &&
      live.hostId !== account.id &&
      live.hostMatricule !== account.profile.matricule &&
      req.body?.hostId !== live.hostId
    ) {
      return res.status(403).json({ success: false, error: 'Seul le créateur peut terminer ce Live.' });
    }
    liveHostHeartbeats.delete(liveId);
    evasionStorage.endLive(liveId);
    realtimePubSub.publish('LIVE_ENDED', { liveId });
    broadcastOnlineUsers();
    return res.json({ success: true });
  });

  app.post('/api/lives/:id/block', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    const liveId = String(req.params.id || '');
    const live = evasionStorage.getLiveById(liveId);
    if (!live) return res.status(404).json({ success: false, error: 'Live introuvable.' });
    const isHostCaller = Boolean(
      live.hostId === account.id ||
        live.hostMatricule === account.profile.matricule ||
        (typeof req.body?.hostId === 'string' && req.body.hostId === live.hostId)
    );
    if (!isHostCaller) {
      return res.status(403).json({ success: false, error: 'Seul le créateur peut bloquer un spectateur.' });
    }

    const rawTargetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
    const rawTargetMatricule = typeof req.body?.targetMatricule === 'string' ? req.body.targetMatricule.trim() : '';
    if (!rawTargetUserId && !rawTargetMatricule) {
      return res.status(400).json({ success: false, error: 'Utilisateur cible manquant.' });
    }

    const targetAcc =
      (rawTargetUserId ? evasionStorage.getAccountById(rawTargetUserId) : null) ||
      (rawTargetMatricule ? evasionStorage.findAccountByIdentifier(rawTargetMatricule) : null);

    const resolvedUserId = targetAcc?.id || rawTargetUserId || rawTargetMatricule;
    const resolvedMatricule = targetAcc?.profile?.matricule || rawTargetMatricule;

    if (resolvedUserId === account.id || resolvedMatricule === account.profile.matricule) {
      return res.status(400).json({ success: false, error: 'Impossible de te bloquer toi-même.' });
    }

    const keysToBlock = new Set<string>(live.blockedUserIds || []);
    if (rawTargetUserId) keysToBlock.add(rawTargetUserId);
    if (resolvedUserId) keysToBlock.add(resolvedUserId);
    if (resolvedMatricule) keysToBlock.add(resolvedMatricule);

    const prevViewers = live.activeViewers || [];
    const nextViewers = prevViewers.filter(
      (v) => !keysToBlock.has(v.userId) && !keysToBlock.has(v.matricule)
    );
    const wasViewerRemoved = prevViewers.length > nextViewers.length;
    const nextGuests = (live.guests || []).filter(
      (g) => !keysToBlock.has(g.userId) && !keysToBlock.has(g.matricule)
    );
    const nextGuestRequests = (live.guestRequests || []).filter(
      (r) => !keysToBlock.has(r.userId) && !keysToBlock.has(r.matricule)
    );
    const nextPendingInvites = (live.pendingInvites || []).filter(
      (p) => !keysToBlock.has(p.targetUserId)
    );

    const updated: StoredLiveSession = {
      ...live,
      blockedUserIds: Array.from(keysToBlock),
      activeViewers: nextViewers,
      guests: nextGuests,
      guestRequests: nextGuestRequests,
      pendingInvites: nextPendingInvites,
      viewersCount: nextViewers.length,
    };

    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    realtimePubSub.publish('LIVE_USER_BLOCKED', {
      liveId: live.id,
      targetUserId: resolvedUserId,
      targetMatricule: resolvedMatricule,
    });

    // Force-evict blocked user from active WebRTC room immediately
    const blockPayload = JSON.stringify({
      type: 'LIVE_USER_BLOCKED',
      payload: {
        liveId: live.id,
        targetUserId: resolvedUserId,
        targetMatricule: resolvedMatricule,
      },
    });
    const leaveFrame = JSON.stringify({
      type: 'LIVE_RTC_PEER_LEFT',
      payload: { liveId: live.id, userId: resolvedUserId },
    });
    for (const client of wsClients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.clientUserId && keysToBlock.has(client.clientUserId)) {
        if (client.activeLiveRoomId === live.id) {
          client.activeLiveRoomId = undefined;
          client.liveRole = undefined;
        }
        try {
          client.send(blockPayload);
        } catch {
          // ignore
        }
      } else if (client.activeLiveRoomId === live.id) {
        try {
          client.send(leaveFrame);
        } catch {
          // ignore
        }
      }
    }

    broadcastOnlineUsers();
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/join', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || !live.isActive) return res.status(404).json({ success: false, error: 'Live introuvable ou terminé.' });
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({
        success: false,
        blocked: true,
        liveId: live.id,
        error: 'Live terminé.',
      });
    }
    if (live.hostId !== account.id) {
      const prevViewers = live.activeViewers || [];
      const alreadyViewer = prevViewers.some(
        (v) => v.userId === account.id || v.matricule === account.profile.matricule
      );
      const nextViewers = [
        ...prevViewers.filter(
          (v) => v.userId !== account.id && v.matricule !== account.profile.matricule
        ),
        {
          userId: account.id,
          matricule: account.profile.matricule,
          alias: account.profile.alias || account.profile.matricule,
          avatar: account.profile.avatar,
          neonColor: account.profile.neonColor,
          joinedAt: Date.now(),
        },
      ].slice(-120);
      const updated: StoredLiveSession = {
        ...live,
        activeViewers: nextViewers,
        viewersCount: nextViewers.length,
      };
      evasionStorage.updateLive(updated);
      realtimePubSub.publish('LIVE_UPDATED', { live: updated });
      return res.json({ success: true, live: updated });
    }
    return res.json({ success: true, live });
  });

  app.post('/api/lives/:id/leave', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live) return res.json({ success: true });
    if (live.hostId !== account.id && live.hostMatricule !== account.profile.matricule) {
      const prevViewers = live.activeViewers || [];
      const nextViewers = prevViewers.filter(
        (v) => v.userId !== account.id && v.matricule !== account.profile.matricule
      );
      const updated: StoredLiveSession = {
        ...live,
        activeViewers: nextViewers,
        viewersCount: nextViewers.length,
      };
      evasionStorage.updateLive(updated);
      realtimePubSub.publish('LIVE_UPDATED', { live: updated });
      return res.json({ success: true, live: updated });
    }
    return res.json({ success: true, live });
  });

  app.post('/api/lives/:id/filter', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    const isHostCaller = Boolean(
      live &&
        (live.hostId === account.id ||
          live.hostMatricule === account.profile.matricule ||
          (typeof req.body?.hostId === 'string' && req.body.hostId === live.hostId))
    );
    if (!live || !isHostCaller) return res.status(403).json({ success: false });
    const filter = ['none', 'neon', 'mono', 'warm'].includes(req.body?.filter) ? req.body.filter : 'none';
    const updated = { ...live, filter };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/comment', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || !live.isActive) return res.status(404).json({ success: false });
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({ success: false, blocked: true, liveId: live.id, error: 'Live terminé.' });
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 300) : '';
    if (!content) return res.status(400).json({ success: false });

    const comment: StoredLiveComment = {
      id: `lc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      authorId: account.id,
      authorName: account.profile.alias || account.profile.matricule,
      authorAvatar: account.profile.avatar,
      content,
      type: 'chat',
      timestamp: Date.now(),
    };
    const updated: StoredLiveSession = {
      ...live,
      comments: [...live.comments.slice(-60), comment],
    };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/like', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || !live.isActive) return res.status(404).json({ success: false });
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({ success: false, blocked: true, liveId: live.id, error: 'Live terminé.' });
    }
    const updated = { ...live, likesCount: live.likesCount + 1 };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    realtimePubSub.publish('LIVE_REACTION', {
      liveId: live.id,
      emoji: '❤️',
      userId: account.id,
      alias: account.profile.alias || account.profile.matricule,
    });
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/reaction', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || !live.isActive) return res.status(404).json({ success: false });
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({ success: false, blocked: true, liveId: live.id, error: 'Live terminé.' });
    }
    const rawEmoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '❤️';
    const allowedEmojis = ['❤️', '🔥', '👏', '😂', '😮', '💯', '🎉', '🔑'];
    const emoji = allowedEmojis.includes(rawEmoji) ? rawEmoji : '❤️';
    let updated = live;
    if (emoji === '❤️') {
      updated = { ...live, likesCount: live.likesCount + 1 };
      evasionStorage.updateLive(updated);
      realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    }
    realtimePubSub.publish('LIVE_REACTION', {
      liveId: live.id,
      emoji,
      userId: account.id,
      alias: account.profile.alias || account.profile.matricule,
    });
    return res.json({ success: true, live: updated });
  });

  app.post('/api/lives/:id/key', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || live.hostId === account.id) return res.status(400).json({ success: false });
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({ success: false, blocked: true, liveId: live.id, error: 'Live terminé.' });
    }
    if (account.profile.keysAvailable <= 0) {
      return res.status(400).json({ success: false, error: 'Aucune clé disponible.' });
    }

    account.profile.keysAvailable -= 1;
    account.profile.keysGivenTotal += 1;
    if (account.profile.keysGivenTotal % 10 === 0) {
      account.profile.hasPassePartoutCount = (account.profile.hasPassePartoutCount || 0) + 1;
    }
    if (account.profile.keysGivenTotal >= 10) {
      unlockBadgeIfMissing(account, 'badge_clef_or');
    }
    evasionStorage.saveAccount(account);

    // Le créateur du Live reçoit la clé et les +100 points pour la Cantine
    const hostAcc = evasionStorage.getAccountById(live.hostId);
    if (hostAcc && hostAcc.id !== account.id) {
      hostAcc.profile.keysAvailable = (hostAcc.profile.keysAvailable || 0) + 1;
      hostAcc.profile.points = (hostAcc.profile.points || 0) + 100;
      evasionStorage.saveAccount(hostAcc);
      realtimePubSub.publish('USER_UPDATED', { userId: hostAcc.id, profile: hostAcc.profile });
    }

    const giftComment: StoredLiveComment = {
      id: `lc_key_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      authorId: account.id,
      authorName: account.profile.alias || account.profile.matricule,
      authorAvatar: account.profile.avatar,
      content: 'a offert 1 Clé Haute Valeur 🔑 au créateur (+100 pts Cantine) !',
      type: 'key_gift',
      timestamp: Date.now(),
    };
    const updated: StoredLiveSession = {
      ...live,
      keysReceived: live.keysReceived + 1,
      comments: [...live.comments.slice(-60), giftComment],
    };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, live: updated, profile: account.profile });
  });

  app.post('/api/lives/:id/padlock', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || live.hostId === account.id) return res.status(400).json({ success: false });
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({ success: false, blocked: true, liveId: live.id, error: 'Live terminé.' });
    }
    if ((account.profile.padlocksAvailable || 0) <= 0) {
      return res.status(400).json({ success: false, error: 'Aucun cadenas disponible.' });
    }

    account.profile.padlocksAvailable -= 1;
    evasionStorage.saveAccount(account);

    // Le créateur du Live reçoit le cadenas et les +150 points pour la Cantine
    const hostAcc = evasionStorage.getAccountById(live.hostId);
    if (hostAcc && hostAcc.id !== account.id) {
      hostAcc.profile.padlocksAvailable = (hostAcc.profile.padlocksAvailable || 0) + 1;
      hostAcc.profile.points = (hostAcc.profile.points || 0) + 150;
      evasionStorage.saveAccount(hostAcc);
      realtimePubSub.publish('USER_UPDATED', { userId: hostAcc.id, profile: hostAcc.profile });
    }

    const lockComment: StoredLiveComment = {
      id: `lc_lock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      authorId: account.id,
      authorName: account.profile.alias || account.profile.matricule,
      authorAvatar: account.profile.avatar,
      content: 'a offert 1 Cadenas 🔒 au créateur (+150 pts Cantine) !',
      type: 'padlock',
      timestamp: Date.now(),
    };
    const updated: StoredLiveSession = {
      ...live,
      padlocksReceived: live.padlocksReceived + 1,
      comments: [...live.comments.slice(-60), lockComment],
    };
    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, live: updated, profile: account.profile });
  });

  app.post('/api/lives/:id/gift', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    if (!account) return;
    const live = evasionStorage.getLiveById(String(req.params.id || ''));
    if (!live || live.hostId === account.id) return res.status(400).json({ success: false });
    const blockedIds = live.blockedUserIds || [];
    if (blockedIds.includes(account.id) || blockedIds.includes(account.profile.matricule)) {
      return res.status(403).json({ success: false, blocked: true, liveId: live.id, error: 'Live terminé.' });
    }

    const giftType = String(req.body?.giftType || '');
    if (!['ice_cone', 'water_bottle', 'canned_food'].includes(giftType)) {
      return res.status(400).json({ success: false, error: 'Cadeau invalide.' });
    }

    const giftMeta: Record<string, { label: string; pts: number; idPrefix: string }> = {
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
    // Seul le créateur (hostAcc) reçoit les points pour accéder à la Cantine
    const hostAcc = evasionStorage.getAccountById(live.hostId);
    if (hostAcc && hostAcc.id !== account.id) {
      hostAcc.profile.points = (hostAcc.profile.points || 0) + meta.pts;
      evasionStorage.saveAccount(hostAcc);
      realtimePubSub.publish('USER_UPDATED', { userId: hostAcc.id, profile: hostAcc.profile });
    }

    const giftComment: StoredLiveComment = {
      id: `${meta.idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      authorId: account.id,
      authorName: account.profile.alias || account.profile.matricule,
      authorAvatar: account.profile.avatar,
      content: meta.label,
      type: giftType as 'ice_cone' | 'water_bottle' | 'canned_food',
      timestamp: Date.now(),
    };

    const updated: StoredLiveSession = {
      ...live,
      iceConesReceived: (live.iceConesReceived || 0) + (giftType === 'ice_cone' ? 1 : 0),
      waterBottlesReceived: (live.waterBottlesReceived || 0) + (giftType === 'water_bottle' ? 1 : 0),
      cansReceived: (live.cansReceived || 0) + (giftType === 'canned_food' ? 1 : 0),
      comments: [...live.comments.slice(-60), giftComment],
    };

    evasionStorage.updateLive(updated);
    realtimePubSub.publish('LIVE_UPDATED', { live: updated });
    realtimePubSub.publish('USER_UPDATED', { userId: account.id, profile: account.profile });
    return res.json({ success: true, live: updated, profile: account.profile });
  });

  // --- 8. Secure Server-Verified Payments (PayPal & Privilège 0 €) ---
  app.post('/api/payments/free-pass', (req, res) => {
    const account = getAuthenticatedAccount(req) || getOrProvisionAccount(req, res);
    if (!isTest2026Account(account)) {
      return res.status(403).json({
        success: false,
        error: 'Action non autorisée sur ce compte.',
      });
    }

    const spec = resolveCatalogOrderSpec(req.body || {});
    if (!spec) {
      return res.status(400).json({ success: false, error: 'Article Boutique invalide.' });
    }

    const prod = spec.product;
    const internalOrderId = `ORD_FREE_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const freeOrder: StoredPaymentOrder = {
      orderId: internalOrderId,
      provider: 'paypal',
      externalId: 'VIP_FREE_PASS',
      userId: account.id,
      itemId: prod.id,
      itemName: prod.name,
      amountCents: 0,
      currency: 'EUR',
      status: 'pending',
      targetPostId: spec.targetPostId,
      neonColor: spec.neonColor,
      cellFrame: spec.cellFrame,
      createdAt: Date.now(),
    };

    const fulfilled = fulfillPaymentOrder(freeOrder);
    const updatedAcc = fulfilled.account ? evasionStorage.saveAccount(fulfilled.account) : account;
    realtimePubSub.publish('USER_UPDATED', {
      userId: updatedAcc.id,
      profile: updatedAcc.profile,
    });
    if (fulfilled.updatedPost) {
      realtimePubSub.publish('POST_UPDATED', { post: fulfilled.updatedPost });
    }

    return res.json({
      success: true,
      orderId: internalOrderId,
      method: 'Accès Gratuit (0 €)',
      status: 'COMPLETED',
      profile: updatedAcc.profile,
      post: fulfilled.updatedPost,
    });
  });

  // --- Autonomous Web Push Notifications (100% Free Self-Hosted VAPID) ---
  app.get('/api/push/vapid-public-key', (_req, res) => {
    try {
      return res.json({
        success: true,
        publicKey: getVapidPublicKey(),
      });
    } catch {
      return res.status(500).json({ success: false, error: 'Clé Push indisponible.' });
    }
  });

  app.post('/api/push/subscribe', (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const body = (req.body || {}) as {
      subscription?: {
        endpoint?: string;
        expirationTime?: number | null;
        keys?: { p256dh?: string; auth?: string };
      };
      notifyAllCour?: boolean;
    };

    const sub = body.subscription;
    if (
      !sub ||
      typeof sub.endpoint !== 'string' ||
      !sub.endpoint.startsWith('https://') ||
      !sub.keys?.p256dh ||
      !sub.keys?.auth
    ) {
      return res.status(400).json({ success: false, error: 'Abonnement Push invalide.' });
    }

    const record: StoredPushSubscription = {
      endpoint: sub.endpoint.slice(0, 1024),
      expirationTime: sub.expirationTime ?? null,
      keys: {
        p256dh: String(sub.keys.p256dh),
        auth: String(sub.keys.auth),
      },
      userId: account.id,
      matricule: account.profile.matricule,
      notifyAllCour: body.notifyAllCour !== false,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    evasionStorage.savePushSubscription(record);
    const total = evasionStorage.getPushSubscriptionsForUser(account.id, account.profile.matricule).length;
    return res.json({ success: true, subscribedDevices: total });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    if (endpoint) {
      evasionStorage.removePushSubscription(endpoint);
    }
    return res.json({ success: true });
  });

  app.post('/api/push/test', async (req, res) => {
    const account = getOrProvisionAccount(req, res);
    const subs = evasionStorage.getPushSubscriptionsForUser(account.id, account.profile.matricule);
    const result = await sendWebPushToSubscriptions(subs, {
      title: '🔔 Notifications ÉVASION actives',
      body: 'Tu recevras désormais tes messages directement sur ton téléphone gratuitement.',
      tag: `evasion-test-${Date.now()}`,
      url: '/',
      type: 'test',
      forceShow: true,
    });
    return res.json({
      success: true,
      sent: result.sent,
      totalDevices: subs.length,
    });
  });

  app.get('/api/paypal/config', async (_req, res) => {
    const [mode, clientToken] = await Promise.all([
      resolveActivePayPalMode(),
      getPayPalClientToken(),
    ]);
    return res.json({
      success: Boolean(PAYPAL_CLIENT_ID),
      clientId: PAYPAL_CLIENT_ID || null,
      clientToken: clientToken || null,
      currency: 'EUR',
      mode,
      cardEligible: true,
      methods: ['card', 'paypal', 'paylater'],
      webhookConfigured: Boolean((process.env.PAYPAL_WEBHOOK_ID || '').trim()),
    });
  });

  app.post('/api/paypal/create-order', async (req, res) => {
    const account = getOrProvisionAccount(req, res);

    const spec = resolveCatalogOrderSpec(req.body || {});
    if (!spec) {
      return res.status(400).json({ success: false, error: 'Article Boutique invalide.' });
    }

    const prod = spec.product;
    const internalOrderId = `ORD_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const formattedAmount = prod.amountEur.toFixed(2);
    const origin = getRequestOrigin(req);

    const rawLanding = typeof req.body?.landingPage === 'string' ? req.body.landingPage.toUpperCase() : '';
    const landingPage =
      rawLanding === 'BILLING' || rawLanding === 'LOGIN' || rawLanding === 'NO_PREFERENCE'
        ? rawLanding
        : 'BILLING';

    for (const baseUrl of PAYPAL_ENDPOINTS) {
      const token = await getPayPalAccessToken(baseUrl);
      if (!token) continue;
      try {
        const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [
              {
                custom_id: internalOrderId,
                description: `ÉVASION - ${prod.name}`,
                amount: {
                  currency_code: 'EUR',
                  value: formattedAmount,
                  breakdown: {
                    item_total: {
                      currency_code: 'EUR',
                      value: formattedAmount,
                    },
                  },
                },
                items: [
                  {
                    name: prod.name.slice(0, 120),
                    description: `ÉVASION - ${prod.name}`.slice(0, 120),
                    quantity: '1',
                    category: 'DIGITAL_GOODS',
                    unit_amount: {
                      currency_code: 'EUR',
                      value: formattedAmount,
                    },
                  },
                ],
              },
            ],
            application_context: {
              brand_name: 'ÉVASION',
              locale: 'fr-FR',
              landing_page: landingPage,
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: `${origin}/?internal_order_id=${encodeURIComponent(internalOrderId)}&payment=paypal_return`,
              cancel_url: `${origin}/?payment=cancelled`,
            },
          }),
        });

        if (orderRes.ok) {
          const orderData = (await orderRes.json()) as {
            id?: string;
            links?: { rel: string; href: string }[];
          };
          if (orderData.id) {
            const approveLink = orderData.links?.find((l) => l.rel === 'approve')?.href || null;
            evasionStorage.savePaymentOrder({
              orderId: orderData.id,
              provider: 'paypal',
              externalId: internalOrderId,
              userId: account.id,
              itemId: prod.id,
              itemName: prod.name,
              amountCents: prod.amountCents,
              currency: 'EUR',
              status: 'pending',
              targetPostId: spec.targetPostId,
              neonColor: spec.neonColor,
              cellFrame: spec.cellFrame,
              createdAt: Date.now(),
            });
            const sessionToken = signSessionToken(account.id);
            return res.json({
              success: true,
              orderId: orderData.id,
              internalOrderId,
              approveUrl: approveLink,
              amount: prod.amountEur,
              currency: 'EUR',
              mode: baseUrl.includes('sandbox') ? 'sandbox' : 'live',
              token: sessionToken,
              account: toPublicAuthPayload(account),
            });
          }
        }
      } catch {
        // try next PayPal endpoint
      }
    }

    return res.status(502).json({
      success: false,
      error: 'Impossible de créer la commande auprès de PayPal. Vérifie les clés API PayPal.',
    });
  });

  app.post('/api/paypal/capture-order', async (req, res) => {
    const rawOrderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim().slice(0, 120) : '';
    const silentPoll = Boolean(req.body?.silentPoll);
    if (!rawOrderId || !/^[a-zA-Z0-9_-]+$/.test(rawOrderId)) {
      return res.status(400).json({ success: false, error: 'Identifiant de commande PayPal invalide.' });
    }

    const storedOrder =
      evasionStorage.getPaymentOrder(rawOrderId) ||
      evasionStorage.findPaymentOrderByExternalId(rawOrderId);
    if (!storedOrder || storedOrder.provider !== 'paypal') {
      return res.status(404).json({
        success: false,
        error: 'Commande PayPal introuvable.',
      });
    }

    const account = getAuthenticatedAccount(req);
    if (!account) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Session requise pour confirmer le paiement.',
      });
    }

    if (storedOrder.userId !== account.id) {
      return res.status(403).json({
        success: false,
        error: 'Cette commande PayPal appartient à un autre pseudo ou compte.',
      });
    }

    const paypalOrderId = storedOrder.orderId;

    if (storedOrder.status === 'paid') {
      const result = fulfillPaymentOrder(storedOrder);
      return res.json({
        success: true,
        orderId: paypalOrderId,
        status: 'COMPLETED',
        profile: result.account?.profile || account.profile,
        post: result.updatedPost,
      });
    }

    let latestPayPalStatus = 'UNKNOWN';
    let latestPayPalDetail = '';

    for (const baseUrl of PAYPAL_ENDPOINTS) {
      const token = await getPayPalAccessToken(baseUrl);
      if (!token) continue;
      try {
        // First inspect current order status on PayPal
        const getInitialRes = await fetch(
          `${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        let orderPayload: any = getInitialRes.ok ? await getInitialRes.json() : null;
        if (orderPayload?.status) {
          latestPayPalStatus = String(orderPayload.status);
        }

        // Attempt capture if order is APPROVED, or if not yet COMPLETED and not a silent poll on CREATED
        if (
          orderPayload?.status === 'APPROVED' ||
          (!silentPoll && orderPayload?.status !== 'COMPLETED')
        ) {
          const capRes = await fetch(
            `${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (capRes.ok) {
            orderPayload = await capRes.json();
            if (orderPayload?.status) {
              latestPayPalStatus = String(orderPayload.status);
            }
          } else {
            const capErr = (await capRes.json().catch(() => null)) as {
              details?: { issue?: string; description?: string }[];
              message?: string;
            } | null;
            const firstIssue = capErr?.details?.[0]?.issue || '';
            if (firstIssue === 'INSTRUMENT_DECLINED') {
              latestPayPalDetail = 'Carte ou moyen de paiement refusé par la banque. Essaie une autre carte ou ton solde PayPal.';
            } else if (firstIssue === 'ORDER_NOT_APPROVED') {
              latestPayPalDetail = "Le paiement n'a pas encore été validé sur la page PayPal.";
            } else if (capErr?.details?.[0]?.description) {
              latestPayPalDetail = capErr.details[0].description;
            }
            // Re-fetch in case another concurrent request/webhook just completed it
            const getAfterRes = await fetch(
              `${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (getAfterRes.ok) {
              orderPayload = await getAfterRes.json();
              if (orderPayload?.status) {
                latestPayPalStatus = String(orderPayload.status);
              }
            }
          }
        }

        const unit = orderPayload?.purchase_units?.[0];
        const firstCapture = unit?.payments?.captures?.[0];
        const isCaptureCompleted =
          orderPayload?.status === 'COMPLETED' || firstCapture?.status === 'COMPLETED';

        if (isCaptureCompleted) {
          const capturedVal = firstCapture?.amount?.value || unit?.amount?.value || '0';
          const capturedCurrency =
            firstCapture?.amount?.currency_code || unit?.amount?.currency_code;
          const capturedCents = Math.round(Number(capturedVal) * 100);

          if (capturedCurrency === 'EUR' && capturedCents === storedOrder.amountCents) {
            const fulfilled = fulfillPaymentOrder(storedOrder);
            return res.json({
              success: true,
              orderId: paypalOrderId,
              status: 'COMPLETED',
              profile: fulfilled.account?.profile || account.profile,
              post: fulfilled.updatedPost,
            });
          }
        }
      } catch {
        // try next endpoint
      }
    }

    if (silentPoll) {
      return res.json({
        success: false,
        pending: true,
        status: latestPayPalStatus,
      });
    }

    return res.status(402).json({
      success: false,
      status: latestPayPalStatus,
      error:
        latestPayPalDetail ||
        "Paiement non encore validé sur PayPal. Finalise d'abord le règlement par carte ou compte PayPal avant de débloquer.",
    });
  });

  // PayPal Server Webhook with cryptographic signature verification
  app.post('/api/webhooks/paypal', async (req, res) => {
    const webhookId = (process.env.PAYPAL_WEBHOOK_ID || '').trim();
    if (!webhookId) {
      return res.status(503).json({
        success: false,
        error: 'PAYPAL_WEBHOOK_ID non configuré.',
      });
    }

    const event = req.body as {
      id?: string;
      event_type?: string;
      resource?: {
        id?: string;
        status?: string;
        supplementary_data?: { related_ids?: { order_id?: string } };
      };
    };
    if (!event?.id) return res.status(400).json({ success: false });
    if (evasionStorage.hasProcessedWebhook(`paypal_${event.id}`)) {
      return res.json({ received: true, duplicate: true });
    }

    let verified = false;
    for (const baseUrl of PAYPAL_ENDPOINTS) {
      const token = await getPayPalAccessToken(baseUrl);
      if (!token) continue;
      try {
        const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            auth_algo: req.headers['paypal-auth-algo'],
            cert_url: req.headers['paypal-cert-url'],
            transmission_id: req.headers['paypal-transmission-id'],
            transmission_sig: req.headers['paypal-transmission-sig'],
            transmission_time: req.headers['paypal-transmission-time'],
            webhook_id: webhookId,
            webhook_event: event,
          }),
        });
        if (verifyRes.ok) {
          const verifyData = (await verifyRes.json()) as { verification_status?: string };
          if (verifyData.verification_status === 'SUCCESS') {
            verified = true;
            break;
          }
        }
      } catch {
        // try next endpoint
      }
    }

    if (!verified) {
      return res.status(401).json({ success: false, error: 'Signature webhook PayPal invalide.' });
    }

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const relatedOrderId =
        event.resource?.supplementary_data?.related_ids?.order_id || event.resource?.id;
      if (relatedOrderId) {
        const order = evasionStorage.getPaymentOrder(relatedOrderId);
        if (order) {
          fulfillPaymentOrder(order);
        }
      }
    }

    evasionStorage.markWebhookProcessed(`paypal_${event.id}`);
    return res.json({ received: true });
  });

  // --- Mount Vite or Static Dist (skip on Vercel Serverless where CDN serves static files) ---
  const swPushPath = path.resolve(__dirname, 'public', 'sw-push.js');
  app.get(['/sw-push.js', '/sw.js', '/dev-sw.js'], (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    if (fs.existsSync(swPushPath)) {
      return res.sendFile(swPushPath);
    }
    return res.status(404).end();
  });

  const publicDir = path.resolve(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  app.get(['/evasion-vercel-deploy.zip', '/download-deploy-zip'], (_req, res) => {
    const deployZipPath = path.resolve(publicDir, 'evasion-vercel-deploy.zip');
    if (fs.existsSync(deployZipPath)) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="evasion-vercel-deploy.zip"');
      return res.sendFile(deployZipPath);
    }
    return res.status(404).send('Archive introuvable');
  });

  if (!process.env.VERCEL) {
    const distPath = path.resolve(__dirname, 'dist');
    const isProductionMode =
      process.env.NODE_ENV === 'production' ||
      process.env.npm_lifecycle_event === 'start';

    if (isProductionMode && fs.existsSync(path.join(distPath, 'index.html'))) {
      app.use(
        express.static(distPath, {
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html') || filePath.endsWith('.webmanifest')) {
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            }
          },
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll(\`link[rel="stylesheet"][data-vite-dev-id="\${CSS.escape(id)}"]\`).forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return \`\${pathname}?\${queryToInject}\${search ? "&" + search.slice(1) : ""}\${hash || ""}\`;
}
const BaseElement = globalThis.HTMLElement || class {};
export class ErrorOverlay extends BaseElement {}
        `);
      });

      const viteModuleName = 'vite';
      const { createServer: createViteServer } = await import(/* @vite-ignore */ viteModuleName);
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
          watch: null,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }

    // --- Attach WebSocket Server (/ws) cleanly to HTTP server ---
    const httpServer = http.createServer(app);
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (reqUrl.pathname !== '/ws') {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req, reqUrl);
        });
      } catch {
        socket.destroy();
      }
    });

    wss.on('connection', (rawWs: WebSocket, req: http.IncomingMessage, reqUrl: URL) => {
      const ws = rawWs as AuthedWebSocket;
      const tokenFromQuery = reqUrl.searchParams.get('token');
      const token = tokenFromQuery || extractSessionToken(req);
      ws.clientUserId = verifySessionToken(token) || undefined;
      ws.connectedAt = Date.now();

      wsClients.add(ws);

      void evasionStorage.syncPostsFromPostgres().then((syncedPosts) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(
              JSON.stringify({
                type: 'SYNC_STATE',
                payload: {
                  posts: syncedPosts,
                  chatMessages: evasionStorage.getChatMessages(),
                  salons: evasionStorage.getSalons(),
                  lives: evasionStorage.getLives(),
                  onlineUsers: getOnlineUsersRoster(),
                  onlineInmatesCount: getPresenceCount(),
                  platformKeyStats: computePlatformKeyStats(),
                },
              })
            );
          } catch {
            // ignore send failure on immediate disconnect
          }
        }
      });

      realtimePubSub.publish('PRESENCE_COUNT', {
        onlineInmatesCount: getPresenceCount(),
      });
      broadcastOnlineUsers();

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(String(data)) as {
            type?: string;
            token?: string;
            userId?: string;
            fromUserId?: string;
            liveId?: string;
            role?: 'host' | 'guest' | 'viewer';
            targetUserId?: string;
            signalType?: string;
            data?: unknown;
          };
          const fallbackMsgUserId =
            typeof msg.userId === 'string' && msg.userId.trim()
              ? msg.userId.trim()
              : typeof msg.fromUserId === 'string' && msg.fromUserId.trim()
              ? msg.fromUserId.trim()
              : undefined;
          if (!ws.clientUserId && fallbackMsgUserId) {
            ws.clientUserId = fallbackMsgUserId;
          }
          const verifiedUserId = ws.clientUserId || fallbackMsgUserId;

          if (msg.type === 'AUTH') {
            const fromToken = typeof msg.token === 'string' ? verifySessionToken(msg.token) : null;
            ws.clientUserId = fromToken || fallbackMsgUserId || ws.clientUserId;
            ws.presenceHidden = false;
            if (ws.clientUserId) {
              const nowTs = Date.now();
              for (const l of evasionStorage.getLives()) {
                if (l.hostId === ws.clientUserId) {
                  liveHostHeartbeats.set(l.id, nowTs);
                }
              }
            }
            broadcastOnlineUsers();
          } else if (msg.type === 'SET_PRESENCE_OFFLINE') {
            ws.presenceHidden = true;
            broadcastOnlineUsers();
          } else if (msg.type === 'SET_PRESENCE_ONLINE') {
            ws.presenceHidden = false;
            broadcastOnlineUsers();
          } else if (msg.type === 'PING') {
            if (ws.clientUserId) {
              const nowTs = Date.now();
              for (const l of evasionStorage.getLives()) {
                if (l.hostId === ws.clientUserId) {
                  liveHostHeartbeats.set(l.id, nowTs);
                }
              }
            }
            ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
          } else if (msg.type === 'LIVE_HEARTBEAT' && typeof msg.liveId === 'string') {
            liveHostHeartbeats.set(msg.liveId, Date.now());
          } else if (msg.type === 'LIVE_ROOM_JOIN' && typeof msg.liveId === 'string' && verifiedUserId) {
            const roomId = msg.liveId;
            const targetLive = evasionStorage.getLiveById(roomId);
            if (targetLive && (targetLive.hostId === verifiedUserId || msg.role === 'host')) {
              liveHostHeartbeats.set(roomId, Date.now());
            }
            const acc = evasionStorage.getAccountById(verifiedUserId);
            const blockedIds = targetLive?.blockedUserIds || [];
            if (
              targetLive &&
              (blockedIds.includes(verifiedUserId) ||
                (acc?.profile?.matricule && blockedIds.includes(acc.profile.matricule)))
            ) {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(
                    JSON.stringify({
                      type: 'LIVE_USER_BLOCKED',
                      payload: {
                        liveId: roomId,
                        targetUserId: verifiedUserId,
                        targetMatricule: acc?.profile?.matricule,
                      },
                    })
                  );
                } catch {
                  // ignore
                }
              }
              return;
            }
            const prevRoomId = ws.activeLiveRoomId;
            const prevSubs = ws.relaySubscriptions ? Array.from(ws.relaySubscriptions) : [];
            if (prevRoomId && prevRoomId !== roomId) {
              ws.relaySubscriptions = new Set<string>();
              prevSubs.forEach((bId) => notifyRelaySubscribersCount(prevRoomId, bId));
            } else if (!ws.relaySubscriptions) {
              ws.relaySubscriptions = new Set<string>();
            }
            ws.activeLiveRoomId = roomId;
            const requestedRole = msg.role || 'viewer';
            const isVerifiedHost = Boolean(
              (targetLive &&
                (targetLive.hostId === verifiedUserId ||
                  (acc?.profile?.matricule && targetLive.hostMatricule === acc.profile.matricule))) ||
                (!targetLive && requestedRole === 'host')
            );
            const isVerifiedCoHost = Boolean(
              targetLive?.guests?.some((g) => g.userId === verifiedUserId)
            );
            ws.liveRole =
              requestedRole === 'host' && isVerifiedHost
                ? 'host'
                : requestedRole === 'guest' && (isVerifiedHost || isVerifiedCoHost)
                ? 'guest'
                : 'viewer';
            if (ws.liveRole === 'host' || ws.liveRole === 'guest') {
              notifyRelaySubscribersCount(roomId, verifiedUserId);
            }

            // Ensure viewer is visible in live.activeViewers even if they entered directly
            if (targetLive && targetLive.hostId !== verifiedUserId && acc) {
              const prevViewers = targetLive.activeViewers || [];
              if (!prevViewers.some((v) => v.userId === acc.id)) {
                const nextViewers = [
                  ...prevViewers,
                  {
                    userId: acc.id,
                    matricule: acc.profile.matricule,
                    alias: acc.profile.alias || acc.profile.matricule,
                    avatar: acc.profile.avatar,
                    neonColor: acc.profile.neonColor,
                    joinedAt: Date.now(),
                  },
                ].slice(-120);
                const updatedLive = {
                  ...targetLive,
                  activeViewers: nextViewers,
                  viewersCount: nextViewers.length,
                };
                evasionStorage.updateLive(updatedLive);
                realtimePubSub.publish('LIVE_UPDATED', { live: updatedLive });
              }
            }

            // Tell this joiner about all peers already in the room, and tell them about this joiner
            const existingPeers: { userId: string; role: string }[] = [];
            const joinFrame = JSON.stringify({
              type: 'LIVE_RTC_PEER_JOINED',
              payload: { liveId: roomId, userId: verifiedUserId, role: ws.liveRole },
            });
            for (const peer of wsClients) {
              if (peer === ws || peer.readyState !== WebSocket.OPEN || peer.activeLiveRoomId !== roomId) continue;
              if (peer.clientUserId && peer.clientUserId !== verifiedUserId) {
                existingPeers.push({ userId: peer.clientUserId, role: peer.liveRole || 'viewer' });
                try {
                  peer.send(joinFrame);
                } catch {
                  // ignore
                }
              }
            }
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'LIVE_RTC_ROOM_PEERS',
                  payload: { liveId: roomId, peers: existingPeers },
                })
              );
            }
          } else if (msg.type === 'LIVE_ROOM_LEAVE') {
            if (msg.liveId && ws.activeLiveRoomId && ws.activeLiveRoomId !== msg.liveId) {
              return;
            }
            const prevRoom = ws.activeLiveRoomId || msg.liveId;
            const leftUserId = verifiedUserId;
            const prevSubs = ws.relaySubscriptions ? Array.from(ws.relaySubscriptions) : [];
            ws.activeLiveRoomId = undefined;
            ws.liveRole = undefined;
            ws.relaySubscriptions = undefined;
            if (prevRoom && prevSubs.length > 0) {
              prevSubs.forEach((bId) => notifyRelaySubscribersCount(prevRoom, bId));
            }
            if (prevRoom && leftUserId) {
              const targetLive = evasionStorage.getLiveById(prevRoom);
              if (targetLive && targetLive.hostId !== leftUserId) {
                const prevViewers = targetLive.activeViewers || [];
                const nextViewers = prevViewers.filter((v) => v.userId !== leftUserId);
                if (nextViewers.length < prevViewers.length) {
                  const updatedLive = {
                    ...targetLive,
                    activeViewers: nextViewers,
                    viewersCount: nextViewers.length,
                  };
                  evasionStorage.updateLive(updatedLive);
                  realtimePubSub.publish('LIVE_UPDATED', { live: updatedLive });
                }
              }
              const leaveFrame = JSON.stringify({
                type: 'LIVE_RTC_PEER_LEFT',
                payload: { liveId: prevRoom, userId: leftUserId },
              });
              for (const peer of wsClients) {
                if (peer !== ws && peer.readyState === WebSocket.OPEN && peer.activeLiveRoomId === prevRoom) {
                  try {
                    peer.send(leaveFrame);
                  } catch {
                    // ignore
                  }
                }
              }
            }
          } else if (
            msg.type === 'LIVE_REACTION' &&
            typeof msg.liveId === 'string' &&
            verifiedUserId
          ) {
            const targetLive = evasionStorage.getLiveById(msg.liveId);
            if (!targetLive || !targetLive.isActive) return;
            const rawEmoji = typeof (msg as { emoji?: unknown }).emoji === 'string' ? String((msg as { emoji?: string }).emoji).trim() : '❤️';
            const allowedEmojis = ['❤️', '🔥', '👏', '😂', '😮', '💯', '🎉', '🔑'];
            const emoji = allowedEmojis.includes(rawEmoji) ? rawEmoji : '❤️';
            const reactionFrame = JSON.stringify({
              type: 'LIVE_REACTION',
              payload: {
                liveId: msg.liveId,
                emoji,
                userId: verifiedUserId,
              },
            });
            for (const peer of wsClients) {
              if (
                peer !== ws &&
                peer.readyState === WebSocket.OPEN &&
                peer.activeLiveRoomId === msg.liveId
              ) {
                try {
                  peer.send(reactionFrame);
                } catch {
                  // ignore
                }
              }
            }
          } else if (
            msg.type === 'LIVE_RTC_SIGNAL' &&
            typeof msg.liveId === 'string' &&
            typeof msg.targetUserId === 'string' &&
            verifiedUserId
          ) {
            const targetLive = evasionStorage.getLiveById(msg.liveId);
            const relayFrame = JSON.stringify({
              type: 'LIVE_RTC_SIGNAL',
              payload: {
                liveId: msg.liveId,
                fromUserId: verifiedUserId,
                fromRole: ws.liveRole || 'viewer',
                signalType: msg.signalType,
                data: msg.data,
              },
            });
            for (const peer of wsClients) {
              const isRoomBroadcast = msg.targetUserId === '*';
              const matchesDirectTarget = peer.clientUserId === msg.targetUserId;
              const matchesHostAlias = Boolean(
                targetLive &&
                  (msg.targetUserId === targetLive.hostId ||
                    msg.targetUserId === targetLive.hostMatricule) &&
                  (peer.liveRole === 'host' || peer.clientUserId === targetLive.hostId)
              );
              if (
                peer !== ws &&
                peer.readyState === WebSocket.OPEN &&
                peer.activeLiveRoomId === msg.liveId &&
                (isRoomBroadcast || matchesDirectTarget || matchesHostAlias)
              ) {
                try {
                  peer.send(relayFrame);
                } catch {
                  // ignore
                }
              }
            }
          } else if (
            msg.type === 'LIVE_RELAY_SUBSCRIBE' &&
            typeof msg.liveId === 'string' &&
            typeof msg.targetUserId === 'string' &&
            verifiedUserId
          ) {
            ws.activeLiveRoomId = msg.liveId;
            if (!ws.relaySubscriptions) ws.relaySubscriptions = new Set<string>();
            ws.relaySubscriptions.add(msg.targetUserId);
            const targetLive = evasionStorage.getLiveById(msg.liveId);
            const resolvedBroadcasterId =
              targetLive &&
              (msg.targetUserId === targetLive.hostId || msg.targetUserId === targetLive.hostMatricule)
                ? targetLive.hostId
                : msg.targetUserId;
            if (resolvedBroadcasterId) {
              ws.relaySubscriptions.add(resolvedBroadcasterId);
              notifyRelaySubscribersCount(msg.liveId, resolvedBroadcasterId);
            }
          } else if (
            msg.type === 'LIVE_RELAY_UNSUBSCRIBE' &&
            typeof msg.liveId === 'string' &&
            typeof msg.targetUserId === 'string'
          ) {
            if (ws.relaySubscriptions) {
              ws.relaySubscriptions.delete(msg.targetUserId);
              const targetLive = evasionStorage.getLiveById(msg.liveId);
              const resolvedBroadcasterId =
                targetLive &&
                (msg.targetUserId === targetLive.hostId || msg.targetUserId === targetLive.hostMatricule)
                  ? targetLive.hostId
                  : msg.targetUserId;
              if (resolvedBroadcasterId) {
                ws.relaySubscriptions.delete(resolvedBroadcasterId);
                notifyRelaySubscribersCount(msg.liveId, resolvedBroadcasterId);
              }
            }
          } else if (
            msg.type === 'LIVE_RELAY_MEDIA' &&
            typeof msg.liveId === 'string' &&
            verifiedUserId
          ) {
            const mediaMsg = msg as {
              liveId: string;
              mediaKind?: 'video' | 'audio';
              data?: string;
              w?: number;
              h?: number;
              sampleRate?: number;
              ts?: number;
            };
            if (!mediaMsg.data || typeof mediaMsg.data !== 'string' || mediaMsg.data.length > 260_000) {
              return;
            }
            const targetLive = evasionStorage.getLiveById(mediaMsg.liveId);
            const isHostSender = Boolean(
              ws.liveRole === 'host' || (targetLive && targetLive.hostId === verifiedUserId)
            );
            const isGuestSender = Boolean(
              ws.liveRole === 'guest' || targetLive?.guests?.some((g) => g.userId === verifiedUserId)
            );
            if (!isHostSender && !isGuestSender) return;

            const mediaFrame = JSON.stringify({
              type: 'LIVE_RELAY_MEDIA',
              payload: {
                liveId: mediaMsg.liveId,
                fromUserId: verifiedUserId,
                fromHostId: isHostSender ? targetLive?.hostId || verifiedUserId : verifiedUserId,
                mediaKind: mediaMsg.mediaKind === 'audio' ? 'audio' : 'video',
                data: mediaMsg.data,
                w: mediaMsg.w,
                h: mediaMsg.h,
                sampleRate: mediaMsg.sampleRate,
                ts: mediaMsg.ts || Date.now(),
              },
            });
            for (const peer of wsClients) {
              if (
                peer === ws ||
                peer.readyState !== WebSocket.OPEN ||
                peer.activeLiveRoomId !== mediaMsg.liveId
              ) {
                continue;
              }
              if (!peer.relaySubscriptions || peer.relaySubscriptions.size === 0) continue;
              const wantsThisSender =
                peer.relaySubscriptions.has(verifiedUserId) ||
                (isHostSender &&
                  targetLive &&
                  (peer.relaySubscriptions.has(targetLive.hostId) ||
                    peer.relaySubscriptions.has(targetLive.hostMatricule)));
              if (!wantsThisSender) continue;
              // Drop video frames gently if viewer WebSocket buffer is congested, never drop audio
              if (mediaMsg.mediaKind !== 'audio' && peer.bufferedAmount > 600 * 1024) {
                continue;
              }
              try {
                peer.send(mediaFrame);
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore malformed client frame
        }
      });

      ws.on('close', () => {
        const prevRoom = ws.activeLiveRoomId;
        const leftUserId = ws.clientUserId;
        const prevSubs = ws.relaySubscriptions ? Array.from(ws.relaySubscriptions) : [];
        ws.relaySubscriptions = undefined;
        wsClients.delete(ws);
        if (prevRoom && prevSubs.length > 0) {
          prevSubs.forEach((bId) => notifyRelaySubscribersCount(prevRoom, bId));
        }
        if (prevRoom && leftUserId) {
          // Grace period of 12s before broadcasting PEER_LEFT to protect against 4G/Wi-Fi switch & proxy resets
          setTimeout(() => {
            let reconnected = false;
            for (const peer of wsClients) {
              if (
                peer.readyState === WebSocket.OPEN &&
                peer.clientUserId === leftUserId &&
                peer.activeLiveRoomId === prevRoom
              ) {
                reconnected = true;
                break;
              }
            }
            if (!reconnected) {
              const targetLive = evasionStorage.getLiveById(prevRoom);
              if (targetLive && targetLive.hostId !== leftUserId) {
                const prevViewers = targetLive.activeViewers || [];
                const nextViewers = prevViewers.filter((v) => v.userId !== leftUserId);
                if (nextViewers.length < prevViewers.length) {
                  const updatedLive = {
                    ...targetLive,
                    activeViewers: nextViewers,
                    viewersCount: nextViewers.length,
                  };
                  evasionStorage.updateLive(updatedLive);
                  realtimePubSub.publish('LIVE_UPDATED', { live: updatedLive });
                }
              }
              const leaveFrame = JSON.stringify({
                type: 'LIVE_RTC_PEER_LEFT',
                payload: { liveId: prevRoom, userId: leftUserId },
              });
              for (const peer of wsClients) {
                if (peer.readyState === WebSocket.OPEN && peer.activeLiveRoomId === prevRoom) {
                  try {
                    peer.send(leaveFrame);
                  } catch {
                    // ignore
                  }
                }
              }
            }
          }, 12000);
        }
        if (leftUserId) {
          // Clean up genuinely departed host Lives after 45s of zero WS AND zero HTTP heartbeats (client sends heartbeat every 8s while active)
          setTimeout(() => {
            let hostStillConnected = false;
            for (const peer of wsClients) {
              if (peer.readyState === WebSocket.OPEN && peer.clientUserId === leftUserId) {
                hostStillConnected = true;
                break;
              }
            }
            if (!hostStillConnected) {
              let endedAny = false;
              const nowTs = Date.now();
              for (const l of evasionStorage.getLives()) {
                if (l.hostId === leftUserId) {
                  const lastHb = liveHostHeartbeats.get(l.id) || l.startedAt;
                  if (nowTs - lastHb < 45 * 1000) {
                    continue;
                  }
                  liveHostHeartbeats.delete(l.id);
                  evasionStorage.endLive(l.id);
                  realtimePubSub.publish('LIVE_ENDED', { liveId: l.id });
                  endedAny = true;
                }
              }
              if (endedAny) {
                broadcastOnlineUsers();
              }
            }
          }, 45 * 1000);
        }
        realtimePubSub.publish('PRESENCE_COUNT', {
          onlineInmatesCount: getPresenceCount(),
        });
        broadcastOnlineUsers();
      });

      ws.on('error', () => {
        wsClients.delete(ws);
      });
    });

    // Periodic sweep (every 15s) to clear abandoned ghost Lives that stopped all WS & HTTP heartbeats for > 60s
    const bootTime = Date.now();
    setInterval(() => {
      let cleanedAny = false;
      const nowTs = Date.now();
      for (const l of evasionStorage.getLives()) {
        if (!l.isActive) continue;
        const lastHb = liveHostHeartbeats.get(l.id) || l.startedAt || 0;
        const staleLimit = l.startedAt < bootTime && lastHb <= bootTime ? 45 * 1000 : 60 * 1000;
        if (nowTs - lastHb < staleLimit) continue;
        let hostOnline = false;
        for (const peer of wsClients) {
          if (peer.readyState === WebSocket.OPEN && peer.clientUserId === l.hostId) {
            hostOnline = true;
            break;
          }
        }
        if (!hostOnline) {
          liveHostHeartbeats.delete(l.id);
          evasionStorage.endLive(l.id);
          realtimePubSub.publish('LIVE_ENDED', { liveId: l.id });
          cleanedAny = true;
        }
      }
      if (cleanedAny) {
        broadcastOnlineUsers();
      }
    }, 15 * 1000);

    let activePort = PORT;
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && activePort !== 3000) {
        activePort = 3000;
        httpServer.listen(3000, '0.0.0.0');
      } else {
        console.error('[Server] Listen error:', err);
      }
    });

    httpServer.listen(activePort, '0.0.0.0', () => {
      console.log(
        `🚀 ÉVASION Server running on http://0.0.0.0:${activePort} [DB:${evasionStorage.getMode()} | PubSub:${realtimePubSub.getMode()} | Media:${getMediaStorageMode()}]`
      );
    });
  }

  return app;
}

let cachedAppPromise: Promise<express.Express> | null = null;

export async function handleVercelRequest(req: Request, res: Response) {
  if (!cachedAppPromise) {
    cachedAppPromise = startServer();
  }
  const app = await cachedAppPromise;
  return app(req, res);
}

export default handleVercelRequest;

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception caught safely:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection caught safely:', reason);
});

if (!process.env.VERCEL && process.env.EVASION_SKIP_LISTEN !== '1') {
  cachedAppPromise = startServer();
}
