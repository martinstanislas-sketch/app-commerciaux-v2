# Gabarit de recettes — My Coach Nutrition

Une **ligne = une recette**. Remplis le tableau TSV (colonnes séparées par des
**tabulations** → copiable dans Excel / Google Sheets) **ou** utilise le format
JSON plus bas (pratique pour ChatGPT).

Objectif du lot : **70 petits-déjeuners + 60 collations + 200 plats = 330 recettes.**

---

## 1) Les colonnes (dans l'ordre)

| # | Colonne | Obligatoire | Valeurs autorisées / format | S'applique à |
|---|---------|:---:|------------------------------|--------------|
| 1 | `nom` | 🔴 | texte (nom simple et familier) | tous |
| 2 | `type` | 🔴 | `petit-dejeuner` · `plat` · `collation` | tous |
| 3 | `categorie` | 🟠 | **petit-déj** : `bol` · `tartine` · `oeufs` · `pancake-porridge` · `emporter` · `smoothie`  •  **collation** : `fruits-laitiers` · `oleagineux` · `proteinees` · `tartines` · `smoothies` · `emporter`  •  **plat** : laisser vide | PD + collation |
| 4 | `gout` | 🟠 | `sucre` · `sale` | PD + collation |
| 5 | `cuisines` | 🟠 | `francaise` · `italienne` · `mediterraneenne` · `asiatique` · **origine réelle du monde** : `indienne` `mexicaine` `orientale` `americaine` `anglaise`… (plusieurs possibles, séparées par virgule) — **ne pas écrire « monde »** | plat |
| 6 | `regime` | 🔴 | `vegan` `vegetarien` `sans-gluten` `sans-porc` (virgule ; vide si aucun) — **déclarer TOUS les régimes réellement respectés** (cf. règle critique) | tous |
| 7 | `budget` | 🟠 | `eco` · `normal` | tous |
| 8 | `allergenes` | 🟠 | clés EXACTES : `gluten` `lactose` `oeuf` `fruits-a-coque` `arachide` `poisson` `crustaces` `mollusques` `soja` `sesame` (virgule ; vide si aucun). **Pas `lait` → `lactose` ; pas `arachides` → `arachide`.** *Auto-détecté aussi via ingrédients (filet de sécurité).* | tous |
| 9 | `kcal` | 🔴 | nombre entier (par **1 portion**) | tous |
| 10 | `proteines` | 🔴 | grammes (entier) | tous |
| 11 | `glucides` | 🔴 | grammes (entier) | tous |
| 12 | `lipides` | 🔴 | grammes (entier) | tous |
| 13 | `tempsMinutes` | 🔴 | minutes (entier) | tous |
| 14 | `motsCles` | 🟢 | mots-clés séparés par virgule (aliments principaux) | tous |
| 15 | `ingredients` | 🔴 | voir encodage ci-dessous | tous |
| 16 | `etapes` | 🟢 | étapes séparées par ` \| ` (vide → générées par l'IA) | tous |

🔴 obligatoire · 🟠 fortement recommandé · 🟢 optionnel (je complète sinon)

> ### ⚠️ Règle CRITIQUE — `regime`
> Le moteur **exige le tag déclaré** : il ne devine PAS le régime depuis les
> ingrédients. Une recette sans le bon tag est **invisible** pour ce profil.
> → Déclare **tous** les régimes que la recette respecte vraiment :
> - Pas de viande/poisson → **`vegetarien`**
> - Ni viande/poisson, ni produit animal (œuf, lait, fromage, miel) → **`vegan`** *(implique aussi `vegetarien`)*
> - Pas de porc/charcuterie → **`sans-porc`**
> - Aucun gluten (ni blé, pâtes, pain, muesli, céréales, semoule, boulgour…) → **`sans-gluten`**
>
> Exemple — un bol skyr + banane + muesli : `["vegetarien", "sans-porc"]`
> *(pas vegan = laitage/miel ; pas sans-gluten = muesli).*

> **Le plus important : colonnes 9-12 (kcal + protéines/glucides/lipides) et 15
> (ingrédients chiffrés).** Sans ça, impossible d'adapter aux 4 objectifs, de dire
> « il te reste X g de protéines » ou de faire la liste de courses.

---

## 2) Encodage des ingrédients (colonne 15)

Chaque ingrédient = `nom;quantité;unité`, et les ingrédients sont séparés par ` | ` :

```
Filet de poulet;140;g | Quinoa cuit;120;g | Courgette;100;g | Huile d'olive;10;ml
```

- Unités usuelles : `g` `ml` `piece` `tranche` `c. à café` `c. à soupe` `pincée`…
- (Optionnel) tu peux ajouter le rayon en 4ᵉ champ : `Filet de poulet;140;g;Boucherie`.
  Sinon je le déduis (rayons : `Fruits & légumes` `Boucherie` `Poissonnerie`
  `Crèmerie` `Boulangerie` `Épicerie` `Surgelés`).

**Étapes (colonne 16)** — séparées par ` | ` :
```
Couper les légumes en morceaux. | Cuire 10 min avec les herbes. | Dorer le poulet 5-6 min/face. | Servir.
```

---

## 3) Exemples remplis (1 par type)

### Plat
```
nom	type	categorie	gout	cuisines	regime	budget	allergenes	kcal	proteines	glucides	lipides	tempsMinutes	motsCles	ingredients	etapes
Poulet rôti, pommes de terre et haricots verts	plat			francaise	sans-porc,sans-gluten	normal		480	42	38	16	30	poulet,pomme de terre,haricot vert	Cuisse de poulet;150;g | Pommes de terre;180;g | Haricots verts;120;g | Huile d'olive;10;ml	Préchauffer le four à 200°C. | Enfourner le poulet 25 min. | Cuire les pommes de terre et haricots à la vapeur. | Servir.
```

### Petit-déjeuner
```
Bol skyr, banane et flocons d'avoine	petit-dejeuner	bol	sucre		vegetarien	eco	lactose,gluten	350	26	45	8	5	skyr,banane,avoine	Skyr;150;g | Banane;1;piece | Flocons d'avoine;40;g | Miel;10;g	Verser le skyr dans un bol. | Ajouter la banane en rondelles et les flocons. | Napper de miel.
```

### Collation
```
Tartine pain complet et beurre de cacahuète	collation	tartines	sucre		vegetarien	eco	gluten,arachide	220	8	24	10	3	pain complet,beurre de cacahuete	Pain complet;50;g | Beurre de cacahuète;20;g	Tartiner le pain de beurre de cacahuète.
```

---

## 4) Gabarit TSV vide à remplir

Copie l'en-tête + remplis une ligne par recette (TABULATIONS entre colonnes) :

```
nom	type	categorie	gout	cuisines	regime	budget	allergenes	kcal	proteines	glucides	lipides	tempsMinutes	motsCles	ingredients	etapes
											
											
											
```

---

## 5) Variante JSON (pratique avec ChatGPT)

Un objet par recette dans un tableau :

```json
[
  {
    "nom": "",
    "type": "petit-dejeuner | plat | collation",
    "categorie": "",
    "gout": "sucre | sale | ",
    "cuisines": [],
    "regime": [],
    "budget": "eco | normal",
    "allergenes": [],
    "kcal": 0,
    "proteines": 0,
    "glucides": 0,
    "lipides": 0,
    "tempsMinutes": 0,
    "motsCles": [],
    "ingredients": [
      { "nom": "", "quantite": 0, "unite": "g" }
    ],
    "etapes": [""]
  }
]
```

---

## 6) Rappel — le minimum vital par recette
`nom` · `type` · `categorie`/`cuisines` · **`kcal` + `proteines` + `glucides` + `lipides`** · `tempsMinutes` · **`ingredients` chiffrés**.
Le reste (id, image, étapes, objectifs), je le complète automatiquement.
