'use strict';
/* ============================================================================
   My Coach Nutrition v2 — onglet « Perf » (suivi de progression).
   Chargé AVANT app.js : les fonctions d'app.js (ms, esc, fmt, toast, go…) ne
   sont utilisées qu'à l'exécution, une fois toute l'application chargée.

   Données, enregistrées sur l'appareil uniquement :
   - mesures et objectif : localStorage « nv2.perf »
       { objectif: 72, mesures: [{ date: 'AAAA-MM-JJ', poids, tourTaille, hanches, cuisses, bras }] }
   - photos : IndexedDB « nv2-perf », magasin « photos »
       { id: 'AAAA-MM-JJ-face', date, vue: 'face'|'profil'|'dos', blob }

   Ajouter un indicateur de mensuration : une ligne dans PERF_MESURES ci-dessous
   (clé enregistrée, libellé de la carte, libellé du formulaire, unité, bornes).
   Il apparaît alors dans le formulaire « Ajouter une mesure » et dans les cartes.
   ========================================================================== */

const LS_PERF = 'nv2.perf';
const PERF_MESURES = [
  { k: 'tourTaille', t: 'Taille', champ: 'Tour de taille', u: 'cm', min: 40, max: 200 },
  { k: 'hanches', t: 'Hanches', champ: 'Tour de hanches', u: 'cm', min: 50, max: 200 },
  { k: 'cuisses', t: 'Cuisses', champ: 'Tour de cuisses', u: 'cm', min: 25, max: 120 },
  { k: 'bras', t: 'Bras', champ: 'Tour de bras', u: 'cm', min: 15, max: 70 },
];
const PERF_VUES = [{ v: 'face', t: 'Face' }, { v: 'profil', t: 'Profil' }, { v: 'dos', t: 'Dos' }];
const PERF_RYTHME_JOURS = 7; // prochaine mise à jour recommandée

let P = (() => { try { return JSON.parse(localStorage.getItem(LS_PERF)) || {}; } catch (_) { return {}; } })();
P.mesures = Array.isArray(P.mesures) ? P.mesures : [];
let perfVue = 'face';
let perfUrls = [];

