'use strict';
// ============================================================================
//  RECAP 2 — ANALYSE D'UN NON-RECONDUIT (moteur pur, déterministe, sans IA).
//
//  Entrée : la ligne du rapport, le dossier Deciplus LU EN GET sur le Mac
//  (crm-automation/lib/deciplusDossier.js lireDossierNR), éventuellement le
//  contrat Vendor retrouvé par identifiant et le recoupement du journal des
//  encaissements. Sortie : un statut automatique, une cause, une indication
//  courte, les contrôles suspension / finance, et les remarques « À faire ».
//
//  RÈGLES VALIDÉES PAR STAN LE 2026-09-18, DANS L'ORDRE DE PRIORITÉ :
//   1. Contentieux confirmé (catégorie Deciplus « Contentieux », ou phrase qui
//      CONFIRME le transfert) → « Résilié », AUCUNE remarque. Un risque, un
//      projet de transmission ou un motif « impayé » ne suffisent pas.
//   2. Identité incertaine / erreur de rapprochement → « À creuser ».
//   3. Contrat de référence toujours actif avec échéances à venir →
//      « Toujours actif » (sort des vraies non-reconductions, aucune action).
//      Nouveau contrat, nouvelle prestation, changement de formule,
//      renouvellement, transfert confirmé, carte RÉELLEMENT utilisable →
//      « Reconduit autrement ».
//   4. Suspension : dates structurées de l'API = dates de suspension et de
//      reprise ; la RAISON doit être expliquée par une note (Info
//      Compte/Paiement, Message accueil ou Notes système) ; échéances
//      suspendues ≠ impayés ; prolongation du contrat contrôlée.
//   5. Finance (résiliation AVANT la fin de l'engagement, hors contentieux) :
//      contractuel Vendor prioritaire si la vente est retrouvée de façon fiable,
//      recoupé par la valeur initiale Deciplus — divergence = anomalie, jamais
//      de choix silencieux ; facturé = valeur révisée ; encaissé = « Total
//      encaissé » recoupé avec le journal ; écart < 5 € neutralisé ; avoirs
//      non lisibles = limite affichée, calcul jamais présenté comme validé.
//   6. Cause probable (Confirmée / Probable / À confirmer) → action de
//      récupération, sauf départ irrécupérable.
//   7. Motif inconnu → action de qualification.
//
//  ⚠️ JAMAIS la note brute en sortie : une indication courte GÉNÉRÉE (zone et
//  date de la note, cause), aucun détail médical ni coordonnée.
// ============================================================================

// Les remarques sont produites par le REGISTRE UNIQUE (public/recap2-regles.js)
// à partir des champs structurés ci-dessous : le moteur ne rédige aucune phrase.
const Regles = require('../public/recap2-regles.js');

const STATUTS_AUTO = ['a_traiter', 'resilie', 'reconduit_autrement', 'toujours_actif', 'suspendu', 'a_creuser'];
const SEUIL_ECART = 5;         // € : un écart STRICTEMENT inférieur est neutralisé
const TOLERANCE_PROLONGATION = 7; // jours

const CAUSES = {
  prix: 'Prix', frequentation: 'Manque de fréquentation', temps: 'Manque de temps', motivation: 'Manque de motivation',
  resultats: 'Manque de résultats', planning: 'Difficulté de planning', demenagement: 'Déménagement', sante: 'Santé ou blessure',
  insatisfaction: 'Insatisfaction', coach: 'Problème avec le coach', impaye: 'Impayé ou problème bancaire',
  fin_challenge: 'Fin de Challenge sans nouvelle formule', transfert: 'Transfert vers un autre studio', autre: 'Autre cause', inconnu: 'Motif inconnu',
};
const ZONES = { compta: 'Info Compte/Paiement', accueil: 'Message accueil', admin: 'Notes système' };

// ── OUTILS ────────────────────────────────────────────────────────────────
const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const jours = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const ajouterJours = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const euros = (x) => {
  const v = Math.round(Number(x) * 100) / 100;
  const [e, c] = v.toFixed(2).split('.');
  return e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (c === '00' ? '' : ',' + c) + ' €';
};
const dateFr = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
const bornesMois = (ym) => {
  const [a, m] = ym.split('-').map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { debut: ym + '-01', fin };
};
const moisPrecedent = (ym) => { const [a, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(a, m - 2, 1)); return d.toISOString().slice(0, 7); };
const ACTIF = (c) => c && (c.etat === 'ACTIVE' || c.etat === 'SUSPENDED');
const ARRETE = (c) => c && /^(TERMINATED|CANCELED|EXPIRED)$/.test(c.etat);
// Un « Pack de suivi » / pack de démarrage est un contrat SÉPARÉ : hors finance.
const PACK = (c) => /pack\s*(de\s*)?(suivi|d[ée]marrage)|frais|inscription/i.test(c && c.produit || '');

