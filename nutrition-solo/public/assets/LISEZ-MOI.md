# Images de My Coach Academy

Les visuels que l'application affiche **si le fichier est présent**, et qui ne
laissent aucune trace quand il ne l'est pas : la balise `<img>` ne reçoit alors
aucun `src`, donc aucune requête, aucune 404, et l'écran garde son aplat marine
travaillé. Déposer le fichier suffit à le faire apparaître — rien à recompiler,
rien à redéployer d'autre.

| Fichier | Où il s'affiche | Format attendu |
|---|---|---|
| `login-hero.jpg` | Page de connexion, bas de la colonne bleue | **paysage à portrait, 1200 × 1400 px minimum**, JPEG ou WebP |

## Remplacer la photo de connexion

1. Déposer l'image sous `public/assets/login-hero.jpg` (écraser l'ancienne).
2. Recharger la page. C'est tout.

Le nom du fichier est déclaré à **un seul endroit**, la constante
`PHOTO_CONNEXION` en tête de `public/academy.js`. Pour utiliser un autre nom ou
un autre format (`.webp` par exemple), c'est la seule ligne à changer.

## Comment choisir l'image

Elle est recadrée en `object-fit: cover` et **fondue dans le marine** par un
dégradé : ses bords haut et bas disparaissent progressivement dans le fond. Ce
qui compte est donc ce qui se trouve **au centre** du cadre.

- le `object-position` est réglé sur `center 22 %` — les visages gagnent à être
  dans le tiers supérieur de l'image ;
- une photo un peu sombre ou désaturée se fond mieux qu'une image très claire,
  qui fera « rectangle posé » malgré le dégradé ;
- éviter le texte incrusté : il sera recadré selon la hauteur de la fenêtre.
