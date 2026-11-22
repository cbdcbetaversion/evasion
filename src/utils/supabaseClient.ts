import { createClient, type User as SupabaseAuthUser, type Session } from '@supabase/supabase-js';
import type { ActiveFlameItem, DeezerTrack, ProfileUniverseItem, UserProfile } from '../types';

const FALLBACK_SUPABASE_URL = 'https://ynxnreceqxtgdbarlhsg.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlueG5yZWNlcXh0Z2RiYXJsaHNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NzkyNDMsImV4cCI6MjExMDE1NTI0M30.zM1_L4qai9tWwkSX_5qfNZqJ-YxNdQvVB_c2YvceQGc';

function resolveSupabaseUrl(candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    const val = (raw || '').trim();
    if (!val) continue;
    const lower = val.toLowerCase();
    if (
      lower === 'undefined' ||
      lower === 'null' ||
      lower === 'https://supabase.co' ||
      lower === 'http://supabase.co' ||
      lower.includes('placeholder') ||
      lower.includes('your_project_ref') ||
      lower.includes('your-project') ||
      !/^https?:\/\/[a-z0-9.-]+/i.test(val)
    ) {
      continue;
    }
    return val.replace(/\/+$/, '');
  }
  return FALLBACK_SUPABASE_URL;
}

function resolveSupabaseAnonKey(candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    const val = (raw || '').trim();
    if (!val || val.length < 20) continue;
    const lower = val.toLowerCase();
    if (
      lower === 'undefined' ||
      lower === 'null' ||
      lower.includes('placeholder') ||
      lower.includes('your_supabase_anon_key') ||
      lower.includes('your-anon-key') ||
      lower.startsWith('sb_publishable_')
    ) {
      continue;
    }
    return val;
  }
  return FALLBACK_SUPABASE_ANON_KEY;
}

export const supabaseUrl = resolveSupabaseUrl([
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
]);

export const supabaseAnonKey = resolveSupabaseAnonKey([
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
]);

export const SUPABASE_STORAGE_BUCKET =
  (
    import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ||
    'evasion'
  ).trim() || 'evasion';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'evasion_supabase_auth',
  },
  global: {
    headers: {
      apikey: supabaseAnonKey,
    },
  },
});

export interface SupabaseProfileRow {
  id: string;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  bio?: string | null;
  is_verified: boolean;
  profile_music?: DeezerTrack | null;
  universe_media?: ProfileUniverseItem[] | null;
  active_flame?: ActiveFlameItem | null;
  evasion_user_id?: string | null;
  profile_data?: Partial<UserProfile> | null;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseProfileUpdatePatch {
  email?: string | null;
  username?: string;
  avatar_url?: string | null;
  bio?: string | null;
  is_verified?: boolean;
  profile_music?: DeezerTrack | null;
  universe_media?: ProfileUniverseItem[];
  active_flame?: ActiveFlameItem | null;
  evasion_user_id?: string;
  profile_data?: Partial<UserProfile>;
}

function getExtensionFromMimeOrName(mime: string, fileName?: string): string {
  if (fileName && /\.[a-zA-Z0-9]{2,6}$/.test(fileName)) {
    return fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  }
  const m = (mime || '').toLowerCase();
  if (m.includes('image/png')) return '.png';
  if (m.includes('image/webp')) return '.webp';
  if (m.includes('image/gif')) return '.gif';
  if (m.includes('image/svg')) return '.svg';
  if (m.includes('image/')) return '.jpg';
  if (m.includes('video/webm')) return '.webm';
  if (m.includes('video/quicktime')) return '.mov';
  if (m.includes('video/')) return '.mp4';
  if (m.includes('audio/mpeg')) return '.mp3';
  if (m.includes('audio/mp4') || m.includes('aac')) return '.m4a';
  if (m.includes('audio/ogg')) return '.ogg';
  if (m.includes('audio/wav')) return '.wav';
  if (m.includes('audio/webm')) return '.webm';
  if (m.includes('pdf')) return '.pdf';
  if (m.includes('wordprocessingml')) return '.docx';
  if (m.includes('spreadsheetml')) return '.xlsx';
  if (m.includes('text/plain')) return '.txt';
  return '';
}

function stripBase64FromProfile(profile: UserProfile): UserProfile {
  const cleanUrl = (v?: string | null) =>
    typeof v === 'string' && v.startsWith('data:') && v.length > 256 ? undefined : v || undefined;
  const rawAvatar = typeof profile.avatar === 'string' ? profile.avatar : '';
  const safeAvatar = rawAvatar
    ? cleanUrl(rawAvatar) || (rawAvatar.startsWith('data:') ? '' : rawAvatar)
    : '';
  return {
    ...profile,
    avatar: safeAvatar,
    activeFlame: profile.activeFlame
      ? {
          ...profile.activeFlame,
          url: cleanUrl(profile.activeFlame.url),
        }
      : undefined,
    universeMedia: Array.isArray(profile.universeMedia)
      ? profile.universeMedia.map((m) => ({
          ...m,
          url: cleanUrl(m.url) || (typeof m.url === 'string' ? m.url.slice(0, 512) : ''),
        }))
      : [],
  };
}

// --- IndexedDB Backup linked strictly to user.id (zero heavy Base64 in localStorage) ---
const PROFILE_BACKUP_DB = 'evasion_profile_backups_db';
const PROFILE_BACKUP_STORE = 'profiles';

function openProfileBackupDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(PROFILE_BACKUP_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROFILE_BACKUP_STORE)) {
        db.createObjectStore(PROFILE_BACKUP_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open profile DB'));
  });
}

