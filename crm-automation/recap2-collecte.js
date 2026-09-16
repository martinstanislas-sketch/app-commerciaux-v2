'use strict';
// ============================================================================
//  RECAP 2 — COLLECTE v1 : Deciplus + Fitness Booster -> UN JSON DE CONTRÔLE.
//
//  Cette version NE TOUCHE PAS à l'application RECAP 2 : elle se contente de
//  produire un fichier JSON qu'on lit à l'œil pour comparer aux chiffres connus.
//  L'intégration viendra après, une fois le JSON jugé juste.
//
//  Le calcul n'est PAS refait ici : on appelle le module déjà testé
//  public/recap2-metrics.js (non-reconduction, clients retrouvés), et le moteur
//  public/retention.js pour les clés client. Une seule vérité arithmétique.
//
//  ⚠️ M EST LE MOIS AUDITÉ (règle métier v2). Pour contrôler le travail d'août,
//  on demande août — plus jamais septembre. Ce qui est lu :
//    · Deciplus encaissements M-1 et M -> non-reconduction M-1 -> M (inchangé) ;
//    · Deciplus VENTES de M            -> présence CRM des signatures de M ;
//    · Fitness Booster, contrats de M  -> les ventes à contrôler.
//  AUCUNE donnée de M+1 n'est nécessaire.
//
//  Usage :
//    node recap2-collecte.js 2026-08                  (M = août 2026, mois audité)
//    node recap2-collecte.js 2026-08 --sans-deciplus  (réutilise les CSV déjà là)
//
//  Garde-fous appliqués :
//   · Deciplus : période du fichier vérifiée, 6 studios exigés, total recoupé ;
//     /nextgen/prelevements.php formellement interdit (lib/deciplus.js) ;
//   · Fitness Booster : club affiché vérifié, période du détail vérifiée,
//     lignes extraites = compteur affiché sinon ÉCHEC du studio ;
//   · aucune écriture dans les deux outils, aucun commit.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const M = require('../public/recap2-metrics.js');
const R = require('../public/retention.js');
const CSV = require('./lib/csvEncaissements.js');
const VENTES = require('./lib/csvVentes.js');
const DEC = require('./lib/deciplus.js');
const FB = require('./lib/booster.js');
const REF = require('./lib/boosterReferences.js');
const VNI = require('./lib/boosterVni.js');
const CTRL = require('./lib/recap2Controles.js');
const RAPPRO = require('./lib/rapprochement.js');
const MATCHES = require('../lib/recap2Matches.js');
const PAI = require('./lib/paiement.js');
const MEMBRES = require('./lib/deciplusMembres.js');
const REESSAI = require('./lib/reessai.js');
const FICHIER = require('./lib/rapportFichier.js');
const HISTO = require('./lib/historiqueVentes.js');
const ORIGINE = require('./lib/vendeurOrigine.js');

const CDP = process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222';
const TENTATIVES = REESSAI.tentatives();
const DOSSIER_EXPORTS = path.join(__dirname, '.session', 'exports');
const DOSSIER_SORTIE = path.join(__dirname, '.session', 'controle');

const moisPrecedent = (ym) => {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
};

const horodatage = () => new Date().toISOString();
const journal = [];
const dire = (txt) => { const l = '[' + horodatage().slice(11, 19) + '] ' + txt; journal.push(l); console.log(l); };

