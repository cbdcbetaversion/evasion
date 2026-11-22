// Persistent Offline Mutation Queue + Connectivity Preference Manager

export type OfflineActionType =
  | 'COMPLETE_DAILY_MISSION'
  | 'COMPLETE_DETOX'
  | 'CLAIM_KEYS'
  | 'CLAIM_PADLOCKS'
  | 'PROTECT_STREAK'
  | 'LOCK_TEMPTATION'
  | 'CREATE_POST'
  | 'GIVE_KEY'
  | 'REVOKE_KEY'
  | 'SEAL_PADLOCK'
  | 'SEND_CHAT'
  | 'UPDATE_PROFILE';

export interface QueuedOfflineAction {
  id: string;
  type: OfflineActionType;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  createdAt: number;
  userId?: string;
  attempts: number;
}

const OFFLINE_QUEUE_KEY = 'evasion_offline_queue_v1';
const MANUAL_OFFLINE_KEY = 'evasion_manual_offline_mode_v1';
const OFFLINE_IDB_NAME = 'evasion_offline_sync_db';
const OFFLINE_IDB_STORE = 'queue';
const MAX_QUEUE_LENGTH = 80;

function openOfflineQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(OFFLINE_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_IDB_STORE)) {
        db.createObjectStore(OFFLINE_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB error'));
  });
}

function writeQueueToStorage(items: QueuedOfflineAction[]): void {
  const capped = items.slice(-MAX_QUEUE_LENGTH);
  try {
    window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(capped));
  } catch {
    // ignore storage quota
  }
  void openOfflineQueueDB()
    .then(
      (db) =>
        new Promise<void>((resolve) => {
          const tx = db.transaction(OFFLINE_IDB_STORE, 'readwrite');
          tx.objectStore(OFFLINE_IDB_STORE).put(capped, 'pending');
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        })
    )
    .catch(() => {});
}

export function loadOfflineQueue(): QueuedOfflineAction[] {
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedOfflineAction =>
        Boolean(item && typeof item.id === 'string' && typeof item.endpoint === 'string')
    );
  } catch {
    return [];
  }
}

export async function loadOfflineQueueFromIdb(): Promise<QueuedOfflineAction[]> {
  const ls = loadOfflineQueue();
  if (ls.length > 0) return ls;
  try {
    const db = await openOfflineQueueDB();
    const record = await new Promise<QueuedOfflineAction[] | undefined>((resolve) => {
      const tx = db.transaction(OFFLINE_IDB_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_IDB_STORE).get('pending');
      req.onsuccess = () => resolve(req.result as QueuedOfflineAction[] | undefined);
      req.onerror = () => resolve(undefined);
    });
    if (Array.isArray(record) && record.length > 0) {
      writeQueueToStorage(record);
      return record;
    }
  } catch {
    // ignore
  }
  return ls;
}

export function enqueueOfflineAction(
  action: Omit<QueuedOfflineAction, 'id' | 'createdAt' | 'attempts'>
): QueuedOfflineAction[] {
  const current = loadOfflineQueue();
  const nextEntry: QueuedOfflineAction = {
    ...action,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    attempts: 0,
  };

  // Deduplicate idempotent / coalesced actions
  let filtered = current;
  if (action.type === 'COMPLETE_DAILY_MISSION') {
    filtered = current.filter((a) => a.type !== 'COMPLETE_DAILY_MISSION');
  } else if (action.type === 'PROTECT_STREAK') {
    filtered = current.filter((a) => a.type !== 'PROTECT_STREAK');
  } else if (action.type === 'UPDATE_PROFILE') {
    filtered = current.filter((a) => a.type !== 'UPDATE_PROFILE');
  } else if (action.type === 'CREATE_POST' && action.body?.id) {
    filtered = current.filter(
      (a) => !(a.type === 'CREATE_POST' && a.body?.id === action.body?.id)
    );
  } else if (action.type === 'SEND_CHAT' && action.body?.id) {
    filtered = current.filter(
      (a) => !(a.type === 'SEND_CHAT' && a.body?.id === action.body?.id)
    );
  }

  const next = [...filtered, nextEntry].slice(-MAX_QUEUE_LENGTH);
  writeQueueToStorage(next);
  return next;
}

export function replaceOfflineQueue(items: QueuedOfflineAction[]): QueuedOfflineAction[] {
  writeQueueToStorage(items);
  return items.slice(-MAX_QUEUE_LENGTH);
}

export function removeOfflineAction(actionId: string): QueuedOfflineAction[] {
  const next = loadOfflineQueue().filter((a) => a.id !== actionId);
  writeQueueToStorage(next);
  return next;
}

export function clearOfflineQueue(): void {
  writeQueueToStorage([]);
}

export function getManualOfflineMode(): boolean {
  try {
    return window.localStorage.getItem(MANUAL_OFFLINE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setManualOfflineModeStorage(offline: boolean): void {
  try {
    if (offline) {
      window.localStorage.setItem(MANUAL_OFFLINE_KEY, '1');
    } else {
      window.localStorage.removeItem(MANUAL_OFFLINE_KEY);
    }
  } catch {
    // ignore
  }
}