export async function saveProfileBackupToIdb(
  userId: string,
  profile: UserProfile
): Promise<void> {
  if (!userId || !profile) return;
  try {
    const db = await openProfileBackupDB();
    const safeProfile = stripBase64FromProfile(profile);
    await new Promise<void>((resolve) => {
      const tx = db.transaction(PROFILE_BACKUP_STORE, 'readwrite');
      tx.objectStore(PROFILE_BACKUP_STORE).put(
        { userId, profile: safeProfile, updatedAt: Date.now() },
        userId
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IndexedDB unavailable
  }
}

export async function loadProfileBackupFromIdb(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;
  try {
    const db = await openProfileBackupDB();
    const record = await new Promise<{ userId?: string; profile?: UserProfile } | undefined>(
      (resolve) => {
        const tx = db.transaction(PROFILE_BACKUP_STORE, 'readonly');
        const req = tx.objectStore(PROFILE_BACKUP_STORE).get(userId);
        req.onsuccess = () => resolve(req.result as { userId?: string; profile?: UserProfile } | undefined);
        req.onerror = () => resolve(undefined);
      }
    );
    return record?.profile || null;
  } catch {
    return null;
  }
}

const LATEST_ACTIVE_PROFILE_KEY = '__latest_active_profile__';

export async function saveLatestProfileBackupToIdb(profile: UserProfile): Promise<void> {
  if (!profile?.id) return;
  await saveProfileBackupToIdb(LATEST_ACTIVE_PROFILE_KEY, profile);
}

export async function loadLatestProfileBackupFromIdb(): Promise<UserProfile | null> {
  return loadProfileBackupFromIdb(LATEST_ACTIVE_PROFILE_KEY);
}

export async function clearLatestProfileBackupFromIdb(): Promise<void> {
  try {
    const db = await openProfileBackupDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(PROFILE_BACKUP_STORE, 'readwrite');
      tx.objectStore(PROFILE_BACKUP_STORE).delete(LATEST_ACTIVE_PROFILE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

export async function saveCloudProfileSnapshot(
  supabaseUserId: string,
  profile: UserProfile
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabaseUserId || !profile) return false;
  try {
    const safeKey = supabaseUserId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeKey) return false;
    const safeProfile = stripBase64FromProfile(profile);
    const payload = JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      supabaseUserId: safeKey,
      profile: safeProfile,
    });
    const objectPath = `profiles/${safeKey}/snapshot.json`;
    const bucketsToTry = Array.from(new Set([SUPABASE_STORAGE_BUCKET, 'evasion'].filter(Boolean)));
    const contentTypes = ['application/json', 'text/plain'];
    for (const bucket of bucketsToTry) {
      for (const contentType of contentTypes) {
        const blob = new Blob([payload], { type: contentType });
        const { error } = await supabase.storage.from(bucket).upload(objectPath, blob, {
          contentType,
          cacheControl: '0',
          upsert: true,
        });
        if (!error) return true;
        const msg = error.message || '';
        if (/bucket.*not.*found|not found/i.test(msg)) {
          break;
        }
        if (!/mime|content[- ]type|invalid/i.test(msg)) {
          break;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function loadCloudProfileSnapshot(
  supabaseUserId: string
): Promise<UserProfile | null> {
  if (!isSupabaseConfigured || !supabaseUserId) return null;
  const safeKey = supabaseUserId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeKey) return null;
  const objectPath = `profiles/${safeKey}/snapshot.json`;
  const bucketsToTry = Array.from(new Set([SUPABASE_STORAGE_BUCKET, 'evasion'].filter(Boolean)));

  for (const bucket of bucketsToTry) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(objectPath);
      if (!error && data) {
        const text = await data.text();
        const parsed = JSON.parse(text) as { profile?: UserProfile } | null;
        if (parsed?.profile && typeof parsed.profile === 'object') {
          return parsed.profile;
        }
      }
    } catch {
      // fallback to public URL below
    }

    try {
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      if (urlData?.publicUrl) {
        const res = await fetch(`${urlData.publicUrl}?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const parsed = (await res.json()) as { profile?: UserProfile } | null;
          if (parsed?.profile && typeof parsed.profile === 'object') {
            return parsed.profile;
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

// --- Supabase Google OAuth & Session Auth ---
export async function signInWithGoogleSupabase(): Promise<{ error?: string }> {
  if (!isSupabaseConfigured) {
    return {
      error:
        'Supabase non configuré : ajoute NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (ou VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
    };
  }
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      return { error: error.message };
    }
    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Erreur lors de la redirection Google OAuth.',
    };
  }
}

export async function signInWithEmailPasswordSupabase(
  email: string,
  password: string
): Promise<{ session: Session | null; user: SupabaseAuthUser | null; error?: string }> {
  if (!isSupabaseConfigured) {
    return { session: null, user: null, error: 'Supabase non configuré.' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: password.trim(),
  });
  if (error) {
    return { session: null, user: null, error: error.message };
  }
  return { session: data.session, user: data.user };
}

export async function signUpWithEmailPasswordSupabase(
  email: string,
  password: string,
  username?: string,
  avatarUrl?: string
): Promise<{ session: Session | null; user: SupabaseAuthUser | null; error?: string }> {
  if (!isSupabaseConfigured) {
    return { session: null, user: null, error: 'Supabase non configuré.' };
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: password.trim(),
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        username: username?.trim(),
        avatar_url: avatarUrl,
      },
    },
  });
  if (error) {
    return { session: null, user: null, error: error.message };
  }
  return { session: data.session, user: data.user };
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore signout network error
  }
}

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === '42703' ||
    err.code === 'PGRST204' ||
    /column .* does not exist/i.test(err.message || '') ||
    /could not find the .* column/i.test(err.message || '')
  );
}

/**
 * Sécurisation du profil (Ne jamais écraser) :
 * 1. Vérifie d'abord si le profil existe déjà dans `profiles` via `user.id`.
 * 2. Si le profil existe : retourne simplement les données actuelles sans rien écraser ni réinitialiser.
 * 3. S'il n'existe pas encore : crée une nouvelle ligne avec les infos Google de base (`upsert` avec `ignoreDuplicates: true`).
 */
export async function getOrCreateSupabaseProfile(
  authUser: SupabaseAuthUser
): Promise<{ profile: SupabaseProfileRow | null; isNew: boolean; error?: string }> {
  if (!isSupabaseConfigured || !authUser?.id) {
    return { profile: null, isNew: false };
  }

  try {
    // 1. Toujours vérifier si le profil existe déjà par user.id avant toute écriture
    const { data: existingProfile, error: selectError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (selectError) {
      return { profile: null, isNew: false, error: selectError.message };
    }

    if (existingProfile) {
      // Profil déjà existant : ne JAMAIS écraser pseudo, bio, avatar, médias ni statut
      return { profile: existingProfile as SupabaseProfileRow, isNew: false };
    }

    // 2. Profil inexistant : création sécurisée avec ignoreDuplicates: true
    const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
    const rawName =
      (typeof meta.username === 'string' && meta.username) ||
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      authUser.email?.split('@')[0] ||
      'Membre ÉVASION';
    const googleUsername = rawName.trim().slice(0, 32) || 'Membre ÉVASION';
    const googleAvatar =
      (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
      (typeof meta.picture === 'string' && meta.picture) ||
      '🛡️';
    const isGoogleOrConfirmed = Boolean(
      authUser.email_confirmed_at ||
        authUser.app_metadata?.provider === 'google' ||
        authUser.identities?.some((id) => id.provider === 'google')
    );

    const coreNewRow: SupabaseProfileRow = {
      id: authUser.id,
      email: authUser.email ?? null,
      username: googleUsername,
      avatar_url: googleAvatar,
      is_verified: isGoogleOrConfirmed,
    };

    const { error: upsertErr } = await supabase
      .from('profiles')
      .upsert(coreNewRow, { onConflict: 'id', ignoreDuplicates: true });

    if (upsertErr) {
      return { profile: coreNewRow, isNew: true, error: upsertErr.message };
    }

    const { data: createdRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    return {
      profile: (createdRow as SupabaseProfileRow) || coreNewRow,
      isNew: true,
    };
  } catch (err) {
    return {
      profile: null,
      isNew: false,
      error: err instanceof Error ? err.message : 'Erreur lecture/création profil Supabase.',
    };
  }
}

export async function fetchSupabaseProfileById(
  supabaseUserId: string
): Promise<SupabaseProfileRow | null> {
  if (!isSupabaseConfigured || !supabaseUserId) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseUserId)
      .maybeSingle();
    if (error || !data) return null;
    return data as SupabaseProfileRow;
  } catch {
    return null;
  }
}

const knownMissingProfileColumns = new Set<string>();

function extractMissingColumnName(err: { message?: string } | null | undefined): string | null {
  const msg = err?.message || '';
  const m1 = msg.match(/Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  if (m1?.[1]) return m1[1];
  const m2 = msg.match(/column\s+["']?([a-zA-Z0-9_]+)["']?\s+(?:of relation .* )?does not exist/i);
  if (m2?.[1]) return m2[1];
  return null;
}

/**
 * Sauvegarde immédiate des modifications (bio, pseudo, avatar, médias, musique, flamme) liées à `user.id`.
 * Met à jour uniquement les champs modifiés sans jamais réinitialiser le reste du profil,
 * et ignore automatiquement toute colonne absente du schéma SQL sans perdre les autres champs (ex: bio, avatar, médias).
 */
export async function saveSupabaseProfilePatch(
  supabaseUserId: string,
  patch: SupabaseProfileUpdatePatch
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabaseUserId) return false;
  try {
    const workingPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.email !== undefined) workingPatch.email = patch.email;
    if (patch.username !== undefined) workingPatch.username = patch.username;
    if (patch.avatar_url !== undefined) workingPatch.avatar_url = patch.avatar_url;
    if (patch.bio !== undefined) workingPatch.bio = patch.bio;
    if (patch.is_verified !== undefined) workingPatch.is_verified = patch.is_verified;
    if (patch.profile_music !== undefined) workingPatch.profile_music = patch.profile_music;
    if (patch.universe_media !== undefined) workingPatch.universe_media = patch.universe_media;
    if (patch.active_flame !== undefined) workingPatch.active_flame = patch.active_flame;
    if (patch.evasion_user_id !== undefined) workingPatch.evasion_user_id = patch.evasion_user_id;
    if (patch.profile_data !== undefined) workingPatch.profile_data = patch.profile_data;

    for (const col of knownMissingProfileColumns) {
      delete workingPatch[col];
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const keys = Object.keys(workingPatch);
      if (keys.length === 0) return false;

      const { data: updatedRows, error } = await supabase
        .from('profiles')
        .update(workingPatch)
        .eq('id', supabaseUserId)
        .select('id');

      if (!error) {
        if (Array.isArray(updatedRows) && updatedRows.length > 0) {
          return true;
        }
        // La ligne n'existait pas encore dans profiles : création immédiate via upsert sans perte
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert({ id: supabaseUserId, ...workingPatch }, { onConflict: 'id' });
        if (!upsertErr) return true;
        if (isMissingColumnError(upsertErr)) {
          const missingCol = extractMissingColumnName(upsertErr);
          if (missingCol && missingCol in workingPatch) {
            knownMissingProfileColumns.add(missingCol);
            delete workingPatch[missingCol];
            continue;
          }
        }
        return false;
      }

      if (isMissingColumnError(error)) {
        const missingCol = extractMissingColumnName(error);
        if (missingCol && missingCol in workingPatch) {
          knownMissingProfileColumns.add(missingCol);
          delete workingPatch[missingCol];
          continue;
        }
        // Fallback progressif si le nom de colonne n'a pas pu être extrait
        const fallbackPatch: Record<string, unknown> = {};
        if (patch.email !== undefined && !knownMissingProfileColumns.has('email')) fallbackPatch.email = patch.email;
        if (patch.username !== undefined && !knownMissingProfileColumns.has('username')) fallbackPatch.username = patch.username;
        if (patch.avatar_url !== undefined && !knownMissingProfileColumns.has('avatar_url')) fallbackPatch.avatar_url = patch.avatar_url;
        if (patch.bio !== undefined && !knownMissingProfileColumns.has('bio')) fallbackPatch.bio = patch.bio;
        if (patch.is_verified !== undefined && !knownMissingProfileColumns.has('is_verified')) fallbackPatch.is_verified = patch.is_verified;
        if (Object.keys(fallbackPatch).length > 0) {
          const { error: fbErr } = await supabase
            .from('profiles')
            .update(fallbackPatch)
            .eq('id', supabaseUserId);
          if (!fbErr) return true;
          if (isMissingColumnError(fbErr) && 'bio' in fallbackPatch) {
            knownMissingProfileColumns.add('bio');
            delete fallbackPatch.bio;
            if (Object.keys(fallbackPatch).length > 0) {
              const { error: minErr } = await supabase
                .from('profiles')
                .update(fallbackPatch)
                .eq('id', supabaseUserId);
              return !minErr;
            }
          }
        }
        return false;
      }
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Envoie un fichier / média (photo, vidéo <= 1 min, audio <= 1 min, document) vers Supabase Storage
 * et retourne uniquement son URL publique.
 */
export async function uploadBlobToSupabaseStorage(
  blobOrFile: Blob | File,
  folder = 'media',
  preferredFileName?: string,
  userId?: string
): Promise<string | null> {
  const res = await uploadBlobToSupabaseStorageDetailed(blobOrFile, folder, preferredFileName, userId);
  return res.publicUrl;
}

export async function uploadBlobToSupabaseStorageDetailed(
  blobOrFile: Blob | File,
  folder = 'media',
  preferredFileName?: string,
  userId?: string,
  preferredBucket?: string
): Promise<{ publicUrl: string | null; error?: string }> {
  if (!isSupabaseConfigured) {
    return { publicUrl: null, error: 'Supabase non configuré.' };
  }
  if (!blobOrFile || blobOrFile.size === 0) {
    return { publicUrl: null, error: 'Fichier vide ou invalide.' };
  }
  try {
    let ownerFolder = (userId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!ownerFolder) {
      const { data: sessionData } = await supabase.auth.getSession();
      ownerFolder = sessionData?.session?.user?.id || 'public';
    }
    const rawName = preferredFileName || (blobOrFile instanceof File ? blobOrFile.name : '') || 'media';
    const ext = getExtensionFromMimeOrName(blobOrFile.type || '', rawName);
    const safeBase =
      rawName
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 40) || 'file';
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '') || 'media';
    const objectPath = `${safeFolder}/${ownerFolder}/${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}_${safeBase}${ext}`;

    const bucketsToTry = Array.from(
      new Set([preferredBucket || SUPABASE_STORAGE_BUCKET, 'evasion', 'evasion-media'].filter(Boolean))
    );

    let lastError = "Échec de l'envoi vers Supabase Storage.";
    for (const bucket of bucketsToTry) {
      const { error } = await supabase.storage.from(bucket).upload(objectPath, blobOrFile, {
        contentType: blobOrFile.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: true,
      });

      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
        if (data?.publicUrl) {
          return { publicUrl: data.publicUrl };
        }
      } else {
        lastError = error.message || lastError;
        if (!/bucket.*not.*found|not found/i.test(lastError)) {
          break;
        }
      }
    }

    return { publicUrl: null, error: lastError };
  } catch (err) {
    return {
      publicUrl: null,
      error: err instanceof Error ? err.message : "Erreur lors de l'envoi vers Supabase Storage.",
    };
  }
}

export async function uploadAvatarToSupabaseEvasionBucket(
  blobOrFile: Blob | File,
  userId?: string,
  preferredFileName?: string
): Promise<{ publicUrl: string | null; error?: string }> {
  return uploadBlobToSupabaseStorageDetailed(
    blobOrFile,
    'avatars',
    preferredFileName || 'avatar.jpg',
    userId,
    'evasion'
  );
}
