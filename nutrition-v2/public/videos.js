'use strict';
/* ============================================================================
   My Coach Nutrition v2 — onglet « Vidéos » (séances My Coach sur YouTube).
   Chargé AVANT app.js ; les fonctions d'app.js (ms, esc, app…) ne sont
   utilisées qu'à l'exécution.

   AJOUTER UNE VIDÉO : ajouter une ligne dans VIDEOS ci-dessous.
     { title: 'Titre affiché', url: 'https://www.youtube.com/watch?v=XXXXXXXXXXX',
       duration: '25 min', level: 'Intermédiaire', equipment: 'Aucun', category: 'fullbody' }
   - youtubeId et miniature sont déduits automatiquement de l'url ;
   - category : une des clés de VIDEO_FILTRES (fullbody, cardio, haut, bas, abdos, mobilite).
   Info inconnue : la pastille durée ou matériel est simplement masquée ;
   level vaut « Tous niveaux » par défaut.
   ========================================================================== */

const VID_DUREE = '';
const VID_NIVEAU = 'Tous niveaux';
const VID_MATERIEL = '';

// Pastilles durée / niveau / matériel : une info vide n'est pas affichée.
function vidPastilles(v) {
  const p = [];
  if (v.duration) p.push(`<span>${ms('schedule')}${esc(v.duration)}</span>`);
  if (v.level) p.push(`<span>${ms('signal_cellular_alt')}${esc(v.level)}</span>`);
  if (v.equipment) p.push(`<span>${ms('fitness_center')}${esc(v.equipment === 'Aucun' ? 'Aucun matériel' : v.equipment)}</span>`);
  return p.join('');
}

const VIDEOS = [
  { title: 'Full body', url: 'https://www.youtube.com/watch?v=qAyrBCA-NQE', category: 'fullbody' },
  { title: 'Renforcement musculaire', url: 'https://www.youtube.com/watch?v=Ki6lzNbqviU', category: 'fullbody' },
  { title: 'Cardio express', url: 'https://www.youtube.com/watch?v=wfR-_3Ec-MY', category: 'cardio' },
  { title: 'Mini session', url: 'https://www.youtube.com/watch?v=nEvoo47TCuM', category: 'fullbody' },
  { title: 'Stretching', url: 'https://www.youtube.com/watch?v=eAWTKxmJV_s', category: 'mobilite' },
  { title: 'Tabata', url: 'https://www.youtube.com/watch?v=isNbt6B308Y', category: 'cardio' },
  { title: 'Spéciale élastique', url: 'https://www.youtube.com/watch?v=3lWb5YJUuh8', category: 'fullbody', equipment: 'Élastique' },
  { title: 'Abdos', url: 'https://www.youtube.com/watch?v=EAd44vWugOk', category: 'abdos' },
  { title: 'Pectoraux / Trapèzes', url: 'https://www.youtube.com/watch?v=z6Br50fxzak', category: 'haut' },
  { title: 'Bas du corps', url: 'https://www.youtube.com/watch?v=e59hHr0JNu0', category: 'bas' },
  { title: 'Full body A', url: 'https://www.youtube.com/watch?v=AmRkZ3ohAeo', category: 'fullbody' },
  { title: 'Amrap A', url: 'https://www.youtube.com/watch?v=vvfcNl9-3qA', category: 'fullbody' },
  { title: 'HIIT', url: 'https://www.youtube.com/watch?v=26q1pYpY0Cg', category: 'cardio' },
  { title: 'Biceps', url: 'https://www.youtube.com/watch?v=RmzmZhk4swU', category: 'haut' },
  { title: 'Full body', url: 'https://www.youtube.com/watch?v=AJlUFD4-Aec', category: 'fullbody' },
  { title: 'Amrap B', url: 'https://www.youtube.com/watch?v=bbxhBoPhfOo', category: 'fullbody' },
  { title: 'Renfo haut du corps', url: 'https://www.youtube.com/watch?v=Llh_g4sSnhM', category: 'haut' },
  { title: 'Épaules, bras & gainage', url: 'https://www.youtube.com/watch?v=zLL6ZnKcr7o', category: 'haut' },
  { title: 'Quadriceps & fessiers', url: 'https://www.youtube.com/watch?v=4Vb9UygtQDA', category: 'bas' },
  { title: 'Abdos', url: 'https://www.youtube.com/watch?v=3O_N8u_Kaak', category: 'abdos' },
  { title: 'Gainage', url: 'https://www.youtube.com/watch?v=0SmjUiOFfDg', category: 'abdos' },
  { title: 'Full body B', url: 'https://www.youtube.com/watch?v=gc4Xbz-27Hw', category: 'fullbody' },
  { title: 'Cardio + renfo + boxe', url: 'https://www.youtube.com/watch?v=kL2BbwOCpL0', category: 'cardio' },
  { title: 'Haut du corps', url: 'https://www.youtube.com/watch?v=fs3pg2fo6Ho', category: 'haut' },
  { title: 'Triceps', url: 'https://www.youtube.com/watch?v=B1jt8gr25-w', category: 'haut' },
  { title: 'Cardio 40/20', url: 'https://www.youtube.com/watch?v=ZXdD72vpdrY', category: 'cardio' },
  { title: 'Abdos spéciale', url: 'https://www.youtube.com/watch?v=O4tTeQY2Yiw', category: 'abdos' },
].map((v) => ({
  ...v,
  youtubeId: v.youtubeId || (String(v.url).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1],
  duration: v.duration || VID_DUREE,
  level: v.level || VID_NIVEAU,
  equipment: v.equipment || VID_MATERIEL,
}));

