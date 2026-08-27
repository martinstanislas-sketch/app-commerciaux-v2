'use strict';
// ============================================================================
//  ESPACE COACH NUTRITION — LES RENDEZ-VOUS.
//
//  Extrait de public/coach.js sans changer une ligne de comportement, pour la
//  même raison que côté serveur : le fichier mélangeait deux choses de nature
//  différente.
//
//   - public/coach.js    : la COQUILLE de l'espace — connexion, « qui suis-je »,
//     liste des clients, fiche. Elle bouge peu.
//   - ce fichier         : le CONTENU des rendez-vous. La partie qui grossit à
//     chaque lot (S1, puis S2-S11, puis S12).
//
//  ⚠️ LES DEUX FICHIERS PARTAGENT LA MÊME PORTÉE GLOBALE. Ce sont deux scripts
//  classiques (pas des modules) chargés l'un après l'autre par coach.html, dans
//  cet ordre : coach.js puis coachRdv.js. Rien à importer ni à exporter, mais
//  deux conséquences à connaître :
//
//   1. les noms sont communs — ne jamais redéclarer ici un nom de coach.js, le
//      navigateur refuserait la page entière ;
//   2. ce fichier emprunte à la coquille : $, echapper, dateFr, apiCoach,
//      session, demarrer, chargerClients, ouvrirFiche. Et la coquille appelle
//      ici une seule fonction : rendreRendezVous(), depuis rendreFiche().
//      C'est toute la surface de contact entre les deux.
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
  // Plus d'Étape à venir : le Boost est allé au bout, on montre la conclusion
  // et le plan que le client emporte.
  if (!etape) { chargerConclusion(b); return; }
  chargerRdv(b, etape);
}

// ---- Après le Boost : la conclusion et le plan d'autonomie ---------------

