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
//   4. L'ÉVALUATION PRATIQUE EST UNE DÉCISION HUMAINE. L'écran l'affiche et,
//      pour un évaluateur, la saisit. Il ne la calcule jamais, et il ne
//      transforme jamais une pratique validée en certification : cette
//      dernière marche appartient à un autre lot, et l'écran le dit.
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
// LE CATALOGUE VIENT DU SERVEUR, jamais du code. Une formation active ajoutée
// demain en base apparaît ici sans qu'on rouvre ce fichier.
let catalogue = [];     // toutes les formations accessibles
let fCourante = null;   // la formation affichée — clé, pas objet
let formation = null;
let contenuOuvert = null;
let qcm = null;         // état de l'évaluation théorique, tel que le serveur le calcule
let tentative = null;   // la tentative ouverte, figée par le serveur
let iQuestion = 0;      // question affichée
let pratique = null;    // état de l'évaluation pratique, tel que le serveur le calcule
let moiCollab = false;  // suis-je collaborateur ? (je suis alors formé et évalué)
let moiEval = false;    // ai-je le droit d'évaluer ? (indépendant du précédent)
let evalListe = null;   // vue évaluateur : collaborateurs éligibles
let evalFiche = null;   // vue évaluateur : le dossier ouvert
let moiAdmin = false;   // administrateur ? (gère les évaluateurs, n'évalue pas)
let adminComptes = null; // vue admin : les comptes et leur droit d'évaluer
let aRetirer = null;    // retrait d'un droit d'évaluer, en attente de confirmation
let certifs = null;     // état de MES certifications
let adminOnglet = 'evaluateurs';  // écran d'administration : onglet courant
let adminCerts = null;  // vue admin : éligibles, certifiés, écarts
let enSaisie = null;    // { email, geste } : la ligne dépliée en cours de saisie
// Administration des contenus (lot 6). `fAdmin` est VOLONTAIREMENT distincte de
// `fCourante` : l'administrateur travaille sur des brouillons, que le reste de
// l'écran n'a pas le droit de lire.
let adminFormations = null;  // vue admin : le catalogue COMPLET, brouillons compris
let fAdmin = null;           // la formation administrée — clé, pas objet
let adminArbre = null;       // vue admin : modules, contenus, banque et corrigé
let edition = null;          // { objet, id } : le seul formulaire ouvert à la fois
// Le refus du serveur, GARDÉ EN ÉTAT et non posé dans le DOM : chaque geste
// re-rend tout #acAdmin, et un message écrit dans l'encart juste avant serait
// effacé par le rendu suivant — l'administrateur verrait son action échouer
// sans savoir pourquoi.
let admErreur = '';

function echapper(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Ajoute la formation courante à une route de lecture. Le serveur la valide et
// refuse une clé inconnue : l'écran ne décide de rien, il annonce sur quoi il
// travaille.
function avecFormation(route) {
  if (!fCourante) return route;
  return route + (route.includes('?') ? '&' : '?') + 'formation=' + encodeURIComponent(fCourante);
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
  for (const id of ['#acBoot', '#acLogin', '#acBloc', '#acSommaire', '#acLecteur', '#acQcm', '#acEval', '#acAdmin']) montrer(id, id === ecran);
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

  moiCollab = !!moi.data.collaborateur;
  moiEval = !!moi.data.evaluateur;
  moiAdmin = !!moi.data.admin;

  // Un client n'a rien à faire ici : on le lui dit franchement plutôt que de
  // lui servir une formation vide.
  if (!moiCollab && !moiEval && !moiAdmin) {
    bloquer('🔒', 'Formation réservée aux collaborateurs',
      // Ce message précède le chargement du catalogue : il parle de l'Academy,
      // pas d'une formation en particulier — et n'en nomme donc aucune.
      'My Coach Academy est réservée aux collaborateurs My Coach. Si tu es client, ton espace se trouve sur la page d\'accueil de l\'application.');
    return;
  }
  // Qui n'est pas collaborateur n'a pas de formation à suivre — un formateur
  // extérieur, l'administrateur : il arrive directement sur ce qui le concerne
  // plutôt que sur un sommaire vide. Les écrans se renvoient l'un à l'autre
  // quand il a les deux droits.
  // Le catalogue vaut pour tout le monde : l'évaluateur et l'administrateur
  // doivent savoir sur quelle formation ils agissent, autant que le
  // collaborateur doit savoir laquelle il suit.
  await chargerCatalogue();

  if (!moiCollab) {
    if (moiEval) { await ouvrirEvaluateur(); return; }
    await ouvrirAdmin();
    return;
  }
  await chargerFormation();
}

// Le catalogue d'abord : c'est lui qui dit quelles formations existent et
// laquelle ouvrir par défaut.
async function chargerCatalogue() {
  const r = await apiAc('/api/academy/formations');
  if (!r.data || !r.data.ok) { catalogue = []; return; }
  catalogue = r.data.formations || [];
  // On garde la formation courante si elle est toujours au catalogue ; sinon on
  // retombe sur celle que le serveur désigne. Jamais sur une clé inventée ici.
  if (!fCourante || !catalogue.some((f) => f.cle === fCourante)) {
    fCourante = r.data.defaut || (catalogue.length ? catalogue[0].cle : null);
  }
}

// La formation courante, telle que le catalogue la décrit. C'est elle qui porte
// les drapeaux : pratique obligatoire, certification active.
const formationCourante = () => catalogue.find((f) => f.cle === fCourante) || null;

// CHANGER DE FORMATION, C'EST TOUT VIDER PUIS TOUT RELIRE. Garder ne serait-ce
// qu'un état de l'ancienne ferait afficher la progression d'un parcours sous le
// nom d'un autre.
async function changerFormation(cle) {
  if (!cle || cle === fCourante) return;
  fCourante = cle;
  formation = null; qcm = null; pratique = null; certifs = null;
  contenuOuvert = null; tentative = null; iQuestion = 0;
  await chargerFormation();
}

async function chargerFormation() {
  const r = await apiAc(avecFormation('/api/academy/formation'));
  // La certification a pu être retirée entre-temps : le serveur ferme, l'écran suit.
  if (r.status === 403) { await demarrer(); return; }
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) { bloquer('⚠️', 'Formation indisponible', 'Réessaie dans un instant.'); return; }
  formation = r.data.formation;
  await chargerQcm();
  await chargerPratique();
  await chargerCertifs();
  rendreSommaire();
}

// L'état de l'évaluation est TOUJOURS relu au serveur : « la formation est-elle
// achevée », « la théorie est-elle validée », « une tentative est-elle
// ouverte » sont trois questions dont l'écran n'a pas les réponses.
async function chargerQcm() {
  const r = await apiAc(avecFormation('/api/academy/qcm'));
  qcm = r.data && r.data.ok ? r.data.qcm : null;
}

// Même principe pour l'étape suivante : « ma pratique est-elle validée » est une
// question dont l'écran n'a pas la réponse, et ne doit pas l'inventer.
async function chargerPratique() {
  const r = await apiAc(avecFormation('/api/academy/pratique'));
  pratique = r.data && r.data.ok ? r.data.pratique : null;
}

// Le dernier maillon. « Suis-je certifié » est une question dont l'écran n'a
// pas la réponse : elle dépend de prérequis qu'il ne calcule pas et d'une
// décision qu'il ne prend pas.
async function chargerCertifs() {
  const r = await apiAc('/api/academy/certification');
  certifs = r.data && r.data.ok ? r.data.certifications : null;
}

// --- Sommaire ----------------------------------------------------------------

function etatDe(c) {
  if (c.termine) return ['ac-fait', '✓'];
  if (c.commence) return ['ac-encours', '▶'];
  return ['ac-avenir', '○'];
}

// Le sélecteur n'existe que s'il y a un choix à faire. Avec une seule
// formation au catalogue, l'écran reste exactement celui d'avant.
// Le titre que porte celui qui obtient la formation courante. Ces phrases
// n'ont plus à connaître « Coach Nutrition » : elles nomment ce que le
// catalogue déclare.
const titreCourant = () => {
  const f = formationCourante();
  return f && f.titre ? f.titre : 'certifié';
};

const nomFormation = (cle) => {
  const f = catalogue.find((x) => x.cle === cle);
  return f ? f.libelle : (cle || '');
};

// Le même sélecteur pour l'évaluateur et l'administrateur : changer de
// formation y recharge l'écran courant, comme pour le collaborateur.
function rendreSelecteurEval() {
  if (!catalogue || catalogue.length < 2) return '';
  return '<div class="ac-sel">' + catalogue.map((f) =>
    '<button type="button" class="ac-sel-b' + (f.cle === fCourante ? ' on' : '') + '"' +
      ' data-formation-eval="' + echapper(f.cle) + '">' + echapper(f.libelle) + '</button>').join('') + '</div>';
}

function rendreSelecteur() {
  if (!catalogue || catalogue.length < 2) return '';
  return '<div class="ac-sel" role="tablist" aria-label="Mes formations">' +
    catalogue.map((f) =>
      '<button type="button" role="tab" class="ac-sel-b' + (f.cle === fCourante ? ' on' : '') + '"' +
        ' aria-selected="' + (f.cle === fCourante ? 'true' : 'false') + '"' +
        ' data-formation="' + echapper(f.cle) + '">' + echapper(f.libelle) + '</button>').join('') +
    '</div>';
}

