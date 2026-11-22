import React, { useCallback, useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { TopHeader } from './components/TopHeader';
import { BottomNav, ActiveTab } from './components/BottomNav';
import { FeedView } from './components/FeedView';
import { LiveCourtChat } from './components/LiveCourtChat';
import { DetoxTimerView } from './components/DetoxTimerView';
import { ProfileView } from './components/ProfileView';
import { CreatePostModal } from './components/CreatePostModal';
import { StoryModal } from './components/StoryModal';
import { LiberationCelebrationModal } from './components/LiberationCelebrationModal';
import { LandingStartScreen } from './components/LandingStartScreen';
import { ToastContainer } from './components/ToastContainer';
import { PayPalShopModal } from './components/PayPalShopModal';
import { BlackMarketView } from './components/BlackMarketView';
import { KitReaderModal } from './components/KitReaderModal';
import { DesktopSidebarLeft } from './components/DesktopSidebarLeft';
import { DesktopSidebarRight } from './components/DesktopSidebarRight';
import { InboxModal } from './components/InboxModal';
import { LiveTikTokView } from './components/LiveTikTokView';
import { AuthModal } from './components/AuthModal';
import { DirectChatModal } from './components/DirectChatModal';
import { UserProfileModal } from './components/UserProfileModal';
import { PhoneNotificationModal } from './components/PhoneNotificationModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Smartphone, Monitor } from 'lucide-react';
import {
  getNotificationPermission,
  getPhoneNotificationPrefs,
} from './utils/phoneNotifications';
import { NeonColor } from './types';
import {
  extractUniverseIdentifierFromLocation,
  clearUniverseQueryFromLocation,
} from './utils/universeUrl';

interface NotificationClickData {
  type?: string;
  postId?: string;
  commentId?: string;
  senderId?: string;
  senderMatricule?: string;
  senderAlias?: string;
  senderAvatar?: string;
  senderNeonColor?: NeonColor;
  channel?: string;
  liveId?: string;
  inviteMode?: string;
}

const MainApp: React.FC = () => {
  const {
    detoxSession,
    activeStoryPost,
    isWallStoryActive,
    closeStoryModal,
    liberatedPostCelebration,
    closeLiberationCelebration,
    openStoryModal,
    isShopOpen,
    closeShop,
    activeReadKit,
    closeKitReader,
    theme,
    activeLives,
    hasFullKeyAccess,
    isAuthModalOpen,
    closeAuthModal,
    openDirectChat,
    openUserProfile,
    user,
    authToken,
    showToast,
    requestedLiveId,
    requestOpenLive,
    incomingLiveInvite,
    dismissIncomingLiveInvite,
    respondToLiveInvite,
    isOnlineMode,
    isNetworkOnline,
    manualOfflineMode,
    pendingSyncCount,
    isSyncingOfflineQueue,
    toggleOnlineOfflineMode,
    syncOfflineQueueNow,
  } = useApp();

  const [inLandingMode, setInLandingMode] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash || '';
      // Only bypass landing if returning directly with an OAuth code/token or payment response
      if (
        params.get('notif') ||
        params.get('payment') ||
        params.get('code') ||
        hash.includes('access_token=') ||
        hash.includes('refresh_token=')
      ) {
        return false;
      }
      if (extractUniverseIdentifierFromLocation()) return false;
    } catch {
      // ignore
    }
    return true;
  });
  const [skipLandingSplash, setSkipLandingSplash] = useState(false);

  useEffect(() => {
    const handleLogout = () => {
      setInLandingMode(true);
      setSkipLandingSplash(false);
    };
    window.addEventListener('evasion:logout', handleLogout);
    return () => window.removeEventListener('evasion:logout', handleLogout);
  }, []);
  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [initialInboxReplyPostId, setInitialInboxReplyPostId] = useState<string | null>(null);
  const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
  const [phoneFrameMode, setPhoneFrameMode] = useState(false);
  const [dismissedLiveBanner, setDismissedLiveBanner] = useState(false);
  const [notificationsActive, setNotificationsActive] = useState(() => {
    const perm = getNotificationPermission();
    const prefs = getPhoneNotificationPrefs();
    return prefs.enabled && perm !== 'denied';
  });

  const handleNotificationNavigation = useCallback(
    (data: NotificationClickData) => {
      if (!data?.type) return;
      setInLandingMode(false);

      if (data.type === 'dm' && (data.senderMatricule || data.senderId)) {
        openDirectChat({
          id: data.senderId || data.senderMatricule || '',
          matricule: data.senderMatricule || data.senderId || 'Codétenu',
          alias: data.senderAlias || data.senderMatricule,
          avatar: data.senderAvatar || '⛓️',
          neonColor: data.senderNeonColor,
        });
        return;
      }

      if (data.type === 'comment') {
        setActiveTab('feed');
        setInitialInboxReplyPostId(data.postId || null);
        setIsInboxOpen(true);
        return;
      }

      if ((data.type === 'live' || data.type === 'live_invite') && data.liveId) {
        setActiveTab('live');
        requestOpenLive(data.liveId, data.inviteMode === 'cohost');
        return;
      }

      if (data.type === 'cour') {
        if (data.liveId) {
          setActiveTab('live');
          requestOpenLive(data.liveId, data.inviteMode === 'cohost');
        } else {
          setActiveTab('chat');
        }
        return;
      }
    },
    [openDirectChat, requestOpenLive]
  );

  // Switch straight to the Live tab whenever a requestedLiveId is triggered (notification, aura click, toast, or invite)
  useEffect(() => {
    if (requestedLiveId) {
      setInLandingMode(false);
      setActiveTab('live');
    }
  }, [requestedLiveId]);

  // Auto-enter app once Supabase Google OAuth callback session is restored
  useEffect(() => {
    const onSupabaseAuthEnter = () => {
      try {
        window.localStorage.setItem('evasion_entered_connected', '1');
      } catch {
        // ignore
      }
      setInLandingMode(false);
    };
    window.addEventListener('evasion:supabase-auth-enter', onSupabaseAuthEnter);
    return () => {
      window.removeEventListener('evasion:supabase-auth-enter', onSupabaseAuthEnter);
    };
  }, []);

  // Handle cold-start URL deep-link from phone notification tap (?notif=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const notifType = params.get('notif');
      if (!notifType) return;

      handleNotificationNavigation({
        type: notifType,
        postId: params.get('postId') || undefined,
        commentId: params.get('commentId') || undefined,
        senderMatricule: params.get('from') || undefined,
        senderId: params.get('fromId') || undefined,
        senderAlias: params.get('fromAlias') || undefined,
        channel: params.get('channel') || undefined,
        liveId: params.get('liveId') || undefined,
        inviteMode: params.get('inviteMode') || undefined,
      });

      params.delete('notif');
      params.delete('postId');
      params.delete('commentId');
      params.delete('from');
      params.delete('fromId');
      params.delete('fromAlias');
      params.delete('msgId');
      params.delete('channel');
      params.delete('liveId');
      params.delete('inviteMode');
      const remaining = params.toString();
      const nextUrl = remaining ? `${window.location.pathname}?${remaining}` : window.location.pathname;
      window.history.replaceState({}, '', nextUrl);
    } catch {
      // ignore URL parsing errors
    }
  }, [handleNotificationNavigation]);

  // Handle personal space deep-link (?univers=... or #inmate=...) from shared URL / QR Code
  useEffect(() => {
    const openFromUrl = () => {
      const identifier = extractUniverseIdentifierFromLocation();
      if (!identifier) return;
      setInLandingMode(false);
      openUserProfile({
        id: identifier,
        matricule: identifier,
        alias: identifier,
        avatar: '⛓️',
        readOnlyFromUrl: true,
      });
      clearUniverseQueryFromLocation();
    };

    openFromUrl();
    window.addEventListener('hashchange', openFromUrl);
    return () => window.removeEventListener('hashchange', openFromUrl);
  }, [openUserProfile]);

  // Handle runtime Service Worker notification clicks & desktop Notification clicks
  useEffect(() => {
    const onWindowNotifClick = (e: Event) => {
      const detail = (e as CustomEvent<NotificationClickData>).detail;
      if (detail) handleNotificationNavigation(detail);
    };
    window.addEventListener('evasion-notif-click', onWindowNotifClick);

    const onSwMessage = (event: MessageEvent) => {
      const msg = event.data as { type?: string; data?: NotificationClickData } | undefined;
      if (msg?.type === 'NOTIFICATION_CLICK' && msg.data) {
        handleNotificationNavigation(msg.data);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    return () => {
      window.removeEventListener('evasion-notif-click', onWindowNotifClick);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
    };
  }, [handleNotificationNavigation]);

  // If on landing screen, show the dedicated start page in night mode (full-screen responsive)
  if (inLandingMode) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col justify-center items-center transition-colors duration-200 bg-[#090707]">
        <div
          className={`w-full ${
            phoneFrameMode
              ? 'max-w-[420px] my-6 rounded-[40px] border-8 overflow-hidden border-[#2b1c1c] bg-[#090707] shadow-[0_0_50px_rgba(0,0,0,0.9)]'
              : 'w-full min-h-[100dvh]'
          }`}
        >
          <LandingStartScreen
            skipSplash={skipLandingSplash}
            onEnter={() => {
              try {
                window.localStorage.setItem('evasion_entered_connected', '1');
              } catch {
                // ignore
              }
              setInLandingMode(false);
            }}
          />
        </div>
        <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />
        <ToastContainer />
      </div>
    );
  }

  return (
    <div
      className={`min-h-[100dvh] w-full ${
        theme === 'dark' ? 'bg-[#090707] text-zinc-100' : 'bg-[#e5e8ef] text-zinc-950'
      } flex flex-col bg-jail-bars selection:bg-red-500/30 selection:text-red-200 transition-colors duration-200`}
    >
      {/* Full-Screen Responsive Layout across all screens */}
      <div className={`flex-1 flex w-full justify-between ${phoneFrameMode ? 'items-center justify-center my-6' : ''}`}>
        {/* Left Desktop Navigation Sidebar */}
        {!phoneFrameMode && (
          <DesktopSidebarLeft
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            onOpenCreate={() => setIsCreateModalOpen(true)}
          />
        )}

        {/* Center Primary Column — Full-Screen Responsive on all screens */}
        <div
          className={`flex flex-col w-full ${
            phoneFrameMode
              ? `max-w-[420px] rounded-[40px] border-8 ${
                  theme === 'dark'
                    ? 'border-zinc-800 bg-[#09090b] shadow-[0_0_50px_rgba(0,0,0,0.9)]'
                    : 'border-zinc-400 bg-[#e5e8ef] shadow-[0_0_40px_rgba(0,0,0,0.15)]'
                } overflow-hidden min-h-[780px]`
              : 'flex-1 min-w-0 min-h-[100dvh]'
          }`}
        >
          {/* Sticky Top Header */}
          <TopHeader
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenProfile={() =>
              openUserProfile({
                id: user.id,
                matricule: user.matricule,
                alias: user.alias,
                avatar: user.avatar,
                neonColor: user.neonColor,
              })
            }
            onBackToLanding={() => {
              setSkipLandingSplash(false);
              setInLandingMode(true);
            }}
            onOpenInbox={() => {
              setInitialInboxReplyPostId(null);
              setIsInboxOpen(true);
            }}
            onOpenNotifications={() => setIsNotifModalOpen(true)}
            notificationsActive={notificationsActive}
          />

          {/* Content Area centered around personal universe across all views */}
          <main className="flex-1 px-3 sm:px-6 pt-3 sm:pt-5 pb-24 lg:pb-10 w-full max-w-full overflow-x-clip">
            <div className={activeTab === 'live' ? 'w-full max-w-5xl mx-auto' : 'w-full max-w-2xl mx-auto'}>
              {activeTab === 'feed' && (
                <FeedView
                  onOpenCreate={() => setIsCreateModalOpen(true)}
                  onOpenDetox={() => setActiveTab('detox')}
                  onOpenLive={() => setActiveTab('live')}
                />
              )}

              {(activeTab === 'live' ||
                activeLives.some(
                  (l) =>
                    l.isActive &&
                    (l.hostId === user.id || l.guests?.some((g) => g.userId === user.id))
                )) && (
                <div className={activeTab === 'live' ? 'w-full' : 'hidden'}>
                  <LiveTikTokView />
                </div>
              )}

              {activeTab !== 'live' &&
                !dismissedLiveBanner &&
                activeLives.some(
                  (l) =>
                    l.isActive &&
                    (l.hostId === user.id || l.guests?.some((g) => g.userId === user.id))
                ) && (
                  <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[65] flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm border border-[#ff0050] bg-zinc-950/90 shadow-lg">
                    <button
                      type="button"
                      onClick={() => setActiveTab('live')}
                      className="flex items-center gap-2 text-xs font-mono font-bold text-white cursor-pointer"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#ff0050] animate-ping" />
                      <span>Ton Live est toujours en direct · Revenir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedLiveBanner(true)}
                      className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-[10px] cursor-pointer"
                      title="Fermer"
                    >
                      ✕
                    </button>
                  </div>
                )}

              {activeTab === 'chat' && (
                <LiveCourtChat onOpenCreate={() => setIsCreateModalOpen(true)} />
              )}

              {activeTab === 'market' && <BlackMarketView />}

              {activeTab === 'detox' && <DetoxTimerView />}

              <div className={activeTab === 'profile' ? 'w-full' : 'hidden'}>
                <ProfileView
                  onBackToLanding={() => {
                    setSkipLandingSplash(false);
                    setInLandingMode(true);
                  }}
                />
              </div>
            </div>
          </main>

          {/* Mobile Bottom Nav (visible on mobile / small screens, hidden when desktop sidebar active) */}
          <div className={!phoneFrameMode ? 'lg:hidden' : ''}>
            <BottomNav
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              detoxActive={detoxSession.isActive}
              liveCount={activeLives.length}
              hasFullKeyAccess={hasFullKeyAccess}
              theme={theme}
            />
          </div>
        </div>

        {/* Right Desktop Companion Sidebar */}
        {!phoneFrameMode && (
          <DesktopSidebarRight
            onChangeTab={setActiveTab}
            onOpenDetox={() => setActiveTab('detox')}
          />
        )}
      </div>

      {/* Modals & Overlays */}
      <CreatePostModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <InboxModal
        isOpen={isInboxOpen}
        initialReplyPostId={initialInboxReplyPostId}
        onOpenPhoneNotifications={() => setIsNotifModalOpen(true)}
        onClose={() => {
          setIsInboxOpen(false);
          setInitialInboxReplyPostId(null);
        }}
      />

      <PhoneNotificationModal
        isOpen={isNotifModalOpen}
        onClose={() => setIsNotifModalOpen(false)}
        authToken={authToken}
        theme={theme}
        onStatusChange={setNotificationsActive}
        onToast={showToast}
      />

      <StoryModal
        post={activeStoryPost}
        isWallShare={isWallStoryActive}
        isOpen={!!activeStoryPost || isWallStoryActive}
        onClose={closeStoryModal}
      />

      <LiberationCelebrationModal
        post={liberatedPostCelebration}
        onClose={closeLiberationCelebration}
        onOpenStory={(post) => openStoryModal(post)}
      />

      {/* Kit Digital Reader Modal */}
      <KitReaderModal
        kit={activeReadKit}
        onClose={closeKitReader}
      />

      {/* Boutique & Monétisation PayPal */}
      <PayPalShopModal
        isOpen={isShopOpen}
        onClose={closeShop}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />

      {/* Messagerie Privée Directe 1-à-1 */}
      <DirectChatModal />

      {/* Fiche & Univers Public au clic sur n'importe quel pseudo */}
      <UserProfileModal
        onOpenOwnProfile={() => {
          setInLandingMode(false);
          setActiveTab('profile');
        }}
      />

      {/* Invitation Live en direct (Spectateur ou Co-Hôte à 2-5 sur l'écran) */}
      {incomingLiveInvite && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] w-[94vw] max-w-md animate-bounce-in">
          <div className="rounded-2xl border-2 border-[#ff0050] bg-zinc-950/95 backdrop-blur-xl p-3.5 shadow-[0_0_40px_rgba(255,0,80,0.45)] text-white space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="live-avatar-aura shrink-0">
                <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-lg">
                  {incomingLiveInvite.fromAvatar || '🔴'}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="live-pseudo-pill px-1.5 py-0.5 rounded-full text-[9px] font-mono font-black uppercase">
                    {incomingLiveInvite.mode === 'cohost' ? 'LIVE EN LIVE 🎥' : 'INVITATION LIVE 🔴'}
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 truncate">
                    {incomingLiveInvite.topicTag}
                  </span>
                </div>
                <p className="text-xs font-bold truncate mt-0.5">
                  {incomingLiveInvite.fromName}{' '}
                  {incomingLiveInvite.mode === 'cohost'
                    ? "t'invite sur son écran (2 à 5 en simultané) !"
                    : "t'invite à regarder son Live :"}
                </p>
                <p className="text-[11px] font-mono text-zinc-300 truncate">
                  « {incomingLiveInvite.liveTitle} »
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {incomingLiveInvite.mode === 'cohost' ? (
                <button
                  type="button"
                  onClick={() => {
                    void respondToLiveInvite(incomingLiveInvite.liveId, true, {
                      camEnabled: true,
                      micEnabled: true,
                    });
                    setInLandingMode(false);
                    setActiveTab('live');
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#ff0050] to-[#00f2fe] text-zinc-950 font-mono font-black text-xs cursor-pointer active:scale-95 transition-transform"
                >
                  🎥 Monter sur l&apos;écran
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    requestOpenLive(incomingLiveInvite.liveId, false);
                    dismissIncomingLiveInvite();
                    setInLandingMode(false);
                    setActiveTab('live');
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#ff0050] hover:bg-[#ff1a62] text-white font-mono font-black text-xs cursor-pointer active:scale-95 transition-transform"
                >
                  🔴 Rejoindre le Live
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (incomingLiveInvite.mode === 'cohost') {
                    void respondToLiveInvite(incomingLiveInvite.liveId, false);
                  } else {
                    dismissIncomingLiveInvite();
                  }
                }}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs cursor-pointer"
              >
                Ignorer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating friendly toast notifications */}
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </ErrorBoundary>
  );
}
