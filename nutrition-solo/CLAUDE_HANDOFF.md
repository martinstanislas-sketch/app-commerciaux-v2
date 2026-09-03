# CLAUDE_HANDOFF — My Coach Academy

> État au **3 septembre 2026**, fin de session (contexte épuisé à 94 %).
> **Rien n'est commité.** Tout ce qui suit vit dans le *working tree*.
> Fichier de passation : il ne change aucun comportement.

---

## 1. Le projet en trois lignes

`nutrition-solo/` — **Express + better-sqlite3 + JS vanilla**. Aucun build, aucun
framework : `public/academy.js` (~6 400 lignes) fabrique le HTML par
concaténation de chaînes, `public/academy.css` (~2 400 lignes) est écrit à la
main, les tokens vivent dans des `:root`.

| | |
|---|---|
| Démarrer | `npm start` → http://localhost:3000/academy |
| Tester | `npm test` → **946 tests, 0 échec** |
| Base | `data/nutrition.sqlite` (gitignorée, `*.sqlite`) |
| Sauvegardes | `../.backups/nutrition-avant-*.sqlite` |

⚠️ **`public/academy.html` versionne les assets (`?v=71`). Bumper le JS ET le
CSS ensemble** — un test échoue si les deux numéros divergent, et sans bump le
navigateur sert l'ancien écran (piège qui a déjà coûté une session).

---

## 2. Objectif général

My Coach Academy est l'espace de formation interne des coachs My Coach.
Un **parcours** = contenus (vidéos/textes) → mini-QCM par module → QCM final →
évaluation pratique → certification. Trois familles de badges :
`essentiel`, `expertise`, `management` — cette dernière **s'affiche « Leader »**.

Deux écrans concernés ici : **Mon Academy** (le coach) et **Évaluer &
certifier** (le certificateur). C'est le second qui est en refonte.

---

## 3. Ce qui vient d'être développé sur /academy

### 3.1 Certification automatique — l'étape « À certifier » a été SUPPRIMÉE

Avant : théorie → à évaluer → pratique validée → **à certifier (clic humain)** → certifié.
Après : **le dernier prérequis rempli délivre le diplôme**, sans geste.

- Moteur : `academyCertifications.delivrerSiComplet(email, formation)` — relit
  les mêmes prérequis que `delivrer`, **silencieuse** (un refus n'échoue jamais
  l'action qui l'a déclenchée), **idempotente**.
- Branchée aux **trois** portes qui écrivent un verdict ou un score, dans
  `lib/academyRoutes.js` : clôture d'un QCM, ouverture d'évaluation *avec*
  résultat, verdict d'une séance ouverte. **Manquer une seule laisserait un
  coach validé sans diplôme.**
- `delivrer(cible, auteur, donnees, options)` — le **4ᵉ argument** porte
  `{automatique:true}`. Il n'est **jamais** lu depuis le corps d'une requête :
  sinon un client s'auto-certifierait en l'envoyant.
- Auteur écrit : **`'Academy'`** (constante `AUTEUR_AUTO`). L'évaluateur reste
  tracé dans `pratique_par`.
- **Date du diplôme = date du dernier prérequis** (le verdict pratique), pas
  celle de l'écriture.
- `STATUTS_COACH` est passé de 7 à **6** états ; `certification_a_delivrer` a
  disparu de `RANG_STATUT` aussi.

### 3.2 Parcours Academy = des VALIDATIONS, jamais du visionnage

`pctValidation(d)` dans `public/academy.js` : lit **`d.certification.prerequis`**
(composé par `prerequisDe`, serveur) → 0/50/100 si pratique obligatoire,
0/100 sinon. Une certification existante vaut 100 (plafond, jamais 150).
**Ne jamais recalculer les exigences côté écran.**

### 3.3 Refonte visuelle — lot 1 + accordéon + tuiles cliquables

Tokens ajoutés **à côté** des variables historiques (en tête de `academy.css`) :
`--navy #0B1B3A`, `--sapphire #0F52BA`, `--sky #5B8DEF`, `--page`, `--line`,
`--line-soft`, `--muted`, `--muted-2`, `--success`, `--success-soft`,
`--warning`, `--gold`, `--gold-soft`, `--gold-text`, `--r-card/control/badge`,
`--shadow-card`, `--shadow-navy`.

---

## 4. Fonctionnement exact des 4 tuiles KPI

Rendues par **`rendreBentoEval(tous)`** via **`kpiTile({label, corps, sombre, vue, etat, aide})`**.