function rendreSommaire() {
  const f = formation;
  const reprise = f.reprise ? f.modules.flatMap((m) => m.contenus).find((c) => c.id === f.reprise) : null;

  const cat = formationCourante();

  $('#acSommaire').innerHTML =
    rendreSelecteur() +
    // LE NOM VIENT DU CATALOGUE. Plus aucun titre de formation écrit en dur :
    // une formation ajoutée demain s'annonce toute seule.
    '<h1 class="ec-t">' + echapper(cat ? cat.libelle : 'Ma formation') + '</h1>' +
    '<p class="ec-sub">' + (cat && cat.titre
      ? 'Les modules à suivre pour devenir ' + echapper(cat.titre) + '.'
      : 'Les modules de ce parcours.') + '</p>' +

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
    rendreCartePratique() +
    rendreCartesCertification() +
    rendreAccesEvaluateur() +
    rendreAccesAdmin() +

    (f.modules.length ? f.modules.map(rendreModule).join('')
      : '<div class="ec-vide">Aucun module de formation pour le moment.</div>');

  document.querySelectorAll('#acSommaire [data-formation]').forEach((el) =>
    el.addEventListener('click', () => changerFormation(el.dataset.formation)));

  const b = $('#acReprendre');
  if (b) b.addEventListener('click', () => ouvrir(f.reprise));
  const g = $('#acQcmGo');
  if (g) g.addEventListener('click', ouvrirEvaluation);
  const v = $('#acQcmVoir');
  if (v) v.addEventListener('click', ouvrirEvaluation);
  const ev = $('#acEvalGo');
  if (ev) ev.addEventListener('click', ouvrirEvaluateur);
  const ad = $('#acAdminGo');
  if (ad) ad.addEventListener('click', ouvrirAdmin);
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
      '<b>Évaluation théorique — ' + echapper(nomFormation(fCourante)) + '</b>' +
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
      // « Prochaine étape » ne s'annonce que si elle en est vraiment une : une
      // fois la pratique validée, cette phrase deviendrait fausse — et l'écran
      // se contredirait avec la carte du dessous.
      (pratique && pratique.validee ? '' : '<p class="ac-qcm-next">Prochaine étape : évaluation pratique</p>') +
      (qcm.certifie
        ? '<p class="ac-qcm-note">Tu es ' + echapper(titreCourant()) + '.</p>'
        // Le point le plus important de tout l'écran : réussir le QCM ne
        // certifie personne. Le dire à moitié laisserait croire l'inverse.
        : '<p class="ac-qcm-note">Tu n\'es pas encore ' + echapper(titreCourant()) +
            ' : la certification est prononcée par ton évaluateur après l\'évaluation pratique.</p>');
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
  const r = await apiAc('/api/academy/qcm/tentatives', 'POST', { formation: fCourante });
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
      '<h1 class="ac-lec-t">' + echapper(nomFormation(fCourante)) + '</h1>' +
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
            ? '<p class="ac-res-note">Tu es ' + echapper(titreCourant()) + ' : ce résultat ne change rien à ta certification.</p>'
            : '<p class="ac-res-note">Tu n\'es pas encore ' + echapper(titreCourant()) +
                '. La certification est prononcée par ton évaluateur, après l\'évaluation pratique.</p>') +
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

// --- Évaluation pratique -----------------------------------------------------
//
//  L'étape que personne n'automatise. Cet écran affiche une décision humaine
//  et, pour un évaluateur, la saisit. Deux choses qu'il ne fait JAMAIS :
//   - décider à la place de l'évaluateur (aucun résultat n'est calculé ici) ;
//   - laisser croire qu'une pratique validée vaut certification. Elle ne la
//     vaut pas, et l'écran l'écrit à chaque état concerné.

const LIB_PRATIQUE = {
  non_accessible: 'Non accessible',
  a_realiser: 'À réaliser',
  en_attente: 'Résultat en attente',
  validee: 'Évaluation validée',
  a_repasser: 'Évaluation à repasser',
};
const LIB_RESULTAT = { valide: 'Validée', a_repasser: 'À repasser' };

const aujourdhuiIso = () => {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
};

// Une tentative, telle qu'elle apparaît dans un historique.
function ligneTentative(t) {
  return '<li>' +
    '<b>' + echapper(dateFr(t.dateEvaluation || t.ouverteLe)) + '</b> — ' +
    (t.resultat ? echapper(LIB_RESULTAT[t.resultat] || t.resultat) : 'résultat en attente') +
    (t.evaluateurPrenom || t.evaluateur
      ? ' · évaluateur : ' + echapper(t.evaluateurPrenom || t.evaluateur) : '') +
    (t.cas ? ' · ' + echapper(t.cas) : '') +
    (t.commentaire ? '<span class="ac-prat-com">' + echapper(t.commentaire) + '</span>' : '') +
    '</li>';
}

function rendreCartePratique() {
  if (!pratique) return '';
  // LE DRAPEAU DE LA FORMATION DÉCIDE. Une formation sans évaluation pratique
  // n'affiche pas une étape « non requise » : elle n'en affiche aucune.
  const cat = formationCourante();
  if (cat && !cat.pratiqueObligatoire) return '';
  const e = pratique.etat;
  const entete =
    '<div class="ac-qcm-h">' +
      '<b>Évaluation pratique — ' + echapper(nomFormation(fCourante)) + '</b>' +
      '<span class="ac-qcm-etat ac-etat-p-' + e.replace(/_/g, '-') + '">' + echapper(LIB_PRATIQUE[e] || '') + '</span>' +
    '</div>';

  // Le rappel qui doit survivre à tous les états : cette étape n'est pas la
  // certification. Le dire une fois ne suffit pas, on le dit là où c'est
  // tentant de croire le contraire.
  const pasCertifie = pratique.certifie
    ? '<p class="ac-qcm-note">Tu es ' + echapper(titreCourant()) + '.</p>'
    : '<p class="ac-qcm-note">La certification ' + echapper(nomFormation(fCourante)) +
        ' sera prononcée dans un second temps : cette étape ne la remplace pas.</p>';

  let corps = '';
  if (e === 'non_accessible') {
    corps =
      '<p class="ac-qcm-p"><span aria-hidden="true">🔒</span> Évaluation pratique verrouillée : valide d\'abord l\'évaluation théorique.</p>';
  } else if (e === 'a_realiser') {
    corps =
      '<p class="ac-qcm-p">Ta théorie est validée : tu peux passer à l\'évaluation pratique.</p>' +
      '<p class="ac-qcm-s">Elle se déroule avec un évaluateur, en conditions réelles. C\'est lui qui la programme et en enregistre le résultat.</p>' +
      pasCertifie;
  } else if (e === 'en_attente') {
    const t = pratique.enAttente;
    corps =
      '<p class="ac-qcm-p">Ton évaluation pratique a été ouverte' +
        (t && t.dateEvaluation ? ' pour le ' + echapper(dateFr(t.dateEvaluation)) : '') + '.</p>' +
      '<p class="ac-qcm-s">Résultat en attente : ton évaluateur l\'enregistrera après la séance.</p>' +
      pasCertifie;
  } else if (e === 'validee') {
    const t = t_valide(pratique);
    corps =
      '<p class="ac-qcm-ok"><span aria-hidden="true">✓</span> Évaluation pratique validée' +
        (pratique.valideeLe ? ' le ' + echapper(dateFr(pratique.valideeLe)) : '') + '.</p>' +
      (t && t.commentaire ? '<p class="ac-qcm-s">« ' + echapper(t.commentaire) + ' »</p>' : '') +
      '<p class="ac-qcm-s">L\'étape pratique est terminée : elle ne se repasse pas.</p>' +
      pasCertifie;
  } else {
    const t = pratique.derniere;
    corps =
      '<p class="ac-qcm-ko">Évaluation pratique à repasser' +
        (t && t.dateEvaluation ? ' — séance du ' + echapper(dateFr(t.dateEvaluation)) : '') + '.</p>' +
      (t && t.commentaire ? '<p class="ac-qcm-s">« ' + echapper(t.commentaire) + ' »</p>' : '') +
      '<p class="ac-qcm-s">Ton évaluateur te reconvoquera : les tentatives ne sont pas limitées.</p>' +
      pasCertifie;
  }

  const histo = pratique.historique.length
    ? '<details class="ac-qcm-histo"><summary>Mes évaluations pratiques (' + pratique.historique.length + ')</summary><ul>' +
      pratique.historique.map(ligneTentative).join('') + '</ul></details>'
    : '';

  return '<section class="ac-qcm-carte ac-prat-' + e.replace(/_/g, '-') + '">' + entete + corps + histo + '</section>';
}

// La tentative validée, retrouvée dans l'historique : c'est elle qui porte
// l'appréciation, pas forcément la dernière ligne.
function t_valide(p) {
  return p.historique.find((t) => t.resultat === 'valide') || null;
}

function rendreAccesEvaluateur() {
  if (!moiEval) return '';
  return '<section class="ac-qcm-carte ac-eval-acces">' +
    '<div class="ac-qcm-h"><b>Espace évaluateur</b>' +
      '<span class="ac-qcm-etat ac-etat-eval">Évaluateur</span></div>' +
    '<p class="ac-qcm-s">Enregistre le résultat des évaluations pratiques des collaborateurs dont la théorie est validée.</p>' +
    '<button type="button" class="ec-btn ec-btn-p ac-reprendre" id="acEvalGo">Ouvrir mes évaluations</button>' +
    '</section>';
}

// --- Espace évaluateur --------------------------------------------------------

async function ouvrirEvaluateur() {
  const r = await apiAc(avecFormation('/api/academy/evaluateur/collaborateurs'));
  if (r.status === 401) { deconnecter(); return; }
  if (r.status === 403) {
    bloquer('🔒', 'Espace évaluateur',
      'Seuls les évaluateurs désignés peuvent enregistrer une évaluation pratique.');
    return;
  }
  if (!r.data.ok) { bloquer('⚠️', 'Espace indisponible', 'Réessaie dans un instant.'); return; }
  evalListe = r.data.collaborateurs;
  evalFiche = null;
  rendreEvalListe();
}

