'use strict';
// ============================================================================
//  ESPACE COACH NUTRITION — logique de la page /coach.
//
//  Autonome : ne partage aucune ligne avec public/app.js. Un espace coach et un
//  espace client n'ont ni les mêmes écrans, ni les mêmes données, ni le même
//  rythme d'évolution ; les coudre ensemble ne ferait qu'obliger à relire l'un
//  chaque fois qu'on touche à l'autre.
//
//  CE QUE CET ÉCRAN NE FAIT PAS, ET C'EST VOULU :
//   - il ne filtre RIEN côté client. La liste reçue est déjà celle du coach
//     connecté (scoping serveur). Filtrer ici donnerait l'illusion d'un
//     cloisonnement qui n'existerait qu'à l'affichage ;
//   - il n'invente aucune donnée. L'« action en cours » et le nombre de repas
//     depuis le dernier rendez-vous n'existent pas encore en base : ils ne sont
//     donc pas affichés du tout, plutôt qu'affichés vides ou à zéro. Un « 0 »
//     serait lu comme « ce client n'a rien fait », ce qui serait faux.
// ============================================================================

const CLE = 'mc-coach-session';   // propre à cette page : ne touche pas la session de l'app client

const STATUTS = { a_demarrer: 'À démarrer', en_cours: 'En cours', termine: 'Terminé', expire: 'Expiré', interrompu: 'Interrompu' };
const CERT = { non_certifie: 'Non certifiée', en_cours: 'En cours de validation', certifie: 'Validée', suspendu: 'Suspendue' };
const JOURNAL = {
  creation: 'Boost créé', attribution: 'Coach Nutrition attribué', demarrage: 'Étape 1 validée — 16 semaines lancées',
  etape_validee: 'Étape validée', prolongation: 'Prolongation', expiration: 'Arrivé à échéance',
  terminaison: 'Boost terminé', interruption: 'Boost interrompu',
};
const ACTIFS = ['a_demarrer', 'en_cours'];

const $ = (s) => document.querySelector(s);
const montrer = (sel, oui) => { const el = $(sel); if (el) el.hidden = !oui; };

let session = null;      // { email, token }
let dossiers = [];

