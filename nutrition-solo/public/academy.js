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
//   3. L'ÉVALUATION THÉORIQUE NE SE CORRIGE PAS ICI. Cet écran ne reçoit
//      jamais les bonnes réponses : il envoie des identifiants de choix et
//      reçoit un score déjà calculé. Il ne décide ni de la réussite, ni du
//      seuil, ni de ce qu'ouvre la réussite — et il dit franchement qu'elle
//      ne certifie personne.
// ============================================================================

const CLE = 'mc-academy-session';   // propre à cette page

const $ = (s) => document.querySelector(s);
const montrer = (sel, oui) => { const el = $(sel); if (el) el.hidden = !oui; };

let session = null;
let formation = null;
let contenuOuvert = null;
let qcm = null;         // état de l'évaluation théorique, tel que le serveur le calcule
let tentative = null;   // la tentative ouverte, figée par le serveur
let iQuestion = 0;      // question affichée

function echapper(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

async function apiAc(route, methode, corps) {
  const res = await fetch(route, {
    method: methode || 'GET',
    headers: {
      ...(session ? { Authorization: 'Bearer ' + session.token } : {}),
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  let d = null;
  try { d = await res.json(); } catch (_) { /* réponse non JSON */ }
  return { status: res.status, data: d || {} };
}

function afficher(ecran) {
  for (const id of ['#acBoot', '#acLogin', '#acBloc', '#acSommaire', '#acLecteur', '#acQcm']) montrer(id, id === ecran);
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
  await chargerQcm();
  rendreSommaire();
}

// L'état de l'évaluation est TOUJOURS relu au serveur : « la formation est-elle
// achevée », « la théorie est-elle validée », « une tentative est-elle
// ouverte » sont trois questions dont l'écran n'a pas les réponses.
async function chargerQcm() {
  const r = await apiAc('/api/academy/qcm');
  qcm = r.data && r.data.ok ? r.data.qcm : null;
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

    rendreCarteQcm() +

    (f.modules.length ? f.modules.map(rendreModule).join('')
      : '<div class="ec-vide">Aucun module de formation pour le moment.</div>');

  const b = $('#acReprendre');
  if (b) b.addEventListener('click', () => ouvrir(f.reprise));
  const g = $('#acQcmGo');
  if (g) g.addEventListener('click', ouvrirEvaluation);
  const v = $('#acQcmVoir');
  if (v) v.addEventListener('click', ouvrirEvaluation);
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
  // Terminer le DERNIER contenu ouvre l'évaluation théorique : on relit son
  // état, sinon la carte du sommaire annoncerait encore un verrou levé.
  await chargerQcm();
  // On reste sur le contenu : le collaborateur voit sa progression bouger et
  // enchaîne s'il le souhaite. Le renvoyer au sommaire lui ferait perdre le fil.
  rendreLecteur();
}

// --- Évaluation théorique ----------------------------------------------------
//
//  Ce que cet écran sait faire : afficher un questionnaire déjà figé par le
//  serveur, enregistrer des choix, demander la clôture, montrer le verdict
//  rendu. Ce qu'il ne sait pas faire — et ne doit jamais apprendre — c'est dire
//  si une réponse est juste : il n'a pas le corrigé, et il n'en veut pas.

const LIBELLES = {
  formation_en_cours: 'Formation en cours',
  qcm_disponible: 'Formation terminée — QCM disponible',
  evaluation_en_cours: 'Évaluation théorique en cours',
  theorie_non_validee: 'Théorie non validée',
  theorie_validee: 'Théorie validée',
};

function rendreCarteQcm() {
  if (!qcm) return '';
  const e = qcm.etat;
  const entete =
    '<div class="ac-qcm-h">' +
      '<b>Évaluation théorique — Coach Nutrition</b>' +
      '<span class="ac-qcm-etat ac-etat-' + e.replace(/_/g, '-') + '">' + echapper(LIBELLES[e] || '') + '</span>' +
    '</div>';

  let corps = '';
  if (e === 'formation_en_cours') {
    const reste = qcm.formation.total - qcm.formation.termines;
    corps =
      '<p class="ac-qcm-p"><span aria-hidden="true">🔒</span> Évaluation verrouillée : termine d\'abord tous les contenus de la formation.</p>' +
      '<p class="ac-qcm-s">Il te reste ' + reste + ' contenu' + (reste > 1 ? 's' : '') + ' à terminer sur ' + qcm.formation.total + '.</p>';
  } else if (e === 'evaluation_en_cours') {
    corps =
      '<p class="ac-qcm-p">Tu as une évaluation en cours : ' + qcm.enCours.repondues + ' réponse' +
        (qcm.enCours.repondues > 1 ? 's' : '') + ' sur ' + qcm.enCours.nbQuestions + '.</p>' +
      '<button type="button" class="ec-btn ec-btn-p ac-reprendre" id="acQcmGo">Reprendre mon évaluation</button>';
  } else if (e === 'theorie_validee') {
    corps =
      '<p class="ac-qcm-ok"><span aria-hidden="true">✓</span> Théorie validée — score : ' + qcm.scoreValide + ' %.</p>' +
      '<p class="ac-qcm-next">Prochaine étape : évaluation pratique</p>' +
      (qcm.certifie
        ? '<p class="ac-qcm-note">Tu es Coach Nutrition certifié.</p>'
        // Le point le plus important de tout l'écran : réussir le QCM ne
        // certifie personne. Le dire à moitié laisserait croire l'inverse.
        : '<p class="ac-qcm-note">Tu n\'es pas encore Coach Nutrition certifié : la certification est prononcée par ton évaluateur après l\'évaluation pratique.</p>');
  } else if (e === 'theorie_non_validee') {
    corps =
      '<p class="ac-qcm-ko">Théorie non validée — dernier score : ' + qcm.derniere.scorePct +
        ' % (seuil : ' + qcm.derniere.seuilPct + ' %).</p>' +
      '<p class="ac-qcm-s">Tu peux repasser l\'évaluation : chaque tentative tire de nouvelles questions.</p>' +
      '<button type="button" class="ec-btn ec-btn-p ac-reprendre" id="acQcmGo">Recommencer l\'évaluation</button>';
  } else {
    corps =
      '<p class="ac-qcm-p">Ta formation est terminée : l\'évaluation théorique est ouverte.</p>' +
      '<p class="ac-qcm-s">' + qcm.config.nbQuestions + ' questions tirées au hasard · seuil de réussite : ' +
        qcm.config.seuilPct + ' %.</p>' +
      '<p class="ac-qcm-demo">Questionnaire de démonstration : les vraies questions de la formation seront saisies depuis l\'administration.</p>' +
      '<button type="button" class="ec-btn ec-btn-p ac-reprendre" id="acQcmGo">Commencer mon évaluation</button>';
  }

  const historique = qcm.historique.length
    ? '<details class="ac-qcm-histo"><summary>Mes tentatives (' + qcm.historique.length + ')</summary><ul>' +
      qcm.historique.map((t) => '<li>' + echapper(dateFr(t.soumiseLe || t.ouverteLe)) + ' — ' +
        (t.statut === 'soumise'
          ? t.scorePct + ' % · ' + (t.reussie ? 'réussie' : 'non validée')
          : 'en cours') + '</li>').join('') +
      '</ul></details>'
    : '';

  return '<section class="ac-qcm-carte ac-qcm-' + e.replace(/_/g, '-') + '">' + entete + corps + historique + '</section>';
}

const premiereSansReponse = () => {
  const i = tentative.questions.findIndex((q) => !q.reponse.length);
  return i < 0 ? 0 : i;
};

// Démarre OU reprend : c'est le serveur qui tranche. Cliquer deux fois ne crée
// jamais une seconde tentative — il rend celle qui est déjà ouverte.
async function ouvrirEvaluation() {
  const r = await apiAc('/api/academy/qcm/tentatives', 'POST', {});
  if (r.status === 401) { deconnecter(); return; }
  if (r.status === 403) { await demarrer(); return; }
  if (!r.data.ok) {
    bloquer('🔒', 'Évaluation indisponible', r.data.error || 'Réessaie dans un instant.');
    return;
  }
  tentative = r.data.tentative;
  iQuestion = premiereSansReponse();
  rendreQcm();
}

function rendreQcm() {
  if (tentative.resultat) { rendreResultat(); return; }
  const qs = tentative.questions;
  const q = qs[iQuestion];
  const sans = qs.filter((x) => !x.reponse.length).length;

  $('#acQcm').innerHTML =
    '<button type="button" class="ec-back" id="acQBack">← Ma formation</button>' +
    '<div class="ac-lec-h">' +
      '<p class="ac-lec-mod">Évaluation théorique</p>' +
      '<h1 class="ac-lec-t">Coach Nutrition</h1>' +
    '</div>' +

    // Une pastille par question : elle dit d'un coup d'œil où l'on en est, et
    // permet de revenir sur n'importe quelle réponse tant que rien n'est rendu.
    '<div class="ac-q-bar">' + qs.map((x, i) =>
      '<button type="button" class="ac-q-dot' + (i === iQuestion ? ' ac-q-ici' : '') +
      (x.reponse.length ? ' ac-q-ok' : '') + '" data-q="' + i + '" aria-label="Question ' + (i + 1) + '">' +
      (i + 1) + '</button>').join('') + '</div>' +

    '<div class="ac-q">' +
      '<p class="ac-q-num">Question ' + (iQuestion + 1) + ' / ' + qs.length + '</p>' +
      '<h2 class="ac-q-enonce">' + echapper(q.enonce) + '</h2>' +
      '<p class="ac-q-aide">' + (q.multiple
        ? 'Plusieurs réponses attendues : coche toutes celles qui conviennent.'
        : 'Une seule réponse.') + '</p>' +
      '<div class="ac-q-choix">' + q.choix.map((c) => {
        const coche = q.reponse.indexOf(c.id) >= 0;
        return '<label class="ac-choix' + (coche ? ' ac-choix-on' : '') + '">' +
          '<input type="' + (q.multiple ? 'checkbox' : 'radio') + '" name="q' + q.id + '" value="' + c.id + '"' +
            (coche ? ' checked' : '') + ' />' +
          '<span>' + echapper(c.texte) + '</span></label>';
      }).join('') + '</div>' +
    '</div>' +

    '<div class="ac-nav">' +
      '<button type="button" class="ec-btn" id="acQPrec"' + (iQuestion > 0 ? '' : ' disabled') + '>← Précédent</button>' +
      '<button type="button" class="ec-btn" id="acQSuiv"' + (iQuestion < qs.length - 1 ? '' : ' disabled') + '>Suivant →</button>' +
    '</div>' +

    '<div class="ac-qcm-fin">' +
      (sans ? '<p class="ac-q-reste" id="acQReste">Il reste ' + sans + ' question' + (sans > 1 ? 's' : '') +
        ' sans réponse. Une question sans réponse est comptée fausse.</p>' : '') +
      '<button type="button" class="ec-btn ec-btn-p ac-fait-b" id="acQFin">Terminer mon évaluation</button>' +
      '<p class="ac-q-aide">Tu peux revenir sur tes réponses tant que tu n\'as pas rendu ton évaluation.</p>' +
    '</div>';

  $('#acQBack').addEventListener('click', quitterEvaluation);
  $('#acQPrec').addEventListener('click', () => { if (iQuestion > 0) { iQuestion--; rendreQcm(); } });
  $('#acQSuiv').addEventListener('click', () => { if (iQuestion < qs.length - 1) { iQuestion++; rendreQcm(); } });
  $('#acQFin').addEventListener('click', terminerEvaluation);
  document.querySelectorAll('#acQcm [data-q]').forEach((el) =>
    el.addEventListener('click', () => { iQuestion = Number(el.dataset.q); rendreQcm(); }));
  document.querySelectorAll('#acQcm .ac-choix input').forEach((el) =>
    el.addEventListener('change', () => enregistrerReponse(q.id)));

  afficher('#acQcm');
  window.scrollTo(0, 0);
}

// Chaque choix part au serveur immédiatement. C'est ce qui fait qu'une
// déconnexion en plein questionnaire ne coûte rien : la tentative et ses
// réponses vivent là-bas, pas dans cet onglet.
async function enregistrerReponse(tqId) {
  const choix = [...document.querySelectorAll('#acQcm .ac-choix input:checked')].map((el) => Number(el.value));
  const r = await apiAc('/api/academy/qcm/tentatives/' + tentative.id + '/reponses/' + tqId, 'PUT', { choix });
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) return;
  tentative = r.data.tentative;
  rendreQcm();
}

async function quitterEvaluation() {
  await chargerQcm();
  rendreSommaire();
}

async function terminerEvaluation() {
  const b = $('#acQFin');
  if (b) b.disabled = true;
  const r = await apiAc('/api/academy/qcm/tentatives/' + tentative.id + '/terminer', 'POST', {});
  if (r.status === 401) { deconnecter(); return; }
  if (r.status === 403) { await demarrer(); return; }
  if (!r.data.ok) { if (b) b.disabled = false; return; }
  tentative = r.data.tentative;
  qcm = r.data.etat || qcm;
  rendreResultat();
}

// Le verdict arrive tout fait. L'écran ne recalcule rien — pas même le
// pourcentage — et n'affiche jamais le détail question par question : savoir
// lesquelles sont tombées à côté reviendrait à distribuer la moitié du corrigé.
function rendreResultat() {
  const res = tentative.resultat;
  const valide = res.reussie;

  $('#acQcm').innerHTML =
    '<button type="button" class="ec-back" id="acQBack">← Ma formation</button>' +
    '<div class="ac-res ' + (valide ? 'ac-res-ok' : 'ac-res-ko') + '">' +
      '<p class="ac-res-score">Score : ' + res.scorePct + ' %</p>' +
      '<h1 class="ac-res-verdict">' + (valide ? 'Formation théorique validée' : 'Formation théorique non validée') + '</h1>' +
      '<p class="ac-res-detail">' + res.bonnes + ' bonne' + (res.bonnes > 1 ? 's' : '') + ' réponse' +
        (res.bonnes > 1 ? 's' : '') + ' sur ' + res.total + ' · seuil de réussite : ' + res.seuilPct + ' %.</p>' +
    '</div>' +

    (res.aRevoir.length
      ? '<div class="ac-res-revoir"><b>À revoir</b><ul>' + res.aRevoir.map((m) =>
          '<li>' + echapper(m.module) + ' — ' + m.questions + ' question' + (m.questions > 1 ? 's' : '') + '</li>').join('') +
        '</ul></div>'
      : '') +

    (valide
      ? '<div class="ac-res-suite">' +
          '<p class="ac-res-t"><span aria-hidden="true">✓</span> Théorie validée</p>' +
          '<p class="ac-res-next">Prochaine étape : évaluation pratique</p>' +
          (qcm && qcm.certifie
            ? '<p class="ac-res-note">Tu es Coach Nutrition certifié : ce résultat ne change rien à ta certification.</p>'
            : '<p class="ac-res-note">Tu n\'es pas encore Coach Nutrition certifié. La certification est prononcée par ton évaluateur, après l\'évaluation pratique.</p>') +
        '</div>'
      : '<div class="ac-res-suite">' +
          '<p class="ac-res-note">Tu peux repasser l\'évaluation autant de fois que nécessaire : chaque tentative tire de nouvelles questions.</p>' +
          '<button type="button" class="ec-btn ec-btn-p ac-fait-b" id="acQRefaire">Recommencer l\'évaluation</button>' +
        '</div>');

  $('#acQBack').addEventListener('click', quitterEvaluation);
  const rf = $('#acQRefaire');
  if (rf) rf.addEventListener('click', async () => { await chargerQcm(); await ouvrirEvaluation(); });

  afficher('#acQcm');
  window.scrollTo(0, 0);
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
