'use strict';
// ============================================================================
//  MY COACH ACADEMY — logique de la page /academy (lot 1).
//
//  Autonome, comme /coach : elle ne partage avec l'app cliente et l'espace
//  Coach que l'authentification (email + PIN) et la palette.
//
//  DEUX PARTIS PRIS À CONNAÎTRE :
//
//   1. « Terminer » est un GESTE EXPLICITE du collaborateur. On ne peut pas
//      prouver qu'une vidéo YouTube a été regardée, et faire semblant de le
//      mesurer mentirait sur ce que vaut la progression. On enregistre donc une
//      déclaration, et on le dit à l'écran.
//   2. La progression et le point de reprise viennent TOUJOURS du serveur.
//      L'écran ne calcule ni pourcentage ni « où j'en étais » : deux sources
//      pour la même vérité finissent toujours par diverger.
// ============================================================================

const CLE = 'mc-academy-session';   // propre à cette page

const $ = (s) => document.querySelector(s);
const montrer = (sel, oui) => { const el = $(sel); if (el) el.hidden = !oui; };

let session = null;
let formation = null;
let contenuOuvert = null;

function echapper(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

async function apiAc(route, methode) {
  const res = await fetch(route, {
    method: methode || 'GET',
    headers: session ? { Authorization: 'Bearer ' + session.token } : {},
  });
  let d = null;
  try { d = await res.json(); } catch (_) { /* réponse non JSON */ }
  return { status: res.status, data: d || {} };
}

function afficher(ecran) {
  for (const id of ['#acBoot', '#acLogin', '#acBloc', '#acSommaire', '#acLecteur']) montrer(id, id === ecran);
}
function bloquer(icone, titre, texte) {
  $('#acBlocIc').textContent = icone;
  $('#acBlocT').textContent = titre;
  $('#acBlocP').textContent = texte;
  afficher('#acBloc');
}
function deconnecter() {
  try { localStorage.removeItem(CLE); } catch (_) { /* stockage indisponible */ }
  session = null;
  montrer('#acMe', false);
  afficher('#acLogin');
}

// --- Démarrage ---------------------------------------------------------------

async function demarrer() {
  try { session = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (_) { session = null; }
  if (!session || !session.token) { afficher('#acLogin'); return; }

  const moi = await apiAc('/api/academy/moi');
  if (moi.status === 401) { deconnecter(); return; }
  if (!moi.data.ok) { bloquer('⚠️', 'Espace indisponible', 'Réessaie dans un instant.'); return; }

  $('#acMeNom').textContent = moi.data.email || '';
  montrer('#acMe', true);

  // Un client n'a rien à faire ici : on le lui dit franchement plutôt que de
  // lui servir une formation vide.
  if (!moi.data.collaborateur) {
    bloquer('🔒', 'Formation réservée aux collaborateurs',
      'La formation Coach Nutrition est réservée aux collaborateurs My Coach. Si tu es client, ton espace se trouve sur la page d\'accueil de l\'application.');
    return;
  }
  await chargerFormation();
}

async function chargerFormation() {
  const r = await apiAc('/api/academy/formation');
  // La certification a pu être retirée entre-temps : le serveur ferme, l'écran suit.
  if (r.status === 403) { await demarrer(); return; }
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) { bloquer('⚠️', 'Formation indisponible', 'Réessaie dans un instant.'); return; }
  formation = r.data.formation;
  rendreSommaire();
}

// --- Sommaire ----------------------------------------------------------------

function etatDe(c) {
  if (c.termine) return ['ac-fait', '✓'];
  if (c.commence) return ['ac-encours', '▶'];
  return ['ac-avenir', '○'];
}

function rendreSommaire() {
  const f = formation;
  const reprise = f.reprise ? f.modules.flatMap((m) => m.contenus).find((c) => c.id === f.reprise) : null;

  $('#acSommaire').innerHTML =
    '<h1 class="ec-t">Formation Coach Nutrition</h1>' +
    '<p class="ec-sub">Les modules à suivre pour devenir Coach Nutrition certifié.</p>' +

    '<div class="ac-prog">' +
      '<div class="ac-prog-h"><b>Ta progression</b><span>' + f.pourcentage + ' %</span></div>' +
      '<div class="ac-barre"><i style="width:' + f.pourcentage + '%"></i></div>' +
      '<p class="ac-prog-s">' + f.termines + ' contenu' + (f.termines > 1 ? 's' : '') + ' terminé' +
        (f.termines > 1 ? 's' : '') + ' sur ' + f.total + '.' +
        (f.acheve ? ' Formation théorique terminée.' : '') + '</p>' +
      (reprise ? '<button type="button" class="ec-btn ec-btn-p ac-reprendre" id="acReprendre">' +
        (f.termines ? 'Reprendre' : 'Commencer') + ' : ' + echapper(reprise.titre) + '</button>' : '') +
    '</div>' +

    (f.modules.length ? f.modules.map(rendreModule).join('')
      : '<div class="ec-vide">Aucun module de formation pour le moment.</div>');

  const b = $('#acReprendre');
  if (b) b.addEventListener('click', () => ouvrir(f.reprise));
  document.querySelectorAll('[data-contenu]').forEach((el) => {
    el.addEventListener('click', () => ouvrir(Number(el.dataset.contenu)));
  });
  afficher('#acSommaire');
  window.scrollTo(0, 0);
}

function rendreModule(m) {
  return '<section class="ac-mod">' +
    '<h2 class="ac-mod-t">' + echapper(m.titre) + '</h2>' +
    (m.description ? '<p class="ac-mod-s">' + echapper(m.description) + '</p>' : '') +
    '<p class="ac-mod-c">' + m.termines + '/' + m.total + ' terminé' + (m.termines > 1 ? 's' : '') +
      (m.acheve ? ' · module complet' : '') + '</p>' +
    '<div class="ac-liste">' + m.contenus.map((c) => {
      const [cls, ic] = etatDe(c);
      return '<button type="button" class="ac-l ' + cls + '" data-contenu="' + c.id + '">' +
        '<span class="ac-l-ic" aria-hidden="true">' + ic + '</span>' +
        '<span class="ac-l-t">' + echapper(c.titre) + '</span>' +
        (c.dureeMin ? '<span class="ac-l-d">' + c.dureeMin + ' min</span>' : '') +
        '</button>';
    }).join('') + '</div></section>';
}

// --- Lecteur -----------------------------------------------------------------

// Tous les contenus, à plat et dans l'ordre : c'est ce qui donne « précédent »
// et « suivant » sans que l'écran ait à connaître la structure des modules.
const aPlat = () => (formation ? formation.modules.flatMap((m) => m.contenus) : []);

async function ouvrir(id) {
  // On enregistre l'ouverture AVANT d'afficher : c'est elle qui déplace le
  // point de reprise. Elle ne termine rien.
  const r = await apiAc('/api/academy/contenus/' + id + '/ouvrir', 'POST');
  if (r.status === 403) { await demarrer(); return; }
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) { bloquer('🔍', 'Contenu introuvable', 'Ce contenu n\'existe plus ou n\'est plus actif.'); return; }
  formation = r.data.formation;
  contenuOuvert = r.data.contenu;
  rendreLecteur();
}

