# Prompts Claude Code — nutrition-solo (My Coach)

Un prompt = une conversation Claude Code, ouverte à la racine de `nutrition-solo`.
Ordre conseillé : 0 → 14. Chaque lot est livrable et testable seul.
Le prompt 0 crée `CLAUDE.md` : à partir de là, les prompts suivants n'ont plus à
redire le contexte technique, Claude Code le lit tout seul à l'ouverture.

Règles valables pour tous les prompts (elles sont dans CLAUDE.md, rappelées ici) :
jamais de commit / push / déploiement sans demande explicite ; sauvegarde de
`data/nutrition.sqlite` avant toute écriture ; `npm test` au vert (946 tests) ;
vérification dans le navigateur, pas seulement par les tests ; bump des `?v=`
de tous les assets touchés (academy.css et academy.js ensemble).

---

## 0 — Filet de sécurité : Git + CLAUDE.md

```
Mise en place du filet de sécurité du projet nutrition-solo avant toute refonte.

1. Git. Vérifie s'il existe un dépôt (.git) à la racine. S'il n'y en a pas : git init, et un premier commit « État initial avant refonte — 3 sept. 2026 » incluant tout le working tree sauf ce que .gitignore exclut (node_modules, .env, data/*.sqlite*, /*.png). Vérifie que .env et la base ne sont PAS dans le commit (git show --stat). S'il en existe un : montre-moi git status et git log -5, ne commite rien, attends mon accord — c'est la seule exception à la règle « pas de commit » de ce prompt.

2. CLAUDE.md. Transforme CLAUDE_HANDOFF.md en CLAUDE.md à la racine (Claude Code le lit automatiquement). Garde tout ce qui est durable : les trois lignes du projet, la carte des trois espaces (app client Nutrition = index.html/app.js/style.css ; Espace Coach/Boost = coach.html/coach.js/coachRdv.js/coach.css ; Academy = academy.html/academy.js/academy.css), la section « À NE SURTOUT PAS CASSER » intégrale, les repères techniques (statuts, tables, catalogue), les consignes permanentes de Stan, la règle du ?v=. Retire ce qui est un état de session (pourcentage de contexte, « ce qui vient d'être développé », fichiers non commités) : déplace ces parties dans docs/JOURNAL.md avec la date. Ajoute une section « Comment vérifier » : npm test, npm start + URLs des trois espaces, comment lancer un E2E (commande exacte, en lisant test/e2e/aideAcademy.js et un script existant).

3. Sauvegarde de la base : copie data/nutrition.sqlite vers ../.backups/nutrition-avant-refonte-<date>.sqlite (crée le dossier si besoin). Ajoute un script npm « sauvegarder » qui fait cette copie avec VACUUM INTO (better-sqlite3 le permet) et l'horodatage.

4. Ne modifie aucun autre fichier. Termine par : présence du .git, contenu de git log, taille du CLAUDE.md, chemin de la sauvegarde.
```

---

## 1 — Sécurité HTTP

```
Durcissement HTTP de nutrition-solo (server.js, lib/*Routes.js). Lis CLAUDE.md d'abord.

Constat : aucun helmet, aucune CSP, aucun rate-limit hors la temporisation du PIN ; express.json({limit:'6mb'}) est global ; /api/coach, /api/plate-analyze et /api/recipe-detail appellent Claude et sont accessibles SANS compte (pas de exigeCompte) : n'importe qui peut brûler le quota Anthropic.

À faire, sans changer aucune réponse d'API pour un client légitime :
1. Ajoute helmet et express-rate-limit aux dependencies (npm install, versions exactes dans package.json).
2. app.use(helmet()) avec une CSP explicite et fonctionnelle pour les trois espaces : scripts et styles 'self' (+ 'unsafe-inline' pour les styles UNIQUEMENT si un audit rapide montre des style="" injectés par JS — dis-le), fonts.googleapis.com / fonts.gstatic.com, frames YouTube (www.youtube.com, www.youtube-nocookie.com) pour les vidéos de l'Academy, img-src 'self' data: blob: https://i.ytimg.com, connect-src 'self' + les hôtes réellement appelés côté navigateur (grep fetch( dans public/*.js : Open Food Facts pour le scan, autres ?). Désactive crossOriginEmbedderPolicy si les vidéos ou zxing cassent. HSTS uniquement si NODE_ENV=production.
3. Rate-limit : /account/login 20 req / 15 min par IP ; /api/coach, /api/plate-analyze, /api/recipe-detail, /api/scan 30 req / 15 min par compte (clé = req.user.email si présent, sinon IP) ; global 600 req / 15 min par IP. Réponse 429 en JSON { ok:false, error:'Trop de requêtes, réessaie dans quelques minutes.' } cohérente avec les autres erreurs.
4. Les routes IA (/api/coach, /api/plate-analyze, /api/recipe-detail) exigent désormais un compte (exigeCompte). Vérifie dans public/app.js que le SOS coach et l'analyse d'assiette ne sont proposés qu'à un utilisateur connecté ; sinon adapte le front pour afficher « Connecte-toi pour utiliser le coach » au lieu d'une erreur brute.
5. Limite du corps : 6mb seulement sur les routes qui reçoivent des photos (/api/progression/photo, /api/plate-analyze, /api/recipes/:id/photo) ; 200kb partout ailleurs.
6. Logue (console) les connexions admin réussies et les 429.

Vérification : npm test (adapte les tests qui appelaient les routes IA sans compte — ils doivent maintenant attendre 401 ; ajoute un test par nouveau comportement : 429 après N requêtes, 401 sur /api/coach sans jeton, en-têtes helmet présents). Navigateur : /, /coach, /academy — zéro erreur CSP dans la console, une vidéo YouTube de l'Academy se lit, le scan code-barres et l'export PDF de l'app client fonctionnent. Termine par la CSP finale et la liste des routes protégées.
```