function rendreEvalListe() {
  $('#acEval').innerHTML =
    (moiCollab ? '<button type="button" class="ec-back" id="acEvalBack">← Ma formation</button>' : '') +
    (moiAdmin ? '<button type="button" class="ec-back" id="acEvalAdmin">Administration →</button>' : '') +
    '<h1 class="ec-t">Évaluations pratiques</h1>' +
    // POUR QUELLE FORMATION. Un évaluateur qui intervient sur plusieurs
    // parcours doit le lire avant de prononcer un résultat, pas le deviner.
    rendreSelecteurEval() +
    '<p class="ec-sub">Les collaborateurs de <b>' + echapper(nomFormation(fCourante)) +
      '</b> dont la partie théorique est validée. ' +
      'Ceux qui n\'en sont pas là n\'apparaissent pas : l\'évaluation pratique leur reste fermée.</p>' +

    (evalListe.length
      ? '<div class="ac-liste">' + evalListe.map((c) =>
          '<button type="button" class="ac-l ac-eval-l" data-collab="' + echapper(c.email) + '">' +
            '<span class="ac-l-t">' +
              '<b>' + echapper(c.prenom || c.email) + '</b>' +
              '<span class="ac-eval-mail">' + echapper(c.email) + '</span>' +
            '</span>' +
            '<span class="ac-eval-etat ac-etat-p-' + c.etat.replace(/_/g, '-') + '">' +
              echapper(LIB_PRATIQUE[c.etat] || '') + '</span>' +
          '</button>').join('') + '</div>'
      : '<div class="ec-vide">Aucun collaborateur n\'a encore validé la partie théorique.</div>');

  document.querySelectorAll('[data-formation-eval]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (el.dataset.formationEval === fCourante) return;
      fCourante = el.dataset.formationEval;
      evalListe = null; evalFiche = null;
      await ouvrirEvaluateur();
    }));

  const b = $('#acEvalBack');
  // On relit son propre état en revenant : un évaluateur est souvent aussi un
  // collaborateur, et sa carte doit refléter ce qui s'est passé entre-temps.
  if (b) b.addEventListener('click', async () => { await chargerPratique(); rendreSommaire(); });
  const ga = $('#acEvalAdmin');
  if (ga) ga.addEventListener('click', ouvrirAdmin);
  document.querySelectorAll('#acEval [data-collab]').forEach((el) =>
    el.addEventListener('click', () => ouvrirFiche(el.dataset.collab)));

  afficher('#acEval');
  window.scrollTo(0, 0);
}

async function ouvrirFiche(email) {
  const r = await apiAc(avecFormation('/api/academy/evaluateur/collaborateurs/' + encodeURIComponent(email)));
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) {
    bloquer('🔍', 'Dossier indisponible', r.data.error || 'Ce collaborateur n\'est pas évaluable.');
    return;
  }
  evalFiche = r.data;
  rendreEvalFiche();
}

function rendreEvalFiche() {
  const c = evalFiche.collaborateur;
  const p = evalFiche.pratique;
  const attente = p.enAttente;

  $('#acEval').innerHTML =
    '<button type="button" class="ec-back" id="acEvalRetour">← Tous les collaborateurs</button>' +
    '<div class="ac-lec-h">' +
      '<p class="ac-lec-mod">Évaluation pratique — ' + echapper(nomFormation(fCourante)) + '</p>' +
      '<h1 class="ac-lec-t">' + echapper(c.prenom || c.email) + '</h1>' +
    '</div>' +

    '<div class="ac-qcm-carte">' +
      '<div class="ac-qcm-h"><b>' + echapper(c.email) + '</b>' +
        '<span class="ac-qcm-etat ac-etat-p-' + p.etat.replace(/_/g, '-') + '">' +
          echapper(LIB_PRATIQUE[p.etat] || '') + '</span></div>' +
      '<p class="ac-qcm-s">Théorie validée' +
        (p.scoreTheorie !== null && p.scoreTheorie !== undefined ? ' — score : ' + p.scoreTheorie + ' %' : '') + '.</p>' +
      (p.certifie
        ? '<p class="ac-qcm-note">Ce collaborateur est déjà ' + echapper(titreCourant()) + '.</p>'
        : '<p class="ac-qcm-note">Enregistrer un résultat ne certifie pas le collaborateur : la certification est un geste distinct.</p>') +
    '</div>' +

    (p.historique.length
      ? '<div class="ac-res-revoir"><b>Historique</b><ul class="ac-prat-histo">' +
        p.historique.map(ligneTentative).join('') + '</ul></div>'
      : '') +

    // ÉTAPE CLOSE : plus de formulaire. Une pratique validée termine le
    // parcours pratique — le serveur refuse toute nouvelle tentative, et
    // laisser des boutons qui échouent serait une invitation à essayer.
    (p.close
      ? '<div class="ac-qcm-fin">' +
          '<p class="ac-qcm-ok"><span aria-hidden="true">✓</span> Étape pratique terminée : validée le ' +
            echapper(dateFr(p.valideeLe)) + '.</p>' +
          '<p class="ac-q-aide">Aucune nouvelle évaluation ne peut être ouverte pour ce collaborateur : ' +
            'la validation est acquise et l\'historique reste consultable ci-dessus.</p>' +
        '</div>'
      :

    '<div class="ac-qcm-fin">' +
      '<h2 class="ac-eval-t">' + (attente
        ? 'Séance ouverte le ' + echapper(dateFr(attente.ouverteLe)) + ' — enregistrer le résultat'
        : 'Enregistrer une évaluation') + '</h2>' +

      '<label class="ec-field"><span>Date de l\'évaluation</span>' +
        '<input id="acEvDate" type="date" value="' +
          echapper((attente && attente.dateEvaluation) || aujourdhuiIso()) + '" /></label>' +
      '<label class="ec-field"><span>Cas ou support utilisé (facultatif)</span>' +
        '<input id="acEvCas" type="text" maxlength="200" placeholder="Ex. : mise en situation S1" value="' +
          echapper((attente && attente.cas) || '') + '" /></label>' +
      '<label class="ec-field"><span>Appréciation — communiquée au collaborateur (facultatif)</span>' +
        '<textarea id="acEvCom" rows="3" maxlength="2000" placeholder="Ce qui est acquis, ce qui reste à travailler."></textarea></label>' +

      '<p class="ac-eval-err" id="acEvErr" role="alert"></p>' +
      '<div class="ac-eval-actions">' +
        '<button type="button" class="ec-btn ec-btn-p" id="acEvOk">Enregistrer : évaluation validée</button>' +
        '<button type="button" class="ec-btn" id="acEvKo">Enregistrer : à repasser</button>' +
      '</div>' +
      (attente ? '' :
        '<button type="button" class="ec-btn ac-eval-plus" id="acEvOuvrir">Ouvrir la séance sans saisir le résultat</button>') +
      '<p class="ac-q-aide">Une évaluation prononcée n\'est plus modifiable : tant que la pratique n\'est pas ' +
        'validée, enregistre une nouvelle évaluation. L\'historique les conserve toutes.</p>' +
    '</div>');

  $('#acEvalRetour').addEventListener('click', ouvrirEvaluateur);
  const ok_ = $('#acEvOk');
  if (ok_) ok_.addEventListener('click', () => enregistrer('valide'));
  const ko_ = $('#acEvKo');
  if (ko_) ko_.addEventListener('click', () => enregistrer('a_repasser'));
  const o = $('#acEvOuvrir');
  if (o) o.addEventListener('click', () => enregistrer(null));

  afficher('#acEval');
  window.scrollTo(0, 0);
}

// Un seul chemin de saisie pour les deux gestes : ouvrir une séance (resultat
// nul) ou prononcer un verdict. Si une séance attend déjà, on la complète
// plutôt que d'en ouvrir une seconde.
async function enregistrer(resultat) {
  const p = evalFiche.pratique;
  const err = $('#acEvErr');
  err.textContent = '';
  const corps = {
    resultat,
    // L'action est SCOPÉE : le droit d'évaluer est global, la décision ne
    // l'est jamais.
    formation: fCourante,
    dateEvaluation: $('#acEvDate').value || null,
    cas: $('#acEvCas').value || null,
    commentaire: $('#acEvCom').value || null,
  };
  ['#acEvOk', '#acEvKo', '#acEvOuvrir'].forEach((sel) => { const b = $(sel); if (b) b.disabled = true; });

  const r = p.enAttente
    ? await apiAc('/api/academy/evaluateur/evaluations/' + p.enAttente.id, 'PUT', corps)
    : await apiAc('/api/academy/evaluateur/collaborateurs/' +
        encodeURIComponent(evalFiche.collaborateur.email) + '/evaluations', 'POST', corps);

  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) {
    err.textContent = r.data.error || 'Enregistrement impossible.';
    ['#acEvOk', '#acEvKo', '#acEvOuvrir'].forEach((sel) => { const b = $(sel); if (b) b.disabled = false; });
    return;
  }
  evalFiche = { collaborateur: evalFiche.collaborateur, pratique: r.data.pratique };
  rendreEvalFiche();
}

// --- Gestion des évaluateurs (administrateur) ---------------------------------
//
//  UN écran, deux gestes : désigner, retirer. Ce n'est pas l'administration de
//  l'Academy — ni contenus, ni banque de questions, ni configuration. Juste ce
//  qu'il faut pour que faire tourner l'évaluation pratique ne demande plus
//  d'appel API à la main.
//
//  DEUX CHOSES QUE CET ÉCRAN NE FAIT PAS :
//   - il ne rend pas l'administrateur évaluateur. Administrer et habiliter sont
//     deux métiers ; un admin qui veut évaluer se désigne, et le geste est tracé
//     comme n'importe quel autre ;
//   - il ne décide de rien. Chaque clic part au serveur, qui reste seul juge :
//     le drapeau `admin` reçu au démarrage ne sert qu'à afficher l'entrée.