async function chargerConclusion(b) {
  const zone = $('#ecRdv');
  zone.innerHTML = '<div class="ec-rdv"><p class="ec-rdv-p">Chargement…</p></div>';
  const r = await apiCoach('/api/boost/coach/dossiers/' + b.id + '/seances/12');
  const seance = (r.data && r.data.seance) || null;
  const regles = (seance && seance.donnees && seance.donnees.regles) || [];

  zone.innerHTML =
    '<div class="ec-fin">' +
      '<p class="ec-fin-t">Boost Nutrition terminé</p>' +
      (seance && seance.valideeLe ? '<p class="ec-fin-d">Bilan du ' + echapper(dateFr(seance.valideeLe)) + '</p>' : '') +
    '</div>' +
    (regles.length ? '<section class="ec-rdv-bloc ec-plan">' +
      '<h3 class="ec-rdv-h">Ton plan pour la suite</h3>' +
      '<p class="ec-rdv-aide">Ce qui fonctionne pour toi, et que tu continues à appliquer.</p>' +
      '<ol class="ec-plan-l">' + regles.map((x) => '<li>' + echapper(x) + '</li>').join('') + '</ol>' +
      '</section>' : '') +
    ((seance && seance.donnees && seance.donnees.fragiles)
      ? '<section class="ec-rdv-bloc"><h3 class="ec-rdv-h">Points de vigilance</h3>' +
        '<p class="ec-fin-p">' + echapper(seance.donnees.fragiles) + '</p></section>' : '') +
    '<p class="ec-fin-suite">' + nomAffiche({ clientPrenom: b.clientPrenom, clientEmail: b.clientEmail }) +
      ' repart dans son accompagnement nutrition standard My Coach.</p>' +
    (seance ? vueHistorique(seance) : '');
  cablerHistorique();
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

function cablerHistorique() {
  const b2 = $('#ecHistoB');
  if (!b2) return;
  b2.addEventListener('click', () => {
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
    // Le bilan n'a pas décidé d'action mais des règles : sans elles, sa ligne
    // d'historique serait presque vide.
    if (h.regles) faits.push(['Règles conservées', h.regles.join(' · ')]);
    if (h.confiance) faits.push(['Confiance pour continuer seul', h.confiance + '/10']);
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
  const form = rdv.seance.protocole === 'suivi' ? formSuivi()
    : rdv.seance.protocole === 'bilan' ? formBilan()
      : formDecouverte();
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

// ---- S12 : le bilan final -------------------------------------------------

function formBilan() {
  const d = rdv.seance.donnees || {};
  const bil = d.bilan || {};
  const regles = (d.regles || []).concat(['', '', '']).slice(0, 3);
  const dep = rdv.seance.depart;
  const synth = rdv.seance.synthese || [];
  const prec = d.actionPrecedente || {};
  const precedente = rdv.seance.action;   // l'action décidée à S11

  // Le point de départ, tel que S1 l'a enregistré. Rien à ressaisir.
  const rappelHab = dep && dep.habitudes
    ? HABITUDES.map(([k, t]) => (dep.habitudes[k] ? '<p><i>' + echapper(t) + '</i>' + echapper(dep.habitudes[k]) + '</p>' : '')).join('')
    : '';
  const rappel = dep ? '<section class="ec-rdv-bloc ec-depart">' +
    '<h3 class="ec-rdv-h">D\'où tu es parti</h3>' +
    '<p class="ec-rdv-aide">Le point de départ, tel qu\'il a été noté le ' + echapper(dateFr(dep.valideeLe)) + '.</p>' +
    (dep.objectif && (dep.objectif.choix || dep.objectif.texte)
      ? '<p><i>Objectif initial</i>' + echapper([libelle(OBJECTIFS, dep.objectif.choix), dep.objectif.texte].filter(Boolean).join(' — ')) + '</p>' : '') +
    (dep.difficultes && (dep.difficultes.choix || []).length
      ? '<p><i>Difficultés annoncées</i>' + echapper(dep.difficultes.choix.map((c) => libelle(DIFFICULTES, c)).filter(Boolean).join(', ')) + '</p>' : '') +
    (dep.difficultes && dep.difficultes.precision ? '<p><i>Précision</i>' + echapper(dep.difficultes.precision) + '</p>' : '') +
    rappelHab + '</section>' : '';

  // Le chemin parcouru. Une ligne par action : ni tableau, ni graphique — on
  // regarde ça ensemble, à l'écran, pas dans un rapport.
  const chemin = synth.length ? '<section class="ec-rdv-bloc">' +
    '<h3 class="ec-rdv-h">Le chemin parcouru</h3>' +
    '<p class="ec-rdv-aide">Les actions travaillées pendant le Boost.</p>' +
    '<ol class="ec-chemin">' + synth.map((a) => '<li>' +
      '<b>Étape ' + a.numero + '</b> ' + echapper(a.intitule) +
      '<span>' +
        (a.resultat ? libelle(RESULTATS, a.resultat) : 'pas encore constatée') +
        (a.decision ? ' · ' + libelle(DECISIONS, a.decision) : '') +
        (a.adhesion ? ' · adhésion ' + a.adhesion + '/10' : '') +
      '</span></li>').join('') + '</ol></section>' : '';

  return '<form id="ecBilan" class="ec-rdv-form" autocomplete="off">' +
    '<h2 class="ec-rdv-t2">Étape 12/12 — Ton bilan <span>le dernier rendez-vous</span></h2>' +

    // On commence par CLORE la dernière action, avant de regarder le chemin :
    // c'est le geste habituel du rendez-vous, et sans lui l'action de S11 serait
    // la seule du Boost à finir sans verdict.
    '<section class="ec-rdv-bloc ec-rdv-prec">' +
      '<h3 class="ec-rdv-h">Ton action depuis le dernier rendez-vous</h3>' +
      (precedente
        ? '<p class="ec-prec-txt">' + echapper(precedente.intitule) +
          (precedente.frequence ? ' <span>(' + echapper(precedente.frequence) + ')</span>' : '') + '</p>' +
          (precedente.detail ? '<p class="ec-prec-det">' + echapper(precedente.detail) + '</p>' : '') +
          (precedente.adhesion ? '<p class="ec-prec-det">Adhésion annoncée : ' + precedente.adhesion + '/10</p>' : '')
        : '<p class="ec-prec-txt ec-prec-vide">Aucune action active trouvée pour la période écoulée.</p>') +
      '<p class="ec-rdv-aide">Un simple constat, pour clore proprement cette dernière action.</p>' +
      '<div class="ec-chips">' + RESULTATS.map(([k, t, cls]) =>
        '<label class="ec-chip ' + cls + '"><input type="radio" name="svRes" value="' + k + '"' +
        (prec.resultat === k ? ' checked' : '') + '><span>' + echapper(t) + '</span></label>').join('') + '</div>' +
      champTexte('svResCom', 'Ce qui s\'est passé, en une phrase (facultatif)', prec.commentaire, 2) +
    '</section>' +

    rappel + chemin +

    bloc('Ce qui a changé', 'Avec les mots du client. Note ce qui est utile, laisse le reste vide.',
      '<label class="ec-hab-l ec-bilan-l"><span>Les progrès dont il est le plus satisfait</span>' +
      '<input type="text" data-bilan12="progres" value="' + echapper(bil.progres || '') + '" placeholder="Même une petite chose"></label>' +
      '<label class="ec-hab-l ec-bilan-l"><span>Ce qui est devenu plus facile</span>' +
      '<input type="text" data-bilan12="plusFacile" value="' + echapper(bil.plusFacile || '') + '" placeholder="Un geste qui ne demande plus d\'effort"></label>' +
      '<label class="ec-hab-l ec-bilan-l"><span>Ce qu\'il a appris sur son alimentation</span>' +
      '<input type="text" data-bilan12="appris" value="' + echapper(bil.appris || '') + '" placeholder="Ce qu\'il ne savait pas au départ"></label>') +

    // LA zone mise en avant : ce que le client emporte.
    '<section class="ec-rdv-bloc ec-rdv-action">' +
      '<h3 class="ec-rdv-h">Ce que tu veux conserver</h3>' +
      '<p class="ec-rdv-aide">Deux ou trois règles personnelles, pas plus : trois règles se retiennent, dix ne se retiennent pas. ' +
        'Ce ne sont pas de nouvelles actions de semaine — c\'est ce que le client garde après le Boost.</p>' +
      regles.map((r, i) => '<input type="text" data-regle="' + i + '" class="ec-regle" value="' + echapper(r) + '" ' +
        'placeholder="Règle ' + (i + 1) + (i === 0 ? ' — ex. : préparer mes déjeuners la veille' : ' (facultative)') + '">').join('') +
    '</section>' +

    bloc('Ce qui reste difficile', 'Les situations où il devra rester vigilant : week-end, restaurant, déplacements…',
      champTexte('bilFragiles', 'Ce sur quoi garder un œil', d.fragiles, 3)) +

    bloc('À quel point tu te sens capable de continuer seul ?',
      'La note du client, de 1 à 10. Informative : elle ne bloque pas la fin du Boost.',
      '<div class="ec-notes">' + Array.from({ length: 10 }, (_, i) => i + 1).map((v) =>
        '<label class="ec-note"><input type="radio" name="bilConf" value="' + v + '"' +
        (Number(d.confiance) === v ? ' checked' : '') + '><span>' + v + '</span></label>').join('') + '</div>') +

    blocNotes() +
    piedRdv('Terminer mon Boost Nutrition',
      'La validation clôt le Boost : l\'Étape 12 est validée, aucune nouvelle action de semaine n\'est créée, et le client repart avec son plan.') +
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

  if (rdv.seance.protocole === 'bilan') {
    const bilan = {};
    document.querySelectorAll('[data-bilan12]').forEach((i) => { bilan[i.dataset.bilan12] = i.value; });
    const conf = coche('bilConf');
    return {
      donnees: {
        actionPrecedente: { resultat: coche('svRes'), commentaire: val('svResCom') },
        bilan,
        // Les cases vides sont retirées côté serveur aussi : une règle blanche
        // au milieu du formulaire ne doit pas entrer dans le plan final.
        regles: [...document.querySelectorAll('[data-regle]')].map((i) => i.value).filter((v) => v.trim()),
        fragiles: val('bilFragiles'),
        confiance: conf ? Number(conf) : null,
      },
      // Aucune action de semaine à S12 : le champ n'existe pas dans l'écran.
      action: {}, noteCoach,
    };
  }

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