function rendreLecteur() {
  const c = contenuOuvert;
  const tous = aPlat();
  const i = tous.findIndex((x) => x.id === c.id);
  const etat = tous[i] || {};
  const prec = i > 0 ? tous[i - 1] : null;
  const suiv = i >= 0 && i < tous.length - 1 ? tous[i + 1] : null;

  // youtube-nocookie : pas de cookie déposé tant que la vidéo n'est pas lancée.
  // L'identifiant a été validé côté serveur ; il est ré-échappé ici par principe.
  const lecteur = c.youtubeId
    ? '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(c.youtubeId) + '?rel=0" ' +
      'title="' + echapper(c.titre) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" ' +
      'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'
    : '<p class="ac-video-non">Vidéo indisponible pour ce contenu.</p>';

  $('#acLecteur').innerHTML =
    '<button type="button" class="ec-back" id="acBack">← Ma formation</button>' +
    '<div class="ac-lec-h">' +
      '<p class="ac-lec-mod">' + echapper(c.moduleTitre) + '</p>' +
      '<h1 class="ac-lec-t">' + echapper(c.titre) + '</h1>' +
    '</div>' +
    '<div class="ac-video">' + lecteur + '</div>' +
    (c.description ? '<p class="ac-lec-d">' + echapper(c.description) + '</p>' : '') +

    '<div class="ac-lec-fin">' +
      (etat.termine
        ? '<p class="ac-deja"><span aria-hidden="true">✓</span> Terminé le ' + echapper(dateFr(etat.termineLe)) + '</p>'
        : '<p class="ac-lec-aide">Quand tu as regardé cette vidéo en entier, confirme-le ici : ' +
            'c\'est ce qui fait avancer ta progression.</p>' +
          '<button type="button" class="ec-btn ec-btn-p ac-fait-b" id="acFait">J\'ai terminé ce contenu</button>') +
    '</div>' +

    '<div class="ac-nav">' +
      '<button type="button" class="ec-btn" id="acPrec"' + (prec ? '' : ' disabled') + '>← Précédent</button>' +
      '<button type="button" class="ec-btn" id="acSuiv"' + (suiv ? '' : ' disabled') + '>Suivant →</button>' +
    '</div>';

  $('#acBack').addEventListener('click', () => rendreSommaire());
  const f = $('#acFait');
  if (f) f.addEventListener('click', () => terminer(c.id));
  if (prec) $('#acPrec').addEventListener('click', () => ouvrir(prec.id));
  if (suiv) $('#acSuiv').addEventListener('click', () => ouvrir(suiv.id));

  afficher('#acLecteur');
  window.scrollTo(0, 0);
}

async function terminer(id) {
  const r = await apiAc('/api/academy/contenus/' + id + '/terminer', 'POST');
  if (r.status === 403) { await demarrer(); return; }
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) return;
  formation = r.data.formation;
  // On reste sur le contenu : le collaborateur voit sa progression bouger et
  // enchaîne s'il le souhaite. Le renvoyer au sommaire lui ferait perdre le fil.
  rendreLecteur();
}

// --- Connexion ----------------------------------------------------------------

async function connecter(e) {
  e.preventDefault();
  const email = ($('#acEmail').value || '').trim().toLowerCase();
  const pin = $('#acPin').value || '';
  const err = $('#acErr');
  err.textContent = '';
  $('#acGo').disabled = true;
  try {
    const res = await fetch('/account/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pin }),
    });
    const d = await res.json();
    if (!d.ok || !d.token) { err.textContent = d.error || 'Connexion impossible.'; return; }
    session = { email, token: d.token };
    try { localStorage.setItem(CLE, JSON.stringify(session)); } catch (_) { /* stockage indisponible */ }
    $('#acPin').value = '';
    await demarrer();
  } catch (_) {
    err.textContent = 'Connexion impossible pour le moment.';
  } finally {
    $('#acGo').disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('#acForm').addEventListener('submit', connecter);
  $('#acOut').addEventListener('click', async () => {
    if (session) { try { await fetch('/account/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + session.token } }); } catch (_) {} }
    deconnecter();
  });
  demarrer();
});