---

## 2 — Authentification renforcée

```
Renforcement de l'authentification de nutrition-solo (lib/auth.js, server.js, lib/academyRoutes.js). Lis CLAUDE.md.

Constat : email + PIN 4 à 6 chiffres (PIN_RE = /^\d{4,6}$/), sessions de 60 jours fixes, même règle pour un client nutrition et pour l'administrateur qui délivre des certifications.

À faire :
1. PIN minimum 6 chiffres pour les collaborateurs (comptes présents dans boost_collaborateurs) et l'admin ; 4 chiffres restent acceptés pour les clients. Au prochain login d'un collaborateur avec un PIN < 6 chiffres : connexion acceptée UNE fois, réponse enrichie de { pinFaible:true }, et le front Coach/Academy affiche une invitation non bloquante « Renforce ton code » qui mène à /account/set-pin. Aucune migration destructive, personne n'est enfermé dehors.
2. Sessions : 30 jours pour les espaces pros, 60 pour les clients ; renouvellement glissant (chaque requête authentifiée à plus de 24 h de la dernière prolongation repousse expire_le). Nettoyage des sessions expirées au démarrage.
3. Un jeton admin révoqué à chaque changement de PIN (déjà le cas pour ADMIN_PIN_RESET — étends-le à set-pin).
4. Journal minimal : table auth_journal (email, evenement, ip, cree_le) alimentée sur login réussi, login refusé, set-pin, logout ; purge > 90 jours au démarrage. Lecture réservée à exigeAdmin : GET /api/admin/auth-journal?limit=200.

Vérification : npm test + tests nouveaux (PIN 4 refusé pour un collaborateur à la création, accepté pour un client ; prolongation glissante ; journal écrit). Navigateur : login client, login coach, message « Renforce ton code ». Termine par la liste des changements de schéma (CREATE TABLE / ALTER) — aucune colonne existante supprimée.
```

---

## 3 — Sauvegarde automatique + versions d'assets

```
Deux dettes d'exploitation de nutrition-solo. Lis CLAUDE.md.

A. Sauvegarde automatique de la base SQLite.
- lib/sauvegarde.js : fonction sauvegarder(dossier) qui fait VACUUM INTO vers <dossier>/nutrition-<AAAA-MM-JJ-HHmm>.sqlite, conserve les 14 dernières, supprime les plus anciennes, et renvoie { chemin, octets }.
- Au démarrage puis toutes les 24 h (setInterval, unref) si SAUVEGARDE_DIR est défini dans l'environnement ; sinon rien (et un log qui le dit). Ajoute SAUVEGARDE_DIR à .env.example avec un commentaire : sur Railway, pointer vers un volume persistant.
- Route POST /api/admin/sauvegarder (exigeAdmin) qui déclenche une sauvegarde et renvoie le résultat.
- Test : sauvegarde vers un dossier temporaire, fichier lisible par better-sqlite3, rotation à 14.

B. Fin du piège « ?v= à bumper à la main ».
- Au démarrage, server.js calcule un hash court (8 hex, sha1 du contenu) de chaque fichier de public/*.css et public/*.js (hors vendor/) et le garde en mémoire.
- Les trois HTML (index.html, coach.html, academy.html) ne sont plus servis en statique brut : une route les lit, remplace chaque « nom.ext?v=NNN » par « nom.ext?v=<hash> » et les sert avec Cache-Control: no-cache. Les assets gardent max-age=86400 (le hash change l'URL quand le contenu change).
- Le test qui vérifie que academy.css et academy.js portent le même numéro devient : le HTML servi contient un ?v= de 8 hex pour chaque asset. Documente dans CLAUDE.md que le bump manuel n'existe plus.
- En mode dev (node --watch), recalcule les hashs à chaque requête HTML (coût négligeable) pour ne jamais servir un vieil écran.

Vérification : npm test ; navigateur : /academy modifié dans academy.css → rechargement → nouveau style visible sans vider le cache. Termine par le récapitulatif.
```

---

## 4 — Audit XSS de l'app client

