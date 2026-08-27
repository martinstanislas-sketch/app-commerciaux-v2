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