function rendreAccesAdmin() {
  if (!moiAdmin) return '';
  return '<section class="ac-qcm-carte ac-adm-acces">' +
    '<div class="ac-qcm-h"><b>Administration My Coach Academy</b>' +
      '<span class="ac-qcm-etat ac-etat-admin">Administrateur</span></div>' +
    '<p class="ac-qcm-s">Désigne les évaluateurs et délivre les certifications au terme du parcours.</p>' +
    '<button type="button" class="ec-btn ec-btn-p ac-reprendre" id="acAdminGo">Ouvrir l\'administration</button>' +
    '</section>';
}

// Chaque onglet lit SES données au moment où il s'affiche. Les écarts entre
// l'Academy et le Boost, comme l'état de publication d'une formation, naissent
// ailleurs — dans une autre session, dans l'administration du Boost : un onglet
// qui réafficherait sa mémoire les manquerait.
async function chargerAdminOnglet() {
  if (adminOnglet === 'contenus') {
    await chargerAdminFormations();
    await chargerAdminArbre();
    return;
  }
  await chargerAdminCerts();
}

async function ouvrirAdmin(onglet) {
  if (onglet) adminOnglet = onglet;
  const r = await apiAc('/api/academy/admin/evaluateurs');
  if (r.status === 401) { deconnecter(); return; }
  if (r.status === 403) {
    bloquer('🔒', 'Administration de l\'Academy', 'Cet écran est réservé à l\'administrateur.');
    return;
  }
  if (!r.data.ok) { bloquer('⚠️', 'Écran indisponible', 'Réessaie dans un instant.'); return; }
  adminComptes = r.data.comptes || [];
  await chargerAdminOnglet();
  aRetirer = null;
  enSaisie = null;
  edition = null;
  rendreAdmin();
}

function rendrePanneauEvaluateurs() {
  const actifs = adminComptes.filter((c) => c.evaluateur).length;
  return '<p class="ec-sub">Qui peut faire passer une évaluation pratique. ' +
      'Être administrateur ne suffit pas : le droit d\'évaluer se désigne, ici, explicitement.</p>' +

    '<div class="ac-adm-compte"><b>' + actifs + '</b> évaluateur' + (actifs > 1 ? 's' : '') +
      ' autorisé' + (actifs > 1 ? 's' : '') + ' sur ' + adminComptes.length + ' compte' +
      (adminComptes.length > 1 ? 's' : '') + '.</div>' +

    (adminComptes.length
      ? '<div class="ac-liste">' + adminComptes.map(ligneCompte).join('') + '</div>'
      : '<div class="ec-vide">Aucun collaborateur à afficher pour le moment.</div>');
}

function rendreAdmin() {
  const certifs_ = adminOnglet === 'certifications';
  const contenus_ = adminOnglet === 'contenus';

  $('#acAdmin').innerHTML =
    // Les écrans se renvoient l'un à l'autre : l'administrateur est souvent
    // aussi évaluateur, parfois aussi collaborateur.
    (moiCollab ? '<button type="button" class="ec-back" id="acAdmBack">← Ma formation</button>'
      : moiEval ? '<button type="button" class="ec-back" id="acAdmEval">← Mes évaluations</button>' : '') +

    '<h1 class="ec-t">Administration My Coach Academy</h1>' +
    rendreOngletsAdmin() +
    '<p class="ac-eval-err" id="acAdmErr" role="alert">' + echapper(admErreur) + '</p>' +
    (contenus_ ? rendreAdminContenus() : certifs_ ? rendreAdminCerts() : rendrePanneauEvaluateurs());

  // Changer d'onglet RELIT les données. Les écarts entre l'Academy et le Boost
  // naissent précisément ailleurs — dans l'administration du Boost, dans une
  // autre session — et un onglet qui réaffiche sa mémoire les manquerait.
  document.querySelectorAll('#acAdmin [data-formation-eval]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (el.dataset.formationEval === fCourante) return;
      fCourante = el.dataset.formationEval;
      enSaisie = null;
      await chargerAdminCerts();
      rendreAdmin();
    }));

  document.querySelectorAll('#acAdmin [data-onglet]').forEach((el) =>
    el.addEventListener('click', async () => {
      adminOnglet = el.dataset.onglet;
      enSaisie = null;
      aRetirer = null;
      edition = null;
      admErreur = '';
      await chargerAdminOnglet();
      rendreAdmin();
    }));

  // L'onglet Contenus a son propre sélecteur de formation : il montre les
  // brouillons, que celui des deux autres onglets n'a pas le droit d'afficher.
  document.querySelectorAll('#acAdmin [data-formation-adm]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (el.dataset.formationAdm === fAdmin) return;
      fAdmin = el.dataset.formationAdm;
      edition = null;
      admErreur = '';
      await chargerAdminArbre();
      rendreAdmin();
    }));

  document.querySelectorAll('#acAdmin [data-adm]').forEach((el) =>
    el.addEventListener('click', () => agirSurContenus(el)));
  document.querySelectorAll('#acAdmin [data-cert]').forEach((el) =>
    el.addEventListener('click', () => agirSurCertification(el.dataset.cert, el.dataset.geste)));

  // Revenir à sa propre formation. On repasse par le catalogue PUBLIÉ : il a pu
  // changer sous les pieds de l'administrateur — c'est justement lui qui vient
  // de publier ou de dépublier.
  const b = $('#acAdmBack');
  if (b) b.addEventListener('click', async () => {
    await chargerCatalogue();
    await chargerFormation();
  });
  const e = $('#acAdmEval');
  if (e) e.addEventListener('click', ouvrirEvaluateur);

  document.querySelectorAll('#acAdmin [data-agir]').forEach((el) =>
    el.addEventListener('click', () => agirSurCompte(el.dataset.compte, el.dataset.agir)));

  afficher('#acAdmin');
  window.scrollTo(0, 0);
}

function ligneCompte(c) {
  const enRetrait = aRetirer === c.email;
  const mail = echapper(c.email);

  // Retirer un droit d'évaluer se confirme. Pas par une boîte de dialogue du
  // navigateur — qui fige la page et qu'on clique sans lire — mais en
  // remplaçant le bouton par sa propre confirmation, à côté d'une sortie.
  const actions = !c.evaluateur
    ? '<button type="button" class="ec-btn ac-adm-b" data-compte="' + mail + '" data-agir="designer">' +
        'Désigner comme évaluateur</button>'
    : enRetrait
      ? '<button type="button" class="ec-btn ac-adm-b ac-adm-danger" data-compte="' + mail + '" data-agir="confirmer">' +
          'Confirmer le retrait</button>' +
        '<button type="button" class="ec-btn ac-adm-b" data-compte="' + mail + '" data-agir="annuler">Annuler</button>'
      : '<button type="button" class="ec-btn ac-adm-b" data-compte="' + mail + '" data-agir="retirer">' +
          'Retirer le droit d\'évaluer</button>';

  return '<div class="ac-l ac-adm-l' + (enRetrait ? ' ac-adm-l-retrait' : '') + '" data-compte="' + mail + '">' +
    '<span class="ac-l-t">' +
      '<b>' + echapper(c.prenom || c.email) + '</b>' +
      '<span class="ac-eval-mail">' + mail +
        (c.collaborateur ? '' : ' · compte externe') + '</span>' +
    '</span>' +
    '<span class="ac-eval-etat ' + (c.evaluateur ? 'ac-etat-eval-oui' : 'ac-etat-eval-non') + '">' +
      (c.evaluateur ? 'Évaluateur' : 'Non évaluateur') + '</span>' +
    '<span class="ac-adm-actions">' + actions + '</span>' +
    (enRetrait ? '<p class="ac-adm-avert">Ce compte ne pourra plus enregistrer d\'évaluation pratique. ' +
      'Les évaluations qu\'il a déjà prononcées restent dans l\'historique.</p>' : '') +
    '</div>';
}

async function agirSurCompte(email, action) {
  // Les deux gestes qui ne touchent qu'à l'écran : ouvrir et fermer la
  // confirmation. Rien ne part au serveur tant que le retrait n'est pas confirmé.
  if (action === 'retirer') { aRetirer = email; rendreAdmin(); return; }
  if (action === 'annuler') { aRetirer = null; rendreAdmin(); return; }

  const r = await apiAc('/api/academy/admin/evaluateurs', 'POST',
    { email, evaluateur: action === 'designer' });
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) { bloquer('⚠️', 'Modification impossible', r.data.error || 'Réessaie dans un instant.'); return; }

  // La liste à jour vient du serveur : l'écran ne devine pas le nouvel état.
  adminComptes = r.data.comptes || adminComptes;
  aRetirer = null;
  // Se retirer à soi-même le droit d'évaluer change ce qu'on a le droit de
  // voir : on relit son propre statut plutôt que de garder un menu périmé.
  if (email === (session && session.email)) {
    const moi = await apiAc('/api/academy/moi');
    if (moi.data && moi.data.ok) moiEval = !!moi.data.evaluateur;
  }
  rendreAdmin();
}

// --- Certification finale -----------------------------------------------------
//
//  Le bout du parcours. L'écran affiche les prérequis un par un — c'est ce qui
//  répond à « où j'en suis ? » sans avoir à deviner — puis le diplôme quand il
//  existe. Il ne délivre rien : la certification est prononcée par un
//  administrateur, et ce geste ouvre les dossiers clients du Boost.
//
//  UNE BOUCLE, PAS UNE CARTE : le registre est multi-formation. Une seule
//  formation le remplit aujourd'hui ; le jour où il y en aura deux, cet écran
//  n'aura rien à apprendre.

