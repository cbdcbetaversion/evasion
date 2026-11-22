export type CatalogProductType =
  | 'keys_pack'
  | 'passe_partout'
  | 'neon_pack'
  | 'vip_sub'
  | 'kit'
  | 'storage_pack';

export type NeonColor = 'emerald' | 'red' | 'gold' | 'cyan' | 'purple' | 'pink';
export type CellFrame = 'none' | 'gold' | 'titanium' | 'neon' | 'hologram';

export const VALID_NEON_COLORS: ReadonlySet<NeonColor> = new Set([
  'emerald',
  'red',
  'gold',
  'cyan',
  'purple',
  'pink',
]);

export const VALID_CELL_FRAMES: ReadonlySet<CellFrame> = new Set([
  'none',
  'gold',
  'titanium',
  'neon',
  'hologram',
]);

export interface ServerCatalogProduct {
  id: string;
  name: string;
  type: CatalogProductType;
  amountEur: number;
  amountCents: number;
  keys?: number;
  padlocks?: number;
  storageSlots?: number;
  isStorageUnlimited?: boolean;
  isVip?: boolean;
  isVipSubscriber?: boolean;
  kitId?: string;
}

const STATIC_CATALOG: Record<string, ServerCatalogProduct> = {
  pack_keys_15: {
    id: 'pack_keys_15',
    name: 'Trousseau Clandestin (+15 Clés & +2 Cadenas)',
    type: 'keys_pack',
    amountEur: 1.99,
    amountCents: 199,
    keys: 15,
    padlocks: 2,
  },
  pack_vip_50: {
    id: 'pack_vip_50',
    name: 'Passe-Partout VIP (+50 Clés, +5 Cadenas & Cellule VIP)',
    type: 'keys_pack',
    amountEur: 4.99,
    amountCents: 499,
    keys: 50,
    padlocks: 5,
    isVip: true,
  },
  pack_dev_support: {
    id: 'pack_dev_support',
    name: 'Café des Développeurs (+10 Clés & +2 Cadenas)',
    type: 'keys_pack',
    amountEur: 2.50,
    amountCents: 250,
    keys: 10,
    padlocks: 2,
  },
  pack_donation_1: {
    id: 'pack_donation_1',
    name: 'Micro-Don de Soutien (+5 Clés & +1 Cadenas)',
    type: 'keys_pack',
    amountEur: 1.00,
    amountCents: 100,
    keys: 5,
    padlocks: 1,
  },
  pack_donation_5: {
    id: 'pack_donation_5',
    name: 'Don Libérateur VIP (+30 Clés, +5 Cadenas & Statut VIP)',
    type: 'keys_pack',
    amountEur: 5.00,
    amountCents: 500,
    keys: 30,
    padlocks: 5,
    isVip: true,
  },
  pack_donation_10: {
    id: 'pack_donation_10',
    name: 'Grand Donateur Mécène (+75 Clés, +10 Cadenas & Badge Mécène)',
    type: 'keys_pack',
    amountEur: 10.00,
    amountCents: 1000,
    keys: 75,
    padlocks: 10,
    isVip: true,
  },
  vip_esprit_libre_monthly: {
    id: 'vip_esprit_libre_monthly',
    name: 'Abonnement Quartier VIP · Esprit Libre',
    type: 'vip_sub',
    amountEur: 1.99,
    amountCents: 199,
    keys: 10,
    padlocks: 3,
    isVip: true,
    isVipSubscriber: true,
  },
  passe_partout_single: {
    id: 'passe_partout_single',
    name: 'Le « Passe-Partout » 24h',
    type: 'passe_partout',
    amountEur: 0.99,
    amountCents: 99,
    padlocks: 1,
  },
  neon_pack_custom: {
    id: 'neon_pack_custom',
    name: 'Pack « Style Néon »',
    type: 'neon_pack',
    amountEur: 0.50,
    amountCents: 50,
  },
  kit_detox_7days: {
    id: 'kit_detox_7days',
    name: "Kit d'Évasion : Détox Téléphone en 7 Jours",
    type: 'kit',
    amountEur: 2.99,
    amountCents: 299,
    kitId: 'kit_detox_7days',
  },
  kit_morning_routine: {
    id: 'kit_morning_routine',
    name: "Kit d'Évasion : Routine du Matin Anti-Déprime",
    type: 'kit',
    amountEur: 2.99,
    amountCents: 299,
    kitId: 'kit_morning_routine',
  },
  kit_business_zero_euro: {
    id: 'kit_business_zero_euro',
    name: "Kit d'Évasion : Premier Business à 0 € depuis son Smartphone",
    type: 'kit',
    amountEur: 7.99,
    amountCents: 799,
    kitId: 'kit_business_zero_euro',
  },
  pack_storage_50: {
    id: 'pack_storage_50',
    name: 'Extension Mémoire Univers (+50 Médias)',
    type: 'storage_pack',
    amountEur: 1.99,
    amountCents: 199,
    storageSlots: 50,
    keys: 2,
  },
  pack_storage_150: {
    id: 'pack_storage_150',
    name: 'Extension Mémoire Univers (+150 Médias)',
    type: 'storage_pack',
    amountEur: 3.99,
    amountCents: 399,
    storageSlots: 150,
    keys: 5,
    padlocks: 2,
  },
  pack_storage_unlimited: {
    id: 'pack_storage_unlimited',
    name: 'Mémoire Univers Illimitée ∞',
    type: 'storage_pack',
    amountEur: 7.99,
    amountCents: 799,
    isStorageUnlimited: true,
    keys: 10,
    padlocks: 5,
    isVip: true,
  },
};