```
Audit et correction de l'échappement HTML dans public/app.js (nutrition-solo). Lis CLAUDE.md.

Constat : academy.js utilise echapper() 259 fois, coach.js 14, app.js zéro, alors qu'app.js injecte dans innerHTML des données saisies par l'utilisateur (prénom, aliments détestés, allergies, notes, réponses du coach IA, noms de produits scannés via Open Food Facts).

1. Recense toutes les affectations innerHTML / insertAdjacentHTML / template literals de app.js qui interpolent une donnée non constante. Classe chaque cas : constante du code (sûr), donnée utilisateur ou externe (à échapper), HTML volontaire produit par le code (à garder).
2. Crée public/ui.js (chargé avant app.js, coach.js, academy.js) avec echapper(s) — une seule implémentation partagée ; academy.js et coach.js pointent dessus, leurs copies locales disparaissent.
3. Applique echapper() sur chaque interpolation de donnée utilisateur ou externe identifiée en 1. Ne touche pas au HTML volontaire.
4. Teste avec un compte dont le prénom est <img src=x onerror=alert(1)> et un aliment détesté « "><svg onload=alert(2)> » : aucune exécution, affichage littéral, sur tous les écrans qui montrent ces champs (profil, plan, courses, coach, progression).
5. Ajoute un test API : POST /account/save avec ces valeurs → GET /account/me les renvoie intactes (le serveur stocke, le client échappe).

Vérification : npm test ; navigateur avec les valeurs piégées ; zéro régression d'affichage (accents, apostrophes, « » doivent rester lisibles — echapper ne doit pas double-échapper). Termine par le tableau des cas corrigés.
```

---

## 5 — Lot A : tokens partagés

```
Unification visuelle des trois espaces de nutrition-solo — LOT A : tokens partagés. Lis CLAUDE.md.

CONTEXTE (vérifie avant de commencer)
- App client Nutrition : index.html + style.css (~55 variables : --mc-blue, --ink, --gray-*, --beige, --sage…). Espace Coach : coach.html + coach.css (--marine, --saphir, --saphir-soft…). Academy : academy.html charge coach.css PUIS academy.css (--navy, --sapphire, --sky, --page, --line…).
- Trois marines : #04173B (charte My Coach), #0B1B3A (--navy), #1B2A41 (theme-color de coach.html et academy.html). theme-color de index.html : #F6F5F2.
- Inter chargée 3 fois depuis Google Fonts avec des graisses différentes.

OBJECTIF : une seule source de vérité pour couleurs, rayons, ombres et typographie, sans changer un pixel de comportement fonctionnel.

1. Crée public/tokens.css, chargé EN PREMIER par les trois HTML. En :root :
   Marque : --mc-navy #04173B ; --mc-sapphire #0F52BA ; --mc-sky #5B8DEF ; --mc-white #FFFFFF.
   Neutres : --mc-page #F5F7FB ; --mc-surface #FFFFFF ; --mc-surface-soft #F8FAFF ; --mc-line #E6EAF2 ; --mc-line-soft #EEF1F7 ; --mc-ink #0B1B3A ; --mc-muted #6B7A99 ; --mc-muted-2 #9AA6BF.
   Sémantiques : --mc-success #16A34A ; --mc-success-soft #EAF7EF ; --mc-warning #F59E0B ; --mc-warning-soft #FFF3E0 ; --mc-danger #DC2626 ; --mc-danger-soft #FDECEC ; --mc-gold #D99A06 ; --mc-gold-soft #FFF6E0 ; --mc-gold-text #9A6B00.
   Client (ambiance chaude, app Nutrition uniquement) : --mc-cream, --mc-sand, --mc-sage — reprends les valeurs EXACTES de style.css (--mc-cream, --beige, --sand-soft, --sage), ne les invente pas.
   Rayons : --mc-r-sm 8px ; --mc-r 10px ; --mc-r-lg 12px ; --mc-r-card 16px ; --mc-r-pill 999px.
   Ombres : --mc-shadow-xs 0 1px 2px rgba(11,27,58,.04) ; --mc-shadow-card 0 1px 2px rgba(11,27,58,.04), 0 8px 24px rgba(11,27,58,.04) ; --mc-shadow-md 0 12px 28px rgba(11,27,58,.12) ; --mc-shadow-navy 0 12px 28px rgba(11,27,58,.25).
   Typo : --mc-font-body Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif ; --mc-font-display "Plus Jakarta Sans", var(--mc-font-body) ; --mc-text-xs 11px, -sm 12px, -base 14px, -md 16px, -lg 20px, -xl 28px, -2xl 34px.
   Mouvement : --mc-ease cubic-bezier(.2,.8,.2,1) ; --mc-dur 200ms.

2. Aliasing, pas réécriture. Dans style.css, coach.css, academy.css, remplace la VALEUR des variables existantes par une référence au token (--marine: var(--mc-navy) ; --saphir: var(--mc-sapphire) ; --navy: var(--mc-navy) ; --mc-blue: var(--mc-sapphire) ; --ink: var(--mc-ink) ; --border-c: var(--mc-line) ; --shadow-card: var(--mc-shadow-card)…). Garde les noms d'origine : aucun sélecteur, aucune classe, aucun JS modifié dans ce lot. Tableau de correspondance en commentaire en tête de chaque fichier. Une variable sans équivalent sémantique (--grad-blue, --ring-blue) est redéfinie À PARTIR des tokens, jamais gardée en dur.

3. Marine unique : après aliasing, plus aucune occurrence de #0B1B3A, #1B2A41, #122442, #04173B hors tokens.css (grep CSS + HTML + JS ; pour les couleurs en dur dans academy.js/coach.js/app.js, liste-les sans les toucher). theme-color de coach.html et academy.html → #04173B ; index.html reste #F6F5F2.

4. Police : un seul <link> Google Fonts, identique dans les trois HTML : Inter 400;500;600;700;800 + Plus Jakarta Sans 700;800. h1, chiffres KPI et titres de cartes prennent font-family: var(--mc-font-display). Corps en Inter. Aucune taille augmentée.

5. Versions d'assets : bump style.css, coach.css, academy.css ET academy.js ; tokens.css?v=1 (ou hash si le prompt 3 est passé).

6. Vérification : npm test ; navigateur /, /coach, /academy — zéro erreur console, aucun style cassé (compare aux captures E2E à la racine : academy.png, coach-fiche.png, s1-vierge.png) ; capture des trois écrans côte à côte, même marine, même saphir. Termine par : fichiers modifiés, tableau de correspondance, valeurs en dur restantes (pour décision).
```

