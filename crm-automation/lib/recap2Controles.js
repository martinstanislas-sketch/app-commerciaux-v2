'use strict';
// ============================================================================
//  RECAP 2 — LES CONTRÔLES, ET LEUR SEULE QUESTION : peut-on envoyer ?
//
//  Module PUR (aucune I/O, aucun navigateur, aucun réseau) : on lui passe le
//  rapport JSON produit par la collecte, il rend un verdict motivé. C'est lui
//  qui tient la frontière — la seule qui compte dans cette chaîne :
//
//    BLOQUANT      un chiffre serait FAUX ou MANQUANT si on envoyait.
//                  · période incohérente (le fichier ne parle pas du bon mois)
//                  · studio manquant ou privé de KPI
//                  · KPI impossible (taux hors bornes, numérateur > dénominateur)
//                  · nombre de lignes incohérent (le parseur a perdu des lignes)
//                  · problème d'authentification / de collecte
//
//    NON BLOQUANT  un chiffre est JUSTE, et une particularité mérite d'être
//                  dite. · doublons de contrat connus · encaissements sans
//                  adhérent écartés. On les compte, on les affiche, on envoie.
//
//  ⚠️ CE MODULE NE CALCULE AUCUN KPI et n'en corrige aucun. Il relit ce que la
//  collecte a écrit et vérifie sa cohérence interne. Le seul moteur de calcul
//  reste public/recap2-metrics.js.
// ============================================================================

const Store = require('../../lib/recap2Store.js');

const LABELS = Store.LABELS;
const estNombre = (x) => typeof x === 'number' && Number.isFinite(x);
const estObjet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Une erreur de collecte qui sent la session perdue plutôt que la donnée absente.
const SENT_LA_SESSION = /onglet|session|connexion|connect|authentif|login|identifiant|d[ée]connect|expir|\b40[13]\b/i;

// Les deux outils ne datent pas pareil : Deciplus écrit « 2026-07-31 » dans
// l'en-tête de son export, Fitness Booster affiche « 31/07/26 » à l'écran. On
// ramène les deux au même « AAAA-MM » plutôt que de comparer des chaînes qui ne
// se ressemblent pas.
function moisDeDate(d) {
  const t = String(d == null ? '' : d).trim();
  let m = /^(\d{4})-(\d{2})-\d{2}$/.exec(t);
  if (m) return m[1] + '-' + m[2];
  m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(t);
  if (m) return (m[3].length === 4 ? m[3] : '20' + m[3]) + '-' + m[2];
  return null;
}

// ─── LE MESSAGE « DOUBLONS DE CONTRAT » ─────────────────────────────────────
//  Fitness Booster compte des CONTRATS ; la complétion se lit en SIGNATAIRES
//  UNIQUES (deux contrats d'une même personne = une personne). Quand les deux
//  nombres diffèrent, on le dit — une fois, court, sans redire la règle.
//  Écrit ici et pas dans la collecte pour que le texte soit testable seul.
function messageDoublons(bruts, uniques) {
  const n = bruts - uniques;
  if (!(n > 0)) return null;
  return n + ' doublon' + (n > 1 ? 's' : '') + ' de contrat détecté' + (n > 1 ? 's' : '')
    + ', calcul effectué sur ' + uniques + ' signataire' + (uniques > 1 ? 's' : '')
    + ' unique' + (uniques > 1 ? 's' : '');
}

// ─── LA LISTE DES ALERTES, exactement celle de l'écran ──────────────────────
//  Miroir volontaire de bandeauAlertes() dans public/recap2.js : le compte
//  affiché au terminal doit être CELUI que Stan verra dans l'onglet RECAP 2,
//  sinon le résumé ment. Si l'un des deux change, changer l'autre.
function alertes(rapport) {
  const liste = [];
  LABELS.forEach((s) => {
    const b = (rapport.studios || {})[s];
    ((b && b.avertissements) || []).forEach((a) => liste.push({ studio: s, texte: a }));
  });
  Object.keys(rapport.source || {}).forEach((k) => {
    (((rapport.source || {})[k] || {}).avertissements || []).forEach((a) => liste.push({ studio: k, texte: a }));
  });
  return liste;
}

