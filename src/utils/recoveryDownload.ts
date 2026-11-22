import { buildUniverseUrl, resolveAnonymousShareSlug } from './universeUrl';

export function buildRecoverySheetText(params: {
  alias?: string;
  matricule?: string;
  userId: string;
  referralCode: string;
  publicShareSlug?: string;
}): string {
  const pseudoLabel =
    params.alias && params.alias !== 'Spectre En Quête'
      ? params.alias
      : params.matricule || 'Anonyme';
  const publicUrl = buildUniverseUrl(params.publicShareSlug || params.userId);
  const slug = resolveAnonymousShareSlug(params.publicShareSlug || params.userId);
  const dateStr = new Date().toLocaleDateString('fr-FR');

  return [
    '================================================',
    '  ÉVASION — FICHE SECRÈTE DE RÉCUPÉRATION',
    '================================================',
    `Date de génération : ${dateStr}`,
    `Pseudo / Profil    : ${pseudoLabel}${params.matricule ? ` (${params.matricule})` : ''}`,
    '',
    '--- IDENTIFIANTS CONFIDENTIELS (NE PAS PARTAGER) ---',
    `Code USR           : ${params.userId}`,
    `Code d'évasion     : ${params.referralCode}`,
    '',
    '--- LIEN PUBLIC ANONYME (SÛR POUR PARTAGE / QR) ---',
    `Slug public        : ${slug}`,
    `URL publique       : ${publicUrl}`,
    '',
    '⚠️ IMPORTANT ANTI-PIRATAGE :',
    "- Ne partage jamais ton Code USR ni ton Code d'évasion publiquement.",
    '- Conserve ton mot de passe en lieu sûr : il est requis pour',
    '  récupérer ton compte ou déflouter tes codes secrets.',
    '================================================',
  ].join('\n');
}

export function downloadRecoverySheet(params: {
  alias?: string;
  matricule?: string;
  userId: string;
  referralCode: string;
  publicShareSlug?: string;
}): void {
  const content = buildRecoverySheetText(params);
  const safeName = (params.alias && params.alias !== 'Spectre En Quête' ? params.alias : 'anonyme')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 24);
  const fileName = `evasion_codes_secrets_${safeName || 'anonyme'}.txt`;

  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch {
    // fallback if Blob download fails
    const dataUri = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = fileName;
    a.click();
  }
}
