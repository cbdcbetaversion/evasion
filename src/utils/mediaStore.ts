// IndexedDB & in-memory resilient store for photos & 1-minute videos (zero localStorage quota crash, 1M-user LRU safe)
import { uploadBlobToSupabaseStorage } from './supabaseClient';

const DB_NAME = 'evasion_media_db';
const STORE_NAME = 'media_blobs';
const DB_VERSION = 1;
const MAX_LOCAL_MEDIA_BLOBS = 300;

export const MAX_MEDIA_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 Mo max
export const MAX_MEDIA_DURATION_SECONDS = 60; // 1 min max

const MAX_MEMORY_CACHE = 300;
const memoryBlobCache = new Map<string, Blob>();
const objectUrlCache = new Map<string, string>();

function setMemoryBlobWithCap(id: string, blob: Blob): void {
  if (memoryBlobCache.has(id)) {
    memoryBlobCache.delete(id);
  } else if (memoryBlobCache.size >= MAX_MEMORY_CACHE) {
    const firstKey = memoryBlobCache.keys().next().value;
    if (firstKey) memoryBlobCache.delete(firstKey);
  }
  memoryBlobCache.set(id, blob);
}

function setObjectUrlWithCap(ref: string, url: string): void {
  if (objectUrlCache.has(ref)) {
    objectUrlCache.delete(ref);
  } else if (objectUrlCache.size >= MAX_MEMORY_CACHE) {
    const firstRef = objectUrlCache.keys().next().value;
    if (firstRef) {
      const oldUrl = objectUrlCache.get(firstRef);
      objectUrlCache.delete(firstRef);
      if (oldUrl) {
        try {
          URL.revokeObjectURL(oldUrl);
        } catch {
          // ignore
        }
      }
    }
  }
  objectUrlCache.set(ref, url);
}

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

function collectProtectedMediaIds(): Set<string> {
  const protectedIds = new Set<string>();
  try {
    const scanText = (raw: string | null) => {
      if (!raw) return;
      const matches = raw.match(/idb:\/\/([a-zA-Z0-9_-]+)/g);
      if (matches) {
        for (const m of matches) {
          protectedIds.add(m.slice('idb://'.length));
        }
      }
    };
    scanText(localStorage.getItem('evasion_user'));
    scanText(localStorage.getItem('evasion_universe_pending_v1'));
  } catch {
    // ignore storage read issues
  }
  return protectedIds;
}

async function pruneOldIndexedDbEntries(db: IDBDatabase, keepCount = MAX_LOCAL_MEDIA_BLOBS - 20): Promise<void> {
  try {
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (keys.length <= keepCount) return;
    const protectedIds = collectProtectedMediaIds();
    const candidates = keys.map(String).filter((k) => !protectedIds.has(k)).sort();
    const overflowCount = Math.max(0, keys.length - keepCount);
    if (overflowCount === 0 || candidates.length === 0) return;
    const toDelete = candidates.slice(0, Math.min(overflowCount, candidates.length));

    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const k of toDelete) {
        store.delete(k);
        memoryBlobCache.delete(k);
        const ref = `idb://${k}`;
        const cachedUrl = objectUrlCache.get(ref);
        if (cachedUrl) {
          objectUrlCache.delete(ref);
          try {
            URL.revokeObjectURL(cachedUrl);
          } catch {
            // ignore
          }
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore cleanup error
  }
}

export async function saveMediaBlob(blob: Blob): Promise<string> {
  const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ref = `idb://${id}`;

  setMemoryBlobWithCap(id, blob);

  try {
    const objUrl = URL.createObjectURL(blob);
    setObjectUrlWithCap(ref, objUrl);
  } catch {
    // ignore
  }

  try {
    const db = await openMediaDB();
    await pruneOldIndexedDbEntries(db);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback: try freeing older entries once if quota exceeded
    try {
      const db = await openMediaDB();
      await pruneOldIndexedDbEntries(db, 10);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Remains safely in memoryBlobCache / objectUrlCache for current session
    }
  }

  return ref;
}

export async function revokeMediaUrlOrRef(refOrUrl?: string | null): Promise<void> {
  if (!refOrUrl || typeof refOrUrl !== 'string') return;
  try {
    if (refOrUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(refOrUrl);
      } catch {
        // ignore
      }
      for (const [k, cached] of objectUrlCache.entries()) {
        if (cached === refOrUrl) {
          objectUrlCache.delete(k);
        }
      }
      return;
    }

    if (refOrUrl.startsWith('idb://')) {
      const id = refOrUrl.slice('idb://'.length);
      const cachedUrl = objectUrlCache.get(refOrUrl);
      if (cachedUrl) {
        objectUrlCache.delete(refOrUrl);
        try {
          URL.revokeObjectURL(cachedUrl);
        } catch {
          // ignore
        }
      }
      memoryBlobCache.delete(id);

      if (typeof indexedDB !== 'undefined') {
        const db = await openMediaDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      }
    }
  } catch {
    // ignore cleanup error
  }
}

