import { KitItem, AffiliateResource, ViralVideoScript } from '../types';

export const DIGITAL_KITS: KitItem[] = [
  {
    id: 'kit_detox_7days',
    title: 'Détox Téléphone en 7 Jours',
    subtitle: 'Le protocole radical pour reprendre 3h par jour et calmer le brouillard cérébral',
    price: '2.99 €',
    amount: 2.99,
    category: 'Détox & Clarté',
    readingTime: '12 min de lecture',
    icon: '📱',
    badge: 'LE PLUS VENDU',
    description: 'Un protocole pas à pas, jour après jour, sans culpabilité mais avec des règles physiques inflexibles pour briser le réflexe pavlovien du déverrouillage compulsif.',
    summary: '7 étapes progressives pour désamorcer la dopamine artificielle et retrouver ta concentration naturelle sans supprimer tes applis utiles.',
    chapters: [
      {
        title: 'Jour 1 : L\'Écran Noir & Blanc (Grayscale)',
        points: [
          'Active le filtre noir et blanc dans les Réglages d\'accessibilité de ton smartphone.',
          'Supprime toutes les bannières rouges et notifications de notification sonore, sauf appels directs des proches.',
          'Constat immédiat : ton cerveau perd instantanément 60% de son attrait visuel pour les réseaux vidéo.',
        ],
        keyTakeaway: 'Les couleurs saturées des réseaux sont conçues comme des machines à sous de casino. Les éteindre coupe le shot dopaminergique.',
      },
      {
        title: 'Jour 2 : L\'Exil de la Chambre',
        points: [
          'Achète un réveil à piles ou laisse ton téléphone charger dans la cuisine ou le salon à 21h30.',
          'Interdiction absolue d\'avoir le smartphone à moins de 3 mètres du lit.',
          'Remplace le scroll nocturne par un livre ou un carnet de décharge mentale.',
        ],
        keyTakeaway: 'Ton sommeil profond augmente en moyenne de 42 minutes dès la première nuit sans écran au chevet.',
      },
      {
        title: 'Jour 3 : Le Sas des 30 Secondes',
        points: [
          'Place tes réseaux sociaux dans un dossier caché à la 3ème page d\'écran d\'accueil.',
          'Chaque fois que tu as envie d\'ouvrir une appli de scroll, prends 3 inspirations profondes de 10 secondes.',
          'Demande-toi à voix haute : « Qu\'est-ce que je cherche à fuir en ouvrant cette appli ? »',
        ],
        keyTakeaway: 'Le scroll compulsif est une fuite de l\'ennui ou du stress. Intercaler un sas de conscience brise l\'automatisme.',
      },
      {
        title: 'Jour 4 : La Matinée Sanctuarisée',
        points: [
          'Pas de téléphone durant les 45 premières minutes après le réveil.',
          'Boire un grand verre d\'eau fraîche, s\'exposer à la lumière naturelle et faire 10 minutes d\'étirements.',
          'Observer la clarté d\'esprit avant que le monde extérieur ne déverse ses urgences artificielles.',
        ],
        keyTakeaway: 'Celui qui contrôle sa première heure du matin contrôle le reste de sa journée.',
      },
      {
        title: 'Jour 5 : Le Grand Nettoyage des Abonnements',
        points: [
          'Désabonne-toi sans pitié de tous les comptes qui te font ressentir de la jalousie, de la frustration ou de la superficialité.',
          'Garde uniquement les comptes éducatifs, créatifs ou de vrais amis proches.',
          'Passe tes messageries en mode sourdine en journée de travail.',
        ],
        keyTakeaway: 'Ton fil d\'actualité est la nourriture de ton esprit. Arrête de consommer du poison émotionnel.',
      },
      {
        title: 'Jour 6 : Le Samedi Offline (Micro-Retraite)',
        points: [
          'Active le mode avion pendant 4 heures consécutives l\'après-midi.',
          'Pars marcher en forêt, dessine, cuisine un vrai plat ou écris à la main.',
          'Ressens l\'ennui au début, puis l\'apparition de la véritable créativité.',
        ],
        keyTakeaway: 'L\'ennui est le terreau fertile où germent les meilleures idées de ta vie.',
      },
      {
        title: 'Jour 7 : Le Nouveau Pacte Numérique',
        points: [
          'Installe un pacte avec un ami ou ton binôme sur ÉVASION.',
          'Fixe un plafond strict de 1h30 d\'écran loisir par jour.',
          'Célèbre ta liberté retrouvée avec ton badge et partage tes résultats.',
        ],
        keyTakeaway: 'Tu n\'es plus un produit consommé par les algorithmes : tu es redevenu l\'architecte de ton attention.',
      },
    ],
  },
  {
    id: 'kit_morning_routine',
    title: 'Routine du Matin Anti-Déprime',
    subtitle: 'Le protocole 15-30-60 pour terrasser le brouillard mental dès le lever',
    price: '2.99 €',
    amount: 2.99,
    category: 'Santé Mentale & Énergie',
    readingTime: '9 min de lecture',
    icon: '☀️',
    badge: 'ESSENTIEL',
    description: 'Si tu te réveilles lourd, démotivé et que ton premier geste est d\'attraper ton téléphone pour scroller 40 minutes au lit, ce protocole neuro-physiologique change la donne en 72 heures.',
    summary: 'Réguler le cortisol, restaurer la dopamine naturelle et chasser la léthargie grâce à la biologie humaine fondamentale.',
    chapters: [
      {
        title: 'Étape 1 : Le Choc Neuro-Hydrique (Minute 0 à 5)',
        points: [
          'Dès que les pieds touchent le sol, bois 500 ml d\'eau tempérée avec une pincée de sel marin ou citron.',
          'Pendant la nuit, ton cerveau se déshydrate de près de 1%, ce qui provoque fatigue et brouillard cognitif.',
          'Lave ton visage à l\'eau très froide pour stimuler le nerf vague et déclencher un pic d\'éveil immédiat.',
        ],
        keyTakeaway: 'La fatigue du matin n\'est pas un manque de sommeil, c\'est 9 fois sur 10 un cerveau déshydraté.',
      },
      {
        title: 'Étape 2 : Les Photons de la Victoire (Minute 5 à 15)',
        points: [
          'Sors sur le balcon ou regarde par la fenêtre ouverte pendant 5 à 10 minutes.',
          'La lumière naturelle (lux élevés) frappe les cellules ganglionnaires de la rétine et coupe net la mélatonine.',
          'Ne porte pas de lunettes de soleil pendant ce rituel : c\'est le signal biologique qui réinitialise ton horloge circadienne.',
        ],
        keyTakeaway: '10 minutes de lumière matinale valent mieux que trois espressos pour réveiller ton cortex frontal.',
      },
      {
        title: 'Étape 3 : La Décharge Mentale (Minute 15 à 25)',
        points: [
          'Prends une feuille blanche et un stylo.',
          'Écris sans filtrer tout ce qui te pèse, t\'angoisse ou tourne en boucle dans ta tête.',
          'Identifie ensuite UNE SEULE action prioritaire pour ta journée qui libèrera ta conscience.',
        ],
        keyTakeaway: 'Ce qui reste dans ta tête tourne en anxiété. Ce qui est posé sur papier devient un plan d\'action gérable.',
      },
      {
        title: 'Étape 4 : L\'Échauffement Corporel Sans Écran (Minute 25 à 40)',
        points: [
          '15 pompes, 20 squats, étirements du psoas et de la colonne.',
          'Mets une musique entraînante sans regarder le téléphone.',
          'Ton corps libère des endorphines et t\'installe en posture de conquérant plutôt que de victime passive.',
        ],
        keyTakeaway: 'Le mouvement change instantanément ta physiologie et ton état émotionnel.',
      },
    ],
  },
  {
    id: 'kit_business_zero_euro',
    title: 'Lancer son Premier Business à 0 € depuis son Smartphone',
    subtitle: 'Comment transformer ton temps d\'écran passif en 500 € à 2 000 € / mois',
    price: '7.99 €',
    amount: 7.99,
    category: 'Liberté Financière',
    readingTime: '25 min de lecture',
    icon: '⚡',
    badge: 'PACK COMPLET',
    description: 'Arrête d\'enrichir Mark Zuckerberg et ByteDance avec tes clics. Utilise la même machine qui t\'asservissait pour générer tes premiers revenus en ligne sans aucun capital de départ.',
    summary: '3 modèles concrets et réalistes réalisables entièrement sur smartphone sans investir un seul centime.',
    chapters: [
      {
        title: 'Modèle 1 : Le Copywriting & Ghostwriting Express',
        points: [
          'Pourquoi les créateurs de contenu et petites entreprises manquent de temps pour rédiger leurs posts.',
          'Comment rédiger des carrousels LinkedIn ou des scripts Reels pour des coachs, agences ou commerçants locaux.',
          'Méthode pour décrocher ton premier client à 150 € en 5 messages directs personnalisés.',
        ],
        keyTakeaway: 'Le mot écrit est la compétence la plus rentable du web moderne. 0 € d\'investissement, 100% de marge.',
      },
      {
        title: 'Modèle 2 : La Création de Contenu Thématique Sans Visage (Faceless)',
        points: [
          'Monter des vidéos courtes virales avec CapCut (100% gratuit) sur smartphone.',
          'Les niches les plus rémunératrices : santé mentale, citations stoïciennes, finance pour jeunes, productivité.',
          'Monétisation par l\'affiliation éthique et la vente de mini-guides à 5 €.',
        ],
        keyTakeaway: 'Tu n\'as pas besoin de montrer ton visage pour bâtir une audience fidèle de 50 000 personnes.',
      },
      {
        title: 'Modèle 3 : La Gestion de Communauté & Clôture de Ventes (Chat Closer)',
        points: [
          'Répondre aux messages privés et commentaires pour des marques en pleine croissance.',
          'Rémunération au pourcentage (10% à 20% sur chaque vente conclue en message direct).',
          'Travailler 1 à 2 heures par jour depuis ton canapé ou les transports en commun.',
        ],
        keyTakeaway: 'Transformer le scroll compulsif sur les messageries en compétences commerciales valorisables.',
      },
      {
        title: 'Le Plan d\'Action 30 Jours',
        points: [
          'Semaine 1 : Choix de ta compétence clé et création de ton portfolio mobile.',
          'Semaine 2 : Prospection directe (10 messages ciblés par jour).',
          'Semaine 3 : Réalisation de ta première mission et obtention d\'un témoignage.',
          'Semaine 4 : Augmentation de tes tarifs et passage en récurrent.',
        ],
        keyTakeaway: 'La seule différence entre ceux qui paient et ceux qui encaissent, c\'est le passage à l\'action.',
      },
    ],
  },
];

