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
const CTRL = require('./lib/recap2Controles.js');
const REESSAI = require('./lib/reessai.js');
const FICHIER = require('./lib/rapportFichier.js');

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

  // ── 3) FITNESS BOOSTER : contrats signés PENDANT M, studio par studio ────
  //  ⚠️ C'EST BIEN M, PAS M-1. RECAP 2 audite le mois M : on contrôle les ventes
  //  signées CE mois-là. Auparavant on lisait M-1, ce qui obligeait à
  //  sélectionner septembre pour contrôler le travail d'août.
  const contratsFB = {};
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
    }
  } catch (e) {
    erreurs.push('Fitness Booster : ' + e.message);
    dire('⚠️ Fitness Booster : ' + e.message);
  }
  rapport.source.fitnessBooster = Object.fromEntries(Object.entries(contratsFB).map(([s, r]) => [s, {
    club: r.club || null, periodeDetail: r.periodeDetail || null, compteur: r.compteur == null ? null : r.compteur,
    annulees: r.annulees == null ? null : r.annulees, echec: r.echec || null,
  }]));

  // ── 4) CALCUL par studio ─────────────────────────────────────────────────
  for (const studio of M.LABELS) {
    // Pas de `completion` ici, même à null : ce champ appartient à la règle v1.
    // Un rapport v2 qui le porterait laisserait croire que le KPI existe encore.
    const bloc = { studio, nonReconduction: null, clientsRetrouves: null, avertissements: [] };

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
          // Détail nominatif, utile pour l'œil : identité + nets.
          liste: nr.nonReconduits.map((c) => ({ client: c.nom, netM1: +c.netM1.toFixed(2), netM: +c.netM.toFixed(2) })),
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
      const valides = (fbr.contrats || []).filter((c) => !c.annulee);
      const signataires = valides.map((c) => ({
        cles: R.clesContrat(c.identite), prenom: c.identite.trim(), nom: '',
        date: c.date, prestation: c.prestation, commercial: c.commercial,
      }));
      const vueVentes = VENTES.vueParNom(ventesM, R.clesContrat);
      const vueEnc = enc[mois] ? CSV.vueParNom(enc[mois], studio, M.studioLabel, R.clesContrat) : [];
      const cr = M.clientsRetrouves({ signataires, ventesM: vueVentes, encM: vueEnc });
      bloc.clientsRetrouves = {
        ventesSignees: fbr.compteur, annulesExclus: fbr.annulees,
        ventesValides: valides.length, signataires: cr.total, retrouves: cr.nbRetrouves,
        taux: cr.taux, tauxPct: cr.taux == null ? null : +(cr.taux * 100).toFixed(1),
        liste: cr.clients.map((c) => ({
          client: ((c.prenom || '') + ' ' + (c.nom || '')).trim(),
          date: c.date || '', prestation: c.prestation || '', commercial: c.commercial || '',
          retrouve: c.retrouve, site: c.site || '', dateVente: c.dateVente || '',
          // Id_client Deciplus : sert UNIQUEMENT à ouvrir la fiche membre au
          // clic. Aucune autre donnée personnelle n'est ajoutée au rapport.
          idClient: c.idClient || '', encaisse: c.encaisse,
        })),
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
      const enAttente = cr.clients.filter((c) => c.retrouve && !c.encaisse).length;
      if (enAttente) {
        bloc.clientsRetrouves.retrouvesSansEncaissement = enAttente;
        bloc.avertissements.push(enAttente + ' vente(s) saisie(s) dans le CRM sans encaissement sur ' + mois + ' — normal si l\'échéance tombe plus tard');
      }
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