| # | Tuile | Chiffre | Au clic → onglet | Filtre posé |
|---|---|---|---|---|
| 1 | À évaluer | dossiers en `STATUTS_A_EVALUER` | `a_evaluer` | — |
| 2 | Certifications | dossiers `certifie` + badge « ↑ N ce mois » | `certifications` | — |
| 3 | Progression moyenne | moyenne des `pourcentage` par coach + anneau | `coachs` | `tous` |
| 4 | Actifs cette semaine | coachs dont `vuLe` < 7 j, sur fond marine | `coachs` | **`actifs`** |

**Chaque tuile est un vrai `<button>`** (`data-kpi-eval`, `data-kpi-etat`) —
atteignable au clavier. Le petit bouton « Traiter » imbriqué a été supprimé :
un bouton dans un bouton n'est pas du HTML valide.

Au clic, le gestionnaire (dans `rendreEvalListe`) fait, dans cet ordre :
`evalSectionOuverte = true` → `evalOnglet = …` → `evalStatut = data-kpi-etat || 'tous'`
→ `await ouvrirEvaluateur()` → `scrollIntoView({behavior:'smooth'})` sur `#acRepli`.
**Le scroll doit rester APRÈS le rendu** : la section n'existe qu'une fois
l'écran redessiné.

⚠️ **Un onglet remet le filtre à zéro, une tuile pose le sien.** Sans ça,
`actifs` resterait collé en passant d'une tuile à l'autre.

Données serveur nécessaires (ajouts **additifs**) :
- `boost.listerCollaborateurs()` renvoie `vuLe` et `creeLe` ;
- `ligneCoach` fait suivre `vuLe` sur chaque dossier ;
- `grouperParCoach` **conserve `vuLe`** sur le coach regroupé (piège : il se
  perdait, la tuile affichait 0/3) ;
- `certifications.compterCertifsRecentes(30)` → `certifsDuMois` dans la réponse
  des deux branches de `/api/academy/evaluateur/coachs`. Calculé sur
  **`delivree_le`**, pas `obtenue_le`.

---

## 5. Menu replié / déplié

`<details class="ac-repli" id="acRepli">` — **aucun JavaScript** pour
l'ouverture : `<details>` porte le repli, le clavier et l'accessibilité.

- En-tête : « **Coachs & certifications** » + sous-titre + pastille « N coachs »
  + chevron qui pivote de 180°.
- Contient : filtres (`rendreSelecteurEval`), onglets (`rendreOngletsEval`),
  la zone d'erreur et `#acEvalCorps`.
- État mémorisé dans **`evalSectionOuverte`** (module), synchronisé par
  l'événement `toggle`.

⚠️ **« Replié à chaque arrivée » est implémenté en OUBLIANT L'ÉTAT À LA SORTIE**
(`afficher()` : `if (ecran !== '#acEval') evalSectionOuverte = false;`), pas à
l'entrée. Raison : changer d'onglet repasse par le rendu de l'écran — remettre à
zéro à l'entrée refermerait la section au moment précis où l'utilisateur
demande à voir la liste. **Ne pas « corriger » ça.**

---

## 6. Onglets et filtres

- **Onglets** (`VUES_EVAL`) : `coachs` · `a_evaluer` · `certifications`. Trois,
  plus quatre — « À certifier » a disparu avec son état.
- **Compteurs** (`KPI_EVAL`) : `À évaluer` · `Certifiés`. Deux seulement.
- **Filtre d'état** (`ETATS_EVAL` + `GARDES_ETAT`) : `tous`, `en_cours`,
  `a_evaluer`, **`actifs`** (nouveau), `certifies`.
  `actifs` utilise **la même règle et la même donnée** que la tuile 4
  (`vuLe` < 7 j) — les deux ne doivent pas diverger.
- **Filtre par formation** : `#acEvalFormation` (`toutes` + une entrée par formation).
- `STATUTS_A_EVALUER` est **dérivé de `KPI_EVAL`**, jamais réécrit.

### Vue Coachs — une ligne par coach
`grouperParCoach()` produit : `terminees`, `partielles`, `aFaire`, `formations`,
`pourcentage`, `aEvaluer`, `certifiees`, `rang`, `vuLe`, **`badges`**.
Colonnes : `Coach | Parcours Academy | À évaluer | Certifications | (action)`.

### Badges Essentiel / Expertise / Leader
Trois indicateurs sous la barre de parcours : nom, `X / total`, petite barre.
- **Pas de texte « À COMMENCER »** — `0 / 12` le dit déjà.
- Deux marques seulement : `✓` (famille validée), `⚠` (évaluation en attente).
- Essentiel = socle : fond `--surface-soft`, nom en gras.
- Détail déplié : trois `<details>` par famille, **Essentiel ouvert**, les
  autres fermées, **sauf** si `aEvaluer > 0`.