export async function clearAllMediaBlobs(): Promise<void> {
  try {
    objectUrlCache.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    });
    objectUrlCache.clear();
    memoryBlobCache.clear();

    if (typeof indexedDB !== 'undefined') {
      const db = await openMediaDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch {
    // ignore cleanup error
  }
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    if (!dataUrl.startsWith('data:')) return null;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(5, commaIdx);
    const body = dataUrl.slice(commaIdx + 1);
    const mime = header.split(';')[0] || 'application/octet-stream';
    const isBase64 = header.includes(';base64');
    if (isBase64) {
      const binStr = atob(body.replace(/\s+/g, ''));
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(body)], { type: mime });
  } catch {
    return null;
  }
}

export async function saveDataUrlToBlobRef(dataUrl: string): Promise<string | null> {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return null;
  return saveMediaBlob(blob);
}

export async function resolveMediaBlob(ref?: string | null): Promise<Blob | null> {
  if (!ref) return null;
  if (ref.startsWith('data:')) {
    return dataUrlToBlob(ref);
  }
  if (!ref.startsWith('idb://')) {
    try {
      const res = await fetch(ref);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  const id = ref.slice('idb://'.length);
  const memBlob = memoryBlobCache.get(id);
  if (memBlob) return memBlob;

  try {
    const db = await openMediaDB();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    if (blob) {
      setMemoryBlobWithCap(id, blob);
      return blob;
    }
  } catch {
    // ignore
  }
  return null;
}

export function peekResolvedMediaUrl(ref?: string | null): string | null {
  if (!ref) return null;
  if (!ref.startsWith('idb://')) return ref;
  return objectUrlCache.get(ref) || null;
}

export async function resolveMediaUrl(ref?: string | null): Promise<string | null> {
  if (!ref) return null;
  if (!ref.startsWith('idb://')) return ref;

  const cached = objectUrlCache.get(ref);
  if (cached) return cached;

  const blob = await resolveMediaBlob(ref);
  if (blob) {
    const url = URL.createObjectURL(blob);
    setObjectUrlWithCap(ref, url);
    return url;
  }
  return null;
}

export async function uploadMediaBlobForSync(
  ref?: string | null,
  options?: { folder?: string; fileName?: string; userId?: string }
): Promise<string | undefined> {
  if (!ref) return undefined;
  if (!ref.startsWith('idb://') && !ref.startsWith('blob:')) return ref;
  try {
    const blob = await resolveMediaBlob(ref);
    if (!blob) return ref;

    // 1. Envoi direct vers Supabase Storage (retourne uniquement l'URL publique cloud)
    const supabasePublicUrl = await uploadBlobToSupabaseStorage(
      blob,
      options?.folder || 'media',
      options?.fileName,
      options?.userId
    );
    if (supabasePublicUrl) {
      return supabasePublicUrl;
    }

    // 2. Fallback serveur (/api/media) si Supabase Storage non configuré ou hors quota
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: blob,
    });
    if (!res.ok) return ref;
    const data = (await res.json()) as { success?: boolean; url?: string };
    if (data?.success && typeof data.url === 'string') {
      return data.url;
    }
  } catch {
    // fallback gracefully to local idb:// ref (IndexedDB backup)
  }
  return ref;
}

