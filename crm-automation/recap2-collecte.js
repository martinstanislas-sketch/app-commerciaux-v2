'use strict';
// ============================================================================
//  RECAP 2 — COLLECTE v1 : Deciplus + Fitness Booster -> UN JSON DE CONTRÔLE.
//
//  Cette version NE TOUCHE PAS à l'application RECAP 2 : elle se contente de
//  produire un fichier JSON qu'on lit à l'œil pour comparer aux chiffres connus.
//  L'intégration viendra après, une fois le JSON jugé juste.
//
//  Le calcul n'est PAS refait ici : on appelle le module déjà testé
//  public/recap2-metrics.js (non-reconduction, complétion), et le moteur
//  public/retention.js pour les clés client. Une seule vérité arithmétique.
//
//  Usage :
//    node recap2-collecte.js 2026-07                  (M = juillet 2026)
//    node recap2-collecte.js 2026-07 --sans-deciplus  (réutilise les CSV déjà là)
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
const DEC = require('./lib/deciplus.js');
const FB = require('./lib/booster.js');

const CDP = process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222';
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
  const rapport = { genere: horodatage(), mois, m1, source: {}, studios: {}, journal: [] };

  // ── 1) DECIPLUS : deux exports CSV (M et M-1), tous sites ─────────────────
  const fichiers = {};
  try {
    const page = pageDe('deciplus');
    if (!page) throw new Error('Aucun onglet Deciplus ouvert (lance open-crm.js)');
    for (const ym of [m1, mois]) {
      const dest = path.join(DOSSIER_EXPORTS, 'encaissements-' + ym + '.csv');
      if (sansDeciplus && fs.existsSync(dest)) { dire('CSV ' + ym + ' réutilisé (--sans-deciplus)'); fichiers[ym] = dest; continue; }
      dire('Deciplus : export des encaissements de ' + ym + '…');
      fichiers[ym] = await DEC.exporterMois(page, ym, DOSSIER_EXPORTS, dire);
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
    const v = CSV.verifier(p, { moisAttendu: ym, studiosAttendus: M.LABELS, studioLabel: M.studioLabel });
    // Contrôle BLOQUANT, studio par studio, sur les 6 seuls studios RECAP 2.
    controleStudio[ym] = CSV.controlerStudios(texte, p, { moisAttendu: ym, studios: M.LABELS, studioLabel: M.studioLabel });
    const enEchec = M.LABELS.filter((st) => !controleStudio[ym][st].ok);
    if (enEchec.length) dire('⚠️ CSV ' + ym + ' — studios en échec de contrôle : ' + enEchec.join(', '));
    rapport.source['deciplus_' + ym] = {
      fichier: path.basename(fichiers[ym]), periode: p.periode, lignes: p.lignes.length,
      totalAnnonce: p.totalAnnonce, conforme: v.ok, problemes: v.problemes,
      avertissements: v.avertissements || [], lignesParStudio: v.lignesParStudio,
      controleParStudio: controleStudio[ym],
    };
    (v.avertissements || []).forEach((a) => dire('ℹ️ CSV ' + ym + ' : ' + a));
    if (!v.ok) { erreurs.push('CSV ' + ym + ' non conforme : ' + v.problemes.join(' · ')); dire('⚠️ CSV ' + ym + ' : ' + v.problemes.join(' · ')); }
    else dire('CSV ' + ym + ' conforme : ' + p.lignes.length + ' lignes, ' + Object.keys(v.lignesParStudio).length + ' studios');
    enc[ym] = p.lignes;
  }

  // ── 3) FITNESS BOOSTER : contrats souscrits de M-1, studio par studio ────
  const contratsFB = {};
  try {
    const page = pageDe('fitness-booster');
    if (!page) throw new Error('Aucun onglet Fitness Booster ouvert');
    for (const studio of M.LABELS) {
      try {
        contratsFB[studio] = await FB.lireStudio(page, studio, m1, dire);
      } catch (e) {
        erreurs.push('Fitness Booster / ' + studio + ' : ' + e.message);
        dire('⚠️ FB ' + studio + ' : ' + e.message);
        contratsFB[studio] = { studio, mois: m1, echec: e.message };
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
    const bloc = { studio, nonReconduction: null, completion: null, avertissements: [] };

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
    [m1, mois].forEach((ym) => {
      const c = controleStudio[ym] && controleStudio[ym][studio];
      (c && c.avertissements || []).forEach((a) => bloc.avertissements.push(ym + ' : ' + a));
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

    // 4b) Complétion : contrats FB de M-1 (annulés EXCLUS) vs net > 0 en M.
    const fbr = contratsFB[studio];
    if (fbr && !fbr.echec && enc[mois]) {
      const valides = (fbr.contrats || []).filter((c) => !c.annulee);
      // Chaque signataire devient { cles, nom, prenom } comme un contrat PDF :
      // l'identité arrive en un seul champ « Prénom Nom », donc on génère toutes
      // les coupes candidates — exactement ce que fait déjà RECAP pour les PDF.
      // On garde l'identité FB TELLE QUELLE dans prenom, et nom vide : ainsi
      // « prenom + nom » reconstruit exactement le libellé d'origine, sans
      // supposer où s'arrête le prénom (les clés candidates s'en chargent).
      const signataires = valides.map((c) => ({ cles: R.clesContrat(c.identite), prenom: c.identite.trim(), nom: '' }));
      const dateDe = new Map(valides.map((c) => [c.identite.trim(), c.date]));
      const vueNom = CSV.vueParNom(enc[mois], studio, M.studioLabel, R.clesContrat);
      const co = M.completion({ contratsM1: signataires, encM: vueNom });
      bloc.completion = {
        contratsSouscrits: fbr.compteur, annulesExclus: fbr.annulees,
        contratsValides: co.total, ontPaye: co.nbPayes,
        taux: co.taux, tauxPct: co.taux == null ? null : +(co.taux * 100).toFixed(1),
        // ⚠️ NE JAMAIS APPARIER PAR INDEX : le module TRIE sa liste par nom,
        // alors que `valides` suit l'ordre d'affichage de Fitness Booster. On
        // associait donc le nom d'une personne au statut d'une autre — les taux
        // restaient justes, mais le détail nominatif était faux.
        liste: co.contrats.map((c) => {
          const identite = ((c.prenom || '') + ' ' + (c.nom || '')).trim();
          return { contrat: identite, date: dateDe.get(identite) || '', paye: c.paye };
        }),
      };
      // Le taux se lit en SIGNATAIRES UNIQUES : deux contrats d'une même
      // personne ne comptent qu'une fois au dénominateur. On le signale.
      const bruts = fbr.compteur - fbr.annulees;
      if (co.total !== bruts) {
        bloc.completion.contratsBruts = bruts;
        bloc.completion.doublonsSignataire = bruts - co.total;
        bloc.avertissements.push('plusieurs contrats pour un même signataire : ' + bruts
          + ' contrat(s) valide(s) -> ' + co.total + ' signataire(s) unique(s) (' + (bruts - co.total) + ' doublon(s)) — le taux est calculé sur les signataires uniques');
      }
    } else if (fbr && fbr.echec) bloc.avertissements.push('Fitness Booster en échec : ' + fbr.echec);
    else bloc.avertissements.push('contrats ' + m1 + ' indisponibles');

    rapport.studios[studio] = bloc;
  }

  // ── 5) Sortie ────────────────────────────────────────────────────────────
  rapport.erreurs = erreurs;
  rapport.journal = journal;
  fs.mkdirSync(DOSSIER_SORTIE, { recursive: true });
  const sortie = path.join(DOSSIER_SORTIE, 'recap2-' + mois + '.json');
  fs.writeFileSync(sortie, JSON.stringify(rapport, null, 2));
  dire('JSON de contrôle écrit : ' + sortie);

  // Résumé lisible au terminal (sans aucune donnée nominative).
  console.log('\n===== RÉSUMÉ ' + mois + ' (M-1 = ' + m1 + ') =====');
  console.table(M.LABELS.map((s) => {
    const b = rapport.studios[s], nr = b.nonReconduction, co = b.completion;
    return {
      studio: s,
      'base M-1': nr ? nr.base : '—',
      'non recond.': nr ? nr.nonReconduits : '—',
      'taux non-rec.': nr && nr.tauxPct != null ? nr.tauxPct + ' %' : '—',
      'contrats M-1': co ? co.contratsSouscrits : '—',
      'annulés': co ? co.annulesExclus : '—',
      'valides': co ? co.contratsValides : '—',
      'ont payé': co ? co.ontPaye : '—',
      'complétion': co && co.tauxPct != null ? co.tauxPct + ' %' : '—',
      alertes: b.avertissements.length || '',
    };
  }));
  if (erreurs.length) { console.log('\n⚠️ ' + erreurs.length + ' erreur(s) :'); erreurs.forEach((e) => console.log('  · ' + e)); }

  await navigateur.close(); // on se détache, la fenêtre reste ouverte
  process.exit(erreurs.length ? 1 : 0);
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
