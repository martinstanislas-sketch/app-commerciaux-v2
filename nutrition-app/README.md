# My Coach Nutrition

> Manger facile, selon vos gouts et votre objectif.

Application web simple qui aide n'importe qui a manger selon ses envies, ses gouts
et son objectif (perte de poids, maintien, prise de muscle, plus d'energie).
L'utilisateur repond a quelques questions et recoit un **plan de repas de la semaine**
adapte, avec **liste de courses** et **recettes simples**. Un repas qui ne plait pas se
**remplace en un clic**.

## Etat actuel — « demarrage leger »

Cette version tourne **sans aucune dependance externe lourde** :

- ✅ Onboarding en 5 etapes + barre de progression
- ✅ Calcul des besoins (Mifflin-St Jeor) + repartition des macros
- ✅ Generation du plan en **mode demo** (banque de recettes locale, gratuit, hors-ligne)
- ✅ Filtrage **strict des allergies / aliments detestes / regime / temps / budget**
- ✅ Liste de courses agregee par rayon, avec cases a cocher
- ✅ Remplacement d'un repas a la carte
- ✅ Sauvegarde locale du plan (localStorage) — retrouve au rechargement
- ✅ Recettes detaillees (quantites d'assaisonnement, feu, temps, reperes de cuisson)
- ✅ **Export PDF** du plan et de la liste de courses (via impression, 100% hors-ligne)
- ✅ **Favoris** (♥) reproposes en priorite dans les prochains plans
- ✅ **Regenerer une journee entiere** en un clic
- ✅ **Portions x1 a x12** : la liste de courses et les recettes se mettent a l'echelle
- ✅ **Swap d'un ingredient** precis (alternatives respectant les allergies)
- ✅ **« Ne plus me proposer »** une recette (exclusion persistante)
- ✅ **Recettes guidees dynamiques** (avec `NUTRITION_AI=on`) : a l'ouverture et a
  chaque remplacement d'ingredient, Claude reconstruit la recette a partir des
  ingredients actuels (materiel, prepa, etapes feu/temps/reperes, ajustements,
  dressage) + recalcule les macros. Coherence garantie, mise en cache. Sans IA,
  repli sur les etapes detaillees statiques.
- ✅ Branchement **Claude** pret a l'emploi (opt-in `NUTRITION_AI=on`)

Les prochaines etapes (comptes email, base de donnees Supabase, export PDF) sont
documentees plus bas dans « Pour aller plus loin ».

## Lancer en local (une seule commande)

Prerequis : **Node.js 18+**.

```bash
cd nutrition-app
npm install
npm start
```

Puis ouvrez **http://localhost:3000**.

> `npm install` n'installe que **Express**. Le mode demo fonctionne immediatement,
> sans cle API ni compte.

## Activer la generation par Claude (optionnel)

Par defaut l'app est en **mode demo** (recettes locales, gratuit). Pour generer les
menus avec Claude :

1. Installez le SDK :
   ```bash
   npm install @anthropic-ai/sdk dotenv
   ```
2. Copiez le fichier d'exemple et renseignez votre cle :
   ```bash
   cp .env.example .env
   ```
   Dans `.env`, il faut **les deux** lignes (cle **et** opt-in explicite) :
   ```
   NUTRITION_AI=on
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-4-6
   ```
   Obtenir une cle : https://console.anthropic.com/
3. Relancez `npm start`. Le badge en haut a droite passe de **« Mode demo »** a
   **« Mode Claude »**.

> **Pourquoi l'opt-in `NUTRITION_AI=on` ?** Si une cle `ANTHROPIC_API_KEY` est deja
> presente dans l'environnement de votre machine, l'app **reste en mode demo** tant que
> vous n'avez pas explicitement active l'IA — pour eviter tout cout surprise.

Si l'appel IA echoue (reseau, quota, JSON invalide), l'app **bascule automatiquement
sur le mode demo** : l'utilisateur n'est jamais bloque.

## Securite allergies (ceinture + bretelles)

Un aliment declare en allergie ne doit **jamais** apparaitre. Deux filtres :

1. **A la generation** (`lib/planGenerator.js`) : les recettes contenant un allergene
   ou un aliment deteste sont ecartees avant meme la selection.
2. **Apres generation** (`server.js`, `filtreSecuriteFinal`) : un second passage retire
   toute recette suspecte — utile en particulier pour les sorties IA.

Avertissement affiche partout : *« Estimations a titre indicatif, ne remplace pas
l'avis d'un professionnel de sante. »*

## Structure du projet

```
nutrition-app/
├── server.js              # Serveur Express + API (/api/needs, /api/plan, /api/meal, /api/status)
├── lib/
│   ├── nutrition.js       # Besoins caloriques (Mifflin-St Jeor) + macros
│   ├── recipes.js         # Banque de recettes du mode demo (taguees regime/allergenes)
│   ├── planGenerator.js   # Filtrage strict + selection du plan (mode demo)
│   └── aiGenerator.js     # Branchement Claude (optionnel) + validation JSON stricte
├── public/
│   ├── index.html         # Landing + onboarding + resultat + modale + liste de courses
│   ├── style.css          # Theme doux, mobile-first
│   └── app.js             # Logique front
├── .env.example
├── package.json
└── README.md
```

## API

| Methode | Route          | Role                                            |
|---------|----------------|-------------------------------------------------|
| POST    | `/api/needs`   | Calcule les besoins caloriques d'un profil      |
| POST    | `/api/plan`    | Genere le plan de la semaine                     |
| POST    | `/api/meal`    | Regenere un seul repas                           |
| GET     | `/api/status`  | Indique si l'IA est active (badge front)        |

## Pour aller plus loin (roadmap)

- **Comptes email + sauvegarde serveur** : migration vers Supabase (auth magic link,
  Postgres, RLS) — tables `profiles`, `preferences`, `plans`. Le code de generation est
  deja isole pour brancher ca sans tout reecrire.
- **Validation par zod** des sorties IA (actuellement validation manuelle, sans dependance).
- **Export PDF** de la liste de courses, **favoris** de recettes, **swap d'ingredient**.
- **Deploiement** : compatible Node hebergeur classique (Render, Railway, Fly.io) ou
  passage a Next.js + Vercel si besoin de SSR.

---

## Connexion Google Agenda — activation

La fonctionnalite « Connecter Google Agenda » est **entierement codee** (OAuth + API
Calendar, dans le `server.js` **racine** de l'app principale, routes
`/nutrition/api/google/*`). Elle reste **desactivee** tant que les identifiants Google
ne sont pas fournis : sans eux, le bouton « Connecter » est grise et l'interface
propose le fichier `.ics` en repli (compatible Google, Apple, Outlook).

Pour l'activer, definir **3 variables d'environnement** sur l'app **racine**
(Railway → Variables, pas dans `nutrition-app/`) :

| Variable | Valeur |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID client OAuth 2.0 (type « Application Web ») |
| `GOOGLE_CLIENT_SECRET` | Secret client associe |
| `GOOGLE_REDIRECT_URI` | `https://<domaine-prod>/nutrition/api/google/callback` |

Cote **Google Cloud Console** :

1. Creer un projet, **activer l'API Google Calendar**.
2. Configurer l'**ecran de consentement OAuth** (externe), ajouter le scope
   `https://www.googleapis.com/auth/calendar.app.created` (scope **minimal** : l'app ne
   gere QUE son propre calendrier « My Coach Nutrition », sans toucher a l'agenda perso).
3. Creer un **ID client OAuth « Application Web »** et ajouter l'**URI de redirection
   autorisee** identique a `GOOGLE_REDIRECT_URI` ci-dessus.
4. Reporter `client_id` / `client_secret` dans les variables Railway, puis redeployer.

Une fois ces variables posees : le bouton devient actif, le parcours d'autorisation
s'ouvre en popup, l'etat passe a « Google Agenda connecte » avec synchronisation
(jour / semaine / rappels) et deconnexion. Les erreurs (refus, popup bloquee, statut
indisponible) sont affichees clairement a l'utilisateur.

---

*Estimations a titre indicatif. Cette application ne remplace pas l'avis d'un
professionnel de sante.*