// ─── LES CONTRÔLES ──────────────────────────────────────────────────────────
function analyser(rapport, moisAttendu) {
  const controles = [];
  const ajouter = (code, titre, details) => controles.push({
    code, titre, bloquant: true, ok: details.length === 0, details,
  });

  if (!estObjet(rapport)) {
    return {
      mois: moisAttendu, m1: null, controles: [{ code: 'structure', titre: 'Forme du rapport', bloquant: true, ok: false, details: ['rapport illisible'] }],
      bloquants: ['structure'], alertes: [], peutEnvoyer: false, studios: [],
    };
  }

  // 1) FORME — le validateur du serveur, joué ici : ce qui échoue ici serait
  //    refusé là-bas de toute façon. Autant ne pas faire le voyage.
  const v = Store.valider(rapport, moisAttendu);
  ajouter('structure', 'Forme du rapport', v.ok ? [] : v.problemes.slice(0, 12));

  // 2) PÉRIODE — le fichier parle-t-il bien du mois demandé, et du précédent ?
  const pbPeriode = [];
  if (rapport.mois !== moisAttendu) pbPeriode.push('le fichier porte ' + rapport.mois + ', la commande demande ' + moisAttendu);
  if (Store.MOIS_RE.test(String(moisAttendu || '')) && rapport.m1 !== Store.moisPrecedent(moisAttendu)) {
    pbPeriode.push('mois précédent : ' + rapport.m1 + ' au lieu de ' + Store.moisPrecedent(moisAttendu));
  }
  [rapport.m1, rapport.mois].forEach((ym) => {
    const src = (rapport.source || {})['deciplus_' + ym];
    if (!estObjet(src)) { pbPeriode.push('export Deciplus de ' + ym + ' absent du rapport'); return; }
    const p = src.periode;
    if (!estObjet(p) || moisDeDate(p.du) !== ym || moisDeDate(p.au) !== ym) {
      pbPeriode.push('export Deciplus de ' + ym + ' : période du fichier « ' + ((p && p.du) || '?') + ' → ' + ((p && p.au) || '?') + ' »');
    }
    if (src.conforme === false) pbPeriode.push('export Deciplus de ' + ym + ' non conforme : ' + (src.problemes || []).join(' · '));
  });
  const fb = (rapport.source || {}).fitnessBooster || {};
  LABELS.forEach((s) => {
    const d = fb[s];
    if (estObjet(d) && d.periodeDetail && !d.echec) {
      const p = d.periodeDetail;
      if (moisDeDate(p.du) !== rapport.m1 || moisDeDate(p.au) !== rapport.m1) {
        pbPeriode.push('Fitness Booster / ' + s + ' : détail du ' + p.du + ' au ' + p.au + ' ≠ ' + rapport.m1);
      }
    }
  });
  ajouter('periode', 'Cohérence de période', pbPeriode);

  // 3) STUDIOS — les six, tous là, tous calculés.
  const pbStudios = [];
  LABELS.forEach((s) => {
    const b = (rapport.studios || {})[s];
    if (!estObjet(b)) { pbStudios.push(s + ' : absent du rapport'); return; }
    if (b.controleBloquant && b.controleBloquant.ok === false) {
      pbStudios.push(s + ' : KPI refusés — ' + (b.controleBloquant.raisons || []).join(' · '));
    }
    const d = fb[s];
    if (estObjet(d) && d.echec) pbStudios.push(s + ' : Fitness Booster en échec — ' + d.echec);
  });
  ajouter('studios', 'Les 6 studios', pbStudios);

  // 4) LIGNES — le parseur n'a rien perdu, rien déformé, rien laissé hors mois.
  //    (Les lignes SANS ADHÉRENT sont écartées volontairement : elles ne
  //    comptent pas comme perdues, c'est une alerte, pas un blocage.)
  const pbLignes = [];
  [rapport.m1, rapport.mois].forEach((ym) => {
    const src = (rapport.source || {})['deciplus_' + ym];
    const parStudio = (estObjet(src) && src.controleParStudio) || null;
    if (!parStudio) { pbLignes.push(ym + ' : contrôle par studio absent'); return; }
    LABELS.forEach((s) => {
      const c = parStudio[s];
      if (!estObjet(c)) { pbLignes.push(ym + ' / ' + s + ' : contrôle absent'); return; }
      if (!c.ok) pbLignes.push(ym + ' / ' + s + ' : ' + (c.problemes || []).join(' · '));
      else if (c.lignesBrutes !== c.lignesParsees) {
        pbLignes.push(ym + ' / ' + s + ' : ' + c.lignesBrutes + ' lignes brutes -> ' + c.lignesParsees + ' parsées');
      }
    });
  });
  ajouter('lignes', 'Nombre de lignes', pbLignes);

  // 5) KPI — chaque studio rend DEUX chiffres, et chacun tient debout.
  const pbKpi = [];
  const bornes = (ou, taux, num, den) => {
    if (!estNombre(num) || num < 0) pbKpi.push(ou + ' : numérateur invalide');
    else if (!estNombre(den) || den < 0) pbKpi.push(ou + ' : dénominateur invalide');
    else if (num > den) pbKpi.push(ou + ' : ' + num + ' sur ' + den + ' — impossible');
    else if (den === 0) { if (taux !== null && taux !== undefined) pbKpi.push(ou + ' : taux annoncé sans base'); }
    else if (!estNombre(taux) || taux < 0 || taux > 1) pbKpi.push(ou + ' : taux hors bornes (' + taux + ')');
    else if (!Store.tauxCoherent(taux, num, den)) pbKpi.push(ou + ' : taux ' + taux + ' ≠ ' + num + '/' + den);
  };
  LABELS.forEach((s) => {
    const b = (rapport.studios || {})[s];
    if (!estObjet(b) || (b.controleBloquant && b.controleBloquant.ok === false)) return; // déjà dit en 3
    const nr = b.nonReconduction, co = b.completion;
    if (!estObjet(nr)) pbKpi.push(s + ' : non-reconduction absente');
    else bornes(s + ' / non-reconduction', nr.taux, nr.nonReconduits, nr.base);
    if (!estObjet(co)) pbKpi.push(s + ' : complétion absente');
    else bornes(s + ' / complétion', co.taux, co.ontPaye, co.contratsValides);
  });
  ajouter('kpi', 'KPI cohérents', pbKpi);

  // 6) COLLECTE — toute erreur remontée par la collecte bloque. Celles qui
  //    sentent la session perdue sont nommées comme telles : c'est la panne la
  //    plus fréquente, et la seule qui se répare en deux clics.
  const erreurs = (rapport.erreurs || []).slice();
  const auth = erreurs.filter((e) => SENT_LA_SESSION.test(e));
  ajouter('acces', 'Authentification CRM', auth);
  ajouter('collecte', 'Collecte sans erreur', erreurs.filter((e) => !SENT_LA_SESSION.test(e)));

  const bloquants = controles.filter((c) => c.bloquant && !c.ok);
  return {
    mois: rapport.mois || moisAttendu,
    m1: rapport.m1 || null,
    genere: rapport.genere || null,
    studios: LABELS.map((s) => {
      const b = (rapport.studios || {})[s] || {};
      return { studio: s, nonReconduction: b.nonReconduction || null, completion: b.completion || null };
    }),
    controles,
    bloquants,
    alertes: alertes(rapport),
    peutEnvoyer: bloquants.length === 0,
  };
}

module.exports = { analyser, alertes, messageDoublons, moisDeDate, LABELS, SENT_LA_SESSION };
