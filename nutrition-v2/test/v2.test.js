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

const app = require('../server');
const { getDb, nowIso } = require('../lib/db');
const { createAuth, MAX_LIENS_PAR_HEURE } = require('../lib/auth');
const CE = require('../public/coursesEngine.js');

let base;
const srv = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv.close());

async function call(p, body, tok, method) {
  const r = await fetch(base + p, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
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