---

## 6 — Lot B : coquille commune Coach + Academy

```
Unification visuelle — LOT B : coquille commune Coach + Academy. Lis CLAUDE.md.

CONTEXTE : le lot A est livré (tokens.css, alias en place, tests au vert). L'Academy a une sidebar marine (logo bouclier, nav verticale, carte contextuelle en bas, header blanc 64 px avec fil d'Ariane + chip utilisateur). L'Espace Coach (coach.html / coach.js / coachRdv.js) a une barre horizontale marine avec un carré « MC », le nom du coach et « Se déconnecter ».

OBJECTIF : l'Espace Coach adopte la coquille de l'Academy. L'app client (index.html) n'est PAS concernée.

1. Extrais la coquille en composants réutilisables, indépendants d'academy.js :
   - public/shell.css : .mc-shell (grid sidebar 232 px + main), .mc-sidebar (fond var(--mc-navy), logo, nav, item actif fond saphir + ombre, compteur pill optionnel, carte contextuelle en bas), .mc-header (64 px, blanc, bordure basse, fil d'Ariane à gauche, actions + chip utilisateur à droite), .mc-page (padding 32px 40px, max-width 1240 px). Valeurs exactes d'academy.css, pas d'arrondi.
   - public/shell.js : rendreShell({ marque:{titre, sousTitre}, items:[{id, libelle, icone, href, compteur}], actif, utilisateur:{nom, role, initiales}, fil:[…], carte:{titre, texte, ton} }) → HTML sidebar + header ; jeu d'icônes SVG stroke partagé ICONES (maison, livre, boîte à outils, presse-papiers, utilisateurs, réglages, cloche, déconnexion, chevron, cadenas, check, médaille). Aucun emoji.
   - Migre academy.js pour utiliser shell.js / shell.css au lieu de son markup interne. Conserve identifiants et gestionnaires existants : lis test/e2e/academy-*.js AVANT de renommer quoi que ce soit.

2. Applique la coquille à l'Espace Coach :
   - coach.html charge tokens.css, shell.css, coach.css. La barre horizontale disparaît. Sidebar : marque « MY COACH / ESPACE COACH », items adaptés aux écrans réels de coach.js (Mes clients, Rendez-vous, Boost…), « Academy » (lien /academy), « Se déconnecter » en bas. Header : fil d'Ariane (« Mes clients › Léa ») + chip utilisateur (initiales, nom, « Coach Nutrition »).
   - Les KPI de la fiche client (Étape, Statut, Début, Date limite) reprennent kpiTile de l'Academy (déplace-le dans shell.js) ; les « — » deviennent des textes explicites en principal (« à la validation de l'Étape 1 », « 16 semaines dès l'Étape 1 »).
   - Le contenu Boost (S1, S2, S12, journal) ne change pas : mêmes classes, identifiants, logique.

3. Un seul composant de badge d'état dans shell.css : .mc-badge avec variantes --neutre, --encours, --succes, --attention, --danger. Remplace tous les badges des deux espaces (« À démarrer », « EN COURS », « Interrompu », « À COMMENCER », « Verrouillé », « À venir », « Non accessible »). Deux libellés pour les étapes fermées : « Verrouillé » (cadenas) et « À venir » (pointillé) ; « Non accessible » disparaît.

4. Contraintes : aucune route, donnée ou logique métier modifiée ; bump des assets touchés ; responsive : sous 900 px la sidebar devient une barre basse d'icônes sur les deux espaces.

5. Vérification : npm test ; E2E boost-coach-navigateur.js, boost-s1-navigateur.js, academy-navigateur.js, academy-certificateur-navigateur.js sur base jetable (corrige les sélecteurs si tu en as changé, jamais l'inverse) ; navigateur /coach et /academy côte à côte à 1440 et 390 px, zéro erreur console. Termine par : fichiers modifiés, composants créés (signatures), identifiants renommés.
```

---

## 7 — Lot C : icônes, états vides, mouvement

