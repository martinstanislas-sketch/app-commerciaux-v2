# My Coach Nutrition

> Manger facile, selon tes goûts et ton objectif.

Application web autonome : l'utilisateur répond à quelques questions et reçoit son
**plan de repas de la semaine**, avec **liste de courses** et **recettes détaillées**.
Un repas qui ne plaît pas se **remplace en un clic**.

## Ce que c'est — et ce que ce n'est plus

Cette application est dérivée de **Protocole 42** (le dossier `nutrition-app/`, qui
continue de tourner pour les clients du coach). Elle en reprend le moteur, les
recettes et les écrans, **sans le dispositif de coaching**.

| | Protocole 42 | Cette version |
|---|---|---|
| **Objectif** | imposé : challenge « −6 kg en 6 semaines » | **choisi** parmi les 4 d'origine |
| **Inscription** | compte pré-créé par un coach + code de cohorte | libre-service, email + code PIN |
| **Progression** | parcours 42 jours, jalons S3/S6, Punch, cadeaux | pesées / mensurations / photos, **quand on veut** |
| **Social** | groupe, mur, fil d'activité, défis | aucun — rien ne relie deux comptes |
| **Coach** | coach humain + messagerie + IA | **IA seule**, plus personne à prévenir |
| **Dépendances** | montée dans le serveur de l'app commerciale | **`node server.js`**, base SQLite à elle |

### Les quatre objectifs d'origine

Ce sont exactement ceux du premier jour, restaurés tels quels (`lib/nutrition.js`) :

| Objectif | Calories | Macros (P / G / L) |
|---|---|---|
| 🎯 Perdre du poids | −15 % (déficit doux) | 30 / 40 / 30 |
| ⚖️ Maintenir mon poids | maintenance | 25 / 45 / 30 |
| 💪 Prendre du muscle | +10 % (surplus doux) | 30 / 45 / 25 |
| ⚡ Avoir plus d'énergie | maintenance | 20 / 50 / 30 |

Le Protocole 42 avait ajouté un 5ᵉ objectif `challenge` **et masqué l'étape du choix**
(`FORCE_CHALLENGE = true`) : tout nouvel inscrit démarrait en challenge sans avoir rien
choisi. Ici l'étape 1 est de nouveau « Quel est ton objectif ? ».

## Démarrer

Prérequis : **Node.js 18+**.

```bash
cd nutrition-solo
npm install
npm start
```

Puis <http://localhost:3000>. La base SQLite (`data/nutrition.sqlite`) et les
réponses du coach sont créées au premier démarrage — rien à configurer.

## Fonctionnalités

**Le plan** — onboarding en 6 étapes, besoins caloriques (Mifflin-St Jeor) et macros,
plan de 7 jours, remplacement d'un repas ou d'une journée entière, favoris ♥,
« ne plus me proposer », portions ×1 à ×12, échange d'un ingrédient précis,
recettes guidées (matériel, étapes, feu, temps, repères de cuisson), export PDF.

**Les courses** — liste agrégée par rayon, cases à cocher, mise à l'échelle du nombre
de personnes, export PDF, export texte partageable.

**Le SOS coach** — bouton flottant présent sur tous les écrans. Il répond d'abord par
40 réponses préenregistrées (gratuit, instantané), puis par Claude si une clé est
configurée. Il connaît le profil, le plan du jour et les macros restantes. Sans clé,
il le dit — il ne renvoie plus vers un coach humain, il n'y en a pas.

**La progression** — pesées libres (une par jour, la dernière fait foi), mensurations,
photos avant/après, courbe de poids. Aucun jalon imposé. Le commentaire s'adapte à
l'objectif : perdre 2 kg n'est pas lu de la même façon selon qu'on veut maigrir ou
prendre du muscle.

**Le suivi** — adhérence repas par repas, analyse des écarts, compléments,
scan de code-barres (Open Food Facts) avec verdict de compatibilité et remplacement
d'ingrédient, analyse d'assiette en photo (IA), export du plan vers l'agenda (`.ics`).

### Sécurité allergies (ceinture + bretelles)

Un aliment déclaré en allergie ne doit **jamais** apparaître. Deux filtres indépendants :

1. **à la génération** (`lib/planGenerator.js`) — les recettes contenant un allergène
   ou un aliment détesté sont écartées avant la sélection ;
2. **après génération** (`server.js`, `filtreSecuriteFinal`) — un second passage retire
   toute recette suspecte, utile surtout pour les sorties IA.

## Vie privée

C'est le point sur lequel cette version diffère le plus de l'originale : **aucune table
ne relie deux comptes**, et aucune route n'accepte un email en paramètre — tout est
filtré sur le porteur du jeton. Concrètement :

