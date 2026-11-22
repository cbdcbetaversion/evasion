export function formatUniverseId(id: string): string {
  const raw = (id || '').trim();
  if (!raw) return 'USR_00000';
  if (/^USR_/i.test(raw)) {
    return `USR_${raw.slice(4).toUpperCase()}`;
  }
  return `USR_${raw.replace(/^usr_|^inmate_/i, '').toUpperCase()}`;
}

export function resolveAnonymousShareSlug(shareSlugOrId?: string): string {
  const raw = (shareSlugOrId || '').trim();
  if (/^profil-anonyme-[a-z0-9-]+$/i.test(raw)) {
    return raw.toLowerCase();
  }
  // Never leak raw USR_ IDs into share URLs: derive an opaque fallback slug if server slug hasn't synced yet
  let acc = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    acc ^= raw.charCodeAt(i);
    acc = Math.imul(acc, 16777619);
  }
  const suffix = (acc >>> 0).toString(36).padStart(6, 'x').slice(0, 6);
  return `profil-anonyme-${suffix}`;
}

export function buildUniverseUrl(shareSlugOrId: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://evasion.app';
  const slug = resolveAnonymousShareSlug(shareSlugOrId);
  return `${origin}/?univers=${encodeURIComponent(slug)}`;
}

export function extractUniverseIdentifierFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromSearch =
      params.get('univers') || params.get('universe') || params.get('u') || params.get('profile');
    if (fromSearch && fromSearch.trim()) {
      return fromSearch.trim();
    }

    const hash = (window.location.hash || '').replace(/^#/, '');
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const fromHash =
        hashParams.get('univers') || hashParams.get('inmate') || hashParams.get('u');
      if (fromHash && fromHash.trim()) {
        return fromHash.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function clearUniverseQueryFromLocation(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    for (const key of ['univers', 'universe', 'u', 'profile']) {
      if (params.has(key)) {
        params.delete(key);
        changed = true;
      }
    }
    const rawHash = window.location.hash || '';
    const clearHash = /^#(univers|inmate|u)=/i.test(rawHash);
    if (changed || clearHash) {
      const remaining = params.toString();
      const nextUrl = remaining ? `${window.location.pathname}?${remaining}` : window.location.pathname;
      window.history.replaceState({}, '', nextUrl);
    }
  } catch {
    // ignore history errors
  }
}