const VIDEO_FILTRES = [
  { v: 'tous', t: 'Tous' },
  { v: 'fullbody', t: 'Full body' },
  { v: 'cardio', t: 'Cardio' },
  { v: 'haut', t: 'Haut du corps' },
  { v: 'bas', t: 'Bas du corps' },
  { v: 'abdos', t: 'Abdos / Gainage' },
  { v: 'mobilite', t: 'Mobilité' },
];

let vidFiltre = 'tous';
let vidRecherche = '';
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const vidMiniature = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// L'onglet « Bonus » regroupe deux vues : Séances (vidéos, inchangées) et Guides (PDF).
let bonusVue = 'seances';

function ecranVideos() {
  const guides = bonusVue === 'guides';
  const seg = `<div class="bonus-seg" role="tablist" aria-label="Type de contenu">
      <button role="tab" data-bv="seances" aria-selected="${!guides}" class="${guides ? '' : 'on'}">${ms('smart_display')}Séances</button>
      <button role="tab" data-bv="guides" aria-selected="${guides}" class="${guides ? 'on' : ''}">${ms('menu_book')}Guides</button></div>`;
  if (guides) return ecranGuides(seg);
  app.innerHTML = `
  <section class="screen with-nav videos-screen">
    <div class="topbar">${logo()}<span class="title">Bonus</span></div>
    <h1 class="h1">Tes séances My Coach</h1>
    <p class="lead">Continue à bouger où que tu sois.</p>
    ${seg}
    <div class="input-wrap vid-search">${ms('search')}<input id="vidQ" type="search" placeholder="Rechercher une séance…" aria-label="Rechercher une séance" autocomplete="off" value="${esc(vidRecherche)}" /></div>
    <div class="vid-filtres" role="tablist">${VIDEO_FILTRES.filter((f) => f.v === 'tous' || VIDEOS.some((v) => v.category === f.v)).map((f) => `<button class="chip${f.v === vidFiltre ? ' on' : ''}" data-vf="${f.v}" role="tab" aria-selected="${f.v === vidFiltre}">${f.t}</button>`).join('')}</div>
    <p class="vid-count muted small" id="vidCount"></p>
    <div class="vid-grid" id="vidGrid"></div>
  </section>`;
  brancherBonusSeg();
  const q = document.getElementById('vidQ');
  q.addEventListener('input', () => { vidRecherche = q.value; vidListe(); });
  app.querySelectorAll('[data-vf]').forEach((b) => (b.onclick = () => {
    vidFiltre = b.dataset.vf;
    app.querySelectorAll('[data-vf]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    vidListe();
  }));
  vidListe();
}

function brancherBonusSeg() {
  app.querySelectorAll('[data-bv]').forEach((b) => (b.onclick = () => {
    if (bonusVue === b.dataset.bv) return;
    bonusVue = b.dataset.bv; ecranVideos(); window.scrollTo(0, 0);
  }));
}

// --- Guides PDF -------------------------------------------------------------------
const GUIDE_FILTRES = [
  { v: 'tous', t: 'Tous' },
  { v: 'mindset', t: 'Mindset', ic: 'psychology' },
  { v: 'nutrition', t: 'Nutrition', ic: 'restaurant' },
  { v: 'coaching', t: 'Coaching', ic: 'fitness_center' },
];
let gdFiltre = 'tous';
let gdRecherche = '';

// Jour du challenge : le jour 1 est la date de la première mesure de l'onglet Perf
// (le questionnaire la crée), à défaut la date du plan, à défaut aujourd'hui.
function jourChallenge() {
  const dates = ((typeof P !== 'undefined' && P.mesures) || []).map((m) => m.date).filter(Boolean).sort();
  const debut = dates[0] || (S.planCreeLe ? jourISO(S.planCreeLe) : (S.profil && S.profil.poids_kg ? jourISO(Date.now()) : null));
  if (!debut) return 1;
  return Math.max(1, Math.floor((dateDe(jourISO(Date.now())) - dateDe(debut)) / 864e5) + 1);
}
const gdUrl = (g, dl) => `api/guides/${encodeURIComponent(g.slug)}.pdf?c=${encodeURIComponent((studio && studio.code) || '')}${dl ? '&dl=1&nom=' + encodeURIComponent(g.subtitle || g.title) : ''}`;
const gdCat = (c) => GUIDE_FILTRES.find((f) => f.v === c) || { t: c, ic: 'menu_book' };

function ecranGuides(seg) {
  // Tous les guides sont accessibles dès le départ (pas de déblocage) ; ils restent
  // triés selon le jour conseillé du challenge.
  const jour = Infinity;
  app.innerHTML = `
  <section class="screen with-nav videos-screen guides-screen">
    <div class="topbar">${logo()}<span class="title">Bonus</span></div>
    <h1 class="h1">Tes guides My Coach</h1>
    <p class="lead">Des conseils concrets pour réussir ton challenge.</p>
    ${seg}
    <div class="input-wrap vid-search">${ms('search')}<input id="gdQ" type="search" placeholder="Rechercher un guide…" aria-label="Rechercher un guide" autocomplete="off" value="${esc(gdRecherche)}" /></div>
    <div class="vid-filtres" role="tablist">${GUIDE_FILTRES.map((f) => `<button class="chip${f.v === gdFiltre ? ' on' : ''}" data-gf="${f.v}" role="tab" aria-selected="${f.v === gdFiltre}">${f.t}</button>`).join('')}</div>
    <p class="vid-count muted small" id="gdCount"></p>
    <div class="vid-grid" id="gdGrid"></div>
  </section>`;
  brancherBonusSeg();
  const q = document.getElementById('gdQ');
  q.addEventListener('input', () => { gdRecherche = q.value; gdListe(jour); });
  app.querySelectorAll('[data-gf]').forEach((b) => (b.onclick = () => {
    gdFiltre = b.dataset.gf;
    app.querySelectorAll('[data-gf]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    gdListe(jour);
  }));
  gdListe(jour);
}

function gdListe(jour) {
  const terme = sansAccents(gdRecherche.trim());
  const liste = GUIDES.map((g, i) => ({ ...g, i }))
    .filter((g) => (gdFiltre === 'tous' || g.category === gdFiltre) && (!terme || sansAccents(g.title + ' ' + g.subtitle).includes(terme)))
    .sort((a, b) => a.day - b.day || a.i - b.i);
  document.getElementById('gdCount').textContent = `${liste.length} guide${liste.length > 1 ? 's' : ''}`;
  const grille = document.getElementById('gdGrid');
  grille.innerHTML = liste.length ? liste.map((g) => {
    const verrou = g.day > jour;
    const cat = gdCat(g.category);
    return `<article class="card vid-card gd-card${verrou ? ' locked' : ''}">
      <button class="vid-thumb gd-thumb" data-gd="${g.i}" ${verrou ? 'aria-disabled="true"' : ''} aria-label="${verrou ? 'Débloqué au jour ' + g.day : 'Lire le guide ' + esc(g.title)}">
        <img src="guides/${esc(g.slug)}.jpg" alt="" loading="lazy" />
        ${verrou ? `<span class="gd-lock">${ms('lock', 'fill')}Débloqué au jour ${g.day}</span>` : ''}
      </button>
      <div class="body">
        <h3 class="name">${esc(g.title)}</h3>
        <p class="gd-sub">${esc(g.subtitle)}</p>
        <div class="vid-meta">
          <span>${ms(cat.ic)}${esc(cat.t)}</span>
          <span>${ms('description')}${g.pages} pages</span>
        </div>
        ${verrou ? `<button class="btn btn-block vid-btn gd-btn-lock" data-gd="${g.i}" aria-disabled="true">${ms('lock')}Débloqué au jour ${g.day}</button>`
          : `<button class="btn btn-primary btn-block vid-btn" data-gd="${g.i}">${ms('menu_book')}Lire le guide</button>`}
      </div></article>`;
  }).join('')
    : `<div class="card vid-vide">${ms('search_off')}<p>Aucun guide ne correspond à « ${esc(gdRecherche)} ».</p><button class="btn btn-ghost" id="gdReset">Voir tous les guides</button></div>`;
  grille.querySelectorAll('[data-gd]').forEach((b) => (b.onclick = () => {
    const g = GUIDES[Number(b.dataset.gd)];
    if (g.day > jour) return toast(`Ce guide se débloque au jour ${g.day} de ton challenge.`);
    gdOuvrir(g);
  }));
  const reset = document.getElementById('gdReset');
  if (reset) reset.onclick = () => { gdRecherche = ''; gdFiltre = 'tous'; ecranVideos(); };
}

// Lecture intégrée : PDF.js (hébergé avec l'app) dessine chaque page ; téléchargement
// du PDF d'origine. Si le lecteur ne charge pas, lien de secours vers le PDF.
let pdfjsPromesse = null;
function chargerPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromesse) {
    pdfjsPromesse = new Promise((ok, ko) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/pdfjs/pdf.min.js';
      sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; ok(window.pdfjsLib); };
      sc.onerror = () => { pdfjsPromesse = null; ko(new Error('Lecteur indisponible.')); };
      document.head.appendChild(sc);
    });
  }
  return pdfjsPromesse;
}

