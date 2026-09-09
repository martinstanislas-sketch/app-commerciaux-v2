# CRM automation — étape 1 : ouvrir et rester connecté

Bac à sable **totalement isolé** de l'application commerciale. Rien ici n'est
déployé, rien ici n'est importé par `server.js`, et le `package.json` de la
racine n'a pas été touché (Playwright ne doit pas alourdir le build Railway).

À ce stade le script **n'extrait aucune donnée**. Il ouvre une fenêtre, et c'est
tout.

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
| `package.json` | Dépendance Playwright, isolée de l'app principale. |
| `.gitignore` | Exclut `.session/`, `node_modules/`, `.env`. |

## Prochaines étapes (non faites, volontairement)

Navigation, extraction, export : rien de tout cela n'existe encore. L'étape 1
s'arrête à « le navigateur s'ouvre et la session tient ».