- les photos de progression vivent **en base**, jamais dans un dossier servi par
  Express, et leur lecture exige le jeton de leur propriétaire (une URL devinée
  renvoie 404) ;
- 5 codes PIN erronés déclenchent une **temporisation qui double** (1, 2, 4… minutes,
  plafond 1 h) et non un blocage définitif : sans coach pour déverrouiller, un blocage
  définitif enfermerait quelqu'un dehors pour de bon ;
- `DELETE /account` supprime le compte et, par cascade, tout ce qui s'y rattache.

## Structure

```
nutrition-solo/
├── server.js              # API + service du front (autonome)
├── lib/
│   ├── nutrition.js       # besoins caloriques + macros (les 4 objectifs)
│   ├── recipes-v2.js      # banque de 382 recettes
│   ├── planGenerator.js   # filtrage strict + sélection du plan
│   ├── aiGenerator.js     # branchement Claude (plans, recettes, assiette, coach)
│   ├── coachFaq.js        # 40 réponses préenregistrées + moteur de correspondance
│   ├── auth.js            # email + PIN, en libre-service
│   ├── avatar.js          # config -> SVG (chargé côté serveur ET navigateur)
│   └── db.js              # schéma SQLite
├── public/                # front (index.html, app.js, style.css)
└── test/
    ├── parcours-complet.test.js   # 21 tests d'API (npm test)
    └── e2e/parcours-navigateur.js # parcours navigateur (Playwright, manuel)
```

## API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/status` | IA active ? compte connecté ? |
| POST | `/api/needs` | besoins caloriques d'un profil |
| POST | `/api/plan` | plan de la semaine |
| POST | `/api/meal` | régénère un repas |
| POST | `/api/recipe-detail` | recette guidée par IA (opt-in) |
| POST | `/account/login` | connexion **ou** inscription |
| GET | `/account/me` · POST `/account/save` | compte, profil, plan |
| DELETE | `/account` | suppression du compte et de ses données |
| GET/POST | `/api/progression/*` | pesées, mensurations, photos |
| POST/GET | `/api/adherence` | suivi du plan, jour par jour |
| POST | `/api/coach` · `/api/coach-faq/match` | SOS coach (IA / préenregistré) |
| POST | `/api/scan` · `/api/plate-analyze` | code-barres, analyse d'assiette |

Toutes les routes personnelles exigent `Authorization: Bearer <jeton>`.

## Tests

```bash
npm test                      # 21 tests d'API sur une base jetable
```

Le parcours navigateur (landing → inscription → plan → progression → coach) se lance
à part, il demande Playwright et un serveur allumé :

```bash
npm install --no-save playwright
NUTRITION_DB=/tmp/e2e.sqlite PORT=3222 node server.js &
BASE=http://127.0.0.1:3222 node test/e2e/parcours-navigateur.js
```

## Configuration

Tout est optionnel, voir `.env.example`. Les trois interrupteurs d'IA sont **séparés**,
du moins cher au plus cher : `NUTRITION_AI` (coach + analyse d'assiette),
`NUTRITION_AI_PLAN` (génération du plan), `NUTRITION_AI_RECIPES` (recettes réécrites).
Une clé présente dans l'environnement ne suffit jamais : l'opt-in est explicite.

## À savoir avant de mettre en ligne

- **Photos des recettes.** Le catalogue ne porte pas d'image : dans Protocole 42, les
  photos vivent dans la base de production (ajoutées une à une via l'admin) — elles ne
  sont pas dans le dépôt, donc un déploiement neuf affiche les plats sans visuel.
  **`tools/importer-photos.js` les rapatrie en une commande**, en ne passant que par
  des routes qui existent déjà (index public côté source, route admin côté cible) :

  ```bash
  node tools/importer-photos.js \
    --source https://app.stanmartinapp.cloud/nutrition \
    --cible  https://<votre-app>.up.railway.app \
    --email  <ADMIN_EMAIL> --pin <code>
  ```

  Prérequis : `ADMIN_EMAIL` posé sur la cible (Railway → Variables) et ce compte créé
  (une première connexion dans l'app suffit). Relançable sans risque — un plat déjà
  illustré est sauté (`--remplacer` pour forcer). Ensuite, `ADMIN_EMAIL` garde accès
  à « Photos des plats » pour compléter ou remplacer à la main.
- **Liens boutique.** Les fiches compléments pointaient la boutique du coach (liens
  affiliés). `SHOP_BASE` est **vide** dans `public/app.js` : renseigner cette seule
  constante réactive tous les liens produit.
- **Nom de l'app.** Il est écrit à quatre endroits : `APP_NOM` (`public/app.js` et
  variable d'environnement côté serveur), `<title>` d'`index.html`, `manifest.json`.

---

*Estimations à titre indicatif. Cette application ne remplace pas l'avis d'un
professionnel de santé.*
