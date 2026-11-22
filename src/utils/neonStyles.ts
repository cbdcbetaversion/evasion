import { CellFrame, NeonColor, AppTheme } from '../types';

export interface NeonPaletteItem {
  id: NeonColor;
  label: string;
  shortLabel: string;
  textClass: string;
  textLightClass: string;
  borderClass: string;
  bgClass: string;
  dotClass: string;
  avatarRingClass: string;
  frameGlowClass: string;
  hex: string;
}

export const NEON_PALETTE: NeonPaletteItem[] = [
  {
    id: 'emerald',
    label: 'Émeraude Néon',
    shortLabel: 'Émeraude',
    textClass: 'text-emerald-400 font-bold drop-shadow-[0_0_8px_rgba(16,185,129,0.75)]',
    textLightClass: 'text-emerald-600 font-bold drop-shadow-[0_0_6px_rgba(16,185,129,0.28)]',
    borderClass: 'border-emerald-400',
    bgClass: 'bg-emerald-500/20',
    dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]',
    avatarRingClass: 'border-2 border-emerald-400/80 ring-2 ring-emerald-400/25 shadow-[0_0_12px_rgba(16,185,129,0.35)]',
    frameGlowClass:
      'border-2 border-emerald-400/85 ring-2 ring-emerald-400/30 shadow-[0_0_26px_-4px_rgba(16,185,129,0.48)]',
    hex: '#34d399',
  },
  {
    id: 'red',
    label: 'Rouge Enfermement',
    shortLabel: 'Rouge',
    textClass: 'text-red-400 font-bold drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]',
    textLightClass: 'text-red-600 font-bold drop-shadow-[0_0_6px_rgba(239,68,68,0.28)]',
    borderClass: 'border-red-500',
    bgClass: 'bg-red-500/20',
    dotClass: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]',
    avatarRingClass: 'border-2 border-red-500/85 ring-2 ring-red-500/25 shadow-[0_0_12px_rgba(239,68,68,0.38)]',
    frameGlowClass:
      'border-2 border-red-500/85 ring-2 ring-red-500/30 shadow-[0_0_26px_-4px_rgba(239,68,68,0.48)]',
    hex: '#f87171',
  },
  {
    id: 'gold',
    label: 'Or Passe-Partout',
    shortLabel: 'Or',
    textClass: 'text-amber-400 font-bold drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]',
    textLightClass: 'text-amber-600 font-bold drop-shadow-[0_0_6px_rgba(245,158,11,0.28)]',
    borderClass: 'border-amber-400',
    bgClass: 'bg-amber-400/20',
    dotClass: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]',
    avatarRingClass: 'border-2 border-amber-400/85 ring-2 ring-amber-400/25 shadow-[0_0_12px_rgba(245,158,11,0.38)]',
    frameGlowClass:
      'border-2 border-amber-400/85 ring-2 ring-amber-400/30 shadow-[0_0_26px_-4px_rgba(245,158,11,0.48)]',
    hex: '#fbbf24',
  },
  {
    id: 'cyan',
    label: 'Cyan Cyber',
    shortLabel: 'Cyan',
    textClass: 'text-cyan-400 font-bold drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]',
    textLightClass: 'text-cyan-600 font-bold drop-shadow-[0_0_6px_rgba(6,182,212,0.28)]',
    borderClass: 'border-cyan-400',
    bgClass: 'bg-cyan-400/20',
    dotClass: 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)]',
    avatarRingClass: 'border-2 border-cyan-400/85 ring-2 ring-cyan-400/25 shadow-[0_0_12px_rgba(6,182,212,0.38)]',
    frameGlowClass:
      'border-2 border-cyan-400/85 ring-2 ring-cyan-400/30 shadow-[0_0_26px_-4px_rgba(6,182,212,0.5)]',
    hex: '#22d3ee',
  },
  {
    id: 'purple',
    label: 'Violet Clandestin',
    shortLabel: 'Violet',
    textClass: 'text-purple-400 font-bold drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]',
    textLightClass: 'text-purple-600 font-bold drop-shadow-[0_0_6px_rgba(168,85,247,0.28)]',
    borderClass: 'border-purple-400',
    bgClass: 'bg-purple-500/20',
    dotClass: 'bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.9)]',
    avatarRingClass: 'border-2 border-purple-400/85 ring-2 ring-purple-400/25 shadow-[0_0_12px_rgba(168,85,247,0.38)]',
    frameGlowClass:
      'border-2 border-purple-400/85 ring-2 ring-purple-400/30 shadow-[0_0_26px_-4px_rgba(168,85,247,0.5)]',
    hex: '#c084fc',
  },
  {
    id: 'pink',
    label: 'Rose Néon',
    shortLabel: 'Rose',
    textClass: 'text-pink-400 font-bold drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]',
    textLightClass: 'text-pink-600 font-bold drop-shadow-[0_0_6px_rgba(236,72,153,0.28)]',
    borderClass: 'border-pink-400',
    bgClass: 'bg-pink-500/20',
    dotClass: 'bg-pink-400 shadow-[0_0_8px_rgba(236,72,153,0.9)]',
    avatarRingClass: 'border-2 border-pink-400/85 ring-2 ring-pink-400/25 shadow-[0_0_12px_rgba(236,72,153,0.38)]',
    frameGlowClass:
      'border-2 border-pink-400/85 ring-2 ring-pink-400/30 shadow-[0_0_26px_-4px_rgba(236,72,153,0.5)]',
    hex: '#f472b6',
  },
];

