import { PostComment, PostCategory } from '../types';

export interface VirtualInmate {
  id: string;
  matricule: string;
  alias: string;
  avatar: string;
}

export const VIRTUAL_INMATES: VirtualInmate[] = [
  { id: 'usr_v101', matricule: 'Détenu #404', alias: 'Néo_Débranché', avatar: '🐺' },
  { id: 'usr_v102', matricule: 'Détenu #812', alias: 'Aurore_Analog', avatar: '🌿' },
  { id: 'usr_v103', matricule: 'Détenu #558', alias: 'Julien_Vainqueur', avatar: '⚡' },
  { id: 'usr_v104', matricule: 'Détenu #331', alias: 'Camille_Lumière', avatar: '🕊️' },
  { id: 'usr_v105', matricule: 'Détenu #905', alias: 'Marc_Libéré', avatar: '🗝️' },
  { id: 'usr_v106', matricule: 'Détenu #228', alias: 'Sonia_SansFiltre', avatar: '🔥' },
  { id: 'usr_v107', matricule: 'Détenu #714', alias: 'Maxime_Focus', avatar: '🦅' },
  { id: 'usr_v108', matricule: 'Détenu #602', alias: 'Emma_Vivant', avatar: '🌸' },
  { id: 'usr_v109', matricule: 'Détenu #884', alias: 'Alex_Offline', avatar: '🛡️' },
  { id: 'usr_v110', matricule: 'Détenu #312', alias: 'Inès_Sereine', avatar: '⭐' },
  { id: 'usr_v111', matricule: 'Détenu #995', alias: 'Youssef_Détox', avatar: '💎' },
  { id: 'usr_v112', matricule: 'Détenu #119', alias: 'Clara_Libérée', avatar: '🏹' },
];

// Sample authentic photos for comments
export const VIRTUAL_COMMENT_PHOTOS = [
  '/assets/images/evasion_detox_sanctuary_1794476801246.jpg',
  '/assets/images/evasion_insignia_key_1794476800390.jpg',
  '/assets/images/evasion_hero_rebellion_1794476799526.jpg',
];

// Preset realistic comments by category
const COMMENTS_BY_CATEGORY: Record<PostCategory, { text: string; hasPhoto?: boolean; photoIdx?: number; hasAudio?: boolean; audioDuration?: number }[]> = {
  ecrans: [
    {
      text: "Je t'ai offert 1 clé directe. J'étais à 6h d'écran il y a 3 semaines. J'ai désactivé les notifications et aujourd'hui je lis 30 pages par soir. Tiens bon !",
      hasPhoto: true,
      photoIdx: 0,
    },
    {
      text: "Ton cerveau réclame du repos, pas de la dopamine artificielle. Pose ton téléphone dans une autre pièce pendant 1 heure. Tu vas revivre.",
      hasAudio: true,
      audioDuration: 6,
    },
    {
      text: "Courage codétenu ! Chaque fois que tu résistes à ouvrir les applis de scroll, c'est une victoire sur l'algorithme.",
    },
    {
      text: "Prends ma clé ! J'ai cadenassé ma flamme ce matin et mis mon téléphone en noir et blanc, ça coupe net l'envie compulsive de scroller.",
      hasAudio: true,
      audioDuration: 8,
    },
    {
      text: "On est des milliers dans la même cellule invisible. Le premier pas, c'est d'oser l'avouer comme tu viens de le faire.",
    },
  ],
  routine: [
    {
      text: "J'ai vécu exactement ça pendant 4 ans dans la finance. Démissionner m'a sauvé la vie. La peur est normale, mais la liberté n'a pas de prix.",
      hasPhoto: true,
      photoIdx: 1,
    },
    {
      text: "1 clé pour toi ! Commence par changer une seule micro-habitude dès demain matin : 15 min de marche sans écouteurs.",
    },
    {
      text: "La vraie prison, c'est le confort qui nous anesthésie. Fier de ta décision, je te soutiens à 100% !",
      hasAudio: true,
      audioDuration: 7,
    },
    {
      text: "Je t'envoie toute ma force. Brise cette routine, la vraie vie t'attend dehors.",
    },
  ],
  pression: [
    {
      text: "Instagram c'est le royaume du faux. Personne ne poste ses factures en retard ou ses soirées de solitude. Ne te compare jamais à une vitrine.",
      hasPhoto: true,
      photoIdx: 2,
    },
    {
      text: "Tu as tellement raison. Le jour où j'ai arrêté de chercher la validation d'inconnus, j'ai retrouvé le sommeil. Clé offerte !",
      hasAudio: true,
      audioDuration: 5,
    },
    {
      text: "La vulnérabilité est le plus grand acte de courage moderne. Bravo pour ta lucidité.",
    },
    {
      text: "On se libère ensemble. Reste fidèle à ce que tu ressens, le reste c'est du bruit.",
    },
  ],
  burnout: [
    {
      text: "Arrête-toi maintenant avant que ton corps ne le fasse pour toi. Aucun job ne mérite de détruire ta santé mentale. Prends ma clé et repose-toi.",
      hasAudio: true,
      audioDuration: 8,
    },
    {
      text: "J'ai frôlé le burn-out l'hiver dernier. Le mode Détox 1h de l'appli avec le son pluie m'a appris à réapprendre à respirer sans culpabiliser.",
      hasPhoto: true,
      photoIdx: 0,
    },
    {
      text: "Tu n'es pas une machine de productivité. Tu es un être humain. Accordes-toi de la bienveillance ce soir.",
    },
    {
      text: "Plein de soutien camarade. Déconnecte tout ce week-end, rien ne presse autant qu'on veut te le faire croire.",
    },
  ],
  procrastination: [
    {
      text: "Applique la règle des 2 minutes : fais juste la première action ridicule. Ouvrir le document. Le reste suit tout seul. Clé donnée !",
    },
    {
      text: "La procrastination cache souvent une peur de ne pas être parfait. Fais-le imparfaitement, mais fais-le !",
      hasAudio: true,
      audioDuration: 6,
    },
    {
      text: "J'ai coupé les réseaux pour mes révisions et mon cerveau a enfin redémarré. On est avec toi !",
      hasPhoto: true,
      photoIdx: 1,
    },
    {
      text: "Une clé de plus pour faire sauter tes doutes. Lance-toi sans réfléchir pendant 20 minutes !",
    },
  ],
  solitude: [
    {
      text: "Tu n'es pas seul ce soir. Même si on ne se connaît pas physiquement, ici on est tous reliés par la même quête d'authenticité. Clé offerte !",
      hasAudio: true,
      audioDuration: 7,
    },
    {
      text: "Envoie-moi un message dans La Cour si tu as besoin de parler. La solitude numérique est une illusion, on est là.",
    },
    {
      text: "Ton aveu m'a touché droit au cœur. Merci de briser le silence. On se libère tous ensemble.",
      hasPhoto: true,
      photoIdx: 2,
    },
    {
      text: "Force à toi codétenu. Demain est une nouvelle chance d'aller vers les autres.",
    },
  ],
};