function gdOuvrir(g) {
  const back = document.createElement('div');
  back.className = 'sheet-back gd-modal';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(g.title)}">
    <div class="top"><h2>${esc(g.title)}</h2><button class="icon-btn" data-close aria-label="Fermer">${ms('close')}</button></div>
    <div class="gd-actions">
      <a class="btn btn-soft" href="${gdUrl(g, true)}" download>${ms('download')}Télécharger</a>
      <span class="muted small">${g.pages} pages · ${esc(gdCat(g.category).t)}</span>
    </div>
    <div class="gd-pages" id="gdPages"><div class="gd-load"><div class="spinner"></div><p>Ouverture du guide…</p></div></div>
  </div>`;
  let annule = false;
  const fermer = () => { annule = true; back.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', echap); };
  const echap = (e) => { if (e.key === 'Escape') fermer(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) fermer(); });
  document.addEventListener('keydown', echap);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(back);

  const zone = back.querySelector('#gdPages');
  (async () => {
    try {
      const lib = await chargerPdfJs();
      const doc = await lib.getDocument({ url: gdUrl(g, false) }).promise;
      if (annule) return;
      zone.innerHTML = '';
      const largeur = zone.clientWidth || 360;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      for (let n = 1; n <= doc.numPages; n++) {
        if (annule) return;
        const page = await doc.getPage(n);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (largeur / vp1.width) * ratio });
        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        c.setAttribute('aria-label', `Page ${n} sur ${doc.numPages}`);
        zone.appendChild(c);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      }
    } catch (ex) {
      if (annule) return;
      zone.innerHTML = `<div class="gd-load">${ms('error')}<p>Le guide n'a pas pu s'afficher ici.</p>
        <a class="btn btn-primary" href="${gdUrl(g, false)}" target="_blank" rel="noopener">${ms('open_in_new')}Ouvrir le PDF</a></div>`;
    }
  })();
}

function vidListe() {
  const terme = sansAccents(vidRecherche.trim());
  const liste = VIDEOS.map((v, i) => ({ ...v, i })).filter((v) => (vidFiltre === 'tous' || v.category === vidFiltre) && (!terme || sansAccents(v.title).includes(terme)));
  document.getElementById('vidCount').textContent = `${liste.length} séance${liste.length > 1 ? 's' : ''}`;
  const grille = document.getElementById('vidGrid');
  grille.innerHTML = liste.length ? liste.map((v) => `
    <article class="card vid-card vid-seance">
      <div class="vid-thumb">
        <img src="${vidMiniature(v.youtubeId)}" alt="" loading="lazy" />
        <span class="vid-play" aria-hidden="true">${ms('play_arrow', 'fill')}</span>
      </div>
      <div class="body">
        <h3 class="name"><button class="vid-ouvrir" data-play="${v.i}" aria-label="Voir la séance ${esc(v.title)}">${esc(v.title)}</button></h3>
        <div class="vid-meta">${vidPastilles(v)}</div>
        <span class="vid-lien" aria-hidden="true">Voir la séance${ms('chevron_right')}</span>
      </div>
    </article>`).join('')
    : `<div class="card vid-vide">${ms('search_off')}<p>Aucune séance ne correspond à « ${esc(vidRecherche)} ».</p><button class="btn btn-ghost" id="vidReset">Voir toutes les séances</button></div>`;
  grille.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => vidOuvrir(VIDEOS[Number(b.dataset.play)])));
  const reset = document.getElementById('vidReset');
  if (reset) reset.onclick = () => { vidRecherche = ''; vidFiltre = 'tous'; ecranVideos(); };
}

// Lecture dans l'application : lecteur YouTube officiel intégré dans une fenêtre.
function vidOuvrir(v) {
  const back = document.createElement('div');
  back.className = 'sheet-back vid-modal';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(v.title)}">
    <div class="top"><h2>${esc(v.title)}</h2><button class="icon-btn" data-close aria-label="Fermer">${ms('close')}</button></div>
    <div class="vid-player"><iframe src="https://www.youtube-nocookie.com/embed/${v.youtubeId}?rel=0&playsinline=1"
      title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <div class="vid-meta">${vidPastilles(v)}</div>
    <a class="vid-yt" href="${esc(v.url)}" target="_blank" rel="noopener">${ms('open_in_new')}La vidéo ne se lance pas ? Ouvrir sur YouTube</a>
  </div>`;
  // Fermer retire le lecteur : la vidéo s'arrête.
  const fermer = () => { back.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', echap); };
  const echap = (e) => { if (e.key === 'Escape') fermer(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) fermer(); });
  document.addEventListener('keydown', echap);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(back);
}