export const NEON_MAP: Record<NeonColor, NeonPaletteItem> = NEON_PALETTE.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<NeonColor, NeonPaletteItem>
);

export const CELL_FRAME_OPTIONS: { id: CellFrame; label: string; desc: string }[] = [
  { id: 'none', label: 'Standard', desc: 'Bordure classique en acier' },
  { id: 'gold', label: 'Or Barbelé', desc: 'Cadre doré d’honneur' },
  { id: 'titanium', label: 'Titanium Brisé', desc: 'Aspect blindé haute résistance' },
  { id: 'neon', label: 'Néon Pulse', desc: 'Contour lumineux assorti au néon' },
  { id: 'hologram', label: 'Hologramme', desc: 'Effet cyber translucide' },
];

export function getNeonItem(color?: NeonColor): NeonPaletteItem {
  if (color && NEON_MAP[color]) {
    return NEON_MAP[color];
  }
  return NEON_MAP.emerald;
}

export function getNeonTextClass(color?: NeonColor, theme: AppTheme = 'dark'): string {
  const item = getNeonItem(color);
  return theme === 'light' ? item.textLightClass : item.textClass;
}

export function getNeonAvatarRingClass(color?: NeonColor, theme: AppTheme = 'dark'): string {
  if (color && NEON_MAP[color]) {
    return NEON_MAP[color].avatarRingClass;
  }
  return theme === 'dark' ? 'border border-zinc-700/70' : 'border border-zinc-300';
}

export function getCellFrameClasses(
  frame: CellFrame | undefined,
  neon: NeonColor | undefined,
  theme: AppTheme = 'dark'
): string {
  const activeNeon = getNeonItem(neon);
  switch (frame) {
    case 'gold':
      return 'border-2 border-amber-400/90 ring-2 ring-amber-400/30 shadow-[0_0_26px_-4px_rgba(245,158,11,0.48)]';
    case 'titanium':
      return 'border-2 border-slate-300/80 ring-2 ring-slate-400/30 shadow-[0_0_24px_-4px_rgba(148,163,184,0.42)]';
    case 'neon':
      return activeNeon.frameGlowClass;
    case 'hologram':
      return 'border-2 border-fuchsia-400/85 ring-2 ring-cyan-400/40 shadow-[0_0_28px_-4px_rgba(217,70,239,0.5)]';
    default:
      return theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200';
  }
}
