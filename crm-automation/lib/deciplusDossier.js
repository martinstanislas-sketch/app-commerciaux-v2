'use strict';
// ============================================================================
//  DECIPLUS — LECTURE D'UN DOSSIER CLIENT POUR LE CONTRÔLE OPÉRATIONNEL.
//
//  ⚠️ LECTURE SEULE. Uniquement des requêtes GET, chaque URL passée au
//  garde-fou lib/deciplus.js ; toute requête non-GET vers Deciplus émise par la
//  page (ex. `PATCH contracts/<id>?simulate=true`) est BLOQUÉE. Aucun clic.
//
//  Ce qui est lu, par Id Deciplus (jamais par nom) :
//   · la fiche `check.php` : contrats (JSON `subscriptionContracts` et
//     `cardContracts`) ;
//   · l'API staff : détail, historique et échéancier de chaque contrat récent ;
//   · `member/bank/<id>` : SEULEMENT « RIB présent » / « mandat présent » ;
//   · `reservations.php` : nombre de réservations FUTURES ;
//   · `presta_ventes.php` : nombre d'achats sur 12 mois.
//  Ce qui n'est JAMAIS gardé : IBAN, RUM, adresse, téléphone, email, notes.
// ============================================================================

const DEC = require('./deciplus.js');

const HOTE = 'https://ginkgo-sport.deciplus.pro/';
const API = 'https://api.deciplus.pro/staff/v1/';
const d10 = (x) => (!x || String(x).startsWith('1970')) ? '' : String(x).slice(0, 10);
const iso = (fr) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(fr || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };

// Ouvre une page Deciplus dédiée, bloque tout non-GET, capture le jeton d'API.
async function ouvrir(contexte) {
  const page = await contexte.newPage();
  let jeton = null;
  const bloques = [];
  await page.route('**/*', (r) => {
    const q = r.request();
    if (/deciplus\.pro/.test(q.url()) && q.method() !== 'GET') { bloques.push(q.method() + ' ' + q.url().split('?')[0]); return r.abort(); }
    if (!jeton && /api\.deciplus\.pro/.test(q.url()) && q.headers()['x-access-token']) {
      jeton = { 'x-access-token': q.headers()['x-access-token'], 'deciplus-client-type': q.headers()['deciplus-client-type'] || '' };
    }
    return r.continue();
  });
  await page.goto(DEC.garde(HOTE + 'nextgen/home'), { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 30 && !jeton; i++) await page.waitForTimeout(1000);
  if (/login/.test(page.url())) { await page.close(); throw new Error('session Deciplus expirée'); }
  if (!jeton) { await page.close(); throw new Error('jeton API Deciplus non capturé'); }

  const texte = (url) => page.evaluate(async (u) => { const r = await fetch(u, { credentials: 'include', method: 'GET' }); return { s: r.status, t: await r.text() }; }, DEC.garde(url));
  const api = (chemin) => page.evaluate(async ([u, h]) => {
    const r = await fetch(u, { method: 'GET', headers: Object.assign({ accept: 'application/json' }, h) });
    let j = null; try { j = await r.json(); } catch (_) { /* vide */ }
    return { s: r.status, j };
  }, [API + chemin, jeton]);

  // `aujourdHui` 'AAAA-MM-JJ', `maintenant` 'AAAA-MM-JJTHH:MM' (heure de Paris).
  async function lireDossier(idClient, { aujourdHui, maintenant }) {
    if (!/^[0-9]{1,20}$/.test(String(idClient || ''))) return { ok: false, erreur: 'identifiant Deciplus invalide' };
    const f = await texte(HOTE + 'check.php?idj=' + idClient);
    if (f.s !== 200 || !/subscriptionContracts/.test(f.t)) return { ok: false, erreur: 'fiche illisible (HTTP ' + f.s + ')' };
    const bloc = (nom) => { const m = f.t.match(new RegExp(nom + ':\\s*(\\{.*\\}|\\[.*\\])\\s*,?\\s*$', 'm')); try { return m ? JSON.parse(m[1]) : {}; } catch (_) { return null; } };
    const sc = bloc('subscriptionContracts'), cc = bloc('cardContracts');
    if (sc == null) return { ok: false, erreur: 'contrats illisibles' };
    const dossier = { ok: true, contrats: [], cartes: [] };
    const limite = new Date(Date.parse(aujourdHui) - 400 * 86400000).toISOString().slice(0, 10);
    for (const p of Object.values(sc)) {
      for (const c of p.contracts || []) {
        const k = { id: c.id, numero: c.number, produit: p.name, etat: c.state, debut: c.beginDate, fin: c.endDate, vendu: c.originalSaleDate, resiliation: c.terminationDate || '' };
        // Contrats anciens déjà finis : hors sujet (aucun appel API).
        if (iso(c.endDate) && iso(c.endDate) < limite && iso(c.originalSaleDate) < limite) continue;
        const [det, hist, sch] = [await api('contracts/' + c.id), await api('contracts/' + c.id + '/history'), await api('contracts/' + c.id + '/paymentScheduler')];
        if (det.s !== 200 || sch.s !== 200 || hist.s !== 200) return { ok: false, erreur: 'API contrat ' + c.id + ' indisponible' };
        const pd = (det.j && det.j.paymentDetails) || {};
        Object.assign(k, { valeurInitiale: pd.baseAmount, valeur: pd.revisedAmount, paye: pd.paidAmount, restantDu: pd.dueAmount, impaye: pd.unpaidAmount });
        k.historique = (Array.isArray(hist.j) ? hist.j : []).map((h) => ({ date: h.eventDate, type: h.type, raison: (h.metadata && h.metadata.reason) || '', annotation: (h.metadata && h.metadata.annotation) || '' }));
        k.echeances = (Array.isArray(sch.j) ? sch.j : []).map((x) => ({ date: x.paymentDate, montant: Number(x.price), statut: x.status, rejet: d10(x.esepaPayRejectDate), motifRejet: x.esepaRejectReason || '' }));
        dossier.contrats.push(k);
      }
    }
    dossier.cartes = Object.values(cc || {}).flatMap((p) => (p.contracts || []).map((c) => ({ numero: c.number, produit: p.name, etat: c.state, vendu: c.originalSaleDate })));
    const bk = await api('member/bank/' + idClient);
    const b = (bk.j && bk.j.response) || {};
    dossier.mandat = { rib: !!(b.iban || b.accountNumber), rum: !!b.rum };
    const rs = await texte(HOTE + 'reservations.php?idj=' + idClient + '&inner=1&datec1=' + aujourdHui);
    const h = rs.t.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<select[\s\S]*?<\/select>/gi, '');
    if (rs.s !== 200) return { ok: false, erreur: 'réservations illisibles' };
    dossier.reservationsFutures = [...h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()))
      .filter((c) => c.length >= 12 && /\d{2}\/\d{2}\/\d{4}/.test(c[0]))
      .filter((c) => { const hm = /(\d{1,2})h(\d{2})/.exec(c[1]) || [0, '00', '00']; return iso(c[0]) + 'T' + String(hm[1]).padStart(2, '0') + ':' + hm[2] > maintenant; }).length;
    const debut = new Date(Date.parse(aujourdHui) - 365 * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/');
    const vt = await texte(HOTE + 'presta_ventes.php?idj=' + idClient + '&inner=1&datec1=' + debut);
    const nb = /Total \( ?(\d+) ventes? ?\)/.exec(vt.t);
    dossier.ventesDeciplus = nb ? Number(nb[1]) : null;
    return dossier;
  }

  return { lireDossier, bloques, fermer: () => page.close().catch(() => {}) };
}

module.exports = { ouvrir };
