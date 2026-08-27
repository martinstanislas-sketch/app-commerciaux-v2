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
    '<button type="button" class="ec-btn ec-hist-b" id="ecHistB" data-id="' + b.id + '">Voir l\'historique</button>' +
    '<div class="ec-hist" id="ecHist" hidden></div>';

  $('#ecBack').addEventListener('click', () => { afficher('#ecListe'); window.scrollTo(0, 0); });
  $('#ecHistB').addEventListener('click', () => basculerHistorique(b.id));
  afficher('#ecFiche');
  window.scrollTo(0, 0);
  rendreRendezVous(b);
}

// ============================================================================
//  S1 — PREMIER RENDEZ-VOUS
//
//  Un seul écran, dans l'ordre du rendez-vous : objectif, habitudes,
//  difficultés, ACTION, journal photo, notes, validation. Pas quinze
//  formulaires indépendants : le coach parle avec son client et note au fil de
//  l'eau, il ne remplit pas un dossier administratif.
//
//  L'action de la semaine est la seule zone mise en avant, parce que c'est la
//  seule chose que le client emportera en sortant.
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

let s1 = null;          // { boost, seance } du rendez-vous ouvert
let s1Message = '';
let s1Manques = [];

function rendreRendezVous(b) {
  const zone = $('#ecRdv'); if (!zone) return;
  const etape = b.etapeCourante;

  // Étape 1 déjà validée : on l'annonce, et on dit ce qui vient.
  if (!etape || etape > 1) {
    zone.innerHTML = '<div class="ec-rdv">' +
      '<p class="ec-rdv-t">' + (b.etapesValidees >= 1 ? 'Étape 1 terminée' : 'Rendez-vous — Étape ' + etape + '/' + b.etapesTotal) + '</p>' +
      (etape ? '<p class="ec-rdv-p">Prochaine étape : S' + etape + '. Son contenu sera construit dans le prochain lot.</p>'
        : '<p class="ec-rdv-p">Les 12 Étapes du Boost sont terminées.</p>') +
      '</div>';
    if (b.etapesValidees >= 1) chargerS1Lecture(b);
    return;
  }
  chargerS1(b);
}

async function chargerS1(b) {
  const zone = $('#ecRdv');
  zone.innerHTML = '<div class="ec-rdv"><p class="ec-rdv-p">Ouverture du rendez-vous…</p></div>';
  const r = await apiCoach('/api/boost/coach/dossiers/' + b.id + '/seances/1');
  if (r.status === 403) { await demarrer(); return; }
  if (!r.data.ok) { zone.innerHTML = '<div class="ec-rdv"><p class="ec-rdv-p">Rendez-vous indisponible.</p></div>'; return; }
  s1 = { boost: b, seance: r.data.seance };
  s1Message = ''; s1Manques = [];
  rendreS1();
}

// Après validation : le contenu reste consultable, en lecture seule.
async function chargerS1Lecture(b) {
  const r = await apiCoach('/api/boost/coach/dossiers/' + b.id + '/seances/1');
  if (!r.data.ok || !r.data.seance.existe) return;
  const s = r.data.seance;
  const d = s.donnees || {};
  const lignes = [];
  const obj = d.objectif || {};
  if (obj.choix || obj.texte) {
    lignes.push(['Objectif', [libelle(OBJECTIFS, obj.choix), obj.texte].filter(Boolean).join(' — ')]);
  }
  HABITUDES.forEach(([k, t]) => { if (d.habitudes && d.habitudes[k]) lignes.push([t, d.habitudes[k]]); });
  const dif = d.difficultes || {};
  const difTxt = [(dif.choix || []).map((c) => libelle(DIFFICULTES, c)).filter(Boolean).join(', '), dif.precision].filter(Boolean).join(' — ');
  if (difTxt) lignes.push(['Difficultés', difTxt]);
  if (s.action) lignes.push(['Action de la semaine', s.action.intitule + (s.action.frequence ? ' (' + s.action.frequence + ')' : '')]);
  if (s.noteCoach) lignes.push(['Notes Coach Nutrition', s.noteCoach]);

  $('#ecRdv').insertAdjacentHTML('beforeend',
    '<div class="ec-s1-lu"><h2 class="ec-s1-lu-t">Rendez-vous S1 du ' + echapper(dateFr(s.valideeLe)) + '</h2>' +
    lignes.map(([t, v]) => '<div class="ec-s1-lu-l"><i>' + echapper(t) + '</i><p>' + echapper(v) + '</p></div>').join('') +
    '</div>');
}

const libelle = (liste, cle) => { const t = liste.find((x) => x[0] === cle); return t ? t[1] : ''; };

