# My Coach Nutrition — v2 (refonte MVP, écrans Stitch)

Périmètre MVP (30/09/2026) : questionnaire en 4 étapes → plan de la semaine → liste de courses,
avec connexion par **lien magique** (plus de code PIN).

Le moteur est repris **tel quel** de `nutrition-solo/` : `lib/nutrition.js` (besoins),
`lib/planGenerator.js` + `lib/recipes-v2.js` (plan, 382 recettes), `public/coursesEngine.js`
+ `public/coursesCatalogue.js` (courses). Retirés : suivi, scan, analyse d'assiette, coach IA,
FAQ, avatar, PIN.

## Lancer en local
```bash
cd nutrition-v2
npm install
npm start          # http://localhost:3000
npm test           # 4 tests : lien magique + parcours complet
```
Sans SMTP, le lien de connexion s'affiche à l'écran (bouton « Mode test ») et dans les logs.

## Variables d'environnement
| Variable | Rôle |
|---|---|
| `PUBLIC_URL` | URL publique de l'app, pour construire le lien magique (ex. `https://app.stanmartinapp.cloud/nutrition-v2/`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | Envoi des liens (mêmes noms que l'app principale). **Obligatoire en production** |
| `NUTRITION_DB` | Fichier SQLite (défaut `data/nutrition.sqlite`). Schéma compatible avec celui de nutrition-solo |
| `PHOTOS_SOURCE_URL` | Importe au démarrage les photos de plats manquantes (ex. `https://app.stanmartinapp.cloud/nutrition`) |
| `NODE_ENV=production` | Masque le lien de test ; sans SMTP, la connexion renvoie une erreur claire |

## Écrans
Accueil · Connexion · Vérification e-mail · Questionnaire (objectif, profil, goûts, contraintes) ·
Génération · Plan (jours, repères du jour, cartes repas, remplacer un repas, fiche recette) ·
Courses (personnes, cases à cocher, placard, partage, PDF) · Profil (besoins, réglages, nouveau plan,
déconnexion, suppression du compte).

## Reprise des clients Protocole 42
Les clients actuels sont dans la base de l'app principale (`data.db`, table `nutrition_clients`).
```bash
node tools/importer-clients-p42.js /chemin/vers/data.db              # simulation : affiche le bilan, n'écrit rien
node tools/importer-clients-p42.js /chemin/vers/data.db --appliquer  # import réel
```
Reprend e-mail, prénom, profil, préférences et plan. La source est ouverte en lecture seule ; un compte
v2 qui a déjà un plan n'est jamais écrasé. L'objectif « challenge » est converti en « perte ».
