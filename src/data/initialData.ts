import { ConfessionPost, ChatMessage, UserBadge, UserProfile, RankInfo, DailyMission } from '../types';
import { HUNDRED_CONFESSIONS } from './confessions100';

export function createInitialUser(): UserProfile {
  const todayStr = new Date().toISOString().slice(0, 10);
  const adjectives = ['Spectre', 'Ombre', 'Rebelle', 'Fugitif', 'Évadé', 'Fantôme', 'Vagabond', 'Solitaire', 'Insurgé', 'Nomade'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randNum = Math.floor(1000 + Math.random() * 9000);
  return {
    id: 'USR_' + Math.floor(10000 + Math.random() * 90000),
    matricule: 'Détenu #' + Math.floor(100 + Math.random() * 900),
    alias: `${adjective}_#${randNum}`,
    avatar: '⛓️',
    cellNumber: 'Bloc ' + String.fromCharCode(65 + Math.floor(Math.random() * 4)) + '-' + Math.floor(1 + Math.random() * 20),
    detentionDays: 1,
    keysAvailable: 0,
    escapedCount: 0,
    keysGivenTotal: 0,
    badges: [],
    referralCode: 'EVASION-' + Math.floor(1000 + Math.random() * 9000),
    referralsCount: 0,
    isVipCell: false,
    neonColor: 'emerald',
    cellBorderFrame: 'none',
    isVipSubscriber: false,
    purchasedKits: [],
    hasPassePartoutCount: 0,
    streakDays: 1,
    firstJoinedDate: todayStr,
    lastActiveDate: todayStr,
    points: 0,
    completedMissionsCount: 0,
    padlocksAvailable: 0,
    isStreakProtectedByPadlock: false,
    lockedTemptations: [],
    lastMidnightResetDate: todayStr,
    screenTimeSavedMinutes: 0,
    publicShareSlug: `profil-anonyme-${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6).padEnd(6, 'x')}`,
  };
}

export const INITIAL_USER: UserProfile = createInitialUser();

export function getUserRank(keysGivenTotal: number): RankInfo {
  if (keysGivenTotal >= 100) {
    return {
      rank: 'Libéré',
      title: 'Libéré Suprême',
      icon: '🕊️',
      minKeys: 100,
      nextRank: null,
      keysForNext: 0,
      progressPercent: 100,
      color: 'text-emerald-500',
      badgeBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500',
      description: 'Légende de la résistance. Tu as brisé tous les barreaux.',
    };
  }
  if (keysGivenTotal >= 50) {
    const keysInTier = keysGivenTotal - 50;
    const progress = Math.min(100, Math.round((keysInTier / 50) * 100));
    return {
      rank: 'Cerveau',
      title: 'Cerveau de la Révolte',
      icon: '🧠',
      minKeys: 50,
      nextRank: 'Libéré',
      keysForNext: 100 - keysGivenTotal,
      progressPercent: progress,
      color: 'text-purple-500',
      badgeBg: 'bg-purple-500/15 border-purple-500/40 text-purple-400',
      description: 'Stratège redouté. Tu coordonnes les libérations de masse.',
    };
  }
  if (keysGivenTotal >= 10) {
    const keysInTier = keysGivenTotal - 10;
    const progress = Math.min(100, Math.round((keysInTier / 40) * 100));
    return {
      rank: 'Complice',
      title: 'Complice Actif',
      icon: '🗝️',
      minKeys: 10,
      nextRank: 'Cerveau',
      keysForNext: 50 - keysGivenTotal,
      progressPercent: progress,
      color: 'text-amber-500',
      badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-500',
      description: 'Pilier du collectif. Tu distribues les clés aux codétenus.',
    };
  }
  const progress = Math.min(100, Math.round((keysGivenTotal / 10) * 100));
  return {
    rank: 'Nouveau',
    title: 'Nouveau Détenu',
    icon: '⛓️',
    minKeys: 0,
    nextRank: 'Complice',
    keysForNext: 10 - keysGivenTotal,
    progressPercent: progress,
    color: 'text-zinc-400',
    badgeBg: 'bg-zinc-800 border-zinc-700 text-zinc-300',
    description: 'Vient d\'arriver dans les cellules. Doit faire ses preuves.',
  };
}

export const DAILY_MISSIONS: DailyMission[] = [
  {
    id: 'mission_meal_no_screen',
    title: 'Repas Sacré Sans Écran',
    description: 'Mange ton prochain repas complet sans écran ni smartphone.',
    realLifeAction: 'Pose ton téléphone dans une autre pièce pendant tout le repas.',
    icon: '🍽️',
    keysReward: 4,
    pointsReward: 50,
  },
  {
    id: 'mission_walk_eyes_up',
    title: 'Marche les Yeux Levés',
    description: 'Fais une marche de 20 minutes dehors sans musique ni écouteurs.',
    realLifeAction: 'Regarde le ciel, les gens et le monde réel au lieu de fixer ton écran.',
    icon: '👟',
    keysReward: 4,
    pointsReward: 50,
  },
  {
    id: 'mission_call_friend',
    title: 'Vraie Voix Humaine',
    description: 'Passe un vrai appel vocal de 5 min à un proche sans scroller.',
    realLifeAction: 'Une voix humaine authentique remplace 100 stories fantômes.',
    icon: '📞',
    keysReward: 4,
    pointsReward: 60,
  },
  {
    id: 'mission_paper_read',
    title: 'Lecture Analogique',
    description: 'Lis au moins 10 pages d\'un livre physique ou d\'un journal papier.',
    realLifeAction: 'Zéro pixel, zéro notification, juste du papier et du calme.',
    icon: '📖',
    keysReward: 4,
    pointsReward: 50,
  },
  {
    id: 'mission_morning_delayed',
    title: 'Matin Sans Dopamine',
    description: 'Attends 30 minutes après ton réveil avant de déverrouiller ton téléphone.',
    realLifeAction: 'Bois de l\'eau, étire-toi et laisse ton cerveau se réveiller naturellement.',
    icon: '☀️',
    keysReward: 4,
    pointsReward: 70,
  },
  {
    id: 'mission_tidy_cell',
    title: 'Rangement de Cellule IRL',
    description: 'Range ton bureau ou ta pièce pendant 15 minutes sans distraction.',
    realLifeAction: 'Un espace ordonné apaise immédiatement la surcharge mentale.',
    icon: '🧹',
    keysReward: 4,
    pointsReward: 50,
  },
  {
    id: 'mission_deep_work',
    title: 'Focus 25 Min en Mode Avion',
    description: 'Travaille ou lis pendant 25 minutes consécutives en mode avion strict.',
    realLifeAction: 'Active le mode avion et concentre-toi sur une seule tâche essentielle.',
    icon: '🎯',
    keysReward: 4,
    pointsReward: 60,
  },
];

export const ALL_BADGES: Omit<UserBadge, 'unlockedAt'>[] = [
  {
    id: 'badge_detainee',
    name: 'Matricule Enregistré',
    description: 'Entré dans le collectif ÉVASION',
    icon: '🆔',
  },
  {
    id: 'badge_esprit_libre',
    name: 'Esprit Libre',
    description: 'A accompli une session complète de Défi Détox',
    icon: '🕊️',
  },
  {
    id: 'badge_clef_or',
    name: 'Passe-Partout',
    description: 'A offert 10 clés pour libérer des codétenus',
    icon: '🗝️',
  },
  {
    id: 'badge_evade_supreme',
    name: 'Grand Libéré',
    description: 'A réussi à faire libérer un défi personnel avec 5 clés',
    icon: '🔓',
  },
  {
    id: 'badge_parrain_vip',
    name: 'Passeur de Liberté',
    description: 'A recruté 3 codétenus et débloqué la Cellule VIP',
    icon: '⚡',
  },
];

export const INITIAL_POSTS: ConfessionPost[] = HUNDRED_CONFESSIONS;

export const MIDNIGHT_ROTATION_POSTS: Omit<ConfessionPost, 'id' | 'createdAt'>[] = [
  {
    authorId: 'USR_MIDNIGHT_1',
    authorMatricule: 'Détenu #219',
    authorAlias: 'Veilleur_Minuit',
    authorAvatar: '🔥',
    content: 'Minuit vient de sonner. J\'ai supprimé les applis de scroll et coupé les notifications de mon téléphone pour de bon. J\'engage mon Pacte Cadenassé : plus aucun écran dans ma chambre à coucher pendant 14 jours.',
    category: 'ecrans',
    keysCount: 1,
    keysRequired: 5,
    padlocksSealCount: 2,
    status: 'locked',
    givenByMe: false,
    keyDonors: ['Détenu #701'],
  },
  {
    authorId: 'USR_MIDNIGHT_2',
    authorMatricule: 'Détenu #640',
    authorAlias: 'Clara_Rebelle',
    authorAvatar: '🕊️',
    content: 'Nouvelle journée, nouvelle cellule à ouvrir. Aujourd\'hui je reprends le sport et j\'appelle mes grands-parents au lieu de scroller pendant ma pause déjeuner. Qui me donne les 3 clés pour sceller ce départ ?',
    category: 'routine',
    keysCount: 1,
    keysRequired: 3,
    padlocksSealCount: 1,
    status: 'locked',
    givenByMe: false,
    keyDonors: ['Détenu #310'],
  },
  {
    authorId: 'USR_MIDNIGHT_3',
    authorMatricule: 'Détenu #502',
    authorAlias: 'Nomade_Analogique',
    authorAvatar: '🛡️',
    content: 'J\'ai passé toute ma soirée d\'hier à comparer ma vie à celle d\'inconnus sur les réseaux. À partir de ce minuit, je bloque les applications sociales avec un Cadenas et je relance mon projet musical.',
    category: 'pression',
    keysCount: 2,
    keysRequired: 5,
    padlocksSealCount: 2,
    status: 'locked',
    givenByMe: false,
    keyDonors: ['Détenu #119', 'Détenu #844'],
  },
];

export const INITIAL_CHAT: ChatMessage[] = [];

export const INMATE_RANDOM_CHAT_MESSAGES: string[] = [];

