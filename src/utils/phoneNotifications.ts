export interface PhoneNotificationPrefs {
  enabled: boolean;
  notifyDirectMessages: boolean;
  notifyCourtChat: boolean;
  notifyPostReplies: boolean;
}

const PREFS_STORAGE_KEY = 'evasion_phone_notif_prefs';

const DEFAULT_PREFS: PhoneNotificationPrefs = {
  enabled: false,
  notifyDirectMessages: true,
  notifyCourtChat: true,
  notifyPostReplies: true,
};

let swInitialized = false;
let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
const notifiedIds = new Set<string>();

export function getPhoneNotificationPrefs(): PhoneNotificationPrefs {
  const isNativeGranted =
    typeof window !== 'undefined' &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted';
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return {
        enabled: isNativeGranted,
        notifyDirectMessages: true,
        notifyCourtChat: true,
        notifyPostReplies: true,
      };
    }
    const parsed = JSON.parse(raw) as Partial<PhoneNotificationPrefs>;
    const enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : isNativeGranted;
    return {
      enabled,
      notifyDirectMessages: enabled ? true : parsed.notifyDirectMessages !== false,
      notifyCourtChat: enabled ? true : parsed.notifyCourtChat !== false,
      notifyPostReplies: enabled ? true : parsed.notifyPostReplies !== false,
    };
  } catch {
    return {
      enabled: isNativeGranted,
      notifyDirectMessages: true,
      notifyCourtChat: true,
      notifyPostReplies: true,
    };
  }
}

export function savePhoneNotificationPrefs(next: PhoneNotificationPrefs): PhoneNotificationPrefs {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

async function purgeLegacyWorkboxCachesAndWorkers(inEmbeddedIframe: boolean): Promise<void> {
  try {
    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          // Ne jamais supprimer nos caches hors-ligne actifs evasion-v5-* hors iframe
          if (!inEmbeddedIframe && k.startsWith('evasion-v5-')) {
            return Promise.resolve(false);
          }
          return caches.delete(k).catch(() => false);
        })
      );
    }
  } catch {
    // ignore cache cleanup errors
  }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const scriptUrl =
          reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        const isLegacyWorkbox =
          scriptUrl.includes('/sw.js') ||
          scriptUrl.includes('dev-sw') ||
          scriptUrl.includes('workbox');
        if (inEmbeddedIframe || isLegacyWorkbox) {
          await reg.unregister().catch(() => {});
        }
      }
    }
  } catch {
    // ignore unregister errors
  }
}

export async function requestPersistentDeviceStorage(): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      const alreadyPersisted =
        typeof navigator.storage.persisted === 'function'
          ? await navigator.storage.persisted().catch(() => false)
          : false;
      if (alreadyPersisted) return true;
      return await navigator.storage.persist().catch(() => false);
    }
  } catch {
    // ignore
  }
  return false;
}

export function initPWAAndServiceWorker(): void {
  if (swInitialized || typeof window === 'undefined') return;
  swInitialized = true;
  void requestPersistentDeviceStorage();
  if (!('serviceWorker' in navigator)) return;

  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }

  const standalone = isStandalonePWA();

  // In embedded preview iframe (not standalone PWA), unregister all service workers and clear stale caches
  if (inIframe && !standalone) {
    void purgeLegacyWorkboxCachesAndWorkers(true);
    return;
  }

  // In standalone PWA or direct browser tab, keep evasion-v5-* offline caches and register /sw-push.js
  swRegistrationPromise = (async () => {
    await purgeLegacyWorkboxCachesAndWorkers(false);
    try {
      const existing = await navigator.serviceWorker.getRegistration('/');
      const existingUrl =
        existing?.active?.scriptURL ||
        existing?.waiting?.scriptURL ||
        existing?.installing?.scriptURL ||
        '';
      if (existing && existingUrl.includes('/sw-push.js')) {
        void existing.update().catch(() => {});
        return existing;
      }
      return await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
    } catch {
      return null;
    }
  })();
}

