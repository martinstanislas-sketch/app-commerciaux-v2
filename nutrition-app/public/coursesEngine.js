'use strict';
// ============================================================================
//  MOTEUR DE LA LISTE DE COURSES — pur, sans DOM, sans état global.
//
//  Chaîne : plan -> agreger() (par ingrédient CANONIQUE, en unité de base)
//           -> construireListe() (arrondis d'achat, unités d'ACHAT, split
//              frais / placard, groupes « au choix », repli non-référencés)
//           -> rendreTexte() (une ligne par article, join — jamais de concat).
//
//  `agreger` est LA fonction de vérité, testée seule sur des fixtures : les
//  quantités s'additionnent par canonique (jamais par libellé), dans l'unité
//  de base du référentiel ('g' | 'ml' | 'piece').
//
//  Fichier UMD : chargé par index.html (window.CoursesEngine) ET requis par les
//  tests node. Dépend du référentiel public/coursesCatalogue.js.
// ============================================================================

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./coursesCatalogue.js'));
  else root.CoursesEngine = factory(root.CoursesCatalogue);
}(typeof self !== 'undefined' ? self : this, function (CAT) {

  const RAYON_PLACARD = 'Placard';
  const RAYON_A_VERIFIER = 'À vérifier';
  // Le parcours physique d'un magasin ; Placard et À vérifier ferment la marche.
  const ORDRE_RAYONS = [...CAT.RAYONS, 'Rayon frais', RAYON_PLACARD, RAYON_A_VERIFIER];

  function fmtNombre(n) {
    const v = Math.round(n * 100) / 100;
    return String(v).replace('.', ',');
  }

  // --- ARRONDIS D'ACHAT (règle centralisée — T3) ---------------------------
  // `besoin_reel` garde toujours la valeur EXACTE ; seul l'achat est arrondi.
  const ROUNDING = {
    // Ce qui se compte ne se coupe pas : toujours l'entier SUPÉRIEUR (9,5 œufs -> 10).
    piece: (q) => Math.ceil(q - 1e-9),
    // Viande & poisson : le multiple de 50 g SUPÉRIEUR — ce qu'on demande au comptoir.
    viande: (q) => Math.ceil(q / 50 - 1e-9) * 50,
    // Autres poids et volumes : le multiple de 10 supérieur.
    poids: (q) => Math.ceil(q / 10 - 1e-9) * 10,
  };
  function arrondirAchat(q, categorie, uniteBase) {
    if (!(q > 0)) return 0;
    if (uniteBase === 'piece') return ROUNDING.piece(q);
    if (categorie === 'viande' || categorie === 'poisson') return ROUNDING.viande(q);
    return ROUNDING.poids(q);
  }

  // --- CONVERSION RECETTE -> UNITÉ DE BASE (T2) ----------------------------
  // Les cuillères deviennent des g/ml (c. à soupe ≈ 13, c. à café ≈ 5) : la
  // conversion est INTERNE au calcul — jamais de cuillère sur la liste finale.
  // null = familles incompatibles (la quantité restera affichée en appoint).
  function versBase(q, unite, base) {
    const u = CAT.normaliser(unite || '');
    if (base === 'g' || base === 'ml') {
      if (u === 'g' || u === 'ml' || u === '') return q; // g ≈ ml pour nos liquides
      if (u === 'kg' || u === 'l') return q * 1000;
      if (u === 'cl') return q * 10;
      if (/c\.? ?a ?soupe|^cas$|^cs$/.test(u)) return q * 13;
      if (/c\.? ?a ?cafe|^cac$|^cc$/.test(u)) return q * 5;
      if (/pincee/.test(u)) return q; // ~1 g la pincée
      return null;
    }
    if (/piece|unite|tranche|oeuf|filet|steak|boule/.test(u) || u === '') return q;
    return null;
  }

  // --- CONVERSION CRU <-> CUIT ---------------------------------------------
  // On ACHÈTE du cru. Or les recettes mélangent les deux états pour un même
  // produit (« riz » et « riz cuit », « blanc de poulet » et « ...cuit ») : additionner
  // leurs grammes tels quels serait faux, 70 g de riz cru ≠ 70 g de riz cuit.
  // On ramène donc toute quantité notée « cuit » à son équivalent CRU, via le
  // facteur du référentiel (g cuit par g cru) :
  //   riz    ×2,7  -> 200 g cuit  =  74 g à acheter (moins : le riz absorbe l'eau)
  //   poulet ×0,7  -> 100 g cuit  = 143 g à acheter (plus : la viande en perd)
  // Le SENS vient du facteur, il n'y a aucun cas particulier ici.
  function versCru(q, nom, def) {
    const f = def && def.conversion_cru_cuit && def.conversion_cru_cuit.g_cuit_par_g_cru;
    if (!(f > 0)) return q;
    return /\b(cuit|cuite|cuits|cuites)\b/i.test(String(nom || '')) ? q / f : q;
  }

  // --- AGRÉGATION PURE (T2) -------------------------------------------------
  // plan = { jours: [{ repas: [{ recette: { ingredients: [{nom, quantite, unite, rayon}] } }] }] }
  // Renvoie { canoniques: Map<id, {qty, unite_base, autres, varietes}>, libres, warnings }.
  function agreger(plan, portions) {
    const mult = portions > 0 ? portions : 1;
    const canoniques = new Map();
    const libres = new Map(); // non référencés : clé nom|unité, comme avant
    const warnings = [];
    ((plan && plan.jours) || []).forEach((jour) => {
      (jour.repas || []).forEach((repas) => {
        if (!repas.recette) return;
        (repas.recette.ingredients || []).forEach((ing) => {
          const q = (Number(ing.quantite) || 0) * mult;
          // L'unité est transmise : elle départage les noms qui recouvrent deux
          // achats différents (150 g de blanc de dinde ≠ 2 tranches).
          const r = CAT.resoudre(ing.nom, ing.unite);
          if (!r) {
            // Repli (T1) : rien ne casse, rien ne se duplique en silence. On
            // garde le rayon de la recette s'il existe, sinon « À vérifier » —
            // et on journalise pour faire grossir le référentiel.
            const key = CAT.normaliser(ing.nom) + '|' + CAT.normaliser(ing.unite);
            if (!libres.has(key)) {
              const rayon = ing.rayon || RAYON_A_VERIFIER;
              libres.set(key, { nom: ing.nom, unite: ing.unite || '', rayon, qty: 0 });
              warnings.push('Ingrédient non référencé : ' + ing.nom + ' — rangé en « ' + rayon + ' », à ajouter au référentiel.');
            }
            libres.get(key).qty += q;
            return;
          }
          const c = canoniques.get(r.id) || { id: r.id, def: r.def, qty: 0, unite_base: r.def.unite_base, autres: {}, varietes: new Set() };
          canoniques.set(r.id, c);
          c.varietes.add(r.def.display_name);
          // `poids_piece_g` (v3) : une recette qui compte en PIÈCES alors que le
          // produit se calcule en grammes (« 1 tomate » vs « 150 g de tomate »)
          // est convertie ici. Sans ça, les deux quantités ne s'additionnaient
          // pas et la ligne affichait deux unités (« 1220 g + 4,5 piece »).
          let conv = versBase(q, ing.unite, r.def.unite_base);
          if (conv == null && r.def.poids_piece_g > 0 && r.def.unite_base === 'g'
              && /^(piece|unite)s?$/.test(CAT.normaliser(ing.unite || ''))) {
            conv = q * r.def.poids_piece_g;
          }
          // Ramené au CRU avant d'additionner : c'est le cru qu'on achète.
          if (conv != null) c.qty += versCru(conv, ing.nom, r.def);
          else { const u = String(ing.unite || ''); c.autres[u] = (c.autres[u] || 0) + q; }
        });
      });
    });
    return { canoniques, libres, warnings };
  }

  // Meilleur assortiment de conditionnements pour couvrir `besoin` :
  // le plus petit total >= besoin, et à total égal le moins de boîtes.
  // Ex. avec [6, 12] : 4 -> 1×6 ; 13 -> 1×12 + 1×6 (18, pas 24) ; 21 -> 2×12.
  function meilleurAssortiment(besoin, options) {
    const opts = [...options].sort((a, b) => b - a); // du plus grand au plus petit
    const max = opts[0];
    let meilleur = null;
    // Le nombre de grandes boîtes utiles est borné : au-delà, on dépasse pour rien.
    for (let gros = Math.ceil(besoin / max) + 1; gros >= 0; gros--) {
      let reste = besoin - gros * max;
      const parts = gros > 0 ? [{ taille: max, nb: gros }] : [];
      let total = gros * max;
      opts.slice(1).forEach((t) => {
        if (reste <= 0) return;
        const nb = Math.ceil(reste / t);
        parts.push({ taille: t, nb });
        total += nb * t; reste -= nb * t;
      });
      if (reste > 0) { const nb = Math.ceil(reste / max); parts.push({ taille: max, nb }); total += nb * max; }
      const nbBoites = parts.reduce((s, p) => s + p.nb, 0);
      if (total < besoin) continue;
      if (!meilleur || total < meilleur.total || (total === meilleur.total && nbBoites < meilleur.nbBoites)) {
        meilleur = { parts: parts.filter((p) => p.nb > 0), total, nbBoites };
      }
    }
    return meilleur || { parts: [{ taille: max, nb: 1 }], total: max, nbBoites: 1 };
  }

  // --- UNITÉ D'ACHAT (T4) ---------------------------------------------------
  // Ce que le client LIT et prend en magasin. Jamais une unité de recette.
  function ligneAchat(def, besoin, arrondi) {
    const sous = [];
    let achat;
    if (def.pack_options && def.pack_options.length) {
      // Conditionnements réels (œufs : boîtes de 6 ET de 12). On cherche la
      // COMBINAISON dont le total couvre le besoin avec le moins de surplus —
      // avant, on prenait un seul format puis on le multipliait, ce qui faisait
      // acheter 12 œufs pour un besoin de 4, ou 24 pour 13.
      const entier = ROUNDING.piece(besoin);
      const combo = meilleurAssortiment(entier, def.pack_options);
      achat = combo.parts
        .map((p) => (p.nb === 1 ? '1 ' + def.pack_nom : p.nb + ' ' + def.pack_nom + 's') + ' (' + p.taille + ')')
        .join(' + ');
      sous.push('besoin ' + fmtNombre(besoin));
      if (combo.total > entier) sous.push('soit ' + combo.total);
    } else if (def.conditionnement_g > 0 || def.pack_size > 0) {
      // Contenance connue (conserve 400 g, brique 1 L) -> nombre de boîtes.
      // `conditionnement_g` vient du référentiel v3 ; `pack_size` est l'ancien
      // nom, gardé en repli tant que des entrées ne sont pas régénérées.
      const contenance = def.conditionnement_g > 0 ? def.conditionnement_g : def.pack_size;
      const nb = Math.max(1, Math.ceil(besoin / contenance));
      achat = nb === 1 ? def.purchase_unit : nb + ' × ' + def.purchase_unit.replace(/^1\s+/, '');
      sous.push('besoin ' + fmtNombre(besoin) + ' ' + def.unite_base);
    } else if (def.poids_piece_g > 0 && /unite/.test(CAT.normaliser(def.purchase_unit || ''))) {
      // Vendu à la pièce mais calculé en grammes (avocat) : on rend des pièces.
      const nb = Math.max(1, Math.ceil(besoin / def.poids_piece_g));
      achat = String(nb);
      sous.push('besoin ' + fmtNombre(besoin) + ' ' + def.unite_base);
      sous.push(def.purchase_unit);
    } else if (def.category === 'viande' || def.category === 'poisson') {
      achat = '~' + arrondi + ' g';
      if (besoin !== arrondi) sous.push('besoin ' + fmtNombre(besoin) + ' g');
      if (def.purchase_unit) sous.push(def.purchase_unit);
    } else if (def.is_staple) {
      // Placard : on achète le contenant, le besoin de la semaine est minuscule.
      achat = def.purchase_unit;
      sous.push('besoin ' + fmtNombre(besoin) + (def.unite_base === 'piece' ? '' : ' ' + def.unite_base));
    } else if (def.unite_base === 'piece') {
      achat = String(arrondi);
      if (besoin !== arrondi) sous.push('besoin ' + fmtNombre(besoin));
      if (def.purchase_unit) sous.push(def.purchase_unit);
    } else {
      achat = arrondi + ' ' + def.unite_base;
      if (besoin !== arrondi) sous.push('besoin ' + fmtNombre(besoin) + ' ' + def.unite_base);
      if (def.purchase_unit) sous.push(def.purchase_unit);
    }
    return { achat, sous };
  }

  // --- LA LISTE (T1/T3/T4/T5/T6) -------------------------------------------
  // Renvoie { frais: [...], placard: [...], warnings } ; un article =
  // { id, nom, rayon, staple, probablement_deja_en_stock, quantite_achat,
  //   sousTitre, besoin_reel: {quantite, unite} }.
  function construireListe(plan, portions) {
    const { canoniques, libres, warnings } = agreger(plan, portions);
    const frais = [];
    const placard = [];
    const groupes = new Map();
    const pousser = (item, staple) => (staple ? placard : frais).push(item);

    canoniques.forEach((c) => {
      // Ingrédient volontairement absent de la LISTE (ex. l'eau du robinet) : il
      // reste dans les recettes et dans le calcul nutritionnel — on ne le retire
      // qu'à l'affichage, car personne ne va « acheter de l'eau ».
      if (c.def.exclude_from_list) return;
      const g = c.def.interchangeable_group;
      if (g && CAT.GROUPES[g]) {
        const acc = groupes.get(g) || { def: CAT.GROUPES[g], qty: 0, unite_base: c.unite_base, varietes: new Set(), achatCtx: c.def.purchase_unit, category: c.def.category };
        groupes.set(g, acc);
        acc.qty += c.qty;
        Object.values(c.autres).forEach((x) => { acc.qty += x; }); // même famille (poids)
        c.varietes.forEach((v) => acc.varietes.add(v));
        return;
      }
      // Si TOUT est arrivé dans une autre unité que la base (concombre donné en
      // grammes), cette unité devient la quantité principale — jamais un « 0 ».
      let besoin = c.qty, unite = c.unite_base, autres = Object.entries(c.autres);
      if (!(besoin > 0) && autres.length) { [[unite, besoin]] = autres; autres = autres.slice(1); }
      const arrondi = arrondirAchat(besoin, c.def.category, unite === 'piece' ? 'piece' : (unite === c.unite_base ? c.unite_base : 'g'));
      const base = (unite === c.unite_base)
        ? ligneAchat(c.def, besoin, arrondi)
        : { achat: arrondi + ' ' + unite, sous: ['besoin ' + fmtNombre(besoin) + ' ' + unite, c.def.purchase_unit] };
      const appoint = autres.map(([u, x]) => '+ ' + fmtNombre(x) + ' ' + u).join(' ');
      if (appoint) base.sous.push(appoint);
      pousser({
        id: c.id, nom: c.def.display_name,
        // Le rayon vient TOUJOURS du référentiel (T6) : le bloc Placard n'est
        // qu'une présentation (split par `staple`), pas un rayon.
        rayon: c.def.rayon,
        staple: !!c.def.is_staple, probablement_deja_en_stock: !!c.def.is_staple,
        quantite_achat: base.achat, sousTitre: base.sous.filter(Boolean).join(' · '),
        besoin_reel: { quantite: besoin, unite },
      }, c.def.is_staple);
    });

    // Groupes interchangeables : UNE ligne « au choix », total + variétés (T1).
    groupes.forEach((gr) => {
      const arrondi = arrondirAchat(gr.qty, gr.category || 'poisson', gr.unite_base);
      const sous = [[...gr.varietes].join(', ')];
      if (gr.qty !== arrondi) sous.push('besoin ' + fmtNombre(gr.qty) + ' ' + gr.unite_base);
      if (gr.achatCtx) sous.push(gr.achatCtx);
      frais.push({
        id: null, nom: gr.def.display_name, rayon: gr.def.rayon, staple: false, probablement_deja_en_stock: false,
        quantite_achat: '~' + arrondi + ' ' + gr.unite_base, sousTitre: sous.join(' · '),
        besoin_reel: { quantite: gr.qty, unite: gr.unite_base },
      });
    });

    // Non référencés : agrégés par libellé, arrondis « poids », jamais perdus.
    libres.forEach((l) => {
      const comptable = versBase(1, l.unite, 'piece') != null;
      const arrondi = arrondirAchat(l.qty, '', comptable ? 'piece' : 'g');
      frais.push({
        id: null, nom: l.nom, rayon: l.rayon, staple: false, probablement_deja_en_stock: false,
        quantite_achat: arrondi + (comptable ? (l.unite ? ' ' + l.unite : '') : ' ' + (l.unite || 'g')),
        sousTitre: l.qty !== arrondi ? 'besoin ' + fmtNombre(l.qty) + (l.unite ? ' ' + l.unite : '') : '',
        besoin_reel: { quantite: l.qty, unite: l.unite },
      });
    });
    return { frais, placard, warnings };
  }

  function trierRayons(rayons) {
    return [...rayons].sort((a, b) => {
      const ia = ORDRE_RAYONS.indexOf(a), ib = ORDRE_RAYONS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  // --- RENDU TEXTE (T7) -----------------------------------------------------
  // UNE ligne par article, assemblées par join('\n') — la concaténation
  // manuelle perdait des sauts de ligne entre deux items.
  function rendreTexte(liste, meta) {
    const lignes = [];
    lignes.push('Liste de courses — Protocole 42');
    // Le nom du programme, quand l'appelant le fournit (ex. « Protocole 42 ») :
    // la liste porte alors la marque du challenge. Optionnel -> le moteur reste
    // générique et les listes hors challenge sont inchangées.
    if (meta && meta.programme) lignes.push(meta.programme);
    lignes.push('Pour ' + (meta && meta.jours || '?') + ' jour(s) · ' + (meta && meta.personnes || 1) + ' personne(s)');
    const parRayon = {};
    liste.frais.forEach((it) => { (parRayon[it.rayon] = parRayon[it.rayon] || []).push(it); });
    trierRayons(Object.keys(parRayon)).forEach((rayon) => {
      lignes.push('');
      lignes.push(rayon.toUpperCase());
      parRayon[rayon].sort((a, b) => a.nom.localeCompare(b.nom)).forEach((it) => {
        lignes.push('- ' + it.nom + ' — ' + it.quantite_achat + (it.sousTitre ? ' (' + it.sousTitre + ')' : ''));
      });
    });
    if (liste.placard.length) {
      lignes.push('');
      lignes.push('PLACARD — tu l’as sûrement déjà');
      liste.placard.sort((a, b) => a.nom.localeCompare(b.nom)).forEach((it) => {
        lignes.push('- ' + it.nom + ' — ' + it.quantite_achat + (it.sousTitre ? ' (' + it.sousTitre + ')' : ''));
      });
    }
    return lignes.join('\n') + '\n';
  }

  return { ROUNDING, arrondirAchat, versBase, agreger, construireListe, rendreTexte, trierRayons, ORDRE_RAYONS, RAYON_PLACARD, RAYON_A_VERIFIER };
}));