export async function uploadDataUrlForSync(
  dataUrlOrRef: string,
  options?: { folder?: string; fileName?: string; userId?: string }
): Promise<string> {
  if (!dataUrlOrRef) return dataUrlOrRef;
  if (dataUrlOrRef.startsWith('idb://') || dataUrlOrRef.startsWith('blob:')) {
    return (await uploadMediaBlobForSync(dataUrlOrRef, options)) || dataUrlOrRef;
  }
  if (!dataUrlOrRef.startsWith('data:')) return dataUrlOrRef;
  try {
    const blob = dataUrlToBlob(dataUrlOrRef);
    if (!blob) return dataUrlOrRef;

    const supabasePublicUrl = await uploadBlobToSupabaseStorage(
      blob,
      options?.folder || 'media',
      options?.fileName,
      options?.userId
    );
    if (supabasePublicUrl) {
      return supabasePublicUrl;
    }

    const res = await fetch('/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: blob,
    });
    if (!res.ok) return dataUrlOrRef;
    const json = (await res.json()) as { success?: boolean; url?: string };
    if (json?.success && typeof json.url === 'string') {
      return json.url;
    }
  } catch {
    // fallback to original ref
  }
  return dataUrlOrRef;
}

function getExtensionForMime(mimeRaw: string): string {
  const mime = (mimeRaw || 'application/octet-stream').toLowerCase();
  if (mime.includes('audio/mp4') || mime.includes('m4a') || mime.includes('aac')) return '.m4a';
  if (mime.includes('audio/mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('audio/ogg')) return '.ogg';
  if (mime.includes('audio/wav')) return '.wav';
  if (mime.includes('audio/flac')) return '.flac';
  if (mime.includes('audio/webm')) return '.webm';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime') || mime.includes('mov')) return '.mov';
  if (mime.includes('svg')) return '.svg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('zip')) return '.zip';
  if (mime.includes('json')) return '.json';
  if (mime.includes('csv')) return '.csv';
  if (mime.includes('text/plain')) return '.txt';
  if (mime.includes('wordprocessingml')) return '.docx';
  if (mime.includes('msword')) return '.doc';
  if (mime.includes('spreadsheetml')) return '.xlsx';
  return '';
}

function triggerBlobDownload(blob: Blob, baseFileName: string): void {
  const ext = baseFileName.includes('.') ? '' : getExtensionForMime(blob.type);
  const finalName = `${baseFileName}${ext}`;
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 15000);
}

function triggerHiddenIframeDownload(attachmentUrl: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  iframe.src = attachmentUrl;
  document.body.appendChild(iframe);
  window.setTimeout(() => {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch {
      // ignore
    }
  }, 30000);
}

function buildDirectAttachmentUrl(refOrUrl: string, baseFileName: string): string {
  const safeName = encodeURIComponent(baseFileName || `evasion_${Date.now()}`);
  if (refOrUrl.startsWith('/api/media/')) {
    const cleanPath = refOrUrl.split('?')[0];
    return `${cleanPath}?download=1&filename=${safeName}`;
  }
  return `/api/media/direct-download?url=${encodeURIComponent(refOrUrl)}&filename=${safeName}`;
}

export async function downloadMediaAsset(
  refOrUrl: string,
  baseFileName: string
): Promise<{ ok: boolean; usedShareSheet?: boolean }> {
  try {
    if (!refOrUrl) return { ok: false };

    // 1. In-memory or IndexedDB media -> always download as Blob (never leaves page)
    if (refOrUrl.startsWith('data:') || refOrUrl.startsWith('idb://') || refOrUrl.startsWith('blob:')) {
      const blob = await resolveMediaBlob(refOrUrl);
      if (blob) {
        triggerBlobDownload(blob, baseFileName);
        return { ok: true };
      }
      return { ok: false };
    }

    // 2. Server or external URL -> direct download channel via same-origin attachment endpoint
    const attachmentUrl = buildDirectAttachmentUrl(refOrUrl, baseFileName);
    try {
      const res = await fetch(attachmentUrl);
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0) {
          triggerBlobDownload(blob, baseFileName);
          return { ok: true };
        }
      }
    } catch {
      // Fall back to hidden iframe attachment channel below
    }

    // 3. Direct browser download channel in hidden iframe (Content-Disposition: attachment, zero page change)
    triggerHiddenIframeDownload(attachmentUrl);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export interface CameraStreamResult {
  stream: MediaStream | null;
  hasAudio: boolean;
  errorMessage: string | null;
  errorCode: 'denied' | 'not_found' | 'unsupported' | 'unknown' | null;
}

export type DevicePermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

export interface MediaPermissionsSummary {
  camera: DevicePermissionState;
  microphone: DevicePermissionState;
}

async function querySinglePermission(name: 'camera' | 'microphone'): Promise<DevicePermissionState> {
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions && typeof navigator.permissions.query === 'function') {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      if (status.state === 'granted' || status.state === 'prompt' || status.state === 'denied') {
        return status.state;
      }
    }
  } catch {
    // Safari/iOS does not always support permissions.query for camera/microphone
  }
  return 'unknown';
}