```
Finitions visuelles transverses Coach + Academy — LOT C. Lis CLAUDE.md. Lots A et B livrés.

1. Emoji → SVG. Grep les emoji dans academy.js, coach.js, coachRdv.js, academy.html, coach.html (🚀 🔥 👋 💡 🗂️ 🎓 🏅 ✓ ⚠ etc.). Remplace chacun par une icône du jeu ICONES de shell.js (ajoute les manquantes : fusée → « tendance », flamme → « série », bonjour → rien, ampoule → « aide », dossier → « ressources », toque → « formation », médaille existante). Le corps de texte peut garder « ✓ » et « — » typographiques ; les titres et badges, non.

2. Carte contextuelle de la sidebar : plus jamais le même texte pour tout le monde. Coach en formation : « Prochaine étape : <titre du contenu> » + bouton Reprendre. Certificateur : « N évaluations en attente » (orange) ou « Tout est à jour » (vert). Admin : « N formations en brouillon ». Les données existent déjà côté écran ; aucune route nouvelle.

3. États vides et « — ». Passe en revue chaque tableau et chaque tuile : un « — » devient une phrase courte (« Jamais connecté », « Aucune certification », « Pas encore commencé »). Un tableau vide affiche une carte centrée : icône, phrase, action (ex. « Aucun coach ne correspond à ces filtres — Réinitialiser »).

4. Mouvement (CSS seulement, respect de prefers-reduced-motion) : barres et anneaux de progression animés au montage (700 ms var(--mc-ease)) ; hover des cartes cliquables (translateY(-1px) + ombre md) ; ouverture des <details> avec transition d'opacité ; focus visible saphir 2 px sur tout élément interactif.

5. Boutons désactivés « Exporter » et « Grille » (Évaluer & certifier) : supprime-les. On ne montre pas de fonction qui n'existe pas.

Vérification : npm test ; grep emoji = 0 dans les fichiers pros ; navigateur : Academy (coach, certificateur, admin) et Coach, zéro erreur console, animations visibles, désactivées avec prefers-reduced-motion. Termine par la liste des icônes ajoutées et des états vides réécrits.
```

---

## 8 — Évaluer & certifier, lot 2 : onglets, filtres, tableau

```
Refonte de l'écran « Évaluer & certifier » (public/academy.js) — LOT 2 : onglets + filtres + tableau. Lis CLAUDE.md (lot 1 livré : tokens, header, bento KPI cliquables, progressRing, kpiTile, accordéon #acRepli).

Décisions : RolePill affiche « Coach » pour tout le monde (pill fond var(--mc-line-soft), texte #4B5A78) — pas de colonne rôle. Pas de bouton « Voir le parcours » : la ligne entière est cliquable.

1. Une seule ligne onglets + filtres, sous le bento, dans l'accordéon : onglets « Coachs · N », « À évaluer · N », « Certifications · N » (compteur en pill ; actif = pill marine texte blanc + soulignement saphir 2 px ; inactif pill var(--mc-line-soft)) ; point saphir pulsé sur « À évaluer » si N > 0. À droite : recherche avec icône loupe (260 px), select formations, select états, 36 px de haut, fond blanc, bordure var(--mc-line), rayon var(--mc-r). Retire les libellés « Formation » / « État » devant les selects. Les filtres actifs s'affichent en chips supprimables sous la ligne. Règle existante à conserver : un onglet remet le filtre d'état à zéro, une tuile KPI pose le sien.

2. Tableau (carte blanche, rayon var(--mc-r-card), overflow hidden). En-tête 11 px uppercase var(--mc-muted) : Coach | Dernière activité | Parcours Academy | À évaluer | Certifs | chevron ; grid 300px 150px 1fr 110px 120px 48px, gap 16. Dans l'en-tête Parcours, à droite, légende unique : ■ Essentiel (saphir) ■ Expertise (sky) ■ Leader (navy). Plus de libellés répétés par ligne.

3. Ligne (padding 18px 24px, séparateur var(--mc-line-soft)) — fonction rendreLigneCoach(coach) :
   - Avatar 44 px rayon 12, initiales, couleur par hash du nom parmi 5 paires (#E0E9FB/#0F52BA, #FDE8D8/#C2410C, #E3F3EA/#15803D, #F3E8FF/#7E22CE, #FFF6E0/#9A6B00). Nom 14px/800 + RolePill ; email 12 px var(--mc-muted).
   - StatusDot + texte : vert < 3 j, orange 3–14 j, gris au-delà ; « Il y a 2 h » / « Jamais connecté » (vuLe est déjà fourni par grouperParCoach).
   - Parcours : « 2 / 34 formations » à gauche, « 6 % » à droite (saphir si > 0), puis SegmentedProgress : UNE barre 8 px en 3 tronçons flex-grow proportionnels aux totaux réels par famille (badges déjà calculés), gap 3 px, rayon 4, fond var(--mc-line-soft), remplissage couleur de la famille, animation scaleX au montage. Le pourcentage reste pctValidation — ne recalcule rien.
   - À évaluer : pill « 0 » grise ou pill orange avec le nombre. Certifs : pill dorée (var(--mc-gold-soft), texte var(--mc-gold-text), icône médaille) ou grise « 0 ».
   - Ligne entière cliquable (button ou role=button + tabindex), hover fond var(--mc-surface-soft), chevron qui glisse de 4 px et passe saphir. Pour ce lot, le clic ouvre le détail existant (detailCoach) ; le drawer arrive au lot 3.

4. Tri par colonne au clic sur l'en-tête (nom, activité, progression, certifs), indicateur de sens, état en module. Pied de tableau : « N coachs · triés par … ». Skeleton (3 lignes grises animées) pendant le chargement ; état vide (carte centrée + « Réinitialiser les filtres »).

5. Découpe en fonctions nommées exportées dans le module : rolePill, statusDot, segmentedProgress, rendreLigneCoach, rendreEnTeteTableau, rendreChipsFiltres. Bump academy.css + academy.js.

Vérification : npm test (adapte les suites qui lisent le DOM du tableau ; ajoute des tests pour le hash d'avatar, le seuil des StatusDot, la proportion des tronçons) ; E2E academy-certificateur-navigateur.js et academy-evaluer-navigateur.js ; navigateur : 3 coachs, tri, filtres, chips, clavier (Tab + Entrée ouvre une ligne). Termine par la liste des fonctions créées avec leur signature exacte.
```