function rendreCartesCertification() {
  if (!certifs || !certifs.length) return '';
  // On n'affiche QUE la formation courante — les autres ont leur propre écran —
  // et seulement si elle délivre un titre.
  return certifs
    .filter((c) => c.formation === fCourante && c.certificationActive !== false)
    .map(rendreCarteCertification).join('');
}

function rendreCarteCertification(c) {
  const LIB = { non_eligible: 'Non éligible', eligible: 'Éligible à la certification', certifie: 'Certifié' };
  const entete =
    '<div class="ac-qcm-h">' +
      '<b>Certification — ' + echapper(c.libelle) + '</b>' +
      '<span class="ac-qcm-etat ac-etat-c-' + c.etat.replace(/_/g, '-') + '">' +
        echapper(LIB[c.etat] || '') + '</span>' +
    '</div>';

  // Les prérequis, toujours affichés : savoir ce qui manque vaut mieux que de
  // découvrir qu'on n'est pas éligible sans savoir pourquoi.
  const liste = '<ul class="ac-cert-prereq">' + c.prerequis.map((p) =>
    '<li class="' + (p.rempli ? 'ac-pr-ok' : 'ac-pr-non') + '">' +
      '<span aria-hidden="true">' + (p.rempli ? '✓' : '○') + '</span> ' +
      echapper(p.libelle) + (p.detail ? ' <i>— ' + echapper(p.detail) + '</i>' : '') +
    '</li>').join('') + '</ul>';

  let corps = '';
  if (c.certifie) {
    const d = c.certification;
    corps =
      '<p class="ac-qcm-ok"><span aria-hidden="true">🎓</span> ' + echapper(c.titre) +
        ' — obtenue le ' + echapper(dateFr(d.obtenueLe)) + '.</p>' +
      (d.commentaire ? '<p class="ac-qcm-s">« ' + echapper(d.commentaire) + ' »</p>' : '') +
      '<p class="ac-qcm-s">Tu peux désormais suivre des clients dans le Boost Nutrition.</p>' +
      liste;
  } else if (c.eligible) {
    corps =
      '<p class="ac-qcm-p"><span aria-hidden="true">✓</span> Tout ton parcours est validé : tu es éligible à la certification.</p>' +
      liste +
      // ÉLIGIBLE N'EST PAS CERTIFIÉ. Le dire ici évite qu'on le déduise.
      '<p class="ac-qcm-note">La certification est prononcée par un administrateur My Coach Academy. ' +
        'Tant qu\'elle ne l\'est pas, tu n\'es pas encore ' + echapper(c.titre) + '.</p>';
  } else {
    corps =
      '<p class="ac-qcm-p"><span aria-hidden="true">🔒</span> Certification verrouillée : il te reste des étapes à valider.</p>' +
      liste;
  }

  // Un retrait passé se lit dans l'historique : on ne le cache pas.
  const retires = c.historique.filter((h) => h.statut === 'retiree');
  const histo = retires.length
    ? '<details class="ac-qcm-histo"><summary>Historique de mes certifications (' + c.historique.length + ')</summary><ul>' +
      c.historique.map((h) => '<li><b>' + echapper(dateFr(h.obtenueLe)) + '</b> — ' +
        (h.statut === 'delivree' ? 'délivrée' : 'retirée le ' + echapper(dateFr(h.retireeLe))) +
        (h.motifRetrait ? '<span class="ac-prat-com">' + echapper(h.motifRetrait) + '</span>' : '') +
        '</li>').join('') + '</ul></details>'
    : '';

  return '<section class="ac-qcm-carte ac-cert-' + c.etat.replace(/_/g, '-') + '">' + entete + corps + histo + '</section>';
}

// --- Administration : certifications ------------------------------------------

async function chargerAdminCerts() {
  const r = await apiAc(avecFormation('/api/academy/admin/certifications'));
  adminCerts = r.data && r.data.ok ? r.data : null;
}

function rendreOngletsAdmin() {
  return '<div class="ac-adm-onglets">' +
    ['evaluateurs', 'certifications', 'contenus'].map((o) =>
      '<button type="button" class="ac-adm-ong' + (adminOnglet === o ? ' on' : '') + '" data-onglet="' + o + '">' +
        (o === 'evaluateurs' ? 'Évaluateurs' : o === 'certifications' ? 'Certifications' : 'Contenus') +
        '</button>').join('') +
    '</div>';
}

function rendreAdminCerts() {
  const d = adminCerts || { eligibles: [], certifies: [], ecarts: [] };

  // LES ÉCARTS D'ABORD, et jamais masqués : une différence entre ce que
  // l'Academy a délivré et ce que le Boost autorise est exactement ce qu'on
  // vient chercher ici.
  const ecarts = d.ecarts.length
    ? '<div class="ac-ecarts"><b>Écarts entre l\'Academy et le Boost (' + d.ecarts.length + ')</b><ul>' +
      d.ecarts.map((e) => '<li class="' + (e.anomalie ? 'ac-ecart-ko' : 'ac-ecart-ok') + '">' +
        '<b>' + echapper(e.prenom || e.email) + '</b> — ' + echapper(e.explication) +
        (e.anomalie ? ' <i>à corriger</i>' : ' <i>situation attendue</i>') + '</li>').join('') +
      '</ul></div>'
    : '';

  const ligneEligible = (c) => {
    const saisie = enSaisie && enSaisie.email === c.email && enSaisie.geste === 'delivrer';
    return '<div class="ac-l ac-adm-l' + (saisie ? ' ac-adm-l-saisie' : '') + '">' +
      '<span class="ac-l-t"><b>' + echapper(c.prenom || c.email) + '</b>' +
        '<span class="ac-eval-mail">' + echapper(c.email) + '</span></span>' +
      '<span class="ac-eval-etat ac-etat-c-eligible">Éligible</span>' +
      '<span class="ac-adm-actions">' +
        (saisie
          ? '<button type="button" class="ec-btn ac-adm-b ec-btn-p" data-cert="' + echapper(c.email) + '" data-geste="confirmer-delivrer">Confirmer la délivrance</button>' +
            '<button type="button" class="ec-btn ac-adm-b" data-cert="' + echapper(c.email) + '" data-geste="annuler">Annuler</button>'
          : '<button type="button" class="ec-btn ac-adm-b" data-cert="' + echapper(c.email) + '" data-geste="delivrer">Délivrer la certification</button>') +
      '</span>' +
      (saisie
        ? '<div class="ac-adm-saisie">' +
            '<label class="ec-field"><span>Date d\'obtention</span>' +
              '<input id="acCertDate" type="date" value="' + aujourdhuiIso() + '" /></label>' +
            '<label class="ec-field"><span>Commentaire (facultatif)</span>' +
              '<input id="acCertCom" type="text" maxlength="1000" placeholder="Mention, remarque…" /></label>' +
            '<p class="ac-adm-avert">Cette délivrance ouvrira immédiatement l\'accès aux dossiers clients du Boost.</p>' +
          '</div>'
        : '') +
      '</div>';
  };

  const ligneCertifie = (c) => {
    const saisie = enSaisie && enSaisie.email === c.email && enSaisie.geste === 'retirer';
    const d_ = c.certification || {};
    return '<div class="ac-l ac-adm-l' + (saisie ? ' ac-adm-l-retrait' : '') + '">' +
      '<span class="ac-l-t"><b>' + echapper(c.prenom || c.email) + '</b>' +
        '<span class="ac-eval-mail">' + echapper(c.email) + ' · certifié le ' + echapper(dateFr(d_.obtenueLe)) +
        (d_.delivreePar ? ' par ' + echapper(d_.delivreePar) : '') + '</span></span>' +
      '<span class="ac-eval-etat ac-etat-c-certifie">Certifié</span>' +
      '<span class="ac-adm-actions">' +
        (saisie
          ? '<button type="button" class="ec-btn ac-adm-b ac-adm-danger" data-cert="' + echapper(c.email) + '" data-geste="confirmer-retirer">Confirmer le retrait</button>' +
            '<button type="button" class="ec-btn ac-adm-b" data-cert="' + echapper(c.email) + '" data-geste="annuler">Annuler</button>'
          : '<button type="button" class="ec-btn ac-adm-b" data-cert="' + echapper(c.email) + '" data-geste="retirer">Retirer la certification</button>') +
      '</span>' +
      (saisie
        ? '<div class="ac-adm-saisie">' +
            '<label class="ec-field"><span>Motif du retrait (obligatoire)</span>' +
              '<input id="acCertMotif" type="text" maxlength="1000" placeholder="Pourquoi ce retrait ?" /></label>' +
            '<p class="ac-adm-avert">Le diplôme reste dans l\'historique avec ce motif. Les droits ' +
              echapper(nomFormation(fCourante)) + ' du collaborateur se ferment immédiatement.</p>' +
              'du collaborateur se ferment immédiatement.</p>' +
          '</div>'
        : '') +
      '</div>';
  };

  return rendreSelecteurEval() +
    '<p class="ac-qcm-s">Certifications de <b>' + echapper(nomFormation(fCourante)) + '</b>.</p>' +
    ecarts +
    '<h2 class="ac-eval-t">Éligibles (' + d.eligibles.length + ')</h2>' +
    (d.eligibles.length
      ? '<div class="ac-liste">' + d.eligibles.map(ligneEligible).join('') + '</div>'
      : '<div class="ec-vide">Personne n\'a terminé le parcours pour le moment.</div>') +
    '<h2 class="ac-eval-t ac-eval-t2">Certifiés (' + d.certifies.length + ')</h2>' +
    (d.certifies.length
      ? '<div class="ac-liste">' + d.certifies.map(ligneCertifie).join('') + '</div>'
      : '<div class="ec-vide">Aucune certification délivrée pour le moment.</div>');
}

