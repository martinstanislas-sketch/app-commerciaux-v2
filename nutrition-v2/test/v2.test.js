'use strict';
// Tests de la v2 : lien magique (création, usage unique, expiration, anti-abus)
// et parcours API complet (plan -> remplacement d'un repas -> sauvegarde -> reconnexion).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NUTRITION_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nv2-')), 't.sqlite');
delete process.env.SMTP_HOST;
process.env.NODE_ENV = 'test';
process.env.COMPTES = 'on';

const app = require('../server');
const { getDb, nowIso } = require('../lib/db');
const { createAuth, MAX_LIENS_PAR_HEURE } = require('../lib/auth');
const CE = require('../public/coursesEngine.js');

let base;
const srv = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv.close());

// Par défaut, les appels portent le code studio de Wasquehal (studio = null : aucun code).
async function call(p, body, tok, method, studio = 'mcwasquehal', ip) {
  const r = await fetch(base + p, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(studio ? { 'X-Studio-Code': studio } : {}), ...(ip ? { 'X-Forwarded-For': ip } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const tokenDuLien = (lien) => new URL(lien).searchParams.get('lien');

const profil = { objectif: 'perte', sexe: 'femme', age: 34, taille_cm: 165, poids_kg: 68, activite: 'leger', jours: 7, mangeMatin: true, collations: ['apres-midi'] };
const preferences = { cuisines: ['mediterraneenne'], allergies: ['lactose', 'arachide'], regime: ['vegetarien'], budget: 'normal', temps_max: 45, matinGout: 'sucre', aimes: [], deteste: ['champignon'] };

test('lien magique : usage unique, puis session valide', async () => {
  const r = await call('/account/request-link', { email: 'Test@Exemple.fr', page: base + '/' });
  assert.equal(r.status, 200);
  assert.ok(r.data.lienDev, 'en dev, le lien est rendu');
  const t = tokenDuLien(r.data.lienDev);
  const v = await call('/account/verify', { token: t });
  assert.equal(v.status, 200);
  assert.equal(v.data.compte.email, 'test@exemple.fr');
  const again = await call('/account/verify', { token: t });
  assert.equal(again.status, 400, 'un lien ne sert qu\'une fois');
  const me = await call('/account/me', null, v.data.token);
  assert.equal(me.status, 200);
});

test('lien magique : e-mail invalide, expiration, anti-abus, jeton non stocké en clair', () => {
  const auth = createAuth({ getDb, nowIso });
  assert.equal(auth.demanderLien('pas-un-mail').ok, false);
  const a1 = auth.demanderLien('renvoi@exemple.fr'); const a2 = auth.demanderLien('renvoi@exemple.fr');
  assert.equal(auth.consommerLien(a1.token).ok, false, 'l\'ancien lien est annulé par le renvoi');
  assert.equal(auth.consommerLien(a2.token).ok, true, 'le dernier lien fonctionne');
  const t0 = Date.now();
  const l = auth.demanderLien('expire@exemple.fr', t0);
  assert.equal(getDb().prepare('SELECT COUNT(*) n FROM magic_links WHERE token_hash = ?').get(l.token).n, 0);
  assert.equal(auth.consommerLien(l.token, t0 + 16 * 60e3).ok, false, 'expiré après 15 min');
  for (let i = 1; i < MAX_LIENS_PAR_HEURE; i++) assert.ok(auth.demanderLien('expire@exemple.fr', t0).ok);
  assert.equal(auth.demanderLien('expire@exemple.fr', t0).status, 429);
});

test('parcours complet : plan compatible, remplacement, sauvegarde, reconnexion', async () => {
  const plan = await call('/api/plan', { profil, preferences, seed: 7 });
  assert.equal(plan.status, 200);
  const p = plan.data.plan;
  assert.equal(p.jours.length, 7);
  assert.ok(p.besoins.kcalCible >= 1200);
  const recettes = p.jours.flatMap((j) => j.repas.map((r) => r.recette)).filter(Boolean);
  assert.ok(recettes.length >= 20);
  const { RECIPES } = require('../lib/recipes-v2');
  const { allergenesEffectifs } = require('../lib/planGenerator');
  for (const r of recettes) {
    const src = RECIPES.find((x) => x.id === r.id);
    assert.ok(src.regime.includes('vegetarien'), r.nom + ' doit être végétarien');
    const a = allergenesEffectifs(src);
    assert.ok(!a.has('lactose') && !a.has('arachide'), r.nom + ' contient un allergène');
  }
  const repas = p.jours[0].repas[1];
  const m = await call('/api/meal', { profil, preferences, creneau: repas.creneau, kcalCible: repas.kcalCible, exclureId: repas.recette.id, exclus: recettes.map((r) => r.id), seed: 3 });
  assert.equal(m.status, 200);
  assert.notEqual(m.data.recette.id, repas.recette.id);

  const liste = CE.construireListe(p, 2);
  assert.ok(liste.frais.length > 5, 'liste de courses non vide');

  const l1 = await call('/account/request-link', { email: 'client@exemple.fr' });
  const s1 = await call('/account/verify', { token: tokenDuLien(l1.data.lienDev) });
  const sv = await call('/account/save', { profil, preferences, plan: p, prenom: 'Julie' }, s1.data.token);
  assert.equal(sv.status, 200);
  const l2 = await call('/account/request-link', { email: 'client@exemple.fr' });
  const s2 = await call('/account/verify', { token: tokenDuLien(l2.data.lienDev) });
  assert.equal(s2.data.compte.prenom, 'Julie');
  assert.equal(s2.data.compte.plan.jours.length, 7, 'le plan revient sur un autre appareil');

  const del = await call('/account', null, s2.data.token, 'DELETE');
  assert.equal(del.status, 200);
  assert.equal((await call('/account/me', null, s2.data.token)).status, 401);
});

test('routes protégées sans session', async () => {
  assert.equal((await call('/account/save', { prenom: 'x' })).status, 401);
  assert.equal((await call('/api/nimporte')).status, 404);
});

test('plan : la répartition P/G/L suit la cible (lipides à ±15 % en moyenne)', () => {
  const { genererPlanDemo } = require('../lib/planGenerator');
  let ecartL = 0, ecartG = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const p = genererPlanDemo({ objectif: 'perte', sexe: 'femme', age: 34, taille_cm: 165, poids_kg: 68, activite: 'leger', jours: 7, mangeMatin: true, collations: ['apres-midi'] }, { budget: 'normal', temps_max: 45 }, seed * 101);
    for (const j of p.jours) {
      const t = j.repas.reduce((a, r) => ({ l: a.l + (r.recette ? r.recette.lipides : 0), g: a.g + (r.recette ? r.recette.glucides : 0) }), { l: 0, g: 0 });
      ecartL += Math.abs(t.l - p.besoins.macros.lipides) / p.besoins.macros.lipides;
      ecartG += Math.abs(t.g - p.besoins.macros.glucides) / p.besoins.macros.glucides;
      n++;
    }
  }
  assert.ok(ecartL / n < 0.15, 'écart lipides moyen ' + (ecartL / n));
  assert.ok(ecartG / n < 0.15, 'écart glucides moyen ' + (ecartG / n));
});

// --- Code d'accès studio ---------------------------------------------------------
test('code studio : majuscules, espaces et accents ignorés ; code inconnu refusé', async () => {
  const { trouverStudio, STUDIOS } = require('../lib/studios');
  assert.equal(STUDIOS.length, 12);
  assert.equal(new Set(STUDIOS.map((s) => s.code)).size, 12, 'codes uniques');
  assert.deepEqual(trouverStudio('mcwasquehal'), { id: 'wasquehal', nom: 'Wasquehal' });
  assert.equal(trouverStudio('  MC Wasquehal ').nom, 'Wasquehal');
  assert.equal(trouverStudio('MCVEIGNÉ').nom, 'Veigné');
  assert.equal(trouverStudio('mcparis 15').nom, 'Paris 15');
  assert.equal(trouverStudio('wasquehal'), null);
  assert.equal(trouverStudio(''), null);

  const ok = await call('/api/studio/verify', { code: ' MCMarcq ' }, null, null, null, '10.0.0.1');
  assert.equal(ok.status, 200);
  assert.equal(ok.data.studio.nom, 'Marcq-en-Barœul');
  assert.equal(ok.data.code, 'mcmarcq', 'code normalisé renvoyé');
  assert.ok(!JSON.stringify(ok.data).includes('mcwasquehal'), 'la liste des codes ne sort pas');
  const ko = await call('/api/studio/verify', { code: 'mcinconnu' }, null, null, null, '10.0.0.2');
  assert.equal(ko.status, 401);
  assert.equal(ko.data.studioInvalide, true);
});

test('code studio : blocage après 10 codes faux, sans gêner les autres adresses', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await call('/api/studio/verify', { code: 'faux' + i }, null, null, null, '10.0.0.9')).status, 401);
  const bloque = await call('/api/studio/verify', { code: 'mcnice' }, null, null, null, '10.0.0.9');
  assert.equal(bloque.status, 429, 'même un bon code est refusé pendant le blocage');
  assert.equal((await call('/api/studio/verify', { code: 'mcnice' }, null, null, null, '10.0.0.10')).status, 200);
  const { createLimiteur } = require('../lib/studios');
  const l = createLimiteur({ max: 2, fenetreMs: 1000 });
  l.echec('a', 0); l.echec('a', 10);
  assert.equal(l.bloque('a', 20), true);
  assert.equal(l.bloque('a', 2000), false, 'débloqué après la fenêtre');
});

test('code studio : plan, besoins et changement de repas exigent un code valide', async () => {
  for (const [p, b] of [['/api/plan', { profil, preferences }], ['/api/needs', profil], ['/api/meal', { profil, preferences, creneau: 'diner', kcalCible: 500 }]]) {
    const sans = await call(p, b, null, null, null, '10.0.1.1');
    assert.equal(sans.status, 401, p + ' sans code');
    assert.equal(sans.data.studioInvalide, true);
    assert.equal((await call(p, b, null, null, 'mcfaux', '10.0.1.2')).status, 401, p + ' code faux');
    assert.equal((await call(p, b, null, null, 'MC Caen', '10.0.1.3')).status, 200, p + ' code valide');
  }
  assert.equal((await call('/api/status', null, null, null, null)).status, 200, 'statut public');
  assert.equal((await call('/api/recipe-photos-index', null, null, null, null)).status, 200, 'photos publiques');
});