---

## 9 — Évaluer & certifier, lot 3 : drawer + sidebar

```
Refonte « Évaluer & certifier » — LOT 3 : panneau coach + sidebar. Lis CLAUDE.md (lots 1 et 2 livrés : progressRing accepte couleur et texte ; rendreLigneCoach ouvre encore detailCoach).

1. CoachDrawer : panneau 480 px depuis la droite, overlay rgba(11,27,58,.35), fermeture Esc / clic overlay / bouton, focus piégé dans le panneau, retour du focus sur la ligne à la fermeture. URL ?coach=<email> posée à l'ouverture, retirée à la fermeture, lue au chargement (partageable). Ouvert au clic sur une ligne du tableau (remplace l'appel à detailCoach, dont le contenu est réutilisé dans le panneau).
   - En-tête fond var(--mc-navy) : label « PARCOURS DU COACH » 11 px uppercase, bouton fermer, avatar 56 px (même hash que la ligne), nom 20 px + RolePill, email · StatusDot « Actif il y a 2 h ». Un seul CTA : « Évaluer maintenant » (primaire saphir, icône presse-papiers, ombre saphir) qui ouvre le flux d'évaluation existant pour ce coach ; désactivé avec texte « Rien à évaluer » si aEvaluer = 0.
   - Section Progression : « 2 / 34 formations · 6 % » puis 3 cartes fond var(--mc-page) avec progressRing 64 px (Essentiel saphir, Expertise sky, Leader navy), texte « 1/12 » au centre, libellé uppercase 11 px dessous.
   - Section Certifications : badge « N obtenues », liste de cartes (icône médaille, nom de la formation, « Famille · certifié le JJ mois AAAA » depuis delivree_le, chevron vers le détail existant). État vide : « Aucune certification pour l'instant ».
   - Section Activité récente : timeline verticale à partir des données déjà renvoyées (tentatives QCM, contenus terminés, évaluations, certifications) ; point coloré avec halo (vert quiz validé, saphir contenu, orange évaluation en attente, doré certification), titre 13px/700, sous-ligne 12 px grise. 8 éléments max. Si une donnée manque côté API, dis-le et n'invente rien.
   - Sous 900 px : plein écran, glisse depuis le bas.

2. Sidebar : compteur pill sur l'item « Évaluer & certifier » = nombre à évaluer (masqué à 0). Carte contextuelle du certificateur (voir lot C) branchée sur la même donnée.

3. Fonctions : ouvrirDrawerCoach(email), fermerDrawerCoach(), rendreDrawerCoach(coach), rendreTimeline(evenements). Bump assets.

Vérification : npm test + tests (URL ?coach= aller/retour, focus piégé, CTA désactivé à 0) ; E2E certificateur ; navigateur clavier complet (Tab, Esc), 1440 et 390 px, zéro erreur console. Termine par les signatures et les données qui manquaient éventuellement pour la timeline.
```

---

## 10 — Évaluer & certifier, lot 4 : responsive + accessibilité

```
Refonte « Évaluer & certifier » — LOT 4 : responsive fin + accessibilité. Lis CLAUDE.md (lots 1 à 3 livrés).

1. Paliers : ≥ 1200 px = maquette ; 900–1200 : bento 2 colonnes, colonne « Dernière activité » masquée (l'info reste dans le drawer) ; < 900 : bento 1 colonne, lignes du tableau en cartes (avatar + nom + barre segmentée + 2 pills), filtres empilés, sidebar en barre basse.
2. Accessibilité : chaque icône seule porte aria-label ou aria-hidden ; les pills de compteur ont un texte lisible (« 2 certifications ») ; tableau en vraie sémantique (role=table / row / columnheader avec aria-sort) ; onglets en role=tablist / tab / tabpanel avec navigation flèches ; contrastes AA vérifiés (texte var(--mc-muted) sur blanc, pills dorées, badges) — corrige les teintes dans tokens.css si un contraste échoue, et dis lesquelles ; ordre de tabulation logique ; skip-link « Aller au contenu ».
3. Performance perçue : skeletons déjà en place ; ajoute content-visibility: auto sur les lignes hors écran si > 30 coachs.

Vérification : npm test ; audit Lighthouse accessibilité ≥ 95 sur /academy (certificateur connecté) — joins le score ; navigateur 1440 / 1024 / 390 px, navigation clavier complète, lecteur d'écran VoiceOver sur les onglets et une ligne. Termine par la liste des contrastes corrigés.
```

---

## 11 — Catalogue des formations (côté coach)