async function agirSurCertification(email, geste) {
  const err = () => { /* les erreurs s'affichent dans l'encart de la ligne */ };
  if (geste === 'delivrer' || geste === 'retirer') { enSaisie = { email, geste }; rendreAdmin(); return; }
  if (geste === 'annuler') { enSaisie = null; rendreAdmin(); return; }

  let r;
  if (geste === 'confirmer-delivrer') {
    r = await apiAc('/api/academy/admin/certifications/' + encodeURIComponent(email), 'POST', {
      formation: fCourante,
      obtenueLe: ($('#acCertDate') || {}).value || null,
      commentaire: ($('#acCertCom') || {}).value || null,
    });
  } else {
    r = await apiAc('/api/academy/admin/certifications/' + encodeURIComponent(email) + '/retrait', 'POST', {
      formation: fCourante,
      motif: ($('#acCertMotif') || {}).value || '',
    });
  }
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) {
    // Le refus vient du serveur et il dit pourquoi : on le montre tel quel
    // plutôt que d'inventer un message.
    const el = $('#acAdmErr');
    if (el) el.textContent = r.data.error || 'Action impossible.';
    return;
  }
  adminCerts = r.data.liste ? { ...(adminCerts || {}), ...r.data.liste } : adminCerts;
  enSaisie = null;
  rendreAdmin();
  err();
}

// --- Administration : contenus (lot 6) ----------------------------------------
//
//  L'onglet qui remplace le SQL à la main. Il suit l'ordre dans lequel une
//  formation se construit réellement, et non l'ordre des tables :
//
//     nouvelle formation → réglages → modules → vidéos → questions → publication
//
//  DEUX PRINCIPES, LES MÊMES QUE PARTOUT DANS CET ÉCRAN :
//
//   - il ne décide de rien. Ce qui est publiable, ce qui bloque, ce qui n'est
//     qu'un avertissement : tout vient de `verification`, calculée par le
//     serveur. L'écran l'affiche, il ne la recalcule pas — deux vérités
//     finiraient par diverger ;
//   - il ne publie jamais lui-même. Aucun formulaire n'envoie `actif` : publier
//     est une route à part, qui vérifie.
//
//  `fAdmin` est DISTINCTE de `fCourante`. L'administrateur travaille souvent
//  sur un brouillon ; s'il partageait la formation courante, revenir à
//  « Ma formation » ou à l'onglet Certifications afficherait une formation que
//  le reste de l'écran n'a pas le droit de lire.

async function chargerAdminFormations() {
  const r = await apiAc('/api/academy/admin/formations');
  adminFormations = r.data && r.data.ok ? (r.data.formations || []) : [];
  if (!fAdmin || !adminFormations.some((f) => f.cle === fAdmin)) {
    fAdmin = adminFormations.length ? adminFormations[0].cle : null;
  }
}

async function chargerAdminArbre() {
  if (!fAdmin) { adminArbre = null; return; }
  const r = await apiAc('/api/academy/admin/arbre?formation=' + encodeURIComponent(fAdmin));
  adminArbre = r.data && r.data.ok ? r.data : null;
}

// Le geste d'écriture, toujours le même : envoyer, afficher l'erreur telle que
// le serveur la formule, reprendre l'arbre qu'il renvoie. L'écran ne devine
// jamais le nouvel état.
async function ecrireAdmin(route, corps) {
  admErreur = '';
  const r = await apiAc(route, 'POST', { formation: fAdmin, ...(corps || {}) });
  if (r.status === 401) { deconnecter(); return null; }
  if (!r.data.ok) {
    admErreur = r.data.error || 'Action impossible.';
    // UN REFUS NE DOIT PAS EFFACER CE QUI VIENT D'ÊTRE TAPÉ. Re-rendre
    // réécrirait le formulaire depuis la base, donc reviendrait à demander à
    // l'administrateur de tout retaper pour une case oubliée. On ne re-rend
    // donc que quand il n'y a aucune saisie à perdre : le refus de publication,
    // qui rapporte une vérification à réafficher.
    if (r.data.verification) {
      adminArbre = { ...(adminArbre || {}), verification: r.data.verification };
      rendreAdmin();
    } else {
      const el = $('#acAdmErr');
      if (el) el.textContent = admErreur;
    }
    return null;
  }
  if (r.data.arbre) adminArbre = { ...(adminArbre || {}), ...r.data.arbre };
  else await chargerAdminArbre();
  edition = null;
  rendreAdmin();
  return r.data;
}

const champ = (id) => (($(id) || {}).value || '').trim();
const coche = (id) => !!(($(id) || {}).checked);

// Le sélecteur d'administration : le catalogue COMPLET, brouillons marqués.
// C'est le seul endroit de l'application où un brouillon s'affiche.
function rendreSelecteurAdmin() {
  const l = adminFormations || [];
  return '<div class="ac-sel ac-adm-sel">' +
    l.map((f) => '<button type="button" class="ac-sel-b' + (f.cle === fAdmin ? ' on' : '') + '"' +
      ' data-formation-adm="' + echapper(f.cle) + '">' + echapper(f.libelle) +
      (f.actif ? '' : ' <i class="ac-adm-brouillon">brouillon</i>') + '</button>').join('') +
    '<button type="button" class="ac-sel-b ac-adm-neuve" data-adm="formation-neuve">+ Nouvelle formation</button>' +
    '</div>';
}

// Le formulaire de création d'une formation. La clé est saisie une seule fois :
// elle voyage ensuite dans des URL et sert de valeur dans une dizaine de
// colonnes, elle ne se renomme pas.
function rendreFormFormationNeuve() {
  return '<div class="ac-adm-form">' +
    '<h2 class="ac-eval-t">Nouvelle formation</h2>' +
    '<p class="ac-qcm-s">Elle sera créée en brouillon : invisible des collaborateurs tant que tu ne l\'auras pas publiée.</p>' +
    '<label class="ec-field"><span>Nom de la formation</span>' +
      '<input id="acFLibelle" type="text" maxlength="120" placeholder="Coach Sommeil" /></label>' +
    '<label class="ec-field"><span>Clé technique (minuscules, chiffres et « _ »)</span>' +
      '<input id="acFCle" type="text" maxlength="40" placeholder="coach_sommeil" /></label>' +
    '<label class="ec-field"><span>Titre délivré</span>' +
      '<input id="acFTitre" type="text" maxlength="120" placeholder="Coach Sommeil certifié" /></label>' +
    '<div class="ac-adm-actions ac-adm-actions-form">' +
      '<button type="button" class="ec-btn ec-btn-p ac-adm-b" data-adm="formation-creer">Créer le brouillon</button>' +
      '<button type="button" class="ec-btn ac-adm-b" data-adm="annuler">Annuler</button>' +
    '</div></div>';
}

// Les réglages. Ce sont EXACTEMENT les colonnes du catalogue — pas une de plus,
// et surtout pas `actif` : la publication a son propre bouton, et elle vérifie.
function rendreReglages(f) {
  const oui = (v) => (v ? ' checked' : '');
  return '<details class="ac-adm-bloc"' + (edition && edition.objet === 'reglages' ? ' open' : '') + '>' +
    '<summary class="ac-adm-som">Réglages de la formation</summary>' +
    '<div class="ac-adm-form">' +
      '<label class="ec-field"><span>Nom de la formation</span>' +
        '<input id="acRLibelle" type="text" maxlength="120" value="' + echapper(f.libelle) + '" /></label>' +
      '<label class="ec-field"><span>Titre délivré (requis si la formation certifie)</span>' +
        '<input id="acRTitre" type="text" maxlength="120" value="' + echapper(f.titre || '') + '" /></label>' +
      '<div class="ac-adm-duo">' +
        '<label class="ec-field"><span>Questions tirées</span>' +
          '<input id="acRNb" type="number" min="1" max="200" value="' + f.qcmNbQuestions + '" /></label>' +
        '<label class="ec-field"><span>Seuil de réussite (%)</span>' +
          '<input id="acRSeuil" type="number" min="0" max="100" value="' + f.qcmSeuilPct + '" /></label>' +
        '<label class="ec-field"><span>Ordre au catalogue</span>' +
          '<input id="acROrdre" type="number" min="0" max="9999" value="' + f.ordre + '" /></label>' +
      '</div>' +
      '<label class="ac-adm-case"><input id="acRPratique" type="checkbox"' + oui(f.pratiqueObligatoire) + ' />' +
        '<span>Évaluation pratique obligatoire</span></label>' +
      '<label class="ac-adm-case"><input id="acRCertif" type="checkbox"' + oui(f.certificationActive) + ' />' +
        '<span>Délivre une certification</span></label>' +
      '<div class="ac-adm-actions ac-adm-actions-form">' +
        '<button type="button" class="ec-btn ec-btn-p ac-adm-b" data-adm="reglages-enregistrer">Enregistrer les réglages</button>' +
      '</div>' +
    '</div></details>';
}

