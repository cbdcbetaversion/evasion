/**
 * Formate le numéro de jour avec l'ordinal exact en français :
 * 1 -> "1er jour"
 * 2 -> "2ème jour"
 * 3 -> "3ème jour"
 * N -> "Nème jour"
 */
export function formatDayOrdinal(day: number): string {
  const d = Math.max(1, Math.floor(day || 1));
  if (d === 1) return '1er jour';
  return `${d}ème jour`;
}

/**
 * Format ultra-compact pour les en-têtes et badges mobiles :
 * 1 -> "J1"
 * 2 -> "J2"
 */
export function formatDayCompact(day: number): string {
  const d = Math.max(1, Math.floor(day || 1));
  return `J${d}`;
}