```
Refonte visuelle du catalogue « Mon Academy » (public/academy.js, écran d'accueil du coach). Lis CLAUDE.md. Lots A, B, C livrés.

Constat : toutes les couvertures sont un rectangle marine avec un bouclier gris ; le bandeau de 4 KPI sert aussi de filtre (première tuile sélectionnée) alors que des chips de filtre existent juste dessous ; le chip dit « Management » alors que partout ailleurs on dit « Leader » ; le badge « À COMMENCER » peut cohabiter avec une barre à 60 %.

1. Couvertures : fonction couvertureFormation(formation) → si la formation a un premier contenu vidéo YouTube avec un ID valide (11 caractères, pas AAAAAAAAAAA), miniature https://i.ytimg.com/vi/<id>/hqdefault.jpg avec un voile dégradé couleur de famille et le pictogramme de la famille en bas à gauche ; sinon, aplat couleur de famille (Essentiel saphir, Expertise sky, Leader navy) + pictogramme + numéro d'ordre. Le module academyCouvertures.js existe : lis-le et branche-toi dessus plutôt que de dupliquer. Ajoute i.ytimg.com à la CSP img-src si nécessaire.
2. Un seul système de filtre : les 4 KPI redeviennent informatifs (non sélectionnables, style kpiTile), les chips filtrent. Chip « Management » → « Leader » (libellé seulement, la clé reste management).
3. Cohérence badge / progression : le badge d'une carte se déduit du même état que la barre (0 % → « À commencer », > 0 → « En cours », théorie validée → « Théorie validée », certifiée → « Certifiée »). Une seule fonction etatCarte(formation) utilisée par le badge ET la barre.
4. Carte : couverture 16:9, badge d'état en haut à droite, titre display 16 px, description 2 lignes max (ellipsis), barre de progression fine, ligne « N / M contenus · durée », CTA texte « Commencer » / « Reprendre » / « Voir ma certification ». Hover : translateY(-2px) + ombre md. Grille 3 colonnes ≥ 1200, 2 ≥ 800, 1 en dessous.
5. Tri « Trier par » : garde-le, mais en select stylé comme les filtres du lot 2.

Vérification : npm test + tests etatCarte et couvertureFormation (ID invalide → aplat) ; E2E academy-navigateur.js, academy-multiformation-navigateur.js ; navigateur avec Théo (0 %) et Lou (60 %) : badges cohérents, couvertures distinctes. Termine par les fonctions créées.
```

---

## 12 — Page de formation (côté coach) en deux colonnes

```
Refonte visuelle de la page d'une formation (public/academy.js, écran ouvert depuis le catalogue). Lis CLAUDE.md. Lots A, B, C, 11 livrés.

Constat : 2 200 px en une colonne, six cartes blanches de même poids (Progression, Parcours, Régularité, À propos, Aide, Ressources) ; carte « Reste régulier » avec un placeholder d'image vide ; libellés d'étapes fermées hétérogènes.

1. Layout ≥ 1100 px : grille 2 colonnes (1fr 340px, gap 24). Colonne principale : hero (couverture de famille en bandeau 120 px, titre display, badge d'état, méta durée/modules/certification), puis le stepper 4 étapes et l'accordéon des étapes (inchangé fonctionnellement). Colonne latérale, sticky (top 88 px) : carte Progression (anneau progressRing 96 px + « 3 / 5 contenus » + CTA « Reprendre » + « Suite : … »), carte Régularité (7 jours, série), carte Ressources (liste ou état vide « Aucune ressource pour l'instant »), carte Aide (texte + bouton « Contacter le support » qui garde son comportement actuel). « À propos » passe sous le hero en texte simple, pas en carte. Sous 1100 px : une colonne, Progression d'abord, puis parcours, puis le reste.
2. Retire le placeholder d'image de « Reste régulier » ; la carte devient compacte (titre 14 px, 7 pastilles, série).
3. Étapes fermées : « Verrouillé » (cadenas) si un prérequis manque, « À venir » (pointillé) si l'étape est simplement plus loin ; « Non accessible » disparaît (composant .mc-badge du lot B).
4. Contenus d'un module : icône d'état à gauche (check vert, lecture saphir, cercle gris), durée à droite, ligne entière cliquable, hover var(--mc-surface-soft). Module verrouillé : opacité .6 + cadenas + phrase courte.

Vérification : npm test ; E2E academy-navigateur.js, academy-mini-navigateur.js, academy-qcm-navigateur.js ; navigateur 1440 / 1024 / 390 px avec Théo et Lou ; zéro erreur console. Termine par les changements de structure DOM (identifiants conservés / ajoutés).
```

---

## 13 — Administration : hiérarchie et actions

```
Refonte visuelle de l'écran « Administrer » de l'Academy (public/academy.js, section admin). Lis CLAUDE.md. Lots A, B, C livrés.

Constat : quinze boutons « Archiver » rouges alignés ; sélecteur de formation en chips qui débordent sur 3 lignes avec « brouillon » inline (ne tiendra pas à 35 formations) ; titres de sections à la même taille que les titres de cartes ; page de 2 600 px.

1. Sélecteur de formation : liste latérale dans une colonne gauche de 280 px (sticky), regroupée par famille (Essentiel / Expertise / Leader), chaque entrée = titre + badge « Brouillon » ou « Publiée » (.mc-badge), recherche en haut, bouton « + Nouvelle formation » et « Importer un JSON » en bas. La formation active est surlignée saphir.
2. Contenu à droite, en onglets (role=tablist) : Réglages · Modules & contenus · Mini-QCM · QCM final · Cas pratiques. L'onglet ouvert est mémorisé dans l'URL (?onglet=). Le bloc « Formation publiée / Dépublier » reste visible au-dessus des onglets, compact, avec l'encart « À savoir » en badge attention plutôt qu'en carte.
3. Actions par ligne (module, contenu, question, cas) : un menu « ⋯ » (bouton icône, menu déroulant accessible clavier) avec Modifier, Monter, Descendre, Archiver. Archiver en rouge UNIQUEMENT dans le menu, et confirmation inline (« Archiver ce contenu ? Oui / Non »), pas de window.confirm. Les boutons rouges alignés disparaissent.
4. Hiérarchie typographique : h2 de section 20 px display, h3 de carte 15 px, méta 12 px var(--mc-muted). Les compteurs (« 10 tirables · il en faut 5 ») deviennent des pills : verte si la banque suffit, orange sinon.
5. Aucune route ni logique modifiée : les mêmes appels API, les mêmes fonctions de sauvegarde.

Vérification : npm test ; E2E academy-admin-navigateur.js (adapte les sélecteurs si tu en as changé) ; navigateur : créer, modifier, monter, archiver un contenu via le menu ; navigation clavier du menu ; 1440 et 1024 px. Termine par les identifiants renommés et les composants créés (menuActions, ongletsAdmin, listeFormations).
```