(async () => {
  const mois = process.argv[2];
  if (!/^\d{4}-\d{2}$/.test(mois || '')) {
    console.error('Usage : node recap2-collecte.js AAAA-MM [--sans-deciplus]');
    process.exit(2);
  }
  const m1 = moisPrecedent(mois);
  const sansDeciplus = process.argv.includes('--sans-deciplus');
  dire('RECAP 2 — collecte pour M = ' + mois + ' (M-1 = ' + m1 + ')');

  const navigateur = await chromium.connectOverCDP(CDP);
  const contexte = navigateur.contexts()[0];
  const pageDe = (hote) => contexte.pages().find((p) => p.url().includes(hote));

  const erreurs = [];
  // `businessVersion` : la RÈGLE MÉTIER qui a produit ces chiffres.
  //   1 (absente) = ancienne règle « complétion » — contrats de M-1 ayant payé
  //                 en M, donc août ne se contrôlait que depuis septembre ;
  //   2           = règle actuelle — M est le mois audité, 2e KPI = présence
  //                 des signataires de M dans le journal des ventes de M.
  // Un rapport de juin/juillet/août produit avant ce changement n'a PAS cette
  // clé : l'écran doit donc pouvoir les distinguer, et surtout ne jamais
  // afficher un vieux chiffre sous le nouveau libellé.
  const rapport = { businessVersion: 2, genere: horodatage(), mois, m1, source: {}, studios: {}, journal: [] };

  // ── 1) DECIPLUS : trois exports CSV, tous sites ──────────────────────────
  //  · encaissements M-1 et M -> non-reconduction (question inchangée)
  //  · VENTES de M            -> présence dans le CRM des signatures de M
  const fichiers = {};
  const fichiersPaiement = {}; // mois après M -> CSV d'encaissements (paiements seulement)
  let fichierVentes = null;
  try {
    const page = pageDe('deciplus');
    if (!page) throw new Error('Aucun onglet Deciplus ouvert (lance open-crm.js)');
    for (const ym of [m1, mois]) {
      const dest = path.join(DOSSIER_EXPORTS, 'encaissements-' + ym + '.csv');
      if (sansDeciplus && fs.existsSync(dest)) { dire('CSV ' + ym + ' réutilisé (--sans-deciplus)'); fichiers[ym] = dest; continue; }
      // ⚠️ UN MOIS QUI ÉCHOUE N'EMPORTE PLUS L'AUTRE. Avant, le `throw` sortait
      // de la boucle : juillet raté, et juin déjà exporté partait avec lui.
      try {
        fichiers[ym] = await REESSAI.avecReessai('export Deciplus ' + ym, TENTATIVES, (n) => {
          dire('Deciplus : export des encaissements de ' + ym + (n > 1 ? ' — tentative ' + n : '') + '…');
          return DEC.exporterMois(page, ym, DOSSIER_EXPORTS, dire);
        }, { remise: () => DEC.reinitialiserFiltres(page), journal: dire });
      } catch (e) {
        erreurs.push('Deciplus / ' + ym + ' : ' + e.message);
        dire('⚠️ Deciplus ' + ym + ' : ' + e.message + ' — ce mois est abandonné');
      }
    }
    // JOURNAL DES VENTES de M — la preuve de présence dans le CRM.
    //  Il ne remplace pas les encaissements, il répond à une AUTRE question :
    //  « cette vente est-elle saisie ? » et non « a-t-elle été payée ? ». Sans
    //  lui, une vente signée le 29/08 prélevée en septembre passait pour absente.
    const destV = path.join(DOSSIER_EXPORTS, 'ventes-' + mois + '.csv');
    if (sansDeciplus && fs.existsSync(destV)) { dire('CSV ventes ' + mois + ' réutilisé (--sans-deciplus)'); fichierVentes = destV; }
    else {
      try {
        fichierVentes = await REESSAI.avecReessai('export ventes Deciplus ' + mois, TENTATIVES, (n) => {
          dire('Deciplus : export des VENTES de ' + mois + (n > 1 ? ' — tentative ' + n : '') + '…');
          return DEC.exporterVentesMois(page, mois, DOSSIER_EXPORTS, dire);
        }, { remise: () => DEC.reinitialiserFiltres(page), journal: dire });
      } catch (e) {
        erreurs.push('Deciplus ventes / ' + mois + ' : ' + e.message);
        dire('⚠️ Deciplus ventes ' + mois + ' : ' + e.message);
      }
    }
    // ENCAISSEMENTS APRÈS M — pour la détection de paiement sur 31 jours.
    //  Une vente signée le 31/08 a jusqu'au 01/10 : on lit donc M+1, et M+2 si
    //  la fenêtre y déborde (sans dépasser le mois en cours).
    //  ⚠️ NON BLOQUANT : ces fichiers ne portent aucun KPI. Un export raté ne
    //  fait jamais conclure « aucun encaissement » — la couverture le dira.
    for (const ym of PAI.moisNecessaires(mois).filter((x) => x !== mois)) {
      const dest = path.join(DOSSIER_EXPORTS, 'encaissements-' + ym + '.csv');
      if (sansDeciplus && fs.existsSync(dest)) { dire('CSV ' + ym + ' réutilisé pour les paiements (--sans-deciplus)'); fichiersPaiement[ym] = dest; continue; }
      try {
        fichiersPaiement[ym] = await REESSAI.avecReessai('export Deciplus ' + ym + ' (paiements)', TENTATIVES, (n) => {
          dire('Deciplus : export des encaissements de ' + ym + ' pour les paiements' + (n > 1 ? ' — tentative ' + n : '') + '…');
          return DEC.exporterMois(page, ym, DOSSIER_EXPORTS, dire);
        }, { remise: () => DEC.reinitialiserFiltres(page), journal: dire });
      } catch (e) {
        dire('ℹ️ encaissements ' + ym + ' indisponibles (' + e.message + ') — les paiements concernés resteront non vérifiables');
      }
    }
    // HISTORIQUE DES VENTES (24 mois glissants) — uniquement pour retrouver le
    //  vendeur d'origine des non-reconduits. Les mois déjà sur disque sont
    //  réutilisés ; un mois raté n'arrête rien et n'attribue personne à tort.
    if (!sansDeciplus) {
      await HISTO.exporterManquants({ page, mois, dossier: DOSSIER_EXPORTS, dire, DEC, REESSAI, tentatives: TENTATIVES });
    }
    await DEC.reinitialiserFiltres(page);
  } catch (e) {
    erreurs.push('Deciplus : ' + e.message);
    dire('⚠️ Deciplus : ' + e.message);
  }

  // ── 2) Parsing + contrôles de conformité des CSV ─────────────────────────
  const enc = {};
  const controleStudio = {}; // ym -> { studio -> contrôle }
  for (const ym of [m1, mois]) {
    if (!fichiers[ym]) continue;
    const texte = fs.readFileSync(fichiers[ym], 'utf8');
    const p = CSV.parser(texte);
    // Ce que le parseur a écarté (lignes sans adhérent, lignes tronquées) :
    // c'est la seule cause connue de « l'écart global » avec le total Deciplus.
    // On le donne à verifier() pour qu'il ne répète PAS une alerte que
    // controlerStudios() émet déjà, studio par studio.
    const ecartees = CSV.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
    const v = CSV.verifier(p, { moisAttendu: ym, studiosAttendus: M.LABELS, studioLabel: M.studioLabel, ecartees });
    // Contrôle BLOQUANT, studio par studio, sur les 6 seuls studios RECAP 2.
    controleStudio[ym] = CSV.controlerStudios(texte, p, { moisAttendu: ym, studios: M.LABELS, studioLabel: M.studioLabel });
    const enEchec = M.LABELS.filter((st) => !controleStudio[ym][st].ok);
    if (enEchec.length) dire('⚠️ CSV ' + ym + ' — studios en échec de contrôle : ' + enEchec.join(', '));
    rapport.source['deciplus_' + ym] = {
      fichier: path.basename(fichiers[ym]), periode: p.periode, lignes: p.lignes.length,
      totalAnnonce: p.totalAnnonce, conforme: v.ok, problemes: v.problemes,
      avertissements: v.avertissements || [], lignesParStudio: v.lignesParStudio,
      controleParStudio: controleStudio[ym],
      // Trace structurée : l'écart global reste LISIBLE dans le fichier même
      // quand il ne fait plus d'alerte, parce qu'il est entièrement expliqué.
      ecartGlobal: v.ecartGlobal,
      lignesEcartees: ecartees,
    };
    (v.avertissements || []).forEach((a) => dire('ℹ️ CSV ' + ym + ' : ' + a));
    if (!v.ok) { erreurs.push('CSV ' + ym + ' non conforme : ' + v.problemes.join(' · ')); dire('⚠️ CSV ' + ym + ' : ' + v.problemes.join(' · ')); }
    else dire('CSV ' + ym + ' conforme : ' + p.lignes.length + ' lignes, ' + Object.keys(v.lignesParStudio).length + ' studios');
    enc[ym] = p.lignes;
  }

  // ── 2 bis) Parsing + contrôle du JOURNAL DES VENTES de M ─────────────────
  let ventesM = null;
  if (fichierVentes) {
    try {
      const texteV = fs.readFileSync(fichierVentes, 'utf8');
      const pv = VENTES.parser(texteV);
      const vv = VENTES.verifier(pv, { moisAttendu: mois });
      rapport.source['deciplus_ventes_' + mois] = {
        fichier: path.basename(fichierVentes), periode: pv.periode, lignes: pv.lignes.length,
        totalAnnonce: pv.totalAnnonce, conforme: vv.ok, problemes: vv.problemes,
        avertissements: vv.avertissements || [],
      };
      if (!vv.ok) {
        erreurs.push('CSV ventes ' + mois + ' non conforme : ' + vv.problemes.join(' · '));
        dire('⚠️ CSV ventes ' + mois + ' : ' + vv.problemes.join(' · '));
      } else {
        ventesM = pv.lignes;
        dire('CSV ventes ' + mois + ' conforme : ' + pv.lignes.length + ' vente(s)');
      }
    } catch (e) {
      erreurs.push('CSV ventes ' + mois + ' illisible : ' + e.message);
      dire('⚠️ CSV ventes ' + mois + ' : ' + e.message);
    }
  } else erreurs.push('Journal des ventes de ' + mois + ' absent — présence CRM invérifiable');

  // ── 2 ter) ENCAISSEMENTS POUR LES PAIEMENTS (M, puis M+1, M+2) ───────────
  //  Tous sites, indexés par Id_client. La COUVERTURE dit jusqu'à quel jour
  //  on sait vraiment : un mois en cours n'est connu que jusqu'à la veille de
  //  son export, et un mois manquant arrête la couverture.
  const lignesPaiement = [];
  const plagesPaiement = [];
  const moisPaiement = [];
  if (enc[mois] && fichiers[mois]) {
    lignesPaiement.push(...enc[mois]);
    plagesPaiement.push({ periode: rapport.source['deciplus_' + mois].periode, exporteLe: fs.statSync(fichiers[mois]).mtime });
    moisPaiement.push(mois);
  }
  for (const ym of Object.keys(fichiersPaiement).sort()) {
    try {
      const p = CSV.parser(fs.readFileSync(fichiersPaiement[ym], 'utf8'));
      const [a, m] = ((p.periode && p.periode.du) || '').split('-');
      if (a + '-' + m !== ym) { dire('ℹ️ CSV ' + ym + ' (paiements) : période ' + JSON.stringify(p.periode) + ' — ignoré'); continue; }
      lignesPaiement.push(...p.lignes);
      plagesPaiement.push({ periode: p.periode, exporteLe: fs.statSync(fichiersPaiement[ym]).mtime });
      moisPaiement.push(ym);
    } catch (e) { dire('ℹ️ CSV ' + ym + ' (paiements) illisible : ' + e.message); }
  }
  const parIdPaiement = PAI.indexerParId(lignesPaiement);
  const couvertPaiement = PAI.couverture(plagesPaiement);
  rapport.source.paiements = {
    fenetreJours: PAI.JOURS_FENETRE, moisLus: moisPaiement,
    couvertDu: couvertPaiement ? PAI.texte(couvertPaiement.du) : null,
    couvertJusquau: couvertPaiement ? PAI.texte(couvertPaiement.au) : null,
  };
  dire('paiements : encaissements lus ' + (moisPaiement.join(', ') || 'aucun')
    + (couvertPaiement ? ' — couverts du ' + PAI.texte(couvertPaiement.du) + ' au ' + PAI.texte(couvertPaiement.au) : ''));

  // ── 3) FITNESS BOOSTER : contrats signés PENDANT M, studio par studio ────
  //  ⚠️ C'EST BIEN M, PAS M-1. RECAP 2 audite le mois M : on contrôle les ventes
  //  signées CE mois-là. Auparavant on lisait M-1, ce qui obligeait à
  //  sélectionner septembre pour contrôler le travail d'août.
  const contratsFB = {};
  // PRISES DE RÉFÉRENCE (Vendor) — lues juste après les contrats, club déjà actif.
  //  Un repère, pas un KPI : un échec ici ne bloque ni le studio ni l'envoi, il
  //  prive seulement CE studio de son chiffre de références (et c'est dit).
  const referencesFB = {};
  try {
    const page = pageDe('fitness-booster');
    if (!page) throw new Error('Aucun onglet Fitness Booster ouvert');
    for (const studio of M.LABELS) {
      try {
        contratsFB[studio] = await REESSAI.avecReessai('Fitness Booster ' + studio, TENTATIVES,
          () => FB.lireStudio(page, studio, mois, dire),
          { remise: () => FB.fermerPanneau(page), journal: dire });
      } catch (e) {
        erreurs.push('Fitness Booster / ' + studio + ' : ' + e.message);
        dire('⚠️ FB ' + studio + ' : ' + e.message);
        contratsFB[studio] = { studio, mois, echec: e.message };
      }
      try {
        referencesFB[studio] = await REESSAI.avecReessai('Prises de référence ' + studio, TENTATIVES, async () => {
          const r = await REF.lireReferences(contexte, studio, mois, { journal: dire });
          if (!r.ok) throw Object.assign(new Error(r.problemes.join(' ; ')), { resultat: r });
          return r;
        }, { journal: dire });
      } catch (e) {
        // La lecture a pu aboutir malgré un contrôle « références » en échec : ses
        // données brutes restent utilisables pour les VNI, qui ont LEUR contrôle.
        referencesFB[studio] = Object.assign({ studio, mois }, e.resultat || {}, { ok: false, problemes: [e.message] });
        dire('⚠️ Prises de référence ' + studio + ' : ' + e.message + ' — pas de chiffre pour ce studio');
      }
    }
  } catch (e) {
    erreurs.push('Fitness Booster : ' + e.message);
    dire('⚠️ Fitness Booster : ' + e.message);
  }
  rapport.source.fitnessBooster = Object.fromEntries(Object.entries(contratsFB).map(([s, r]) => [s, {
    club: r.club || null, periodeDetail: r.periodeDetail || null, compteur: r.compteur == null ? null : r.compteur,
    annulees: r.annulees == null ? null : r.annulees, echec: r.echec || null,
    commerciauxSansId: r.commerciauxSansId == null ? null : r.commerciauxSansId,
    prisesReference: referencesFB[s] ? {
      ok: !!referencesFB[s].ok, total: referencesFB[s].total == null ? null : referencesFB[s].total,
      affiche: referencesFB[s].affiche == null ? null : referencesFB[s].affiche,
      tuileContacts: referencesFB[s].tuileContacts == null ? null : referencesFB[s].tuileContacts,
      contactsDuMois: referencesFB[s].contactsDuMois == null ? null : referencesFB[s].contactsDuMois,
      problemes: referencesFB[s].problemes || [],
    } : null,
  }]));

  // ── 3 ter-a) VNI (visiteurs non inscrits) ────────────────────────────────
  //  Un repère de suivi, jamais un KPI : un contrôle en échec ne prive QUE la
  //  partie VNI du studio. Voir lib/boosterVni.js et lib/recap2Vni.js.
  let vniCalc = { studios: {}, transformations: [], avertissements: [] };
  try {
    vniCalc = VNI.calculer({
      ym: mois, studios: M.LABELS, lectures: referencesFB, contratsFB,
      ventesDeciplus: ventesM ? ventesM.map((l) => ({ date: l.date, idClient: l.idClient })) : null,
    });
    const nb = M.LABELS.map((s) => { const b = vniCalc.studios[s]; return s + ' ' + (b && b.liste ? b.liste.length : '—'); }).join(', ');
    dire('VNI : ' + nb + ' · ' + vniCalc.transformations.length + ' transformation(s) connue(s)');
    vniCalc.avertissements.forEach((a) => dire('ℹ️ VNI : ' + a));
  } catch (e) {
    dire('⚠️ VNI : ' + e.message + ' — pas de VNI pour ce mois');
    M.LABELS.forEach((s) => { vniCalc.studios[s] = { echec: 'calcul impossible : ' + e.message }; });
  }
  rapport.transformations = vniCalc.transformations;
  rapport.source.vni = { avertissements: vniCalc.avertissements, transformations: vniCalc.transformations.length };

  // ── 3 bis) LES DÉCISIONS HUMAINES DÉJÀ PRISES ────────────────────────────
  //  Lues sur le serveur AVANT le moteur fuzzy : une correspondance confirmée
  //  n'a plus à être proposée, et un couple refusé ne doit plus revenir.
  //  Injoignable ? On continue sans : mieux vaut reproposer que ne rien rendre.
  let decisions = new Map();
  try {
    const base = (process.env.RECAP2_INGEST_URL || '').replace(/\/$/, '');
    const cle = process.env.RECAP2_INGEST_KEY || '';
    if (base && cle) {
      const rep = await fetch(base + '/api/recap2/matches', { headers: { 'X-Recap2-Key': cle } });
      if (rep.ok) {
        const j = await rep.json();
        (j.matches || []).forEach((m) => decisions.set(m.cle, { confirme: m.confirme, refuses: m.refuses || [] }));
        dire('rapprochements déjà décidés : ' + decisions.size);
      } else dire('ℹ️ rapprochements : serveur ' + rep.status + ' — on continue sans');
    }
  } catch (e) { dire('ℹ️ rapprochements indisponibles (' + e.message + ') — on continue sans'); }

  // ── 3 ter) RECHERCHE DE FICHES DECIPLUS (« à vérifier » sans piste) ──────
  //  Ouverte à la demande, dans un onglet à part, refermée à la fin. Si elle
  //  n'est pas disponible, on continue sans : la ligne reste « à vérifier ».
  let rechercheFiches = null, rechercheFichesKo = false;
  const ficheDe = async (identite, studio) => {
    if (rechercheFichesKo) return null;
    try {
      if (!rechercheFiches) rechercheFiches = await MEMBRES.ouvrirRecherche(contexte, DEC.garde);
      return await rechercheFiches.chercher(identite, studio, M.studioLabel);
    } catch (e) {
      rechercheFichesKo = true;
      dire('ℹ️ recherche de fiches Deciplus indisponible (' + e.message + ') — on continue sans');
      return null;
    }
  };

  // ── 4) CALCUL par studio ─────────────────────────────────────────────────
  for (const studio of M.LABELS) {
    // Pas de `completion` ici, même à null : ce champ appartient à la règle v1.
    // Un rapport v2 qui le porterait laisserait croire que le KPI existe encore.
    const bloc = { studio, nonReconduction: null, clientsRetrouves: null, avertissements: [] };
    // Les prises de référence ne dépendent d'aucun fichier Deciplus : elles sont
    // posées AVANT le contrôle bloquant, qui ne concerne que les deux KPI.
    const refs = referencesFB[studio];
    if (refs && refs.ok) {
      bloc.prisesReference = { total: refs.total, affiche: refs.affiche, liste: refs.liste };
    } else {
      const raison = refs ? refs.problemes.join(' ; ') : 'non lues';
      bloc.prisesReference = { echec: raison };
      bloc.avertissements.push('Prises de référence indisponibles : ' + raison);
    }
    // Les VNI non plus ne dépendent d'aucun fichier Deciplus du studio.
    bloc.vni = vniCalc.studios[studio] || { echec: 'non calculés' };
    if (bloc.vni.echec) bloc.avertissements.push('VNI indisponibles : ' + bloc.vni.echec);

    // Contrôle bloquant PAR STUDIO : si le fichier de M ou de M-1 ne passe pas
    // pour ce studio, on ne produit AUCUN KPI pour lui — et on dit pourquoi.
    const echecs = [];
    [m1, mois].forEach((ym) => {
      const c = controleStudio[ym] && controleStudio[ym][studio];
      if (c && !c.ok) echecs.push(ym + ' : ' + c.problemes.join(' · '));
    });
    if (echecs.length) {
      bloc.controleBloquant = { ok: false, raisons: echecs };
      bloc.avertissements.push('KPI refusés — contrôle de conformité en échec (' + echecs.join(' | ') + ')');
      rapport.studios[studio] = bloc;
      continue;
    }
    bloc.controleBloquant = { ok: true, detail: Object.fromEntries([m1, mois].map((ym) => [ym,
      (controleStudio[ym] && controleStudio[ym][studio]) ? controleStudio[ym][studio].controles : null])) };
    // Le rapport porte sur M : une alerte sur M n'a pas besoin d'être datée.
    // Seule celle qui vient de M-1 est préfixée, sinon elle serait ambiguë.
    [m1, mois].forEach((ym) => {
      const c = controleStudio[ym] && controleStudio[ym][studio];
      (c && c.avertissements || []).forEach((a) => bloc.avertissements.push(ym === mois ? a : ym + ' : ' + a));
    });

    // 4a) Non-reconduction : vue par Id membre (identifiant stable d'un mois à l'autre).
    if (enc[m1] && enc[mois]) {
      const vM1 = CSV.vueParId(enc[m1], studio, M.studioLabel);
      const vM = CSV.vueParId(enc[mois], studio, M.studioLabel);
      if (!vM1.length) bloc.avertissements.push('aucune ligne ' + m1 + ' pour ce studio');
      if (!vM.length) bloc.avertissements.push('aucune ligne ' + mois + ' pour ce studio');
      if (vM1.length && vM.length) {
        const nr = M.nonReconduction({ encM1: vM1, encM: vM });
        bloc.nonReconduction = {
          base: nr.base, nonReconduits: nr.nb,
          taux: nr.taux, tauxPct: nr.taux == null ? null : +(nr.taux * 100).toFixed(1),
          // Détail nominatif, utile pour l'œil : identité, Id membre (fiche), nets.
          liste: CSV.detailNonReconduits(nr.nonReconduits),
        };
      }
    } else bloc.avertissements.push('encaissements manquants (M et/ou M-1)');

    // 4b) Clients retrouvés dans Deciplus : signataires FB de M (annulés EXCLUS)
    //     cherchés dans le JOURNAL DES VENTES de M, tous sites.
    //  ⚠️ On ne conclut PAS depuis les encaissements : « pas de paiement » ne
    //  veut pas dire « absent du CRM ». Le net de M ne sert qu'à nuancer un
    //  client retrouvé (encaissé ou pas encore), jamais à le déclarer manquant.
    const fbr = contratsFB[studio];
    if (fbr && !fbr.echec && ventesM) {
      // ⚠️ LES ANNULÉES NE SONT PLUS ÉCARTÉES DE LA VUE, seulement du TAUX.
      // On contrôle tout ce qui a été signé dans le mois ; une vente annulée
      // ensuite reste un acte à regarder. Mais elle ne pénalise pas la saisie
      // CRM : on ne peut pas reprocher l'absence d'un contrat qui n'existe plus.
      const toutes = fbr.contrats || [];
      const valides = toutes.filter((c) => !c.annulee);
      const annulees = toutes.filter((c) => c.annulee).map((c) => ({
        prenom: c.identite.trim(), nom: '',
        date: c.date, prestation: c.prestation, commercial: c.commercial, commercialId: c.commercialId || '',
        dateAnnulation: c.dateAnnulation || '',
      }));
      const signataires = valides.map((c) => ({
        cles: R.clesContrat(c.identite), prenom: c.identite.trim(), nom: '',
        date: c.date, prestation: c.prestation, commercial: c.commercial, commercialId: c.commercialId || '',
      }));
      const vueVentes = VENTES.vueParNom(ventesM, R.clesContrat);
      const vueEnc = enc[mois] ? CSV.vueParNom(enc[mois], studio, M.studioLabel, R.clesContrat) : [];
      const cr = M.clientsRetrouves({ signataires, annulees, ventesM: vueVentes, encM: vueEnc });
      // QUASI-HOMONYMES : pour un « à vérifier », on cherche un nom très proche
      // dans le journal des ventes. On PROPOSE une piste, on n'apparie jamais —
      // la ligne reste « à vérifier » et aucun compteur ne bouge.
      //  ORDRE : correspondance exacte (déjà faite) -> décision humaine déjà
      //  prise -> moteur fuzzy, en excluant les couples refusés -> à vérifier.
      //  Une validation humaine prime TOUJOURS sur le moteur.
      const pisteDe = (c) => {
        if (c.annulee || c.retrouve) return {};
        const ident = ((c.prenom || '') + ' ' + (c.nom || '')).trim();
        const dej = decisions.get(MATCHES.cleDe({ client: ident }));
        if (dej && dej.confirme) return {};   // le serveur le posera à la lecture
        const q = RAPPRO.proposer(ident, ventesM, { exclure: (dej && dej.refuses) || [] });
        if (!q || q.ambigu) return {};   // plusieurs candidats aussi proches : on se tait
        return {
          candidat: q.adherent, candidatScore: q.score, candidatNiveau: q.niveau,
          candidatIndices: q.indices.slice(0, 4),
          candidatSite: q.site || '', candidatId: q.idClient || '',
        };
      };
      // PAIEMENT sur 31 jours, par Id_client, tous sites (lib/paiement.js).
      //  Remplace l'ancien « encaissé sur M, dans ce studio, par le nom ».
      const paiementDe = (c) => {
        if (c.annulee || !c.retrouve) return null;
        return PAI.statutPaiement({ idClient: c.idClient, dateSignature: c.date, parId: parIdPaiement, couvert: couvertPaiement });
      };
      // FICHE DECIPLUS d'un « à vérifier » sans piste de vente (ni candidat, ni
      // décision confirmée) : cherchée une fois, avant de construire les lignes.
      const fiches = new Map();
      for (const c of cr.clients) {
        if (c.retrouve || c.annulee || pisteDe(c).candidat) continue;
        const ident = ((c.prenom || '') + ' ' + (c.nom || '')).trim();
        const dej = decisions.get(MATCHES.cleDe({ client: ident }));
        if (dej && dej.confirme) continue;
        const f = await ficheDe(ident, studio);
        if (f) { fiches.set(ident, f); dire(studio + ' : fiche Deciplus trouvée pour un « à vérifier » (aucune vente saisie)'); }
      }
      const ligne = (c) => {
        const client = ((c.prenom || '') + ' ' + (c.nom || '')).trim();
        const paiement = paiementDe(c);
        const fiche = fiches.get(client);
        return Object.assign({
          client,
          date: c.date || '', prestation: c.prestation || '', commercial: c.commercial || '',
          // L'identifiant Vendor du commercial : la clé de la vue par commercial.
          // Le nom ci-dessus ne sert qu'à l'affichage.
          commercialId: c.commercialId || '',
          annulee: !!c.annulee, dateAnnulation: c.dateAnnulation || '',
          retrouve: c.retrouve, site: c.site || '', dateVente: c.dateVente || '',
          // Id_client Deciplus : sert UNIQUEMENT à ouvrir la fiche membre au
          // clic. Aucune autre donnée personnelle n'est ajoutée au rapport.
          idClient: c.idClient || '',
          encaisse: !!paiement && paiement.etat === 'encaisse',
        }, pisteDe(c),
        paiement ? { paiement } : {},
        fiche ? { ficheId: fiche.idClient, ficheNom: fiche.nom, ficheSite: fiche.site } : {});
      };
      bloc.clientsRetrouves = {
        // `annulees` : comptées, affichées, mais hors du taux. `annulesExclus`
        // est conservé à l'identique pour que les rapports déjà déposés — qui ne
        // connaissent que cette clé — restent lisibles tels quels.
        ventesSignees: fbr.compteur, annulees: annulees.length, annulesExclus: fbr.annulees,
        ventesActives: valides.length, ventesValides: valides.length,
        signataires: cr.total, retrouves: cr.nbRetrouves,
        taux: cr.taux, tauxPct: cr.taux == null ? null : +(cr.taux * 100).toFixed(1),
        liste: cr.clients.map(ligne).concat(cr.annules.map(ligne)),
      };
      // Le taux se lit en SIGNATAIRES UNIQUES : deux ventes d'une même personne
      // ne comptent qu'une fois au dénominateur. On le DIT, on ne l'avale pas.
      if (cr.total !== valides.length) {
        bloc.clientsRetrouves.doublonsSignataire = valides.length - cr.total;
        bloc.avertissements.push(CTRL.messageDoublons(valides.length, cr.total));
      }
      // Un client retrouvé dans le CRM mais pas encore encaissé n'est PAS une
      // anomalie — c'est précisément ce que l'ancien KPI comptait à tort comme
      // un manque. On le mentionne pour mémoire, jamais comme un défaut.
      if (annulees.length) {
        bloc.avertissements.push(annulees.length + ' vente(s) annulée(s) — affichée(s) dans le détail, hors du taux');
      }
      const pistes = cr.clients.filter((c) => !c.retrouve && !c.annulee && pisteDe(c).candidat).length;
      if (pistes) {
        bloc.avertissements.push(pistes + ' rapprochement(s) proposé(s) — à confirmer à la main, hors du taux');
      }
      // Les paiements, comptés par état. Seul « aucun » est une anomalie ;
      // « attendu » est dit pour mémoire, « indetermine » dit un manque de données.
      const lignesCr = bloc.clientsRetrouves.liste;
      const nb = (etat) => lignesCr.filter((l) => l.paiement && l.paiement.etat === etat).length;
      bloc.clientsRetrouves.paiements = { encaisse: nb('encaisse'), attendu: nb('attendu'), aucun: nb('aucun'), indetermine: nb('indetermine') };
      const pa = bloc.clientsRetrouves.paiements;
      if (pa.aucun) bloc.avertissements.push(pa.aucun + ' vente(s) retrouvée(s) sans aucun encaissement sous ' + PAI.JOURS_FENETRE + ' jours après signature');
      if (pa.attendu) bloc.avertissements.push(pa.attendu + ' premier(s) encaissement(s) attendu(s) — fenêtre de ' + PAI.JOURS_FENETRE + ' jours en cours');
      if (pa.indetermine) {
        bloc.avertissements.push(pa.indetermine + ' paiement(s) non vérifiable(s) : encaissements connus jusqu\'au '
          + (couvertPaiement ? PAI.texte(couvertPaiement.au) : '—') + ' seulement');
      }
      const nbFiches = lignesCr.filter((l) => l.ficheId).length;
      if (nbFiches) bloc.avertissements.push(nbFiches + ' « à vérifier » avec fiche Deciplus trouvée mais aucune vente saisie');
      // Le site Deciplus peut différer du studio qui a porté la vente côté FB.
      const ailleurs = cr.clients.filter((c) => c.retrouve && c.site && M.studioLabel(c.site) !== studio);
      if (ailleurs.length) {
        bloc.avertissements.push(ailleurs.length + ' vente(s) retrouvée(s) sur un autre site Deciplus : '
          + [...new Set(ailleurs.map((c) => c.site))].join(', '));
      }
    } else if (fbr && fbr.echec) bloc.avertissements.push('Fitness Booster en échec : ' + fbr.echec);
    else if (!ventesM) bloc.avertissements.push('journal des ventes de ' + mois + ' indisponible');
    else bloc.avertissements.push('contrats ' + mois + ' indisponibles');

    rapport.studios[studio] = bloc;
  }


  if (rechercheFiches) await rechercheFiches.fermer();

  // ── 4 bis) Vendeur d'origine des non-reconduits ─────────────────────────
  //  Par Id_client uniquement, sur l'historique des ventes lu sur disque.
  //  AUCUN KPI : un champ d'information par ligne (lib/vendeurOrigine.js).
  try {
    const h = HISTO.lire({ mois, dossier: DOSSIER_EXPORTS });
    ORIGINE.poser(rapport, ORIGINE.indexer(h.lignes), h.historique);
    dire('historique des ventes : ' + h.historique.moisLus + '/' + HISTO.PROFONDEUR + ' mois lus'
      + (h.historique.manquants.length ? ' — manquants : ' + h.historique.manquants.join(', ') : ''));
  } catch (e) {
    dire('ℹ️ vendeurs d\'origine des non-reconduits non posés : ' + e.message);
  }

  // ── 5) Sortie ────────────────────────────────────────────────────────────
  rapport.erreurs = erreurs;
  rapport.journal = journal;
  fs.mkdirSync(DOSSIER_SORTIE, { recursive: true });
  const ecrit = FICHIER.ecrire(DOSSIER_SORTIE, mois, rapport, { enEchec: erreurs.length > 0 });
  if (ecrit.conserve) {
    dire('⚠️ collecte en échec — rapport exploitable du ' + ecrit.ancienGenere
      + ' CONSERVÉ ; diagnostic écrit dans ' + path.basename(ecrit.cible));
  }
  dire('JSON de contrôle écrit : ' + ecrit.cible);
  if (ecrit.nettoye) dire('diagnostic précédent supprimé : ' + path.basename(ecrit.diagnostic));

  // Résumé lisible au terminal (sans aucune donnée nominative).
  console.log('\n===== RÉSUMÉ ' + mois + ' (M-1 = ' + m1 + ') =====');
  console.table(M.LABELS.map((s) => {
    const b = rapport.studios[s], nr = b.nonReconduction, cr = b.clientsRetrouves;
    return {
      studio: s,
      'base M-1': nr ? nr.base : '—',
      'non recond.': nr ? nr.nonReconduits : '—',
      'taux non-rec.': nr && nr.tauxPct != null ? nr.tauxPct + ' %' : '—',
      ['ventes ' + mois]: cr ? cr.ventesSignees : '—',
      'annulées': cr ? cr.annulesExclus : '—',
      'signataires': cr ? cr.signataires : '—',
      'retrouvés': cr ? cr.retrouves : '—',
      'présence CRM': cr && cr.tauxPct != null ? cr.tauxPct + ' %' : '—',
      alertes: b.avertissements.length || '',
    };
  }));
  if (erreurs.length) { console.log('\n⚠️ ' + erreurs.length + ' erreur(s) :'); erreurs.forEach((e) => console.log('  · ' + e)); }

  await navigateur.close(); // on se détache, la fenêtre reste ouverte
  process.exit(erreurs.length ? 1 : 0);
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
