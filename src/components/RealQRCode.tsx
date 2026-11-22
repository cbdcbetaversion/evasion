import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Copy, Check, QrCode, Link2, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buildUniverseUrl, resolveAnonymousShareSlug } from '../utils/universeUrl';

interface RealQRCodeProps {
  id: string;
  shareSlug?: string;
  size?: number;
  label?: string;
  showActions?: boolean;
  className?: string;
  payloadUrl?: string;
}

export const RealQRCode: React.FC<RealQRCodeProps> = ({
  id,
  shareSlug,
  size = 180,
  label = 'Espace Perso',
  showActions = true,
  className = '',
  payloadUrl,
}) => {
  const { showToast, theme } = useApp();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const anonSlug = resolveAnonymousShareSlug(shareSlug || id);
  const qrPayload = payloadUrl || buildUniverseUrl(anonSlug);

  useEffect(() => {
    let isMounted = true;

    QRCode.toDataURL(
      qrPayload,
      {
        width: 512,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#09090b',
          light: '#ffffff',
        },
      },
      (err, url) => {
        if (!err && url && isMounted) {
          setDataUrl(url);
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [qrPayload]);

  const handleDownload = async () => {
    if (!dataUrl) return;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `qrcode_${anonSlug}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);

      showToast({
        title: 'QR Code enregistré',
        message: 'QR Code anonyme sauvegardé (aucun identifiant privé inclus).',
        icon: '✅',
        type: 'success',
      });
    } catch {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `qrcode_${anonSlug}.png`;
      a.target = '_blank';
      a.click();
    }
  };

  const copyText = async (val: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(val);
    } else {
      const input = document.createElement('textarea');
      input.value = val;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
  };

  const handleCopySlug = async () => {
    try {
      await copyText(anonSlug);
      setCopiedSlug(true);
      showToast({
        title: 'Lien anonyme copié',
        message: `${anonSlug} copié dans le presse-papier.`,
        icon: '🔗',
        type: 'success',
      });
      setTimeout(() => setCopiedSlug(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyUrl = async () => {
    try {
      await copyText(qrPayload);
      setCopiedLink(true);
      showToast({
        title: 'URL anonyme copiée !',
        message: qrPayload,
        icon: '🔗',
        type: 'success',
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`flex flex-col items-center p-4 rounded-2xl border transition-all ${
        theme === 'dark'
          ? 'bg-zinc-950/90 border-zinc-800 shadow-inner'
          : 'bg-white border-zinc-200 shadow-xs'
      } ${className}`}
    >
      {/* Header Label (Opaque anonymous slug — never exposes USR_) */}
      <div className="flex items-center justify-between w-full mb-3 px-1 text-xs font-mono gap-2">
        <span className="flex items-center gap-1.5 font-bold text-amber-400 truncate">
          <QrCode className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono shrink-0">
          <ShieldCheck className="w-3 h-3" />
          <span>Anonyme</span>
        </span>
      </div>

      {/* QR Code Canvas/Image */}
      <div className="relative p-3 rounded-2xl bg-white border border-zinc-200 shadow-sm flex items-center justify-center overflow-hidden group">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`QR Code ${anonSlug}`}
            style={{ width: size, height: size }}
            className="block rounded-lg transition-transform group-hover:scale-102"
          />
        ) : (
          <div
            style={{ width: size, height: size }}
            className="flex items-center justify-center text-xs text-zinc-400 font-mono animate-pulse"
          >
            Génération...
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-7 h-7 rounded-lg bg-red-600 text-white font-black flex items-center justify-center text-xs border-2 border-white shadow-md">
            É
          </div>
        </div>
      </div>

      {/* Personal Space Public Anonymous URL Display */}
      <div
        className={`mt-3.5 w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border ${
          theme === 'dark' ? 'bg-zinc-900/70 border-zinc-800/80' : 'bg-zinc-50 border-zinc-200'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1">
            <Link2 className="w-2.5 h-2.5 text-cyan-400" />
            <span>URL Profil Anonyme</span>
          </div>
          <div
            className={`text-[11px] font-mono font-bold truncate select-all ${
              theme === 'dark' ? 'text-cyan-300' : 'text-cyan-700'
            }`}
          >
            {qrPayload}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyUrl}
          title="Copier l'URL anonyme"
          aria-label="Copier l'URL du profil anonyme"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
            theme === 'dark'
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
              : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
          }`}
        >
          {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Public Slug row */}
      <div className="mt-2 w-full flex items-center justify-between gap-2 px-2 text-[11px] font-mono text-zinc-400">
        <span className="truncate">
          Lien : <strong className="text-emerald-400">{anonSlug}</strong>
        </span>
        <button
          type="button"
          onClick={handleCopySlug}
          className="text-[10px] hover:text-white underline underline-offset-2 cursor-pointer shrink-0"
        >
          {copiedSlug ? 'Copié ✓' : 'Copier lien'}
        </button>
      </div>

      {/* Action buttons */}
      {showActions && (
        <div className="grid grid-cols-2 gap-2 w-full mt-3 pt-3 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={handleDownload}
            className={`min-h-[38px] py-1.5 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-800'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-red-500" />
            <span>Enregistrer QR</span>
          </button>

          <button
            type="button"
            onClick={handleCopyUrl}
            className={`min-h-[38px] py-1.5 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-800'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
            }`}
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Link2 className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>{copiedLink ? 'URL copiée ✓' : 'Copier URL'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
