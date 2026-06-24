#!/usr/bin/env node
// fetch-photos.js
// Telecharge UNE photo par recette dans public/images/recipes/<id>.jpg,
// depuis Pexels OU Unsplash (banques gratuites). A lancer UNE seule fois :
// l'app reste 100% hors-ligne ensuite (les images sont stockees en local).
//
// Usage :
//   PEXELS_API_KEY=xxxxx node tools/fetch-photos.js
//   ou
//   UNSPLASH_ACCESS_KEY=xxxxx node tools/fetch-photos.js
//
// Options :
//   --force   re-telecharge meme si le fichier existe deja
//   --limit N ne traite que les N premieres recettes (pour tester)
//
// Cles gratuites : https://www.pexels.com/api/  |  https://unsplash.com/developers

const fs = require('fs');
const path = require('path');
const { RECIPES } = require('../lib/recipes');

const OUT_DIR = path.join(__dirname, '..', 'public', 'images', 'recipes');
const FORCE = process.argv.includes('--force');
const limArg = process.argv.indexOf('--limit');
const LIMIT = limArg > -1 ? Number(process.argv[limArg + 1]) : Infinity;

const PEXELS = process.env.PEXELS_API_KEY;
const UNSPLASH = process.env.UNSPLASH_ACCESS_KEY;

if (!PEXELS && !UNSPLASH) {
  console.error('\n  Aucune cle API trouvee.\n');
  console.error('  Pexels   : PEXELS_API_KEY=xxxx node tools/fetch-photos.js');
  console.error('  Unsplash : UNSPLASH_ACCESS_KEY=xxxx node tools/fetch-photos.js\n');
  console.error('  Obtenir une cle gratuite :');
  console.error('   - https://www.pexels.com/api/');
  console.error('   - https://unsplash.com/developers\n');
  process.exit(1);
}
const PROVIDER = PEXELS ? 'pexels' : 'unsplash';

// Petit dictionnaire FR -> EN pour de meilleurs resultats de recherche.
const FR_EN = {
  poulet: 'chicken', boeuf: 'beef', dinde: 'turkey', saumon: 'salmon', thon: 'tuna',
  cabillaud: 'cod', colin: 'pollock', truite: 'trout', crevette: 'shrimp', crevettes: 'shrimp',
  gambas: 'prawns', sardine: 'sardines', sardines: 'sardines', oeuf: 'egg', oeufs: 'eggs',
  tofu: 'tofu', 'pois chiche': 'chickpea', 'pois chiches': 'chickpeas', lentille: 'lentil',
  lentilles: 'lentils', haricot: 'beans', 'haricot rouge': 'kidney beans', riz: 'rice',
  pates: 'pasta', quinoa: 'quinoa', semoule: 'couscous', patate: 'potato', 'patate douce': 'sweet potato',
  'pomme de terre': 'potato', courgette: 'zucchini', poivron: 'bell pepper', brocoli: 'broccoli',
  tomate: 'tomato', avocat: 'avocado', banane: 'banana', pomme: 'apple', 'fruits rouges': 'berries',
  yaourt: 'yogurt', skyr: 'skyr yogurt', fromage: 'cheese', 'fromage blanc': 'cottage cheese',
  avoine: 'oatmeal', flocons: 'oatmeal', granola: 'granola', pain: 'bread', tartine: 'toast',
  toast: 'toast', smoothie: 'smoothie', pancake: 'pancakes', crepe: 'crepes', gaufre: 'waffles',
  chia: 'chia pudding', porridge: 'porridge', muffin: 'muffin', soupe: 'soup', salade: 'salad',
  wrap: 'wrap', burrito: 'burrito', tacos: 'tacos', curry: 'curry', risotto: 'risotto',
  omelette: 'omelette', lasagne: 'lasagna', falafel: 'falafel', houmous: 'hummus', soja: 'soy',
  champignon: 'mushroom', noix: 'nuts', amande: 'almonds', chocolat: 'chocolate', miel: 'honey',
  miso: 'miso', edamame: 'edamame', coco: 'coconut',
};

// Construit une requete EN appetissante a partir des mots-cles de la recette.
function buildQuery(r) {
  const seen = new Set();
  const terms = [];
  for (const m of r.motsCles || []) {
    const en = FR_EN[m.toLowerCase()];
    if (en && !seen.has(en)) { seen.add(en); terms.push(en); }
    if (terms.length >= 3) break;
  }
  if (!terms.length) terms.push('healthy meal');
  return terms.join(' ') + ' food';
}

function getJSON(url, headers) {
  return fetch(url, { headers }).then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
}

async function searchPhoto(query) {
  if (PROVIDER === 'pexels') {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const data = await getJSON(url, { Authorization: PEXELS });
    const p = data.photos && data.photos[0];
    return p ? p.src.large : null;
  }
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&content_filter=high`;
  const data = await getJSON(url, { Authorization: 'Client-ID ' + UNSPLASH });
  const p = data.results && data.results[0];
  return p ? p.urls.regular : null;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('download HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const list = RECIPES.slice(0, LIMIT);
  console.log(`\n  Provider : ${PROVIDER} | ${list.length} recette(s)\n`);
  let ok = 0, skip = 0, fail = 0;
  for (const r of list) {
    const dest = path.join(OUT_DIR, r.id + '.jpg');
    if (!FORCE && fs.existsSync(dest)) { skip++; continue; }
    const query = buildQuery(r);
    try {
      const photoUrl = await searchPhoto(query);
      if (!photoUrl) { console.log(`  - ${r.id} : aucun resultat ("${query}")`); fail++; continue; }
      await download(photoUrl, dest);
      ok++;
      console.log(`  ok ${r.id}  <- "${query}"`);
    } catch (e) {
      fail++;
      console.log(`  ! ${r.id} : ${e.message}`);
      if (/HTTP 429/.test(e.message)) { console.log('  (limite atteinte, pause 60s...)'); await sleep(60000); }
    }
    await sleep(400); // respecte les quotas
  }
  console.log(`\n  Termine : ${ok} telechargees, ${skip} deja presentes, ${fail} echecs.`);
  console.log('  Les photos sont dans public/images/recipes/ et s affichent automatiquement.\n');
})();
