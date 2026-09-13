# CRM automation — collecte RECAP 2

Bac à sable **totalement isolé** de l'application commerciale. Rien ici n'est
déployé, rien ici n'est importé par `server.js`, et le `package.json` de la
racine n'a pas été touché (Playwright ne doit pas alourdir le build Railway).

`open-crm.js` ouvre la fenêtre et tient la session ; `recap2.js` fait tout le
reste en une commande (collecte, contrôles, résumé, envoi) en orchestrant
`recap2-collecte.js` et `recap2-envoi.js`, qui restent utilisables séparément.
Les deux CRM sont lus, **jamais écrits**.

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
| `recap2.js` | **La commande du mois.** Orchestre tout et n'envoie que si les contrôles bloquants passent. |
| `recap2-collecte.js` | Produit `.session/controle/recap2-AAAA-MM.json` (Deciplus + Fitness Booster). |
| `recap2-envoi.js` | Dépose ce JSON sur le serveur (POST authentifié). |
| `lib/recap2Controles.js` | La frontière bloquant / non bloquant. Module pur, testé. |
| `lib/reessai.js` | Rejoue une lecture après un à-coup d'affichage. Jamais un contrôle. |
| `lib/rapportFichier.js` | Décide où écrire le rapport — et protège le précédent. |
| `package.json` | Dépendance Playwright, isolée de l'app principale. |
| `.env.example` | Modèle de configuration locale — **aucun secret réel dedans**. |
| `.gitignore` | Exclut `.session/`, `node_modules/`, `.env`. |

## RECAP 2 : du Mac au serveur

La collecte a besoin du navigateur connecté aux deux CRM : elle ne tournera
jamais sur Railway. Le serveur, lui, ne sait que **relire** un JSON déposé.

### La commande du mois — une seule

```bash
CRM_DEBUG_PORT=9222 npm run open      # une fois : la fenêtre, la connexion à la main
npm run recap2 -- 2026-08             # tout le reste
```

`npm run recap2` marche depuis la racine du projet **comme** depuis
`crm-automation/`. En direct : `node crm-automation/recap2.js 2026-08`.

Elle enchaîne, dans cet ordre, et s'arrête à la première marche cassée :

1. **Navigateur et session** — Chromium répond, les deux onglets CRM sont
   ouverts, aucun n'est retombé sur un écran de connexion ; l'adresse et la clé
   de dépôt sont là (vérifié **avant** dix minutes de collecte, pas après) ;
2. **Collecte** — Deciplus M et M-1, Fitness Booster M-1, ventes annulées exclues ;
3. **Contrôles + résumé lisible**, affiché **avant** tout envoi ;
4. **Envoi** — seulement si aucun contrôle bloquant n'échoue.

Puis quatre lignes : le mois, les studios, le nombre d'alertes non bloquantes,
et le succès ou l'échec de l'envoi.

| Option | Effet |
|---|---|
| `--sans-deciplus` | Réutilise les CSV Deciplus déjà exportés. |
| `--sans-collecte` | Ne collecte pas : relit le JSON du mois, rejoue les contrôles, refait l'envoi. La reprise après un dépôt raté. |
| `--sans-envoi` | S'arrête après le résumé. Aucun dépôt. |
| `--url https://…` | Serveur de destination (sinon `RECAP2_INGEST_URL`). |

### Ce qui bloque l'envoi, ce qui ne le bloque pas

**BLOQUE** — un chiffre serait faux ou manquant : incohérence de période, studio
manquant ou privé de KPI, KPI impossible (taux hors bornes, numérateur >
dénominateur), nombre de lignes incohérent (le parseur a perdu des lignes),
problème d'authentification ou toute erreur de collecte.

**NE BLOQUE PAS** — le chiffre est juste, la particularité mérite d'être dite :
doublons de contrat connus, encaissements sans adhérent écartés. Ils sont
comptés, affichés, et l'envoi part.

⚠️ **Une alerte, un phénomène.** Les lignes sans adhérent manquent à la somme
des lignes mais pas au total annoncé par Deciplus : c'est la seule cause connue
de « l'écart global ». Elles ne sont donc signalées **qu'une fois** — chez le
studio concerné, ou une fois pour toutes si elles sont hors des 6 studios. Une
alerte globale ne reste que s'il subsiste une part d'écart **inexpliquée**.

### Quand ça tremble

Les deux CRM sont des applications lourdes. Sous charge, la barre de filtres
Deciplus n'est pas redessinée dans les vingt secondes, ou le sélecteur de club
de Fitness Booster n'a pas fini de basculer quand on lit le titre. Ce ne sont
pas des anomalies de données : c'est la même page, une seconde trop tôt.

- **Chaque lecture est rejouée une fois** avant d'être déclarée perdue, après
  remise de l'écran en état (filtres réinitialisés, panneau refermé).
  `RECAP2_TENTATIVES=3` pour insister, `=1` pour désactiver.
- **Les contrôles, eux, ne sont jamais rejoués.** Un club affiché qui reste faux
  après deux passages est un échec, et il le reste.
- **Un mois Deciplus qui échoue n'emporte plus l'autre** : juin exporté reste
  exporté même si juillet tombe.
- **Une collecte en échec n'écrase jamais un rapport exploitable.** Elle écrit à
  côté, en `recap2-AAAA-MM.echec.json`. L'envoi ne lit que le fichier principal.
- **Un fichier ancien ne peut pas passer pour une collecte fraîche.** Si la
  collecte meurt avant d'écrire, `recap2.js` le voit à l'horodatage et s'arrête :
  sans ce garde-fou, les contrôles du fichier précédent passeraient tous et on
  déposerait des chiffres périmés en croyant les avoir relevés à l'instant.

⚠️ **Il faut de la mémoire.** Chromium pilotant deux SPA plus des
téléchargements de plus d'un mégaoctet ne tient pas sur une machine qui swappe :
il se fait tuer en plein export. Sur un Mac de 8 Go, fermer les autres
navigateurs avant de lancer. `CRM_HEADLESS=1 npm run open` allège nettement,
une fois la session déjà établie dans le profil.

### Les deux étapes à la main (toujours disponibles)

```bash
cd crm-automation
node recap2-collecte.js 2026-07              # collecte -> .session/controle/recap2-2026-07.json
node recap2-envoi.js  2026-07 --verifier     # valide le fichier, n'envoie rien
node recap2-envoi.js  2026-07                # dépôt sur le serveur
```

### Tests

```bash
cd crm-automation && npm test
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
