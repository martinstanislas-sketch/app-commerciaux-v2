'use strict';
// ============================================================================
//  PARSEUR du CSV « Journal des encaissements » de Deciplus (vue history=boxing).
//
//  PUR : aucune I/O, aucun navigateur. On lui passe le TEXTE du fichier, il rend
//  des lignes exploitables + les contrôles de conformité. Testé contre un export
//  réel (test/csvEncaissements.test.js).
//
//  ⚠️ CE N'EST PAS UN CSV PLAT. Le fichier est un RAPPORT en trois parties :
//    L1        « Journal des encaissements du AAAA-MM-JJ au AAAA-MM-JJ » (tabulé)
//    L3        « TOTAL Encaissememts;17512,31 »   (oui, avec la faute de Deciplus)
//    L5..L14   récap par mode de paiement (tabulé)
//    puis      la ligne d'en-têtes du DÉTAIL, en « ; » avec guillemets, et les lignes.
//  On ne lit donc JAMAIS la ligne 1 comme un en-tête : on cherche la ligne qui
//  commence par "Numéro";"Date d'encaissement". Le fichier est en UTF-8 AVEC BOM
//  et mélange les fins de ligne CRLF/LF.
// ============================================================================

// Colonnes attendues dans le détail (17). On vérifie leur présence, pas leur ordre.
const COLONNES_REQUISES = ["Date d'encaissement", 'Adhérent', 'Montant encaissé', 'Note', 'Site', 'Id membre'];

function decouper(ligne) {
  // Découpage « ; » avec guillemets. Les valeurs Deciplus ne contiennent pas de
  // « ; » échappé dans nos exports, mais on gère les guillemets par sécurité.
  const out = [];
  let cur = '', dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const ch = ligne[i];
    if (ch === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') { cur += '"'; i++; }
      else dansGuillemets = !dansGuillemets;
    } else if (ch === ';' && !dansGuillemets) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// « 1 234,56 » / « -54,95 » -> nombre. Vide -> 0.
function montant(v) {
  const s = String(v == null ? '' : v).replace(/[\s ]/g, '').replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Arrondi au centime. Le « + 0 » n'est pas décoratif : sans lui, un total nul
// sur des montants négatifs rend -0, qui n'est égal à rien de ce qu'on attend.
const arrondi = (n) => Math.round((Number(n) || 0) * 100) / 100 + 0;

// Montant -> texte lisible. « 225 € » et non « 225.00 € » : une alerte se lit à
// l'œil, les centimes ne s'affichent que s'il y en a.
function euros(n) {
  const v = arrondi(n);
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  const groupe = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '-' : '') + groupe + (dec === '00' ? '' : ',' + dec) + ' €';
}

// « JJ/MM/AAAA » -> « AAAA-MM ».
function moisDe(dateFr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(dateFr || '').trim());
  return m ? m[3] + '-' + m[2] : null;
}

// L'en-tête du rapport porte la période RÉELLEMENT exportée : c'est notre
// contrôle que le filtre a bien été appliqué (et non « aujourd'hui »).
function lirePeriode(texte) {
  const m = /Journal des encaissements du (\d{4}-\d{2}-\d{2}) au (\d{4}-\d{2}-\d{2})/.exec(texte);
  return m ? { du: m[1], au: m[2] } : null;
}

