import React, { useState, useMemo, useRef } from 'react';
import {
  Lock,
  Unlock,
  Key,
  PlusCircle,
  Share2,
  Check,
  CheckSquare,
  Shield,
  Scale,
  MessageCircle,
  Mic,
  Hourglass,
  Image as ImageIcon,
  Video,
  Radio,
  Search,
  X,
  Users,
  UserPlus,
  UserCheck,
  UserMinus,
  Clock,
  Loader2,
  Flame,
  Music,
} from 'lucide-react';
import { DirectChatTarget, PostCategory } from '../types';
import { useApp } from '../context/AppContext';
import { KeyAccessGate } from './KeyAccessGate';
import { PostCard } from './PostCard';
import { LegalPrivacyModal, LegalTab } from './LegalPrivacyModal';
import { GlobalLiveRadarStrip, LiveAvatarWrapper, LivePseudoBadge } from './LiveBadge';
import { AvatarDisplay } from './AvatarDisplay';
import { ProfileStatusBadges } from './ProfileStatusBadges';
import { formatDayOrdinal } from '../utils/formatDays';
import { getYearlyTheme } from '../utils/yearlyAssets';

type StatusFilter = 'all' | 'locked' | 'escaped' | 'audio' | 'music' | 'photos' | 'videos';

interface FeedViewProps {
  onOpenCreate: () => void;
  onOpenDetox: () => void;
  onOpenLive?: () => void;
}

