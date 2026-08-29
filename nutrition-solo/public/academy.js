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

// LE VISUEL DE L'ÉCRAN DE CONNEXION.
//
//  Un seul endroit à renseigner : le nom du fichier déposé dans public/.
//  Laissé vide, la balise <img> ne reçoit aucun src — donc AUCUNE requête, et
//  aucune 404 dans la console. La colonne garde son aplat travaillé.
//
//  Format attendu : portrait 3/4, 1200 × 1600 px minimum, JPEG ou WebP.
const PHOTO_CONNEXION = '';   // ex. 'academy-coachs.jpg'

// Même principe pour le bandeau de régularité de la page formation.
// Format attendu : paysage 4/3, 800 × 600 px minimum.
const PHOTO_REGULARITE = '';  // ex. 'academy-regularite.jpg'

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
// « Puis-je évaluer et certifier ? » — désigné OU administrateur, le serveur
// tranche. L'écran ne combine jamais les deux drapeaux lui-même.
let moiEval = false;
let evalListe = null;   // vue « Évaluer & certifier » : tous les coachs, un statut chacun
let evalFiche = null;   // vue évaluateur : le dossier ouvert
let evalOnglet = 'coachs';  // 'coachs' | 'certifications'
let evalErreur = '';    // le refus du serveur, gardé en état (chaque geste re-rend l'écran)
// Administrateur ? Il a TOUS les droits de l'évaluateur/certificateur, plus les
// formations, les contenus, les banques et le retrait d'un diplôme.
let moiAdmin = false;
let adminComptes = null; // vue admin : les comptes et leur droit d'évaluer
let aRetirer = null;    // retrait d'un droit d'évaluer, en attente de confirmation
let certifs = null;     // état de MES certifications, toutes formations confondues
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
// Le prénom du compte, lu sur /account/me — la même route que l'application.
// L'écran n'invente ni nom ni rôle : il affiche ce que le serveur dit.
let moiPrenom = '';

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

// LA COQUILLE CHANGE DE LARGEUR SELON L'ÉCRAN.
//
//  720 px convient à un formulaire et à une lecture suivie ; il étrangle une
//  grille de cartes. On élargit donc les écrans qui le demandent — et
//  UNIQUEMENT depuis academy.css, jamais en touchant .ec-wrap dans coach.css :
//  cette feuille est partagée avec /coach, qui n'a rien demandé.
const LARGEUR = {
  // L'accueil est le plus large : quatre indicateurs, une grille et un rail.
  '#acAccueil': 'ac-w-accueil',
  '#acSommaire': 'ac-w-large',
  '#acAdmin': 'ac-w-large',
  '#acEval': 'ac-w-large',
  // Le lecteur est le plus large des trois : la vidéo et son sommaire latéral
  // ne tiennent pas dans une colonne de formulaire.
  '#acLecteur': 'ac-w-lecteur',
};

function afficher(ecran) {
  for (const id of ['#acBoot', '#acLogin', '#acBloc', '#acAccueil', '#acSommaire', '#acLecteur', '#acQcm', '#acEval', '#acAdmin']) {
    montrer(id, id === ecran);
  }
  // L'écran de connexion vit HORS de la coquille et prend la fenêtre entière :
  // une barre latérale de navigation n'a aucun sens avant d'être connecté.
  montrer('#acApp', ecran !== '#acLogin');
  // Le titre « Mon Academy » est porté par le bandeau blanc, et il n'appartient
  // qu'à l'accueil : l'en-tête étant partagé, c'est ici — au seul endroit qui
  // sait quel écran est ouvert — qu'il se montre et se retire.
  montrer('#acHeadTitre', ecran === '#acAccueil');
  const large = LARGEUR[ecran] || '';
  for (const sel of ['#acMain', '#acHeadWrap']) {
    const el = $(sel);
    if (!el) continue;
    el.classList.toggle('ac-w-large', large === 'ac-w-large');
    el.classList.toggle('ac-w-lecteur', large === 'ac-w-lecteur');
    el.classList.toggle('ac-w-accueil', large === 'ac-w-accueil');
  }
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
  moiPrenom = '';
  montrer('#acMe', false);
  // La coquille appartient à la session : hors connexion, il n'y a rien à
  // naviguer, et une barre latérale vide serait un décor.
  montrer('#acSide', false);
  const m = $('#acMenu'); if (m) m.hidden = true;
  afficher('#acLogin');
}

// --- Démarrage ---------------------------------------------------------------