export async function getCameraPermissionState(): Promise<DevicePermissionState> {
  return querySinglePermission('camera');
}

export async function getMicrophonePermissionState(): Promise<DevicePermissionState> {
  return querySinglePermission('microphone');
}

export async function getMediaPermissionsSummary(): Promise<MediaPermissionsSummary> {
  let [camera, microphone] = await Promise.all([
    querySinglePermission('camera'),
    querySinglePermission('microphone'),
  ]);

  // Safari / iOS fallback: non-empty device labels prove permission was already granted
  if (
    (camera === 'unknown' || microphone === 'unknown') &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === 'function'
  ) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (camera === 'unknown' && devices.some((d) => d.kind === 'videoinput' && Boolean(d.label))) {
        camera = 'granted';
      }
      if (microphone === 'unknown' && devices.some((d) => d.kind === 'audioinput' && Boolean(d.label))) {
        microphone = 'granted';
      }
    } catch {
      // ignore enumerateDevices restriction
    }
  }

  return { camera, microphone };
}

export function subscribeMediaPermissionChanges(
  onChange: (summary: MediaPermissionsSummary) => void
): () => void {
  if (typeof navigator === 'undefined' || !navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return () => {};
  }
  let cancelled = false;
  const cleanups: (() => void)[] = [];

  const emitSummary = async () => {
    if (cancelled) return;
    const summary = await getMediaPermissionsSummary();
    if (!cancelled) onChange(summary);
  };

  (['camera', 'microphone'] as const).forEach((name) => {
    navigator.permissions
      .query({ name: name as PermissionName })
      .then((status) => {
        if (cancelled) return;
        const handler = () => {
          void emitSummary();
        };
        status.addEventListener?.('change', handler);
        cleanups.push(() => status.removeEventListener?.('change', handler));
      })
      .catch(() => {
        // ignore unsupported query
      });
  });

  return () => {
    cancelled = true;
    cleanups.forEach((fn) => fn());
  };
}

export function isInsideEmbeddedFrame(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function getMediaPermissionGuideSteps(): { platformLabel: string; steps: string[] } {
  if (typeof navigator === 'undefined') {
    return {
      platformLabel: 'Navigateur',
      steps: [
        'Clique sur l’icône à gauche de la barre d’adresse.',
        'Passe Caméra et Micro sur « Autoriser », puis appuie sur Réessayer.',
      ],
    };
  }
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return {
      platformLabel: 'iPhone / iPad (Safari)',
      steps: [
        'Appuie sur « AA » ou l’icône réglages à gauche de la barre d’adresse → « Réglages du site web ».',
        'Mets Caméra et Microphone sur « Autoriser », puis touche « Réessayer ».',
      ],
    };
  }
  if (/Android/i.test(ua)) {
    return {
      platformLabel: 'Android (Chrome)',
      steps: [
        'Touche l’icône de réglages / cadenas à gauche de l’URL → « Autorisations ».',
        'Active Caméra et Micro pour ce site, puis appuie sur « Réessayer ».',
      ],
    };
  }
  return {
    platformLabel: 'Navigateur Web',
    steps: [
      'Clique sur l’icône réglages / cadenas à gauche de la barre d’adresse.',
      'Autorise « Caméra » et « Microphone », puis clique sur « Réessayer ».',
    ],
  };
}

export function attachStreamToVideoElement(
  videoEl: HTMLVideoElement | null,
  stream: MediaStream | null,
  options?: { muted?: boolean }
): void {
  if (!videoEl || !stream) return;
  const shouldMute = options?.muted ?? true;
  try {
    videoEl.muted = shouldMute;
    videoEl.defaultMuted = shouldMute;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    if (shouldMute) {
      videoEl.setAttribute('muted', '');
    } else {
      videoEl.removeAttribute('muted');
    }
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');

    stream.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // If unmuted autoplay fails due to browser policy, retry muted so video renders
        if (!shouldMute) {
          videoEl.muted = true;
          videoEl.play().catch(() => {});
        }
      });
    }
  } catch {
    // ignore DOM attachment edge error
  }
}