export const FeedView: React.FC<FeedViewProps> = ({ onOpenCreate, onOpenDetox, onOpenLive }) => {
  const {
    posts,
    user,
    dailyMission,
    isDailyMissionCompleted,
    completeDailyMission,
    theme,
    openWallStoryModal,
    protectStreakWithPadlock,
    lockRealLifeTemptation,
    claimFreePadlock,
    startDetox,
    detoxSession,
    activeTagFilter,
    setActiveTagFilter,
    customSalons,
    createCustomSalon,
    activeLives,
    hasFullKeyAccess,
    requireFullKeyAccess,
    friends,
    incomingFriendRequests,
    onlineUsers,
    searchInmates,
    openDirectChat,
    openUserProfile,
    getFriendshipStatus,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<PostCategory | 'all'>('all');
  const [showPadlockPanel, setShowPadlockPanel] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showCreateSalonInput, setShowCreateSalonInput] = useState<boolean>(false);
  const [newSalonName, setNewSalonName] = useState<string>('');
  const [showFriendsPanel, setShowFriendsPanel] = useState<boolean>(false);
  const [memberSearchResults, setMemberSearchResults] = useState<DirectChatTarget[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;
    const raw = searchQuery.trim().replace(/^@+/, '');
    if (!raw || raw.startsWith('#')) {
      setMemberSearchResults([]);
      setIsSearchingMembers(false);
      return;
    }
    setIsSearchingMembers(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchInmates(raw);
        if (!cancelled) {
          setMemberSearchResults(res.slice(0, 8));
        }
      } finally {
        if (!cancelled) setIsSearchingMembers(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, searchInmates]);

  const onlineUserLookup = useMemo(() => {
    const ids = new Set<string>();
    const mats = new Set<string>();
    onlineUsers.forEach((u) => {
      if (u.id) ids.add(u.id);
      if (u.matricule) mats.add(u.matricule.toLowerCase());
    });
    return { ids, mats };
  }, [onlineUsers]);

  const handleCreateCustomSalonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSalonName.trim()) return;
    const created = createCustomSalon(newSalonName);
    if (created) {
      setActiveTagFilter(created.tag);
      setNewSalonName('');
      setShowCreateSalonInput(false);
    }
  };

  const filteredPosts = useMemo(() => {
    return posts
      .filter((post) => {
        if (statusFilter === 'locked' && (post.status === 'escaped' || post.keysCount >= post.keysRequired)) {
          return false;
        }
        if (statusFilter === 'escaped' && post.status !== 'escaped' && post.keysCount < post.keysRequired) {
          return false;
        }
        if (statusFilter === 'audio' && !post.audioNote) {
          return false;
        }
        if (statusFilter === 'music' && !post.bgMusic) {
          return false;
        }
        if (statusFilter === 'photos' && !post.imageUrl && !post.comments?.some((c) => !!c.imageUrl)) {
          return false;
        }
        if (statusFilter === 'videos' && !post.videoUrl && !post.comments?.some((c) => !!c.videoUrl)) {
          return false;
        }
        if (selectedCategory !== 'all' && post.category !== selectedCategory) {
          return false;
        }
        if (activeTagFilter) {
          const needle = activeTagFilter.toLowerCase();
          const catTag =
            post.category === 'ecrans'
              ? '#écrans'
              : post.category === 'routine'
              ? '#routine'
              : post.category === 'pression'
              ? '#pressionsociale'
              : post.category === 'burnout'
              ? '#burnout'
              : post.category === 'procrastination'
              ? '#focus'
              : '#solitude';
          const authorHandle = `@${(post.authorAlias || post.authorMatricule).replace(/\s+/g, '_')}`.toLowerCase();
          const inPost =
            post.content.toLowerCase().includes(needle) ||
            catTag.includes(needle) ||
            authorHandle.includes(needle) ||
            post.authorMatricule.toLowerCase().includes(needle);
          const inComments = post.comments?.some(
            (c) =>
              c.content.toLowerCase().includes(needle) ||
              `@${(c.authorAlias || c.authorMatricule).replace(/\s+/g, '_')}`.toLowerCase().includes(needle)
          );
          if (!inPost && !inComments) return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const matchContent = post.content.toLowerCase().includes(q);
          const matchAuthor =
            post.authorMatricule.toLowerCase().includes(q) ||
            (post.authorAlias && post.authorAlias.toLowerCase().includes(q));
          const matchMusic = Boolean(
            post.bgMusic &&
              (post.bgMusic.title?.toLowerCase().includes(q) ||
                post.bgMusic.artist?.toLowerCase().includes(q))
          );
          const matchComment = post.comments?.some((c) => c.content.toLowerCase().includes(q));
          if (!matchContent && !matchAuthor && !matchMusic && !matchComment) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.createdAt - a.createdAt;
      });
  }, [posts, statusFilter, selectedCategory, activeTagFilter, searchQuery]);

  const isPadlockUnlocked =
    isDailyMissionCompleted ||
    (user.completedMissionsCount ?? 0) > 0 ||
    (user.padlocksAvailable ?? 0) > 0 ||
    hasFullKeyAccess;

  const { lockedCount, escapedCount, audioCount, musicCount, photosCount, videosCount } = useMemo(() => {
    let locked = 0;
    let escaped = 0;
    let audio = 0;
    let music = 0;
    let photos = 0;
    let videos = 0;
    for (const p of posts) {
      const isEsc = p.status === 'escaped' || p.keysCount >= p.keysRequired;
      if (isEsc) escaped++;
      else locked++;
      if (p.audioNote) audio++;
      if (p.bgMusic) music++;
      if (p.imageUrl || p.comments?.some((c) => !!c.imageUrl)) photos++;
      if (p.videoUrl || p.comments?.some((c) => !!c.videoUrl)) videos++;
    }
    return {
      lockedCount: locked,
      escapedCount: escaped,
      audioCount: audio,
      musicCount: music,
      photosCount: photos,
      videosCount: videos,
    };
  }, [posts]);

  const hoursSaved = Math.floor((user.screenTimeSavedMinutes ?? 0) / 60);
  const minutesRemainder = (user.screenTimeSavedMinutes ?? 0) % 60;
  const yearlyTheme = getYearlyTheme();

  return (
    <div className="space-y-4 pb-20">
      {/* 1. EN-TÊTE ERGONOMIQUE UNIFIÉ : UNIVERS, AVEU, MISSION & CADENAS */}
      <div
        className={`relative rounded-3xl overflow-hidden border transition-colors ${
          theme === 'dark'
            ? 'border-white/15 bg-transparent'
            : 'border-zinc-300/90 bg-white/75 backdrop-blur-xs shadow-xs'
        }`}
      >
        <div
          className={`relative z-10 p-4 sm:p-6 space-y-3.5 ${
            theme === 'dark' ? 'text-white' : 'text-zinc-900'
          }`}
        >
          {/* Unboxed KPI line */}
          <div
            className={`flex items-center justify-between gap-2 text-[11px] font-mono flex-wrap ${
              theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-bold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-[#fb923c]' : 'text-orange-600'
                }`}
              >
                Le Mur
              </span>
              <span aria-hidden="true">·</span>
              <span className={`font-bold ${theme === 'dark' ? 'text-amber-300' : 'text-amber-700'}`}>
                {formatDayOrdinal(user.detentionDays || user.streakDays || 1)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{escapedCount} libérés</span>
              <span aria-hidden="true">·</span>
              <span
                className={`tabular-nums font-semibold ${
                  theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
                }`}
              >
                {hoursSaved}h {minutesRemainder}m gagnées
              </span>
            </div>
            <span className={`tabular-nums font-bold ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
              🔑 {user.keysAvailable} · 🔒 {user.padlocksAvailable ?? 0}
            </span>
          </div>

          <div>
            <h2
              className={`text-xl sm:text-2xl font-black tracking-tight leading-tight ${
                theme === 'dark' ? 'text-white' : 'text-zinc-950'
              }`}
            >
              Ton sanctuaire libre, hors des algorithmes.
            </h2>
            <p className={`text-xs sm:text-sm mt-1 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Ici, pas de filtres superficiels. Dépose tes aveux, offre tes 🔑 pour libérer les autres et valide ta mission quotidienne.
            </p>
          </div>

          {/* Mission du Jour — lecture aisée, texte complet sans coupure */}
          <div
            className={`rounded-2xl p-4 border space-y-3 ${
              isDailyMissionCompleted
                ? theme === 'dark'
                  ? 'bg-transparent border-emerald-500/45'
                  : 'bg-emerald-50/80 border-emerald-300'
                : theme === 'dark'
                ? 'bg-transparent border-[#f97316]/35'
                : 'bg-orange-50/60 border-orange-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-mono">
              <span
                className={`font-bold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-[#fb923c]' : 'text-orange-700'
                }`}
              >
                🎯 Mission du jour
              </span>
              <span
                className={`font-bold tabular-nums ${
                  theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
                }`}
              >
                +{dailyMission.keysReward} 🔑 · +1 🔒 · +{dailyMission.pointsReward} pts
              </span>
            </div>

            <div className="space-y-1.5">
              <h3
                className={`text-sm sm:text-base font-black leading-snug flex items-start gap-2 ${
                  isDailyMissionCompleted
                    ? theme === 'dark'
                      ? 'line-through text-emerald-300'
                      : 'line-through text-emerald-700'
                    : theme === 'dark'
                    ? 'text-white'
                    : 'text-zinc-950'
                }`}
              >
                <span className="shrink-0">{dailyMission.icon}</span>
                <span>{dailyMission.title}</span>
              </h3>
              <p
                className={`text-xs sm:text-sm leading-relaxed ${
                  theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'
                }`}
              >
                {dailyMission.description}
              </p>
              <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                → {dailyMission.realLifeAction}
              </p>
            </div>

            <button
              type="button"
              onClick={completeDailyMission}
              disabled={isDailyMissionCompleted}
              className={`w-full min-h-[42px] px-4 py-2 rounded-full text-xs font-mono font-black flex items-center justify-center gap-2 transition-all ${
                isDailyMissionCompleted
                  ? theme === 'dark'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 cursor-default'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default'
                  : 'evasion-btn-primary cursor-pointer'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3] shrink-0" />
              <span>
                {isDailyMissionCompleted
                  ? "Mission validée aujourd'hui ✓"
                  : `Valider la mission (+${dailyMission.keysReward} 🔑 +1 🔒)`}
              </span>
            </button>
          </div>

          {/* Primary 2x2 Action Grid — espacement régulier sans dépassement */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onOpenCreate}
              className="min-h-[46px] px-3 py-2.5 rounded-full evasion-btn-primary font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">Graver mon aveu</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPadlockPanel(!showPadlockPanel)}
              className={`min-h-[46px] px-3 py-2.5 rounded-full border text-xs sm:text-sm font-mono font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
                !isPadlockUnlocked ? 'opacity-80' : ''
              } ${
                showPadlockPanel
                  ? theme === 'dark'
                    ? 'bg-sky-600/35 border-sky-400 text-white'
                    : 'bg-sky-100 border-sky-500 text-sky-900'
                  : theme === 'dark'
                  ? 'bg-transparent hover:bg-white/5 border-white/15 text-sky-200'
                  : 'bg-white/80 hover:bg-sky-50 border-zinc-300 text-sky-800'
              }`}
            >
              <Lock className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-sky-300' : 'text-sky-700'}`} />
              <span>Cadenas</span>
              <span className="px-1.5 py-0.5 rounded-full bg-sky-400 text-zinc-950 font-black text-xs tabular-nums">
                {user.padlocksAvailable ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenLive?.()}
              className={`min-h-[44px] px-3 py-2 rounded-full border font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-transparent hover:bg-white/5 border-[#ff0050]/45 text-white'
                  : 'bg-white/80 hover:bg-rose-50 border-rose-300 text-zinc-950'
              }`}
            >
              <Radio className="w-4 h-4 text-[#ff0050] shrink-0" />
              <span className="truncate">
                {activeLives.length > 0 ? `Lives (${activeLives.length})` : 'Lives'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className={`min-h-[44px] px-3 py-2 rounded-full border text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
                showGuide
                  ? theme === 'dark'
                    ? 'bg-transparent border-[#f97316]/60 text-[#fb923c]'
                    : 'bg-orange-50 border-orange-400 text-orange-700'
                  : theme === 'dark'
                  ? 'bg-transparent hover:bg-white/5 border-white/15 text-zinc-200 hover:text-white'
                  : 'bg-white/80 hover:bg-zinc-100 border-zinc-300 text-zinc-800 hover:text-zinc-950'
              }`}
            >
              <span>📖</span>
              <span className="truncate">{showGuide ? 'Fermer' : "Mode d'emploi"}</span>
            </button>
          </div>

          {/* Quick Secondary Row — 2 boutons espacés proprement */}
          <div className="grid grid-cols-2 gap-3 pt-0.5">
            <button
              type="button"
              onClick={openWallStoryModal}
              className={`min-h-[40px] px-3 py-2 rounded-full border text-[11px] font-mono font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-transparent hover:bg-white/5 border-white/15 text-zinc-200 hover:text-[#fb923c]'
                  : 'bg-white/80 hover:bg-orange-50 border-zinc-300 text-zinc-800 hover:text-orange-700'
              }`}
            >
              <Share2 className={`w-3.5 h-3.5 shrink-0 ${theme === 'dark' ? 'text-[#fb923c]' : 'text-orange-600'}`} />
              <span className="truncate">Partager mon Mur</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!requireFullKeyAccess('Bouclier Anti-Scroll')) return;
                if (!detoxSession.isActive) startDetox(30, true);
                onOpenDetox();
              }}
              className={`min-h-[40px] px-3 py-2 rounded-full border text-[11px] font-mono font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-transparent hover:bg-white/5 border-white/15 text-zinc-200 hover:text-emerald-300'
                  : 'bg-white/80 hover:bg-emerald-50 border-zinc-300 text-zinc-800 hover:text-emerald-800'
              }`}
            >
              <Hourglass className={`w-3.5 h-3.5 shrink-0 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`} />
              <span className="truncate">{detoxSession.isActive ? 'Détox active' : 'Détox 30m (+5 🔑)'}</span>
            </button>
          </div>
        </div>

        {/* Expandable Concise Guide */}
        {showGuide && (
          <div
            className={`relative z-10 p-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs animate-fade-in ${
              theme === 'dark' ? 'bg-zinc-950/90 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div
              className={`p-3 rounded-xl border ${
                theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`font-bold mb-1 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}`}>1. Clés 🔑</div>
              <p className={`text-[11px] ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                Offre tes clés pour libérer un aveu (+100 pts). 10 clés offertes = 1 Passe-Partout.
              </p>
            </div>
            <div
              className={`p-3 rounded-xl border ${
                theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`font-bold mb-1 ${theme === 'dark' ? 'text-sky-400' : 'text-sky-700'}`}>2. Cadenas 🔒</div>
              <p className={`text-[11px] ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                Protège ta série 24h ou verrouille une tentation (+2 🔑).
              </p>
            </div>
            <div
              className={`p-3 rounded-xl border ${
                theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`font-bold mb-1 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>3. Univers &amp; Cour</div>
              <p className={`text-[11px] ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                À 10 🔑, ouvre La Cour, les MP et le mode Détox. Live à 50 🔑.
              </p>
            </div>
          </div>
        )}

        {/* Expandable Padlock Action Drawer */}
        {showPadlockPanel && (
          <div
            className={`relative z-10 p-4 border-t space-y-3 animate-fade-in ${
              theme === 'dark' ? 'bg-zinc-950/95 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div
                className={`text-xs font-extrabold flex items-center gap-1.5 font-mono ${
                  theme === 'dark' ? 'text-sky-300' : 'text-sky-800'
                }`}
              >
                <Lock className={`w-4 h-4 stroke-[2.5] ${theme === 'dark' ? 'text-sky-400' : 'text-sky-700'}`} />
                <span>CADENAS ({user.padlocksAvailable ?? 0} DISPO)</span>
              </div>
              {isDailyMissionCompleted ? (
                <button
                  type="button"
                  onClick={claimFreePadlock}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono font-extrabold flex items-center gap-1.5 cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-sky-500/25 hover:bg-sky-500/35 border-sky-400/60 text-sky-200'
                      : 'bg-sky-100 hover:bg-sky-200 border-sky-400 text-sky-900'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>+2 Cadenas</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={completeDailyMission}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[11px] font-mono font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Valider Mission → +1 🔒 +4 🔑</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                  theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <div>
                  <div className={`font-bold ${theme === 'dark' ? 'text-orange-400' : 'text-orange-700'}`}>
                    🔥 Bouclier Flamme
                  </div>
                  <p className={`text-[11px] mt-1 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    Protège ta série 24h (+250 pts).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={protectStreakWithPadlock}
                  disabled={!!user.isStreakProtectedByPadlock}
                  className={`w-full py-1.5 px-2 rounded-lg font-mono text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                    user.isStreakProtectedByPadlock
                      ? theme === 'dark'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-orange-500 hover:bg-orange-400 text-zinc-950 cursor-pointer'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{user.isStreakProtectedByPadlock ? 'Protégée 24h ✓' : 'Verrouiller (1 🔒)'}</span>
                </button>
              </div>

              <div
                className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                  theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <div>
                  <div className={`font-bold ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    📵 Couper une app
                  </div>
                  <p className={`text-[11px] mt-1 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    Bloque une distraction (+2 🔑 &amp; +200 pts).
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {['Réseaux', 'Insta', 'Scroll 23h', 'Jeux'].map((app) => (
                    <button
                      key={app}
                      type="button"
                      onClick={() => lockRealLifeTemptation(app)}
                      className={`flex-1 py-1 px-1.5 rounded-lg font-mono text-[10px] font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-zinc-800 hover:bg-sky-600 text-zinc-200 hover:text-white'
                          : 'bg-zinc-100 hover:bg-sky-600 text-zinc-800 hover:text-white border border-zinc-300'
                      }`}
                    >
                      <Lock className="w-2.5 h-2.5 text-sky-500 shrink-0" />
                      <span>{app}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                  theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <div>
                  <div className={`font-bold ${theme === 'dark' ? 'text-sky-400' : 'text-sky-700'}`}>
                    🤝 Sceller un aveu
                  </div>
                  <p className={`text-[11px] mt-1 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    Utilise Cadenas sous un aveu (+150 pts).
                  </p>
                </div>
                {user.lockedTemptations && user.lockedTemptations.length > 0 && (
                  <div className={`text-[10px] font-mono truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Actif : <span className={theme === 'dark' ? 'text-sky-400' : 'text-sky-700'}>{user.lockedTemptations.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 10-Key Access Gate */}
      {!hasFullKeyAccess && <KeyAccessGate compact onOpenCreate={onOpenCreate} />}

      {/* Radar Lives actifs */}
      <GlobalLiveRadarStrip onOpenLiveTab={onOpenLive} />

      {/* 4. BARRE DE NAVIGATION & RECHERCHE ÉPURÉE (RECHERCHE + FILTRES + #SUJETS) */}
      <div className="space-y-2">
        {/* Recherche + Bouton Amis + Filtre actif sur une ligne propre */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un ami, un nom, un #sujet ou mot-clé..."
              className={`w-full pl-8 pr-8 py-2 rounded-xl border text-xs font-mono focus:outline-none transition-colors ${
                theme === 'dark'
                  ? 'bg-transparent border-white/15 text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500/60'
                  : 'bg-white/40 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 shadow-2xs'
              }`}
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Effacer les caractères saisis"
                title="Effacer les caractères saisis"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/70 cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFriendsPanel((prev) => !prev)}
            className={`relative px-2.5 py-2 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
              showFriendsPanel
                ? 'bg-cyan-500 text-zinc-950 border-cyan-400'
                : theme === 'dark'
                ? 'bg-transparent hover:bg-white/5 border-white/15 text-cyan-300'
                : 'bg-white/40 hover:bg-zinc-100 border-zinc-200 text-cyan-700 shadow-2xs'
            }`}
            title="Voir mes amis et demandes en temps réel"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Amis ({friends.length})</span>
            {incomingFriendRequests.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none animate-pulse">
                {incomingFriendRequests.length}
              </span>
            )}
          </button>

          {activeTagFilter && (
            <button
              type="button"
              onClick={() => setActiveTagFilter(null)}
              className="px-2.5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-mono font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>{activeTagFilter}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Résultats Membres & Amis en temps réel depuis la barre du Mur */}
        {searchQuery.trim() && !searchQuery.trim().startsWith('#') && (
          <div
            className={`rounded-2xl border p-2.5 space-y-2 animate-fade-in ${
              theme === 'dark'
                ? 'bg-zinc-900/95 border-cyan-500/30'
                : 'bg-white border-cyan-300 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>Membres &amp; Amis trouvés ({memberSearchResults.length})</span>
              </span>
              {isSearchingMembers && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
            </div>

            {memberSearchResults.length === 0 && !isSearchingMembers ? (
              <div className="px-2 py-1.5 text-[11px] font-mono text-zinc-400">
                Aucun membre trouvé pour « {searchQuery.trim()} ».
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
                {memberSearchResults.map((member) => {
                  const status = getFriendshipStatus(member);
                  const isOnline =
                    Boolean(member.id && onlineUserLookup.ids.has(member.id)) ||
                    onlineUserLookup.mats.has(member.matricule.toLowerCase());
                  return (
                    <div
                      key={`${member.id}_${member.matricule}`}
                      className={`flex items-center justify-between gap-2 p-2 rounded-xl border ${
                        theme === 'dark'
                          ? 'bg-zinc-950/90 border-zinc-800'
                          : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openUserProfile(member)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
                      >
                        <div className="relative shrink-0">
                          <LiveAvatarWrapper userId={member.id} matricule={member.matricule}>
                            <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 bg-zinc-900 flex items-center justify-center">
                              <AvatarDisplay avatar={member.avatar || '⛓️'} alt={member.alias} />
                            </div>
                          </LiveAvatarWrapper>
                          {isOnline && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-zinc-950"
                              title="En ligne"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-xs font-mono font-bold truncate group-hover:underline ${
                                theme === 'dark' ? 'text-white' : 'text-zinc-900'
                              }`}
                            >
                              {member.alias || member.matricule}
                            </span>
                            <LivePseudoBadge userId={member.id} matricule={member.matricule} compact />
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500 truncate">
                            {member.matricule} · {isOnline ? 'En ligne' : 'Hors ligne'}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {status === 'friend' ? (
                          <span className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            <span>Ami</span>
                          </span>
                        ) : status === 'incoming' ? (
                          <button
                            type="button"
                            onClick={() =>
                              void acceptFriendRequest({ id: member.id, matricule: member.matricule })
                            }
                            className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[10px] font-mono font-bold cursor-pointer"
                          >
                            Accepter ✓
                          </button>
                        ) : status === 'outgoing' ? (
                          <span className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>En attente</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void sendFriendRequest(member)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Ajouter</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openDirectChat(member)}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                          title="Discuter en privé"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>Discuter</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Panneau Mes Amis & Demandes en temps réel */}
        {showFriendsPanel && (
          <div
            className={`rounded-2xl border p-3 space-y-2.5 animate-fade-in ${
              theme === 'dark'
                ? 'bg-zinc-900/95 border-cyan-500/40'
                : 'bg-white border-cyan-300 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-400">
                <Users className="w-4 h-4" />
                <span>Mes Amis en temps réel ({friends.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFriendsPanel(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {incomingFriendRequests.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono font-bold uppercase text-amber-400">
                  Demandes reçues ({incomingFriendRequests.length})
                </div>
                {incomingFriendRequests.map((req) => (
                  <div
                    key={req.id || req.matricule}
                    className={`flex items-center justify-between gap-2 p-2 rounded-xl border ${
                      theme === 'dark'
                        ? 'bg-zinc-950 border-amber-500/30'
                        : 'bg-amber-50/70 border-amber-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        openUserProfile({
                          id: req.id,
                          matricule: req.matricule,
                          alias: req.alias,
                          avatar: req.avatar,
                          neonColor: req.neonColor,
                        })
                      }
                      className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-full overflow-hidden border border-zinc-700 shrink-0">
                        <AvatarDisplay avatar={req.avatar || '⛓️'} alt={req.alias} />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-xs font-mono font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                          {req.alias || req.matricule}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 truncate">{req.matricule}</div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void acceptFriendRequest({ id: req.id, matricule: req.matricule })}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[10px] font-mono font-bold cursor-pointer"
                      >
                        Accepter ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => void declineFriendRequest({ id: req.id, matricule: req.matricule })}
                        className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono cursor-pointer"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {friends.length === 0 ? (
              <p className="text-[11px] font-mono text-zinc-400">
                Aucun ami ajouté pour le moment. Tape le nom d’un membre dans la barre de recherche du Mur juste au-dessus pour l’ajouter et discuter en privé !
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
                {friends.map((friend) => {
                  const isOnline =
                    onlineUserLookup.ids.has(friend.id) ||
                    onlineUserLookup.mats.has(friend.matricule.toLowerCase());
                  const hasActiveFlame = Boolean(
                    friend.activeFlame && friend.activeFlame.expiresAt > Date.now()
                  );
                  const friendTarget: DirectChatTarget = {
                    id: friend.id,
                    matricule: friend.matricule,
                    alias: friend.alias,
                    avatar: friend.avatar,
                    neonColor: friend.neonColor,
                  };
                  return (
                    <div
                      key={friend.id || friend.matricule}
                      className={`flex items-center justify-between gap-2 p-2 rounded-xl border ${
                        theme === 'dark' ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openUserProfile(friendTarget)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="relative shrink-0">
                          <LiveAvatarWrapper userId={friend.id} matricule={friend.matricule}>
                            <div
                              className={
                                hasActiveFlame
                                  ? 'p-[2px] rounded-full bg-gradient-to-tr from-orange-500 via-red-500 to-amber-400 shadow-[0_0_10px_rgba(249,115,22,0.5)]'
                                  : ''
                              }
                            >
                              <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 bg-zinc-950">
                                <AvatarDisplay avatar={friend.avatar || '⛓️'} alt={friend.alias} />
                              </div>
                            </div>
                          </LiveAvatarWrapper>
                          {hasActiveFlame && (
                            <span
                              className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white border border-zinc-950 flex items-center justify-center"
                              title="Flamme 24h active 🔥"
                            >
                              <Flame className="w-2.5 h-2.5" />
                            </span>
                          )}
                          {isOnline && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-zinc-950"
                              title="En ligne"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-mono font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                              {friend.alias || friend.matricule}
                            </span>
                            <ProfileStatusBadges
                              isVerified={friend.isVerified}
                              profileType={friend.profileType}
                              compact
                            />
                            <LivePseudoBadge userId={friend.id} matricule={friend.matricule} compact />
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500 truncate">
                            {friend.matricule} · {hasActiveFlame ? '🔥 Flamme 24h · ' : ''}{isOnline ? 'En ligne' : 'Hors ligne'}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openDirectChat(friendTarget)}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>Discuter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeFriend({ id: friend.id, matricule: friend.matricule })}
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 cursor-pointer"
                          title="Retirer des amis"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Onglets de flux alignés sur une seule ligne */}
        <div
          className={`flex items-center justify-between gap-1 p-1 rounded-xl overflow-x-auto no-scrollbar scroll-smooth touch-pan-x border ${
            theme === 'dark' ? 'bg-transparent border-white/15' : 'bg-white/75 border-zinc-300 shadow-2xs'
          }`}
        >
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`flex-1 shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all text-center cursor-pointer ${
              statusFilter === 'all'
                ? theme === 'dark'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'bg-zinc-950 text-white font-bold'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-700 hover:text-zinc-950'
            }`}
          >
            Pour toi ({posts.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('locked')}
            className={`flex-1 shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'locked'
                ? theme === 'dark'
                  ? 'bg-red-500/20 text-red-300 font-semibold'
                  : 'bg-red-100 text-red-800 font-bold'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-700 hover:text-zinc-950'
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>Verrouillés ({lockedCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('escaped')}
            className={`flex-1 shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'escaped'
                ? theme === 'dark'
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                  : 'bg-emerald-100 text-emerald-800 font-bold'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-700 hover:text-zinc-950'
            }`}
          >
            <Unlock className="w-3 h-3" />
            <span>Libérés ({escapedCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('audio')}
            className={`flex-1 shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'audio'
                ? theme === 'dark'
                  ? 'bg-purple-500/20 text-purple-300 font-semibold'
                  : 'bg-purple-100 text-purple-800 font-bold'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-700 hover:text-zinc-950'
            }`}
          >
            <Mic className="w-3 h-3" />
            <span>Vocaux ({audioCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('music')}
            className={`flex-1 shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'music'
                ? theme === 'dark'
                  ? 'bg-orange-500/20 text-orange-300 font-semibold'
                  : 'bg-orange-100 text-orange-800 font-bold'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-700 hover:text-zinc-950'
            }`}
          >
            <Music className="w-3 h-3" />
            <span>Musique ({musicCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('photos')}
            className={`flex-1 shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'photos'
                ? theme === 'dark'
                  ? 'bg-sky-500/20 text-sky-300 font-semibold'
                  : 'bg-sky-100 text-sky-800 font-bold'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-700 hover:text-zinc-950'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>Photos ({photosCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('videos')}
            className={`flex-1 shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'videos'
                ? theme === 'dark'
                  ? 'bg-[#ff0050]/20 text-pink-300 font-semibold'
                  : 'bg-rose-100 text-rose-800 font-bold'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-700 hover:text-zinc-950'
            }`}
          >
            <Video className="w-3 h-3" />
            <span>Vidéos ({videosCount})</span>
          </button>
        </div>

        {/* Sujets # & Salons minimalistes sur une ligne + bouton Créer #Sujet / Salon */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-0.5">
          <button
            type="button"
            onClick={() => {
              if (!requireFullKeyAccess('Créer #Sujet / Salon')) return;
              setShowCreateSalonInput((prev) => !prev);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-colors border flex items-center gap-1 shrink-0 cursor-pointer ${
              !hasFullKeyAccess ? 'opacity-70' : ''
            } ${
              showCreateSalonInput
                ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/40'
            }`}
          >
            {hasFullKeyAccess ? <PlusCircle className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-amber-400" />}
            <span>Créer #Sujet / Salon</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setActiveTagFilter(null);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-colors border cursor-pointer shrink-0 ${
              selectedCategory === 'all' && !activeTagFilter
                ? theme === 'dark'
                  ? 'bg-zinc-800 text-amber-300 font-bold border-zinc-700'
                  : 'bg-zinc-900 text-white font-bold border-zinc-900'
                : theme === 'dark'
                ? 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 border-zinc-800/80'
                : 'bg-white text-zinc-600 hover:text-zinc-950 border-zinc-200'
            }`}
          >
            Tous les sujets
          </button>

          {customSalons.map((salon) => (
            <button
              type="button"
              key={salon.id}
              onClick={() => {
                setSelectedCategory('all');
                setActiveTagFilter(activeTagFilter === salon.tag ? null : salon.tag);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-colors border cursor-pointer shrink-0 ${
                activeTagFilter?.toLowerCase() === salon.tag.toLowerCase()
                  ? 'bg-emerald-500/25 text-emerald-300 font-bold border-emerald-400'
                  : theme === 'dark'
                  ? 'bg-zinc-900/50 text-emerald-400 hover:text-emerald-300 border-emerald-500/30'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {salon.tag} 🔑
            </button>
          ))}

          {[
            { id: 'ecrans' as const, label: '#Écrans 🔑' },
            { id: 'routine' as const, label: '#Routine 🔑' },
            { id: 'pression' as const, label: '#Pression 🔑' },
            { id: 'burnout' as const, label: '#Burnout 🔑' },
            { id: 'procrastination' as const, label: '#Focus 🔑' },
            { id: 'solitude' as const, label: '#Solitude 🔑' },
          ].map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setActiveTagFilter(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-colors border cursor-pointer shrink-0 ${
                selectedCategory === cat.id && !activeTagFilter
                  ? theme === 'dark'
                    ? 'bg-zinc-800 text-amber-300 font-bold border-zinc-700'
                    : 'bg-zinc-900 text-white font-bold border-zinc-900'
                  : theme === 'dark'
                  ? 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 border-zinc-800/80'
                  : 'bg-white text-zinc-600 hover:text-zinc-950 border-zinc-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Formulaire minimaliste de création de #Sujet / Salon */}
        {showCreateSalonInput && (
          <form
            onSubmit={handleCreateCustomSalonSubmit}
            className={`p-2.5 rounded-xl border flex items-center gap-2 animate-fade-in ${
              theme === 'dark' ? 'bg-zinc-900/95 border-emerald-500/40' : 'bg-emerald-50/70 border-emerald-300'
            }`}
          >
            <input
              type="text"
              maxLength={32}
              value={newSalonName}
              onChange={(e) => setNewSalonName(e.target.value)}
              placeholder="Nom du nouveau #Sujet ou Salon (ex: Sport, Lecture, Musique...)"
              className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-mono focus:outline-none ${
                theme === 'dark'
                  ? 'bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-500 focus:border-emerald-400'
                  : 'bg-white border-emerald-200 text-zinc-900 placeholder:text-zinc-400'
              }`}
              autoFocus
            />
            <button
              type="submit"
              disabled={!newSalonName.trim()}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-mono font-bold text-xs shrink-0 cursor-pointer"
            >
              Créer 🔑
            </button>
            <button
              type="button"
              onClick={() => setShowCreateSalonInput(false)}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* 6. POSTS STREAM (FIL SOCIAL) */}
      <div className="space-y-3.5">
        {filteredPosts.length === 0 ? (
          <div
            className={`text-center py-12 px-4 rounded-3xl border ${
              theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white/80 border-zinc-200 shadow-xs'
            }`}
          >
            <Lock className={`w-10 h-10 mx-auto mb-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`} />
            <h3 className={`text-sm font-bold ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
              {posts.length === 0 ? 'Aucune publication pour le moment' : 'Aucune publication dans ce filtre'}
            </h3>
            <p className={`text-xs mt-1 max-w-sm mx-auto ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {posts.length === 0
                ? 'Le Mur est vierge et prêt pour les nouveaux utilisateurs. Publie le tout premier message, photo ou vocal !'
                : 'Change de sujet # ou publie le premier message dans cette catégorie.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {activeTagFilter && (
                <button
                  type="button"
                  onClick={() => setActiveTagFilter(null)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300'
                  }`}
                >
                  Réinitialiser le filtre {activeTagFilter}
                </button>
              )}
              <button
                type="button"
                onClick={onOpenCreate}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
              >
                Publier le premier message
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`flex items-center justify-between gap-2 px-1 text-[11px] font-mono ${
                theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'
              }`}
            >
              <span>
                {filteredPosts.length === 1 ? '1 aveu sur Le Mur' : `${filteredPosts.length} aveux sur Le Mur`}
              </span>
              <span className={`tabular-nums font-bold ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>
                {filteredPosts.length} / {posts.length}
              </span>
            </div>

            <div className="flex flex-col gap-3.5 w-full">
              {filteredPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 6. PIED DE PAGE : MENTIONS, CONFIDENTIALITÉ ET SUPPORT */}
      <div
        className={`mt-8 rounded-3xl p-5 border text-center transition-all ${
          theme === 'dark'
            ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
            : 'bg-white border-zinc-200 text-zinc-600 shadow-xs'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="space-y-1 text-center">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                ⚡ Créé par Digital Agency
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Conformité RGPD & LCEN
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono justify-center pt-1">
              <button
                type="button"
                onClick={() => setLegalModalTab('privacy')}
                className="hover:text-amber-400 underline underline-offset-2 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Shield className="w-3 h-3 text-emerald-500" />
                <span>Politique de Confidentialité</span>
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setLegalModalTab('cgv')}
                className="hover:text-amber-400 underline underline-offset-2 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Scale className="w-3 h-3 text-amber-500" />
                <span>CGV / CGU & Mentions</span>
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setLegalModalTab('agency')}
                className="hover:text-emerald-400 underline underline-offset-2 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>À propos de Digital Agency</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            <a
              href="https://wa.me/33684242949?text=Bonjour%20Digital%20Agency%2C%20je%20vous%20contacte%20depuis%20l%27application%20%C3%89VASION."
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
              title="Contacter Digital Agency sur WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5 fill-white/20" />
              <span>Contacter sur WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* Modal Politique de Confidentialité, CGV & Digital Agency */}
      {legalModalTab && (
        <LegalPrivacyModal
          isOpen={true}
          initialTab={legalModalTab}
          onClose={() => setLegalModalTab(null)}
        />
      )}
    </div>
  );
};