// ── LES NOTES, PHRASE PAR PHRASE ──────────────────────────────────────────
//  Une phrase porte la date qu'elle cite (« 10/04 », « 10/4/2026 », « 07/08/6 ») ;
//  les phrases datées sont lues de la plus récente à la plus ancienne, puis les
//  non datées dans l'ordre du texte. Aucune phrase n'est jamais recopiée.
function datePhrase(p, anneeRef) {
  const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{1,4}))?/.exec(p);
  if (!m) return '';
  const j = +m[1], mo = +m[2];
  if (j < 1 || j > 31 || mo < 1 || mo > 12) return '';
  let a = m[3] ? +m[3] : anneeRef;
  if (a < 10) a = 2020 + a; else if (a < 100) a = 2000 + a; else if (a < 1000) a = anneeRef;
  return a + '-' + String(mo).padStart(2, '0') + '-' + String(j).padStart(2, '0');
}
function phrases(notes, anneeRef) {
  const out = [];
  Object.keys(ZONES).forEach((zone) => {
    String((notes && notes[zone]) || '').split(/\n|(?<=[.!?])\s+|\s-{3,}\s*|\s>\s|\s\/\/\s/).map((x) => x.trim()).filter((x) => x.length > 2)
      .forEach((texte, i) => out.push({ zone, texte, norm: sansAccent(texte), date: datePhrase(texte, anneeRef), ordre: i }));
  });
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.ordre - b.ordre);
}

// ── CONTENTIEUX ───────────────────────────────────────────────────────────
const CTX_CONFIRME = /(pass[ea]e?s?\s+(en|au)\s+(ctx|contentieux)|transmis(e|es)?\s+(au|en)\s+(ctx|contentieux)|mis(e)?\s+(en|au)\s+(ctx|contentieux)|envoy[ea]e?\s+(au|en)\s+(ctx|contentieux)|\bctx\s*(pour|de|:|=)?\s*\d|dossier\s+(en\s+)?(ctx|contentieux)|\ben\s+contentieux\b|\bctx\s+le\s+\d|\ble\s+\d{1,2}\/\d{1,2}(\/\d{1,4})?\s+ctx\b)/;
const CTX_NON_CONFIRME = /(a\s+transmettre|risque|envisag|devrait|pourrait|va\s+(passer|etre)|si\s+(pas|non|aucun|rien)|sinon|prochainement|bientot|avant\s+(de|le|la|d'|l')|menace|previen|prevenu|eviter|projet)/;
function contentieux(dossier, ph) {
  if (/^contentieux$/i.test(String(dossier.categorie || '').trim())) return { confirme: true, source: 'catégorie Deciplus « Contentieux »' };
  const p = ph.find((x) => /\bctx\b|contentieux/.test(x.norm) && CTX_CONFIRME.test(x.norm) && !CTX_NON_CONFIRME.test(x.norm));
  return p ? { confirme: true, source: 'note ' + ZONES[p.zone] + (p.date ? ' du ' + dateFr(p.date) : '') } : { confirme: false };
}

