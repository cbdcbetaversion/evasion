import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, MoreVertical, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useApp } from '../context/AppContext';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { authToken, user } = useApp();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideTab, setGuideTab] = useState<'ios' | 'android'>(() => (isIOS ? 'ios' : 'android'));

  useEffect(() => {
    if (isIOS) setGuideTab('ios');
  }, [isIOS]);

  if (isInstalled) {
    return null;
  }

  const syncManifestSessionHandoff = () => {
    try {
      const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (!manifestLink) return;
      const params = new URLSearchParams();
      if (authToken) params.set('token', authToken);
      if (user?.supabaseUserId) params.set('sb_uid', user.supabaseUserId);
      const qs = params.toString();
      manifestLink.href = qs ? `/api/manifest.webmanifest?${qs}` : '/manifest.webmanifest';
    } catch {
      // ignore
    }
  };

  const handleClick = async () => {
    syncManifestSessionHandoff();
    if (isInstallable) {
      const ok = await install();
      if (ok) return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`touch-manipulation flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all active:scale-95 cursor-pointer shadow-xs ${
          compact ? 'px-2.5 py-1.5 text-[11px] font-mono' : 'px-3.5 py-2 text-xs font-mono'
        }`}
        title="Intégrer l'application sur l'écran d'accueil pour mieux recevoir les notifications"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{compact ? 'Écran d’accueil' : "Ajouter à l'écran d'accueil"}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl bg-[#09090b] border border-zinc-800 text-zinc-100 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/40 text-red-400 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    Intégrer sur ton Écran d’accueil
                  </h3>
                  <p className="text-[11px] font-mono text-emerald-400">
                    Pour mieux recevoir les notifications sur ton téléphone
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-8 h-8 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-mono text-zinc-400 leading-relaxed">
              En ajoutant <strong className="text-white">ÉVASION</strong> à ton écran d’accueil, l’application s’ouvre en plein écran, conserve ton compte et tes données même hors ligne, et reçoit les notifications en temps réel comme une application native.
            </p>

            {/* Sélecteur iPhone / Android */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setGuideTab('ios')}
                className={`py-2 px-3 rounded-lg font-bold transition-all cursor-pointer ${
                  guideTab === 'ios'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                🍎 iPhone / iPad
              </button>
              <button
                type="button"
                onClick={() => setGuideTab('android')}
                className={`py-2 px-3 rounded-lg font-bold transition-all cursor-pointer ${
                  guideTab === 'android'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                🤖 Android
              </button>
            </div>

            {guideTab === 'ios' ? (
              <div className="space-y-2.5 p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800/90 text-xs font-mono">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-black flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <p className="text-zinc-300">
                    Dans <strong>Safari</strong>, appuie sur le bouton <strong>Partager</strong>{' '}
                    <Share className="w-3.5 h-3.5 inline text-blue-400 mx-0.5" /> en bas de l’écran.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-black flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <p className="text-zinc-300">
                    Fais défiler et appuie sur <strong>« Sur l’écran d’accueil »</strong>{' '}
                    <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400 mx-0.5" />.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-black flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <p className="text-zinc-300">
                    Appuie sur <strong>« Ajouter »</strong> en haut à droite, puis ouvre l’application <strong className="text-red-400">É</strong> depuis ton écran d’accueil et active la cloche 🔔.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800/90 text-xs font-mono">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <p className="text-zinc-300">
                    Appuie sur le menu <MoreVertical className="w-3.5 h-3.5 inline text-emerald-400 mx-0.5" /> en haut à droite de ton navigateur Chrome.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <p className="text-zinc-300">
                    Choisis <strong>« Installer l’application »</strong> ou{' '}
                    <strong>« Ajouter à l’écran d’accueil »</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <p className="text-zinc-300">
                    Ouvre <strong className="text-red-400">ÉVASION</strong> depuis ton écran d’accueil pour recevoir toutes tes notifications en direct.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold transition-colors cursor-pointer"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
};