- Une formation jamais commencée affiche **`—`**, pas une pastille.

---

## 7. Fichiers modifiés (non commités)

**De cette session, sur /academy :**

| Fichier | Ce qui a changé |
|---|---|
| `public/academy.js` | Le gros du travail : `pctValidation`, `grouperParCoach` (+badges, +vuLe), `badgesParcours`, `detailCoach` par sections, `ICONES`/`icone()`, `progressRing()`, `kpiTile()`, `rendreBentoEval()`, `rendreFilEval()`, accordéon `#acRepli`, tuiles cliquables |
| `public/academy.css` | Tokens en tête + mosaïque ELITES + badges familles + sections + bento + anneau + accordéon + hover des tuiles |
| `public/academy.html` | `#acFil` (fil d'Ariane), `#acCloche`, `?v=71` |
| `lib/academyCertifications.js` | `AUTEUR_AUTO`, `delivrerSiComplet`, `delivrer(…, options)`, `statutCoach` simplifié, `compterCertifsRecentes`, `vuLe` sur le dossier, `RANG_STATUT`/`STATUTS_COACH` à 6 |
| `lib/academyRoutes.js` | 3 déclencheurs de certification, `certifsDuMois`, `formationCategorie` sur le dossier |
| `lib/academyQcm.js` | `terminer()` renvoie `formation` |
| `lib/boost.js` | `listerCollaborateurs` renvoie `vuLe` + `creeLe` |
| `test/*` | ~15 suites adaptées + 3 nouvelles : `academyParcours`, `academyCertificationAuto`, `academyBadges` |

⚠️ **`git status` liste bien d'autres fichiers modifiés** (`lib/academy.js`,
`lib/academyPratique.js`, `lib/boostRoutes.js`, `server.js`, `public/app.js`…)
et beaucoup de non-suivis (`lib/academyGrilles.js`, `test/e2e/*`…) : **ce sont
des travaux ANTÉRIEURS à cette session**, pas les nôtres. Ne pas les attribuer à
cette refonte, ne pas les jeter.

Fichiers de données créés : `data/formations/*.json` (8 formations importables,
rejouables) et `tools/maj-formation-pilates.js`.

---

## 8. Testé et validé

**946 tests, 0 échec** (`npm test`). Nouvelles suites :

- `test/academyCertificationAuto.test.js` (11) — A→G du workflow : théorie
  seule, pratique validée → diplôme auto, échec, plusieurs évaluations = 1
  certification, diplôme existant intouché, formation sans pratique, et
  « sans pratique obligatoire on n'entre jamais dans À évaluer ».
- `test/academyParcours.test.js` (16) — le barème 0/50/100, « tout vu rien
  validé = 0 % », 2/9 = 22 %, 2+théorie/9 = 28 %.
- `test/academyBadges.test.js` (13) — les trois familles, les trois états, les
  totaux qui couvrent le catalogue, « management » → « Leader ».

**Vérifié dans le navigateur** (Chrome, /academy) :
- aucune erreur console ;
- bento : `0 à évaluer` · `4 certifications, ↑4 ce mois` · `4 % sur 34 formations` · `3/3 actifs` ;
- accordéon replié au chargement, ouvert au clic, replié au retour ;
- les 4 tuiles mènent au bon onglet avec le bon filtre + scroll fluide ;
- responsive : bento 4→2→1 colonnes, mosaïque ELITES 3→2→1.

**Données préservées** (invariant à chaque lot) : 4 certifications, 5
évaluations, 65 vues, 34 tentatives — vérifiées avant/après.

---

## 9. Ce qu'il reste à faire

### Refonte /academy — lots 2 à 4 (spec complète donnée par Stan)
- **Lot 2** : onglets + filtres sur une ligne, chips de filtres actifs,
  `CoachRow` (avatar hashé 44px, `StatusDot` dernière activité, `RolePill`,
  `SegmentedProgress` 3 tronçons 12/16/6, pills à évaluer / certifs), tri par
  colonne, pied de tableau, skeleton, état vide. Ligne entière cliquable.
- **Lot 3** : `CoachDrawer` 480 px (en-tête marine, 3 anneaux — `progressRing`
  est **déjà prêt**, accepte `couleur` et `texte`), certifications, timeline,
  URL `?coach=`. Sidebar : compteur sur l'item actif + carte contextuelle.
- **Lot 4** : responsive fin + accessibilité (focus, aria-label, AA).