async function demarrer() {
  try { session = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (_) { session = null; }
  if (!session || !session.token) { afficher('#acLogin'); return; }

  const moi = await apiAc('/api/academy/moi');
  if (moi.status === 401) { deconnecter(); return; }
  if (!moi.data.ok) { bloquer('⚠️', 'Espace indisponible', 'Réessaie dans un instant.'); return; }

  // Le prénom vient du compte ; l'email reste le repli si le champ est vide.
  const compte = await apiAc('/account/me');
  moiPrenom = (compte.data && compte.data.compte && compte.data.compte.prenom) || '';
  if (!moiPrenom) moiPrenom = moi.data.email || '';
  $('#acMeNom').textContent = moiPrenom;
  montrer('#acMe', true);

  moiCollab = !!moi.data.collaborateur;
  moiEval = !!moi.data.evaluateur;
  moiAdmin = !!moi.data.admin;
  // Les entrées de rôle vivent dans la barre latérale, hors du parcours
  // d'apprentissage : ce sont des destinations, pas des étapes de formation.
  rendreBarreLaterale('academy');
  rendreCompte();

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

  // Qui n'est pas collaborateur arrive sur ce qui le concerne, dans l'ordre de
  // ses responsabilités : l'administrateur sur l'administration — c'est son
  // poste de commande, et « Évaluer & certifier » reste à un clic dans la barre
  // latérale — l'évaluateur extérieur sur son espace, le seul qu'il ait.
  if (!moiCollab) {
    if (moiAdmin) { await ouvrirAdmin(); return; }
    await ouvrirEvaluateur();
    return;
  }
  // Le collaborateur arrive sur SES FORMATIONS, jamais directement dans l'une
  // d'elles — même s'il n'y en a qu'une. C'est un point d'entrée stable, qui ne
  // changera pas de comportement le jour où une deuxième sera publiée.
  await ouvrirAccueil();
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
function viderEtatFormation() {
  formation = null; qcm = null; pratique = null; certifs = null;
  contenuOuvert = null; tentative = null; iQuestion = 0;
}

async function changerFormation(cle) {
  if (!cle || cle === fCourante) return;
  fCourante = cle;
  viderEtatFormation();
  await chargerFormation();
}

// Ouvrir une formation DEPUIS L'ACCUEIL : on entre toujours, même si c'est
// celle qu'on avait quittée — sinon un clic sur sa propre carte ne ferait rien.
async function ouvrirFormation(cle) {
  if (!cle) return;
  if (cle !== fCourante) { fCourante = cle; viderEtatFormation(); }
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

// --- Accueil My Coach Academy -------------------------------------------------
//
//  L'écran d'entrée du collaborateur. Il répond à une question et une seule :
//  quelles formations dois-je faire, et où en suis-je ?
//
//  IL NE CALCULE RIEN QU'IL NE SACHE. L'avancement vient du catalogue (enrichi
//  côté serveur), le statut se déduit des prérequis que le registre des
//  certifications renvoie déjà pour TOUTES les formations. L'écran assemble,
//  il ne décide pas — et il n'invente aucun chiffre.

// Statut -> [libellé, classe, glyphe, verbe du bouton, bouton plein ?]
//
//  QUATRE STATUTS, PAS CINQ. « Théorie validée » couvre aussi l'attente de
//  l'évaluation pratique : la nuance se dit sur la ligne du dessous, là où elle
//  est lisible, plutôt que dans une pastille de plus.
const STATUTS = {
  a_commencer: ['À commencer', 'ac-st-neutre', '⧗', 'Commencer cette formation', false],
  en_cours:    ['En cours', 'ac-st-cours', '▶', 'Continuer ma formation', true],
  theorie:     ['Théorie validée', 'ac-st-theorie', '✓', 'Voir les étapes suivantes', false],
  certifie:    ['Certification obtenue', 'ac-st-certifie', '★', 'Revoir la formation', false],
};
const ORDRE_STATUT = ['en_cours', 'theorie', 'a_commencer', 'certifie'];

const certifDe = (cle) => (certifs || []).find((c) => c.formation === cle) || null;
// CE TITRE OUVRE-T-IL DES DROITS DANS LE BOOST ?
//
// ⚠️ Trois phrases de l'écran promettaient « des clients dans le Boost
// Nutrition » à QUI QUE CE SOIT qui se certifiait — Cycle menstruel comprise,
// alors qu'elle n'ouvre aucun dossier client. Le catalogue portait déjà le
// drapeau ; il n'était simplement lu nulle part côté écran.
const ouvreBoost = (cle) => {
  const f = (catalogue || []).find((x) => x.cle === cle);
  return !!(f && f.refletBoost);
};
const prerequis = (cert, quoi) => (cert && (cert.prerequis || []).find((p) => p.cle === quoi)) || null;

function statutDe(f) {
  const cert = certifDe(f.cle);
  if (cert && cert.certifie) return 'certifie';
  const theo = prerequis(cert, 'theorie');
  if (theo && theo.rempli) return 'theorie';
  return f.pourcentage > 0 ? 'en_cours' : 'a_commencer';
}

// La ligne d'état, sous la barre. Elle porte la nuance que la pastille ne dit
// pas : théorie validée mais pratique encore attendue.
function detailDe(f, st) {
  const cert = certifDe(f.cle);
  if (st === 'certifie') {
    const d = cert && cert.certification ? cert.certification.obtenueLe : null;
    return d ? 'Certification obtenue le ' + dateFr(d) : 'Certification obtenue';
  }
  if (st === 'theorie') {
    const prat = prerequis(cert, 'pratique');
    if (prat && !prat.rempli) return 'Théorie validée – En attente de l\'évaluation pratique';
    return 'Théorie validée – Certification à prononcer';
  }
  // Tous les contenus vus mais la théorie pas encore passée : le prochain geste
  // n'est plus « continuer », c'est l'évaluation. Le dire ici évite un bouton
  // qui promet une suite inexistante.
  if (f.acheve) return 'Contenus terminés – Évaluation théorique à passer';
  // ⚠️ LES COMPTEURS PEUVENT NE PAS EXISTER. /api/academy/formations n'enrichit
  // le catalogue de `total`/`termines` que pour qui SUIT la formation
  // (academy.peutSeFormer) : un évaluateur ou un administrateur non
  // collaborateur reçoit le catalogue nu, et c'est voulu. Sans cette garde, la
  // carte affichait « undefined / undefined contenu terminé ». On ne fabrique
  // pas un « 0 / 0 » qui serait faux : on ne dit rien, faute de savoir.
  if (!Number.isFinite(f.total) || !Number.isFinite(f.termines)) return '';
  return f.termines + ' / ' + f.total + ' contenu' + (f.total > 1 ? 's' : '') + ' terminé' + (f.termines > 1 ? 's' : '');
}

let accueilTri = 'statut';    // statut | progression | nom
let accueilFiltre = 'toutes'; // toutes | certifiantes

function formationsAffichees() {
  let l = (catalogue || []).map((f, i) => ({ f, i, st: statutDe(f) }));
  if (accueilFiltre === 'certifiantes') l = l.filter((x) => x.f.certificationActive);
  const rang = (x) => ORDRE_STATUT.indexOf(x.st);
  if (accueilTri === 'statut') l.sort((a, b) => rang(a) - rang(b) || a.i - b.i);
  else if (accueilTri === 'progression') l.sort((a, b) => (b.f.pourcentage || 0) - (a.f.pourcentage || 0) || a.i - b.i);
  else l.sort((a, b) => a.f.libelle.localeCompare(b.f.libelle, 'fr'));
  return l;
}

async function ouvrirAccueil() {
  await chargerCatalogue();
  await chargerCertifs();
  rendreAccueil();
}

// -- La barre latérale ---------------------------------------------------------
//
//  Elle ne montre que des destinations réelles. Les entrées de rôle n'y
//  apparaissent que pour qui a le droit — et c'est le serveur qui l'a dit.
function rendreBarreLaterale(actif) {
  const ic = {
    academy: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"/></svg>',
    eval: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3H9z"/><path d="M15 5.5h3a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1h3"/><path d="m9 13 2 2 4-4"/></svg>',
    admin: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  };
  // UNE SEULE PORTE POUR LE COACH. « Mes formations » et « Mes certifications »
  // menaient au MÊME écran que « Mon Academy » — même appel, même grille — à un
  // filtre et un défilement près. Trois entrées pour une destination, c'est une
  // navigation qui donne le sentiment d'un choix inexistant.
  //
  // ⚠️ SEULES LES ENTRÉES DISPARAISSENT, pas les destinations : naviguer()
  // continue d'accepter 'formations' et 'certifications', et le bouton
  // « Voir mes certifications » de l'accueil s'en sert toujours pour filtrer la
  // grille sur les formations certifiantes.
  const entrees = [
    { cle: 'academy', libelle: 'Mon Academy', icone: ic.academy },
  ];
  // UN SEUL MÉTIER, UNE SEULE ENTRÉE. Évaluer la pratique et prononcer la
  // certification étaient deux destinations sous deux droits ; c'est la même
  // personne qui suit un coach du terrain au diplôme.
  if (moiEval) entrees.push({ cle: 'evaluer', libelle: 'Évaluer & certifier', icone: ic.eval, id: 'acRoleEval' });
  if (moiAdmin) entrees.push({ cle: 'administrer', libelle: 'Administrer', icone: ic.admin, id: 'acRoleAdmin' });

  const nav = $('#acSideNav');
  if (!nav) return;
  nav.innerHTML = entrees.map((e) =>
    '<button type="button" class="ac-side-i' + (e.cle === actif ? ' on' : '') + '"' +
      (e.id ? ' id="' + e.id + '"' : '') +
      ' data-nav="' + e.cle + '"' + (e.cle === actif ? ' aria-current="page"' : '') + '>' +
      '<span class="ac-side-ic" aria-hidden="true">' + e.icone + '</span>' +
      '<span>' + echapper(e.libelle) + '</span></button>').join('');

  nav.querySelectorAll('[data-nav]').forEach((el) =>
    el.addEventListener('click', () => naviguer(el.dataset.nav)));
  montrer('#acSide', true);
}

async function naviguer(ou) {
  if (ou === 'evaluer') { await ouvrirEvaluateur(); return; }
  if (ou === 'administrer') { await ouvrirAdmin(); return; }
  accueilFiltre = ou === 'certifications' ? 'certifiantes' : 'toutes';
  await ouvrirAccueil();
  if (ou !== 'academy') {
    const g = $('#acGrille');
    if (g && g.scrollIntoView) g.scrollIntoView({ block: 'start', behavior: 'auto' });
  }
}

// -- Le bloc de compte ---------------------------------------------------------

function rendreCompte() {
  const nom = (moiPrenom || (session && session.email) || '').trim();
  const initiales = nom.replace(/[^\p{L}\s-]/gu, ' ').trim().split(/[\s-]+/)
    .filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('') || '?';
  const av = $('#acAv'); if (av) av.textContent = initiales;
  const n = $('#acMeNom'); if (n) n.textContent = nom || '';

  // La seconde ligne dit un fait, pas un slogan : le titre déjà obtenu, sinon
  // le rôle réel dans l'Academy.
  const titre = (certifs || []).filter((c) => c.certifie && c.titre).map((c) => c.titre)[0];
  const role = titre || (moiAdmin ? 'Administrateur My Coach Academy'
    : moiEval ? 'Évaluateur My Coach Academy'
    : moiCollab ? 'Collaborateur My Coach' : '');
  const r = $('#acMeRole'); if (r) r.textContent = role;
}

// -- L'écran -------------------------------------------------------------------

// L'anneau de progression globale. Un SVG, pas une image : il se redessine avec
// la donnée, et reste net sur tous les écrans.
function rendreAnneau(pct) {
  const r = 52, c = 2 * Math.PI * r;
  const rempli = Math.max(0, Math.min(100, pct)) / 100 * c;
  return '<svg class="ac-anneau" viewBox="0 0 128 128" role="img" aria-label="Progression globale : ' + pct + ' %">' +
    '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="var(--border-c)" stroke-width="13" />' +
    '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="var(--saphir)" stroke-width="13" stroke-linecap="round" ' +
      'stroke-dasharray="' + rempli.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 64 64)" />' +
    '<text x="64" y="64" class="ac-anneau-t" text-anchor="middle" dominant-baseline="central">' + pct + ' %</text>' +
    '</svg>';
}

// LA PROGRESSION GLOBALE PORTE SUR LE PARCOURS, PAS SUR LES VIDÉOS.
//
//  Elle comptait la somme des contenus vus sur la somme des contenus ouverts.
//  Un coach qui avait tout regardé lisait donc « 100 % » alors que son Terrain
//  restait à faire et sa certification à obtenir — l'anneau annonçait fini un
//  parcours qui ne l'était pas.
//
//  Elle compte désormais des ÉTAPES : les mêmes que la frise (cf. etapesDe),
//  et sous la même règle. Terrain et Certification ne sont comptées que si la
//  formation les DEMANDE — une étape non demandée n'est pas une étape
//  manquante, sinon une formation qui ne certifie pas plafonnerait à jamais.
//
//  Seule « Apprendre » est fractionnaire : sans elle, l'anneau sauterait par
//  paliers de 25 % au lieu de bouger à chaque vidéo terminée.
//
//  ⚠️ À NE PAS CONFONDRE avec le « X % complété » d'une carte de formation,
//  qui reste volontairement la progression de SES CONTENUS. Les deux nombres
//  ne répondent pas à la même question et n'ont aucune raison de coïncider.
function etapesDuParcours(f, cert) {
  const rempli = (cle) => {
    const p = cert && (cert.prerequis || []).find((x) => x.cle === cle);
    return !!(p && p.rempli);
  };
  // Le catalogue n'est enrichi de total/termines que pour qui SUIT la
  // formation ; sans compteur, on retombe sur le drapeau `acheve`, et à défaut
  // sur zéro. Jamais sur une division par zéro.
  const total = Number(f.total);
  const faits = Number(f.termines);
  const apprendre = Number.isFinite(total) && total > 0 && Number.isFinite(faits)
    ? Math.max(0, Math.min(1, faits / total))
    : (f.acheve ? 1 : 0);

  const etapes = [apprendre, rempli('theorie') ? 1 : 0];
  if (f.pratiqueObligatoire) etapes.push(rempli('pratique') ? 1 : 0);
  if (f.certificationActive) etapes.push(cert && cert.certifie ? 1 : 0);
  return etapes;
}

// Somme des étapes acquises / somme des étapes demandées, toutes formations
// confondues. Chaque étape pèse pareil : deux parcours, deux diplômes.
function progressionGlobale(formations, certifications) {
  let acquises = 0;
  let demandees = 0;
  for (const f of formations || []) {
    const cert = (certifications || []).find((c) => c.formation === f.cle) || null;
    const e = etapesDuParcours(f, cert);
    for (const v of e) acquises += v;
    demandees += e.length;
  }
  return demandees ? Math.round(acquises / demandees * 100) : 0;
}

function rendreAccueil() {
  const liste = formationsAffichees();
  const toutes = (catalogue || []).map((f) => ({ f, st: statutDe(f) }));
  const compte = (st) => toutes.filter((x) => x.st === st).length;

  // L'anneau porte sur le PARCOURS entier, étape par étape (cf.
  // progressionGlobale) — et sur TOUT le catalogue, pas sur la vue filtrée.
  const global = progressionGlobale(catalogue || [], certifs || []);

  const kpi = [
    ['🎓', 'ac-k-bleu', toutes.length, 'Formation' + (toutes.length > 1 ? 's' : '') + ' disponible' + (toutes.length > 1 ? 's' : '')],
    ['📘', 'ac-k-indigo', compte('en_cours'), 'En cours'],
    ['✓', 'ac-k-vert', compte('theorie') + compte('certifie'), 'Théorie validée'],
    ['🏅', 'ac-k-ambre', compte('certifie'), 'Certification obtenue'],
  ];

  const carte = ({ f, st }) => {
    const [libelle, classe, glyphe] = STATUTS[st];
    let [, , , verbe, plein] = STATUTS[st];
    // Plus rien à suivre, mais la théorie reste à passer : le verbe suit l'état
    // réel, pas la pastille.
    if (st === 'en_cours' && f.acheve) { verbe = 'Voir les étapes suivantes'; plein = false; }
    const pct = Number.isFinite(f.pourcentage) ? f.pourcentage : 0;
    return '<article class="ac-fc ac-fc-' + st + '">' +
      '<div class="ac-fc-top">' +
        '<span class="ac-fc-ic" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 4 2.5 9 12 14l9.5-5L12 4Z"/><path d="M6 11.2V16c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-4.8"/></svg>' +
        '</span>' +
        '<span class="ac-st ' + classe + '"><i aria-hidden="true">' + glyphe + '</i>' + echapper(libelle) + '</span>' +
      '</div>' +
      '<h3 class="ac-fc-t">' + echapper(f.libelle) + '</h3>' +
      '<p class="ac-fc-d">' + echapper(f.titre ? 'Obtiens le titre ' + f.titre + '.' : 'Parcours de formation My Coach.') + '</p>' +
      '<p class="ac-fc-pct"><b>' + pct + '%</b> complété</p>' +
      '<div class="ac-jauge' + (st === 'certifie' || pct === 100 ? ' ac-jauge-ok' : '') + '">' +
        '<i style="width:' + pct + '%"></i></div>' +
      '<p class="ac-fc-m">' + echapper(detailDe(f, st)) + '</p>' +
      '<button type="button" class="ec-btn ac-fc-b' + (plein ? ' ec-btn-p' : '') + '"' +
        ' data-ouvrir="' + echapper(f.cle) + '">' + echapper(verbe) + (plein ? '' : ' →') + '</button>' +
      '</article>';
  };

  const legende = [
    ['en_cours', 'En cours'],
    ['theorie', 'Théorie validée'],
    ['a_commencer', 'À commencer'],
    ['certifie', 'Certification obtenue'],
  ];

  // Le titre et sa phrase d'accueil ne sont plus ici : ils vivent dans le
  // bandeau blanc (#acHeadTitre), montré par afficher(). L'écran commence donc
  // directement par les indicateurs.
  $('#acAccueil').innerHTML =
    '<div class="ac-kpis">' + kpi.map(([g, c, n, l]) =>
      '<div class="ac-kpi"><span class="ac-kpi-ic ' + c + '" aria-hidden="true">' + g + '</span>' +
        '<span class="ac-kpi-tx"><b>' + n + '</b><span>' + echapper(l) + '</span></span></div>').join('') +
    '</div>' +

    '<div class="ac-grille-h">' +
      '<h2 class="ac-h2">' + (accueilFiltre === 'certifiantes' ? 'Mes formations certifiantes' : 'Toutes mes formations') + '</h2>' +
      '<label class="ac-tri"><span>Trier par</span>' +
        '<select id="acTri">' +
          ['statut', 'progression', 'nom'].map((v) =>
            '<option value="' + v + '"' + (accueilTri === v ? ' selected' : '') + '>' +
            (v === 'statut' ? 'Statut' : v === 'progression' ? 'Progression' : 'Nom') + '</option>').join('') +
        '</select></label>' +
    '</div>' +

    '<div class="ac-cols">' +
      '<div class="ac-fcs" id="acGrille">' +
        (liste.length ? liste.map(carte).join('')
          : '<div class="ec-vide">' + (accueilFiltre === 'certifiantes'
            ? 'Aucune formation certifiante ne t\'est ouverte pour le moment.'
            : 'Aucune formation ne t\'est ouverte pour le moment.') + '</div>') +
      '</div>' +

      '<aside class="ac-parcours">' +
        '<h2 class="ac-parcours-t">Ton parcours</h2>' +
        rendreAnneau(global) +
        '<p class="ac-parcours-l">Progression globale</p>' +
        '<ul class="ac-lg">' + legende.map(([cle, l]) =>
          '<li><span class="ac-lg-d ac-lg-' + cle + '" aria-hidden="true"></span>' +
            '<span class="ac-lg-t">' + echapper(l) + '</span>' +
            '<b class="ac-lg-n">' + compte(cle) + '</b></li>').join('') + '</ul>' +
        '<button type="button" class="ec-btn ac-parcours-b" id="acVersCertifs">Voir mes certifications</button>' +
      '</aside>' +
    '</div>';

  document.querySelectorAll('#acAccueil [data-ouvrir]').forEach((el) =>
    el.addEventListener('click', () => ouvrirFormation(el.dataset.ouvrir)));
  const tri = $('#acTri');
  if (tri) tri.addEventListener('change', () => { accueilTri = tri.value; rendreAccueil(); });
  const vc = $('#acVersCertifs');
  if (vc) vc.addEventListener('click', () => naviguer('certifications'));

  rendreCompte();
  rendreBarreLaterale('academy');
  afficher('#acAccueil');
  window.scrollTo(0, 0);
}

// --- La frise du parcours -----------------------------------------------------
//
//  Elle remplace quatre encadrés d'état empilés par une ligne. Et elle
//  N'AFFICHE QUE LES ÉTAPES RÉELLEMENT DEMANDÉES : une formation sans
//  évaluation pratique montre trois jalons, pas quatre dont un grisé. Une étape
//  qui n'est pas demandée n'existe pas — c'est la règle du catalogue depuis le
//  lot 5, l'écran ne fait que la suivre.

function etapesDe() {
  const cat = formationCourante() || {};
  const cert = certifDe(fCourante);
  const l = [
    { cle: 'apprendre', libelle: 'Apprendre', fait: !!(formation && formation.acheve) },
    { cle: 'theorie', libelle: 'Théorie', fait: !!(qcm && qcm.theorieValidee) },
  ];
  if (cat.pratiqueObligatoire) l.push({ cle: 'terrain', libelle: 'Terrain', fait: !!(pratique && pratique.validee) });
  if (cat.certificationActive) l.push({ cle: 'certification', libelle: 'Certification', fait: !!(cert && cert.certifie) });

  // L'étape courante est la première qui n'est pas faite. Aucune n'est courante
  // quand tout l'est : le parcours est fini, il n'y a plus de « ici ».
  const i = l.findIndex((e) => !e.fait);
  l.forEach((e, k) => { e.courante = k === i; });
  return l;
}

function rendreFrise() {
  const l = etapesDe();
  if (l.length < 2) return '';
  return '<ol class="ac-frise" aria-label="Étapes du parcours">' +
    l.map((e, i) => {
      const cls = e.fait ? ' ac-fr-fait' : e.courante ? ' ac-fr-ici' : '';
      return (i ? '<li class="ac-fr-lien' + (l[i - 1].fait ? ' ac-fr-lien-fait' : '') + '" aria-hidden="true"></li>' : '') +
        '<li class="ac-fr-e' + cls + '"' + (e.courante ? ' aria-current="step"' : '') + '>' +
          '<span class="ac-fr-d">' + (e.fait ? '✓' : String(i + 1)) + '</span>' +
          '<span class="ac-fr-l">' + echapper(e.libelle) + '</span>' +
        '</li>';
    }).join('') +
    '</ol>';
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

// --- La page d'une formation --------------------------------------------------
//
//  L'ordre est celui de l'apprenant : qui je suis en train de suivre, où j'en
//  suis, puis les quatre étapes du parcours, chacune dépliable.
//
//  ⚠️ LES CARTES QCM, PRATIQUE ET CERTIFICATION NE SONT PAS TOUCHÉES : elles
//  sont rendues telles quelles À L'INTÉRIEUR de leur étape. Leur refonte est un
//  lot à part ; ce qui change ici, c'est ce qui les entoure.

// Durée totale d'une formation, additionnée sur ses contenus. Aucun champ
// nouveau : c'est la somme des durées déjà saisies à l'administration.
function dureeTotale(f) {
  const min = f.modules.flatMap((m) => m.contenus).reduce((n, c) => n + (c.dureeMin || 0), 0);
  if (!min) return null;
  const h = Math.floor(min / 60), r = min % 60;
  return h ? h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '') : min + ' min';
}

// La régularité, calculée sur les dates de complétion réelles. On ne stocke
// rien : les jours viennent de `termineLe`, déjà renvoyé par le serveur.
function regularite(f) {
  const jours = new Set(f.modules.flatMap((m) => m.contenus)
    .filter((c) => c.termineLe).map((c) => String(c.termineLe).slice(0, 10)));
  const cle = (d) => d.toISOString().slice(0, 10);
  const auj = new Date();

  // La semaine affichée, du lundi au dimanche.
  const lundi = new Date(auj);
  lundi.setDate(auj.getDate() - ((auj.getDay() + 6) % 7));
  const semaine = [];
  for (let i = 0; i < 7; i++) {
    const j = new Date(lundi); j.setDate(lundi.getDate() + i);
    semaine.push({ lettre: 'LMMJVSD'[i], actif: jours.has(cle(j)), futur: j > auj });
  }

  // La série : les jours consécutifs jusqu'à aujourd'hui. On tolère que rien
  // n'ait été fait aujourd'hui — la série court alors depuis hier.
  let serie = 0;
  const depart = new Date(auj);
  if (!jours.has(cle(depart))) depart.setDate(depart.getDate() - 1);
  while (jours.has(cle(depart))) { serie++; depart.setDate(depart.getDate() - 1); }
  return { semaine, serie };
}

// Le statut d'une étape : son libellé et sa couleur. Tout est relu sur l'état
// que le serveur renvoie — l'écran ne déduit jamais un droit.
function statutEtape(cle) {
  const cert = certifDe(fCourante);
  if (cle === 'apprendre') {
    return formation.acheve
      ? ['Terminé', 'ac-et-ok']
      : [formation.termines + ' / ' + formation.total + ' terminés', 'ac-et-neutre'];
  }
  if (cle === 'theorie') {
    if (!qcm) return ['À venir', 'ac-et-neutre'];
    if (qcm.theorieValidee) return ['Théorie validée', 'ac-et-ok'];
    if (qcm.enCours) return ['Évaluation en cours', 'ac-et-actif'];
    if (qcm.disponible) return ['À passer', 'ac-et-actif'];
    return ['Verrouillé', 'ac-et-gris'];
  }
  if (cle === 'terrain') {
    if (!pratique) return ['À venir', 'ac-et-neutre'];
    if (pratique.validee) return ['Validée', 'ac-et-ok'];
    if (pratique.etat === 'en_attente') return ['Résultat en attente', 'ac-et-actif'];
    if (pratique.etat === 'a_repasser') return ['À repasser', 'ac-et-neutre'];
    if (pratique.etat === 'a_realiser') return ['À réaliser', 'ac-et-actif'];
    return ['À venir', 'ac-et-neutre'];
  }
  if (cert && cert.certifie) return ['Obtenue', 'ac-et-ok'];
  if (cert && cert.eligible) return ['À délivrer', 'ac-et-actif'];
  return ['Non accessible', 'ac-et-gris'];
}

const ICONES_ETAPE = {
  apprendre: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4.5A1.5 1.5 0 0 1 3 16.5v-11Z"/><path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5.5a1.5 1.5 0 0 0 1.5-1.5v-11Z"/></svg>',
  theorie: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.3 12.2 2.6 2.6 4.8-5"/></svg>',
  terrain: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6M20 9v6M7 6.5v11M17 6.5v11M7 12h10"/></svg>',
  certification: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-2 7 5.5-3 5.5 3-2-7"/></svg>',
};
const TEXTES_ETAPE = {
  apprendre: ['Apprendre — Les modules', 'Regarde et valide tous les contenus de la formation.', 'Les modules'],
  theorie: ['Théorie — Évaluation QCM', 'Valide tes connaissances avec le QCM.', 'Évaluation QCM'],
  terrain: ['Terrain — Évaluation pratique', 'Mets en pratique tes compétences lors d\'une évaluation avec un évaluateur.', 'Évaluation pratique'],
  certification: ['Certification — Deviens certifié', 'Valide toutes les étapes et obtiens ta certification.', 'Deviens certifié'],
};

function rendreSommaire() {
  const f = formation;
  const cat = formationCourante() || {};
  const reprise = f.reprise ? f.modules.flatMap((m) => m.contenus).find((c) => c.id === f.reprise) : null;
  const etapes = etapesDe();
  const cle2 = { apprendre: 'apprendre', theorie: 'theorie', terrain: 'terrain', certification: 'certification' };
  const st = statutDe(cat.cle ? cat : { cle: fCourante, pourcentage: f.pourcentage });
  const [libStatut, clStatut] = [STATUTS[st][0], STATUTS[st][1]];
  const duree = dureeTotale(f);
  const reg = regularite(f);

  // -- Identité + progression ------------------------------------------------
  const meta = [
    duree ? ['⏱', 'Durée totale : ' + duree] : null,
    ['▤', f.modules.length + ' module' + (f.modules.length > 1 ? 's' : '')],
    cat.certificationActive ? ['✦', 'Certification My Coach'] : null,
  ].filter(Boolean);

  const entete =
    '<div class="ac-fh">' +
      '<div class="ac-fh-id">' +
        '<span class="ac-fh-ic" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 4 2.5 9 12 14l9.5-5L12 4Z"/><path d="M6 11.2V16c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-4.8"/></svg>' +
        '</span>' +
        '<div class="ac-fh-tx">' +
          '<h1 class="ac-fh-t">' + echapper(cat.libelle || 'Ma formation') + '</h1>' +
          '<span class="ac-st ' + clStatut + '">' + echapper(libStatut) + '</span>' +
          '<p class="ac-fh-d">' + echapper(cat.titre
            ? 'Pour devenir ' + cat.titre + '.'
            : 'Parcours de formation My Coach.') + '</p>' +
          '<ul class="ac-fh-m">' + meta.map(([g, t]) =>
            '<li><i aria-hidden="true">' + g + '</i>' + echapper(t) + '</li>').join('') + '</ul>' +
        '</div>' +
      '</div>' +

      '<aside class="ac-fp">' +
        '<div class="ac-fp-h"><b>Ta progression</b><span>' + f.pourcentage + ' %</span></div>' +
        '<div class="ac-jauge' + (f.acheve ? ' ac-jauge-ok' : '') + '"><i style="width:' + f.pourcentage + '%"></i></div>' +
        '<p class="ac-fp-m">' + f.termines + ' / ' + f.total + ' contenu' + (f.total > 1 ? 's' : '') + ' terminé' + (f.termines > 1 ? 's' : '') + '</p>' +
        (reprise
          ? '<button type="button" class="ec-btn ec-btn-p ac-fp-b" id="acReprendre">' +
              '<i aria-hidden="true">▶</i> ' + (f.termines ? 'Reprendre ma formation' : 'Commencer ma formation') + '</button>' +
            // Le prochain contenu est NOMMÉ : « reprendre » sans dire quoi
            // oblige à le chercher dans la liste.
            '<p class="ac-fp-n">Suite : ' + echapper(reprise.titre) + '</p>'
          : '<p class="ac-fp-fini"><span aria-hidden="true">✓</span> Tous les contenus sont terminés</p>') +
      '</aside>' +
    '</div>';

  // -- La frise --------------------------------------------------------------
  const frise =
    '<div class="ac-parc">' +
      '<h2 class="ac-parc-t">Ton parcours</h2>' +
      '<ol class="ac-fr2">' + etapes.map((e, i) => {
        const cls = e.fait ? ' ac-fr2-fait' : e.courante ? ' ac-fr2-ici' : '';
        const [, , sous] = TEXTES_ETAPE[e.cle];
        return (i ? '<li class="ac-fr2-l' + (etapes[i - 1].fait ? ' ac-fr2-l-fait' : '') + '" aria-hidden="true"></li>' : '') +
          '<li class="ac-fr2-e' + cls + '"' + (e.courante ? ' aria-current="step"' : '') + '>' +
            '<span class="ac-fr2-d">' + (e.fait ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12.4 4 4 8-8.4"/></svg>' : ICONES_ETAPE[e.cle]) + '</span>' +
            '<span class="ac-fr2-t">' + (i + 1) + '. ' + echapper(e.libelle) + '</span>' +
            '<span class="ac-fr2-s">' + echapper(sous) + '</span>' +
          '</li>';
      }).join('') + '</ol>' +

      // -- Les quatre étapes, en accordéon ------------------------------------
      '<div class="ac-ets" id="acEtapes">' + etapes.map((e, i) => {
        const [titre, aide] = TEXTES_ETAPE[e.cle];
        const [lib, cl] = statutEtape(cle2[e.cle]);
        const corps = e.cle === 'apprendre'
          ? (f.modules.length ? f.modules.map(rendreModule).join('')
            : '<div class="ec-vide">Aucun module pour le moment.</div>')
          : e.cle === 'theorie' ? rendreCarteQcm()
          : e.cle === 'terrain' ? rendreCartePratique()
          : rendreCartesCertification();
        return '<details class="ac-et' + (e.courante ? ' ac-et-ici' : '') + '"' + (e.courante ? ' open' : '') + '>' +
          '<summary class="ac-et-h">' +
            '<span class="ac-et-n' + (e.fait ? ' ac-et-n-ok' : e.courante ? ' ac-et-n-ici' : '') + '">' + (i + 1) + '</span>' +
            '<span class="ac-et-tx"><b>' + echapper(titre) + '</b><span>' + echapper(aide) + '</span></span>' +
            '<span class="ac-et-st ' + cl + '">' + echapper(lib) + '</span>' +
            '<span class="ac-et-ch" aria-hidden="true">⌄</span>' +
          '</summary>' +
          '<div class="ac-et-c">' + (corps || '<div class="ec-vide">Rien à afficher pour le moment.</div>') + '</div>' +
          '</details>';
      }).join('') + '</div>' +
    '</div>';

  // -- Le panneau de droite --------------------------------------------------
  const points = [
    f.modules.length + ' module' + (f.modules.length > 1 ? 's' : '') + ' et ' + f.total + ' contenu' + (f.total > 1 ? 's' : ''),
    cat.pratiqueObligatoire ? 'Une évaluation pratique en situation réelle' : 'Une évaluation théorique par QCM',
    cat.certificationActive && cat.titre ? 'Le titre ' + cat.titre + ' à la clé' : 'Un parcours validé par un QCM',
  ];
  const panneau =
    '<aside class="ac-pan">' +
      '<section class="ac-pan-c">' +
        '<h2 class="ac-pan-t">À propos de cette formation</h2>' +
        '<p class="ac-pan-p">' + echapper(cat.titre
          ? 'Ce parcours te donne les clés pour obtenir le titre ' + cat.titre + ', avec méthode et exigence.'
          : 'Ce parcours te donne les clés pour progresser, avec méthode et exigence.') + '</p>' +
        '<ul class="ac-pan-l">' + points.map((p) =>
          '<li><span class="ac-pan-ck" aria-hidden="true">✓</span>' + echapper(p) + '</li>').join('') + '</ul>' +
      '</section>' +

      '<section class="ac-pan-c">' +
        '<h2 class="ac-pan-t"><span class="ac-pan-i" aria-hidden="true">🎧</span> Besoin d\'aide ?</h2>' +
        '<p class="ac-pan-p">Ton référent My Coach est là pour t\'accompagner si tu as la moindre question.</p>' +
        '<button type="button" class="ec-btn ac-pan-b" disabled title="Bientôt disponible">Contacter le support</button>' +
      '</section>' +

      '<section class="ac-pan-c">' +
        '<h2 class="ac-pan-t"><span class="ac-pan-i" aria-hidden="true">🗂</span> Ressources utiles</h2>' +
        '<p class="ac-pan-p">Les documents liés à la formation seront regroupés ici.</p>' +
        '<button type="button" class="ec-btn ac-pan-b" disabled title="Bientôt disponible">Voir les ressources</button>' +
      '</section>' +
    '</aside>';

  // -- La régularité ---------------------------------------------------------
  const motiv =
    '<div class="ac-reg">' +
      '<div class="ac-reg-photo" aria-hidden="true">' +
        '<img class="ac-reg-img" id="acRegPhoto" alt="" hidden />' +
      '</div>' +
      '<div class="ac-reg-tx">' +
        '<h2 class="ac-reg-t">Reste régulier, progresse chaque jour</h2>' +
        '<p class="ac-reg-p">Consacre un peu de temps chaque jour à ta formation. ' +
          'La régularité est ton meilleur allié !</p>' +
      '</div>' +
      '<div class="ac-reg-sem">' +
        '<div class="ac-reg-j">' + reg.semaine.map((j) =>
          '<span class="ac-reg-c' + (j.actif ? ' on' : j.futur ? ' futur' : '') + '">' +
            '<i aria-hidden="true">' + j.lettre + '</i>' +
            '<b aria-hidden="true">' + (j.actif ? '✓' : '') + '</b></span>').join('') + '</div>' +
        '<p class="ac-reg-s">' + (reg.serie
          ? reg.serie + ' jour' + (reg.serie > 1 ? 's' : '') + ' consécutif' + (reg.serie > 1 ? 's' : '') + ' 🔥'
          : 'Reprends aujourd\'hui pour lancer ta série') + '</p>' +
      '</div>' +
    '</div>';

  $('#acSommaire').innerHTML =
    '<button type="button" class="ec-back" id="acVersAccueil">← Retour à mes formations</button>' +
    entete +
    '<div class="ac-fcols">' +
      '<div class="ac-fcol-g">' + frise + motiv + '</div>' +
      panneau +
    '</div>';

  const acc = $('#acVersAccueil');
  if (acc) acc.addEventListener('click', ouvrirAccueil);
  const b = $('#acReprendre');
  if (b) b.addEventListener('click', () => ouvrir(f.reprise));
  const g = $('#acQcmGo');
  if (g) g.addEventListener('click', ouvrirEvaluation);
  const v = $('#acQcmVoir');
  if (v) v.addEventListener('click', ouvrirEvaluation);
  document.querySelectorAll('#acSommaire [data-contenu]').forEach((el) => {
    el.addEventListener('click', () => ouvrir(Number(el.dataset.contenu)));
  });
  document.querySelectorAll('#acSommaire [data-mini]').forEach((el) => {
    el.addEventListener('click', () => ouvrirEvaluation(Number(el.dataset.mini)));
  });
  const rp = $('#acRegPhoto');
  if (rp && PHOTO_REGULARITE) {
    rp.addEventListener('load', () => { rp.hidden = false; });
    rp.addEventListener('error', () => { rp.hidden = true; });
    rp.src = PHOTO_REGULARITE;
  }

  rendreBarreLaterale('academy');
  afficher('#acSommaire');
  window.scrollTo(0, 0);
}

// UN MODULE ACHEVÉ SE REPLIE. L'écran raccourcit à mesure qu'on avance : c'est
// exactement le retour dont l'apprenant a besoin, et ça évite de faire défiler
// vingt lignes cochées pour atteindre la suivante à faire.
//
// <details> plutôt qu'un repli maison : le navigateur gère l'accessibilité, le
// clavier et la recherche dans la page sans une ligne de script.
// LA LIGNE DU MINI-QCM, en bas du module. Elle n'apparaît QUE si le module a
// une banque : un module d'introduction n'en a pas, et n'a donc rien à afficher
// — plutôt qu'une ligne « non requis » qui ferait croire à une étape sautée.
//
// Le libellé du bouton porte le VERBE en toutes lettres. Une icône seule
// laisserait deviner ce qui va se passer au moment où il faut le savoir.
function rendreLigneMini(m) {
  const mini = m.mini;
  if (!mini || !mini.aBanque) return '';
  const cfg = mini.config || {};
  const reglage = '<span class="ac-mini-s">' + cfg.nbQuestions + ' questions · réussite à ' + cfg.seuilPct + ' %</span>';

  if (mini.reussi) {
    return '<div class="ac-mini ac-mini-ok">' +
      '<span class="ac-mini-ic" aria-hidden="true">✓</span>' +
      '<span class="ac-mini-tx"><b>Mini-QCM du module — réussi' +
        (mini.scorePct === null ? '' : ' (' + mini.scorePct + ' %)') + '</b>' + reglage + '</span>' +
      '<button type="button" class="ec-btn ac-mini-b" data-mini="' + m.id + '">Refaire le mini-QCM</button>' +
      '</div>';
  }
  if (!mini.contenusAcheves) {
    const reste = m.total - m.termines;
    return '<div class="ac-mini ac-mini-lock">' +
      '<span class="ac-mini-ic" aria-hidden="true">🔒</span>' +
      '<span class="ac-mini-tx"><b>Mini-QCM du module</b>' +
        '<span class="ac-mini-s">Termine les ' + reste + ' contenu' + (reste > 1 ? 's' : '') +
        ' restant' + (reste > 1 ? 's' : '') + ' pour l\'ouvrir</span></span>' +
      '</div>';
  }
  const rate = !!mini.derniere;
  return '<div class="ac-mini' + (rate ? ' ac-mini-ko' : '') + '">' +
    '<span class="ac-mini-ic" aria-hidden="true">' + (rate ? '↻' : '?') + '</span>' +
    '<span class="ac-mini-tx"><b>Mini-QCM du module' +
      (rate ? ' — non réussi (' + mini.derniere.scorePct + ' %)' : '') + '</b>' + reglage + '</span>' +
    '<button type="button" class="ec-btn ec-btn-p ac-mini-b" data-mini="' + m.id + '">' +
      (rate ? 'Recommencer le mini-QCM' : 'Passer le mini-QCM') + '</button>' +
    '</div>';
}

function rendreModule(m) {
  // UN MODULE FERMÉ N'AFFICHE PAS SES CONTENUS : les montrer grisés donnerait
  // envie de cliquer sur une porte close, et allongerait le sommaire de lignes
  // inutilisables.
  //
  // ⚠️ C'EST UN CHOIX D'AFFICHAGE, PAS UNE PROTECTION. Le serveur envoie bien
  // l'arbre complet, titres compris. Le vrai verrou est ailleurs, sur les trois
  // routes de contenu (lire, ouvrir, terminer) : c'est lui qui empêche de
  // traverser la formation, et lui seul qu'il faut croire.
  if (m.mini && !m.mini.deverrouille) {
    return '<details class="ac-mod ac-mod-lock">' +
      '<summary class="ac-mod-h">' +
        '<span class="ac-mod-ti">' +
          '<span class="ac-mod-t">' + echapper(m.titre) + '</span>' +
          '<span class="ac-mod-s">Réussis le mini-QCM du module précédent pour ouvrir ce module.</span>' +
        '</span>' +
        '<span class="ac-mod-c" aria-hidden="true">🔒</span>' +
      '</summary>' +
      '<p class="ac-mod-lockp">Ce module contient ' + m.total + ' contenu' + (m.total > 1 ? 's' : '') +
        '. Il s\'ouvrira dès que le mini-QCM du module précédent sera réussi.</p>' +
      '</details>';
  }

  const ouvert = !m.acheve;
  const lignes = '<div class="ac-liste">' + m.contenus.map((c) => {
    const [cls, ic] = etatDe(c);
    return '<button type="button" class="ac-l ' + cls + '" data-contenu="' + c.id + '">' +
      '<span class="ac-l-ic" aria-hidden="true">' + ic + '</span>' +
      '<span class="ac-l-t">' + echapper(c.titre) + '</span>' +
      (c.dureeMin ? '<span class="ac-l-d">' + c.dureeMin + ' min</span>' : '') +
      '</button>';
  }).join('') + '</div>';

  // Un module n'est « fait » que contenus terminés ET mini réussi : la pastille
  // doit dire la même chose que le verrou, sinon elle annonce une avance qui
  // n'existe pas.
  const fait = m.mini ? m.mini.franchi : m.acheve;

  return '<details class="ac-mod' + (fait ? ' ac-mod-ok' : '') + '"' + (ouvert ? ' open' : '') + '>' +
    '<summary class="ac-mod-h">' +
      '<span class="ac-mod-ti">' +
        '<span class="ac-mod-t">' + echapper(m.titre) + '</span>' +
        (m.description ? '<span class="ac-mod-s">' + echapper(m.description) + '</span>' : '') +
      '</span>' +
      '<span class="ac-mod-c">' + m.termines + '/' + m.total + (fait ? ' ✓' : '') + '</span>' +
    '</summary>' +
    lignes +
    rendreLigneMini(m) +
    '</details>';
}

// --- Lecture d'un contenu -----------------------------------------------------
//
//  L'ÉCRAN LE PLUS TRANSFORMÉ DU CHANTIER (lot B). Avant : une vidéo, un
//  encadré « j'ai terminé », deux flèches — et aucun contexte. On savait où on
//  était uniquement parce qu'on venait de cliquer.
//
//  Maintenant, le sommaire du parcours reste affiché à côté de la vidéo et
//  répond en permanence aux quatre questions : où je suis (la ligne en saphir),
//  ce que je viens de faire (les lignes cochées), ce qu'il me reste (la suite de
//  la liste), ce qui vient ensuite (la ligne juste en dessous).
//
//  LE GESTE PRINCIPAL EST FUSIONNÉ : « Terminer et continuer → » marque le
//  contenu puis ouvre le suivant. C'est le mouvement naturel, et il remplace
//  l'enchaînement « j'ai terminé » puis « suivant » qui demandait deux clics
//  pour une seule intention.
//
//  ⚠️ CE QUI N'A PAS CHANGÉ, ET NE DOIT PAS : terminer reste une DÉCLARATION du
//  collaborateur. On ne peut pas prouver qu'une vidéo YouTube a été regardée, et
//  aucun libellé de cet écran ne doit laisser croire le contraire.

const aPlat = () => (formation ? formation.modules.flatMap((m) => m.contenus) : []);

// ==========================================================================
//  CE QUI VIENT APRÈS UN CONTENU — ET POURQUOI CE N'EST PAS « LE SUIVANT ».
//
//  Le parcours a longtemps été une simple liste : le contenu d'après était
//  celui de la ligne du dessous, tous modules confondus. Depuis les mini-QCM,
//  cette liste ment à deux endroits : à la fin d'un module il y a une épreuve
//  avant la suite, et le module d'après peut être VERROUILLÉ. Enchaîner à
//  l'aveugle menait droit sur « Contenu introuvable » — le serveur refusait,
//  et l'écran ne savait pas dire pourquoi.
//
//  On répond donc à la vraie question : « après ce contenu, où va-t-on ? »
//   - un contenu de plus dans CE module      -> ce contenu ;
//   - dernier du module, un mini à réussir   -> le mini-QCM du module ;
//   - dernier du module, mini déjà réussi
//     ou module sans mini                    -> le premier contenu du module
//                                               suivant, S'IL EST OUVERT ;
//   - plus rien devant                       -> les étapes d'évaluation.
//
//  Le verrou reste tenu par le serveur : cette fonction ne l'invente pas, elle
//  évite seulement de proposer une porte qu'il refusera.
// ==========================================================================
function suiteDe(c) {
  if (!formation || !c) return { type: 'etapes' };
  const iMod = formation.modules.findIndex((m) => m.contenus.some((x) => x.id === c.id));
  if (iMod < 0) return { type: 'etapes' };
  const mod = formation.modules[iMod];
  const i = mod.contenus.findIndex((x) => x.id === c.id);

  if (i >= 0 && i < mod.contenus.length - 1) {
    return { type: 'contenu', id: mod.contenus[i + 1].id };
  }
  const mini = mod.mini;
  if (mini && mini.aBanque && !mini.reussi) {
    return { type: 'mini', moduleId: mod.id, titre: mod.titre };
  }
  return suiteApresModule(iMod);
}

// Le premier contenu du module suivant, s'il en existe un ET qu'il est ouvert.
// Un module encore verrouillé ne s'annonce pas : on renvoie aux étapes.
function suiteApresModule(iMod) {
  const suivant = formation ? formation.modules[iMod + 1] : null;
  if (suivant && suivant.contenus.length && (!suivant.mini || suivant.mini.deverrouille)) {
    return { type: 'contenu', id: suivant.contenus[0].id, titre: suivant.titre };
  }
  return { type: 'etapes' };
}

const suiteApresMini = (moduleId) =>
  suiteApresModule(formation ? formation.modules.findIndex((m) => m.id === moduleId) : -1);

// Aller là où `suiteDe` a dit d'aller. Un seul endroit qui sait enchaîner :
// dupliquer ce dispatch, c'est se garantir qu'une des copies oubliera le mini.
async function allerVers(suite) {
  if (!suite) { versEtapes(); return; }
  if (suite.type === 'contenu') { await ouvrir(suite.id); return; }
  if (suite.type === 'mini') { await ouvrirEvaluation(suite.moduleId); return; }
  versEtapes();
}

// Le sommaire latéral. Il montre TOUT le parcours, pas seulement le module
// courant : c'est ce qui permet de mesurer ce qu'il reste.
function rendreSommaireLateral(courant) {
  const f = formation;
  if (!f) return '';

  const modules = f.modules.map((m) => {
    // MÊME RÈGLE QUE LE SOMMAIRE PRINCIPAL : un module verrouillé n'offre pas
    // ses lignes. Les laisser cliquables ici rouvrirait exactement l'impasse
    // qu'on vient de fermer sur le bouton « Suivant » — le serveur refuse, et
    // l'écran ne sait dire que « Contenu introuvable ».
    if (m.mini && !m.mini.deverrouille) {
      return '<div class="ac-sl-mod ac-sl-lock">' +
        '<p class="ac-sl-mt">' + echapper(m.titre) + '</p>' +
        '<p class="ac-sl-lockp"><span aria-hidden="true">🔒</span> ' + m.total + ' contenu' +
          (m.total > 1 ? 's' : '') + ' — à ouvrir avec le mini-QCM précédent</p>' +
        '</div>';
    }
    const lignes = m.contenus.map((c) => {
      const ici = c.id === courant.id;
      const cls = ici ? 'ac-sl-ici' : c.termine ? 'ac-sl-fait' : 'ac-sl-avenir';
      const ic = ici ? '▶' : c.termine ? '✓' : '○';
      return '<button type="button" class="ac-sl-r ' + cls + '"' +
        (ici ? ' aria-current="true"' : '') +
        ' data-contenu="' + c.id + '">' +
        '<span class="ac-sl-ic" aria-hidden="true">' + ic + '</span>' +
        '<span class="ac-sl-t">' + echapper(c.titre) + '</span>' +
        (c.dureeMin ? '<span class="ac-sl-d">' + c.dureeMin + ' min</span>' : '') +
        '</button>';
    }).join('');
    // Le mini du module se rejoint aussi depuis le sommaire : c'est une étape
    // du parcours, pas une annexe. Fermé tant que les contenus ne sont pas
    // terminés — l'ouvrir plus tôt ferait cliquer sur un refus du serveur.
    const ligneMini = (m.mini && m.mini.aBanque)
      ? '<button type="button" class="ac-sl-r ac-sl-mini ' + (m.mini.reussi ? 'ac-sl-fait' : 'ac-sl-avenir') + '"' +
          (m.mini.disponible || m.mini.reussi ? ' data-mini="' + m.id + '"' : ' disabled') + '>' +
          '<span class="ac-sl-ic" aria-hidden="true">' + (m.mini.reussi ? '✓' : '?') + '</span>' +
          '<span class="ac-sl-t">Mini-QCM du module</span>' +
          '</button>'
      : '';
    return '<div class="ac-sl-mod">' +
      '<p class="ac-sl-mt">' + echapper(m.titre) + '</p>' +
      lignes + ligneMini +
      '</div>';
  }).join('');

  // Sur mobile, le sommaire est REPLIÉ sous la vidéo : ouvert, ses vingt-sept
  // lignes repousseraient le bouton d'action hors de l'écran. Sur desktop il
  // est déplié, c'est tout son intérêt.
  const deplie = typeof window !== 'undefined' && window.innerWidth >= 900;

  return '<aside class="ac-lec-side">' +
    '<details class="ac-sl"' + (deplie ? ' open' : '') + '>' +
      '<summary class="ac-sl-h">' +
        '<span class="ac-sl-hk">Le parcours</span>' +
        '<span class="ac-sl-hc">' + f.termines + '/' + f.total + '</span>' +
      '</summary>' +
      '<div class="ac-jauge ac-sl-jauge"><i style="width:' + f.pourcentage + '%"></i></div>' +
      '<div class="ac-sl-l">' + modules + '</div>' +
    '</details>' +
    '</aside>';
}

// Ouvrir un contenu. On enregistre l'ouverture AVANT d'afficher : c'est elle
// qui déplace le point de reprise. Elle ne termine RIEN — ouvrir une page n'est
// pas avoir regardé une vidéo, et confondre les deux viderait la progression de
// son sens.
async function ouvrir(id) {
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
  const cat = formationCourante();
  const mod = formation ? formation.modules.find((m) => m.contenus.some((x) => x.id === c.id)) : null;

  // youtube-nocookie : pas de cookie déposé tant que la vidéo n'est pas lancée.
  // L'identifiant a été validé côté serveur ; il est ré-échappé ici par principe.
  //
  // Sans identifiant, on le DIT et on n'empêche rien : le parcours continue,
  // le bouton reste actif. Bloquer quelqu'un sur un contenu qui manque serait
  // le punir d'un oubli d'administration.
  const lecteur = c.youtubeId
    ? '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(c.youtubeId) + '?rel=0" ' +
      'title="' + echapper(c.titre) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" ' +
      'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'
    : '<p class="ac-video-non">Cette vidéo n\'est pas encore disponible.</p>';

  // LE BOUTON PRINCIPAL. Il annonce EXACTEMENT où il mène — y compris quand ce
  // n'est pas une vidéo. « Suivant » à la fin d'un module laissait croire à une
  // vidéo de plus et tombait sur une porte fermée ; « Passer le mini-QCM » dit
  // ce qui arrive, et c'est le même geste.
  const suite = suiteDe(c);
  let principal;
  if (!etat.termine) {
    const libelle = suite.type === 'mini' ? 'Terminer et passer au mini-QCM →'
      : suite.type === 'contenu' ? 'Terminer et continuer →'
      : 'Terminer et passer au QCM →';
    principal = '<button type="button" class="ec-btn ec-btn-p ac-lec-cta" id="acFait">' + libelle + '</button>';
  } else if (suite.type === 'mini') {
    // ⚠️ MÊME IDENTIFIANT `acSuiv` POUR LES DEUX FORMES, ET C'EST VOULU : c'est
    // le bouton « avancer » du lecteur, et quatre suites E2E s'appuient dessus.
    // Ce qui change, c'est sa DESTINATION — pas son rôle.
    principal = '<button type="button" class="ec-btn ec-btn-p ac-lec-cta" id="acSuiv">Passer le mini-QCM →</button>';
  } else if (suite.type === 'contenu') {
    principal = '<button type="button" class="ec-btn ac-lec-cta" id="acSuiv">Suivant →</button>';
  } else {
    principal = '<button type="button" class="ec-btn ac-lec-cta" id="acVersEtapes">Voir les étapes d\'évaluation →</button>';
  }

  const resume = c.description
    ? '<section class="ac-lec-bloc"><h2 class="ac-lec-bt">En résumé</h2>' +
        '<p class="ac-lec-bp">' + echapper(c.description) + '</p></section>'
    : '';

  // Les points clés : le champ « texte » du contenu, quand il est renseigné.
  // Aucun modèle de données nouveau — c'est celui des contenus écrits, réutilisé
  // ici comme note de la vidéo quand l'administration en a saisi une.
  const cles = String(c.texte || '').trim()
    ? '<section class="ac-lec-bloc"><h2 class="ac-lec-bt">Les points clés</h2>' +
        '<div class="ac-lec-bp ac-lec-texte">' +
          String(c.texte).split(/\n+/).filter((l) => l.trim())
            .map((l) => '<p>' + echapper(l.trim()) + '</p>').join('') +
        '</div></section>'
    : '';

  $('#acLecteur').innerHTML =
    '<button type="button" class="ec-back" id="acBack">← ' +
      echapper(cat ? cat.libelle : 'Ma formation') + '</button>' +

    '<div class="ac-lec">' +
      '<div class="ac-lec-main">' +
        '<div class="ac-video">' + lecteur + '</div>' +

        '<p class="ac-lec-mod">' + echapper(mod ? mod.titre : c.moduleTitre) +
          (etat.dureeMin ? ' · ' + etat.dureeMin + ' min' : '') + '</p>' +
        '<h1 class="ac-lec-t">' + echapper(c.titre) + '</h1>' +

        // « Précédent » à gauche, le geste qui fait avancer à droite : on lit le
        // sens de la marche dans la disposition, pas seulement dans les flèches.
        '<div class="ac-lec-actions">' +
          '<button type="button" class="ec-btn ac-lec-prec" id="acPrec"' + (prec ? '' : ' disabled') +
            '>← Précédent</button>' +
          principal +
        '</div>' +

        (etat.termine
          ? '<p class="ac-deja"><span aria-hidden="true">✓</span> Terminé le ' + echapper(dateFr(etat.termineLe)) + '</p>'
          : '<p class="ac-lec-aide">Confirme quand tu as regardé cette vidéo en entier : ' +
              'c\'est ce qui fait avancer ta progression.</p>') +

        resume + cles +
      '</div>' +

      rendreSommaireLateral(c) +
    '</div>';

  $('#acBack').addEventListener('click', () => rendreSommaire());
  const f = $('#acFait');
  if (f) f.addEventListener('click', () => terminer(c.id));
  if (prec) $('#acPrec').addEventListener('click', () => ouvrir(prec.id));
  const s = $('#acSuiv');
  if (s) s.addEventListener('click', () => allerVers(suite));
  const e = $('#acVersEtapes');
  if (e) e.addEventListener('click', () => versEtapes());
  // Le sommaire latéral est navigable : c'est un sommaire, pas une décoration.
  document.querySelectorAll('#acLecteur [data-contenu]').forEach((el) =>
    el.addEventListener('click', () => {
      const id = Number(el.dataset.contenu);
      if (id !== c.id) ouvrir(id);
    }));
  document.querySelectorAll('#acLecteur [data-mini]').forEach((el) =>
    el.addEventListener('click', () => ouvrirEvaluation(Number(el.dataset.mini))));

  rendreBarreLaterale('academy');
  afficher('#acLecteur');
  window.scrollTo(0, 0);
}

// Revenir à la formation, sur ses étapes d'évaluation. On ne DÉMARRE pas le
// QCM depuis le lecteur : une tentative est une épreuve, elle mérite un clic
// délibéré sur sa propre carte.
function versEtapes() {
  rendreSommaire();
  const cible = $('#acEtapes');
  if (cible && cible.scrollIntoView) cible.scrollIntoView({ block: 'start', behavior: 'auto' });
}

// Terminer, puis enchaîner.
//
// ⚠️ LA SUITE SE RECALCULE APRÈS COUP, sur le parcours rendu par le serveur.
// Terminer ce contenu vient peut-être d'ouvrir le mini-QCM du module, voire le
// module suivant : une destination calculée AVANT le geste serait déjà périmée
// au moment de l'emprunter.
async function terminer(id) {
  const r = await apiAc('/api/academy/contenus/' + id + '/terminer', 'POST');
  if (r.status === 403) { await demarrer(); return; }
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) return;
  formation = r.data.formation;
  // Terminer le DERNIER contenu ouvre l'évaluation théorique : on relit son
  // état, sinon la carte du sommaire annoncerait encore un verrou levé.
  await chargerQcm();
  await allerVers(suiteDe(contenuOuvert));
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
    // DEUX RAISONS DE RESTER FERMÉE, et elles ne se disent pas pareil. Annoncer
    // « il te reste 0 contenu » à quelqu'un qui a tout regardé mais qu'un
    // mini-QCM retient serait à la fois faux et décourageant.
    const manquants = (qcm.minis || []).filter((m) => m.aBanque && !m.reussi);
    corps = reste > 0
      ? '<p class="ac-qcm-p"><span aria-hidden="true">🔒</span> Évaluation verrouillée : termine d\'abord tous les contenus de la formation.</p>' +
        '<p class="ac-qcm-s">Il te reste ' + reste + ' contenu' + (reste > 1 ? 's' : '') + ' à terminer sur ' + qcm.formation.total + '.</p>'
      : '<p class="ac-qcm-p"><span aria-hidden="true">🔒</span> Évaluation verrouillée : réussis d\'abord le mini-QCM de chaque module.</p>' +
        '<p class="ac-qcm-s">Il te reste ' + manquants.length + ' mini-QCM à réussir' +
          (manquants.length ? ' : ' + manquants.map((m) => echapper(m.moduleTitre)).join(', ') : '') + '.</p>';
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
async function ouvrirEvaluation(moduleId) {
  // ⚠️ CETTE FONCTION EST AUSSI POSÉE DIRECTEMENT COMME ÉCOUTEUR DE CLIC : elle
  // reçoit alors un Event en premier argument. Sans ce filtre, un objet Event
  // partirait au serveur comme identifiant de module.
  const mid = Number.isInteger(moduleId) ? moduleId : null;
  const r = await apiAc('/api/academy/qcm/tentatives', 'POST',
    mid === null ? { formation: fCourante } : { formation: fCourante, moduleId: mid });
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
  const estMini = tentative.portee === 'module';
  const modMini = estMini && formation
    ? formation.modules.find((m) => m.id === tentative.moduleId) || null
    : null;

  $('#acQcm').innerHTML =
    '<button type="button" class="ec-back" id="acQBack">← Ma formation</button>' +
    // L'ÉPREUVE SE NOMME. Les deux passent par cet écran, mais elles n'ont ni le
    // même enjeu ni les mêmes conséquences : afficher « Évaluation théorique »
    // pendant un mini de fin de module ferait croire à l'épreuve de
    // certification, et à un ratage bien plus lourd qu'il n'est.
    '<div class="ac-lec-h">' +
      '<p class="ac-lec-mod">' + (estMini
        ? 'Mini-QCM' + (modMini ? ' — ' + echapper(modMini.titre) : '')
        : 'Évaluation théorique') + '</p>' +
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
      '<button type="button" class="ec-btn ec-btn-p ac-fait-b" id="acQFin">' +
        (estMini ? 'Terminer le mini-QCM' : 'Terminer mon évaluation') + '</button>' +
      '<p class="ac-q-aide">Tu peux revenir sur tes réponses tant que tu n\'as pas rendu ' +
        (estMini ? 'ton mini-QCM' : 'ton évaluation') + '.</p>' +
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

// On relit TOUT le parcours, pas seulement l'état du QCM : un mini réussi vient
// peut-être d'ouvrir le module suivant, et le sommaire doit le montrer.
async function quitterEvaluation() {
  await chargerFormation();
}

async function terminerEvaluation() {
  const b = $('#acQFin');
  if (b) b.disabled = true;
  const r = await apiAc('/api/academy/qcm/tentatives/' + tentative.id + '/terminer', 'POST', {});
  if (r.status === 401) { deconnecter(); return; }
  if (r.status === 403) { await demarrer(); return; }
  if (!r.data.ok) { if (b) b.disabled = false; return; }
  tentative = r.data.tentative;
  // Un mini rend le parcours (le verrou du module suivant a pu sauter) ; une
  // finale rend l'état de l'évaluation théorique.
  if (r.data.parcours) { formation = r.data.parcours; await chargerQcm(); }
  else { qcm = r.data.etat || qcm; }
  rendreResultat();
}

// Le verdict arrive tout fait. L'écran ne recalcule rien — pas même le
// pourcentage — et n'affiche jamais le détail question par question : savoir
// lesquelles sont tombées à côté reviendrait à distribuer la moitié du corrigé.
function rendreResultat() {
  if (tentative.portee === 'module') { rendreResultatMini(); return; }
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

// LE RÉSULTAT D'UN MINI-QCM — et c'est le seul écran de l'application qui
// affiche une bonne réponse.
//
//  DEUX CHOSES QU'IL DIT, ET QU'IL DOIT DIRE ENSEMBLE :
//   - ce qui était juste et ce qui ne l'était pas, question par question. Un
//     exercice qui ne corrige pas n'apprend rien ;
//   - que ce résultat NE VALIDE PAS LA THÉORIE. Un écran qui annonce « réussi »
//     sans le préciser laisse croire à une étape de certification franchie.
//
//  La bonne réponse ne s'affiche que sur les questions manquées, parce que le
//  serveur ne l'envoie que là. L'écran ne choisit pas ce qu'il révèle : il ne
//  peut afficher que ce qu'il a reçu.
function rendreResultatMini() {
  const res = tentative.resultat;
  const valide = res.reussie;
  const corrige = tentative.corrige || [];
  const mod = (formation && formation.modules.find((m) => m.id === tentative.moduleId)) || null;
  // `formation` a été rafraîchi par terminerEvaluation : le module suivant est
  // déjà déverrouillé au moment où l'on calcule la destination.
  const apres = suiteApresMini(tentative.moduleId);

  const lignesCorrige = corrige.map((q) => {
    const bonnes = q.bonnes || [];
    return '<div class="ac-cor' + (q.correcte ? ' ac-cor-ok' : ' ac-cor-ko') + '">' +
      '<p class="ac-cor-h"><span class="ac-cor-p" aria-hidden="true">' + (q.correcte ? '✓' : '✗') + '</span>' +
        'Question ' + q.position + ' — ' + (q.correcte ? 'bonne réponse' : 'mauvaise réponse') + '</p>' +
      '<p class="ac-cor-e">' + echapper(q.enonce) + '</p>' +
      '<ul class="ac-cor-l">' + q.choix.map((ch) => {
        const choisi = q.reponse.indexOf(ch.id) >= 0;
        const juste = bonnes.indexOf(ch.id) >= 0;
        return '<li class="ac-cor-c' + (juste ? ' ac-cor-bonne' : (choisi ? ' ac-cor-mauvaise' : '')) + '">' +
          echapper(ch.texte) +
          (choisi ? '<i class="ac-cor-tag">ta réponse</i>' : '') +
          (juste ? '<b class="ac-cor-tag">bonne réponse</b>' : '') +
          '</li>';
      }).join('') + '</ul>' +
      '</div>';
  }).join('');

  $('#acQcm').innerHTML =
    '<button type="button" class="ec-back" id="acQBack">← Ma formation</button>' +
    '<div class="ac-lec-h">' +
      '<p class="ac-lec-mod">Mini-QCM' + (mod ? ' — ' + echapper(mod.titre) : '') + '</p>' +
    '</div>' +
    '<div class="ac-res ' + (valide ? 'ac-res-ok' : 'ac-res-ko') + '">' +
      '<p class="ac-res-score">Score : ' + res.scorePct + ' %</p>' +
      '<h1 class="ac-res-verdict">' + (valide ? 'Mini-QCM réussi' : 'Mini-QCM non réussi') + '</h1>' +
      '<p class="ac-res-detail">' + res.bonnes + ' bonne' + (res.bonnes > 1 ? 's' : '') + ' réponse' +
        (res.bonnes > 1 ? 's' : '') + ' sur ' + res.total + ' · seuil de réussite : ' + res.seuilPct + ' %.</p>' +
    '</div>' +

    '<div class="ac-res-suite">' +
      (valide
        ? '<p class="ac-res-t"><span aria-hidden="true">✓</span> Module validé — la suite du parcours est ouverte</p>'
        : '<p class="ac-res-note">Tu peux recommencer autant de fois que nécessaire.</p>') +
      // LE POINT À NE PAS ESCAMOTER : un mini n'est pas une étape de certification.
      '<p class="ac-res-note">Ce mini-QCM ne compte pas dans ta certification : seule l\'évaluation ' +
        'théorique finale valide la théorie.</p>' +
      // Réussi : on enchaîne. Le libellé NOMME la destination — le module qui
      // vient de s'ouvrir, ou les étapes d'évaluation s'il n'y en a plus.
      (valide
        ? '<button type="button" class="ec-btn ec-btn-p ac-fait-b" id="acQSuite">' +
            (apres.type === 'contenu'
              ? 'Continuer vers ' + echapper(apres.titre || 'le module suivant') + ' →'
              : 'Voir les étapes d\'évaluation →') +
          '</button>'
        : '') +
    '</div>' +

    '<div class="ac-corrige"><h2 class="ac-cor-t">Correction</h2>' + lignesCorrige + '</div>' +

    (valide ? '' :
      '<div class="ac-res-suite">' +
        '<button type="button" class="ec-btn ec-btn-p ac-fait-b" id="acQRefaire">Recommencer le mini-QCM</button>' +
      '</div>');

  $('#acQBack').addEventListener('click', quitterEvaluation);
  const rf = $('#acQRefaire');
  if (rf) rf.addEventListener('click', () => ouvrirEvaluation(tentative.moduleId));
  const su = $('#acQSuite');
  if (su) su.addEventListener('click', () => allerVers(apres));

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

// L'ENTRÉE « ÉVALUER » A QUITTÉ LE PARCOURS (lot A). Évaluer est un changement
// de rôle, pas une étape de formation : le bouton vit dans l'en-tête, révélé au
// démarrage par `montrer('#acRoleEval', moiEval)`. Il n'y a donc plus de carte
// à rendre ici — la laisser dans le sommaire faisait croire à l'apprenant qu'il
// avait une chose de plus à faire.

// --- Espace évaluateur --------------------------------------------------------

// LES SEPT STATUTS, tels que le serveur les nomme. L'écran ne les recalcule
// jamais : il traduit. Un huitième statut apparaîtrait ici parce qu'il serait
// d'abord apparu dans academyCertifications.js.
const LIB_STATUT = {
  formation_en_cours: 'Formation en cours',
  pratique_a_realiser: 'Pratique à réaliser',
  resultat_en_attente: 'Résultat en attente',
  pratique_a_repasser: 'À repasser',
  pratique_validee: 'Pratique validée',
  certification_a_delivrer: 'Certification à délivrer',
  certifie: 'Certifié',
};

// Un coach dont la théorie n'est pas validée n'a pas de fiche d'évaluation :
// le serveur la refuse (409), et c'est la bonne règle — on n'évalue pas la
// pratique de quelqu'un qui n'a pas passé la théorie. La ligne reste affichée
// avec sa progression ; elle n'est simplement pas cliquable.
const ficheOuvrable = (c) => !!c.theorieValidee;

async function ouvrirEvaluateur(onglet) {
  if (onglet) evalOnglet = onglet;
  const r = await apiAc(avecFormation('/api/academy/evaluateur/coachs'));
  if (r.status === 401) { deconnecter(); return; }
  if (r.status === 403) {
    bloquer('🔒', 'Évaluer & certifier',
      'Seuls les évaluateurs désignés et les administrateurs accèdent à cet espace.');
    return;
  }
  if (!r.data.ok) { bloquer('⚠️', 'Espace indisponible', 'Réessaie dans un instant.'); return; }
  evalListe = r.data;
  evalFiche = null;
  enSaisie = null;
  // L'onglet Certifications lit la même vérité que l'administration lisait :
  // éligibles, certifiés et ÉCARTS avec le Boost.
  await chargerCerts();
  rendreEvalListe();
}

async function chargerCerts() {
  const r = await apiAc(avecFormation('/api/academy/admin/certifications'));
  adminCerts = r.data && r.data.ok ? r.data : null;
}

function rendreOngletsEval() {
  return '<div class="ac-adm-onglets">' +
    [['coachs', 'Coachs'], ['certifications', 'Certifications']].map(([o, l]) =>
      '<button type="button" class="ac-adm-ong' + (evalOnglet === o ? ' on' : '') + '" data-onglet-eval="' + o + '">' +
        l + '</button>').join('') +
    '</div>';
}

// Une ligne de la liste unifiée. Elle porte de quoi DÉCIDER sans ouvrir la
// fiche : où en est l'apprentissage, le score de théorie, combien de tentatives
// pratiques, et le statut qui résume tout.
function ligneCoach(c) {
  const cl = 'ac-st-' + c.statut.replace(/_/g, '-');
  const ouvrable = ficheOuvrable(c);
  const detail = [
    c.progression ? c.progression.termines + ' / ' + c.progression.total + ' contenus' : null,
    c.theorieValidee && c.scoreTheorie !== null ? 'théorie ' + c.scoreTheorie + ' %' : null,
    c.pratique.nbTentatives
      ? c.pratique.nbTentatives + ' évaluation' + (c.pratique.nbTentatives > 1 ? 's' : '') + ' pratique' +
        (c.pratique.nbTentatives > 1 ? 's' : '')
      : null,
    c.certification.certifie && c.certification.certification
      ? 'certifié le ' + dateFr(c.certification.certification.obtenueLe) : null,
  ].filter(Boolean).join(' · ');

  const dedans =
    '<span class="ac-l-t">' +
      '<b>' + echapper(c.prenom || c.email) + '</b>' +
      '<span class="ac-eval-mail">' + echapper(c.email) + (detail ? ' · ' + echapper(detail) : '') + '</span>' +
    '</span>' +
    '<span class="ac-eval-etat ' + cl + '">' + echapper(LIB_STATUT[c.statut] || c.statut) + '</span>';

  return ouvrable
    ? '<button type="button" class="ac-l ac-eval-l" data-collab="' + echapper(c.email) + '">' + dedans + '</button>'
    // Pas un bouton mort : une ligne qui dit pourquoi elle n'ouvre pas.
    : '<div class="ac-l ac-eval-l ac-eval-l-fermee">' + dedans +
        '<span class="ac-eval-note">Fiche disponible dès la théorie validée</span></div>';
}

function rendreEvalListe() {
  const d = evalListe || { coachs: [] };
  const coachs = d.coachs || [];
  const aFaire = coachs.filter((c) => c.statut !== 'certifie' && c.statut !== 'formation_en_cours').length;

  $('#acEval').innerHTML =
    (moiCollab ? '<button type="button" class="ec-back" id="acEvalBack">← Mes formations</button>' : '') +
    (moiAdmin ? '<button type="button" class="ec-back" id="acEvalAdmin">Administration →</button>' : '') +
    '<h1 class="ec-t">Évaluer &amp; certifier</h1>' +
    // POUR QUELLE FORMATION. Un évaluateur qui intervient sur plusieurs
    // parcours doit le lire avant de prononcer un résultat, pas le deviner.
    rendreSelecteurEval() +
    rendreOngletsEval() +
    '<p class="ac-eval-err" id="acEvalErr" role="alert">' + echapper(evalErreur) + '</p>' +

    (evalOnglet === 'certifications' ? rendreCertifications() :
      '<p class="ec-sub">Tous les coachs de <b>' + echapper(nomFormation(fCourante)) + '</b>, à toutes les étapes. ' +
        (aFaire ? '<b>' + aFaire + '</b> dossier' + (aFaire > 1 ? 's' : '') + ' attend' + (aFaire > 1 ? 'ent' : '') +
          ' une action — ils sont en tête de liste.'
          : 'Aucun dossier n\'attend d\'action pour le moment.') + '</p>' +
      (coachs.length
        ? '<div class="ac-liste">' + coachs.map(ligneCoach).join('') + '</div>'
        : '<div class="ec-vide">Aucun coach n\'est inscrit à cette formation.</div>'));

  document.querySelectorAll('[data-formation-eval]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (el.dataset.formationEval === fCourante) return;
      fCourante = el.dataset.formationEval;
      evalListe = null; evalFiche = null; evalErreur = '';
      await ouvrirEvaluateur();
    }));

  // Changer d'onglet RELIT les données : les écarts avec le Boost naissent
  // ailleurs — dans une autre session, dans l'administration du Boost — et un
  // onglet qui réaffiche sa mémoire les manquerait.
  document.querySelectorAll('#acEval [data-onglet-eval]').forEach((el) =>
    el.addEventListener('click', async () => {
      evalOnglet = el.dataset.ongletEval;
      enSaisie = null; evalErreur = '';
      await ouvrirEvaluateur();
    }));

  const b = $('#acEvalBack');
  // On relit son propre état en revenant : un évaluateur est souvent aussi un
  // collaborateur, et sa carte doit refléter ce qui s'est passé entre-temps.
  if (b) b.addEventListener('click', ouvrirAccueil);
  const ga = $('#acEvalAdmin');
  if (ga) ga.addEventListener('click', () => ouvrirAdmin());
  document.querySelectorAll('#acEval [data-collab]').forEach((el) =>
    el.addEventListener('click', () => ouvrirFiche(el.dataset.collab)));
  document.querySelectorAll('#acEval [data-cert]').forEach((el) =>
    el.addEventListener('click', () => agirSurCertification(el.dataset.cert, el.dataset.geste)));

  rendreBarreLaterale('evaluer');
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
    '<button type="button" class="ec-back" id="acEvalRetour">← Tous les coachs</button>' +
    '<div class="ac-lec-h">' +
      '<p class="ac-lec-mod">Évaluer &amp; certifier — ' + echapper(nomFormation(fCourante)) + '</p>' +
      '<h1 class="ac-lec-t">' + echapper(c.prenom || c.email) + '</h1>' +
    '</div>' +
    // Le refus du serveur a sa place ICI AUSSI : la délivrance se joue
    // désormais depuis la fiche, et un refus sans endroit où s'écrire serait
    // un bouton qui ne fait rien.
    '<p class="ac-eval-err" id="acEvalErr" role="alert">' + echapper(evalErreur) + '</p>' +

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

    // LE BLOC CERTIFICATION, DANS LA MÊME FICHE. C'est tout l'objet de l'espace
    // unifié : la personne qui vient de prononcer « validé » ne change ni
    // d'écran ni de droit pour prononcer le diplôme.
    rendreCertifDeFiche(c.email) +

    (p.historique.length
      ? '<div class="ac-res-revoir"><b>Historique des évaluations pratiques</b><ul class="ac-prat-histo">' +
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
      champCas(evalFiche.cas, attente) +
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

  $('#acEvalRetour').addEventListener('click', () => ouvrirEvaluateur('coachs'));
  // Les consignes suivent le cas choisi. Elles sont vides aujourd'hui — le
  // câblage existe pour le jour où elles seront rédigées.
  const sel = $('#acEvCasId');
  if (sel) sel.addEventListener('change', () => {
    const z = $('#acEvCasCons');
    if (z) z.innerHTML = consignesDe((evalFiche && evalFiche.cas) || [], sel.value);
  });
  const ok_ = $('#acEvOk');
  if (ok_) ok_.addEventListener('click', () => enregistrer('valide'));
  const ko_ = $('#acEvKo');
  if (ko_) ko_.addEventListener('click', () => enregistrer('a_repasser'));
  const o = $('#acEvOuvrir');
  if (o) o.addEventListener('click', () => enregistrer(null));
  document.querySelectorAll('#acEval [data-cert]').forEach((el) =>
    el.addEventListener('click', () => agirSurCertification(el.dataset.cert, el.dataset.geste)));

  afficher('#acEval');
  window.scrollTo(0, 0);
}

// -- Le bloc certification de la fiche coach ----------------------------------
//
//  IL NE DÉCIDE DE RIEN. L'éligibilité, les prérequis et le diplôme viennent de
//  la liste que le serveur a calculée ; le bouton n'apparaît que si le serveur
//  a dit « éligible », et le serveur revérifie de toute façon à l'écriture.
//
//  ⚠️ LE RETRAIT N'EST PAS ICI. Délivrer conclut un parcours dont les prérequis
//  sont remplis ; retirer ferme des droits ouverts et exige un motif. Le second
//  reste à l'administrateur, dans l'onglet Certifications — et l'écran ne
//  dessine pas un bouton que le serveur refuserait.
function rendreCertifDeFiche(email) {
  const ligne = ((evalListe && evalListe.coachs) || []).find((c) => c.email === email);
  if (!ligne || !(evalListe && evalListe.certificationActive)) return '';
  const k = ligne.certification;
  const saisie = enSaisie && enSaisie.email === email && enSaisie.geste === 'delivrer';

  const prerequis = '<ul class="ac-cert-prereq">' + (k.prerequis || []).map((p) =>
    '<li class="' + (p.rempli ? 'ac-pr-ok' : 'ac-pr-non') + '">' +
      '<span aria-hidden="true">' + (p.rempli ? '✓' : '○') + '</span> ' +
      echapper(p.libelle) + (p.detail ? ' <i>— ' + echapper(p.detail) + '</i>' : '') +
    '</li>').join('') + '</ul>';

  let corps;
  if (k.certifie && k.certification) {
    corps = '<p class="ac-qcm-ok"><span aria-hidden="true">🎓</span> ' +
      echapper(titreCourant()) + ' — délivrée le ' + echapper(dateFr(k.certification.obtenueLe)) +
      (k.certification.delivreePar ? ' par ' + echapper(k.certification.delivreePar) : '') + '.</p>' + prerequis +
      '<p class="ac-q-aide">Le retrait d\'une certification est réservé à l\'administrateur, ' +
        'dans l\'onglet Certifications.</p>';
  } else if (k.eligible) {
    corps = '<p class="ac-qcm-p"><span aria-hidden="true">✓</span> Parcours complet : ce coach est éligible à la certification.</p>' +
      prerequis +
      (saisie
        ? '<div class="ac-adm-saisie">' +
            '<label class="ec-field"><span>Date d\'obtention</span>' +
              '<input id="acCertDate" type="date" value="' + aujourdhuiIso() + '" /></label>' +
            '<label class="ec-field"><span>Commentaire (facultatif)</span>' +
              '<input id="acCertCom" type="text" maxlength="1000" placeholder="Mention, remarque…" /></label>' +
            (ouvreBoost(fCourante)
              ? '<p class="ac-adm-avert">Cette délivrance ouvrira immédiatement l\'accès aux dossiers clients du Boost.</p>'
              : '') +
          '</div>' +
          '<div class="ac-eval-actions">' +
            '<button type="button" class="ec-btn ec-btn-p" data-cert="' + echapper(email) + '" data-geste="confirmer-delivrer">Confirmer la délivrance</button>' +
            '<button type="button" class="ec-btn" data-cert="' + echapper(email) + '" data-geste="annuler">Annuler</button>' +
          '</div>'
        : '<button type="button" class="ec-btn ec-btn-p ac-eval-plus" data-cert="' + echapper(email) +
            '" data-geste="delivrer">Délivrer la certification</button>');
  } else {
    corps = '<p class="ac-qcm-p"><span aria-hidden="true">🔒</span> Certification verrouillée : ' +
      'il reste des étapes à valider.</p>' + prerequis;
  }

  return '<section class="ac-qcm-carte ac-cert-' + k.etat.replace(/_/g, '-') + '">' +
    '<div class="ac-qcm-h"><b>Certification — ' + echapper(nomFormation(fCourante)) + '</b>' +
      '<span class="ac-qcm-etat ac-etat-c-' + k.etat.replace(/_/g, '-') + '">' +
        echapper({ non_eligible: 'Non éligible', eligible: 'Éligible', certifie: 'Certifié' }[k.etat] || '') +
      '</span></div>' + corps + '</section>';
}

// LE CAS PRATIQUE, tel que l'évaluateur le désigne.
//
//  DEUX RENDUS, UNE SEULE RÈGLE : la formation a-t-elle un référentiel ?
//   - elle en a un  -> une LISTE de ses cas, l'intitulé complet sous les yeux ;
//   - elle n'en a pas -> le champ libre d'avant, au caractère près.
//  C'est ce qui laisse Coach Nutrition exactement dans l'état où elle était :
//  zéro cas au référentiel, donc zéro changement à l'écran.
function champCas(cas, attente) {
  const liste = Array.isArray(cas) ? cas : [];
  if (!liste.length) {
    return '<label class="ec-field"><span>Cas ou support utilisé (facultatif)</span>' +
      '<input id="acEvCas" type="text" maxlength="200" placeholder="Ex. : mise en situation S1" value="' +
        echapper((attente && attente.cas) || '') + '" /></label>';
  }
  const choisi = attente && attente.casId ? String(attente.casId) : '';
  return '<label class="ec-field"><span>Cas pratique utilisé (facultatif)</span>' +
    '<select id="acEvCasId">' +
      '<option value="">— Aucun / autre support —</option>' +
      liste.map((c) =>
        '<option value="' + c.id + '"' + (String(c.id) === choisi ? ' selected' : '') + '>' +
          'Cas ' + c.ordre + ' — ' + echapper(c.titre) + '</option>').join('') +
    '</select></label>' +
    // Les consignes du cas retenu, quand elles existent. Aucune n'est rédigée
    // aujourd'hui : le bloc reste vide plutôt que d'afficher une promesse.
    '<div class="ac-eval-cas-c" id="acEvCasCons">' + consignesDe(liste, choisi) + '</div>' +
    // Le champ libre SURVIT à la liste : un évaluateur qui travaille avec son
    // propre support ne doit pas être forcé de choisir un cas qui n'est pas
    // celui qu'il a fait passer.
    '<label class="ec-field"><span>…ou autre support, en toutes lettres (facultatif)</span>' +
      '<input id="acEvCas" type="text" maxlength="200" placeholder="Laisse vide si tu as choisi un cas ci-dessus" value="' +
        echapper((attente && !attente.casId && attente.cas) || '') + '" /></label>';
}

function consignesDe(liste, id) {
  const c = liste.find((x) => String(x.id) === String(id));
  return c && c.consignes ? '<p class="ac-q-aide">' + echapper(c.consignes) + '</p>' : '';
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
    // Le référentiel d'abord : le serveur recopie le titre du cas choisi. Le
    // champ libre ne sert qu'en l'absence de sélection.
    casId: ($('#acEvCasId') && $('#acEvCasId').value) || null,
    cas: ($('#acEvCas') && $('#acEvCas').value) || null,
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
  // ⚠️ `cas` est reconduit : sans lui, la liste disparaîtrait au profit du champ
  // libre dès le premier enregistrement.
  evalFiche = { collaborateur: evalFiche.collaborateur, pratique: r.data.pratique, cas: evalFiche.cas };
  // LA LISTE EST RELUE, pas devinée. Valider la pratique peut rendre ce coach
  // éligible à la certification — le bloc du dessous en dépend, et l'écran ne
  // recalcule jamais une éligibilité lui-même.
  await rafraichirListeEval();
  rendreEvalFiche();
}

// Relit la liste unifiée sans quitter l'écran courant. Utilisée après chaque
// écriture : c'est le serveur qui dit où en est le coach, jamais l'écran.
async function rafraichirListeEval() {
  const r = await apiAc(avecFormation('/api/academy/evaluateur/coachs'));
  if (r.data && r.data.ok) evalListe = r.data;
  await chargerCerts();
}

// --- Gestion des évaluateurs (administrateur) ---------------------------------
//
//  UN écran, deux gestes : désigner, retirer. Ce n'est pas l'administration de
//  l'Academy — celle-là vit dans l'onglet « Contenus » (lot 6).
//
//  DEUX CHOSES QUE CET ÉCRAN NE FAIT PAS :
//   - il ne rend pas l'administrateur évaluateur. Administrer et habiliter sont
//     deux métiers ; un admin qui veut évaluer se désigne, et le geste est tracé
//     comme n'importe quel autre ;
//   - il ne décide de rien. Chaque clic part au serveur, qui reste seul juge :
//     le drapeau `admin` reçu au démarrage ne sert qu'à afficher l'entrée.
//
//  L'entrée elle-même est dans l'en-tête depuis le lot A (`#acRoleAdmin`), pour
//  la même raison que « Évaluer » : ce n'est pas une étape du parcours.

// Chaque onglet lit SES données au moment où il s'affiche. Les écarts entre
// l'Academy et le Boost, comme l'état de publication d'une formation, naissent
// ailleurs — dans une autre session, dans l'administration du Boost : un onglet
// qui réafficherait sa mémoire les manquerait.
async function chargerAdminOnglet() {
  // Les certifications ont quitté cet écran : elles vivent dans « Évaluer &
  // certifier », auprès de l'évaluation qu'elles concluent. Les laisser aux
  // deux endroits ferait deux vérités pour un seul geste.
  if (adminOnglet !== 'contenus') return;
  await chargerAdminFormations();
  await chargerAdminArbre();
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
  return '<p class="ec-sub">Qui peut évaluer et certifier <b>sans être administrateur</b>. ' +
      'Un administrateur a ces droits d\'office : cette liste sert à les donner aux autres.</p>' +

    '<div class="ac-adm-compte"><b>' + actifs + '</b> évaluateur' + (actifs > 1 ? 's' : '') +
      ' autorisé' + (actifs > 1 ? 's' : '') + ' sur ' + adminComptes.length + ' compte' +
      (adminComptes.length > 1 ? 's' : '') + '.</div>' +

    (adminComptes.length
      ? '<div class="ac-liste">' + adminComptes.map(ligneCompte).join('') + '</div>'
      : '<div class="ec-vide">Aucun collaborateur à afficher pour le moment.</div>');
}

function rendreAdmin() {
  const contenus_ = adminOnglet === 'contenus';

  $('#acAdmin').innerHTML =
    // Les écrans se renvoient l'un à l'autre : l'administrateur est souvent
    // aussi évaluateur, parfois aussi collaborateur.
    (moiCollab ? '<button type="button" class="ec-back" id="acAdmBack">← Mes formations</button>'
      : moiEval ? '<button type="button" class="ec-back" id="acAdmEval">← Évaluer &amp; certifier</button>' : '') +

    '<h1 class="ec-t">Administration My Coach Academy</h1>' +
    rendreOngletsAdmin() +
    '<p class="ac-eval-err" id="acAdmErr" role="alert">' + echapper(admErreur) + '</p>' +
    (contenus_ ? rendreAdminContenus() : rendrePanneauEvaluateurs());

  // Changer d'onglet RELIT les données : l'état de publication d'une formation
  // naît ailleurs — dans une autre session — et un onglet qui réaffiche sa
  // mémoire le manquerait.
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

  // Revenir à sa propre formation. On repasse par le catalogue PUBLIÉ : il a pu
  // changer sous les pieds de l'administrateur — c'est justement lui qui vient
  // de publier ou de dépublier.
  const b = $('#acAdmBack');
  if (b) b.addEventListener('click', async () => {
    // On repasse par le catalogue PUBLIÉ : il a pu changer sous les pieds de
    // l'administrateur — c'est justement lui qui vient de publier ou dépublier.
    await ouvrirAccueil();
  });
  const e = $('#acAdmEval');
  if (e) e.addEventListener('click', ouvrirEvaluateur);

  document.querySelectorAll('#acAdmin [data-agir]').forEach((el) =>
    el.addEventListener('click', () => agirSurCompte(el.dataset.compte, el.dataset.agir)));

  rendreBarreLaterale('administrer');
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
      (ouvreBoost(c.formation)
        ? '<p class="ac-qcm-s">Tu peux désormais suivre des clients dans le Boost Nutrition.</p>'
        : '') +
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

// --- L'onglet Certifications de « Évaluer & certifier » -----------------------
//
//  MÊME DONNÉE, NOUVELLE MAISON. Cette vue lisait déjà éligibles, certifiés et
//  écarts avec le Boost ; elle a quitté l'administration pour rejoindre
//  l'évaluation qu'elle conclut. La délivrance est un geste d'évaluateur ; le
//  RETRAIT reste un geste d'administrateur, et le bouton n'apparaît que si le
//  serveur a dit `peutRetirer` — on ne dessine pas ce qu'il refuserait.

function rendreOngletsAdmin() {
  return '<div class="ac-adm-onglets">' +
    ['evaluateurs', 'contenus'].map((o) =>
      '<button type="button" class="ac-adm-ong' + (adminOnglet === o ? ' on' : '') + '" data-onglet="' + o + '">' +
        (o === 'evaluateurs' ? 'Évaluateurs' : 'Contenus') +
        '</button>').join('') +
    '</div>';
}

function rendreCertifications() {
  const d = adminCerts || { eligibles: [], certifies: [], ecarts: [] };
  // C'est le SERVEUR qui dit qui peut retirer un diplôme. L'écran ne déduit pas
  // ce droit de `moiAdmin` : un drapeau d'affichage et une garde de route qui
  // se répondraient de mémoire finiraient par diverger.
  const peutRetirer = !!(evalListe && evalListe.peutRetirer);

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
            (ouvreBoost(fCourante)
              ? '<p class="ac-adm-avert">Cette délivrance ouvrira immédiatement l\'accès aux dossiers clients du Boost.</p>'
              : '') +
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
        (!peutRetirer
          ? '<span class="ac-eval-note">Retrait réservé à l\'administrateur</span>'
          : saisie
          ? '<button type="button" class="ec-btn ac-adm-b ac-adm-danger" data-cert="' + echapper(c.email) + '" data-geste="confirmer-retirer">Confirmer le retrait</button>' +
            '<button type="button" class="ec-btn ac-adm-b" data-cert="' + echapper(c.email) + '" data-geste="annuler">Annuler</button>'
          : '<button type="button" class="ec-btn ac-adm-b" data-cert="' + echapper(c.email) + '" data-geste="retirer">Retirer la certification</button>') +
      '</span>' +
      (saisie && peutRetirer
        ? '<div class="ac-adm-saisie">' +
            '<label class="ec-field"><span>Motif du retrait (obligatoire)</span>' +
              '<input id="acCertMotif" type="text" maxlength="1000" placeholder="Pourquoi ce retrait ?" /></label>' +
            '<p class="ac-adm-avert">Le diplôme reste dans l\'historique avec ce motif. Les droits ' +
              echapper(nomFormation(fCourante)) + ' du collaborateur se ferment immédiatement.</p>' +
          '</div>'
        : '') +
      '</div>';
  };

  // PAS DE SÉLECTEUR DE FORMATION ICI : l'écran unifié le pose une fois,
  // au-dessus des onglets. Le rendre une seconde fois donnerait deux jeux de
  // boutons pour un seul choix.
  return '<p class="ac-qcm-s">Certifications de <b>' + echapper(nomFormation(fCourante)) + '</b>.</p>' +
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

// Les deux gestes du diplôme, depuis l'espace « Évaluer & certifier ». Ils
// re-rendent l'écran d'où ils viennent : la fiche d'un coach, ou l'onglet
// Certifications. `evalFiche` dit lequel.
async function agirSurCertification(email, geste) {
  const rendre = () => (evalFiche ? rendreEvalFiche() : rendreEvalListe());
  if (geste === 'delivrer' || geste === 'retirer') { enSaisie = { email, geste }; evalErreur = ''; rendre(); return; }
  if (geste === 'annuler') { enSaisie = null; evalErreur = ''; rendre(); return; }

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
    // plutôt que d'inventer un message. Gardé EN ÉTAT, car le rendu suivant
    // effacerait un message posé directement dans le DOM.
    evalErreur = r.data.error || 'Action impossible.';
    // ON GARDE LE PANNEAU OUVERT. Un refus se corrige — un motif manquant, une
    // date mal formée : refermer la saisie obligerait à tout rouvrir et à tout
    // retaper, alors que la personne est justement en train de corriger.
    await rafraichirListeEval();
    return (evalFiche ? rendreEvalFiche() : rendreEvalListe());
  }
  evalErreur = '';
  enSaisie = null;
  await rafraichirListeEval();
  return (evalFiche ? rendreEvalFiche() : rendreEvalListe());
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
  // Le menu de compte : il s'ouvre au clic, se referme au clic ailleurs et à
  // la touche Échap. Rien d'autre — ce n'est pas un menu de navigation.
  // La photo de la colonne de gauche, si un fichier a été fourni. `onerror`
  // est un filet : un nom de fichier erroné masque l'image au lieu de laisser
  // une icône cassée sur le marine.
  const photo = $('#acCxPhoto');
  if (photo && PHOTO_CONNEXION) {
    photo.addEventListener('load', () => { photo.hidden = false; });
    photo.addEventListener('error', () => { photo.hidden = true; });
    photo.src = PHOTO_CONNEXION;
  }

  // Montrer/masquer le code saisi. C'est de l'AFFICHAGE et rien d'autre : le
  // champ, son nom et ce qui part au serveur ne changent pas.
  const oeil = $('#acVoirPin');
  if (oeil) oeil.addEventListener('click', () => {
    const champ = $('#acPin');
    if (!champ) return;
    const visible = champ.type === 'text';
    champ.type = visible ? 'password' : 'text';
    oeil.setAttribute('aria-label', visible ? 'Afficher le code' : 'Masquer le code');
    oeil.classList.toggle('on', !visible);
    champ.focus();
  });

  const bc = $('#acCompte');
  const menu = $('#acMenu');
  if (bc && menu) {
    bc.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      bc.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', () => {
      if (!menu.hidden) { menu.hidden = true; bc.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { menu.hidden = true; bc.setAttribute('aria-expanded', 'false'); }
    });
  }
  $('#acOut').addEventListener('click', async () => {
    if (session) { try { await fetch('/account/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + session.token } }); } catch (_) {} }
    deconnecter();
  });
  demarrer();
});
