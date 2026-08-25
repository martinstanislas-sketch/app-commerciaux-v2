// coachFaq.js
// Coach « réponses préenregistrées » — GRATUIT, aucun appel IA.
// Une base de questions-types + un petit moteur de correspondance par mots-clés.
// Le client pose sa question -> on ressort la meilleure réponse ; si rien ne
// correspond (ou si ça ne lui convient pas), le front propose le coach humain.

// --- Normalisation / tokenisation (sans accent, insensible à la casse) ---
function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents
    .replace(/[^a-z0-9\s]/g, ' ')                      // ponctuation -> espace
    .replace(/\s+/g, ' ').trim();
}
// Mots vides (articles, pronoms…) ignorés dans la comparaison.
const STOP = new Set(('je tu il elle on nous vous ils de des du la le les un une et ou au aux mon ma mes ton ta tes que qui quoi est ce pour pas plus avec dans sur en me te se ne par si quel quelle quels comment dois faut faire fait peux puis ai as ont sont mais donc car ca cela cette ces son sa leur sera tres trop bien quand combien y a').split(' '));
function singular(w) { return (w.length > 3 && w.endsWith('s')) ? w.slice(0, -1) : w; }
function tokens(s) {
  return norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map(singular);
}

// --- Moteur de correspondance ---
// Score = phrases-clés trouvées dans la question (fort) + mots-clés isolés +
// recouvrement avec le texte de la question-type. Seuil bas mais non nul pour
// éviter les faux positifs ; sinon -> pas de réponse (bascule coach humain).
function matchFaq(question, rows) {
  const nq = ' ' + norm(question) + ' ';
  const qtoks = new Set(tokens(question));
  if (!qtoks.size) return null;
  let best = null;
  for (const r of rows || []) {
    if (r.actif === 0) continue;
    let score = 0;
    const phrases = String(r.mots_cles || '').split(',').map((p) => norm(p)).filter((p) => p.length >= 3);
    for (const p of phrases) {
      if (p.includes(' ')) { if (nq.includes(' ' + p + ' ') || nq.includes(' ' + p)) score += 3; }
      else if (qtoks.has(singular(p))) score += 2;
    }
    const qt = new Set(tokens(r.question || ''));
    for (const t of qtoks) { if (qt.has(t)) score += 1; }
    if (!best || score > best.score) best = { row: r, score };
  }
  return best && best.score >= 2 ? best : null;
}