### KPI « Essentiels validés » — BLOQUÉ, décision de Stan attendue
Demandé puis suspendu. **Il manque une date de publication de formation** :
`cree_le` = création (l'import crée en brouillon), `maj_le` bouge à chaque
modification. Trois questions posées, sans réponse :
1. ajouter une colonne `publie_le` ? 2. que rétro-remplir pour les 34
formations déjà publiées ? 3. le dénominateur est vide aujourd'hui (aucun coach
n'a 30 j d'ancienneté) → afficher « — » ?
**Ne rien implémenter avant que Stan tranche.**

### Reste ouvert
- **`RolePill`** : pas de colonne rôle en base. Décision prise : afficher
  « Coach » pour tout le monde, pill `#EEF1F7` / `#4B5A78`.
- **Boutons « Exporter » et « Grille »** : désactivés, `title="Bientôt"`. Aucun
  export n'existe à brancher.
- **Transcripts** : les 8 formations de la Boîte à outils ont leurs QCM écrits
  depuis les **sous-titres YouTube automatiques** — Stan devait les relire.
- **6 formations Leader** (`loyal`, `infos`, `team`, `eclat`, `succes`) créées
  par Stan avec des **identifiants vidéo provisoires** (`AAAAAAAAAAA`…).
- **Engagement** : modules 6 à 10 sont des contenus **texte « en préparation »**,
  sans vidéo, sans mini-QCM. Le QCM final n'a pas été enrichi.

---

## 10. À NE SURTOUT PAS CASSER

1. **`pctValidation` lit `certification.prerequis`.** Ne jamais recalculer les
   exigences côté écran : c'est le serveur qui sait si la pratique est
   obligatoire. Un second barème ferait diverger l'écran et le moteur.
2. **Les trois déclencheurs de certification.** En retirer un laisse un coach
   tout validé sans diplôme.
3. **`{automatique:true}` est le 4ᵉ argument de `delivrer`**, jamais un champ du
   corps de requête. Le déplacer = faille d'auto-certification.
4. **L'index unique `idx_academy_cert_active`** `(email, formation) WHERE
   statut='delivree'` : le garde-fou anti-doublon. Ne pas le supprimer.
5. **`evalSectionOuverte` s'oublie à la SORTIE**, pas à l'entrée (§5).
6. **Bumper `?v=` sur academy.js ET academy.css ensemble.**
7. **La mosaïque ELITES** (`.ac-fcs.ac-fcs-elites`) est en **sélecteur double** :
   la règle mobile de `.ac-fcs` l'emporterait sinon.
8. **La clé de catégorie reste `management`** en base ; « Leader » n'est qu'un
   libellé dans `CATEGORIES` (`public/academy.js`). Ne pas migrer la colonne.
9. **Ne jamais toucher aux certifications historiques** : 4 lignes délivrées,
   preuves recopiées, un diplôme est définitif.
10. **Le fil d'Ariane se retire dans `afficher()`** quand on quitte `#acEval`.

---

## 11. Repères techniques

**Statuts d'un dossier (6)** : `formation_en_cours`, `pratique_a_realiser`,
`resultat_en_attente`, `pratique_a_repasser`, `pratique_validee`, `certifie`.

**Tables** : `academy_formations` (`cle`, `categorie`, `actif`,
`pratique_obligatoire`, `certification_active`, `qcm_*`, `mini_*`),
`academy_modules`, `academy_contenus`, `academy_questions` (`usage` =
`mini|finale`), `academy_choix`, `academy_cas`, `academy_criteres`,
`academy_certifications`, `academy_evaluations`, `academy_vus`,
`academy_position`, `academy_tentatives`, `academy_ressources`.

**Catalogue au 03/09/2026** : 35 formations, 34 publiées —
12 `essentiel`, 16 `expertise`, 6 `management`.

**Import d'une formation** : `POST /api/academy/admin/import` — **refuse une clé
existante** (il crée, il ne fusionne pas) et **crée toujours en brouillon**.
Pour mettre à jour une formation en place : `tools/maj-formation-pilates.js`.

**Récupérer un transcript YouTube** (utile pour écrire un QCM) : l'API
`timedtext` scrapée depuis la page renvoie 200 avec 0 octet. Ce qui marche :
POST sur `youtubei/v1/player` avec le contexte client **ANDROID**
(clientVersion 20.10.38), puis
`captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl`. Le format
rendu est `timedtext format=3` : le texte est dans les balises `<s>`.

---

## 12. Consignes permanentes de Stan

- **Ne jamais commit, push ni déployer** sans demande explicite.
- Travailler sur la base **locale** (`data/nutrition.sqlite`), sauvegarder avant
  toute écriture.
- Vérifier dans le **navigateur**, pas seulement par les tests.
- Prendre une **empreinte SQL avant/après** pour prouver que rien d'autre n'a
  bougé.