export const AFFILIATE_RESOURCES: AffiliateResource[] = [
  {
    id: 'res_opal',
    name: 'Opal : Focus & Screen Time',
    tagline: 'L\'application de blocage d\'écrans la plus radicale au monde',
    badge: 'TOP RECOMMANDATION',
    commissionRate: '20% sur abonnement',
    icon: '💎',
    url: 'https://www.opal.so',
    description: 'Bloque littéralement tes applications addictives sans possibilité de tricher (mode Deep Focus). Utilisé par plus d\'un million de personnes pour diviser par deux leur temps d\'écran.',
    features: [
      'Verrouillage strict impossible à contourner sans attendre un timer',
      'Score de concentration en direct (Focus Score)',
      'Disponible sur iOS et Android',
    ],
  },
  {
    id: 'res_onesec',
    name: 'One Sec : Respirez avant de scroller',
    tagline: 'Force une respiration de 3 secondes avant d\'ouvrir tes applis de scroll',
    badge: 'NEURO-SCIENCE',
    commissionRate: '15% commission',
    icon: '⏳',
    url: 'https://one-sec.app',
    description: 'Développé avec des chercheurs en sciences cognitives, One Sec casse la boucle réflexe de la dopamine en insérant un court exercice de respiration consciente avant chaque ouverture d\'app.',
    features: [
      'Réduit les ouvertures compulsives de 57% en moyenne',
      'Statistiques sur le nombre de fois où tu as renoncé à scroller',
      'Intégration transparente avec les raccourcis système',
    ],
  },
  {
    id: 'res_analog_alarm',
    name: 'Réveil Analogique Vintage Double Cloche',
    tagline: 'Le geste physique le plus puissant pour bannir le téléphone de la chambre',
    badge: 'PHYSIQUE (0 ÉCRAN)',
    commissionRate: '10% sur Amazon Partenaires',
    icon: '⏰',
    url: 'https://amazon.fr',
    description: 'Une véritable sonnerie mécanique sans écran, sans onde et sans notification. Laisse ton smartphone charger dans une autre pièce sans craindre de rater ton réveil.',
    features: [
      'Sonnerie mécanique impossible à ignorer',
      'Zéro lumière bleue perturbant la mélatonine nocturne',
      'Design rétro épuré qui embellit ta table de nuit',
    ],
  },
  {
    id: 'res_deep_work_book',
    name: 'Livre « Deep Work » par Cal Newport',
    tagline: 'Le manuel définitif pour retrouver une concentration surhumaine',
    badge: 'LIVRE CULTE',
    commissionRate: '7% affiliation livre',
    icon: '📚',
    url: 'https://amazon.fr',
    description: 'Le professeur d\'informatique Cal Newport démontre pourquoi la capacité à se concentrer sans distraction est devenue la superpuissance la plus rare et la plus recherchée du XXIe siècle.',
    features: [
      'Exemples concrets de créateurs et scientifiques majeurs',
      '4 règles applicables immédiatement pour sanctuariser ton travail',
      'Philosophie anti-réseaux toxiques argumentée',
    ],
  },
];

