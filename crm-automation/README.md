# CRM automation — collecte RECAP 2

Bac à sable **totalement isolé** de l'application commerciale. Rien ici n'est
déployé, rien ici n'est importé par `server.js`, et le `package.json` de la
racine n'a pas été touché (Playwright ne doit pas alourdir le build Railway).

`open-crm.js` ouvre la fenêtre et tient la session ; `recap2-collecte.js`
produit le JSON du mois ; `recap2-envoi.js` le dépose sur le serveur. Les deux
CRM sont lus, **jamais écrits**.

## Installation (une fois)

```bash
cd crm-automation
npm install                      # Playwright (sans télécharger les navigateurs)
npx playwright install chromium  # le seul navigateur dont on a besoin
```

Chromium est téléchargé dans le cache de Playwright (`~/Library/Caches/ms-playwright`),
**hors du dépôt**.

## Ouvrir le CRM

```bash
cd crm-automation
npm run open
```

ou en précisant l'adresse :

```bash
node open-crm.js https://mon-crm.exemple.fr/
CRM_URL=https://mon-crm.exemple.fr/ npm run open
```

Ordre de résolution de l'URL : **argument** → variable `CRM_URL` → valeur par
défaut (le CRM Deciplus déjà référencé par l'app dans les liens de fiche RECAP).

Le navigateur s'ouvre, **tu te connectes à la main**, et le script attend.
`Ctrl+C` dans le terminal ferme la fenêtre.

## Session persistante

Le script utilise un **profil Chromium persistant** dans `.session/chromium/`.
C'est ce dossier qui retient les cookies : après une première connexion
manuelle, les lancements suivants retrouvent la session — comme un Chrome
ordinaire qu'on rouvre.

Toutes les minutes, le script affiche **le nombre** de cookies et leurs domaines,
jamais leur contenu. C'est le témoin qui permet de vérifier que la session tient.

### Règles de sécurité

- **Aucun identifiant n'est écrit dans le code, ni demandé, ni journalisé.** La
  connexion se fait uniquement dans la fenêtre du navigateur.
- **`.session/` contient la session connectée** : c'est un secret au même titre
  qu'un mot de passe. Il est ignoré par git (`.gitignore` local) et ne doit
  jamais être commité, copié ni partagé.
- Si la session doit être révoquée : supprimer `.session/` et se déconnecter
  côté CRM.

## Contenu

| Fichier | Rôle |
|---|---|
| `open-crm.js` | Ouvre Chromium visible sur le profil persistant, puis attend. |
| `recap2-collecte.js` | Produit `.session/controle/recap2-AAAA-MM.json` (Deciplus + Fitness Booster). |
| `recap2-envoi.js` | Dépose ce JSON sur le serveur (POST authentifié). |
| `package.json` | Dépendance Playwright, isolée de l'app principale. |
| `.env.example` | Modèle de configuration locale — **aucun secret réel dedans**. |
| `.gitignore` | Exclut `.session/`, `node_modules/`, `.env`. |

## RECAP 2 : du Mac au serveur

La collecte a besoin du navigateur connecté aux deux CRM : elle ne tournera
jamais sur Railway. Le serveur, lui, ne sait que **relire** un JSON déposé. D'où
deux commandes, dans cet ordre, une fois par mois :

```bash
cd crm-automation
node recap2-collecte.js 2026-07              # collecte -> .session/controle/recap2-2026-07.json
node recap2-envoi.js  2026-07 --verifier     # valide le fichier, n'envoie rien
node recap2-envoi.js  2026-07                # dépôt sur le serveur
```

Configuration : `cp .env.example .env`, puis renseigner `RECAP2_INGEST_URL` et
`RECAP2_INGEST_KEY`. Cette clé est la **même** que la variable Railway du même
nom : c'est elle, et elle seule, qui ouvre `POST /api/recap2/:mois`.

Le fichier atterrit dans `$DB_DIR/recap2/recap2-AAAA-MM.json` (le volume, à côté
de la base), en `0600`, par un `rename()` atomique — **aucune écriture SQL,
aucune copie `.bak`**. Il n'est servi que par `GET /api/recap2/:mois`, réservée à
l'admin connecté ; rien n'est exposé en statique.

### Ce qui part, ce qui ne part pas

**Part** : les deux KPI par studio, leurs compteurs, et le **détail nominatif**
(c'est ce que l'écran ouvre au clic), plus la traçabilité de la collecte.

**Ne part jamais** : les CSV Deciplus (`.session/exports/`), le profil Chromium
et ses cookies (`.session/chromium/`), les captures d'observation. L'expéditeur
reconstruit le message champ par champ à partir de la forme canonique définie
dans `lib/recap2Store.js`, et le serveur revalide tout avant d'écrire : une clé
inattendue, une chaîne de plus de 500 caractères, un taux qui ne colle pas à son
rapport — et le dépôt est refusé sans rien écrire.