export async function findCameraDeviceIdForFacing(
  targetFacing: 'user' | 'environment',
  excludeDeviceId?: string
): Promise<string | undefined> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return undefined;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
    if (videoInputs.length === 0) return undefined;

    const envRe = /back|rear|arri[eè]re|environment|world|traseira|external/i;
    const userRe = /front|avant|facetime|user|selfie/i;

    if (targetFacing === 'environment') {
      const labeledBack = videoInputs.filter(
        (d) => envRe.test(d.label || '') && (!excludeDeviceId || d.deviceId !== excludeDeviceId)
      );
      if (labeledBack.length > 0) {
        const standardBack = labeledBack.find((d) => !/ultra|macro|tele|depth/i.test(d.label || ''));
        return (standardBack || labeledBack[0]).deviceId;
      }
    } else {
      const labeledFront = videoInputs.filter(
        (d) => userRe.test(d.label || '') && (!excludeDeviceId || d.deviceId !== excludeDeviceId)
      );
      if (labeledFront.length > 0) {
        return labeledFront[0].deviceId;
      }
    }

    if (excludeDeviceId && videoInputs.length > 1) {
      const other = videoInputs.find((d) => d.deviceId !== excludeDeviceId);
      if (other) return other.deviceId;
    }
  } catch {
    // ignore enumerateDevices restriction
  }
  return undefined;
}

export async function requestCameraAndMicStream(options: {
  facingMode?: 'user' | 'environment';
  withAudio?: boolean;
  deviceId?: string;
  strictFacing?: boolean;
}): Promise<CameraStreamResult> {
  const { facingMode = 'user', withAudio = true, deviceId, strictFacing = false } = options;

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return {
      stream: null,
      hasAudio: false,
      errorMessage:
        'Caméra non prise en charge dans cette vue. Utilise Safari/Chrome sur ton téléphone ou importe/filme via la caméra native.',
      errorCode: 'unsupported',
    };
  }

  const attempts: MediaStreamConstraints[] = [];

  if (deviceId) {
    if (withAudio) {
      attempts.push({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      });
    }
    attempts.push({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    attempts.push({ video: { deviceId: { exact: deviceId } }, audio: false });
  }

  if (withAudio) {
    attempts.push(
      {
        video: {
          facingMode: { exact: facingMode },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      },
      { video: { facingMode: { exact: facingMode } }, audio: true },
      {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      },
      { video: { facingMode }, audio: true }
    );
  }

  attempts.push(
    { video: { facingMode: { exact: facingMode } }, audio: false },
    { video: { facingMode: { ideal: facingMode } }, audio: false }
  );

  if (!strictFacing) {
    if (withAudio) {
      attempts.push({ video: true, audio: true });
    }
    attempts.push({ video: true, audio: false });
  }

  let lastErr: unknown = null;

  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getVideoTracks().forEach((t) => {
        t.enabled = true;
        try {
          if ('contentHint' in t) t.contentHint = 'motion';
        } catch {
          // ignore
        }
      });
      stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
        try {
          if ('contentHint' in t) t.contentHint = 'speech';
        } catch {
          // ignore
        }
      });
      const hasAudio = stream.getAudioTracks().length > 0;
      return { stream, hasAudio, errorMessage: null, errorCode: null };
    } catch (err) {
      lastErr = err;
    }
  }

  const errName = (lastErr as { name?: string })?.name || '';
  if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
    return {
      stream: null,
      hasAudio: false,
      errorMessage:
        'Autorisation bloquée par le navigateur : active Caméra & Micro depuis l’icône à gauche de la barre d’adresse, puis réessaie.',
      errorCode: 'denied',
    };
  }
  if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
    return {
      stream: null,
      hasAudio: false,
      errorMessage: 'Aucune caméra détectée sur cet appareil. Tu peux tout de même diffuser en Audio seul.',
      errorCode: 'not_found',
    };
  }
  if (errName === 'NotReadableError' || errName === 'TrackStartError') {
    return {
      stream: null,
      hasAudio: false,
      errorMessage: 'La caméra est déjà utilisée par une autre application. Ferme-la ou passe en Audio seul.',
      errorCode: 'unknown',
    };
  }

  return {
    stream: null,
    hasAudio: false,
    errorMessage:
      "Impossible d'activer la caméra pour le moment. Réessaie ou passe en Audio seul.",
    errorCode: 'unknown',
  };
}

