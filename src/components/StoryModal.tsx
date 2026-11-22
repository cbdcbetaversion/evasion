import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  X,
  Download,
  Share2,
  Copy,
  Check,
  Send,
  MessageCircle,
  FileText,
  UserCheck,
} from 'lucide-react';
import QRCode from 'qrcode';
import { buildUniverseUrl, resolveAnonymousShareSlug } from '../utils/universeUrl';
import { ConfessionPost } from '../types';
import { useApp } from '../context/AppContext';
import { formatDayOrdinal } from '../utils/formatDays';

interface StoryModalProps {
  post?: ConfessionPost | null;
  isWallShare?: boolean;
  isOpen?: boolean;
  onClose: () => void;
}

export const StoryModal: React.FC<StoryModalProps> = ({
  post,
  isWallShare = false,
  isOpen = true,
  onClose,
}) => {
  const { user, showToast, theme } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [mediaPermissionGranted, setMediaPermissionGranted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('evasion_media_permission') === 'granted';
    } catch {
      return false;
    }
  });
  const [pendingPlatform, setPendingPlatform] = useState<string | null>(null);
  const [mode, setMode] = useState<'post' | 'wall'>(
    isWallShare || !post ? 'wall' : 'post'
  );
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isWallShare || !post) {
      setMode('wall');
    } else {
      setMode('post');
    }
  }, [post, isWallShare]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : 'https://evasion.app';

  // Draw the high-res 9:16 vertical Story Canvas (1080 x 1920)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setDownloadUrl(null);

    const renderCanvas = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dimensions: 9:16 vertical story format (1080 x 1920)
      canvas.width = 1080;
      canvas.height = 1920;

      const isWallMode = mode === 'wall' || !post;
      const isEscaped = !isWallMode && post ? (post.status === 'escaped' || post.keysCount >= post.keysRequired) : false;

      // 1. Dark atmospheric background
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, 1080, 1920);

      // 2. Subtle prison bars vertical pattern
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      for (let x = 60; x < 1080; x += 60) {
        ctx.fillRect(x, 0, 6, 1920);
      }

      // 3. Radial ambient glow
      const grad = ctx.createRadialGradient(
        540,
        isWallMode ? 700 : isEscaped ? 600 : 960,
        120,
        540,
        isWallMode ? 700 : isEscaped ? 600 : 960,
        820
      );

      if (isWallMode) {
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
        grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.15)');
        grad.addColorStop(1, 'rgba(9, 9, 11, 0)');
      } else if (isEscaped) {
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
        grad.addColorStop(1, 'rgba(9, 9, 11, 0)');
      } else {
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
        grad.addColorStop(1, 'rgba(9, 9, 11, 0)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // 4. Header Brand Tag
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ef4444';
      ctx.font = '900 46px "JetBrains Mono", monospace';
      ctx.fillText('ÉVASION // RÉVOLTE ANTI-DOPAMINE', 540, 200);

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '600 28px "JetBrains Mono", monospace';
      ctx.fillText('RÉSEAU SOCIAL SANS ALGORITHME NI PARFAITE ILLUSION', 540, 250);

      // 5. Inmate Card Box
      ctx.fillStyle = 'rgba(24, 24, 27, 0.92)';
      ctx.strokeStyle = isWallMode
        ? '#ef4444'
        : isEscaped
        ? '#10b981'
        : '#f59e0b';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(90, 320, 900, 1260, 48);
      ctx.fill();
      ctx.stroke();

      if (isWallMode) {
        // === MODE MON MUR PERSONNEL ===
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 42px "JetBrains Mono", monospace';
        ctx.fillText('📋 FICHE OFFICIELLE DU DÉTENU', 540, 420);

        // Inmate avatar
        ctx.font = '110px "Outfit", sans-serif';
        ctx.fillText(user.avatar, 540, 560);

        // Matricule
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 70px "Outfit", sans-serif';
        ctx.fillText(`${user.matricule}`, 540, 660);

        // Alias
        ctx.fillStyle = '#f59e0b';
        ctx.font = '600 44px "Outfit", sans-serif';
        ctx.fillText(`« ${user.alias} »`, 540, 725);

        ctx.fillStyle = '#71717a';
        ctx.font = '500 32px "JetBrains Mono", monospace';
        ctx.fillText(`Affecté à ${user.cellNumber} · ${formatDayOrdinal(user.detentionDays || 1)} en détention`, 540, 780);

        // Divider
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(180, 830);
        ctx.lineTo(900, 830);
        ctx.stroke();

        // Punchy Rebel Quote
        ctx.fillStyle = '#f4f4f5';
        ctx.font = '600 44px "Outfit", sans-serif';
        ctx.fillText('« Prisonnier de ma routine et des écrans.', 540, 920);
        ctx.fillText('Viens m\'apporter des clés sur mon Mur', 540, 985);
        ctx.fillText('pour briser mes barreaux collectivement ! »', 540, 1050);

        // Stats 3 columns container
        ctx.fillStyle = 'rgba(9, 9, 11, 0.8)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(160, 1120, 760, 180, 24);
        ctx.fill();
        ctx.stroke();

        // Column 1: Escapes
        ctx.fillStyle = '#10b981';
        ctx.font = '900 52px "JetBrains Mono", monospace';
        ctx.fillText(`${user.escapedCount}`, 290, 1200);
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '500 24px "JetBrains Mono", monospace';
        ctx.fillText('ÉVASIONS', 290, 1250);

        // Column 2: Keys Given
        ctx.fillStyle = '#f59e0b';
        ctx.font = '900 52px "JetBrains Mono", monospace';
        ctx.fillText(`${user.keysGivenTotal}`, 540, 1200);
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '500 24px "JetBrains Mono", monospace';
        ctx.fillText('CLÉS DONNÉES', 540, 1250);

        // Column 3: Badges
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 52px "JetBrains Mono", monospace';
        ctx.fillText(`${user.badges.length}`, 790, 1200);
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '500 24px "JetBrains Mono", monospace';
        ctx.fillText('BADGES ACQUIS', 790, 1250);

        // Opaque anonymous share slug highlight (never exposes USR or Escape Code)
        const anonSlug = resolveAnonymousShareSlug(user.publicShareSlug || user.id);
        ctx.fillStyle = '#fef08a';
        ctx.font = '800 34px "JetBrains Mono", monospace';
        ctx.fillText(`LIEN ANONYME : ${anonSlug}`, 540, 1380);

        ctx.fillStyle = '#9ca3af';
        ctx.font = '500 26px "Outfit", sans-serif';
        ctx.fillText('Scanne ou ouvre ce lien pour visiter mon espace public', 540, 1420);
      } else if (post) {
        // === MODE AVEU SPÉCIFIQUE ===
        ctx.fillStyle = isEscaped ? '#10b981' : '#ef4444';
        ctx.font = '900 46px "JetBrains Mono", monospace';
        ctx.fillText(
          isEscaped ? '🔓 DOSSIER D\'ÉVASION CONFIRMÉE' : '🔒 AVIS DE RECHERCHE DE CLÉS',
          540,
          420
        );

        // Author matricule & alias
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 68px "Outfit", sans-serif';
        ctx.fillText(`${post.authorMatricule}`, 540, 530);

        if (post.authorAlias) {
          ctx.fillStyle = '#a1a1aa';
          ctx.font = '500 40px "Outfit", sans-serif';
          ctx.fillText(`« ${post.authorAlias} »`, 540, 600);
        }

        // Divider line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(180, 670);
        ctx.lineTo(900, 670);
        ctx.stroke();

        // Confession text word wrap
        ctx.fillStyle = '#f4f4f5';
        ctx.font = '500 48px "Outfit", sans-serif';
        ctx.textAlign = 'center';

        const words = post.content.split(' ');
        let line = '';
        const lines: string[] = [];
        const maxWidth = 760;

        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            lines.push(line);
            line = words[i] + ' ';
          } else {
            line = testLine;
          }
        }
        lines.push(line);

        const startY = 770;
        const lineHeight = 68;
        lines.slice(0, 6).forEach((l, idx) => {
          ctx.fillText(l.trim(), 540, startY + idx * lineHeight);
        });

        // Key progress indicator inside card
        const barY = 1260;
        ctx.fillStyle = isEscaped ? '#34d399' : '#f59e0b';
        ctx.font = '700 40px "JetBrains Mono", monospace';
        ctx.fillText(
          isEscaped
            ? `${post.keysRequired} / ${post.keysRequired} CLÉS OBTENUES · LIBERTÉ RETROUVÉE`
            : `JAUGE : ${post.keysCount} / ${post.keysRequired} CLÉS (IL EN MANQUE ${Math.max(
                0,
                post.keysRequired - post.keysCount
              )})`,
          540,
          barY
        );

        // Draw progress bar
        ctx.fillStyle = '#27272a';
        ctx.beginPath();
        ctx.roundRect(240, barY + 25, 600, 22, 11);
        ctx.fill();

        ctx.fillStyle = isEscaped ? '#10b981' : '#f59e0b';
        ctx.beginPath();
        const progressRatio = Math.min(1, post.keysCount / post.keysRequired);
        ctx.roundRect(240, barY + 25, 600 * progressRatio, 22, 11);
        ctx.fill();
      }

      // QR Code Rendering (uses opaque profil-anonyme-... URL)
      try {
        const anonSlug = resolveAnonymousShareSlug(user.publicShareSlug || user.id);
        const qrPayload = buildUniverseUrl(anonSlug);
        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
          margin: 1,
          width: 320,
          errorCorrectionLevel: 'H',
          color: { dark: '#09090b', light: '#ffffff' },
        });

        const qrImg = new Image();
        let qrLoaded = false;
        await new Promise<void>((resolve) => {
          qrImg.onload = () => {
            qrLoaded = true;
            resolve();
          };
          qrImg.onerror = () => resolve();
          qrImg.src = qrDataUrl;
        });

        if (cancelled) return;

        if (qrLoaded) {
          const qrSize = 140;
          const qrX = 540 - qrSize / 2;
          const qrY = isWallMode ? 1445 : 1335;

          // Crisp white background card for QR Code scannability
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 16);
          ctx.fill();

          ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

          ctx.fillStyle = '#f59e0b';
          ctx.font = '800 24px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`SCANNE MOI · ${anonSlug}`, 540, qrY + qrSize + 30);
        }
      } catch {
        // ignore
      }

      if (cancelled) return;

      // Call to Action bottom footer
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 42px "Outfit", sans-serif';
      ctx.fillText('Scanne le QR Code ou ouvre le lien pour me libérer', 540, 1720);

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '600 30px "JetBrains Mono", monospace';
      ctx.fillText('APP.EVASION.REVOLT · #PROJETEVASION', 540, 1780);

      // Save download URL
      if (!cancelled) {
        setDownloadUrl(canvas.toDataURL('image/png'));
      }
    };

    void renderCanvas();
    return () => {
      cancelled = true;
    };
  }, [post, mode, isOpen, user]);

  const shareText = useMemo(() => {
    const anonUrl = buildUniverseUrl(user.publicShareSlug || user.id);
    if (mode === 'wall' || !post) {
      return `🚨 Retrouve mon espace anonyme (${user.matricule}) et aide-moi à me libérer de mes écrans sur ÉVASION : ${anonUrl}`;
    }
    return `🚨 Aveu de ${post.authorMatricule} sur ÉVASION : "${post.content.slice(0, 100)}..." Viens lui donner une clé pour briser ses barreaux !`;
  }, [mode, post, user.publicShareSlug, user.id, user.matricule]);

  // ALL HOOKS ARE ABOVE THIS LINE. NOW SAFE TO DO CONDITIONAL RETURN.
  if (!isOpen) return null;

  const fileName = `evasion_${mode === 'wall' ? 'mon_mur' : (post?.authorMatricule || 'post').replace(/[^a-zA-Z0-9]/g, '_')}_9x16.png`;

  // Convert dataURL synchronously to File so iOS Safari / Android preserves user gesture for navigator.share
  const getStoryFileSync = (): File | null => {
    if (!downloadUrl) return null;
    try {
      const parts = downloadUrl.split(',');
      const byteString = atob(parts[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: 'image/png' });
      return new File([blob], fileName, { type: 'image/png' });
    } catch {
      return null;
    }
  };

  // Trigger direct file download + native mobile Save/Share sheet (preserving user gesture)
  const executeSaveAndShare = async (platformLabel?: string) => {
    if (!downloadUrl) {
      showToast({
        title: 'Préparation de l’image...',
        message: 'Patiente une seconde pendant la génération du visuel.',
        type: 'info',
      });
      return;
    }

    const file = getStoryFileSync();

    // 1. Always trigger standard file download synchronously (15s safe revoke timeout for mobile/Safari)
    try {
      const blobUrl = file ? URL.createObjectURL(file) : downloadUrl;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (file) {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      }
    } catch {
      // ignore
    }

    // 2. Invoke native File Share sheet synchronously BEFORE any async clipboard calls so iOS Safari keeps user activation
    let sharedNatively = false;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'ÉVASION - Story 9:16',
          text: `${shareText}\n${shareUrl}`,
        });
        sharedNatively = true;
      } catch {
        // User cancelled or download-only completed
      }
    }

    // 3. Copy caption + link after share/download
    try {
      navigator.clipboard?.writeText(`${shareText}\n${shareUrl}\n#ProjetEvasion #AntiDopamine`).catch(() => {});
    } catch {
      // ignore clipboard restriction
    }

    showToast({
      title: sharedNatively
        ? platformLabel
          ? `Prêt pour ${platformLabel} ! 📸`
          : 'Enregistré dans le téléphone ! 📲'
        : platformLabel
        ? `Image téléchargée pour ${platformLabel} ! 📸`
        : 'Image téléchargée dans ton téléphone ! 📲',
      message: sharedNatively
        ? 'Image 9:16 partagée et légende copiée dans le presse-papier !'
        : 'Image 9:16 enregistrée + texte copié. Sur iPhone, tu peux aussi maintenir appuyé sur l\'image → "Enregistrer dans Photos".',
      icon: '✨',
      type: 'success',
    });
  };

  // Request permission if not granted yet, then execute save/share
  const handleProtectedDownloadOrShare = (platformLabel?: string) => {
    if (!mediaPermissionGranted) {
      setPendingPlatform(platformLabel || 'Téléphone');
      return;
    }
    executeSaveAndShare(platformLabel);
  };

  const confirmMediaPermissionAndDownload = () => {
    try {
      localStorage.setItem('evasion_media_permission', 'granted');
    } catch {
      // ignore
    }
    setMediaPermissionGranted(true);
    const target = pendingPlatform === 'Téléphone' ? undefined : (pendingPlatform || undefined);
    setPendingPlatform(null);
    executeSaveAndShare(target);
  };

  // Action: WhatsApp
  const handleWhatsAppShare = () => {
    handleProtectedDownloadOrShare('WhatsApp');
  };

  // Action: X (Twitter)
  const handleTwitterShare = () => {
    handleProtectedDownloadOrShare('X / Twitter');
  };

  const handleCopyLink = () => {
    try {
      navigator.clipboard?.writeText(shareUrl)?.catch(() => {});
    } catch {
      // ignore clipboard errors
    }
    setCopiedLink(true);
    showToast({
      title: 'Lien copié dans le presse-papier ! 📋',
      message: 'Colle-le en story ou envoie-le à tes potes pour récolter des clés.',
      icon: '🔗',
      type: 'success',
    });
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div
        className={`relative w-full max-w-sm sm:max-w-md rounded-3xl p-4 sm:p-5 shadow-2xl border flex flex-col my-auto transition-colors ${
          theme === 'dark'
            ? 'bg-zinc-900 border-zinc-800 text-white'
            : 'bg-white border-zinc-200 text-zinc-900 shadow-xl'
        }`}
      >
        {/* Top Header & Close */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-red-600/10 border border-red-500/30 flex items-center justify-center text-red-500">
              <Share2 className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <span>Télécharger & Partager</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 font-bold">
                  Story 9:16
                </span>
              </h3>
              <p className={`text-[11px] font-mono ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Instagram, Reels, Snapchat, WhatsApp & Galerie
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              theme === 'dark'
                ? 'bg-zinc-800 text-zinc-400 hover:text-white'
                : 'bg-zinc-100 text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Permission Request Banner (when user clicks to download/share for the first time) */}
        {pendingPlatform && (
          <div className="my-3 p-3.5 rounded-2xl bg-indigo-950/90 border-2 border-indigo-500 text-white space-y-2.5 animate-fade-in shadow-xl">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0">📲</span>
              <div className="text-xs leading-relaxed">
                <div className="font-black text-indigo-300 uppercase font-mono text-[11px] mb-0.5">
                  Autorisation d'enregistrement (Photos & Fichiers)
                </div>
                Autoriser <strong>ÉVASION</strong> à télécharger et enregistrer cette image haute définition dans ton téléphone pour la publier sur <strong>{pendingPlatform}</strong> (Instagram, Reels, Snapchat, WhatsApp) ?
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={confirmMediaPermissionAndDownload}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs transition-all active:scale-95 cursor-pointer"
              >
                ✓ Autoriser & Enregistrer dans le tél
              </button>
              <button
                type="button"
                onClick={() => setPendingPlatform(null)}
                className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Mode Selector (Post vs Wall) if post is provided */}
        {post && (
          <div className="flex items-center p-1 rounded-xl bg-zinc-950/80 border border-zinc-800 my-2.5">
            <button
              onClick={() => setMode('post')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                mode === 'post'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ce Post</span>
            </button>
            <button
              onClick={() => setMode('wall')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                mode === 'wall'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Mon Mur Complet</span>
            </button>
          </div>
        )}

        {/* Live Canvas + Long-pressable Image Preview for iOS/Android */}
        <div
          className={`my-2 p-2 rounded-2xl border flex flex-col items-center justify-center overflow-hidden max-h-[42vh] relative ${
            theme === 'dark' ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-900 border-zinc-300'
          }`}
        >
          <canvas
            ref={canvasRef}
            className={downloadUrl ? 'hidden' : 'w-full max-h-[38vh] object-contain rounded-xl shadow-lg'}
          />
          {downloadUrl && (
            <img
              src={downloadUrl}
              alt=""
              className="w-full max-h-[36vh] object-contain rounded-xl shadow-lg select-auto"
            />
          )}
          <div className="text-[10px] font-mono text-zinc-400 mt-1 text-center">
            💡 Astuce mobile : clique sur Télécharger ou maintiens l'image appuyée → « Enregistrer dans Photos »
          </div>
        </div>

        {/* Direct Download to Phone Primary Button */}
        <button
          type="button"
          onClick={() => handleProtectedDownloadOrShare()}
          className="w-full py-3 px-4 mb-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all active:scale-95 cursor-pointer"
        >
          <Download className="w-4 h-4 stroke-[2.5]" />
          <span>📥 Télécharger dans mon Téléphone (Galerie / Photos)</span>
        </button>

        {/* 1-Tap Direct Social Sharing Grid */}
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between px-0.5">
            <span>Exporter pour tes réseaux :</span>
            <span className="text-[10px] text-amber-500 font-bold">Image + Légende auto</span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {/* Instagram */}
            <button
              type="button"
              onClick={() => handleProtectedDownloadOrShare('Instagram')}
              className="p-2 rounded-xl bg-gradient-to-br from-purple-600 via-pink-600 to-amber-500 text-white flex flex-col items-center justify-center gap-1 hover:opacity-95 transition-all active:scale-95 shadow-xs cursor-pointer"
              title="Télécharger et partager sur Instagram"
            >
              <span className="text-base">📸</span>
              <span className="text-[9px] font-bold">Instagram</span>
            </button>

            {/* Reels / Shorts */}
            <button
              type="button"
              onClick={() => handleProtectedDownloadOrShare('Reels / Shorts')}
              className="p-2 rounded-xl bg-zinc-950 hover:bg-black text-white border border-zinc-700 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-xs cursor-pointer"
              title="Télécharger et partager en vidéo courte"
            >
              <span className="text-base">🎬</span>
              <span className="text-[9px] font-bold">Reels</span>
            </button>

            {/* Snapchat */}
            <button
              type="button"
              onClick={() => handleProtectedDownloadOrShare('Snapchat')}
              className="p-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-zinc-950 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-xs cursor-pointer"
              title="Télécharger et partager sur Snapchat"
            >
              <span className="text-base">👻</span>
              <span className="text-[9px] font-black">Snapchat</span>
            </button>

            {/* WhatsApp */}
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-xs cursor-pointer"
              title="Envoyer sur WhatsApp"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-[9px] font-bold">WhatsApp</span>
            </button>

            {/* X / Twitter */}
            <button
              type="button"
              onClick={handleTwitterShare}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-xs cursor-pointer"
              title="Publier sur X (Twitter)"
            >
              <span className="text-base font-bold">𝕏</span>
              <span className="text-[9px] font-bold">Twitter</span>
            </button>
          </div>

          {/* Copy Link Footer Bar */}
          <button
            type="button"
            onClick={handleCopyLink}
            className={`w-full py-2 px-3 rounded-xl border text-[11px] font-mono flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedLink ? 'Lien copié !' : 'Copier le lien direct'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