// L'état de publication. LES BLOCAGES D'ABORD ET JAMAIS MASQUÉS : c'est ce qui
// répond à « pourquoi je ne peux pas publier ? » sans avoir à chercher.
function rendrePublication(v, f) {
  const liste = (titre, items, classe) => (items && items.length
    ? '<div class="' + classe + '"><b>' + titre + '</b><ul>' +
      items.map((t) => '<li>' + echapper(t) + '</li>').join('') + '</ul></div>'
    : '');

  const c = v.chiffres || {};
  return '<div class="ac-adm-bloc ac-adm-pub' + (v.publiee ? ' ac-adm-pub-on' : '') + '">' +
    '<div class="ac-qcm-h"><b>' + (v.publiee ? 'Formation publiée' : 'Brouillon') + '</b>' +
      '<span class="ac-qcm-etat ' + (v.publiee ? 'ac-etat-theorie-validee' : '') + '">' +
        (v.publiee ? 'Visible des collaborateurs' : 'Invisible des collaborateurs') + '</span></div>' +
    '<p class="ac-qcm-s">' + c.modules + ' module' + (c.modules > 1 ? 's' : '') + ' actif' + (c.modules > 1 ? 's' : '') +
      ' · ' + c.contenus + ' contenu' + (c.contenus > 1 ? 's' : '') +
      ' · ' + c.questionsTirables + ' question' + (c.questionsTirables > 1 ? 's' : '') +
      ' tirable' + (c.questionsTirables > 1 ? 's' : '') + ' pour ' + c.qcmNbQuestions + ' tirée' +
      (c.qcmNbQuestions > 1 ? 's' : '') + '.</p>' +
    liste('Ce qui empêche la publication', v.blocages, 'ac-ecarts ac-adm-blocages') +
    liste('À savoir', v.avertissements, 'ac-ecarts ac-adm-avertis') +
    '<div class="ac-adm-actions ac-adm-actions-form">' +
      (v.publiee
        ? '<button type="button" class="ec-btn ac-adm-b ac-adm-danger" data-adm="depublier">Dépublier</button>'
        : '<button type="button" class="ec-btn ec-btn-p ac-adm-b" data-adm="publier"' +
            (v.publiable ? '' : ' disabled') + '>Publier la formation</button>') +
    '</div>' +
    (v.publiee ? '<p class="ac-adm-avert">Dépublier la retire du catalogue. Rien n\'est effacé : progression, ' +
      'tentatives et certifications déjà délivrées restent en base.</p>' : '') +
    '</div>';
}

// Le formulaire d'un module ou d'un contenu. Un seul par écran à la fois :
// deux formulaires ouverts, c'est deux brouillons qu'on croit enregistrés.
function rendreFormModule(m) {
  return '<div class="ac-adm-form ac-adm-form-in">' +
    '<label class="ec-field"><span>Titre du module</span>' +
      '<input id="acMTitre" type="text" maxlength="200" value="' + echapper(m ? m.titre : '') + '" /></label>' +
    '<label class="ec-field"><span>Description (facultative)</span>' +
      '<input id="acMDesc" type="text" maxlength="500" value="' + echapper(m ? (m.description || '') : '') + '" /></label>' +
    '<div class="ac-adm-actions ac-adm-actions-form">' +
      '<button type="button" class="ec-btn ec-btn-p ac-adm-b" data-adm="module-enregistrer">Enregistrer</button>' +
      '<button type="button" class="ec-btn ac-adm-b" data-adm="annuler">Annuler</button>' +
    '</div></div>';
}

function rendreFormContenu(c) {
  const type = c ? c.type : 'video';
  return '<div class="ac-adm-form ac-adm-form-in">' +
    '<label class="ec-field"><span>Type</span><select id="acCType">' +
      '<option value="video"' + (type === 'video' ? ' selected' : '') + '>Vidéo</option>' +
      '<option value="texte"' + (type === 'texte' ? ' selected' : '') + '>Contenu écrit</option>' +
      '</select></label>' +
    '<label class="ec-field"><span>Titre</span>' +
      '<input id="acCTitre" type="text" maxlength="200" value="' + echapper(c ? c.titre : '') + '" /></label>' +
    '<label class="ec-field"><span>Identifiant YouTube (11 caractères, pas l\'URL entière)</span>' +
      '<input id="acCYt" type="text" maxlength="20" placeholder="dQw4w9WgXcQ" value="' +
        echapper(c ? (c.youtubeId || '') : '') + '" /></label>' +
    '<label class="ec-field"><span>Contenu écrit (si le type est « écrit »)</span>' +
      '<textarea id="acCTexte" rows="4" maxlength="20000">' + echapper(c ? (c.texte || '') : '') + '</textarea></label>' +
    '<label class="ec-field"><span>Durée en minutes (facultative)</span>' +
      '<input id="acCDuree" type="number" min="0" max="999" value="' + (c && c.dureeMin ? c.dureeMin : '') + '" /></label>' +
    '<div class="ac-adm-actions ac-adm-actions-form">' +
      '<button type="button" class="ec-btn ec-btn-p ac-adm-b" data-adm="contenu-enregistrer">Enregistrer</button>' +
      '<button type="button" class="ec-btn ac-adm-b" data-adm="annuler">Annuler</button>' +
    '</div></div>';
}

// Six emplacements de réponse, toujours les mêmes. Ajouter et retirer des
// lignes à la volée demanderait un état de plus pour un gain nul : au-delà de
// six choix, une question de QCM n'est plus une question de QCM.
const SLOTS_CHOIX = 6;

function rendreFormQuestion(q) {
  const choix = q ? q.choix.filter((c) => c.actif) : [];
  const modules = (adminArbre && adminArbre.modules) || [];
  const slots = [];
  for (let i = 0; i < SLOTS_CHOIX; i++) {
    const c = choix[i];
    slots.push('<div class="ac-adm-choix">' +
      '<label class="ac-adm-case"><input id="acQC' + i + 'ok" type="checkbox"' + (c && c.correct ? ' checked' : '') + ' />' +
        '<span>Bonne réponse</span></label>' +
      '<input id="acQC' + i + '" type="text" maxlength="500" placeholder="Réponse ' + (i + 1) + '" value="' +
        echapper(c ? c.texte : '') + '" /></div>');
  }
  return '<div class="ac-adm-form ac-adm-form-in">' +
    '<label class="ec-field"><span>Énoncé</span>' +
      '<input id="acQEnonce" type="text" maxlength="1000" value="' + echapper(q ? q.enonce : '') + '" /></label>' +
    '<label class="ec-field"><span>Module de rattachement (facultatif)</span><select id="acQModule">' +
      '<option value="">— aucun —</option>' +
      modules.map((m) => '<option value="' + m.id + '"' + (q && q.moduleId === m.id ? ' selected' : '') + '>' +
        echapper(m.titre) + '</option>').join('') +
      '</select></label>' +
    '<p class="ac-adm-aide">Au moins deux réponses, au moins une bonne et au moins une mauvaise. ' +
      'Coche plusieurs bonnes réponses pour une question à choix multiples.</p>' +
    '<div class="ac-adm-choix-l">' + slots.join('') + '</div>' +
    '<div class="ac-adm-actions ac-adm-actions-form">' +
      '<button type="button" class="ec-btn ec-btn-p ac-adm-b" data-adm="question-enregistrer">Enregistrer</button>' +
      '<button type="button" class="ec-btn ac-adm-b" data-adm="annuler">Annuler</button>' +
    '</div></div>';
}

// Les boutons d'une ligne. « Archiver » plutôt que « Supprimer », et le mot est
// choisi : rien n'est effacé, et la progression des collaborateurs non plus.
function actionsLigne(type, id, actif, place) {
  return '<span class="ac-adm-actions">' +
    (place.haut ? '' : '<button type="button" class="ec-btn ac-adm-b ac-adm-fleche" data-adm="monter" data-type="' +
      type + '" data-id="' + id + '" aria-label="Monter">↑</button>') +
    (place.bas ? '' : '<button type="button" class="ec-btn ac-adm-b ac-adm-fleche" data-adm="descendre" data-type="' +
      type + '" data-id="' + id + '" aria-label="Descendre">↓</button>') +
    '<button type="button" class="ec-btn ac-adm-b" data-adm="modifier" data-type="' + type + '" data-id="' + id + '">Modifier</button>' +
    '<button type="button" class="ec-btn ac-adm-b' + (actif ? ' ac-adm-danger' : '') + '" data-adm="basculer"' +
      ' data-type="' + type + '" data-id="' + id + '" data-actif="' + (actif ? '0' : '1') + '">' +
      (actif ? 'Archiver' : 'Restaurer') + '</button>' +
    '</span>';
}