export async function requestAudioOnlyStream(): Promise<CameraStreamResult> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return {
      stream: null,
      hasAudio: false,
      errorMessage: 'Micro non pris en charge sur ce navigateur.',
      errorCode: 'unsupported',
    };
  }
  const attempts: MediaStreamConstraints[] = [
    { video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
    { video: false, audio: true },
  ];
  let lastErr: unknown = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
        try {
          if ('contentHint' in t) t.contentHint = 'speech';
        } catch {
          // ignore
        }
      });
      return {
        stream,
        hasAudio: stream.getAudioTracks().length > 0,
        errorMessage: null,
        errorCode: null,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  const errName = (lastErr as { name?: string })?.name || '';
  if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
    return {
      stream: null,
      hasAudio: false,
      errorMessage: 'Autorisation micro refusée : active le micro dans les réglages du navigateur.',
      errorCode: 'denied',
    };
  }
  return {
    stream: null,
    hasAudio: false,
    errorMessage: 'Aucun micro détecté ou disponible sur cet appareil.',
    errorCode: 'not_found',
  };
}

export function getVideoDuration(fileOrBlob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(fileOrBlob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const cleanup = () => {
      try {
        URL.revokeObjectURL(tempUrl);
      } catch {
        // ignore
      }
      video.removeAttribute('src');
      video.load();
    };

    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(0);
    }, 6000);

    video.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      cleanup();
      resolve(dur);
    };

    video.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error('Format vidéo non pris en charge par ce navigateur.'));
    };

    video.src = tempUrl;
  });
}

export async function processVideoFile(
  file: File,
  maxSeconds = MAX_MEDIA_DURATION_SECONDS
): Promise<{ videoRef: string; duration: number }> {
  const looksLikeVideo =
    file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|3gp|mkv|avi)$/i.test(file.name || '');
  if (!looksLikeVideo) {
    throw new Error('Veuillez sélectionner un fichier vidéo valide (MP4, WebM, MOV).');
  }

  if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new Error(
      `Vidéo trop volumineuse (${formatFileSize(file.size)}, max 20 Mo). Réduis sa taille avant l'import.`
    );
  }

  const duration = await getVideoDuration(file);
  if (duration > maxSeconds + 0.5) {
    throw new Error(
      `Vidéo trop longue (${Math.ceil(duration)}s). La durée maximale autorisée est de ${maxSeconds} secondes (1 min).`
    );
  }

  const videoRef = await saveMediaBlob(file);
  return {
    videoRef,
    duration: Math.max(1, Math.min(maxSeconds, Math.round(duration || 1))),
  };
}

export async function compressImageFileToBlob(
  file: File,
  maxSize = 1080,
  quality = 0.84
): Promise<Blob> {
  const looksLikeImage =
    (file.type && file.type.startsWith('image/')) ||
    /\.(jpe?g|png|webp|gif|heic|heif|svg)$/i.test(file.name || '');
  if (!looksLikeImage) {
    throw new Error('Veuillez sélectionner une image valide (JPG, PNG, WebP).');
  }
  if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new Error(`Image trop volumineuse (${formatFileSize(file.size)}, max 20 Mo).`);
  }

  const tempUrl = URL.createObjectURL(file);
  try {
    return await new Promise<Blob>((resolve) => {
      const img = new Image();
      img.onerror = () => {
        resolve(file);
      };
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          if (!width || !height) {
            resolve(file);
            return;
          }
          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
          canvas.width = Math.max(1, Math.round(width));
          canvas.height = Math.max(1, Math.round(height));
          const ctx = canvas.getContext('2d');
          if (!ctx || typeof canvas.toBlob !== 'function') {
            resolve(file);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const targetMime =
            file.type === 'image/png' && file.size < 2 * 1024 * 1024 ? 'image/png' : 'image/jpeg';
          canvas.toBlob(
            (blob) => {
              resolve(blob && blob.size > 0 ? blob : file);
            },
            targetMime,
            quality
          );
        } catch {
          resolve(file);
        }
      };
      img.src = tempUrl;
    });
  } finally {
    try {
      URL.revokeObjectURL(tempUrl);
    } catch {
      // ignore
    }
  }
}

export async function processImageFile(file: File, maxSize = 1080, quality = 0.84): Promise<string> {
  const resizedBlob = await compressImageFileToBlob(file, maxSize, quality);
  return await saveMediaBlob(resizedBlob);
}

