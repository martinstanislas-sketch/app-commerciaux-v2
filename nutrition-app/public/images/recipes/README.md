# Images des recettes

Chaque carte repas et fiche recette charge `images/recipes/<id>.jpg`.
Si l'image existe -> photo. Sinon -> visuel degrade de repli (rien ne casse).
Les ids exacts des 132 recettes sont dans `_ids.txt`.

## Option A — Remplissage automatique (Pexels / Unsplash, gratuit)

Photos reelles tout de suite, telechargees une seule fois en local
(l'app reste ensuite 100% hors-ligne).

1. Cle gratuite : https://www.pexels.com/api/  (ou https://unsplash.com/developers)
2. Depuis `nutrition-app/` :
   ```bash
   PEXELS_API_KEY=ta_cle node tools/fetch-photos.js
   # test sur 5 recettes :  PEXELS_API_KEY=ta_cle node tools/fetch-photos.js --limit 5
   # forcer le re-telechargement :  ... --force
   ```
3. Les `.jpg` arrivent dans ce dossier et s'affichent automatiquement.

> Les photos de banque sont generiques (un "chicken curry" generique, pas la
> recette exacte). Tres bien comme base ; remplacez au cas par cas par des
> images sur-mesure si besoin.

## Option B — Images sur-mesure (Nano Banana / Gemini)

Photos exactes de chaque plat, hors-ligne.

1. Generez chaque image avec les prompts prets de `PROMPTS.md`.
2. Nommez-la **exactement** `<id>.jpg` (ex. `pd-skyr-bowl.jpg`).
3. Deposez-la ici.

Les deux options se combinent : Pexels en base, puis remplacement par vos
images maison quand vous les avez (meme nom de fichier).