function echapper(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
function dateHeureFr(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
// Le prénom quand on l'a, sinon la partie locale de l'email. Jamais un nom
// inventé : la table des comptes ne porte pas de nom de famille.
const nomAffiche = (b) => echapper(b.clientPrenom || String(b.clientEmail || '').split('@')[0] || '—');

async function apiCoach(route) {
  const res = await fetch(route, { headers: session ? { Authorization: 'Bearer ' + session.token } : {} });
  let d = null;
  try { d = await res.json(); } catch (_) { /* réponse non JSON */ }
  return { status: res.status, data: d || {} };
}

// --- Écrans -----------------------------------------------------------------

function afficher(ecran) {
  for (const id of ['#ecBoot', '#ecLogin', '#ecBloc', '#ecListe', '#ecFiche']) montrer(id, id === ecran);
}

function bloquer(icone, titre, texte, detail) {
  $('#ecBlocIc').textContent = icone;
  $('#ecBlocT').textContent = titre;
  $('#ecBlocP').textContent = texte;
  const d = $('#ecBlocDet');
  d.innerHTML = detail || '';
  d.hidden = !detail;
  afficher('#ecBloc');
}

function deconnecter() {
  try { localStorage.removeItem(CLE); } catch (_) { /* stockage indisponible */ }
  session = null;
  montrer('#ecMe', false);
  afficher('#ecLogin');
}

// --- Démarrage --------------------------------------------------------------

async function demarrer() {
  try { session = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (_) { session = null; }
  if (!session || !session.token) { afficher('#ecLogin'); return; }

  const moi = await apiCoach('/api/boost/coach/moi');
  // Jeton périmé ou révoqué : on repart de l'écran de connexion, sans drame.
  if (moi.status === 401) { deconnecter(); return; }
  if (!moi.data.ok) { bloquer('⚠️', 'Espace indisponible', 'Réessaie dans un instant.'); return; }

  $('#ecMeNom').textContent = moi.data.prenom || moi.data.email;
  montrer('#ecMe', true);

  // Trois états, trois écrans. Le refus d'un compte client et l'attente de
  // certification ne sont pas la même chose et ne se disent pas pareil.
  if (!moi.data.collaborateur) {
    bloquer('🔒', 'Espace réservé aux Coachs Nutrition',
      'Ton compte n\'est pas un compte collaborateur. Si tu es client, ton espace se trouve sur la page d\'accueil de l\'application.');
    return;
  }
  if (!moi.data.certifie) {
    const c = moi.data.certification || {};
    const det = '<p>Statut de ta certification : <b>' + echapper(CERT[c.statut] || 'Non certifiée') + '</b></p>' +
      (c.evaluateur ? '<p>Évaluateur : <b>' + echapper(c.evaluateur) + '</b></p>' : '') +
      (c.scoreQcm !== null && c.scoreQcm !== undefined ? '<p>Score QCM : <b>' + echapper(c.scoreQcm) + '/100</b></p>' : '');
    bloquer('⏳', 'Ta certification Coach Nutrition n\'est pas encore validée',
      'Tu retrouveras tes clients ici dès qu\'elle le sera. Aucun dossier n\'est accessible d\'ici là.', det);
    return;
  }
  await chargerClients();
}

async function chargerClients() {
  const r = await apiCoach('/api/boost/coach/dossiers');
  // La certification a pu être retirée entre-temps : le serveur ferme, l'écran suit.
  if (r.status === 403) { await demarrer(); return; }
  if (r.status === 401) { deconnecter(); return; }
  dossiers = r.data.dossiers || [];
  rendreListe();
}

// --- Mes clients ------------------------------------------------------------

function carteClient(b) {
  const enRetard = typeof b.joursRestants === 'number' && b.joursRestants < 0;
  // On ne montre que ce qui existe vraiment : une date absente ne produit pas
  // de ligne, plutôt qu'une ligne « — ».
  const infos = [];
  if (b.demarreLe) infos.push('<span class="ec-cli-info">Début ' + dateFr(b.demarreLe) + '</span>');
  if (b.echeanceLe) {
    infos.push('<span class="ec-cli-info' + (enRetard ? ' ec-late' : '') + '">' +
      (enRetard ? 'Échéance dépassée le ' + dateFr(b.echeanceLe)
        : 'Jusqu\'au ' + dateFr(b.echeanceLe) + (typeof b.joursRestants === 'number' ? ' · ' + b.joursRestants + ' j' : '')) +
      '</span>');
  }
  if (!b.demarreLe) infos.push('<span class="ec-cli-info">Pas encore démarré</span>');

  return '<button type="button" class="ec-cli ec-cli-' + b.statut + '" data-id="' + b.id + '">' +
    '<span class="ec-cli-h">' +
      '<span><span class="ec-cli-nom">' + nomAffiche(b) + '</span>' +
      '<span class="ec-cli-mail"> ' + echapper(b.clientEmail) + '</span></span>' +
      '<span class="ec-badge ec-b-' + b.statut + '">' + echapper(STATUTS[b.statut] || b.statut) + '</span>' +
    '</span>' +
    '<span class="ec-cli-b">' +
      '<span class="ec-cli-etape">Étape ' + b.etapesValidees + '/' + b.etapesTotal + '</span>' +
      infos.join('') +
    '</span></button>';
}

function rendreListe() {
  const actifs = dossiers.filter((b) => ACTIFS.includes(b.statut));
  const anciens = dossiers.filter((b) => !ACTIFS.includes(b.statut));

  $('#ecActifs').innerHTML = actifs.length ? actifs.map(carteClient).join('')
    : '<div class="ec-vide">Aucun suivi en cours pour le moment.<br>Les clients qui te sont attribués apparaîtront ici.</div>';

  // Les dossiers clos sont repliés : ils ne doivent pas encombrer la vue de
  // travail, mais ils restent à un clic — un coach a besoin de les relire.
  const bloc = $('#ecAnciensBloc');
  bloc.hidden = anciens.length === 0;
  if (anciens.length) {
    $('#ecAnciensLbl').textContent = 'Anciens suivis (' + anciens.length + ')';
    $('#ecAnciens').innerHTML = anciens.map(carteClient).join('');
  }
  const b = $('#ecAnciensB');
  b.setAttribute('aria-expanded', 'false');
  $('#ecAnciens').hidden = true;

  afficher('#ecListe');
  cablerCartes();
}

function cablerCartes() {
  document.querySelectorAll('.ec-cli').forEach((c) => {
    c.addEventListener('click', () => ouvrirFiche(Number(c.dataset.id)));
  });
}

// --- Fiche client (coquille) ------------------------------------------------

async function ouvrirFiche(id) {
  const r = await apiCoach('/api/boost/coach/dossiers/' + id);
  if (r.status === 403) { await demarrer(); return; }
  if (r.status === 401) { deconnecter(); return; }
  if (!r.data.ok) {
    // 404 : dossier inexistant ou hors de son portefeuille. On ne distingue pas
    // les deux cas — c'est exactement ce que fait le serveur.
    bloquer('🔍', 'Dossier introuvable', 'Ce dossier n\'existe pas ou ne fait pas partie de tes suivis.');
    return;
  }
  rendreFiche(r.data.boost);
}

function rendreFiche(b) {
  const enRetard = typeof b.joursRestants === 'number' && b.joursRestants < 0;
  const etape = b.etapeCourante || b.etapesTotal;

  const faits = [
    ['Étape', 'Étape ' + b.etapesValidees + '/' + b.etapesTotal,
      b.etapeCourante ? 'Prochaine : Étape ' + b.etapeCourante : 'Parcours terminé'],
    ['Statut', STATUTS[b.statut] || b.statut, ''],
    ['Début', b.demarreLe ? dateFr(b.demarreLe) : '—', b.demarreLe ? '' : 'à la validation de l\'Étape 1'],
    ['Date limite', b.echeanceLe ? dateFr(b.echeanceLe) : '—',
      b.echeanceLe && typeof b.joursRestants === 'number'
        ? (enRetard ? 'dépassée de ' + Math.abs(b.joursRestants) + ' j' : b.joursRestants + ' jours restants')
        : '16 semaines dès l\'Étape 1'],
  ];

  $('#ecFiche').innerHTML =
    '<button type="button" class="ec-back" id="ecBack">← Mes clients</button>' +
    '<div class="ec-fiche-h">' +
      '<div><h1 class="ec-fiche-nom">' + nomAffiche(b) + '</h1>' +
      '<p class="ec-fiche-mail">' + echapper(b.clientEmail) + '</p></div>' +
      '<span class="ec-badge ec-b-' + b.statut + '">' + echapper(STATUTS[b.statut] || b.statut) + '</span>' +
    '</div>' +
    '<div class="ec-faits">' + faits.map(([t, v, s]) =>
      '<div class="ec-fait"><i>' + echapper(t) + '</i><b>' + echapper(v) + '</b>' +
      (s ? '<small>' + echapper(s) + '</small>' : '') + '</div>').join('') + '</div>' +
    // Zone centrale : le rendez-vous. S1 est construite ; les Étapes suivantes
    // annoncent ce qui vient plutôt que de le simuler.
    '<div id="ecRdv"></div>' +
    '<button type="button" class="ec-btn ec-hist-b" id="ecHistB" data-id="' + b.id + '">Voir le journal du dossier</button>' +
    '<div class="ec-hist" id="ecHist" hidden></div>';

  $('#ecBack').addEventListener('click', () => { afficher('#ecListe'); window.scrollTo(0, 0); });
  $('#ecHistB').addEventListener('click', () => basculerHistorique(b.id));
  afficher('#ecFiche');
  window.scrollTo(0, 0);
  rendreRendezVous(b);
}

// ============================================================================
//  LES RENDEZ-VOUS
//
//  UN SEUL écran, paramétré par l'Étape — pas douze écrans. S1 est le
//  rendez-vous fondateur (on découvre le client) ; S2 à S11 sont dix fois le
//  MÊME rendez-vous de suivi : on regarde l'action précédente, on décide de la
//  suite, on en pose une nouvelle. Écrire dix variantes garantirait qu'elles
//  divergent au premier correctif.
//
//  ZÉRO PRÉPARATION : le coach ouvre, et tout ce qu'il lui faut est déjà là —
//  l'action de la période écoulée, ce qui s'est dit la fois d'avant,
//  l'historique. Il n'a rien à chercher ni à relire ailleurs.
// ============================================================================

const OBJECTIFS = [
  ['perte', 'Perdre du poids'],
  ['energie', 'Se sentir mieux / retrouver de l\'énergie'],
  ['habitudes', 'Améliorer ses habitudes alimentaires'],
  ['prise', 'Prendre du poids / de la masse'],
  ['autre', 'Autre'],
];
const HABITUDES = [
  ['organisation', 'Organisation des repas', 'Combien de repas ? À quelles heures ?'],
  ['petitDejeuner', 'Petit-déjeuner', 'Pris ou sauté ? Que mange-t-il ?'],
  ['dejeuner', 'Déjeuner', 'Maison, cantine, sur le pouce ?'],
  ['diner', 'Dîner', 'À quelle heure ? Quelle quantité ?'],
  ['collations', 'Collations / grignotages', 'À quels moments ? Quoi ?'],
  ['boissons', 'Boissons', 'Eau, sodas, alcool, café…'],
  ['exterieur', 'Repas à l\'extérieur', 'Combien par semaine ?'],
  ['preparation', 'Organisation / préparation', 'Courses, batch cooking, qui cuisine ?'],
];
const DIFFICULTES = [
  ['temps', 'Manque de temps'], ['faim', 'Faim / fringales'], ['grignotage', 'Grignotage'],
  ['portions', 'Portions'], ['exterieur', 'Repas à l\'extérieur'], ['organisation', 'Manque d\'organisation'],
  ['sucre', 'Envies de sucre'], ['weekend', 'Week-end'], ['autre', 'Autre'],
];
const FREQUENCES = ['Tous les jours', '5 fois par semaine', '3 fois par semaine', '2 fois par semaine', '1 fois par semaine'];

// Trois constats, aucune note. Les libellés le disent : on regarde ce qui s'est
// passé pour adapter la suite, on n'évalue pas le client.
const RESULTATS = [
  ['realisee', 'Réalisée', 'ec-res-ok'],
  ['partielle', 'Partiellement réalisée', 'ec-res-mid'],
  ['non_realisee', 'Non réalisée', 'ec-res-no'],
];
const DECISIONS = [
  ['continuer', 'Continuer', 'On garde cette action telle quelle'],
  ['ajuster', 'Ajuster', 'On la garde, mais on la modifie'],
  ['changer', 'Changer', 'On passe à autre chose'],
];
const BILAN = [
  ['reussites', 'Ce qui a bien fonctionné', 'Même une petite chose'],
  ['difficultes', 'Les difficultés rencontrées', 'Sans jugement : on cherche à comprendre'],
  ['observations', 'Autre chose d\'important', 'Événement, changement de rythme…'],
];

let rdv = null;          // { boost, numero, seance } du rendez-vous ouvert
let rdvMessage = '';
let rdvManques = [];

const libelle = (liste, cle) => { const t = liste.find((x) => x[0] === cle); return t ? t[1] : ''; };

function rendreRendezVous(b) {
  const zone = $('#ecRdv'); if (!zone) return;
  const etape = b.etapeCourante;

  // Parcours terminé, ou Étape dont le rendez-vous n'est pas encore construit :
  // on l'annonce, sans rien simuler.
  if (!etape || etape > 11) {
    zone.innerHTML = '<div class="ec-rdv">' +
      (etape
        ? '<p class="ec-rdv-t">Rendez-vous — Étape ' + etape + '/' + b.etapesTotal + '</p>' +
          '<p class="ec-rdv-p">Prochaine étape : S' + etape + '. Son contenu sera construit dans le prochain lot.</p>'
        : '<p class="ec-rdv-t">Les 12 Étapes du Boost sont terminées.</p>') +
      '</div>';
    if (b.etapesValidees >= 1) chargerHistorique(b);
    return;
  }
  chargerRdv(b, etape);
}

async function chargerRdv(b, numero) {
  const zone = $('#ecRdv');
  zone.innerHTML = '<div class="ec-rdv"><p class="ec-rdv-p">Ouverture du rendez-vous…</p></div>';
  const r = await apiCoach('/api/boost/coach/dossiers/' + b.id + '/seances/' + numero);
  if (r.status === 403) { await demarrer(); return; }
  if (!r.data.ok) { zone.innerHTML = '<div class="ec-rdv"><p class="ec-rdv-p">Rendez-vous indisponible.</p></div>'; return; }
  rdv = { boost: b, numero: Number(numero), seance: r.data.seance };
  rdvMessage = ''; rdvManques = [];
  rendreRdv();
}

// Après validation : l'historique des rendez-vous, en lecture seule.
async function chargerHistorique(b) {
  const dernier = Math.min(b.etapesValidees, 11);
  if (dernier < 1) return;
  const r = await apiCoach('/api/boost/coach/dossiers/' + b.id + '/seances/' + dernier);
  if (!r.data.ok) return;
  $('#ecRdv').insertAdjacentHTML('beforeend', vueHistorique(r.data.seance));
  const b2 = $('#ecHistoB');
  if (b2) b2.addEventListener('click', () => {
    const box = $('#ecHisto');
    const ouvert = box.hidden;
    box.hidden = !ouvert;
    b2.setAttribute('aria-expanded', String(ouvert));
    b2.textContent = ouvert ? 'Masquer les rendez-vous précédents' : 'Voir les rendez-vous précédents';
  });
}

// ---- Historique : une ligne par rendez-vous validé -------------------------

function vueHistorique(seance) {
  const lignes = seance.historique || [];
  if (!lignes.length) return '';
  const rendu = lignes.slice().reverse().map((h) => {
    const faits = [];
    if (h.objectif) {
      faits.push(['Objectif', [libelle(OBJECTIFS, h.objectif.choix), h.objectif.texte].filter(Boolean).join(' — ')]);
    }
    if (h.actionSuivie) {
      faits.push(['Action suivie', h.actionSuivie +
        (h.resultat ? ' — ' + libelle(RESULTATS, h.resultat) : '')]);
    }
    if (h.commentaireResultat) faits.push(['Ce qui s\'est passé', h.commentaireResultat]);
    if (h.decision) faits.push(['Décision', libelle(DECISIONS, h.decision)]);
    if (h.actionDecidee) {
      faits.push(['Action décidée', h.actionDecidee +
        (h.adhesion ? ' — adhésion ' + h.adhesion + '/10' : '')]);
    }
    return '<div class="ec-histo-l"><b>Étape ' + h.numero + '/12 <span>· ' + echapper(dateFr(h.valideeLe)) + '</span></b>' +
      faits.map(([t, v]) => '<p><i>' + echapper(t) + '</i>' + echapper(v) + '</p>').join('') + '</div>';
  }).join('');
  return '<div class="ec-histo"><button type="button" class="ec-anciens-b" id="ecHistoB" aria-expanded="false">' +
    'Voir les rendez-vous précédents</button><div id="ecHisto" class="ec-histo-box" hidden>' + rendu + '</div></div>';
}

// ---- Rendu : aiguillage par protocole -------------------------------------

function rendreRdv() {
  // Le protocole vient du SERVEUR, pas du numéro d'Étape recalculé ici : c'est
  // lui qui décide ce qu'un rendez-vous contient, l'écran ne fait que le suivre.
  const form = rdv.seance.protocole === 'suivi' ? formSuivi() : formDecouverte();
  $('#ecRdv').innerHTML = form + vueHistorique(rdv.seance);
  cablerRdv();
}

function piedRdv(libelleValider, note) {
  return '<div class="ec-rdv-fin">' +
    (rdvManques.length ? '<div class="ec-rdv-manque"><b>Il manque encore :</b><ul>' +
      rdvManques.map((m) => '<li>' + echapper(m) + '</li>').join('') + '</ul></div>' : '') +
    (rdvMessage ? '<p class="ec-rdv-msg">' + echapper(rdvMessage) + '</p>' : '') +
    '<div class="ec-rdv-btns">' +
      '<button type="button" class="ec-btn" id="rdvBrouillon">Enregistrer le brouillon</button>' +
      '<button type="button" class="ec-btn ec-btn-p ec-rdv-valider" id="rdvValider">' + echapper(libelleValider) + '</button>' +
    '</div>' +
    '<p class="ec-rdv-note">' + echapper(note) + '</p>' +
  '</div>';
}

function blocNotes() {
  return bloc('Notes Coach Nutrition', 'Notes internes. Le client n\'y a pas accès.',
    champTexte('rdvNote', 'Ce que tu veux retenir pour la suite', rdv.seance.noteCoach, 4));
}

function blocAction(titre, aide, act, placeholder) {
  return '<section class="ec-rdv-bloc ec-rdv-action">' +
    '<h3 class="ec-rdv-h">' + echapper(titre) + '</h3>' +
    '<p class="ec-rdv-aide">' + echapper(aide) + '</p>' +
    '<input type="text" id="actIntitule" class="ec-rdv-gros" value="' + echapper(act.intitule || '') + '" ' +
      'placeholder="' + echapper(placeholder) + '">' +
    '<div class="ec-rdv-duo">' +
      '<input type="text" id="actDetail" value="' + echapper(act.detail || '') + '" placeholder="Précision (facultatif)">' +
      '<input type="text" id="actFreq" list="rdvfreqs" value="' + echapper(act.frequence || '') + '" placeholder="Fréquence (facultatif)">' +
      '<datalist id="rdvfreqs">' + FREQUENCES.map((f) => '<option value="' + echapper(f) + '">').join('') + '</datalist>' +
    '</div></section>';
}

// ---- S1 : le rendez-vous de découverte ------------------------------------

function formDecouverte() {
  const d = rdv.seance.donnees || {};
  const obj = d.objectif || {};
  const hab = d.habitudes || {};
  const dif = d.difficultes || {};
  const act = d.actionBrouillon || rdv.seance.action || {};
  const coche = (v) => (v ? ' checked' : '');

  return '<form id="ecS1" class="ec-rdv-form" autocomplete="off">' +
    '<h2 class="ec-rdv-t2">Rendez-vous S1 <span>environ 40 minutes</span></h2>' +

    bloc('Ton objectif', 'Ce que ton client vient chercher, avec ses mots.',
      '<div class="ec-chips">' + OBJECTIFS.map(([k, t]) =>
        '<label class="ec-chip"><input type="radio" name="s1obj" value="' + k + '"' + (obj.choix === k ? ' checked' : '') + '>' +
        '<span>' + echapper(t) + '</span></label>').join('') + '</div>' +
      champTexte('s1objTexte', 'Précise avec les mots du client', obj.texte, 3)) +

    bloc('Comment tu manges aujourd\'hui ?', 'Une photographie simple du point de départ. Note ce qui est utile, laisse le reste vide.',
      '<div class="ec-hab">' + HABITUDES.map(([k, t, aide]) =>
        '<label class="ec-hab-l"><span>' + echapper(t) + '</span>' +
        '<input type="text" data-hab="' + k + '" value="' + echapper(hab[k] || '') + '" placeholder="' + echapper(aide) + '"></label>').join('') + '</div>') +

    bloc('Ce qui te pose le plus de difficultés', 'Plusieurs choix possibles. Ce ne sont pas des diagnostics.',
      '<div class="ec-chips">' + DIFFICULTES.map(([k, t]) =>
        '<label class="ec-chip"><input type="checkbox" data-dif="' + k + '"' + coche((dif.choix || []).includes(k)) + '>' +
        '<span>' + echapper(t) + '</span></label>').join('') + '</div>' +
      champTexte('s1difTexte', 'Précision', dif.precision, 2)) +

    blocAction('Ton action de la semaine',
      'Une seule action, concrète, choisie AVEC le client. C\'est ce qu\'il emporte en sortant.',
      act, 'Ex. : ajouter une source de protéines au petit-déjeuner') +

    bloc('Journal photo', '',
      '<p class="ec-rdv-peda">Entre vos rendez-vous, ton client photographie ses repas. Ce n\'est ni un contrôle ni un jugement : ' +
      'c\'est ce qui te permet de voir son alimentation réelle, et pas celle dont on se souvient. ' +
      'Explique-lui qu\'une photo prise au moment du repas vaut mieux qu\'un carnet rempli le soir.</p>' +
      '<label class="ec-check"><input type="checkbox" id="s1Photo"' + coche(d.journalPhotoExplique) + '>' +
      '<span>J\'ai expliqué le journal photo au client</span></label>') +

    blocNotes() +
    piedRdv('Valider le rendez-vous S1',
      'La validation démarre officiellement le Boost : l\'Étape 1 est validée et les 16 semaines commencent aujourd\'hui.') +
    '</form>';
}

// ---- S2 à S11 : le rendez-vous de suivi -----------------------------------

function formSuivi() {
  const d = rdv.seance.donnees || {};
  const prec = d.actionPrecedente || {};
  const bil = d.bilan || {};
  const act = d.actionBrouillon || {};
  const precedente = rdv.seance.action;   // l'action décidée à l'Étape d'avant
  const n = rdv.numero;

  // Ce qui a été dit la fois d'avant, remonté sans que le coach ait à le chercher.
  const ctx = rdv.seance.precedent;
  const rappel = ctx ? [
    ctx.objectif && (ctx.objectif.texte || ctx.objectif.choix)
      ? ['Objectif', [libelle(OBJECTIFS, ctx.objectif.choix), ctx.objectif.texte].filter(Boolean).join(' — ')] : null,
    ctx.difficultes && (ctx.difficultes.choix || []).length
      ? ['Difficultés annoncées', ctx.difficultes.choix.map((c) => libelle(DIFFICULTES, c)).filter(Boolean).join(', ')] : null,
    ctx.bilan && ctx.bilan.difficultes ? ['Difficultés du dernier point', ctx.bilan.difficultes] : null,
  ].filter(Boolean) : [];

  return '<form id="ecSuivi" class="ec-rdv-form" autocomplete="off">' +
    '<h2 class="ec-rdv-t2">Rendez-vous — Étape ' + n + '/12' +
      (ctx ? ' <span>dernier point le ' + echapper(dateFr(ctx.valideeLe)) + '</span>' : '') + '</h2>' +

    // 1. L'action précédente, très visible : c'est le point de départ du RDV.
    '<section class="ec-rdv-bloc ec-rdv-prec">' +
      '<h3 class="ec-rdv-h">Ton action depuis le dernier rendez-vous</h3>' +
      (precedente
        ? '<p class="ec-prec-txt">' + echapper(precedente.intitule) +
          (precedente.frequence ? ' <span>(' + echapper(precedente.frequence) + ')</span>' : '') + '</p>' +
          (precedente.detail ? '<p class="ec-prec-det">' + echapper(precedente.detail) + '</p>' : '') +
          (precedente.adhesion ? '<p class="ec-prec-det">Adhésion annoncée : ' + precedente.adhesion + '/10</p>' : '')
        : '<p class="ec-prec-txt ec-prec-vide">Aucune action active trouvée pour la période écoulée.</p>') +
      '<p class="ec-rdv-aide">Un simple constat, pour adapter la suite. Ce n\'est ni une note ni un reproche.</p>' +
      '<div class="ec-chips">' + RESULTATS.map(([k, t, cls]) =>
        '<label class="ec-chip ' + cls + '"><input type="radio" name="svRes" value="' + k + '"' +
        (prec.resultat === k ? ' checked' : '') + '><span>' + echapper(t) + '</span></label>').join('') + '</div>' +
      champTexte('svResCom', 'Ce qui s\'est passé, en une phrase', prec.commentaire, 2) +
    '</section>' +

    // 2. Le bilan de la période.
    bloc('Comment ça s\'est passé ?', 'Note ce qui est utile, laisse le reste vide.',
      BILAN.map(([k, t, aide]) =>
        '<label class="ec-hab-l ec-bilan-l"><span>' + echapper(t) + '</span>' +
        '<input type="text" data-bilan="' + k + '" value="' + echapper(bil[k] || '') + '" placeholder="' + echapper(aide) + '"></label>').join('')) +

    // 3. La décision sur cette action.
    bloc('Que fait-on de cette action ?', 'La décision se prend avec le client.',
      '<div class="ec-chips ec-chips-dec">' + DECISIONS.map(([k, t, aide]) =>
        '<label class="ec-chip ec-chip-dec"><input type="radio" name="svDec" value="' + k + '"' +
        (d.decision === k ? ' checked' : '') + '><span><b>' + echapper(t) + '</b><i>' + echapper(aide) + '</i></span></label>').join('') + '</div>') +

    // 4. La nouvelle action : la zone mise en avant.
    blocAction('Ton action jusqu\'au prochain rendez-vous',
      'Une seule action, concrète et mesurable, co-construite avec le client.',
      act, 'Ex. : préparer mon déjeuner la veille 3 fois cette semaine') +

    // 5. L'adhésion : un repère pour le coach, pas un score.
    bloc('À quel point tu te sens capable de réaliser cette action ?',
      'La note du client, de 1 à 10. Si elle est basse, revois l\'action avec lui avant de valider — elle ne bloque rien.',
      '<div class="ec-notes">' + Array.from({ length: 10 }, (_, i) => i + 1).map((v) =>
        '<label class="ec-note"><input type="radio" name="svAdh" value="' + v + '"' +
        (Number(d.adhesion) === v ? ' checked' : '') + '><span>' + v + '</span></label>').join('') + '</div>') +

    blocNotes() +
    (rappel.length ? '<div class="ec-rappel"><b>Rappel du rendez-vous précédent</b>' +
      rappel.map(([t, v]) => '<p><i>' + echapper(t) + '</i>' + echapper(v) + '</p>').join('') + '</div>' : '') +
    piedRdv('Valider le rendez-vous',
      'La validation enregistre le résultat de l\'action précédente, crée la nouvelle et fait passer à l\'Étape ' + (n + 1) + '.') +
    '</form>';
}

function bloc(titre, aide, contenu) {
  return '<section class="ec-rdv-bloc"><h3 class="ec-rdv-h">' + echapper(titre) + '</h3>' +
    (aide ? '<p class="ec-rdv-aide">' + echapper(aide) + '</p>' : '') + contenu + '</section>';
}
function champTexte(id, placeholder, valeur, lignes) {
  return '<textarea id="' + id + '" rows="' + lignes + '" placeholder="' + echapper(placeholder) + '">' + echapper(valeur || '') + '</textarea>';
}

function cablerRdv() {
  $('#rdvBrouillon').addEventListener('click', () => envoyerRdv(false));
  $('#rdvValider').addEventListener('click', () => envoyerRdv(true));
  const histo = $('#ecHistoB');
  if (histo) histo.addEventListener('click', () => {
    const box = $('#ecHisto');
    const ouvert = box.hidden;
    box.hidden = !ouvert;
    histo.setAttribute('aria-expanded', String(ouvert));
    histo.textContent = ouvert ? 'Masquer les rendez-vous précédents' : 'Voir les rendez-vous précédents';
  });
  // « Continuer » reprend l'action précédente telle quelle : c'est ce que le
  // coach vient de décider, lui refaire taper le même texte serait absurde.
  document.querySelectorAll('input[name="svDec"]').forEach((r) => r.addEventListener('change', () => {
    const champ = $('#actIntitule');
    if (r.value !== 'continuer' || !champ || champ.value.trim()) return;
    const p = rdv.seance.action;
    if (!p) return;
    champ.value = p.intitule;
    const det = $('#actDetail'); if (det && !det.value) det.value = p.detail || '';
    const fr = $('#actFreq'); if (fr && !fr.value) fr.value = p.frequence || '';
  }));
}

// ---- Lecture du formulaire ------------------------------------------------

function lireRdv() {
  const val = (id) => { const e = $('#' + id); return e ? e.value : ''; };
  const coche = (nom) => { const e = document.querySelector('input[name="' + nom + '"]:checked'); return e ? e.value : ''; };
  const action = { intitule: val('actIntitule'), detail: val('actDetail'), frequence: val('actFreq') };
  const noteCoach = val('rdvNote');

  if (rdv.seance.protocole === 'suivi') {
    const bilan = {};
    document.querySelectorAll('[data-bilan]').forEach((i) => { bilan[i.dataset.bilan] = i.value; });
    const adh = coche('svAdh');
    return {
      donnees: {
        actionPrecedente: { resultat: coche('svRes'), commentaire: val('svResCom') },
        bilan,
        decision: coche('svDec'),
        adhesion: adh ? Number(adh) : null,
      },
      action, noteCoach,
    };
  }

  const hab = {};
  document.querySelectorAll('[data-hab]').forEach((i) => { hab[i.dataset.hab] = i.value; });
  const choix = [...document.querySelectorAll('[data-dif]')].filter((i) => i.checked).map((i) => i.dataset.dif);
  return {
    donnees: {
      objectif: { choix: coche('s1obj'), texte: val('s1objTexte') },
      habitudes: hab,
      difficultes: { choix, precision: val('s1difTexte') },
      journalPhotoExplique: !!($('#s1Photo') && $('#s1Photo').checked),
    },
    action, noteCoach,
  };
}

async function envoyerRdv(valider) {
  const corps = lireRdv();
  const route = '/api/boost/coach/dossiers/' + rdv.boost.id + '/seances/' + rdv.numero + (valider ? '/valider' : '');
  const res = await fetch(route, {
    method: valider ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token },
    body: JSON.stringify(corps),
  });
  let d = null;
  try { d = await res.json(); } catch (_) { /* réponse non JSON */ }
  d = d || {};

  if (res.status === 403) { await demarrer(); return; }
  if (!d.ok) {
    // ⚠️ On re-rend à partir de CE QUE LE COACH VIENT DE SAISIR, et surtout pas
    // du dernier brouillon enregistré : un refus de validation ne doit jamais
    // lui faire perdre sa frappe, en plein rendez-vous.
    rdv.seance = {
      ...rdv.seance,
      donnees: { ...corps.donnees, actionBrouillon: corps.action },
      noteCoach: corps.noteCoach,
    };
    // Le serveur dit CE QUI MANQUE : on le montre tel quel, pour que le coach
    // n'ait pas à chercher devant son client.
    rdvManques = d.manque || [];
    rdvMessage = rdvManques.length ? '' : (d.error || 'Enregistrement impossible.');
    rendreRdv();
    $('#ecRdv').scrollIntoView({ block: 'end' });
    return;
  }

  if (valider) {
    // Le Boost a changé d'Étape : on relit la fiche entière plutôt que de
    // rafistoler l'écran, pour que tout vienne du serveur.
    await chargerClients();
    await ouvrirFiche(rdv.boost.id);
    return;
  }
  rdv.seance = d.seance;
  rdvManques = [];
  rdvMessage = 'Brouillon enregistré. Tu peux fermer et revenir plus tard.';
  rendreRdv();
}

async function basculerHistorique(id) {
  const box = $('#ecHist');
  const btn = $('#ecHistB');
  if (!box.hidden) { box.hidden = true; btn.textContent = 'Voir le journal du dossier'; return; }
  btn.textContent = 'Masquer le journal du dossier';
  box.hidden = false;
  box.innerHTML = '<p class="ec-cli-info">Chargement…</p>';
  const r = await apiCoach('/api/boost/coach/dossiers/' + id + '/journal');
  if (!r.data.ok) { box.innerHTML = '<p class="ec-cli-info">Historique indisponible.</p>'; return; }
  const lignes = r.data.journal || [];
  if (!lignes.length) { box.innerHTML = '<p class="ec-cli-info">Aucun événement.</p>'; return; }
  box.innerHTML = '<ol>' + lignes.map((l) => {
    const d = l.detail || {};
    let quoi = JOURNAL[l.action] || l.action;
    if (l.action === 'etape_validee' && d.numero) quoi = 'Étape ' + d.numero + '/12 validée';
    if (l.action === 'prolongation' && d.jours) quoi = 'Prolongé de ' + d.jours + ' jours (jusqu\'au ' + dateFr(d.echeanceApres) + ')';
    const par = l.auteur ? ' par ' + echapper(l.auteur) : '';
    const motif = d.motif ? '<br><small>« ' + echapper(d.motif) + ' »</small>' : '';
    return '<li>' + echapper(quoi) + '<br><small>' + echapper(dateHeureFr(l.creeLe)) + par + '</small>' + motif + '</li>';
  }).join('') + '</ol>';
}

// --- Connexion --------------------------------------------------------------

async function connecter(e) {
  e.preventDefault();
  const email = ($('#ecEmail').value || '').trim().toLowerCase();
  const pin = $('#ecPin').value || '';
  const err = $('#ecErr');
  err.textContent = '';
  $('#ecGo').disabled = true;
  try {
    const res = await fetch('/account/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pin }),
    });
    const d = await res.json();
    if (!d.ok || !d.token) {
      // On affiche le message du serveur : « code incorrect », temporisation…
      err.textContent = d.error || 'Connexion impossible.';
      return;
    }
    session = { email, token: d.token };
    try { localStorage.setItem(CLE, JSON.stringify(session)); } catch (_) { /* stockage indisponible */ }
    $('#ecPin').value = '';
    await demarrer();
  } catch (_) {
    err.textContent = 'Connexion impossible pour le moment.';
  } finally {
    $('#ecGo').disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('#ecForm').addEventListener('submit', connecter);
  $('#ecOut').addEventListener('click', async () => {
    if (session) { try { await fetch('/account/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + session.token } }); } catch (_) {} }
    deconnecter();
  });
  $('#ecAnciensB').addEventListener('click', () => {
    const box = $('#ecAnciens');
    const ouvert = box.hidden;
    box.hidden = !ouvert;
    $('#ecAnciensB').setAttribute('aria-expanded', String(ouvert));
  });
  demarrer();
});