export function getAudioDuration(fileOrBlob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(fileOrBlob);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    let settled = false;
    const cleanup = () => {
      try {
        URL.revokeObjectURL(tempUrl);
      } catch {
        // ignore
      }
      audio.removeAttribute('src');
      audio.load();
    };

    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(0);
    }, 6000);

    audio.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      cleanup();
      resolve(dur);
    };

    audio.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error('Format audio non pris en charge par ce navigateur.'));
    };

    audio.src = tempUrl;
  });
}

export async function processAudioFile(
  fileOrBlob: Blob | File,
  maxSeconds = MAX_MEDIA_DURATION_SECONDS
): Promise<{ audioRef: string; duration: number; fileSize: number }> {
  const fileName = fileOrBlob instanceof File ? fileOrBlob.name || '' : '';
  const looksLikeAudio =
    fileOrBlob.type.startsWith('audio/') ||
    fileOrBlob.type === 'video/mp4' ||
    /\.(m4a|mp3|wav|ogg|aac|webm|opus|flac)$/i.test(fileName);

  if (!looksLikeAudio && fileOrBlob.type) {
    throw new Error('Format audio non reconnu. Choisis MP3, M4A, WAV, OGG ou WebM.');
  }

  if (fileOrBlob.size > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new Error(
      `Fichier audio trop volumineux (${formatFileSize(fileOrBlob.size)}, max 20 Mo).`
    );
  }

  const duration = await getAudioDuration(fileOrBlob);
  if (duration > maxSeconds + 0.5) {
    throw new Error(
      `Audio trop long (${Math.ceil(duration)}s). La durée maximale autorisée est de ${maxSeconds} secondes (1 min).`
    );
  }

  const audioRef = await saveMediaBlob(fileOrBlob);
  return {
    audioRef,
    duration: Math.max(1, Math.min(maxSeconds, Math.round(duration || 1))),
    fileSize: fileOrBlob.size,
  };
}

export async function processDocumentFile(file: File): Promise<{
  fileRef: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}> {
  const name = file.name || `document_${Date.now()}`;
  const size = file.size || 0;
  if (size > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new Error(`Fichier trop volumineux (${formatFileSize(size)}, max 20 Mo).`);
  }
  const fileRef = await saveMediaBlob(file);
  return {
    fileRef,
    fileName: name,
    mimeType: file.type || 'application/octet-stream',
    fileSize: size,
  };
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || !isFinite(bytes) || bytes <= 0) return '0 Mo';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} Mo`;
}

export function formatFileSizeMo(bytes?: number): string {
  if (!bytes || !isFinite(bytes) || bytes <= 0) return '0,00 Mo';
  const mo = bytes / (1024 * 1024);
  if (mo < 0.01) {
    return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  }
  return `${mo.toFixed(2).replace('.', ',')} Mo`;
}

export async function processUniverseFile(file: File): Promise<{
  type: 'photo' | 'audio' | 'video' | 'file';
  url: string;
  duration?: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
}> {
  const mime = (file.type || '').toLowerCase();
  const name = file.name || `fichier_${Date.now()}`;
  const size = file.size || 0;

  if (size > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new Error(`Fichier trop volumineux (${formatFileSize(size)}, max 20 Mo).`);
  }

  const isImage =
    mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|svg)$/i.test(name);
  if (isImage) {
    const blobRef = await processImageFile(file, 1080);
    return {
      type: 'photo',
      url: blobRef,
      fileName: name,
      mimeType: mime || 'image/jpeg',
      fileSize: size,
    };
  }

  const isVideo =
    mime.startsWith('video/') || /\.(mp4|mov|webm|m4v|3gp|mkv|avi)$/i.test(name);
  if (isVideo) {
    const { videoRef, duration } = await processVideoFile(file, MAX_MEDIA_DURATION_SECONDS);
    return {
      type: 'video',
      url: videoRef,
      duration,
      fileName: name,
      mimeType: mime || 'video/mp4',
      fileSize: size,
    };
  }

  const isAudio =
    mime.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(name);
  if (isAudio) {
    const { audioRef, duration } = await processAudioFile(file, MAX_MEDIA_DURATION_SECONDS);
    return {
      type: 'audio',
      url: audioRef,
      duration,
      fileName: name,
      mimeType: mime || 'audio/mpeg',
      fileSize: size,
    };
  }

  const doc = await processDocumentFile(file);
  return {
    type: 'file',
    url: doc.fileRef,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
  };
}


