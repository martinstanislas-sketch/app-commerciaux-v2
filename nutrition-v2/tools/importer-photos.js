'use strict';
// ============================================================================
//  IMPORT DES PHOTOS DE PLATS — depuis l'app Protocole 42 vers cette app.
//
//  Pourquoi cet outil existe : les photos des recettes n'ont JAMAIS été dans le
//  code. Dans Protocole 42, elles vivent dans la base de production (ajoutées
//  une à une via le panneau admin). La nouvelle app démarre donc avec une banque
//  vide, et les cartes repas affichent leur dégradé de repli — c'est le
//  comportement prévu, pas un bug. Ce script comble la donnée manquante.
//
//  Il ne passe QUE par des routes qui existent déjà, des deux côtés :
//   - côté SOURCE (Protocole 42) : /api/recipe-photos-index et
//     /api/recipe-photo/:id sont publiques (un <img> n'envoie pas de jeton) ;
//   - côté CIBLE (cette app)     : POST /api/recipes/:id/photo, la route admin
//     normale — le script se connecte comme n'importe quel compte.
//  Aucun accès direct aux bases : rien à installer sur les serveurs, et le
//  script marche aussi bien vers un déploiement Railway que vers un local.
//
//  Usage (Node 18+, aucune dépendance) :
//
//    node tools/importer-photos.js \
//      --source https://app.stanmartinapp.cloud/nutrition \
//      --cible  https://mon-app.up.railway.app \
//      --email  admin@exemple.fr --pin 1234
//
//  `--email/--pin` : le compte ADMIN_EMAIL de la CIBLE (variable Railway).
//  `--remplacer`   : ré-importe aussi les plats qui ont déjà une photo.
//  Relançable sans risque : par défaut, un plat déjà illustré est sauté.
// ============================================================================

const args = {};
{
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--remplacer') args.remplacer = true;
    else if (a[i].startsWith('--')) args[a[i].slice(2)] = a[i + 1], i++;
  }
}

const SOURCE = String(args.source || '').replace(/\/+$/, '');
const CIBLE = String(args.cible || '').replace(/\/+$/, '');
const EMAIL = args.email || '';
const PIN = args.pin || '';

if (!SOURCE || !CIBLE || !EMAIL || !PIN) {
  console.error(`Il manque un paramètre. Usage :

  node tools/importer-photos.js --source <URL Protocole 42> --cible <URL de cette app> --email <admin> --pin <code>

  --source    ex. https://app.stanmartinapp.cloud/nutrition
  --cible     ex. https://mon-app.up.railway.app
  --email     l'email du compte ADMIN_EMAIL de la cible
  --pin       son code PIN
  --remplacer (optionnel) ré-importe aussi les plats déjà illustrés\n`);
  process.exit(1);
}

// La route admin de la cible refuse un data URL au-delà de 3 000 000 caractères
// (soit ~2,2 Mo d'image) : on saute ces photos plutôt que d'échouer dessus.
const MAX_DATA_URL = 3000000;

async function json(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

(async () => {
  // 1. Connexion admin sur la CIBLE. On vérifie le privilège tout de suite :
  //    sans lui, les 300 envois échoueraient un par un en 403.
  const login = await json(CIBLE + '/account/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, pin: PIN }),
  });
  if (!login.body || !login.body.ok) {
    console.error('Connexion refusée par la cible :', (login.body && login.body.error) || ('HTTP ' + login.status));
    process.exit(1);
  }
  if (!login.body.compte || !login.body.compte.admin) {
    console.error(`Le compte ${EMAIL} n'est pas administrateur de la cible.\n` +
      'Vérifie la variable ADMIN_EMAIL du déploiement (Railway -> Variables), puis redeploie.');
    process.exit(1);
  }
  const auth = { Authorization: 'Bearer ' + login.body.token };
  console.log('Connecté à la cible en admin :', EMAIL);

  // 2. Ce que la CIBLE connaît : son catalogue (les ids valides) et les plats
  //    déjà illustrés (sautés par défaut — le script est relançable).
  const cat = await json(CIBLE + '/api/recipes-list', { headers: auth });
  if (!cat.body || !cat.body.ok) {
    console.error('Lecture du catalogue cible impossible :', ('HTTP ' + cat.status));
    process.exit(1);
  }
  const idsCible = new Set(cat.body.recipes.map((r) => r.id));
  const dejaFait = new Set(cat.body.recipes.filter((r) => r.hasPhoto).map((r) => r.id));
  console.log(`Catalogue cible : ${idsCible.size} plats, dont ${dejaFait.size} déjà illustrés.`);

  // 3. Ce que la SOURCE possède : son index public des plats ayant une photo.
  const idx = await json(SOURCE + '/api/recipe-photos-index');
  if (!idx.body || !idx.body.ok) {
    console.error('Index photos de la source illisible :', ('HTTP ' + idx.status) +
      '\nVérifie l\'URL --source (pour Protocole 42, elle se termine par /nutrition).');
    process.exit(1);
  }
  const idsSource = Object.keys(idx.body.photos || {});
  console.log(`Source : ${idsSource.length} photos disponibles.`);

  const aFaire = idsSource.filter((id) => idsCible.has(id) && (args.remplacer || !dejaFait.has(id)));
  const horsCatalogue = idsSource.filter((id) => !idsCible.has(id)).length;
  console.log(`À importer : ${aFaire.length} photo(s)` +
    (horsCatalogue ? ` (${horsCatalogue} id(s) de la source absents du catalogue cible, ignorés)` : '') + '\n');

  // 4. Copie, EN SÉQUENTIEL : on est l'invité de deux serveurs de production,
  //    on ne les bombarde pas. ~300 photos = 2 à 3 minutes, une seule fois.
  let ok = 0, sautees = 0, echecs = 0;
  for (const id of aFaire) {
    try {
      const res = await fetch(SOURCE + '/api/recipe-photo/' + encodeURIComponent(id));
      if (!res.ok) { echecs++; console.warn(`  ✗ ${id} : source HTTP ${res.status}`); continue; }
      const mime = res.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await res.arrayBuffer());
      const dataUrl = `data:${mime};base64,` + buf.toString('base64');
      if (dataUrl.length > MAX_DATA_URL) {
        sautees++;
        console.warn(`  ~ ${id} : photo trop lourde (${Math.round(buf.length / 1024)} Ko), sautée`);
        continue;
      }
      const up = await json(CIBLE + '/api/recipes/' + encodeURIComponent(id) + '/photo', {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      if (up.body && up.body.ok) { ok++; if (ok % 25 === 0) console.log(`  … ${ok}/${aFaire.length}`); }
      else { echecs++; console.warn(`  ✗ ${id} : cible a refusé (${(up.body && up.body.error) || 'HTTP ' + up.status})`); }
    } catch (e) {
      echecs++;
      console.warn(`  ✗ ${id} : ${e.message}`);
    }
  }

  console.log(`\nTerminé : ${ok} importée(s), ${sautees} sautée(s) (trop lourdes), ${echecs} échec(s).`);
  console.log('Recharge l\'app : les cartes repas affichent les photos dès que l\'index les connaît.');
  if (echecs) process.exit(2);
})().catch((e) => { console.error('Import interrompu :', e.message); process.exit(1); });