function rendreS1() {
  const d = s1.seance.donnees || {};
  const obj = d.objectif || {};
  const hab = d.habitudes || {};
  const dif = d.difficultes || {};
  // L'action en discussion vit dans le brouillon tant qu'elle n'est pas validée.
  const act = d.actionBrouillon || s1.seance.action || {};
  const coche = (v) => (v ? ' checked' : '');

  $('#ecRdv').innerHTML =
    '<form id="ecS1" class="ec-s1" autocomplete="off">' +
    '<h2 class="ec-s1-t">Rendez-vous S1 <span>environ 40 minutes</span></h2>' +

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

    // LA zone mise en avant : c'est la seule chose que le client emporte.
    '<section class="ec-s1-bloc ec-s1-action">' +
      '<h3 class="ec-s1-h">Ton action de la semaine</h3>' +
      '<p class="ec-s1-aide">Une seule action, concrète, choisie AVEC le client. C\'est ce qu\'il emporte en sortant.</p>' +
      '<input type="text" id="s1ActIntitule" class="ec-s1-gros" value="' + echapper(act.intitule || '') + '" ' +
        'placeholder="Ex. : ajouter une source de protéines au petit-déjeuner">' +
      '<div class="ec-s1-duo">' +
        '<input type="text" id="s1ActDetail" value="' + echapper(act.detail || '') + '" placeholder="Précision (facultatif)">' +
        '<input type="text" id="s1ActFreq" list="s1freqs" value="' + echapper(act.frequence || '') + '" placeholder="Fréquence (facultatif)">' +
        '<datalist id="s1freqs">' + FREQUENCES.map((f) => '<option value="' + echapper(f) + '">').join('') + '</datalist>' +
      '</div>' +
    '</section>' +

    bloc('Journal photo', '',
      '<p class="ec-s1-péda">Entre vos rendez-vous, ton client photographie ses repas. Ce n\'est ni un contrôle ni un jugement : ' +
      'c\'est ce qui te permet de voir son alimentation réelle, et pas celle dont on se souvient. ' +
      'Explique-lui qu\'une photo prise au moment du repas vaut mieux qu\'un carnet rempli le soir.</p>' +
      '<label class="ec-check"><input type="checkbox" id="s1Photo"' + coche(d.journalPhotoExplique) + '>' +
      '<span>J\'ai expliqué le journal photo au client</span></label>') +

    bloc('Notes Coach Nutrition', 'Notes internes. Le client n\'y a pas accès.',
      champTexte('s1Note', 'Ce que tu veux retenir pour la suite', s1.seance.noteCoach, 4)) +

    '<div class="ec-s1-fin">' +
      (s1Manques.length ? '<div class="ec-s1-manque"><b>Il manque encore :</b><ul>' +
        s1Manques.map((m) => '<li>' + echapper(m) + '</li>').join('') + '</ul></div>' : '') +
      (s1Message ? '<p class="ec-s1-msg">' + echapper(s1Message) + '</p>' : '') +
      '<div class="ec-s1-btns">' +
        '<button type="button" class="ec-btn" id="s1Brouillon">Enregistrer le brouillon</button>' +
        '<button type="button" class="ec-btn ec-btn-p ec-s1-valider" id="s1Valider">Valider le rendez-vous S1</button>' +
      '</div>' +
      '<p class="ec-s1-note">La validation démarre officiellement le Boost : l\'Étape 1 est validée et les 16 semaines commencent aujourd\'hui.</p>' +
    '</div></form>';

  $('#s1Brouillon').addEventListener('click', () => envoyerS1(false));
  $('#s1Valider').addEventListener('click', () => envoyerS1(true));
}

function bloc(titre, aide, contenu) {
  return '<section class="ec-s1-bloc"><h3 class="ec-s1-h">' + echapper(titre) + '</h3>' +
    (aide ? '<p class="ec-s1-aide">' + echapper(aide) + '</p>' : '') + contenu + '</section>';
}
function champTexte(id, placeholder, valeur, lignes) {
  return '<textarea id="' + id + '" rows="' + lignes + '" placeholder="' + echapper(placeholder) + '">' + echapper(valeur || '') + '</textarea>';
}

// Lecture du formulaire. Une seule fonction : le brouillon et la validation
// envoient exactement la même chose, seule la route change.
function lireS1() {
  const radio = document.querySelector('input[name="s1obj"]:checked');
  const hab = {};
  document.querySelectorAll('[data-hab]').forEach((i) => { hab[i.dataset.hab] = i.value; });
  const choix = [...document.querySelectorAll('[data-dif]')].filter((i) => i.checked).map((i) => i.dataset.dif);
  const val = (id) => { const e = $('#' + id); return e ? e.value : ''; };
  return {
    donnees: {
      objectif: { choix: radio ? radio.value : '', texte: val('s1objTexte') },
      habitudes: hab,
      difficultes: { choix, precision: val('s1difTexte') },
      journalPhotoExplique: !!($('#s1Photo') && $('#s1Photo').checked),
    },
    action: { intitule: val('s1ActIntitule'), detail: val('s1ActDetail'), frequence: val('s1ActFreq') },
    noteCoach: val('s1Note'),
  };
}

async function envoyerS1(valider) {
  const corps = lireS1();
  const route = '/api/boost/coach/dossiers/' + s1.boost.id + '/seances/1' + (valider ? '/valider' : '');
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
    // lui faire perdre sa frappe. Repartir de `s1.seance` effaçait tout ce qui
    // avait été tapé depuis la dernière sauvegarde — en plein rendez-vous.
    s1.seance = {
      ...s1.seance,
      donnees: { ...corps.donnees, actionBrouillon: corps.action },
      noteCoach: corps.noteCoach,
    };
    // Le serveur dit CE QUI MANQUE : on le montre tel quel, pour que le coach
    // n'ait pas à chercher, en rendez-vous, devant son client.
    s1Manques = d.manque || [];
    s1Message = s1Manques.length ? '' : (d.error || 'Enregistrement impossible.');
    rendreS1();
    $('#ecRdv').scrollIntoView({ block: 'end' });
    return;
  }

  if (valider) {
    // Le Boost a changé d'état : on relit la fiche entière plutôt que de
    // rafistoler l'écran, pour que dates et statut viennent tous du serveur.
    await chargerClients();
    await ouvrirFiche(s1.boost.id);
    return;
  }
  s1.seance = d.seance;
  s1Manques = [];
  s1Message = 'Brouillon enregistré. Tu peux fermer et revenir plus tard.';
  rendreS1();
}

async function basculerHistorique(id) {
  const box = $('#ecHist');
  const btn = $('#ecHistB');
  if (!box.hidden) { box.hidden = true; btn.textContent = 'Voir l\'historique'; return; }
  btn.textContent = 'Masquer l\'historique';
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
