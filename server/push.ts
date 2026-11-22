import {
  generateVAPIDKeys,
  sendNotification,
  setVapidDetails,
} from 'web-push';
import {
  evasionStorage,
  getOrCreateVapidKeys,
  type StoredPushSubscription,
} from './storage.ts';

export interface PushNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  type?: 'dm' | 'cour' | 'comment' | 'test';
  forceShow?: boolean;
  timestamp?: number;
  data?: Record<string, unknown>;
}

let vapidConfigured = false;
let cachedPublicKey = '';

function ensureVapidReady(): string {
  if (vapidConfigured && cachedPublicKey) return cachedPublicKey;
  const keys = getOrCreateVapidKeys(() => generateVAPIDKeys());
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:contact@evasion-app.local';
  setVapidDetails(subject, keys.publicKey, keys.privateKey);
  cachedPublicKey = keys.publicKey;
  vapidConfigured = true;
  return cachedPublicKey;
}

export function getVapidPublicKey(): string {
  return ensureVapidReady();
}

export function formatMessagePreview(opts: {
  content?: string;
  hasImage?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
}): string {
  const clean = (opts.content || '').trim();
  if (clean) return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
  if (opts.hasAudio) return '🎤 Message vocal reçu';
  if (opts.hasVideo) return '🎬 Vidéo reçue';
  if (opts.hasImage) return '📷 Photo reçue';
  return 'Nouveau message reçu.';
}

export async function sendWebPushToSubscriptions(
  subs: StoredPushSubscription[],
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };
  ensureVapidReady();

  const jsonPayload = JSON.stringify({
    ...payload,
    timestamp: payload.timestamp || Date.now(),
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            expirationTime: sub.expirationTime ?? null,
            keys: sub.keys,
          },
          jsonPayload,
          { TTL: 86400 }
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: unknown }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          evasionStorage.removePushSubscription(sub.endpoint);
        }
      }
    })
  );

  return { sent, failed };
}

export async function notifyUserByWebPush(
  targetUserId: string | undefined,
  targetMatricule: string | undefined,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  const subs = evasionStorage.getPushSubscriptionsForUser(targetUserId, targetMatricule);
  return sendWebPushToSubscriptions(subs, payload);
}

export async function notifyCourWebPush(
  excludeUserId: string,
  excludeMatricule: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  const allSubs = evasionStorage.getAllPushSubscriptions();
  const targets = allSubs
    .filter(
      (s) =>
        s.userId !== excludeUserId &&
        s.matricule.toLowerCase() !== excludeMatricule.toLowerCase() &&
        s.notifyAllCour !== false
    )
    .slice(0, 60);
  return sendWebPushToSubscriptions(targets, payload);
}