---

## 14 — Découpage d'academy.js en modules ES

```
Refactor structurel de public/academy.js (~6 500 lignes, ~300 fonctions, ~64 variables de module) en modules ES natifs, sans build. Lis CLAUDE.md. À faire APRÈS les lots visuels pour ne pas les compliquer.

1. academy.html charge <script type="module" src="academy/main.js">. Découpage cible : academy/etat.js (les variables de module actuelles, exportées via un objet etat + fonctions d'accès), academy/api.js (tous les fetch), academy/ui.js (echapper si pas déjà dans public/ui.js, icone, kpiTile, progressRing, badge, segmentedProgress, rolePill, statusDot, chips), academy/connexion.js, academy/catalogue.js, academy/formation.js, academy/qcm.js, academy/pratique.js, academy/evaluer.js (bento, tableau, drawer), academy/admin.js, academy/routeur.js (afficher(), hash, fil d'Ariane), academy/main.js (démarrage). shell.js devient lui aussi un module importé.
2. Règles : déplacer sans réécrire (git mv logique : les fonctions gardent nom et corps) ; une fonction = un seul module ; zéro variable globale window.* sauf celles que les E2E lisent (liste-les en lisant test/e2e/*.js et garde-les via window.__academy = {...}) ; imports explicites, pas de barrel qui réimporte tout.
3. Le mécanisme de version d'assets (hash du prompt 3, ou ?v=) doit couvrir academy/*.js. Si le hash est en place, étends le remplacement aux imports internes (ou sers les modules avec Cache-Control no-cache en dev et un hash dans le chemin en prod — propose l'option la plus simple et applique-la).
4. Étapes intermédiaires testables : fais le découpage en 3 commits logiques minimum (état + api + ui ; écrans coach ; écrans certificateur + admin) mais SANS commiter — laisse-moi le faire ; entre chaque étape, npm test et un chargement de /academy sans erreur console.

Vérification : npm test ; TOUS les E2E academy-* sur base jetable ; navigateur : parcours complet coach (catalogue → formation → contenu → mini-QCM), certificateur (bento → tableau → drawer), admin (créer un contenu). Aucun comportement changé. Termine par l'arbre des fichiers avec leur nombre de lignes et la liste des window.* conservés.
```

---

## 15 — Hygiène : README, package.json, E2E

```
Hygiène du dépôt nutrition-solo. Lis CLAUDE.md.

1. package.json : name « my-coach-plateforme » (ou celui que je te donne), description « My Coach : app client Nutrition, Espace Coach / Boost et Academy — Express + SQLite, sans build ». Scripts : test, start, dev, valider, sauvegarder (existe), e2e (nouveau, voir 3).
2. README.md : réécris-le pour les trois espaces. Sections : Ce que c'est (3 espaces, qui s'y connecte), Démarrer, Structure (arbre réel de lib/ et public/ après les refontes), API (tableau par espace, généré en lisant les routes réelles de server.js, lib/academyRoutes.js, lib/boostRoutes.js), Tests (npm test → nombre réel ; npm run e2e), Configuration (.env.example à jour : SAUVEGARDE_DIR, ADMIN_EMAIL, NUTRITION_AI*…), Déploiement (Railway : volume persistant obligatoire pour data/ et SAUVEGARDE_DIR). Garde la section Vie privée et Sécurité allergies, elles sont bonnes.
3. npm run e2e : script tools/e2e.js qui démarre le serveur sur un port libre avec NUTRITION_DB temporaire, joue chaque test/e2e/*-navigateur.js en séquence, collecte les captures dans e2e-out/ (gitignoré), affiche un tableau OK/KO par script et sort avec le code adéquat. Playwright doit être dans devDependencies (pas --no-save).
4. CLAUDE.md : ajoute la ligne « npm run e2e avant de livrer un lot visuel ».

Vérification : npm test ; npm run e2e complet (joins le tableau) ; README relu à haute voix : un développeur qui arrive comprend les trois espaces en 2 minutes. Termine par le diff du package.json.
```

---

## Décisions à prendre par Stan (bloquent deux mini-lots)

- `publie_le` sur `academy_formations` : ajouter la colonne ? que rétro-remplir pour les 34 publiées (proposition : `maj_le` au moment de la migration) ? afficher « — » tant que le dénominateur est vide ? → débloque le KPI « Essentiels validés ».
- `role` sur `boost_collaborateurs` (`coach` | `coach_leader`) : ajouter la colonne et un champ dans l'admin Collaborateurs ? → remplace le « Coach » pour tous de la RolePill.
