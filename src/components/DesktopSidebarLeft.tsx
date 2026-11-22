import React from 'react';
import {
  FileText,
  MessageSquare,
  ShoppingBag,
  Timer,
  Shield,
  PlusCircle,
  Key,
  Flame,
  Crown,
  Lock,
  Radio,
  Sun,
  Moon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ActiveTab } from './BottomNav';
import { formatDayOrdinal } from '../utils/formatDays';
import { getNeonTextClass, getNeonAvatarRingClass, getCellFrameClasses } from '../utils/neonStyles';
import { AvatarDisplay } from './AvatarDisplay';
import { EvasionEmblem } from './EvasionEmblem';

interface DesktopSidebarLeftProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  onOpenCreate: () => void;
}

export const DesktopSidebarLeft: React.FC<DesktopSidebarLeftProps> = ({
  activeTab,
  onChangeTab,
  onOpenCreate,
}) => {
  const { user, userRank, availableInmates, detoxSession, openShop, theme, toggleTheme, activeLives, hasFullKeyAccess, openUserProfile } = useApp();

  const NAV_ITEMS = [
    { id: 'feed' as ActiveTab, label: 'Le Mur', icon: FileText, badge: null },
    {
      id: 'live' as ActiveTab,
      label: 'Lives',
      icon: Radio,
      badge: activeLives.length > 0 ? `${activeLives.length} LIVE` : null,
    },
    {
      id: 'chat' as ActiveTab,
      label: 'La Cour',
      icon: MessageSquare,
      badge: !hasFullKeyAccess
        ? '🔒 10🔑'
        : availableInmates.length > 0
        ? `${availableInmates.length}`
        : null,
    },
    { id: 'market' as ActiveTab, label: 'Marché Noir', icon: ShoppingBag, badge: '0,50€' },
    { id: 'detox' as ActiveTab, label: 'Détox', icon: Timer, badge: !hasFullKeyAccess ? '🔒 10🔑' : detoxSession.isActive ? 'Actif' : null },
    { id: 'profile' as ActiveTab, label: 'Mon Univers', icon: Shield, badge: user.isVipCell ? 'VIP' : null },
  ];

  return (
    <aside
      className={`hidden lg:flex flex-col w-64 xl:w-72 sticky top-0 h-screen p-5 border-r select-none shrink-0 backdrop-blur-xs ${
        theme === 'dark' ? 'bg-transparent border-white/15 text-zinc-100' : 'bg-white/75 border-zinc-300/80 text-zinc-900'
      }`}
    >
      {/* Brand Logo + Theme Toggle */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <EvasionEmblem size="sm" />
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight font-sans flex items-center leading-none">
              <span className="text-[#ef4444] animate-neon-flicker inline-block mr-[1px]">É</span>
              <span>VASION</span>
            </h1>
            <p className={`text-[10px] font-mono mt-1 truncate ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
              Réseau libre · Zéro algorithme
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          title={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-all active:scale-95 cursor-pointer ${
            theme === 'dark'
              ? 'border-white/15 bg-white/5 text-[#fb923c] hover:bg-white/10'
              : 'border-zinc-300 bg-black/5 text-indigo-700 hover:bg-black/10'
          }`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="space-y-1.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'evasion-btn-primary font-bold'
                  : theme === 'dark'
                  ? 'bg-transparent text-zinc-300 hover:text-white hover:bg-white/10'
                  : 'bg-transparent text-zinc-700 hover:text-zinc-950 hover:bg-black/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#ef4444]/85'}`} />
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-black/25 text-white'
                      : item.id === 'live' && activeLives.length > 0
                      ? 'live-pseudo-pill text-white border border-white/30'
                      : item.id === 'market'
                      ? theme === 'dark'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-amber-100 text-amber-700 border border-amber-300'
                      : item.id === 'detox'
                      ? theme === 'dark'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                      : theme === 'dark'
                      ? 'bg-white/10 text-zinc-300'
                      : 'bg-zinc-200 text-zinc-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Primary CTA: Graver un Aveu */}
        <div className="pt-4">
          <button
            type="button"
            onClick={onOpenCreate}
            className="w-full py-3 px-4 rounded-full font-bold text-sm tracking-wide flex items-center justify-center gap-2 evasion-btn-primary cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Graver un aveu</span>
          </button>
        </div>
      </nav>

      {/* User Inmate Summary Card at bottom (Transparent) */}
      <div
        className={`p-3.5 rounded-2xl border bg-transparent transition-all ${
          theme === 'dark' ? 'border-white/15' : 'border-zinc-300'
        } ${getCellFrameClasses(user.cellBorderFrame, user.neonColor, theme)}`}
      >
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() =>
              openUserProfile({
                id: user.id,
                matricule: user.matricule,
                alias: user.alias,
                avatar: user.avatar,
                neonColor: user.neonColor,
              })
            }
            title="Voir la vue publique de mon profil"
            className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-85 transition-opacity cursor-pointer"
          >
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg select-none overflow-hidden shrink-0 bg-transparent ${getNeonAvatarRingClass(
                user.neonColor,
                theme
              )}`}
            >
              <AvatarDisplay avatar={user.avatar} alt={user.alias} />
            </span>
            <div className="min-w-0">
              <div
                className={`font-mono text-xs font-bold truncate flex items-center gap-1 ${
                  user.neonColor
                    ? getNeonTextClass(user.neonColor, theme)
                    : theme === 'dark'
                    ? 'text-white'
                    : 'text-zinc-900'
                }`}
              >
                <span>{user.matricule}</span>
                {user.isVipCell && <Crown className="w-3 h-3 text-amber-400" />}
              </div>
              <div className={`text-[10px] font-mono truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {userRank.icon} {userRank.rank}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('profile')}
            title="Voir mon profil"
            className={`text-xs hover:underline font-mono cursor-pointer ${
              theme === 'dark' ? 'text-amber-400' : 'text-amber-600 font-bold'
            }`}
          >
            Gérer
          </button>
        </div>

        {/* Keys and streak status */}
        <div
          className={`flex items-center justify-between pt-2 border-t text-xs font-mono ${
            theme === 'dark' ? 'border-white/10' : 'border-zinc-200'
          }`}
        >
          <span className="flex items-center gap-1 text-orange-500 font-bold" title="Flammes quotidiennes">
            <Flame className="w-3.5 h-3.5 fill-orange-500" />
            <span>{formatDayOrdinal(user.streakDays || 1)}</span>
          </span>

          <span
            className={`flex items-center gap-1 font-bold ${
              theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
            }`}
            title="Clés disponibles"
          >
            <Key className="w-3.5 h-3.5" />
            <span>{user.keysAvailable}</span>
          </span>

          <span
            className={`flex items-center gap-1 font-bold ${
              theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'
            }`}
            title="Cadenas disponibles"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{user.padlocksAvailable ?? 0}</span>
          </span>

          <button
            type="button"
            onClick={() => openShop()}
            className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300'
            }`}
          >
            +Clés
          </button>
        </div>
      </div>
    </aside>
  );
};