export interface ResolvedCheckoutOrderSpec {
  product: ServerCatalogProduct;
  targetPostId?: string;
  neonColor?: NeonColor;
  cellFrame?: CellFrame;
}

export function resolveCatalogOrderSpec(input: {
  itemId?: unknown;
  targetPostId?: unknown;
  neonColor?: unknown;
  cellFrame?: unknown;
}): ResolvedCheckoutOrderSpec | null {
  const rawId = typeof input.itemId === 'string' ? input.itemId.trim().slice(0, 128) : '';
  if (!rawId) return null;

  if (STATIC_CATALOG[rawId]) {
    const product = STATIC_CATALOG[rawId];
    const candidateColor = (typeof input.neonColor === 'string' ? input.neonColor : '') as NeonColor;
    const candidateFrame = (typeof input.cellFrame === 'string' ? input.cellFrame : '') as CellFrame;
    return {
      product,
      targetPostId:
        product.type === 'passe_partout' && typeof input.targetPostId === 'string' && input.targetPostId.trim()
          ? input.targetPostId.trim().slice(0, 96)
          : undefined,
      ...(product.type === 'neon_pack'
        ? {
            neonColor: VALID_NEON_COLORS.has(candidateColor) ? candidateColor : 'emerald',
            cellFrame: VALID_CELL_FRAMES.has(candidateFrame) ? candidateFrame : 'neon',
          }
        : {}),
    };
  }

  // Handle kit_<kitId>
  if (rawId.startsWith('kit_kit_')) {
    const actualKitId = rawId.slice(4);
    if (STATIC_CATALOG[actualKitId]) {
      return { product: STATIC_CATALOG[actualKitId] };
    }
  }

  // Handle passe_partout_<postId>
  if (rawId.startsWith('passe_partout_')) {
    const postId =
      typeof input.targetPostId === 'string' && input.targetPostId.trim()
        ? input.targetPostId.trim().slice(0, 96)
        : rawId.slice('passe_partout_'.length).slice(0, 96);
    return {
      product: STATIC_CATALOG.passe_partout_single,
      targetPostId: postId || undefined,
    };
  }

  // Handle neon_pack_<color>_<frame>
  if (rawId.startsWith('neon_pack')) {
    const parts = rawId.split('_');
    const candidateColor = (typeof input.neonColor === 'string' ? input.neonColor : parts[2]) as NeonColor;
    const candidateFrame = (typeof input.cellFrame === 'string' ? input.cellFrame : parts[3]) as CellFrame;
    const neonColor: NeonColor = VALID_NEON_COLORS.has(candidateColor) ? candidateColor : 'emerald';
    const cellFrame: CellFrame = VALID_CELL_FRAMES.has(candidateFrame) ? candidateFrame : 'neon';
    return {
      product: STATIC_CATALOG.neon_pack_custom,
      neonColor,
      cellFrame,
    };
  }

  return null;
}