export const VIRAL_SCRIPTS: ViralVideoScript[] = [
  {
    id: 'script_1',
    title: 'Script 1 : Le Détenu du Canapé (Format Choc Psycho)',
    targetViews: '150k - 500k vues cibles',
    hook: '« Si tu regardes cette vidéo affalé dans ton lit à plus de 23h, tu es officiellement en prison. »',
    visualConcept: 'Plan serré face caméra ou vidéo sans visage avec éclairage tamisé, reflet bleu de l\'écran sur les yeux. Ambiance prison sombre, barreaux flous en arrière-plan.',
    voiceover: `« Regarde tes mains. Tu viens de passer les 3 dernières heures à regarder la vie d'inconnus qui ne savent même pas que tu existes.
Ton pouce scroll tout seul. Tu n'arrives plus à lire 2 pages d'un livre sans check tes notifications.
On est des millions enfermés dans la même cellule invisible.
C'est pour ça qu'on a créé ÉVASION.
Pas d'algorithme. Pas d'influenceurs parfaits. Juste des gens comme toi qui avouent ce qui les enferme.
Pour te libérer, il te faut 5 clés données par d'autres détenus.
Dès que tu reçois 5 clés, tes barreaux sautent.
Rejoins le collectif, ton matricule t'attend. »`,
    callToAction: '« Commente "ÉVASION" pour recevoir la clé de ta cellule en message privé. »',
    hashtags: ['#evasion', '#detoxdigitale', '#dopamine', '#santementale', '#developpementpersonnel', '#scrollcompulsif'],
  },
  {
    id: 'script_2',
    title: 'Script 2 : Le Test des 10 Secondes (Format Challenge Interactif)',
    targetViews: '300k - 1M vues cibles',
    hook: '« Fais ce test avec moi pendant 10 secondes. Si tu n\'y arrives pas, ton cerveau est cuit. »',
    visualConcept: 'Chronomètre en gros plan sur fond noir avec battements de coeur sonores. L\'écran s\'assombrit petit à petit.',
    voiceover: `« Ne touche plus à ton écran. Ne regarde pas les commentaires. Ne swipe pas.
Fixe juste le point rouge au centre pendant 10 secondes.
(Silence de 3 secondes avec battement de coeur).
Tu as senti cette envie irrésistible de scroller ?
C'est ce qu'ils appellent la dette dopaminergique.
Dans l'application ÉVASION, quand tu lances le mode Détox, ton écran se verrouille et tu gagnes des clés de liberté.
Ceux qui tiennent 1 heure débloquent le badge "Esprit Libre".
Est-ce que tu es encore capable de vivre sans ton écran ? Prouve-le. »`,
    callToAction: '« Clique sur le lien en bio et teste si tu as le niveau pour sortir de la cellule. »',
    hashtags: ['#challenge', '#test', '#focus', '#concentration', '#cerveau', '#discipline', '#evasionapp'],
  },
  {
    id: 'script_3',
    title: 'Script 3 : L\'Aveu Clandestin (Format Confession / POV Empathique)',
    targetViews: '200k - 800k vues cibles',
    hook: '« Hier soir, un détenu a écrit ça sur le mur secret d\'ÉVASION... et ça m\'a brisé le coeur. »',
    visualConcept: 'Capture d\'écran animée de l\'application ÉVASION avec la carte de confession qui clignote en rouge, les clés qui montent de 0/5 à 5/5, puis l\'animation de libération verte émeraude.',
    voiceover: `« "J'ai 21 ans. J'ai raté mes partiels parce que je passe 7h par jour sur les vidéos courtes. Mes parents croient que je réussis, mais je suis en train de gâcher ma jeunesse."
Sur Instagram, tout le monde fait semblant d'être millionnaire à Dubaï.
Sur ÉVASION, personne ne ment.
En 30 minutes, 5 inconnus bienveillants lui ont donné leurs clés.
Ses barreaux ont sauté. Il a éteint son téléphone.
Si toi aussi tu en as marre du faux, viens graver ton aveu. On te donnera les clés pour te libérer. »`,
    callToAction: '« Le lien est en bio. Télécharge rien, ça s\'ouvre direct sur Safari ou Chrome. »',
    hashtags: ['#temoignage', '#verite', '#solitude', '#etudiants', '#realsocial', '#authentique', '#evasion'],
  },
];
