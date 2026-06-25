# Règles d'ajout d'une recette — My Coach Nutrition

Pour qu'une recette s'intègre sans problème (filtrage allergies/régimes correct,
macros justes, liste de courses propre), elle doit respecter le schéma et les règles
ci-dessous. **Avant de committer**, lance la validation :

```
npm run valider        # vérifie lib/recipes.js
npm run valider:v2     # vérifie lib/recipes-v2.js
```

Le script s'arrête en erreur (code 1) s'il reste au moins une **ERREUR**. Les
**AVERTISSEMENTS** ne bloquent pas mais sont à vérifier.

---

## Schéma d'une recette

```js
{
  id: 'plat-poulet-riz-curry',     // unique, en minuscules, sans espace
  nom: 'Poulet au curry et riz',
  type: 'plat',                    // 'petit-dejeuner' | 'plat' | 'collation'
  gout: 'sale',                    // facultatif : 'sucre' | 'sale'
  cuisines: ['indienne'],          // au moins une (matching des goûts)
  regime: ['sans-porc', 'sans-gluten'],
  objectifs: ['maintien', 'muscle'], // facultatif
  budget: 'eco',                   // 'eco' | 'normal'
  allergenes: ['lactose'],         // OBLIGATOIRE : [] si aucun, jamais omis
  motsCles: ['poulet', 'riz', 'curry', 'lait de coco'],
  kcal: 520, proteines: 38, glucides: 60, lipides: 14,  // par portion
  tempsMinutes: 25,
  ingredients: [
    { nom: 'Blanc de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
    { nom: 'Riz basmati',     quantite: 60,  unite: 'g', rayon: 'Epicerie' }
    // ...
  ],
  etapes: ['Étape 1 claire...', 'Étape 2...']
}
```

### Valeurs autorisées

- **type** : `petit-dejeuner`, `plat` (déjeuner/dîner), `collation`
- **budget** : `eco`, `normal`
- **gout** (facultatif) : `sucre`, `sale`
- **objectifs** (facultatif) : `perte`, `maintien`, `muscle`, `energie`
- **regime** : `vegetarien`, `vegan`, `sans-porc`, `sans-gluten`, `sans-lactose`
- **allergenes** : `gluten`, `lactose`, `oeuf`, `arachide`, `fruits-a-coque`, `poisson`, `crustaces`, `soja`, `sesame`
- **unite** : `g`, `ml`, `piece`, `c. a cafe`, `c. a soupe`, `gousse`, `pincee`, `tranche`, `poignee`
- **rayon** : `Fruits & legumes`, `Boucherie`, `Poissonnerie`, `Cremerie`, `Boulangerie`, `Epicerie`, `Surgeles`, `Rayon frais`, `Rayon vegetal`

---

## Règles bloquantes (ERREUR)

1. **Champs obligatoires** présents et bien typés (`id`, `nom`, `type`, `budget`,
   `kcal/proteines/glucides/lipides` numériques ≥ 0, `ingredients`, `etapes`, `allergenes`).
2. **`id` unique** dans le catalogue.
3. **Sécurité allergènes** : tout allergène présent dans un ingrédient **doit** figurer
   dans `allergenes`. Le validateur détecte automatiquement les allergènes (cacahuète →
   arachide, amande/noix → fruits-à-coque, lait/fromage → lactose, blé/pain/avoine →
   gluten, etc.). Si un allergène est détecté mais non déclaré → ERREUR.
4. **Cohérence régime** : un régime déclaré ne doit pas être contredit par un ingrédient
   (ex. `vegan` + poulet, ou `sans-gluten` + pâtes → ERREUR).
5. **Cohérence macros** : `kcal` ≈ `4×protéines + 4×glucides + 9×lipides`. Écart > 30 % → ERREUR.

## Règles non bloquantes (AVERTISSEMENT)

- Écart macros entre 15 % et 30 %.
- `cuisines` ou `motsCles` vides (recommandés pour le matching).
- `tempsMinutes` manquant ou ≤ 0.
- `unite` / `rayon` hors liste, ou `quantite` ≤ 0.

---

## Pourquoi ces règles

Les filtres de l'app (mode démo **et** mode IA) s'appuient sur les mêmes détecteurs
que le validateur. Donc **si une recette passe la validation, l'app la filtrera
correctement** : elle ne sera jamais proposée à un utilisateur allergique ou hors régime,
ses macros seront fiables, et ses quantités s'agrégeront proprement dans la liste de courses.

> Règle d'or sécurité : en cas de doute sur un allergène, **déclare-le**. Sur-déclarer
> retire la recette à quelques utilisateurs ; sous-déclarer peut être dangereux.
