export interface YearlyTheme {
  year: number;
  title: string;
  tagline: string;
  badge: string;
  heroImage: string;
  sanctuaryImage: string;
  quote: string;
  accentColor: string;
  daysUntilNextYear: number;
}

export const YEARLY_THEMES: Record<number, Omit<YearlyTheme, 'daysUntilNextYear'>> = {
  2025: {
    year: 2025,
    title: "L'Éveil Clandestin",
    tagline: "Les premiers barreaux sciés dans l'ombre des algorithmes.",
    badge: "Édition Fondatrice 2025",
    heroImage: "/assets/images/evasion_insignia_key_1794476800390.jpg",
    sanctuaryImage: "/assets/images/evasion_detox_sanctuary_1794476801246.jpg",
    quote: "« C'est dans le silence que naît la première étincelle de libération. »",
    accentColor: "from-amber-950/60 via-zinc-950 to-black",
  },
  2026: {
    year: 2026,
    title: "Libération Collective",
    tagline: "Ici, personne ne triche. On se libère ensemble.",
    badge: "Édition 2026",
    heroImage: "/assets/images/evasion_hero_rebellion_1794476799526.jpg",
    sanctuaryImage: "/assets/images/evasion_detox_sanctuary_1794476801246.jpg",
    quote: "« Chaque clé offerte brise une chaîne invisible du scroll toxique. »",
    accentColor: "from-[#2a1010]/90 via-[#120c0c] to-[#090707]",
  },
  2027: {
    year: 2027,
    title: "Renaissance & Nature",
    tagline: "La lumière du matin retrouvée, loin du reflet bleu des écrans.",
    badge: "Édition Nature 2027",
    heroImage: "/assets/images/sanctuary_nature_2027_1794480886998.jpg",
    sanctuaryImage: "/assets/images/sanctuary_nature_2027_1794480886998.jpg",
    quote: "« Retrouve la clarté d'un esprit reposé dans le calme du monde réel. »",
    accentColor: "from-emerald-950/60 via-zinc-950 to-black",
  },
  2028: {
    year: 2028,
    title: "L'Envol & Horizon Libre",
    tagline: "Les portes sont ouvertes, les chaînes sont tombées pour de bon.",
    badge: "Édition Horizon 2028",
    heroImage: "/assets/images/hero_horizon_2028_1794480903505.jpg",
    sanctuaryImage: "/assets/images/sanctuary_nature_2027_1794480886998.jpg",
    quote: "« Vole plus haut que leurs notifications. Ta vie t'appartient. »",
    accentColor: "from-amber-950/60 via-orange-950/40 to-black",
  },
};

/**
 * Calcule le nombre exact de jours restants jusqu'au 1er janvier de l'année suivante.
 */
function getDaysUntilNextYear(): number {
  const now = new Date();
  const nextYear = new Date(now.getFullYear() + 1, 0, 1);
  const diffTime = nextYear.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

/**
 * Retourne le thème visuel annuel actif.
 * Rotation automatique chaque 1er janvier selon l'année en cours (ou override utilisateur).
 */
export function getYearlyTheme(overrideYear?: number): YearlyTheme {
  const currentYear = overrideYear || new Date().getFullYear();
  const days = getDaysUntilNextYear();

  // If exact year exists, use it
  if (YEARLY_THEMES[currentYear]) {
    return {
      ...YEARLY_THEMES[currentYear],
      daysUntilNextYear: days,
    };
  }

  // Cyclical fallback for any future year (2029, 2030, etc.)
  const years = Object.keys(YEARLY_THEMES).map(Number).sort((a, b) => a - b);
  const index = Math.abs(currentYear) % years.length;
  const baseTheme = YEARLY_THEMES[years[index]];

  return {
    ...baseTheme,
    year: currentYear,
    title: `${baseTheme.title} (An ${currentYear})`,
    badge: `Édition Annuelle ${currentYear}`,
    daysUntilNextYear: days,
  };
}
