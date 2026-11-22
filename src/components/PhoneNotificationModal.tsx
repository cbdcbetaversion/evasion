import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Download,
  Share,
  Smartphone,
  PlusSquare,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import {
  disablePhoneNotifications,
  dispatchPhoneNotification,
  enablePhoneNotifications,
  getNotificationPermission,
  getPhoneNotificationPrefs,
  PhoneNotificationPrefs,
  savePhoneNotificationPrefs,
  syncPushSubscriptionWithServer,
} from '../utils/phoneNotifications';
import { soundEngine } from '../utils/audio';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PhoneNotificationPanelProps {
  authToken: string | null;
  theme: 'dark' | 'light';
  onStatusChange?: (active: boolean) => void;
  onToast?: (opts: {
    title: string;
    message?: string;
    type?: 'success' | 'info' | 'warning';
    icon?: string;
    action?: { label: string; onClick: () => void };
  }) => void;
}

export const PhoneNotificationPanel: React.FC<PhoneNotificationPanelProps> = ({
  authToken,
  theme,
  onStatusChange,
  onToast,
}) => {
  const [prefs, setPrefs] = useState<PhoneNotificationPrefs>(() => getPhoneNotificationPrefs());
  const [permission, setPermission] = useState(() => getNotificationPermission());
  const [pushMode, setPushMode] = useState<'web-push' | 'local-sw' | 'blocked' | 'unsupported'>('local-sw');
  const [busy, setBusy] = useState(false);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showHomeScreenSteps, setShowHomeScreenSteps] = useState(false);
  const [guideTab, setGuideTab] = useState<'ios' | 'android'>(() => (isIOS ? 'ios' : 'android'));

  useEffect(() => {
    if (isIOS) setGuideTab('ios');
  }, [isIOS]);

  const isDark = theme === 'dark';
  const isActive = prefs.enabled && permission !== 'denied';

  useEffect(() => {
    const perm = getNotificationPermission();
    const currentPrefs = getPhoneNotificationPrefs();
    setPermission(perm);
    setPrefs(currentPrefs);
    if (perm === 'granted' && currentPrefs.enabled) {
      void syncPushSubscriptionWithServer(authToken, currentPrefs.notifyCourtChat).then((res) => {
        setPushMode(res.mode);
      });
    }
  }, [authToken]);

  const handleToggleMaster = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isActive) {
        await disablePhoneNotifications(authToken);
        const next = getPhoneNotificationPrefs();
        setPrefs(next);
        onStatusChange?.(false);
        onToast?.({
          title: 'Notifications coupées 🔕',
          message: 'Tu pourras les réactiver gratuitement à tout moment.',
          type: 'info',
        });
      } else {
        const optimistic = savePhoneNotificationPrefs({ ...prefs, enabled: true });
        setPrefs(optimistic);
        onStatusChange?.(true);

        const res = await enablePhoneNotifications(authToken, optimistic.notifyCourtChat);
        setPermission(res.permission);
        setPushMode(res.mode);
        const next = getPhoneNotificationPrefs();
        setPrefs(next);

        soundEngine.playChatBlip();
        try {
          navigator.vibrate?.([110, 50, 110]);
        } catch {
          // ignore
        }

        if (res.permission === 'granted') {
          onStatusChange?.(true);
          await dispatchPhoneNotification({
            id: `enable_${Date.now()}`,
            title: 'ÉVASION · Notifications actives',
            body: res.pushSubscribed
              ? 'Push autonome actif : appuie pour lire et répondre à tes messages.'
              : 'Alertes instantanées activées sur cet appareil.',
            type: 'test',
            force: true,
          });
          onToast?.({
            title: 'Notifications activées ! 🔔',
            message: res.pushSubscribed
              ? 'Push autonome gratuit actif sur ton téléphone.'
              : 'Alertes actives dès réception d’un message.',
            type: 'success',
            icon: 'EVASION_LOGO',
          });
        } else if (res.permission === 'denied') {
          onStatusChange?.(false);
          onToast?.({
            title: 'Alertes bloquées dans les réglages',
            message: 'Notifications navigateur bloquées : alertes directes activées dans l’application.',
            type: 'warning',
            icon: 'EVASION_LOGO',
          });
        } else {
          onStatusChange?.(true);
          onToast?.({
            title: 'Notifications activées ! 🔔',
            message: 'Alertes autonomes gratuites prêtes à la réception d’un message.',
            type: 'success',
            icon: 'EVASION_LOGO',
          });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleChannel = async (
    key: 'notifyDirectMessages' | 'notifyPostReplies' | 'notifyCourtChat'
  ) => {
    const next: PhoneNotificationPrefs = {
      ...prefs,
      [key]: !prefs[key],
    };
    savePhoneNotificationPrefs(next);
    setPrefs(next);
    if (key === 'notifyCourtChat' && permission === 'granted' && next.enabled) {
      await syncPushSubscriptionWithServer(authToken, next.notifyCourtChat);
    }
  };

  const handleHomeScreenAction = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        onToast?.({
          title: 'ÉVASION ajoutée à l’écran d’accueil ! 📲',
          message: 'Ouvre l’application depuis ton écran d’accueil pour recevoir toutes tes notifications.',
          type: 'success',
          icon: 'EVASION_LOGO',
        });
        return;
      }
    }
    setShowHomeScreenSteps((prev) => !prev);
  };

  return (
    <div
      className={`rounded-2xl p-3.5 sm:p-4 border space-y-3 text-center ${
        isDark
          ? 'bg-gradient-to-br from-emerald-950/30 via-zinc-900 to-zinc-950 border-emerald-500/35'
          : 'bg-emerald-50/50 border-emerald-200'
      }`}
    >
      {/* 1. En-tête + Bouton principal centrés */}
      <div className="flex flex-col items-center text-center gap-2.5 max-w-md mx-auto">
        <div
          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
            isActive
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
          }`}
        >
          {isActive ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </div>

        <div className="min-w-0 w-full space-y-1">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <h3 className={`text-sm font-black ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              Notifications Téléphone
            </h3>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                isActive
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : permission === 'denied'
                  ? 'bg-red-500/15 border-red-500/30 text-red-400'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
              }`}
            >
              {isActive
                ? pushMode === 'web-push'
                  ? 'Push Actif · 0 €'
                  : 'Activées · 0 €'
                : permission === 'denied'
                ? 'Bloquées'
                : 'Désactivées'}
            </span>
          </div>
          <p className={`text-[11px] font-mono leading-snug ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Alertes instantanées et gratuites dès réception d’un message.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 w-full max-w-xs mx-auto">
          <button
            type="button"
            onClick={handleToggleMaster}
            className={`w-full touch-manipulation select-none px-4 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
              isActive
                ? isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                  : 'bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
            }`}
          >
            {isActive ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Activées (Couper)</span>
              </>
            ) : (
              <>
                <Bell className="w-3.5 h-3.5" />
                <span>{busy ? 'Activation...' : 'Activer sur Téléphone'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={async () => {
              soundEngine.playChatBlip();
              try {
                navigator.vibrate?.([110, 50, 110]);
              } catch {
                // ignore
              }
              await dispatchPhoneNotification({
                id: `test_${Date.now()}`,
                title: 'ÉVASION · Alerte Test Active 🔔',
                body: 'Tes notifications et ta messagerie fonctionnent en temps réel !',
                type: 'test',
                force: true,
              });
              onToast?.({
                title: 'Notification Test reçue ! 🔔',
                message: 'Son, vibration et alerte ÉVASION opérationnels.',
                type: 'success',
                icon: 'EVASION_LOGO',
              });
            }}
            className={`w-full touch-manipulation select-none px-4 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-95 cursor-pointer ${
              isDark
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-300'
                : 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300 text-emerald-900'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Tester une alerte</span>
          </button>
        </div>
      </div>

      {/* 2. Canaux de notifications */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs font-mono max-w-md mx-auto">
        {[
          {
            key: 'notifyDirectMessages' as const,
            label: 'Messages Privés',
            active: prefs.notifyDirectMessages,
          },
          {
            key: 'notifyPostReplies' as const,
            label: 'Réponses reçues',
            active: prefs.notifyPostReplies,
          },
          {
            key: 'notifyCourtChat' as const,
            label: 'Messages La Cour',
            active: prefs.notifyCourtChat,
          },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleToggleChannel(item.key)}
            className={`touch-manipulation px-3 py-2 rounded-xl border flex items-center justify-between gap-2 transition-colors cursor-pointer ${
              item.active
                ? isDark
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-emerald-100 border-emerald-400 text-emerald-800'
                : isDark
                ? 'bg-zinc-950/60 border-zinc-800 text-zinc-500'
                : 'bg-white border-zinc-200 text-zinc-500'
            }`}
          >
            <span className="truncate font-bold">{item.label}</span>
            <span className="text-[10px] font-black">{item.active ? 'ON' : 'OFF'}</span>
          </button>
        ))}
      </div>

      {/* 3. Bloc ergonomique centré : Intégrer sur l'Écran d'accueil */}
      {isInstalled ? (
        <div
          className={`p-3 rounded-xl border flex items-center justify-center gap-2.5 text-xs font-mono max-w-md mx-auto ${
            isDark
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              : 'bg-emerald-100/70 border-emerald-300 text-emerald-900'
          }`}
        >
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            App intégrée sur l’écran d’accueil · Réception optimale active.
          </span>
        </div>
      ) : (
        <div
          className={`p-3.5 rounded-2xl border space-y-2.5 max-w-md mx-auto text-center ${
            isDark
              ? 'bg-zinc-950/90 border-zinc-800 text-zinc-200'
              : 'bg-white border-zinc-200 text-zinc-800'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-1.5">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <div className="w-7 h-7 rounded-xl bg-red-500/15 border border-red-500/35 text-red-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs sm:text-sm font-black leading-tight">
                Intégrer sur l’Écran d’accueil
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                Conseillé
              </span>
            </div>
          </div>

          <p
            className={`text-xs leading-relaxed text-center ${
              isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            Ajoute <strong className={isDark ? 'text-white' : 'text-zinc-900'}>ÉVASION</strong> sur l’écran d’accueil de ton téléphone pour recevoir les notifications directement, même écran verrouillé.
          </p>

          <button
            type="button"
            onClick={handleHomeScreenAction}
            className="w-full touch-manipulation py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold flex items-center justify-center gap-2 text-center transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isInstallable
                ? 'Ajouter à l’écran d’accueil maintenant'
                : showHomeScreenSteps
                ? 'Masquer le guide d’intégration'
                : 'Comment l’ajouter sur mon téléphone'}
            </span>
            {!isInstallable &&
              (showHomeScreenSteps ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              ))}
          </button>

          {/* Ligne 4 : Guide pas à pas repliable bien agencé */}
          {showHomeScreenSteps && (
            <div
              className={`pt-2.5 border-t space-y-2.5 animate-fade-in ${
                isDark ? 'border-zinc-800' : 'border-zinc-200'
              }`}
            >
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setGuideTab('ios')}
                  className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer ${
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
                  className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer ${
                    guideTab === 'android'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  🤖 Android
                </button>
              </div>

              {guideTab === 'ios' ? (
                <div className="space-y-1.5 text-xs">
                  <div
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                      isDark ? 'bg-zinc-900/70 border-zinc-800/80 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-mono font-black flex items-center justify-center shrink-0 text-[11px]">
                      1
                    </span>
                    <span className="leading-snug">
                      Dans <strong>Safari</strong>, touche <strong>Partager</strong>{' '}
                      <Share className="w-3.5 h-3.5 inline text-blue-400 mx-0.5" /> en bas de l’écran.
                    </span>
                  </div>
                  <div
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                      isDark ? 'bg-zinc-900/70 border-zinc-800/80 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-mono font-black flex items-center justify-center shrink-0 text-[11px]">
                      2
                    </span>
                    <span className="leading-snug">
                      Choisis <strong>« Sur l’écran d’accueil »</strong>{' '}
                      <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400 mx-0.5" />.
                    </span>
                  </div>
                  <div
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                      isDark ? 'bg-zinc-900/70 border-zinc-800/80 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-mono font-black flex items-center justify-center shrink-0 text-[11px]">
                      3
                    </span>
                    <span className="leading-snug">
                      Touche <strong>« Ajouter »</strong> puis ouvre l’icône <strong className="text-red-400">É</strong> sur ton écran d’accueil.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  <div
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                      isDark ? 'bg-zinc-900/70 border-zinc-800/80 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono font-black flex items-center justify-center shrink-0 text-[11px]">
                      1
                    </span>
                    <span className="leading-snug">
                      Touche le menu <MoreVertical className="w-3.5 h-3.5 inline text-emerald-400 mx-0.5" /> en haut à droite de Chrome.
                    </span>
                  </div>
                  <div
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                      isDark ? 'bg-zinc-900/70 border-zinc-800/80 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono font-black flex items-center justify-center shrink-0 text-[11px]">
                      2
                    </span>
                    <span className="leading-snug">
                      Sélectionne <strong>« Installer l’application »</strong> ou <strong>« Ajouter à l’écran d’accueil »</strong>.
                    </span>
                  </div>
                  <div
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                      isDark ? 'bg-zinc-900/70 border-zinc-800/80 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono font-black flex items-center justify-center shrink-0 text-[11px]">
                      3
                    </span>
                    <span className="leading-snug">
                      Ouvre <strong className="text-red-400">ÉVASION</strong> depuis ton écran d’accueil pour recevoir tes alertes.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface PhoneNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  authToken: string | null;
  theme: 'dark' | 'light';
  onStatusChange?: (active: boolean) => void;
  onToast?: (opts: {
    title: string;
    message?: string;
    type?: 'success' | 'info' | 'warning';
    icon?: string;
    action?: { label: string; onClick: () => void };
  }) => void;
}

export const PhoneNotificationModal: React.FC<PhoneNotificationModalProps> = ({
  isOpen,
  onClose,
  authToken,
  theme,
  onStatusChange,
  onToast,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
          theme === 'dark' ? 'bg-[#09090b] border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/70 shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-black font-mono">Alertes Mobile & Écran d’accueil</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 sm:p-4 overflow-y-auto overscroll-contain">
          <PhoneNotificationPanel
            authToken={authToken}
            theme={theme}
            onStatusChange={onStatusChange}
            onToast={onToast}
          />
        </div>
      </div>
    </div>
  );
};