// Parse complet. Renvoie { periode, colonnes, lignes, totalAnnonce }.
// `lignes` : { numero, date, mois, adherent, montant, mode, note, decaissement, site, idMembre }
function parser(texte) {
  const txt = String(texte || '').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const brutes = txt.split('\n');
  const periode = lirePeriode(txt);

  const iEntete = brutes.findIndex((l) => /^"?Numéro"?\s*;/.test(l) && /Date d'encaissement/.test(l));
  if (iEntete < 0) throw new Error("En-têtes du détail introuvables (attendu une ligne \"Numéro\";\"Date d'encaissement\"…).");
  const colonnes = decouper(brutes[iEntete]).map((c) => c.trim());
  const manquantes = COLONNES_REQUISES.filter((c) => !colonnes.includes(c));
  if (manquantes.length) throw new Error('Colonnes manquantes dans le CSV : ' + manquantes.join(', '));

  const col = {};
  colonnes.forEach((c, i) => { col[c] = i; });
  const lignes = [];
  for (let i = iEntete + 1; i < brutes.length; i++) {
    const l = brutes[i];
    if (!l.trim()) continue;
    const v = decouper(l);
    if (v.length < colonnes.length - 1) continue; // ligne tronquée / pied de rapport
    const adherent = (v[col['Adhérent']] || '').trim();
    if (!adherent) continue;
    const note = (v[col['Note']] || '').trim();
    const date = (v[col["Date d'encaissement"]] || '').trim();
    lignes.push({
      numero: (v[col['Numéro']] || '').trim(),
      date, mois: moisDe(date),
      adherent,
      montant: montant(v[col['Montant encaissé']]),
      mode: (v[col['Mode']] || '').trim(),
      note,
      // Le marqueur fait foi sur le signe, comme dans le moteur RECAP existant.
      decaissement: /d[ée]caissement/i.test(note),
      site: (v[col['Site']] || '').trim(),
      idMembre: (v[col['Id membre']] || '').trim(),
    });
  }

  const mt = /TOTAL Encaissem[^;]*;([\-\d\s,\.]+)/i.exec(txt);
  return { periode, colonnes, lignes, totalAnnonce: mt ? montant(mt[1]) : null };
}

// ── LIGNES ÉCARTÉES PAR LE PARSEUR ──────────────────────────────────────────
//  parser() laisse tomber, en silence, deux sortes de lignes de détail :
//   · celles SANS adhérent — des écritures non rattachées à un client ;
//   · celles au nombre de champs trop faible — une ligne tronquée, ou le pied
//     du rapport.
//  Elles manquent donc à la somme des lignes, alors que Deciplus les compte
//  dans son « TOTAL Encaissememts ». C'EST EXACTEMENT CE QUI CRÉE « L'ÉCART
//  GLOBAL » : ce n'est pas un second phénomène, c'est le même, vu de loin. On
//  les dénombre ici, TOUS SITES CONFONDUS, pour que verifier() puisse dire si
//  l'écart est déjà expliqué — et se taire quand il l'est.
//
//  Les lignes sans adhérent sont réparties « dans le périmètre » (un des 6
//  studios : controlerStudios() les signale déjà, studio par studio) et « hors
//  périmètre » (franchises : personne ne les signale, donc on le dit une fois).
function lignesEcartees(texte, { studios, studioLabel } = {}) {
  const txt = String(texte || '').replace(/^\ufeff/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const brutes = txt.split('\n');
  const iEntete = brutes.findIndex((l) => /^"?Numéro"?\s*;/.test(l) && /Date d'encaissement/.test(l));
  const vide = { lignes: 0, montant: 0 };
  const out = {
    sansAdherent: { ...vide }, tronquees: { ...vide },
    dansPerimetre: { ...vide }, horsPerimetre: { ...vide },
  };
  if (iEntete < 0) return out;
  const colonnes = decouper(brutes[iEntete]).map((c) => c.trim());
  const iAdh = colonnes.indexOf('Adhérent');
  const iMt = colonnes.indexOf('Montant encaissé');
  const iSite = colonnes.indexOf('Site');
  if (iAdh < 0 || iMt < 0) return out;
  for (let i = iEntete + 1; i < brutes.length; i++) {
    const l = brutes[i];
    if (!l.trim()) continue;
    const v = decouper(l);
    const mt = montant(v[iMt]);
    if (v.length < colonnes.length - 1) { out.tronquees.lignes += 1; out.tronquees.montant += mt; continue; }
    if ((v[iAdh] || '').trim()) continue;
    out.sansAdherent.lignes += 1;
    out.sansAdherent.montant += mt;
    const lab = studioLabel ? studioLabel(v[iSite]) : (iSite >= 0 ? v[iSite] : null);
    const dedans = !!lab && (!studios || studios.includes(lab));
    const c = dedans ? out.dansPerimetre : out.horsPerimetre;
    c.lignes += 1;
    c.montant += mt;
  }
  [out.sansAdherent, out.tronquees, out.dansPerimetre, out.horsPerimetre]
    .forEach((c) => { c.montant = arrondi(c.montant); });
  return out;
}

// ── CONTRÔLES DE CONFORMITÉ ─────────────────────────────────────────────────
// On refuse un fichier plutôt que de calculer sur du sable : mauvaise période,
// studio absent, total incohérent -> on lève.
function verifier(parse, { moisAttendu, studiosAttendus, studioLabel, ecartees } = {}) {
  const pb = [];
  if (!parse.periode) pb.push("période absente de l'en-tête du rapport");
  else {
    const [a, m] = parse.periode.du.split('-');
    if (moisAttendu && a + '-' + m !== moisAttendu) {
      pb.push('période du fichier (' + parse.periode.du + ' → ' + parse.periode.au + ') ≠ mois demandé (' + moisAttendu + ')');
    }
  }
  if (!parse.lignes.length) pb.push('aucune ligne de détail');
  // Toutes les lignes doivent tomber dans le mois demandé.
  if (moisAttendu) {
    const hors = parse.lignes.filter((l) => l.mois && l.mois !== moisAttendu).length;
    if (hors) pb.push(hors + ' ligne(s) hors du mois ' + moisAttendu);
  }
  // Le total annoncé porte sur TOUS les sites, franchises comprises, et peut
  // inclure des écritures exceptionnelles (on a vu une « Annulation
  // encaissement » de -650 640 € chez un franchisé). Un écart n'est donc PAS un
  // motif de rejet : c'est un simple signalement. Ce qui compte, c'est que nos
  // studios soient présents et que les lignes tombent dans le mois.
  //
  // ⚠️ PAS DEUX ALERTES POUR UN SEUL PHÉNOMÈNE. L'écart global n'a, jusqu'ici,
  // qu'une seule cause observée : les lignes que le parseur écarte parce
  // qu'elles n'ont pas d'adhérent. Elles sont DÉJÀ signalées studio par studio
  // par controlerStudios(). Répéter « écart global de 225 € » juste après
  // « 7 encaissements sans adhérent (225 €) chez Lille », c'est décrire le même
  // fait deux fois et diluer les vraies anomalies. On soustrait donc ce qui est
  // expliqué, et on ne parle QUE de ce qui reste :
  //   · résidu ≈ 0, lignes dans le périmètre -> silence (les studios le disent) ;
  //   · résidu ≈ 0, lignes hors périmètre    -> UNE alerte claire (personne ne
  //     le dit ailleurs : ces sites n'ont pas de bloc studio) ;
  //   · résidu ≠ 0                            -> alerte sur la SEULE part inexpliquée.
  const avertissements = [];
  let ecartGlobal = null;
  if (parse.totalAnnonce != null) {
    const somme = parse.lignes.reduce((s, l) => s + l.montant, 0);
    // Sens : ce qui manque à notre somme pour atteindre le total de Deciplus.
    const ecart = parse.totalAnnonce - somme;
    const sansAdh = (ecartees && ecartees.sansAdherent) || { lignes: 0, montant: 0 };
    const hors = (ecartees && ecartees.horsPerimetre) || { lignes: 0, montant: 0 };
    const residu = ecart - sansAdh.montant;
    ecartGlobal = {
      somme: arrondi(somme), totalAnnonce: arrondi(parse.totalAnnonce),
      ecart: arrondi(ecart),
      expliqueParLignesSansAdherent: arrondi(sansAdh.montant),
      lignesSansAdherent: sansAdh.lignes,
      residu: arrondi(residu),
      explique: Math.abs(residu) <= 0.05,
    };
    if (Math.abs(residu) > 0.05) {
      avertissements.push('écart de ' + euros(Math.abs(residu)) + ' inexpliqué entre la somme des lignes ('
        + euros(somme) + ') et le total annoncé (' + euros(parse.totalAnnonce) + ') — tous sites confondus'
        + (sansAdh.lignes ? ' (' + euros(Math.abs(sansAdh.montant)) + ' déjà expliqué'
          + (sansAdh.lignes > 1 ? 's' : '') + ' par ' + sansAdh.lignes + ' ligne'
          + (sansAdh.lignes > 1 ? 's' : '') + ' sans adhérent)' : ''));
    } else if (hors.lignes) {
      avertissements.push(hors.lignes + ' encaissement' + (hors.lignes > 1 ? 's' : '')
        + ' sans adhérent (' + euros(Math.abs(hors.montant)) + ') écarté' + (hors.lignes > 1 ? 's' : '')
        + ' du calcul, hors des 6 studios — sans effet sur les KPI');
    }
  }
  // ⚠️ L'ABSENCE D'UN STUDIO N'EST PLUS UN REJET GLOBAL. Elle est traitée par
  // controlerStudios() et ne prive que CE studio de ses KPI : une anomalie chez
  // l'un (ou chez un site hors périmètre) ne doit jamais bloquer les cinq autres.
  const parStudio = {};
  parse.lignes.forEach((l) => {
    const lab = studioLabel ? studioLabel(l.site) : l.site;
    if (!lab) return;
    parStudio[lab] = (parStudio[lab] || 0) + 1;
  });
  (studiosAttendus || []).forEach((s) => { if (!parStudio[s]) avertissements.push('studio absent du fichier : ' + s); });
  return { ok: pb.length === 0, problemes: pb, avertissements, lignesParStudio: parStudio, ecartGlobal };
}

// ── CONTRÔLE PAR STUDIO (bloquant pour LE studio concerné) ──────────────────
//  Cinq vérifications, exigées avant de produire les KPI d'un studio :
//   1. présence      : le studio a au moins une ligne dans le fichier ;
//   2. période       : toutes ses lignes tombent dans le mois demandé ;
//   3. rien de perdu : le parseur n'a écarté aucune de ses lignes ;
//   4. cohérence     : lignes brutes retenues = lignes parsées ;
//   5. montants      : somme brute = somme parsée, au centime.
//
//  ⚠️ Le recomptage (3-5) se fait sur le TEXTE BRUT, sans les filtres du
//  parseur (longueur de ligne, adhérent vide). C'est tout l'intérêt : il détecte
//  précisément ce que le parseur aurait laissé tomber en silence.
//
//  Un studio en échec n'a pas de KPI ; les autres sont calculés normalement.
function controlerStudios(texte, parse, { moisAttendu, studios, studioLabel } = {}) {
  const txt = String(texte || '').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const brutes = txt.split('\n');
  const iEntete = brutes.findIndex((l) => /^"?Numéro"?\s*;/.test(l) && /Date d'encaissement/.test(l));
  const colonnes = iEntete >= 0 ? decouper(brutes[iEntete]).map((c) => c.trim()) : [];
  const iSite = colonnes.indexOf('Site');
  const iMt = colonnes.indexOf('Montant encaissé');
  const iDate = colonnes.indexOf("Date d'encaissement");
  const iAdh = colonnes.indexOf('Adhérent');

  // Recomptage brut, par studio.
  const brut = {};
  const init = (s) => (brut[s] = brut[s] || { lignes: 0, somme: 0, horsMois: 0, champsIncoherents: 0, sansAdherent: 0, sommeSansAdherent: 0 });
  if (iEntete >= 0 && iSite >= 0 && iMt >= 0) {
    for (let i = iEntete + 1; i < brutes.length; i++) {
      const l = brutes[i];
      if (!l.trim()) continue;
      const v = decouper(l);
      const lab = studioLabel ? studioLabel(v[iSite]) : v[iSite];
      if (!lab || !(studios || []).includes(lab)) continue; // hors périmètre : ignoré, jamais bloquant
      const b = init(lab);
      // ⚠️ LES LIGNES SANS ADHÉRENT SONT ÉCARTÉES, PAS PERDUES. On a constaté 7
      // encaissements sans nom ni Id membre (225 € chez Lille en juillet) : des
      // écritures non rattachées à un client. Elles ne peuvent entrer ni dans la
      // non-reconduction (aucun client à suivre d'un mois à l'autre) ni dans la
      // complétion. Les compter comme « perdues » bloquerait le studio à tort ;
      // on les dénombre à part et on les signale.
      if (!(v[iAdh] || '').trim()) { b.sansAdherent += 1; b.sommeSansAdherent += montant(v[iMt]); continue; }
      b.lignes += 1;
      b.somme += montant(v[iMt]);
      if (v.length !== colonnes.length) b.champsIncoherents += 1;
      if (moisAttendu && iDate >= 0 && moisDe(v[iDate]) !== moisAttendu) b.horsMois += 1;
    }
  }

  // Côté parseur, même découpage par studio.
  const parsé = {};
  parse.lignes.forEach((l) => {
    const lab = studioLabel ? studioLabel(l.site) : l.site;
    if (!lab || !(studios || []).includes(lab)) return;
    const p = (parsé[lab] = parsé[lab] || { lignes: 0, somme: 0, horsMois: 0 });
    p.lignes += 1;
    p.somme += l.montant;
    if (moisAttendu && l.mois !== moisAttendu) p.horsMois += 1;
  });

  const out = {};
  (studios || []).forEach((s) => {
    const b = brut[s] || { lignes: 0, somme: 0, horsMois: 0, champsIncoherents: 0, sansAdherent: 0, sommeSansAdherent: 0 };
    const p = parsé[s] || { lignes: 0, somme: 0, horsMois: 0 };
    const pb = [];
    if (!b.lignes) pb.push('studio absent du fichier');
    if (b.horsMois || p.horsMois) pb.push(Math.max(b.horsMois, p.horsMois) + ' ligne(s) hors du mois ' + moisAttendu);
    if (b.lignes !== p.lignes) pb.push('lignes perdues au parsing : ' + b.lignes + ' brutes -> ' + p.lignes + ' parsées');
    if (b.champsIncoherents) pb.push(b.champsIncoherents + ' ligne(s) au nombre de champs incohérent');
    if (Math.abs(b.somme - p.somme) > 0.005) pb.push('somme divergente : ' + b.somme.toFixed(2) + ' brute vs ' + p.somme.toFixed(2) + ' parsée');
    out[s] = {
      ok: pb.length === 0, problemes: pb,
      controles: {
        presence: b.lignes > 0,
        periode: !(b.horsMois || p.horsMois),
        aucuneLignePerdue: b.lignes === p.lignes,
        champsCoherents: b.champsIncoherents === 0,
        sommesIdentiques: Math.abs(b.somme - p.somme) <= 0.005,
      },
      lignesBrutes: b.lignes, lignesParsees: p.lignes,
      sommeBrute: +b.somme.toFixed(2), sommeParsee: +p.somme.toFixed(2),
      // Écartées volontairement, hors calcul : signalées, jamais bloquantes.
      lignesSansAdherent: b.sansAdherent, montantSansAdherent: +b.sommeSansAdherent.toFixed(2),
      // Formulation courte et définitive : c'est la SEULE alerte émise pour ce
      // phénomène (verifier() se tait quand l'écart global s'explique par elle).
      avertissements: b.sansAdherent
        ? [b.sansAdherent + ' encaissement' + (b.sansAdherent > 1 ? 's' : '') + ' sans adhérent ('
          + euros(b.sommeSansAdherent) + ') écarté' + (b.sansAdherent > 1 ? 's' : '') + ' du calcul']
        : [],
    };
  });
  return out;
}

// ── VUES POUR LE MOTEUR RECAP 2 ─────────────────────────────────────────────
// Le moteur (public/recap2-metrics.js) attend des lignes { cle, montant,
// decaissement }. On produit DEUX vues, car les deux indicateurs ne se
// rapprochent pas sur la même chose :
//
//  · vue « id »  : clé = Id membre Deciplus. Sans ambiguïté, c'est le MÊME
//    identifiant d'un mois à l'autre -> c'est la vue de la NON-RECONDUCTION.
//  · vue « nom » : clé = chaque clé candidate tirée de « NOM Prenom ». Sert
//    UNIQUEMENT à répondre « ce nom a-t-il un net > 0 ? » pour la complétion,
//    puisque Fitness Booster ne connaît pas l'Id membre. Une même personne y
//    apparaît sous plusieurs clés avec le même net : c'est voulu, et c'est sans
//    effet car la complétion ne fait qu'un test net > 0 par signataire.
//    ⚠️ NE JAMAIS COMPTER de clients sur la vue « nom ».
function vueParId(lignes, studio, studioLabel) {
  return lignes
    .filter((l) => (studioLabel ? studioLabel(l.site) : l.site) === studio)
    .map((l) => ({
      cle: l.idMembre || ('NOM:' + l.adherent.toUpperCase()),
      montant: l.montant, decaissement: l.decaissement,
      nom: l.adherent, prenom: '',
    }));
}
// Le détail nominatif des non-reconduits, tel qu'il part dans le rapport.
// `idClient` : la clé de la vue « id », c'est-à-dire l'Id membre des
// encaissements, qui EST l'Id_client Deciplus (vérifié le 2026-09-14 : 1 851
// ids communs ventes ↔ encaissements, 1 851 au même nom). Il sert UNIQUEMENT à
// ouvrir la fiche au clic. Une clé de repli « NOM:… » n'est pas un id : vide.
function detailNonReconduits(nonReconduits) {
  return (nonReconduits || []).map((c) => ({
    client: c.nom,
    idClient: /^[0-9]{1,20}$/.test(String(c.cle || '')) ? String(c.cle) : '',
    netM1: +c.netM1.toFixed(2), netM: +c.netM.toFixed(2),
  }));
}
function vueParNom(lignes, studio, studioLabel, clesDe) {
  const out = [];
  lignes
    .filter((l) => (studioLabel ? studioLabel(l.site) : l.site) === studio)
    .forEach((l) => {
      clesDe(l.adherent).forEach((cle) => out.push({ cle, montant: l.montant, decaissement: l.decaissement }));
    });
  return out;
}

module.exports = { parser, verifier, controlerStudios, lignesEcartees, lirePeriode, decouper, montant, euros, moisDe, vueParId, vueParNom, detailNonReconduits, COLONNES_REQUISES };