function rendreAdminContenus() {
  if (!adminFormations) return '<div class="ec-vide">Chargement…</div>';
  if (edition && edition.objet === 'formation-neuve') {
    return rendreSelecteurAdmin() + rendreFormFormationNeuve();
  }
  if (!adminArbre) return rendreSelecteurAdmin() + '<div class="ec-vide">Aucune formation à administrer.</div>';

  const f = adminArbre.formation;
  const v = adminArbre.verification;
  const modules = adminArbre.modules || [];
  const questions = adminArbre.questions || [];
  const ouvert = (objet, id) => edition && edition.objet === objet && edition.id === id;

  // -- Modules et contenus, dans l'ordre où le collaborateur les verra.
  const blocModules = modules.map((m, i) => {
    const contenus = m.contenus || [];
    return '<div class="ac-adm-mod' + (m.actif ? '' : ' ac-adm-off') + '">' +
      '<div class="ac-adm-ligne">' +
        '<span class="ac-l-t"><b>' + echapper(m.titre) + '</b>' +
          '<span class="ac-eval-mail">' + contenus.filter((c) => c.actif).length + ' contenu' +
            (contenus.filter((c) => c.actif).length > 1 ? 's' : '') +
            (m.actif ? '' : ' · archivé') + '</span></span>' +
        actionsLigne('module', m.id, m.actif, { haut: i === 0, bas: i === modules.length - 1 }) +
      '</div>' +
      (ouvert('module', m.id) ? rendreFormModule(m) : '') +

      '<div class="ac-adm-contenus">' +
        contenus.map((c, j) => '<div class="ac-adm-ligne ac-adm-ligne-c' + (c.actif ? '' : ' ac-adm-off') + '">' +
          '<span class="ac-l-t"><b>' + echapper(c.titre) + '</b>' +
            '<span class="ac-eval-mail">' + (c.type === 'texte' ? 'écrit' : 'vidéo') +
              (c.type === 'video'
                ? (c.youtubeValide === true ? ' · ' + echapper(c.youtubeId)
                  : '<b class="ac-adm-manque"> · lien manquant ou invalide</b>')
                : (String(c.texte || '').trim() ? '' : '<b class="ac-adm-manque"> · texte vide</b>')) +
              (c.dureeMin ? ' · ' + c.dureeMin + ' min' : '') +
              (c.actif ? '' : ' · archivé') + '</span></span>' +
          actionsLigne('contenu', c.id, c.actif, { haut: j === 0, bas: j === contenus.length - 1 }) +
          '</div>' +
          (ouvert('contenu', c.id) ? rendreFormContenu(c) : '')).join('') +
        (ouvert('contenu-neuf', m.id) ? rendreFormContenu(null) : '') +
        '<button type="button" class="ec-btn ac-adm-b ac-adm-plus" data-adm="contenu-neuf" data-id="' + m.id + '">' +
          '+ Ajouter un contenu</button>' +
      '</div></div>';
  }).join('');

  // -- La banque. « Écartée du tirage » se dit à voix haute : une question en
  //    base qui ne sort jamais est exactement ce qu'on ne voit pas venir.
  const blocQuestions = questions.map((q) => {
    const bons = q.choix.filter((c) => c.actif && c.correct).length;
    return '<div class="ac-adm-ligne' + (q.actif ? '' : ' ac-adm-off') + '">' +
      '<span class="ac-l-t"><b>' + echapper(q.enonce) + '</b>' +
        '<span class="ac-eval-mail">' + q.choix.filter((c) => c.actif).length + ' réponses · ' +
          bons + ' bonne' + (bons > 1 ? 's' : '') + (q.multiple ? ' · choix multiple' : '') +
          (q.actif ? '' : ' · archivée') +
          (q.actif && !q.tirable ? '<b class="ac-adm-manque"> · écartée du tirage</b>' : '') +
        '</span></span>' +
      '<span class="ac-adm-actions">' +
        '<button type="button" class="ec-btn ac-adm-b" data-adm="modifier" data-type="question" data-id="' + q.id + '">Modifier</button>' +
        '<button type="button" class="ec-btn ac-adm-b' + (q.actif ? ' ac-adm-danger' : '') + '" data-adm="basculer"' +
          ' data-type="question" data-id="' + q.id + '" data-actif="' + (q.actif ? '0' : '1') + '">' +
          (q.actif ? 'Archiver' : 'Restaurer') + '</button>' +
      '</span></div>' +
      (ouvert('question', q.id) ? rendreFormQuestion(q) : '');
  }).join('');

  return rendreSelecteurAdmin() +
    '<p class="ac-qcm-s">Contenus de <b>' + echapper(f.libelle) + '</b>.</p>' +
    rendreReglages(f) +
    rendrePublication(v, f) +

    '<h2 class="ac-eval-t">Modules et contenus</h2>' +
    '<div class="ac-adm-arbre">' +
      (modules.length ? blocModules : '<div class="ec-vide">Aucun module pour le moment.</div>') +
      (ouvert('module-neuf', 0) ? rendreFormModule(null) : '') +
      '<button type="button" class="ec-btn ac-adm-b ac-adm-plus" data-adm="module-neuf">+ Ajouter un module</button>' +
    '</div>' +

    '<h2 class="ac-eval-t ac-eval-t2">Banque de questions</h2>' +
    '<div class="ac-adm-arbre">' +
      (questions.length ? blocQuestions : '<div class="ec-vide">Aucune question pour le moment.</div>') +
      (ouvert('question-neuve', 0) ? rendreFormQuestion(null) : '') +
      '<button type="button" class="ec-btn ac-adm-b ac-adm-plus" data-adm="question-neuve">+ Ajouter une question</button>' +
    '</div>';
}

// Les choix saisis, lus dans les six emplacements. Les vides sont ignorés :
// c'est le moteur qui refuse une question incorrigeable, et il le dit.
function lireChoixSaisis() {
  const l = [];
  for (let i = 0; i < SLOTS_CHOIX; i++) {
    const t = champ('#acQC' + i);
    if (t) l.push({ texte: t, correct: coche('#acQC' + i + 'ok') });
  }
  return l;
}

// Déplacer d'un cran. On envoie la LISTE ENTIÈRE des frères dans leur nouvel
// ordre : le serveur réécrit tous les rangs en une transaction plutôt que
// d'incrémenter deux lignes qui pourraient se croiser.
function voisinage(type, id) {
  if (type === 'module') return (adminArbre.modules || []).map((m) => m.id);
  const m = (adminArbre.modules || []).find((x) => (x.contenus || []).some((c) => c.id === id));
  return m ? m.contenus.map((c) => c.id) : [];
}

async function agirSurContenus(el) {
  const geste = el.dataset.adm;
  const id = el.dataset.id ? Number(el.dataset.id) : null;
  const type = el.dataset.type || null;
  admErreur = '';
  const encart = $('#acAdmErr');
  if (encart) encart.textContent = '';

  // Les gestes qui n'ouvrent qu'un formulaire. Rien ne part au serveur.
  if (geste === 'annuler') { edition = null; rendreAdmin(); return; }
  if (geste === 'formation-neuve') { edition = { objet: 'formation-neuve', id: 0 }; rendreAdmin(); return; }
  if (geste === 'module-neuf') { edition = { objet: 'module-neuf', id: 0 }; rendreAdmin(); return; }
  if (geste === 'contenu-neuf') { edition = { objet: 'contenu-neuf', id }; rendreAdmin(); return; }
  if (geste === 'question-neuve') { edition = { objet: 'question-neuve', id: 0 }; rendreAdmin(); return; }
  if (geste === 'modifier') { edition = { objet: type, id }; rendreAdmin(); return; }

  if (geste === 'formation-creer') {
    const r = await apiAc('/api/academy/admin/formations', 'POST', {
      cle: champ('#acFCle').toLowerCase(), libelle: champ('#acFLibelle'), titre: champ('#acFTitre'),
    });
    if (r.status === 401) { deconnecter(); return; }
    if (!r.data.ok) { admErreur = r.data.error || 'Création impossible.'; const e = $('#acAdmErr'); if (e) e.textContent = admErreur; return; }
    fAdmin = r.data.formation.cle;
    edition = null;
    await chargerAdminFormations();
    await chargerAdminArbre();
    rendreAdmin();
    return;
  }

  if (geste === 'reglages-enregistrer') {
    const r = await apiAc('/api/academy/admin/formations/' + encodeURIComponent(fAdmin), 'PUT', {
      libelle: champ('#acRLibelle'), titre: champ('#acRTitre'),
      qcmNbQuestions: Number(champ('#acRNb')), qcmSeuilPct: Number(champ('#acRSeuil')),
      ordre: Number(champ('#acROrdre')),
      pratiqueObligatoire: coche('#acRPratique'), certificationActive: coche('#acRCertif'),
    });
    if (r.status === 401) { deconnecter(); return; }
    if (!r.data.ok) { admErreur = r.data.error || 'Enregistrement impossible.'; const e = $('#acAdmErr'); if (e) e.textContent = admErreur; return; }
    edition = null;
    await chargerAdminFormations();
    await chargerAdminArbre();
    rendreAdmin();
    return;
  }

  // Publier et dépublier : DEUX ROUTES À PART. Aucun formulaire de cet écran
  // n'envoie `actif` — la publication se vérifie, elle ne se glisse pas dans un
  // enregistrement de réglages.
  if (geste === 'publier' || geste === 'depublier') {
    const r = await apiAc('/api/academy/admin/formations/' + encodeURIComponent(fAdmin) + '/' + geste, 'POST', {});
    if (r.status === 401) { deconnecter(); return; }
    if (!r.data.ok) {
      admErreur = r.data.error || 'Action impossible.';
      if (r.data.verification) adminArbre = { ...(adminArbre || {}), verification: r.data.verification };
      rendreAdmin();
      return;
    }
    await chargerAdminFormations();
    await chargerAdminArbre();
    // Publier ou dépublier change le catalogue du collaborateur : on le relit
    // plutôt que de laisser un sélecteur périmé ailleurs dans l'écran.
    await chargerCatalogue();
    rendreAdmin();
    return;
  }

  if (geste === 'module-enregistrer') {
    await ecrireAdmin('/api/academy/admin/modules', {
      id: edition && edition.objet === 'module' ? edition.id : undefined,
      titre: champ('#acMTitre'), description: champ('#acMDesc'),
    });
    return;
  }

  if (geste === 'contenu-enregistrer') {
    const neuf = edition && edition.objet === 'contenu-neuf';
    await ecrireAdmin('/api/academy/admin/contenus', {
      id: neuf ? undefined : (edition ? edition.id : undefined),
      moduleId: neuf ? edition.id : undefined,
      type: champ('#acCType'), titre: champ('#acCTitre'),
      youtubeId: champ('#acCYt'), texte: champ('#acCTexte'),
      dureeMin: champ('#acCDuree'),
    });
    return;
  }

  if (geste === 'question-enregistrer') {
    await ecrireAdmin('/api/academy/admin/questions', {
      id: edition && edition.objet === 'question' ? edition.id : undefined,
      enonce: champ('#acQEnonce'),
      moduleId: champ('#acQModule') || null,
      choix: lireChoixSaisis(),
    });
    return;
  }

  if (geste === 'basculer') {
    await ecrireAdmin('/api/academy/admin/archiver', { type, id, actif: el.dataset.actif === '1' });
    return;
  }

  if (geste === 'monter' || geste === 'descendre') {
    const ids = voisinage(type, id);
    const i = ids.indexOf(id);
    const j = geste === 'monter' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await ecrireAdmin('/api/academy/admin/ordre', { type, ids });
  }
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