// --- Graine : ~20 réponses aux questions nutrition les plus courantes ---
// Ton : chaleureux, sûr (jamais médical), avec un renvoi au coach humain pour
// les cas personnels. Éditable ensuite depuis le panneau admin.
const COACH_FAQ_SEED = [
  { q: "J'ai faim entre les repas, que faire ?", c: 'faim',
    k: "faim, faim entre les repas, fringale, fringales, grignoter, grignotage, petit creux, petite faim, envie de manger, faim entre repas, j ai faim",
    r: "Les fringales viennent souvent d'un manque de protéines ou d'eau, ou d'un repas trop léger. Commence par un grand verre d'eau et attends 10 minutes. Si la faim reste, choisis une collation riche en protéines : yaourt grec, fromage blanc, œuf dur, une poignée d'amandes, ou une des collations de ton plan — bien mieux que de tenir coûte que coûte puis craquer.\n\nSi tu as faim comme ça tous les jours, tes quantités sont peut-être trop justes : reprends ton profil pour revoir ta cible." },

  { q: 'Quoi manger avant le sport ?', c: 'sport',
    k: "avant le sport, avant la seance, avant l entrainement, avant muscu, pre training, avant de m entrainer, collation avant sport, manger avant le sport",
    r: "1 à 2 h avant l'effort : des glucides digestes et peu de gras. Par exemple une banane, des flocons d'avoine, du pain complet ou du riz. Évite les plats très gras ou très fibreux juste avant (plus longs à digérer). Pour une séance courte et modérée le matin, t'entraîner à jeun reste possible." },

  { q: 'Quoi manger après le sport ?', c: 'sport',
    k: "apres le sport, apres la seance, apres l entrainement, recuperation, recup, post training, apres muscu, collation apres sport, manger apres le sport",
    r: "Dans les 1 à 2 h après l'effort : 20-30 g de protéines pour réparer le muscle + des glucides pour recharger l'énergie. Exemples : fromage blanc + fruit, poulet/riz, œufs + pain complet, ou un shake protéiné si c'est plus pratique. Pas besoin de manger dans la seconde qui suit, la fenêtre est large." },

  { q: "J'ai craqué / fait un écart, c'est grave ?", c: 'ecarts',
    k: "j ai craque, craque, ecart, ecarts, craquage, trop mange, exces, derapage, cheat meal, repas de triche, j ai trop mange",
    r: "Non — un écart ne ruine pas tes efforts : c'est la régularité sur la semaine qui compte, pas un repas isolé. Surtout, ne compense pas en sautant le repas suivant ou en te privant le lendemain, ça relance souvent le cycle. Reprends simplement ton plan au repas d'après, comme si de rien n'était. Un écart assumé de temps en temps fait partie d'un équilibre durable." },

  { q: 'Mon poids stagne, pourquoi ?', c: 'poids',
    k: "stagne, stagnation, plateau, palier, plus de perte, bloque, balance bouge plus, je ne perds plus, poids bloque, je stagne",
    r: "Les paliers sont normaux, le corps s'adapte. Causes fréquentes : rétention d'eau (règles, sel, sport intense), perte de gras masquée par du muscle, ou des quantités qui ont un peu glissé. Regarde la tendance sur 2-3 semaines plutôt que le chiffre du jour. Continue ton plan, soigne ton sommeil et ton hydratation.\n\nSi ça dure plus de 2-3 semaines, mets à jour ton poids dans ton profil : ta cible calorique sera recalculée." },

  { q: "Comment gérer l'alcool / l'apéro ?", c: 'ecarts',
    k: "alcool, biere, bieres, vin, apero, aperitif, un verre, boire un verre, soiree, picoler",
    r: "L'alcool apporte des calories « vides » et freine un peu la perte de gras, sans rassasier. Si tu bois : limite la quantité, alterne avec de l'eau, et choisis les options les moins sucrées (vin sec, spiritueux sans soda sucré). Pour l'apéro, prends de quoi tenir (crudités, un peu de fromage) plutôt que de tout picorer. L'idée n'est pas de t'interdire, mais de garder le contrôle." },

  { q: 'Comment faire au restaurant ?', c: 'ecarts',
    k: "restaurant, resto, au restaurant, manger dehors, invitation, repas exterieur, chez des amis, invite, on m invite",
    r: "Tu peux manger dehors sans culpabiliser. Quelques réflexes : une base de protéines (viande, poisson, œufs) + des légumes, les sauces à part, et écoute ta satiété — inutile de finir l'assiette si tu n'as plus faim. Un repas au resto ne change rien à ta semaine si le reste tient la route." },

  { q: "Je n'ai pas le temps de cuisiner", c: 'organisation',
    k: "pas le temps, manque de temps, rapide, vite fait, batch cooking, cuisiner, preparer, gain de temps, flemme de cuisiner, recettes rapides",
    r: "Mise sur la simplicité : des recettes en moins de 15 min (œufs, conserves de qualité comme thon/légumineuses, légumes surgelés, féculents express). Le batch cooking aide beaucoup : prépare 2-3 bases le week-end (protéines cuites, féculents, légumes) et assemble en semaine. Tu peux aussi filtrer ton plan sur les recettes rapides." },

  { q: "Combien d'eau dois-je boire ?", c: 'hydratation',
    k: "eau, hydratation, boire, hydrater, combien d eau, litres d eau, je bois pas assez, boire de l eau",
    r: "Vise 1,5 à 2 L par jour, plus si tu fais du sport ou s'il fait chaud. Repère simple : des urines claires. Garde une bouteille à portée de main et bois régulièrement plutôt que d'un coup. Bien s'hydrater réduit aussi les fausses faims." },

  { q: "J'ai une envie de sucre irrésistible", c: 'sucre',
    k: "sucre, sucree, envie de sucre, envie de sucre, dessert, gateau, chocolat, bonbon, gourmandise, pulsion sucre, addiction au sucre",
    r: "L'envie de sucre est souvent liée à la fatigue, au stress ou à des repas trop pauvres en protéines/fibres. Astuce : un fruit + quelques carrés de chocolat noir, ou un yaourt à la cannelle, calment l'envie sans excès. Ne te prive pas à 100 % non plus : une petite douceur prévue tient mieux dans la durée qu'une frustration qui finit en craquage." },

  { q: 'Manger équilibré avec un petit budget', c: 'budget',
    k: "budget, pas cher, petit budget, economique, c est cher, pas les moyens, eco, manger pas cher",
    r: "Bien manger ne coûte pas forcément cher. Mise sur : œufs, légumineuses (lentilles, pois chiches), conserves de poisson, flocons d'avoine, légumes surgelés ou de saison, féculents bruts. Cuisine en plus grande quantité pour lisser le coût. Ton plan peut être filtré sur les recettes « petit budget »." },

  { q: 'Le sommeil influence-t-il mon poids ?', c: 'sommeil',
    k: "sommeil, dormir, mal dormir, fatigue, fatigue, repos, manque de sommeil, je dors mal, nuit",
    r: "Beaucoup : mal dormir augmente la faim (surtout de sucre/gras), baisse la motivation et freine la récupération. Vise des horaires réguliers, limite les écrans le soir et la caféine après 16 h. Une bonne nuit fait souvent plus pour ta perte de gras qu'une séance de sport en plus." },

  { q: 'Pourquoi manger autant de protéines ?', c: 'proteines',
    k: "proteines, prot, pourquoi des proteines, pourquoi autant de proteines, combien de proteines, manque de proteines, role des proteines",
    r: "Les protéines préservent ton muscle pendant la perte de gras, rassasient le plus longtemps et demandent de l'énergie pour être digérées : ton meilleur allié pour maigrir sans fondre du muscle. Répartis-les sur la journée (un peu à chaque repas) : œufs, viande, poisson, laitages, légumineuses, tofu." },

  { q: 'Puis-je sauter un repas / faire du jeûne ?', c: 'organisation',
    k: "sauter un repas, sauter le petit dejeuner, jeune, jeune intermittent, pas faim le matin, ne pas manger le matin, je saute le petit dej",
    r: "Sauter un repas n'est ni obligatoire ni interdit : ce qui compte, c'est ton total sur la journée. Si tu n'as pas faim le matin, tu peux décaler ton premier repas — à condition de ne pas te rattraper en excès ensuite. L'important est de couvrir tes protéines et de ne pas arriver affamé au repas suivant." },

  { q: 'Je grignote le soir devant la télé', c: 'faim',
    k: "grignote le soir, grignotage du soir, faim le soir, le soir, devant la tele, fringale du soir, manger le soir, envie de manger le soir",
    r: "Le grignotage du soir est souvent une habitude ou de l'ennui plus qu'une vraie faim. Pistes : garde un peu plus de protéines/fibres pour le dîner, prévois une boisson chaude (tisane), occupe tes mains autrement. Si tu veux une collation, prévois-la dans ton plan plutôt que de piocher sans compter." },

  { q: "J'ai des ballonnements / digestion difficile", c: 'digestion',
    k: "ballonne, ballonnements, digestion, mal au ventre, ventre gonfle, transit, constipation, je digere mal, digestion difficile",
    r: "Souvent lié à un transit lent, à trop de fibres d'un coup, ou à des repas avalés trop vite. Pistes : bois assez d'eau, augmente les fibres progressivement, mange lentement et bouge un peu après les repas. Si les troubles sont fréquents ou douloureux, ce n'est pas à régler seul : parle-en à un médecin." },

  { q: 'Je manque de motivation', c: 'motivation',
    k: "motivation, demotive, plus motive, je lache, abandonner, decourage, j en peux plus, envie de tout lacher, baisse de motivation, demoralise",
    r: "C'est humain, la motivation fait des vagues — ce qui tient, c'est l'habitude. Reviens à un objectif simple cette semaine (un repas équilibré par jour, une marche). Célèbre les petites victoires et appuie-toi sur tes résultats déjà obtenus. Et si le moral est vraiment bas, parle-en autour de toi ou à un professionnel : tu n'as pas à avancer seul." },

  { q: 'Ai-je besoin de compléments / protéine en poudre ?', c: 'complements',
    k: "complement, complements, complement alimentaire, proteine en poudre, whey, vitamines, gelules, bruleur de graisse, supplements",
    r: "Aucun complément n'est indispensable : une alimentation variée couvre l'essentiel. La protéine en poudre (whey, végétale) est juste un dépannage pratique pour atteindre tes protéines, pas un produit magique. Méfie-toi des « brûleurs de graisse », peu efficaces et parfois risqués. Pour tout complément spécifique, demande l'avis d'un professionnel de santé." },

  { q: 'Comment remplacer un aliment de mon plan ?', c: 'organisation',
    k: "remplacer, substituer, alternative, a la place, je n aime pas, remplacement, changer un aliment, troquer, par quoi remplacer",
    r: "Remplace par un aliment du même groupe pour garder l'équilibre : une protéine par une autre (poulet / poisson / œufs / tofu), un féculent par un féculent (riz / pâtes / pommes de terre / quinoa), un légume par un autre légume. Garde des quantités proches. Tu peux aussi utiliser le bouton « Remplacer » sur chaque repas pour une autre recette compatible." },

  { q: "Je reprends après des écarts (vacances, week-end)", c: 'ecarts',
    k: "reprendre, recommencer, repartir, apres les vacances, apres le weekend, remettre en route, j ai tout lache, reprise, comment reprendre",
    r: "Pas de double peine : on ne « rattrape » pas en se privant, ça ne fait que relancer les fringales. Reprends ton plan dès le prochain repas, normalement. Mise sur 2-3 jours réguliers (protéines, eau, légumes, sommeil) pour relancer la machine — la rétention d'eau redescend vite. L'essentiel, c'est de repartir maintenant, pas demain." },

  { q: "Je ne sais pas quoi manger maintenant", c: 'organisation',
    k: "quoi manger, je sais pas quoi manger, idee de repas, quoi cuisiner, je sais pas quoi cuisiner, une idee de repas, quoi prendre, quoi me faire",
    r: "Le plus simple : suis le repas prévu dans ton plan du jour, il est déjà calé sur ton objectif. Si tu veux improviser, garde la règle de l'assiette équilibrée : une portion de protéines (viande, poisson, œufs, légumineuses) + des légumes à volonté + une portion de féculents selon ta faim, avec un filet de bonne matière grasse. Rapide, rassasiant, et ça colle à tes besoins." },

  { q: "J'ai mal quelque part / un souci de santé", c: 'general',
    k: "douleur, blessure, blesse, malaise, vertige, symptome, malade, j ai mal, je suis malade, probleme de sante",
    r: "Là, je ne suis pas le bon interlocuteur : tout ce qui touche à la douleur, à une blessure ou à la santé doit être vu avec un professionnel de santé (médecin, kiné…). N'attends pas. En attendant, adapte ton plan : régénère les repas qui ne conviennent plus." },

  // ----- Lot 2 (complément) -----
  { q: 'Combien de repas par jour ?', c: 'organisation',
    k: "combien de repas, nombre de repas, combien de fois par jour, repas par jour, manger combien de fois, fractionner les repas",
    r: "Il n'y a pas de nombre magique : 3 repas, ou 3 repas + 1-2 collations, peu importe tant que ton total sur la journée colle à ton objectif. Choisis le rythme qui t'évite d'avoir trop faim et que tu tiens facilement dans la durée. La régularité compte plus que le nombre." },

  { q: 'Manger tard le soir fait grossir ?', c: 'organisation',
    k: "manger tard, manger le soir tard, diner tard, repas tard, tard le soir fait grossir, heure du diner, manger avant de dormir",
    r: "Ce n'est pas l'heure qui fait grossir, c'est le total de la journée. Manger tard peut juste gêner le sommeil ou la digestion si le repas est lourd. Si tu dînes tard, vise quelque chose de plus léger et riche en protéines. Pas de panique sur l'horloge." },

  { q: 'Le café / la caféine, c\'est ok ?', c: 'general',
    k: "cafe, cafeine, the, the vert, expresso, combien de cafe, cafe et regime, boire du cafe",
    r: "Le café nature (sans sucre) n'apporte quasiment pas de calories et peut même couper un peu la faim. Reste raisonnable, idéalement pas après 16 h pour ne pas gêner ton sommeil, et attention au sucre, sirops et crèmes qui font vite grimper l'addition. Le thé, c'est pareil : parfait nature." },

  { q: 'Les sodas light / édulcorants ?', c: 'sucre',
    k: "soda light, light, zero, edulcorant, aspartame, stevia, boisson sans sucre, coca zero, sucrette, faux sucre",
    r: "Les versions « light/zéro » évitent les calories du sucre et peuvent dépanner pour réduire les sodas classiques : sans excès, c'est un compromis acceptable. L'idéal reste de t'habituer petit à petit à moins de goût sucré (eau aromatisée maison, eau pétillante) pour ne plus en dépendre." },

  { q: 'Comment manger plus de légumes ?', c: 'organisation',
    k: "legumes, plus de legumes, manger des legumes, pas assez de legumes, j aime pas les legumes, comment manger des legumes, manger plus de legumes",
    r: "Astuces simples : remplis la moitié de ton assiette de légumes, garde des surgelés (zéro perte, prêts en 5 min), glisse-en partout (soupes, poêlées, sauces, gratins) et varie les cuissons — rôtis au four, ils sont bien meilleurs. Commencer le repas par les légumes aide aussi à la satiété." },

  { q: 'Les fruits, c\'est trop de sucre ?', c: 'sucre',
    k: "fruits, trop de fruits, sucre des fruits, combien de fruits, fruit le soir, fruits font grossir, manger des fruits",
    r: "Les fruits apportent du sucre, mais aussi des fibres, des vitamines et de l'eau : rien à voir avec un bonbon. 2 à 3 fruits par jour s'intègrent très bien. Si tu surveilles de près, privilégie les fruits entiers (pas en jus) et répartis-les. Et non, pas de souci à en manger le soir." },

  { q: 'Dois-je arrêter le pain ?', c: 'organisation',
    k: "pain, le pain, arreter le pain, pain complet, supprimer le pain, manger du pain, pain et regime",
    r: "Pas besoin de supprimer le pain : c'est un féculent comme un autre. Privilégie le complet ou au levain (plus rassasiants) et ajuste la quantité à ta faim et à ton objectif. Ce qui compte, c'est la portion globale de féculents sur la journée, pas d'interdire un aliment." },

  { q: 'Produits laitiers / lactose ?', c: 'general',
    k: "produits laitiers, lait, lactose, fromage, yaourt, intolerance lactose, sans lactose, laitages",
    r: "Les produits laitiers sont une bonne source de protéines et de calcium. Si tu les digères bien, garde-les (yaourt, fromage blanc, fromage avec modération). En cas d'inconfort, teste les versions sans lactose ou les alternatives végétales enrichies. Aucune obligation si tu couvres protéines et calcium ailleurs." },

  { q: 'Je mange peut-être trop salé', c: 'general',
    k: "sel, trop de sel, sale, sodium, retention d eau sel, reduire le sel, trop sale",
    r: "Trop de sel favorise la rétention d'eau (et fait gonfler le chiffre sur la balance) sans changer ta masse grasse. Limite les plats industriels, charcuteries et sauces, et assaisonne avec des herbes et épices. Pas besoin de traquer chaque gramme : réduire le très salé suffit déjà." },

  { q: 'Les jus de fruits et smoothies ?', c: 'sucre',
    k: "jus de fruits, jus, smoothie, smoothies, jus d orange, boisson sucree, jus de fruit",
    r: "Un jus, même « pur jus », concentre le sucre de plusieurs fruits sans les fibres : il rassasie peu et fait vite grimper les calories. Mieux vaut manger le fruit entier. Pour un smoothie, garde la pulpe, ajoute des protéines (yaourt, lait) et compte-le comme une collation, pas comme une boisson libre." },

  { q: 'Je veux prendre du muscle / de la masse', c: 'sport',
    k: "prendre du muscle, prise de masse, prendre de la masse, grossir en muscle, masse musculaire, me muscler, prendre du poids en muscle",
    r: "Pour construire du muscle : assez de protéines réparties sur la journée, un léger surplus de calories, et surtout de la musculation régulière avec progression. C'est lent (compte en mois, pas en jours). Si la prise de masse est ton objectif, choisis « prendre du muscle » dans ton profil : tes calories et ton plan suivront." },

  { q: 'Végétarien / végan : assez de protéines ?', c: 'proteines',
    k: "vegetarien, vegetarienne, vegan, vegane, vegetalien, proteines vegetales, sans viande, proteine sans viande, je suis vegetarien, je suis vegan, je suis vegetarienne, vegetarien assez de proteines, vegan assez de proteines, proteines sans viande, je ne mange pas de viande",
    r: "Oui, c'est tout à fait possible : légumineuses (lentilles, pois chiches, haricots), tofu et tempeh, œufs et laitages si tu es végétarien, seitan, et protéines en poudre végétales au besoin. Associe légumineuses + céréales sur la journée pour des protéines complètes, et vise une source de protéines à chaque repas." },

  { q: 'Quoi emporter au travail / à la cantine ?', c: 'organisation',
    k: "au travail, lunchbox, gamelle, repas au bureau, manger au travail, boite repas, cantine, dejeuner au bureau, emporter au travail",
    r: "Prépare la veille ou en batch : une base de protéines (poulet, thon, œufs, légumineuses) + des féculents (riz, pâtes complètes, semoule) + des crudités ou légumes. Les salades-bocaux et les restes de la veille marchent très bien. À la cantine : protéines + légumes + un féculent raisonnable, sauces à part." },

  { q: 'Fast-food / livraison, comment limiter la casse ?', c: 'ecarts',
    k: "fast food, mcdo, burger, livraison, uber eats, junk food, restauration rapide, kebab, tacos",
    r: "Si tu y vas : choisis un format simple (un burger plutôt qu'un menu XXL), évite les boissons sucrées (eau ou light), et limite ou partage les frites. Privilégie les options avec des protéines et un peu de légumes quand c'est possible. Un fast-food de temps en temps ne casse rien si le reste de la semaine tient." },

  { q: 'Au bout de combien de temps des résultats ?', c: 'motivation',
    k: "combien de temps, des resultats, voir des resultats, ca prend combien de temps, patience, quand vais je voir, delais, premiers resultats",
    r: "Les premiers changements (énergie, vêtements, balance) arrivent souvent en 2 à 4 semaines, mais ça varie selon chacun. Une perte saine tourne autour de 0,5 kg par semaine en moyenne. Juge sur la tendance d'un mois, pas sur un jour. La régularité finit toujours par payer — garde le cap." },

  { q: 'Le stress me fait manger', c: 'motivation',
    k: "stress, stresse, anxiete, manger ses emotions, alimentation emotionnelle, manger par stress, compulsion, je mange quand je suis stresse",
    r: "Manger sous le coup des émotions est très courant. Avant de te resservir, fais une pause : bois de l'eau, respire, sors deux minutes. Identifie le déclencheur (fatigue, ennui, contrariété) et essaie une autre soupape (marche, appel, douche). Sois indulgent avec toi-même — et si ça revient souvent et te pèse, parles-en à un professionnel." },

  { q: 'À quelle fréquence me peser ?', c: 'poids',
    k: "me peser, peser, balance, frequence pesee, combien de fois me peser, quand se peser, suivi du poids, je me pese tous les jours",
    r: "Une fois par semaine suffit, le matin à jeun, dans les mêmes conditions. Le poids varie d'un jour à l'autre (eau, sel, digestion, cycle) : te peser tous les jours peut décourager pour rien. Regarde la tendance sur plusieurs semaines, et appuie-toi aussi sur tes mensurations, tes photos et tes sensations." },

  { q: 'Mes règles me donnent faim et me font gonfler', c: 'faim',
    k: "regles, cycle, syndrome premenstruel, spm, avant les regles, retention d eau cycle, faim avant les regles, hormones, periode des regles",
    r: "C'est hormonal et tout à fait normal : autour des règles, la faim (surtout de sucre) augmente et le corps retient de l'eau — la balance peut monter de 1 à 2 kg sans que ce soit du gras. Anticipe avec des repas riches en protéines et fibres, bois bien, et ne te juge pas sur le poids ces jours-là. Tout rentre dans l'ordre juste après." },
];

// Version de la graine : incrémentée à chaque AJOUT de réponses. Le serveur
// l'utilise pour « compléter » la base existante (ajoute les nouvelles entrées
// absentes) sans ré-injecter ni écraser le contenu déjà en place. v1 = 22 réponses,
// v2 = +18 (lot 2). À bumper si on ajoute un nouveau lot.
const SEED_VERSION = 2;

module.exports = { norm, tokens, matchFaq, COACH_FAQ_SEED, SEED_VERSION };