// ── CAUSES ────────────────────────────────────────────────────────────────
//  Une négation dans la phrase (« pas de problème de prix ») annule le motif.
const MOTIFS = [
  ['demenagement', /(demenag|mutation|mute\b|mutee|part (vivre|habiter|s'installer)|quitte la (region|ville|france)|nouvelle (ville|region)|s'installe a)/],
  ['sante', /(bless|sante|medic|opere|operation|chirurg|malad|enceinte|grossesse|douleur|hospital|arret maladie|tendin|entors|fractur|kine)/],
  ['impaye', /(impaye|rejet|\brib\b|banque|prelevement (refuse|rejete)|compte (bloque|cloture)|pb avec la banque|probleme bancaire)/],
  ['prix', /(\bprix\b|trop cher|\bcher\b|budget|financ|pas les moyens|argent|\bcout\b|tarif)/],
  ['temps', /(manque de temps|pas le temps|plus le temps|charge de travail|surcharge|trop de travail|debord)/],
  ['planning', /(planning|horaire|creneau|emploi du temps|disponibilit|\bdispo\b)/],
  ['motivation', /(motivation|demotiv|lassitude|lasse\b|plus envie|pas envie)/],
  ['resultats', /(resultat|pas de progres|stagn|ne perd (pas|plus)|pas maigri|pas de changement)/],
  ['coach', /(coach.{0,30}(probleme|souci|conflit|pas aime|pas apprecie|ne s'entend|changer)|(probleme|souci|conflit|changer).{0,30}coach)/],
  ['insatisfaction', /(insatisf|mecontent|pas satisfait|decu|decue|plainte|reclamation|pas content)/],
  ['frequentation', /(ne vient (plus|pas)|venait peu|peu venu|pas assez venu|frequentation|pas assidu)/],
  ['transfert', /(transfer|autre studio|autre club|changement de (club|studio))/],
];
const NEGATION = /\b(pas de|aucun|sans|plus de)\s+(probleme|souci)/;
const LIEN_DEPART = /(resili|arret|stop|ne (re)?conduit|ne renouvel|part\b|quitte|depart|fin d'abo|ne reprend|abandon|car\b|pour cause|suite a|raison|motif|a cause)/;
// Départs IRRÉCUPÉRABLES : aucune action de récupération (règle 9 du cahier).
// ⚠️ Jamais déduit du seul mot « déménagement », d'une résiliation, d'un
// contrat arrêté ou d'une absence de réponse : il faut une phrase EXPLICITE.
// Le refus de la SEULE visioconférence ne suffit pas (arbitrage du 18/09) :
// un transfert de studio reste possible — il faut refuser les deux.
const IRRECUPERABLE = /(refuse?[^.]{0,40}transfert[^.]{0,40}(et|ni)[^.]{0,20}(visio|a distance|distanciel)|refuse?[^.]{0,40}(visio|a distance|distanciel)[^.]{0,40}(et|ni)[^.]{0,20}transfert|ne veut ni[^.]{0,40}transfert[^.]{0,30}ni[^.]{0,30}(visio|distance)|ne veut ni[^.]{0,40}(visio|distance)[^.]{0,30}ni[^.]{0,30}transfert|refus (definitif|de toute (nouvelle )?proposition)|\bdeced|\bdeces\b|contre[- ]indication (definitive|medicale definitive)|interdiction medicale|\bfraude|\bexclu(s|e|sion)?\b|refus (categorique|definitif|clair|total)|ne (veut|souhaite) plus (etre (contacte|rappele)|entendre parler|aucune proposition)|ne plus (le |la |l')?(contacter|rappeler)|depart definitif|quitte definitivement)/;

function causeDes(ph, contexte) {
  const trouvees = [];
  for (const p of ph) {
    if (NEGATION.test(p.norm)) continue;
    for (const [code, re] of MOTIFS) if (re.test(p.norm)) trouvees.push({ code, p, lien: LIEN_DEPART.test(p.norm) });
  }
  // Structure Deciplus : arrêt pour impayés, fin normale d'un Challenge.
  if (!trouvees.length && contexte.raisonArret === 'UNPAID') return { code: 'impaye', certitude: 'Probable', indice: 'contrat arrêté pour impayés (Deciplus)' };
  if (!trouvees.length && contexte.finChallenge) return { code: 'fin_challenge', certitude: 'Probable', indice: 'Challenge arrivé à son terme sans nouvelle formule' };
  if (!trouvees.length) return { code: 'inconnu', certitude: 'À confirmer', indice: '' };
  const t = trouvees[0];
  const autres = new Set(trouvees.filter((x) => x.p === t.p || (x.p.date && x.p.date === t.p.date)).map((x) => x.code));
  const indice = 'note ' + ZONES[t.p.zone] + (t.p.date ? ' du ' + dateFr(t.p.date) : '');
  if (autres.size > 1) return { code: t.code, certitude: 'À confirmer', indice: indice + ' (plusieurs motifs possibles)' };
  return { code: t.code, certitude: t.lien ? 'Confirmée' : 'Probable', indice };
}

// ── CONTRATS : RÉFÉRENCE, RECONDUCTION, TOUJOURS ACTIF ─────────────────────
//  Référence = le(s) contrat(s) qui ont porté les encaissements de M-1 (échéance
//  encaissée en M-1), à défaut ceux qui couvraient M-1.
function references(contrats, ym) {
  const m1 = bornesMois(moisPrecedent(ym));
  const abos = contrats.filter((c) => !PACK(c));
  const parEch = abos.filter((c) => (c.echeances || []).some((e) => e.statut === 'E' && e.date >= m1.debut && e.date <= m1.fin));
  if (parEch.length) return parEch;
  return abos.filter((c) => c.debut && c.debut <= m1.fin && (!c.fin || c.fin >= m1.debut));
}
// Montant mensuel d'un contrat : valeur initiale ÷ durée en mois (lue dans la
// validité Deciplus, sinon dans le nom « 12 MOIS »). Inconnu = null, jamais deviné.
function mensuel(c) {
  const v = Number(c && c.valeurInitiale);
  const m = Number(c && c.validiteMois) || (/(\d{1,2})\s*mois/i.exec((c && c.produit) || '') || [])[1];
  return Number.isFinite(v) && v > 0 && Number(m) > 0 ? Math.round(v / Number(m) * 100) / 100 : null;
}
function carteUtilisable(k, aujourdHui) {
  return k && k.etat === 'ACTIVE' && (!k.fin || k.fin >= aujourdHui) && Number(k.creditRestant) > 0;
}
function suspensionsDe(c) {
  const out = (c.suspensions || []).filter((s) => s.debut).map((s) => ({ debut: s.debut, fin: s.fin || '', motifCode: s.motif || '', structuree: true }));
  if (out.length) return out;
  // Sur un contrat ARRÊTÉ, Deciplus passe les échéances restantes en « S » :
  // ce n'est pas une suspension. Les échéances S ne valent suspension que sur
  // un contrat encore actif (ou suspendu).
  if (!ACTIF(c)) return [];
  const s = (c.echeances || []).filter((e) => e.statut === 'S').map((e) => e.date).sort();
  return s.length ? [{ debut: s[0], fin: '', motifCode: '', structuree: false }] : [];
}

// Au club, « reporter / report » une échéance = la suspendre (report à la fin du contrat).
const MOT_SUSP = /(suspen|\bpause\b|\bgel\b|gele|arret temporaire|met en pause|\breport)/;
const RAISON_SUSP = /(bless|sante|medic|opere|operation|chirurg|malad|enceinte|grossesse|voyage|vacance|travail|professionn|demenag|examen|etudes|financ|perso|famil|deuil|hospital|convalesc|accident|conge|maternite|paternite|\bcar\b|pour cause|suite a|raison|motif)/;
const REPRISE_NOTE = /(reprise|reprend|jusqu'?au|retour (le|prevu)|revient (le|en)|a partir du|indetermin)/;

function analyseSuspension(c, ph, aujourdHui) {
  const liste = suspensionsDe(c);
  if (!liste.length && c.etat !== 'SUSPENDED') return null;
  const s = liste.sort((a, b) => b.debut.localeCompare(a.debut))[0] || { debut: '', fin: '', structuree: false };
  // Une note DATÉE ne justifie que la suspension dont elle est proche (au plus
  // 120 jours avant son début) : un report de 2024 n'explique pas celui de 2026.
  const pertinente = (p) => !p.date || !s.debut || p.date >= ajouterJours(s.debut, -120);
  const note = ph.find((p) => MOT_SUSP.test(p.norm) && RAISON_SUSP.test(p.norm) && pertinente(p));
  const noteReprise = ph.find((p) => MOT_SUSP.test(p.norm) && REPRISE_NOTE.test(p.norm) && pertinente(p));
  const indeterminee = !!ph.find((p) => MOT_SUSP.test(p.norm) && /indetermin/.test(p.norm) && pertinente(p));
  const repriseDate = s.fin || (noteReprise && noteReprise.date && noteReprise.date > s.debut ? noteReprise.date : '');
  const active = c.etat === 'SUSPENDED' || (s.debut && s.debut <= aujourdHui && (!s.fin || s.fin >= aujourdHui));
  const reprisEnsuite = (c.echeances || []).some((e) => (e.statut === 'E' || e.statut === 'P' || e.statut === 'T') && s.fin && e.date > s.fin);
  const terminee = !!(s.fin && s.fin < aujourdHui && !reprisEnsuite && c.etat !== 'ACTIVE');
  return {
    debut: s.debut, fin: s.fin, repriseDate, indeterminee, active, terminee, datesStructurees: s.structuree,
    raisonRenseignee: !!note, raisonSource: note ? 'note ' + ZONES[note.zone] + (note.date ? ' du ' + dateFr(note.date) : '') : '',
    montantSuspendu: Math.round((c.echeances || []).filter((e) => e.statut === 'S').reduce((n, e) => n + Number(e.montant || 0), 0) * 100) / 100,
  };
}
// Prolongation : la durée réelle doit couvrir la durée nominale (lue dans le nom
// de la prestation, « 12 MOIS ») + la suspension totale. Contrat reconductible
// (RENEWAL) ou durée inconnue : contrôle impossible, dit comme tel.
function prolongation(c) {
  const t = Number(c.suspensionTotaleJours) || 0;
  if (!t) return null;
  if ((c.historique || []).some((h) => h.type === 'RENEWAL')) return { verifiable: false, motif: 'contrat reconductible' };
  const m = /(\d{1,2})\s*mois/i.exec(c.produit || '');
  if (!m || !c.debut || !c.fin) return { verifiable: false, motif: 'durée nominale inconnue' };
  const nominal = Math.round(+m[1] * 365 / 12);
  const manque = nominal + t - jours(c.debut, c.fin);
  return { verifiable: true, manqueJours: manque > TOLERANCE_PROLONGATION ? manque : 0, suspensionJours: t };
}

// ── FINANCE ───────────────────────────────────────────────────────────────
// Justifications EXPLICITES du reste à payer — pas un « FA offert » (frais
// d'adhésion offerts à la signature), qui ne justifie aucun écart.
const JUSTIF_NOTE = [
  ['un geste commercial', /(geste commercial|(solde|reste|echeances?|mensualites?)\s+(offert|annule|abandonne)|abandon (de|du) (solde|reste|creance)|remise (du|sur le) (solde|reste))/],
  ['un accord avec le club', /(accord|valide|autorise)\w*\s+(pour|de|d')\s*(l')?(arret|resili|annul|sortie|stopper)/],
  ['un échéancier', /(echeancier|etalement|paiement en plusieurs fois)/],
  ['un avoir', /\bavoir\b/],
];
function finance(ref, { vendor, journal, ph }) {
  if (!ref || !ARRETE(ref) || PACK(ref)) return null;
  // Contrat annulé sans valeur ni paiement : saisie administrative, pas un écart.
  if (!(Number(ref.valeurInitiale) > 0) || (ref.etat === 'CANCELED' && !(Number(ref.paye) > 0))) return null;
  const raison = ((ref.historique || []).find((h) => /TERMINATED|CANCELED/.test(h.type)) || {}).raison || '';
  if (raison === 'RENEW' || raison === 'PRODUCT_CHANGE') return null;
  const arret = ref.resiliation || ((ref.historique || []).find((h) => /TERMINATED|CANCELED/.test(h.type)) || {}).date || '';
  // Seulement une résiliation AVANT la fin de l'engagement.
  if (!arret || !ref.fin || arret >= ajouterJours(ref.fin, -TOLERANCE_PROLONGATION)) return null;
  const deciplus = Number(ref.valeurInitiale);
  const f = {
    contratVendor: vendor && vendor.fiable && vendor.total != null ? Number(vendor.total) : null,
    contratDeciplus: Number.isFinite(deciplus) ? deciplus : null,
    facture: ref.valeur == null ? null : Number(ref.valeur),
    encaisse: ref.paye == null ? null : Number(ref.paye),
    journalNet: journal && journal.couvert ? Number(journal.net) : null,
    remboursements: journal && journal.couvert ? Number(journal.remboursements || 0) : null,
    avoirs: null,
    limites: ['avoirs non lisibles dans Deciplus : calcul à confirmer'],
    anomalie: '', ecart: null, justification: '', valide: false,
    // Un total Vendor ESTIMÉ (durée non confirmée par Deciplus) n'est jamais
    // présenté comme certain (public/recap2-regles.js financeItems).
    vendorEstime: !!(vendor && vendor.fiable && /estimation/.test(String(vendor.detail || ''))),
  };
  if (!journal || !journal.couvert) f.limites.push('journal des encaissements non couvert sur toute la période du contrat');
  if (f.contratVendor == null) f.limites.push(vendor && vendor.motif ? 'contrat Vendor : ' + vendor.motif : 'vente Vendor non retrouvée de façon fiable');
  if (f.contratVendor != null && f.contratDeciplus != null && Math.abs(f.contratVendor - f.contratDeciplus) >= SEUIL_ECART) {
    f.anomalie = 'divergence';
    return f;
  }
  if (f.encaisse != null && f.journalNet != null && Math.abs(f.encaisse - f.journalNet) >= SEUIL_ECART) {
    f.anomalie = 'encaisse_discordant';
    return f;
  }
  const contrat = f.contratVendor != null ? f.contratVendor : f.contratDeciplus;
  const net = f.encaisse;
  if (contrat == null || net == null) { f.limites.push('montants incomplets'); return f; }
  f.contratReference = contrat;
  f.net = net;
  f.ecart = Math.round((contrat - net) * 100) / 100;
  if (f.ecart < SEUIL_ECART) { f.ecart = f.ecart > 0 ? f.ecart : 0; return f; }
  // Justifications probables, à faire vérifier — jamais réclamées au client.
  if (raison === 'RETRACTATION') f.justification = 'la rétractation dans le délai légal';
  else { const j = JUSTIF_NOTE.find(([, re]) => ph.some((p) => re.test(p.norm))); if (j) f.justification = j[0]; }
  return f;
}

// Total du contrat signé. Le prix Vendor est HEBDOMADAIRE.
//  · jours d'engagement connus → prix × semaines ;
//  · engagement en années → prix × 52 × n ;
//  · engagement en MOIS : Vendor ne dit pas le nombre de semaines. Si la valeur
//    initiale Deciplus ÷ prix Vendor tombe sur un nombre ENTIER de semaines
//    compatible avec la durée (± 1 semaine), le montant Vendor est confirmé ;
//    sinon le total Vendor est estimé (mois × 52/12 semaines) et l'écart avec
//    Deciplus ressortira en anomalie à vérifier — jamais de choix silencieux.
function totalContratVendor(v, baseDeciplus) {
  const prix = Number(v.prix);
  if (!Number.isFinite(prix) || prix <= 0) return { fiable: false, motif: 'prix Vendor absent' };
  const f = v.formuleDet || {};
  if (!v.engagement && !f.n && !f.jours) return { fiable: true, total: prix, detail: 'forfait' };
  if (Number(f.jours) > 0) { const n = Math.round(Number(f.jours) / 7); return { fiable: true, total: Math.round(prix * n * 100) / 100, detail: prix + ' €/semaine × ' + n + ' semaines' }; }
  const an = /(\d+)\s*an/i.exec(v.engagement) || (/an/i.test(f.unite) && f.n ? [0, f.n] : null);
  if (an) return { fiable: true, total: Math.round(prix * 52 * Number(an[1]) * 100) / 100, detail: prix + ' €/semaine × ' + 52 * Number(an[1]) + ' semaines' };
  const mo = Number((/(\d+)\s*mois/i.exec(v.engagement) || [])[1]) || (/mois/i.test(f.unite) ? Number(f.n) : 0);
  if (!mo) return { fiable: false, motif: 'durée d’engagement Vendor illisible' };
  const theorique = mo * 52 / 12;
  const base = Number(baseDeciplus);
  const semaines = base > 0 ? base / prix : NaN;
  if (Number.isInteger(Math.round(semaines * 1000) / 1000) && Math.abs(semaines - theorique) <= 1.5) {
    return { fiable: true, total: Math.round(prix * semaines * 100) / 100, detail: prix + ' €/semaine × ' + Math.round(semaines) + ' semaines (durée confirmée par Deciplus)' };
  }
  return { fiable: true, total: Math.round(prix * Math.round(theorique) * 100) / 100, detail: prix + ' €/semaine × ' + Math.round(theorique) + ' semaines (estimation : ' + mo + ' mois)' };
}

// ── IDENTITÉ ──────────────────────────────────────────────────────────────
const DOUTE_IDENTITE = /(doublon|autre fiche|deux fiches|mauvaise fiche|fiche de (son|sa)|compte de (son|sa)|paye par (son|sa)|au nom de (son|sa))/;

// ── ANALYSE ───────────────────────────────────────────────────────────────
//  `mode` : 'nr' (non-reconduit) ou 'suspension' (membre suspendu hors liste).
function analyser({ ligne = {}, mois, aujourdHui, dossier, vendor = null, journal = null, mode = 'nr' }) {
  const r = { statut: 'a_traiter', contentieux: false, cause: null, irrecuperable: false, recuperationOuverte: false, indication: '', suspension: null,
    finance: null, remarques: [], eligible: null, motifExclusion: '' };
  // Les remarques (« À faire ») sont DÉDUITES des champs structurés par le
  // registre : même règle ici, à l'écran, dans les copies et à la relecture.
  const fin = (statut, extra) => {
    Object.assign(r, { statut }, extra || {});
    r.remarques = Regles.actions(Regles.evaluerNR({ analyse: r })).map((x) => x.texte);
    return r;
  };
  if (!/^[0-9]{1,20}$/.test(String(ligne.idClient || '')) || !dossier || !dossier.ok) {
    return fin('a_creuser', { indication: !ligne.idClient ? 'aucun identifiant Deciplus fiable' : 'dossier Deciplus illisible', motifExclusion: 'identité incertaine' });
  }
  const annee = +String(aujourdHui).slice(0, 4);
  const ph = phrases(dossier.notes, annee);
  const contrats = dossier.contrats || [];

  // 1. CONTENTIEUX — prioritaire sur tout, aucune remarque.
  const ctx = contentieux(dossier, ph);
  if (ctx.confirme) {
    return fin('resilie', { contentieux: true, cause: { code: 'impaye', libelle: 'Contentieux', certitude: 'Confirmée', indice: ctx.source },
      indication: 'Contentieux confirmé (' + ctx.source + ')', motifExclusion: 'contentieux' });
  }
  // 2. IDENTITÉ douteuse (doublon, paiement sur une autre fiche…).
  if (ph.some((p) => DOUTE_IDENTITE.test(p.norm))) {
    return fin('a_creuser', { indication: 'une note évoque une autre fiche ou un doublon', motifExclusion: 'identité incertaine' });
  }

  const refs = references(contrats, mois);
  const M = bornesMois(mois);
  const zoneRef = (refs[0] && refs[0].zoneId) || '';
  const actifs = contrats.filter(ACTIF).filter((c) => !PACK(c));
  const nouveaux = actifs.filter((c) => refs.indexOf(c) < 0);

  // 3a. SUSPENSION sur un contrat de référence ou actif.
  const cSusp = [...refs, ...actifs].find((c) => {
    const s = analyseSuspension(c, ph, aujourdHui);
    return s && (s.active || (s.debut && s.debut >= bornesMois(moisPrecedent(mois)).debut) || c.etat === 'SUSPENDED');
  });
  const susp = cSusp ? analyseSuspension(cSusp, ph, aujourdHui) : null;
  if (susp) {
    r.suspension = susp;
    r.suspension.prolongation = prolongation(cSusp);
    if (susp.terminee) {
      return fin('a_traiter', { indication: 'suspension terminée le ' + dateFr(susp.fin) + ' sans reprise',
        cause: { code: 'autre', libelle: 'Suspension terminée sans reprise', certitude: 'Confirmée', indice: 'dates de suspension Deciplus' } });
    }
    if (!susp.raisonRenseignee) return fin('suspendu', { indication: 'suspension sans raison renseignée', motifExclusion: 'suspension' });
    if (!susp.repriseDate && !susp.indeterminee) return fin('suspendu', { indication: 'suspension sans date de reprise', motifExclusion: 'suspension' });
    return fin('suspendu', { indication: 'suspension renseignée' + (susp.repriseDate ? ', reprise prévue le ' + dateFr(susp.repriseDate) : ', durée indéterminée'),
      motifExclusion: 'suspension' });
  }
  if (mode === 'suspension') return fin('', { indication: 'aucune suspension en cours' });

  // 3b. TOUJOURS ACTIF : le contrat de référence continue, échéances à venir.
  const toujours = refs.find((c) => c.etat === 'ACTIVE' && (c.echeances || []).some((e) => /^[TPE]$/.test(e.statut) && e.date >= M.debut && !(e.statut === 'E' && e.date <= M.fin)));
  if (toujours) {
    const proch = (toujours.echeances || []).filter((e) => /^[TP]$/.test(e.statut) && e.date >= M.debut).map((e) => e.date).sort()[0] || '';
    r.reconduction = { produit: toujours.produit || '', debut: toujours.debut || '', mensuel: mensuel(toujours) };
    const suite = !proch ? '' : proch < aujourdHui ? ', échéance du ' + dateFr(proch) + ' pas encore prélevée' : ', échéances prévues à partir du ' + dateFr(proch);
    return fin('toujours_actif', { indication: 'contrat ' + (toujours.produit || '').trim() + ' toujours actif' + suite, motifExclusion: 'toujours actif' });
  }
  // 3c. RECONDUIT AUTREMENT : nouveau contrat, changement de formule, renouvellement, transfert, carte utilisable.
  const nouveau = nouveaux.find((c) => (c.echeances || []).some((e) => /^[TPE]$/.test(e.statut)) || Number(c.paye) > 0);
  if (nouveau) {
    const transfert = zoneRef && nouveau.zoneId && nouveau.zoneId !== zoneRef;
    const changement = refs.some((c) => (c.historique || []).some((h) => h.raison === 'PRODUCT_CHANGE' || h.raison === 'RENEW'));
    r.reconduction = { produit: nouveau.produit || '', debut: nouveau.debut || '', mensuel: mensuel(nouveau) };
    return fin('reconduit_autrement', { indication: (transfert ? 'transfert vers un autre studio : ' : changement ? 'changement de formule / renouvellement : ' : 'nouveau contrat : ')
      + (nouveau.produit || '') + (nouveau.debut ? ' depuis le ' + dateFr(nouveau.debut) : ''), motifExclusion: 'reconduit autrement' });
  }
  // Carte : seulement si RÉELLEMENT utilisable (active, non expirée, crédit
  // restant). Achetée depuis le début de M-1 = nouvelle prestation (Reconduit
  // autrement) ; plus ancienne = la même prestation qui continue (Toujours actif).
  const debutM1 = bornesMois(moisPrecedent(mois)).debut;
  const carte = (dossier.cartes || []).find((k) => carteUtilisable(k, aujourdHui) && !PACK(k));
  if (carte && !(carte.debut && carte.debut >= debutM1)) {
    return fin('toujours_actif', { indication: 'prestation ' + (carte.produit || '').trim() + ' toujours utilisable : ' + carte.creditRestant + ' séance(s) restante(s) jusqu’au ' + dateFr(carte.fin), motifExclusion: 'toujours actif' });
  }
  if (carte) {
    r.reconduction = { produit: carte.produit || '', debut: carte.debut || '', mensuel: null };
    return fin('reconduit_autrement', { indication: 'nouvelle prestation ' + (carte.produit || '') + ' utilisable : ' + carte.creditRestant + ' séance(s) restante(s) jusqu’au ' + dateFr(carte.fin), motifExclusion: 'reconduit autrement' });
  }

  // 4. PERTE : cause, irrécupérable, finance, action.
  const ref = refs[0] || contrats.filter((c) => ARRETE(c) && !PACK(c)).sort((a, b) => (b.resiliation || b.fin || '').localeCompare(a.resiliation || a.fin || ''))[0] || null;
  const raisonArret = ref ? (((ref.historique || []).find((h) => /TERMINATED|CANCELED/.test(h.type)) || {}).raison || '') : '';
  const finChallenge = !!(ref && /challenge/i.test(ref.produit || '') && (ref.etat === 'EXPIRED' || (ref.resiliation && ref.fin && ref.resiliation >= ajouterJours(ref.fin, -TOLERANCE_PROLONGATION))));
  const cause = causeDes(ph, { raisonArret, finChallenge });
  r.finance = finance(ref, { vendor, journal, ph });
  // RÉTRACTATION clairement documentée (historique Deciplus) : départ confirmé,
  // cause « Rétractation confirmée », aucune action de récupération.
  if (raisonArret === 'RETRACTATION') {
    r.retractation = true;
    r.cause = { code: 'retractation', libelle: 'Rétractation confirmée', certitude: 'Confirmée', indice: 'rétractation dans les 14 jours (Deciplus)' };
    return fin('resilie', { indication: 'Rétractation confirmée — rétractation dans les 14 jours (Deciplus)', motifExclusion: 'rétractation' });
  }
  r.cause = { code: cause.code, libelle: CAUSES[cause.code], certitude: cause.certitude, indice: cause.indice };

  const irr = ph.find((p) => IRRECUPERABLE.test(p.norm));
  if (irr) {
    return fin('resilie', { irrecuperable: true, indication: 'départ irrécupérable (note ' + ZONES[irr.zone] + (irr.date ? ' du ' + dateFr(irr.date) : '') + ')',
      motifExclusion: 'départ irrécupérable' });
  }
  r.indication = 'Cause probable : ' + r.cause.libelle + ' (' + cause.certitude + ')' + (cause.indice ? ' — ' + cause.indice : '');
  // Déménagement sans refus définitif documenté : récupération ouverte, même si
  // une décision manuelle « Résilié » existe (public/recap2-regles.js).
  r.recuperationOuverte = cause.code === 'demenagement' && cause.certitude !== 'À confirmer';
  return fin(cause.code === 'transfert' ? 'a_creuser' : 'a_traiter', { motifExclusion: cause.code === 'transfert' ? 'identité incertaine' : '' });
}

// ── COHORTE DE RÉCUPÉRATION ───────────────────────────────────────────────
//  Éligible = statut automatique « À traiter » au PREMIER contrôle concluant.
//  « À creuser » : en attente (pas encore d'éligibilité). Tout le reste est
//  exclu, avec son motif conservé.
function eligibilite(analyse) {
  if (!analyse || analyse.statut === 'a_creuser') return { eligible: null, motif: 'en attente : identité à vérifier' };
  if (analyse.statut === 'a_traiter') return { eligible: true, motif: '' };
  return { eligible: false, motif: analyse.motifExclusion || analyse.statut };
}

module.exports = { STATUTS_AUTO, CAUSES, SEUIL_ECART, analyser, mensuel, totalContratVendor, eligibilite, euros, phrases, contentieux, causeDes, carteUtilisable, finance, prolongation, references };
