import React from 'react';
import { Newspaper, MessageSquare, Timer, Sparkles, ShoppingBag, Radio } from 'lucide-react';
import { AppTheme } from '../types';

export type ActiveTab = 'feed' | 'live' | 'chat' | 'market' | 'detox' | 'profile';

interface BottomNavProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  detoxActive: boolean;
  liveCount?: number;
  hasFullKeyAccess?: boolean;
  theme?: AppTheme;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
  detoxActive,
  liveCount = 0,
  hasFullKeyAccess = true,
  theme = 'dark',
}) => {
  const tabs = [
    {
      id: 'feed' as ActiveTab,
      label: 'Le Mur',
      icon: Newspaper,
      description: 'Fil d\'actualité',
      requiresTenKeys: false,
    },
    {
      id: 'live' as ActiveTab,
      label: 'Live',
      icon: Radio,
      description: 'Lives en direct',
      isLiveTab: true,
      requiresTenKeys: false,
    },
    {
      id: 'chat' as ActiveTab,
      label: 'La Cour',
      icon: MessageSquare,
      description: 'Chat direct',
      requiresTenKeys: true,
    },
    {
      id: 'market' as ActiveTab,
      label: 'Marché',
      icon: ShoppingBag,
      description: 'Boutique & VIP',
      highlightBadge: '0,50€',
      requiresTenKeys: false,
    },
    {
      id: 'detox' as ActiveTab,
      label: 'Détox',
      icon: Timer,
      description: 'Déconnexion',
      badge: detoxActive ? 'En cours' : undefined,
      requiresTenKeys: true,
    },
    {
      id: 'profile' as ActiveTab,
      label: 'Univers',
      icon: Sparkles,
      description: 'Mon espace perso',
      requiresTenKeys: false,
    },
  ];

  return (
    <nav
      aria-label="Navigation principale"
      className={`fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md border-t px-1 py-1 safe-area-bottom transition-colors ${
        theme === 'dark'
          ? 'bg-transparent border-white/15'
          : 'bg-white/85 border-zinc-300/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]'
      }`}
    >
      <div className="max-w-md mx-auto grid grid-cols-6 items-center h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isLocked = !hasFullKeyAccess && tab.requiresTenKeys;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className={`relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 rounded-xl bg-transparent transition-all cursor-pointer ${
                theme === 'dark' ? 'drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]' : ''
              } ${
                isActive
                  ? tab.isLiveTab
                    ? 'text-[#ff0050] font-semibold'
                    : theme === 'dark'
                    ? 'text-[#fb923c] font-semibold'
                    : 'text-[#dc2626] font-bold'
                  : theme === 'dark'
                  ? 'text-zinc-200 hover:text-white active:scale-95'
                  : 'text-zinc-800 hover:text-zinc-950 active:scale-95'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 stroke-[2.2]' : 'stroke-[1.8]'
                  }`}
                />
                {isLocked ? (
                  <span className="absolute -top-1.5 -right-2 px-1 rounded-full bg-amber-500 text-zinc-950 text-[8px] font-black leading-tight">
                    🔒
                  </span>
                ) : (
                  <>
                    {tab.isLiveTab && liveCount > 0 && (
                      <span className="absolute -top-1 -right-2 px-1 rounded-full text-[7px] font-mono font-black text-white bg-[#ff0050] animate-pulse">
                        {liveCount}
                      </span>
                    )}
                    {tab.badge && (
                      <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-[#f97316] animate-ping" />
                    )}
                    {tab.highlightBadge && !isActive && (
                      <span className="absolute -top-1.5 -right-3 px-1 py-0.2 rounded-full bg-amber-500/90 text-[8px] font-bold text-zinc-950 font-mono scale-90">
                        {tab.highlightBadge}
                      </span>
                    )}
                  </>
                )}
              </div>
              <span className="text-[10px] sm:text-[11px] tracking-tight mt-1 whitespace-nowrap">
                {tab.label}
              </span>
              {isActive && (
                <span
                  className={`absolute bottom-1 w-6 h-0.5 rounded-full ${
                    tab.isLiveTab
                      ? 'bg-[#ff0050] shadow-[0_0_6px_rgba(255,0,80,0.8)]'
                      : 'bg-gradient-to-r from-[#ef4444] to-[#f97316] shadow-[0_0_8px_rgba(249,115,22,0.8)]'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