function perfSave() { try { localStorage.setItem(LS_PERF, JSON.stringify(P)); } catch (_) { toast('Enregistrement impossible sur cet appareil.'); } }
function jourISO(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
function dateDe(iso) { const [a, m, j] = String(iso).split('-').map(Number); return new Date(a, m - 1, j, 12); }
const jjmm = (iso) => dateDe(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const jjmmaaaa = (iso) => dateDe(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const kg = (n) => (Math.round(Number(n) * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const nombreFr = (v) => { const n = Number(String(v || '').replace(',', '.').trim()); return String(v || '').trim() && Number.isFinite(n) ? n : null; };
const signe = (n, u) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${kg(Math.abs(n))} ${u}`;
function mesuresTriees() { return [...P.mesures].sort((a, b) => a.date.localeCompare(b.date)); }

// Premier passage : le poids saisi dans le questionnaire devient le point de départ.
function perfDepartAuto() {
  if (P.mesures.length || !S.profil || !Number(S.profil.poids_kg)) return;
  P.mesures.push({ date: jourISO(S.planCreeLe || Date.now()), poids: Number(S.profil.poids_kg) });
  perfSave();
}

// --- Photos (IndexedDB) ---------------------------------------------------------
function perfDb() {
  return new Promise((ok, ko) => {
    if (!window.indexedDB) return ko(new Error('Stockage des photos indisponible sur cet appareil.'));
    const r = indexedDB.open('nv2-perf', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error || new Error('Stockage des photos indisponible.'));
  });
}
async function perfPhotos() {
  try {
    const db = await perfDb();
    return await new Promise((ok, ko) => { const q = db.transaction('photos').objectStore('photos').getAll(); q.onsuccess = () => ok(q.result || []); q.onerror = () => ko(q.error); });
  } catch (_) { return []; }
}
async function perfPhotosEnregistrer(recs) {
  const db = await perfDb();
  await new Promise((ok, ko) => { const t = db.transaction('photos', 'readwrite'); recs.forEach((r) => t.objectStore('photos').put(r)); t.oncomplete = ok; t.onerror = () => ko(t.error); });
}
async function perfEffacerTout() {
  P = { mesures: [] }; try { localStorage.removeItem(LS_PERF); } catch (_) { /* rien */ }
  try { const db = await perfDb(); db.transaction('photos', 'readwrite').objectStore('photos').clear(); } catch (_) { /* rien */ }
}
// Réduit la photo (1200 px max, JPEG) pour qu'elle reste légère sur le téléphone.
function perfReduire(fichier) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? ok(b) : ko(new Error('Photo illisible.'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Ce fichier n\'est pas une photo lisible.')); };
    img.src = url;
  });
}

// --- Courbe ---------------------------------------------------------------------
function perfCourbe(ms_) {
  if (ms_.length < 2) return `<div class="perf-vide">${ms('show_chart')}<p>Ta courbe apparaîtra dès ta 2<sup>e</sup> mesure.</p></div>`;
  const W = 340, H = 168, g = 36, d = 10, h = 12, b = 26;
  const t = ms_.map((m) => dateDe(m.date).getTime());
  const vals = ms_.map((m) => m.poids);
  const obj = Number(P.objectif) || null;
  let lo = Math.min(...vals, ...(obj ? [obj] : [])), hi = Math.max(...vals, ...(obj ? [obj] : []));
  const marge = Math.max(0.5, (hi - lo) * 0.12); lo -= marge; hi += marge;
  const x = (v) => g + ((v - t[0]) / Math.max(1, t[t.length - 1] - t[0])) * (W - g - d);
  const y = (v) => h + (1 - (v - lo) / (hi - lo)) * (H - h - b);
  const pts = ms_.map((m, i) => [x(t[i]), y(m.poids)]);
  const ligne = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const aire = `${ligne} L${pts[pts.length - 1][0].toFixed(1)} ${H - b} L${pts[0][0].toFixed(1)} ${H - b} Z`;
  const idxX = ms_.length > 2 ? [0, Math.floor((ms_.length - 1) / 2), ms_.length - 1] : [0, ms_.length - 1];
  const grille = [hi - marge, lo + marge].map((v) => `<line x1="${g}" x2="${W - d}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="pc-grid"/><text x="${g - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="pc-lbl">${kg(v)}</text>`).join('');
  const objLigne = obj ? `<line x1="${g}" x2="${W - d}" y1="${y(obj).toFixed(1)}" y2="${y(obj).toFixed(1)}" class="pc-obj"/><text x="${W - d}" y="${(y(obj) - 5).toFixed(1)}" text-anchor="end" class="pc-objlbl">Objectif ${kg(obj)} kg</text>` : '';
  const der = pts[pts.length - 1];
  return `<svg class="perf-courbe" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du poids de ${kg(vals[0])} kg à ${kg(vals[vals.length - 1])} kg">
    <defs><linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f52ba" stop-opacity=".18"/><stop offset="1" stop-color="#0f52ba" stop-opacity="0"/></linearGradient></defs>
    ${grille}${objLigne}
    <path d="${aire}" fill="url(#pcg)"/><path d="${ligne}" class="pc-line"/>
    ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3}" class="${i === pts.length - 1 ? 'pc-last' : 'pc-pt'}"/>`).join('')}
    <text x="${der[0].toFixed(1)}" y="${(der[1] - 10).toFixed(1)}" text-anchor="end" class="pc-val">${kg(vals[vals.length - 1])} kg</text>
    ${idxX.map((i) => `<text x="${pts[i][0].toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === ms_.length - 1 ? 'end' : 'middle'}" class="pc-lbl">${jjmm(ms_[i].date)}</text>`).join('')}
  </svg>`;
}

// --- Écran ------------------------------------------------------------------------
async function ecranPerf() {
  perfDepartAuto();
  const ms_ = mesuresTriees();
  const avecPoids = ms_.filter((m) => Number(m.poids));
  const dep = avecPoids[0], act = avecPoids[avecPoids.length - 1];
  const obj = Number(P.objectif) || null;
  const delta = dep && act ? act.poids - dep.poids : 0;
  const versObj = obj && dep ? Math.sign(obj - dep.poids) : -1;
  const bonSens = delta !== 0 && Math.sign(delta) === versObj;
  const pct = obj && dep && act && dep.poids !== obj ? Math.max(0, Math.min(100, Math.round(((dep.poids - act.poids) / (dep.poids - obj)) * 100))) : 0;
  const dernier = ms_[ms_.length - 1];
  const jours = dernier ? Math.round((dateDe(jourISO(Date.now())) - dateDe(dernier.date)) / 864e5) : 0;
  const reste = PERF_RYTHME_JOURS - jours;

  const carteMesure = (c) => {
    const avec = ms_.filter((m) => Number(m[c.k]));
    const v = avec[avec.length - 1];
    const dlt = avec.length > 1 ? v[c.k] - avec[0][c.k] : null;
    return `<div class="card perf-mes"><small>${c.t}</small>${v ? `<b>${kg(v[c.k])} <span>${c.u}</span></b>` : '<b class="na">—</b>'}
      <span class="perf-delta${dlt ? (dlt < 0 ? ' down' : ' up') : ''}">${dlt == null ? (v ? 'Première mesure' : 'Pas encore mesuré') : signe(dlt, c.u)}</span></div>`;
  };

  app.innerHTML = `
  <section class="screen with-nav perf-screen">
    ${barreHaut('Perf')}
    <h1 class="h1">Ma progression</h1>
    <p class="lead">${dep ? `Ton suivi depuis le ${esc(jjmmaaaa(dep.date))}.` : 'Ajoute ta première mesure pour lancer ton suivi.'}</p>
    <div class="dk dk-cols"><div class="dk dk-side">
    <div class="hero-card perf-hero">
      <div class="perf-kpis">
        <div class="perf-now"><small>Poids actuel</small><b>${act ? kg(act.poids) : '—'}<span> kg</span></b></div>
        <button class="perf-obj" id="setObj"><small>Objectif ${ms('edit', 'pen')}</small><b>${obj ? kg(obj) + '<span> kg</span>' : '<em>Définir</em>'}</b></button>
      </div>
      ${dep && act ? `<div class="perf-prog${bonSens ? ' ok' : ''}">${ms(delta < 0 ? 'trending_down' : delta > 0 ? 'trending_up' : 'trending_flat')}<b>${delta === 0 ? 'Stable' : signe(delta, 'kg')}</b><span>depuis le début</span></div>` : ''}
      ${obj && dep ? `<div class="perf-gauge"><div class="bar big${pct >= 100 ? ' ok' : ''}"><i style="width:${pct}%"></i></div>
        <div class="perf-gl"><span>Départ ${kg(dep.poids)} kg</span><b>${pct} %</b><span>Objectif ${kg(obj)} kg</span></div></div>`
        : `<p class="perf-hint">${dep ? 'Fixe ton objectif pour voir ta jauge de progression.' : ''}</p>`}
    </div>
    <button class="btn btn-primary btn-block perf-add" id="addMes">${ms('add')}Ajouter une mesure</button>
    </div><div class="dk dk-main">
    <div class="card perf-card"><div class="perf-head"><h2 class="h3">Évolution du poids</h2><span class="muted small">${avecPoids.length} mesure${avecPoids.length > 1 ? 's' : ''}</span></div>
      ${perfCourbe(avecPoids)}</div>
    <h2 class="h2 perf-sec">Mes mensurations</h2>
    <div class="perf-grid">${PERF_MESURES.map(carteMesure).join('')}</div>
    <h2 class="h2 perf-sec">Mes photos</h2>
    <div class="card perf-card" id="perfPhotos"><div class="perf-vide">${ms('photo_camera')}<p>Chargement…</p></div></div>
    <div class="card perf-bilan">
      <div class="ic">${ms('event_available')}</div>
      <div class="txt"><small>Dernier bilan</small><b>${dernier ? esc(jjmmaaaa(dernier.date)) : 'Aucun pour l\'instant'}</b>
        ${dernier && Number(dernier.poids) ? `<span>Poids : ${kg(dernier.poids)} kg</span>` : ''}</div>
      ${dernier ? `<div class="next${reste <= 0 ? ' due' : ''}"><small>Prochaine mise à jour</small><b>${reste <= 0 ? 'Aujourd\'hui' : `dans ${reste} jour${reste > 1 ? 's' : ''}`}</b></div>` : ''}
    </div>
    </div></div>
  </section>`;

  document.getElementById('addMes').onclick = () => perfFormMesure();
  document.getElementById('setObj').onclick = () => perfFormObjectif();
  perfRendrePhotos();
}

async function perfRendrePhotos() {
  const zone = document.getElementById('perfPhotos'); if (!zone) return;
  const toutes = await perfPhotos();
  perfUrls.forEach((u) => URL.revokeObjectURL(u)); perfUrls = [];
  const dates = [...new Set(toutes.map((p) => p.date))].sort();
  const trouve = (date) => toutes.find((p) => p.date === date && p.vue === perfVue);
  const avecVue = dates.filter((dt) => trouve(dt));
  const dep = avecVue[0], auj = avecVue.length > 1 ? avecVue[avecVue.length - 1] : null;
  const img = (date, lbl) => {
    if (!date) return `<div class="perf-ph vide"><span>${ms('add_a_photo')}</span><small>${lbl}</small><em>${dep ? 'Ajoute une nouvelle série pour comparer' : 'Pas encore de photo'}</em></div>`;
    const u = URL.createObjectURL(trouve(date).blob); perfUrls.push(u);
    return `<button class="perf-ph" data-zoom="${u}" data-date="${date}"><img src="${u}" alt="Photo ${perfVue} du ${jjmmaaaa(date)}" /><small>${lbl}</small><em>${jjmmaaaa(date)}</em></button>`;
  };
  zone.innerHTML = `
    <div class="chip-grid perf-vues">${PERF_VUES.map((v) => `<button class="chip${v.v === perfVue ? ' on' : ''}" data-vue="${v.v}">${v.t}</button>`).join('')}</div>
    <div class="perf-compare">${img(dep, 'Départ')}${img(auj, 'Aujourd\'hui')}</div>
    <button class="btn btn-soft btn-block perf-addph" id="addPh">${ms('add_a_photo')}Ajouter des photos</button>
    <p class="perf-prive">${ms('lock')}Tes photos restent sur ce téléphone, elles ne sont envoyées nulle part.</p>`;
  zone.querySelectorAll('[data-vue]').forEach((b) => (b.onclick = () => { perfVue = b.dataset.vue; perfRendrePhotos(); }));
  zone.querySelectorAll('[data-zoom]').forEach((b) => (b.onclick = () => perfZoom(b.dataset.zoom, b.dataset.date)));
  document.getElementById('addPh').onclick = perfFormPhotos;
}

// --- Fenêtres ---------------------------------------------------------------------
function perfFenetre(html, onSubmit) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<form class="sheet sheet-confirm perf-sheet" novalidate><div class="grab"></div>${html}
    <p class="form-error" id="perr" hidden></p>
    <button class="btn btn-primary btn-block" type="submit" style="margin-top:18px">Enregistrer</button>
    <button class="btn btn-soft btn-block" type="button" style="margin-top:10px" data-close>Annuler</button></form>`;
  const fermer = () => { back.remove(); document.body.style.overflow = ''; };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) fermer(); });
  const f = back.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('#perr'); err.hidden = true;
    try { if ((await onSubmit(f)) !== false) fermer(); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  document.body.style.overflow = 'hidden';
  document.body.appendChild(back);
  return f;
}

function perfChamp(name, label, unit, val) {
  return `<div class="measure"><label for="pm-${name}">${label}</label><div class="val"><input id="pm-${name}" name="${name}" inputmode="decimal" autocomplete="off" placeholder="—" value="${val == null ? '' : String(val).replace('.', ',')}" /><span class="unit">${unit}</span></div></div>`;
}

function perfFormMesure() {
  const dern = mesuresTriees().slice(-1)[0] || {};
  const f = perfFenetre(`<h2 class="h2">Nouvelle mesure</h2>
    <p class="lead">Seul le poids est obligatoire.</p>
    <div class="section-title">Date</div>
    <div class="input-wrap">${ms('calendar_today')}<input type="date" name="date" id="pm-date" value="${jourISO(Date.now())}" max="${jourISO(Date.now())}" /></div>
    <div class="section-title">Poids</div>
    <div class="measures perf-m1">${perfChamp('poids', 'Poids', 'kg', '')}</div>
    <div class="section-title">Mensurations <small>Facultatif</small></div>
    <div class="measures perf-m2">${PERF_MESURES.map((c) => perfChamp(c.k, c.champ, c.u, '')).join('')}</div>
    ${dern.poids ? `<p class="section-help" style="margin-top:10px">Dernière mesure : ${kg(dern.poids)} kg le ${jjmmaaaa(dern.date)}.</p>` : ''}`, (form) => {
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > jourISO(Date.now())) throw new Error('Choisis une date valide (pas dans le futur).');
    const poids = nombreFr(fd.get('poids'));
    if (poids == null || poids < 30 || poids > 300) { form.querySelector('#pm-poids').closest('.measure').classList.add('err'); throw new Error('Indique ton poids en kg (entre 30 et 300).'); }
    const m = { date, poids: Math.round(poids * 10) / 10 };
    for (const c of PERF_MESURES) {
      const v = nombreFr(fd.get(c.k));
      if (v == null) continue;
      if (v < c.min || v > c.max) { form.querySelector('#pm-' + c.k).closest('.measure').classList.add('err'); throw new Error(`${c.champ} : entre ${c.min} et ${c.max} ${c.u}.`); }
      m[c.k] = Math.round(v * 10) / 10;
    }
    // Une seule mesure par jour : une nouvelle saisie à la même date la remplace.
    P.mesures = P.mesures.filter((x) => x.date !== date).concat(m);
    perfSave(); toast('Mesure enregistrée ✓'); ecranPerf();
  });
  f.querySelectorAll('.measure input').forEach((inp) => inp.addEventListener('input', () => inp.closest('.measure').classList.remove('err')));
}

function perfFormObjectif() {
  perfFenetre(`<h2 class="h2">Mon objectif de poids</h2>
    <p class="lead">Le poids que tu vises. Tu pourras le changer à tout moment.</p>
    <div class="measures perf-m1" style="margin-top:16px">${perfChamp('objectif', 'Objectif', 'kg', P.objectif || '')}</div>`, (form) => {
    const v = nombreFr(new FormData(form).get('objectif'));
    if (v == null || v < 30 || v > 300) throw new Error('Indique un objectif en kg (entre 30 et 300).');
    P.objectif = Math.round(v * 10) / 10; perfSave(); toast('Objectif enregistré ✓'); ecranPerf();
  });
}

function perfFormPhotos() {
  const choix = {};
  const f = perfFenetre(`<h2 class="h2">Mes photos du jour</h2>
    <p class="lead">Ajoute une, deux ou trois vues. Elles seront datées d'aujourd'hui.</p>
    <div class="perf-slots">${PERF_VUES.map((v) => `<label class="perf-slot" id="slot-${v.v}"><input type="file" accept="image/*" name="${v.v}" hidden />
      <span class="ph">${ms('add_a_photo')}</span><b>${v.t}</b></label>`).join('')}</div>
    <p class="perf-prive">${ms('lock')}Tes photos restent sur ce téléphone.</p>`, async () => {
    const vues = Object.keys(choix);
    if (!vues.length) throw new Error('Choisis au moins une photo.');
    const date = jourISO(Date.now());
    const recs = [];
    for (const v of vues) recs.push({ id: date + '-' + v, date, vue: v, blob: await perfReduire(choix[v]) });
    await perfPhotosEnregistrer(recs);
    toast(vues.length > 1 ? 'Photos enregistrées ✓' : 'Photo enregistrée ✓');
    if (!vues.includes(perfVue)) perfVue = vues[0];
    perfRendrePhotos();
  });
  f.querySelectorAll('input[type=file]').forEach((inp) => inp.addEventListener('change', () => {
    const fichier = inp.files && inp.files[0]; if (!fichier) return;
    choix[inp.name] = fichier;
    const slot = f.querySelector('#slot-' + inp.name);
    const u = URL.createObjectURL(fichier);
    slot.querySelector('.ph').innerHTML = `<img src="${u}" alt="" />`; slot.classList.add('on');
  }));
}

function perfZoom(url, date) {
  const back = document.createElement('div');
  back.className = 'sheet-back perf-zoom';
  back.innerHTML = `<div class="sheet"><div class="top"><h2>${esc(PERF_VUES.find((v) => v.v === perfVue).t)} · ${esc(jjmmaaaa(date))}</h2><button class="icon-btn" data-close aria-label="Fermer">${ms('close')}</button></div><img src="${url}" alt="" /></div>`;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) { back.remove(); document.body.style.overflow = ''; } });
  document.body.style.overflow = 'hidden';
  document.body.appendChild(back);
}
