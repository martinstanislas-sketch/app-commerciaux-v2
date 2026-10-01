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
   Valeurs neutres tant qu'une info n'est pas connue : duration « À renseigner »,
   level « Tous niveaux », equipment « Voir la séance ».
   ========================================================================== */

const VID_DUREE = 'À renseigner';
const VID_NIVEAU = 'Tous niveaux';
const VID_MATERIEL = 'Voir la séance';

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

function ecranVideos() {
  app.innerHTML = `
  <section class="screen with-nav videos-screen">
    <div class="topbar">${logo()}<span class="title">Vidéos</span></div>
    <h1 class="h1">Tes séances My Coach</h1>
    <p class="lead">Continue à bouger où que tu sois.</p>
    <div class="input-wrap vid-search">${ms('search')}<input id="vidQ" type="search" placeholder="Rechercher une séance…" aria-label="Rechercher une séance" autocomplete="off" value="${esc(vidRecherche)}" /></div>
    <div class="vid-filtres" role="tablist">${VIDEO_FILTRES.filter((f) => f.v === 'tous' || VIDEOS.some((v) => v.category === f.v)).map((f) => `<button class="chip${f.v === vidFiltre ? ' on' : ''}" data-vf="${f.v}" role="tab" aria-selected="${f.v === vidFiltre}">${f.t}</button>`).join('')}</div>
    <p class="vid-count muted small" id="vidCount"></p>
    <div class="vid-grid" id="vidGrid"></div>
  </section>`;
  const q = document.getElementById('vidQ');
  q.addEventListener('input', () => { vidRecherche = q.value; vidListe(); });
  app.querySelectorAll('[data-vf]').forEach((b) => (b.onclick = () => {
    vidFiltre = b.dataset.vf;
    app.querySelectorAll('[data-vf]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    vidListe();
  }));
  vidListe();
}

function vidListe() {
  const terme = sansAccents(vidRecherche.trim());
  const liste = VIDEOS.map((v, i) => ({ ...v, i })).filter((v) => (vidFiltre === 'tous' || v.category === vidFiltre) && (!terme || sansAccents(v.title).includes(terme)));
  document.getElementById('vidCount').textContent = `${liste.length} séance${liste.length > 1 ? 's' : ''}`;
  const grille = document.getElementById('vidGrid');
  grille.innerHTML = liste.length ? liste.map((v) => `
    <article class="card vid-card">
      <button class="vid-thumb" data-play="${v.i}" aria-label="Voir la séance ${esc(v.title)}">
        <img src="${vidMiniature(v.youtubeId)}" alt="" loading="lazy" />
        <span class="vid-play">${ms('play_arrow', 'fill')}</span>
      </button>
      <div class="body">
        <h3 class="name">${esc(v.title)}</h3>
        <div class="vid-meta">
          <span>${ms('schedule')}${esc(v.duration)}</span>
          <span>${ms('signal_cellular_alt')}${esc(v.level)}</span>
          <span>${ms('fitness_center')}${esc(v.equipment === 'Aucun' ? 'Aucun matériel' : v.equipment)}</span>
        </div>
        <button class="btn btn-primary btn-block vid-btn" data-play="${v.i}">${ms('play_circle')}Voir la séance</button>
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
    <div class="vid-meta">
      <span>${ms('schedule')}${esc(v.duration)}</span><span>${ms('signal_cellular_alt')}${esc(v.level)}</span><span>${ms('fitness_center')}${esc(v.equipment === 'Aucun' ? 'Aucun matériel' : v.equipment)}</span>
    </div>
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