export async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  initPWAAndServiceWorker();

  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  if (inIframe && !isStandalonePWA()) {
    return null;
  }

  if (swRegistrationPromise) {
    const reg = await swRegistrationPromise.catch(() => null);
    if (reg) return reg;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;

    const reg = await navigator.serviceWorker
      .register('/sw-push.js', { scope: '/' })
      .catch(() => null);
    if (reg) {
      swRegistrationPromise = Promise.resolve(reg);
      return reg;
    }

    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), 2500)
    );
    return await Promise.race([readyPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface SyncPushResult {
  permission: NotificationPermission | 'unsupported';
  pushSubscribed: boolean;
  mode: 'web-push' | 'local-sw' | 'blocked' | 'unsupported';
  error?: string;
}

export async function syncPushSubscriptionWithServer(
  authToken: string | null,
  notifyAllCour = true
): Promise<SyncPushResult> {
  const permission = getNotificationPermission();
  if (permission === 'unsupported') {
    return { permission, pushSubscribed: false, mode: 'unsupported' };
  }
  if (permission === 'denied') {
    return { permission, pushSubscribed: false, mode: 'blocked' };
  }
  if (permission !== 'granted') {
    return { permission, pushSubscribed: false, mode: 'local-sw' };
  }

  const reg = await getActiveServiceWorkerRegistration();
  if (!reg || !('pushManager' in reg)) {
    return { permission, pushSubscribed: false, mode: 'local-sw' };
  }

  try {
    const keyRes = await fetch('/api/push/vapid-public-key');
    const keyData = (await keyRes.json().catch(() => null)) as { publicKey?: string } | null;
    if (!keyRes.ok || !keyData?.publicKey) {
      return { permission, pushSubscribed: false, mode: 'local-sw' };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        subscription: sub.toJSON(),
        notifyAllCour,
      }),
    });

    return { permission, pushSubscribed: true, mode: 'web-push' };
  } catch (err) {
    return {
      permission,
      pushSubscribed: false,
      mode: 'local-sw',
      error: err instanceof Error ? err.message : undefined,
    };
  }
}

export async function enablePhoneNotifications(
  authToken: string | null,
  notifyAllCour = true
): Promise<SyncPushResult> {
  const perm = getNotificationPermission();

  const allActivePrefs: PhoneNotificationPrefs = {
    enabled: true,
    notifyDirectMessages: true,
    notifyCourtChat: notifyAllCour,
    notifyPostReplies: true,
  };

  if (perm === 'unsupported') {
    savePhoneNotificationPrefs(allActivePrefs);
    return { permission: 'unsupported', pushSubscribed: false, mode: 'local-sw' };
  }

  let finalPerm: NotificationPermission = perm;
  if (perm !== 'granted') {
    try {
      finalPerm = await Notification.requestPermission();
    } catch {
      finalPerm = Notification.permission;
    }
  }

  if (finalPerm === 'denied') {
    savePhoneNotificationPrefs(allActivePrefs);
    return {
      permission: finalPerm,
      pushSubscribed: false,
      mode: 'blocked',
    };
  }

  savePhoneNotificationPrefs(allActivePrefs);

  if (finalPerm !== 'granted') {
    return { permission: finalPerm, pushSubscribed: false, mode: 'local-sw' };
  }

  return syncPushSubscriptionWithServer(authToken, notifyAllCour);
}

export async function disablePhoneNotifications(authToken: string | null): Promise<void> {
  const prefs = getPhoneNotificationPrefs();
  savePhoneNotificationPrefs({ ...prefs, enabled: false });

  const reg = await getActiveServiceWorkerRegistration();
  if (!reg || !('pushManager' in reg)) return;

  try {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
  } catch {
    // ignore cleanup error
  }
}

export interface LocalPhoneNotificationOptions {
  id: string;
  title: string;
  body: string;
  url?: string;
  type?: 'dm' | 'cour' | 'comment' | 'test';
  data?: Record<string, unknown>;
  force?: boolean;
}

export async function dispatchPhoneNotification(
  opts: LocalPhoneNotificationOptions
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;

  const prefs = getPhoneNotificationPrefs();
  if (!prefs.enabled && !opts.force) return false;

  if (!opts.force && notifiedIds.has(opts.id)) return false;
  notifiedIds.add(opts.id);
  if (notifiedIds.size > 500) {
    const first = notifiedIds.values().next().value;
    if (first) notifiedIds.delete(first);
  }

  const tag = `evasion-msg-${opts.id}`;
  const notifData = {
    ...(opts.data || {}),
    url: opts.url || '/',
    type: opts.type || 'cour',
  };
  const notifOptions: NotificationOptions & {
    renotify?: boolean;
    vibrate?: number[];
    actions?: Array<{ action: string; title: string }>;
  } = {
    body: opts.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag,
    renotify: true,
    requireInteraction: opts.type === 'dm' || opts.type === 'comment',
    vibrate: [140, 70, 140],
    actions: [{ action: 'reply', title: 'Voir & Répondre' }],
    data: notifData,
  };

  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([110, 50, 110]);
    }
  } catch {
    // ignore vibrate rejection on restricted browsers
  }

  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg && typeof reg.showNotification === 'function') {
      try {
        await reg.showNotification(opts.title, notifOptions);
      } catch {
        const basicOpts = { ...notifOptions };
        delete basicOpts.actions;
        delete basicOpts.requireInteraction;
        await reg.showNotification(opts.title, basicOpts);
      }
      return true;
    }
  } catch {
    // fall through to window.Notification
  }

  try {
    const fallbackOpts = { ...notifOptions };
    delete fallbackOpts.actions;
    const n = new Notification(opts.title, fallbackOpts);
    n.onclick = () => {
      try {
        window.focus();
        window.dispatchEvent(new CustomEvent('evasion-notif-click', { detail: notifData }));
      } catch {
        // ignore
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