/**
 * Returns 1 to 4 pre-seeded realistic virtual comments for a given confession post.
 */
export function getVirtualCommentsForPost(
  postId: string,
  category: PostCategory,
  authorMatricule: string,
  postCreatedAt: number
): PostComment[] {
  // Use post ID hash for deterministic but diverse comments
  let hash = 0;
  for (let i = 0; i < postId.length; i++) {
    hash = (hash << 5) - hash + postId.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const categoryPool = COMMENTS_BY_CATEGORY[category] || COMMENTS_BY_CATEGORY.ecrans;
  const numComments = 1 + (hash % 3); // 1, 2, or 3 comments

  const comments: PostComment[] = [];
  const usedInmateIdxs = new Set<number>();

  for (let i = 0; i < numComments; i++) {
    // Pick an inmate distinct from author
    let inmateIdx = (hash + i * 3) % VIRTUAL_INMATES.length;
    while (
      usedInmateIdxs.has(inmateIdx) ||
      VIRTUAL_INMATES[inmateIdx].matricule === authorMatricule
    ) {
      inmateIdx = (inmateIdx + 1) % VIRTUAL_INMATES.length;
    }
    usedInmateIdxs.add(inmateIdx);
    const inmate = VIRTUAL_INMATES[inmateIdx];

    const templateIdx = (hash + i * 2) % categoryPool.length;
    const template = categoryPool[templateIdx];

    // Timestamp shortly after the post
    const commentDelay = (i + 1) * (3 + (hash % 8)) * 60 * 1000;
    const commentTime = Math.min(Date.now() - 30 * 1000, postCreatedAt + commentDelay);

    const comment: PostComment = {
      id: `comm_${postId}_${i + 1}`,
      postId,
      authorId: inmate.id,
      authorMatricule: inmate.matricule,
      authorAlias: inmate.alias,
      authorAvatar: inmate.avatar,
      content: template.text,
      imageUrl: template.hasPhoto && typeof template.photoIdx === 'number'
        ? VIRTUAL_COMMENT_PHOTOS[template.photoIdx % VIRTUAL_COMMENT_PHOTOS.length]
        : undefined,
      createdAt: commentTime,
    };

    comments.push(comment);
  }

  return comments;
}

/**
 * Creates a single live virtual comment to simulate active inmate support
 * when a user creates a new aveu or periodically on recent posts.
 */
export function generateLiveVirtualComment(postId: string, category: PostCategory): PostComment {
  const randomInmate = VIRTUAL_INMATES[Math.floor(Math.random() * VIRTUAL_INMATES.length)];
  const pool = COMMENTS_BY_CATEGORY[category] || COMMENTS_BY_CATEGORY.ecrans;
  const template = pool[Math.floor(Math.random() * pool.length)];

  return {
    id: `comm_live_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    postId,
    authorId: randomInmate.id,
    authorMatricule: randomInmate.matricule,
    authorAlias: randomInmate.alias,
    authorAvatar: randomInmate.avatar,
    content: template.text,
    imageUrl: template.hasPhoto && typeof template.photoIdx === 'number'
      ? VIRTUAL_COMMENT_PHOTOS[template.photoIdx % VIRTUAL_COMMENT_PHOTOS.length]
      : undefined,
    createdAt: Date.now(),
  };
}
