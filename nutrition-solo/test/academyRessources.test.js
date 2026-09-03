'use strict';
// ============================================================================
//  MY COACH ACADEMY — LA BOÎTE À OUTILS.
//
//  CE QUE CETTE SUITE ATTAQUE, DANS L'ORDRE :
//
//   1. UNE RESSOURCE N'EST PAS UNE FORMATION. C'est LE test du lot, et il est
//      écrit en négatif : on crée des ressources, on les consulte toutes, et on
//      vérifie que la progression, le QCM, l'évaluation pratique et la
//      certification n'ont pas bougé d'un iota. Le jour où quelqu'un branchera
//      la bibliothèque sur le parcours, c'est ici que ça cassera.
//   2. LES QUATRE TYPES, chacun avec ce qu'il exige. Un PDF sans fichier, une
//      vidéo sans identifiant, un lien sans adresse : refusés, et le refus dit
//      lequel des quatre manque.
//   3. LES OCTETS SONT EN BASE, ET GARDÉS. On relit le fichier par l'API, on
//      vérifie qu'il est identique à l'octet près, et qu'un compte sans droit
//      ne l'obtient pas — contrairement aux photos de plats, qui sont publiques.
//   4. LA RECHERCHE ET LES FILTRES sont faits PAR LE SERVEUR. Y compris les
//      caractères que LIKE interprète : un « % » saisi cherche un « % ».
//   5. LES SOUS-CATÉGORIES SONT DES DONNÉES. On en crée une qui n'existait pas,
//      on classe dedans, on la masque — sans redéploiement et sans déclasser.
//   6. ADMINISTRER, C'EST QUATRE GESTES + UN. Ajouter, modifier, archiver,
//      réordonner — et supprimer, le seul DELETE légitime de toute l'Academy.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-ressources-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.r@exemple.fr';     // collaborateur : il entre dans la Boîte à outils
const LEA = 'lea.r@exemple.fr';       // cliente : elle n'y entre pas
const jetons = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');
const html = fs.readFileSync(path.join(PUBLIC, 'academy.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'academy.css'), 'utf8');
const moteur = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyRessources.js'), 'utf8');

// Un vrai PDF minimal et une vraie image PNG : on ne teste pas un stockage de
// fichiers avec la chaîne « coucou ». Les octets doivent revenir identiques.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

async function api(methode, route, corps, jeton) {
  const res = await fetch(base + route, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
    body: corps === undefined || corps === null ? undefined : JSON.stringify(corps),
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (_) { /* non JSON */ }
  return { status: res.status, body: json, txt };
}

// L'envoi d'un fichier : corps BRUT, pas de base64 dans du JSON.
async function envoyer(buffer, mime, nom, jeton) {
  const res = await fetch(base + '/api/academy/admin/ressources/fichier?nom=' + encodeURIComponent(nom), {
    method: 'POST',
    headers: { 'Content-Type': mime, ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
    body: buffer,
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (_) { /* non JSON */ }
  return { status: res.status, body: json, txt };
}

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
}

const adm = (m, route, corps) => api(m, route, corps, jetons[ADMIN]);
const collab = (m, route, corps) => api(m, route, corps, jetons[THEO]);
const dbq = () => require('../lib/db').getDb();

// Crée une ressource complète et renvoie sa fiche.
async function creer(corps) {
  const r = await adm('POST', '/api/academy/admin/ressources', corps);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 300));
  return r.body.ressource;
}

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academy.assurerSchema();
  app.academyRessources.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [THEO, '4004'], [LEA, '1001']]) await connecter(e, p);
  await api('POST', '/api/boost/admin/collaborateurs', { email: THEO, role: 'collaborateur' }, jetons[ADMIN]);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  0. LE MOTEUR NE TOUCHE PAS AU PARCOURS
// ===========================================================================

test('LE MOTEUR NE CONNAÎT AUCUNE TABLE DE PARCOURS', () => {
  // La garantie « ce n'est pas une formation » ne tient pas à une intention :
  // elle tient à ce que ce fichier ne sache pas nommer ces tables.
  //
  // On lit le CODE, pas les commentaires : l'en-tête du module cite justement
  // ces tables pour dire qu'il n'y touche pas, et c'est une bonne raison de les
  // écrire. Même méthode que test/academyAdmin.test.js.
  const code = moteur.split('\n').filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('--');
  }).join('\n');
  for (const t of ['academy_vus', 'academy_position', 'academy_tentatives', 'academy_modules',
    'academy_contenus', 'academy_questions', 'academy_evaluations', 'boost_certifications',
    'academy_formations']) {
    assert.ok(!new RegExp(t).test(code),
      `le moteur de la Boîte à outils nomme ${t} : une ressource pourrait devenir une étape de parcours`);
  }
});

test('le moteur ne reçoit AUCUN moteur de parcours en dépendance', () => {
  const serveur = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const m = /createAcademyRessources\(\{([^}]*)\}\)/.exec(serveur);
  assert.ok(m, 'l\'instanciation doit être lisible dans server.js');
  const donne = m[1].split(',').map((x) => x.trim()).filter(Boolean).sort();
  // getDb et nowIso, et rien d'autre : ce qu'on ne lui donne pas, il ne peut
  // pas l'écrire.
  assert.deepStrictEqual(donne, ['getDb', 'nowIso']);
});

// ===========================================================================
//  1. LES QUATRE TYPES
// ===========================================================================

test('les quatre types se créent, chacun avec ce qu\'il exige', async () => {
  const f = await envoyer(PDF, 'application/pdf', 'guide-entretien.pdf', jetons[ADMIN]);
  assert.strictEqual(f.status, 200, f.txt.slice(0, 200));
  assert.strictEqual(f.body.type, 'pdf');
  assert.strictEqual(f.body.taille, PDF.length);

  const img = await envoyer(PNG, 'image/png', 'affiche.png', jetons[ADMIN]);
  assert.strictEqual(img.status, 200);
  assert.strictEqual(img.body.type, 'image');

  const pdf = await creer({ type: 'pdf', titre: 'Guide d\'entretien S1', categorie: 'coaching',
    description: 'La trame du premier rendez-vous.', fichierId: f.body.fichierId });
  assert.strictEqual(pdf.type, 'pdf');
  assert.strictEqual(pdf.fichier.nom, 'guide-entretien.pdf');
  assert.strictEqual(pdf.fichier.taille, PDF.length);

  const image = await creer({ type: 'image', titre: 'Affiche des macros', categorie: 'nutrition',
    fichierId: img.body.fichierId });
  assert.strictEqual(image.type, 'image');

  // L'URL COMPLÈTE EST ACCEPTÉE, pas seulement l'identifiant : personne ne
  // devrait extraire onze caractères à la main d'une adresse copiée.
  const video = await creer({ type: 'video', titre: 'Poser un cadre', categorie: 'coaching',
    youtubeId: 'https://www.youtube.com/watch?v=aBcDeFgHiJk&t=42' });
  assert.strictEqual(video.youtubeId, 'aBcDeFgHiJk');

  const lien = await creer({ type: 'lien', titre: 'Le référentiel qualité', categorie: 'franchise',
    url: 'https://exemple.fr/referentiel' });
  assert.strictEqual(lien.url, 'https://exemple.fr/referentiel');

  // AUCUNE ne porte de progression : la vue elle-même n'a pas ces clés.
  for (const r of [pdf, image, video, lien]) {
    for (const clef of ['pourcentage', 'termine', 'commence', 'termines', 'total', 'acheve']) {
      assert.ok(!(clef in r), `une ressource ne doit pas porter « ${clef} »`);
    }
  }
});

test('les trois formes d\'adresse YouTube donnent le même identifiant', async () => {
  for (const forme of ['https://youtu.be/aBcDeFgHiJk', 'https://www.youtube.com/embed/aBcDeFgHiJk',
    'https://www.youtube.com/shorts/aBcDeFgHiJk', 'aBcDeFgHiJk']) {
    const r = await creer({ type: 'video', titre: 'Forme ' + forme, youtubeId: forme });
    assert.strictEqual(r.youtubeId, 'aBcDeFgHiJk', forme);
    await adm('POST', '/api/academy/admin/ressources/supprimer', { id: r.id });
  }
});

test('une ressource incomplète est REFUSÉE, et le refus dit ce qui manque', async () => {
  const cas = [
    [{ type: 'pdf', titre: 'Sans fichier' }, /fichier PDF/i],
    [{ type: 'image', titre: 'Sans image' }, /image/i],
    [{ type: 'video', titre: 'Sans vidéo', youtubeId: 'pas-un-id' }, /YouTube/i],
    [{ type: 'lien', titre: 'Sans lien', url: 'pas-une-url' }, /Lien invalide/i],
    [{ type: 'pdf', titre: '' }, /titre/i],
    [{ type: 'inconnu', titre: 'Type inventé' }, /Type de ressource inconnu/i],
  ];
  for (const [corps, motif] of cas) {
    const r = await adm('POST', '/api/academy/admin/ressources', corps);
    assert.strictEqual(r.status, 400, JSON.stringify(corps));
    assert.match(r.body.error, motif, JSON.stringify(corps));
  }
});

test('un lien « javascript: » est refusé — un href n\'est pas du texte libre', async () => {
  for (const mauvais of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'ftp://exemple.fr/x']) {
    const r = await adm('POST', '/api/academy/admin/ressources',
      { type: 'lien', titre: 'Piège', url: mauvais });
    assert.strictEqual(r.status, 400, mauvais);
  }
});

test('un fichier ne peut pas être rangé sous un type qui n\'est pas le sien', async () => {
  const f = await envoyer(PDF, 'application/pdf', 'doc.pdf', jetons[ADMIN]);
  const r = await adm('POST', '/api/academy/admin/ressources',
    { type: 'image', titre: 'PDF déguisé', fichierId: f.body.fichierId });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /n'est pas une image/i);
});

test('un format non supporté est refusé à l\'envoi, avant toute fiche', async () => {
  const avant = dbq().prepare('SELECT COUNT(*) AS n FROM academy_ressource_fichiers').get().n;
  for (const mime of ['text/html', 'application/zip', 'image/svg+xml', 'application/octet-stream']) {
    const r = await envoyer(Buffer.from('<x>'), mime, 'piege', jetons[ADMIN]);
    assert.strictEqual(r.status, 415, mime);
  }
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_ressource_fichiers').get().n, avant,
    'un refus ne doit rien écrire');
});

// ===========================================================================
//  2. LES OCTETS : EN BASE, RENDUS À L'IDENTIQUE, ET GARDÉS
// ===========================================================================

test('LES OCTETS VIVENT EN BASE, jamais sur le disque', () => {
  const l = dbq().prepare('SELECT mime, taille, LENGTH(data) AS n FROM academy_ressource_fichiers').all();
  assert.ok(l.length, 'des fichiers ont bien été enregistrés');
  for (const f of l) assert.strictEqual(f.n, f.taille, 'le BLOB porte réellement les octets');
  // Le disque du projet ne doit pas avoir gagné de dossier d'envois : c'est ce
  // qui garantit la persistance à travers un redéploiement Railway.
  for (const d of ['uploads', 'public/uploads', 'data/uploads', 'files']) {
    assert.ok(!fs.existsSync(path.join(__dirname, '..', d)), 'un dossier d\'envois est apparu : ' + d);
  }
  assert.ok(!/writeFileSync|createWriteStream|mkdirSync/.test(moteur),
    'le moteur écrit sur le disque : les fichiers ne survivraient pas à un déploiement');
});

test('le fichier revient à l\'octet près, et sous son vrai nom', async () => {
  const f = await envoyer(PDF, 'application/pdf', 'trame-s1.pdf', jetons[ADMIN]);
  const r = await creer({ type: 'pdf', titre: 'Trame S1', fichierId: f.body.fichierId });

  const res = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier',
    { headers: { Authorization: 'Bearer ' + jetons[THEO] } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
  // Deux formes désormais (RFC 6266) : le repli ASCII et le nom exact. Un nom
  // déjà en ASCII donne le même dans les deux — c'est la garantie qu'on n'a pas
  // dégradé le cas simple en réparant le cas accentué.
  assert.match(res.headers.get('content-disposition'),
    /^inline; filename="trame-s1\.pdf"; filename\*=UTF-8''trame-s1\.pdf$/);
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  const recu = Buffer.from(await res.arrayBuffer());
  assert.ok(recu.equals(PDF), 'les octets rendus ne sont pas ceux qui ont été envoyés');

  // ?dl=1 : le MÊME fichier, une autre intention.
  const dl = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier?dl=1',
    { headers: { Authorization: 'Bearer ' + jetons[THEO] } });
  assert.match(dl.headers.get('content-disposition'),
    /^attachment; filename="trame-s1\.pdf"; filename\*=UTF-8''trame-s1\.pdf$/);
  assert.ok(Buffer.from(await dl.arrayBuffer()).equals(PDF));
});

// ===========================================================================
//  LE NOM DE FICHIER DANS L'EN-TÊTE — LE BUG DU 30/08, ET SA GARDE
//
//  ⚠️ CE QUI S'EST PASSÉ. La route posait le nom du fichier tel quel dans
//  Content-Disposition. Un nom venu d'un macOS est en forme DÉCOMPOSÉE (NFD) :
//  l'accent de « Séance » y est un caractère à part, U+0301 = 769, hors de la
//  plage ISO-8859-1 qu'autorise un en-tête HTTP. Node levait ERR_INVALID_CHAR,
//  Express répondait 500 avec une page HTML, et LES DEUX PARCOURS tombaient —
//  le lecteur affichait « Ce fichier n'a pas pu être chargé », le
//  téléchargement ne rendait rien.
//
//  POURQUOI AUCUN TEST NE L'AVAIT VU : tous nos noms de fichiers étaient en
//  ASCII pur (« trame-s1.pdf », « interne.pdf »…). Le bug ne dépendait pas du
//  fichier, mais de son NOM. Ces tests-ci utilisent donc de vrais noms français,
//  dans les deux formes Unicode, et un nom non latin.
// ===========================================================================

// Le nom exact que portait la ressource de production, en NFD — tel que macOS
// le transmet. Écrit par points de code pour qu'aucun éditeur ne le recompose
// en douce et ne vide le test de son sens.
const NOM_NFD = 'S\u0065\u0301ance Test - Notation.pdf';
const NOM_NFC = 'S\u00e9ance Test - Notation.pdf';

test('le nom du bug est bien décomposé, et illégal en en-tête brut', () => {
  assert.strictEqual(NOM_NFD.normalize('NFC'), NOM_NFC, 'les deux formes doivent désigner le même nom');
  assert.notStrictEqual(NOM_NFD, NOM_NFC, 'le test doit bien porter sur la forme décomposée');
  assert.ok([...NOM_NFD].some((c) => c.codePointAt(0) > 255),
    'le nom doit contenir un caractère hors ISO-8859-1 — c\'est tout l\'objet du test');
  // La preuve par Node : poser ce nom tel quel lève.
  const res = new (require('http').ServerResponse)({});
  assert.throws(() => res.setHeader('Content-Disposition', `inline; filename="${NOM_NFD}"`),
    /ERR_INVALID_CHAR|Invalid character/);
});

test('CONSULTER un PDF au nom accentué : 200, et non 500', async () => {
  const f = await envoyer(PDF, 'application/pdf', NOM_NFD, jetons[ADMIN]);
  assert.strictEqual(f.status, 200, f.txt.slice(0, 200));
  const r = await creer({ type: 'pdf', titre: 'Séance test notation', categorie: 'coaching',
    fichierId: f.body.fichierId });

  const res = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier',
    { headers: { Authorization: 'Bearer ' + jetons[THEO] } });
  assert.strictEqual(res.status, 200, 'la route ne doit plus tomber en 500 sur un nom accentué');
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf',
    'le lecteur doit recevoir un PDF, pas une page d\'erreur HTML');
  assert.strictEqual(res.headers.get('content-length'), String(PDF.length),
    'Content-Length doit annoncer la taille réelle');

  const recu = Buffer.from(await res.arrayBuffer());
  assert.ok(recu.equals(PDF), 'les octets rendus ne sont pas ceux qui ont été envoyés');
  assert.strictEqual(recu.slice(0, 4).toString('latin1'), '%PDF', 'le lecteur doit recevoir un vrai PDF');
});

test('TÉLÉCHARGER ce même PDF : le nom d\'origine est rendu, accent compris', async () => {
  const f = await envoyer(PDF, 'application/pdf', NOM_NFD, jetons[ADMIN]);
  const r = await creer({ type: 'pdf', titre: 'Séance à télécharger', fichierId: f.body.fichierId });

  const res = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier?dl=1',
    { headers: { Authorization: 'Bearer ' + jetons[THEO] } });
  assert.strictEqual(res.status, 200);
  const cd = res.headers.get('content-disposition');

  assert.match(cd, /^attachment;/, 'le téléchargement doit être annoncé en attachment');
  // LES DEUX FORMES DE LA RFC 6266 : un repli ASCII pour tout client, et le nom
  // exact pour les navigateurs modernes.
  assert.match(cd, /filename="Seance Test - Notation\.pdf"/,
    'le repli ASCII doit rester lisible : « Seance », pas « S_ance »');
  assert.ok(cd.includes("filename*=UTF-8''"), 'la forme étendue doit porter le nom exact');
  const etendu = decodeURIComponent(cd.split("filename*=UTF-8''")[1]);
  assert.strictEqual(etendu, NOM_NFC, 'le nom rendu doit être le nom d\'origine, accent compris');

  assert.ok(Buffer.from(await res.arrayBuffer()).equals(PDF), 'le fichier téléchargé doit être complet');
});

test('l\'en-tête reste légal quel que soit le nom, et Node l\'accepte', () => {
  const { enteteContentDisposition } = require('../lib/academyRessources');
  const cas = [
    ['guide.pdf', 'guide.pdf'],
    [NOM_NFD, NOM_NFC],
    [NOM_NFC, NOM_NFC],
    ['Reçu 2026 — clients.pdf', 'Reçu 2026 — clients.pdf'],
    ['資料.pdf', '資料.pdf'],
    ['photo 100% "validée".png', 'photo 100% "validée".png'],
    ['', 'document'],
  ];
  for (const [entree, attendu] of cas) {
    for (const dl of [true, false]) {
      const v = enteteContentDisposition(entree, dl);
      // 1. Node doit l'accepter — c'est exactement ce qui manquait.
      const res = new (require('http').ServerResponse)({});
      assert.doesNotThrow(() => res.setHeader('Content-Disposition', v),
        'en-tête refusé par Node pour ' + JSON.stringify(entree));
      // 2. Le nom exact doit être restituable.
      const etendu = decodeURIComponent(v.split("filename*=UTF-8''")[1]);
      assert.strictEqual(etendu, attendu.normalize('NFC'), 'nom exact perdu pour ' + JSON.stringify(entree));
      // 3. Le repli ne doit ni être vide, ni casser les guillemets de l'en-tête.
      const repli = /filename="([^"]*)"/.exec(v)[1];
      assert.ok(repli.length, 'repli vide pour ' + JSON.stringify(entree));
      assert.ok(!/["\\]/.test(repli), 'le repli doit être échappé pour ' + JSON.stringify(entree));
      assert.strictEqual(v.startsWith(dl ? 'attachment' : 'inline'), true);
    }
  }
});

test('une IMAGE au nom accentué se sert aussi — pas de régression', async () => {
  const f = await envoyer(PNG, 'image/png', 'Visuel affichage — été.png', jetons[ADMIN]);
  const r = await creer({ type: 'image', titre: 'Visuel été', categorie: 'communication',
    fichierId: f.body.fichierId });

  const res = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier',
    { headers: { Authorization: 'Bearer ' + jetons[THEO] } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('content-disposition'), /^inline;/);
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(PNG), 'l\'image doit revenir intacte');
});

test('LA GARDE TIENT TOUJOURS sur un fichier au nom accentué', async () => {
  const f = await envoyer(PDF, 'application/pdf', NOM_NFD, jetons[ADMIN]);
  const r = await creer({ type: 'pdf', titre: 'Protégée malgré son nom', fichierId: f.body.fichierId });
  const url = base + '/api/academy/ressources/' + r.id + '/fichier';

  // Corriger l'en-tête ne devait ouvrir aucune porte.
  assert.strictEqual((await fetch(url)).status, 401, 'sans jeton : 401');
  assert.strictEqual((await fetch(url, { headers: { Authorization: 'Bearer faux' } })).status, 401,
    'jeton invalide : 401');
  assert.strictEqual((await fetch(url, { headers: { Authorization: 'Bearer ' + jetons[LEA] } })).status, 403,
    'compte sans accès Academy : 403');
  assert.strictEqual((await fetch(url, { headers: { Authorization: 'Bearer ' + jetons[THEO] } })).status, 200,
    'collaborateur : 200');
});

test('LE FICHIER N\'EST PAS PUBLIC — contrairement à une photo de plat', async () => {
  const f = await envoyer(PDF, 'application/pdf', 'interne.pdf', jetons[ADMIN]);
  const r = await creer({ type: 'pdf', titre: 'Document interne', fichierId: f.body.fichierId });

  const sansJeton = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier');
  assert.strictEqual(sansJeton.status, 401, 'une URL devinée ne doit pas suffire');

  const cliente = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier',
    { headers: { Authorization: 'Bearer ' + jetons[LEA] } });
  assert.strictEqual(cliente.status, 403, 'une cliente n\'entre pas dans la Boîte à outils');
});

test('une ressource archivée ne rend plus ses octets', async () => {
  const f = await envoyer(PDF, 'application/pdf', 'retire.pdf', jetons[ADMIN]);
  const r = await creer({ type: 'pdf', titre: 'À retirer', fichierId: f.body.fichierId });
  await adm('POST', '/api/academy/admin/ressources/archiver', { id: r.id, actif: false });
  const res = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier',
    { headers: { Authorization: 'Bearer ' + jetons[THEO] } });
  assert.strictEqual(res.status, 404);
});

// ===========================================================================
//  3. RECHERCHE ET FILTRES — CÔTÉ SERVEUR
// ===========================================================================

test('la recherche porte sur le titre ET la description', async () => {
  await creer({ type: 'lien', titre: 'Modèle de facture', categorie: 'administratif',
    description: 'Le gabarit à envoyer au client.', url: 'https://exemple.fr/facture' });

  const parTitre = await collab('GET', '/api/academy/ressources?q=facture');
  assert.ok(parTitre.body.ressources.some((r) => r.titre === 'Modèle de facture'));

  const parDescription = await collab('GET', '/api/academy/ressources?q=gabarit');
  assert.ok(parDescription.body.ressources.some((r) => r.titre === 'Modèle de facture'),
    'chercher un mot du résumé doit trouver la fiche');

  const rien = await collab('GET', '/api/academy/ressources?q=zzzintrouvable');
  assert.strictEqual(rien.body.ressources.length, 0);
});

test('un « % » cherché est un « % », pas un joker', async () => {
  // Sans échappement, LIKE '%%%' ramène TOUTE la bibliothèque — et l'écran
  // annoncerait des résultats à une recherche qui n'en a aucun.
  const r = await collab('GET', '/api/academy/ressources?q=' + encodeURIComponent('%'));
  assert.strictEqual(r.body.ressources.length, 0,
    'le joker de LIKE a fui dans la recherche');
});

test('les filtres par sous-catégorie et par type sont cumulables', async () => {
  const parCat = await collab('GET', '/api/academy/ressources?categorie=coaching');
  assert.ok(parCat.body.ressources.length);
  assert.ok(parCat.body.ressources.every((r) => r.categorie === 'coaching'));

  const parType = await collab('GET', '/api/academy/ressources?type=video');
  assert.ok(parType.body.ressources.length);
  assert.ok(parType.body.ressources.every((r) => r.type === 'video'));

  const deux = await collab('GET', '/api/academy/ressources?categorie=coaching&type=video');
  assert.ok(deux.body.ressources.every((r) => r.categorie === 'coaching' && r.type === 'video'));
  assert.ok(deux.body.ressources.length <= parType.body.ressources.length);
});

test('la bibliothèque ne montre QUE les ressources actives', async () => {
  const r = await creer({ type: 'lien', titre: 'Brouillon à cacher', url: 'https://exemple.fr/x' });
  await adm('POST', '/api/academy/admin/ressources/archiver', { id: r.id, actif: false });

  const vue = await collab('GET', '/api/academy/ressources');
  assert.ok(!vue.body.ressources.some((x) => x.id === r.id), 'une ressource archivée reste invisible');

  // L'administration, elle, doit la voir : c'est ce qui permet de la restaurer.
  const cote = await adm('GET', '/api/academy/admin/ressources');
  assert.ok(cote.body.ressources.some((x) => x.id === r.id && !x.actif));
});

test('la bibliothèque est fermée aux clients, ouverte aux collaborateurs', async () => {
  assert.strictEqual((await collab('GET', '/api/academy/ressources')).status, 200);
  assert.strictEqual((await api('GET', '/api/academy/ressources', undefined, jetons[LEA])).status, 403);
  assert.strictEqual((await api('GET', '/api/academy/ressources')).status, 401);
  // Administrer reste réservé à l'administrateur.
  assert.strictEqual((await collab('GET', '/api/academy/admin/ressources')).status, 403);
  assert.strictEqual((await collab('POST', '/api/academy/admin/ressources',
    { type: 'lien', titre: 'X', url: 'https://exemple.fr' })).status, 403);
  assert.strictEqual((await envoyer(PDF, 'application/pdf', 'x.pdf', jetons[THEO])).status, 403);
});

// ===========================================================================
//  4. LES CATÉGORIES SONT DES DONNÉES
//
//  ⚠️ CATÉGORIE ≠ TYPE, et c'est la distinction que toute cette section garde.
//  La CATÉGORIE dit le DOMAINE (Coaching, Pilotage & KPI…) : elle vit en base,
//  elle est administrable, elle évoluera. Le TYPE dit le FORMAT (PDF, image,
//  vidéo, lien) : c'est une liste fermée du code, et elle ne bouge pas. Les
//  deux axes se croisent librement — un tutoriel est « Outils & applications »
//  ET « vidéo », un tableau de KPI est « Pilotage & KPI » ET « lien ».
// ===========================================================================

// L'ordre attendu, tel qu'il a été décidé. C'est celui du filtre que voient les
// utilisateurs, donc il fait partie du contrat — pas seulement le contenu.
const CATEGORIES_ATTENDUES = [
  ['coaching', 'Coaching'],
  ['nutrition', 'Nutrition'],
  ['commercial', 'Commercial & vente'],
  ['experience_client', 'Expérience & fidélisation client'],
  ['management', 'Management & RH'],
  ['communication', 'Communication & marketing'],
  ['pilotage_kpi', 'Pilotage & KPI'],
  ['administratif', 'Administratif & procédures'],
  ['franchise', 'Franchise'],
  ['outils_applications', 'Outils & applications'],
  ['divers', 'Divers'],
];

test('LES 11 CATÉGORIES SONT LÀ, DANS L\'ORDRE DÉCIDÉ', async () => {
  const r = await collab('GET', '/api/academy/ressources');
  assert.strictEqual(r.body.categories.length, 11, 'il doit y en avoir exactement onze');
  assert.deepStrictEqual(r.body.categories.map((c) => c.cle), CATEGORIES_ATTENDUES.map((c) => c[0]),
    'l\'ordre des catégories ne suit pas celui qui a été décidé');
  assert.deepStrictEqual(r.body.categories.map((c) => c.libelle), CATEGORIES_ATTENDUES.map((c) => c[1]),
    'un libellé de catégorie a changé sans décision');
});

test('les huit anciennes catégories ont été MIGRÉES, pas remplacées', () => {
  // Les cinq clés reprises gardent leur clé et changent de libellé : c'est ce
  // qui permet à une ressource déjà classée de suivre son intitulé sans être
  // réécrite. Les trois nouvelles arrivent avec leur propre clé.
  const { CATEGORIES_RENOMMEES } = require('../lib/academyRessources');
  for (const [cle, avant, apres] of CATEGORIES_RENOMMEES) {
    const ligne = dbq().prepare('SELECT libelle FROM academy_ressource_categories WHERE cle = ?').get(cle);
    assert.ok(ligne, 'la clé historique doit survivre : ' + cle);
    assert.strictEqual(ligne.libelle, apres, `« ${avant} » aurait dû devenir « ${apres} »`);
  }
  for (const neuve of ['experience_client', 'pilotage_kpi', 'outils_applications']) {
    assert.ok(dbq().prepare('SELECT cle FROM academy_ressource_categories WHERE cle = ?').get(neuve),
      'catégorie neuve manquante : ' + neuve);
  }
});

test('la migration est IDEMPOTENTE et ne réécrase pas un libellé choisi', () => {
  const moteur = app.academyRessources;
  // On renomme comme le ferait l'administrateur, puis on rejoue l'amorçage.
  moteur.definirCategorie({ cle: 'divers', libelle: 'Autres ressources' });
  moteur.amorcer();
  assert.strictEqual(moteur.lireCategorie('divers').libelle, 'Autres ressources',
    'un libellé saisi par l\'administrateur a été réécrasé par l\'amorçage');
  // Et on rend son nom, pour ne rien laisser derrière soi.
  moteur.definirCategorie({ cle: 'divers', libelle: 'Divers' });
  moteur.amorcer();
  assert.strictEqual(moteur.lireCategorie('divers').libelle, 'Divers');
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_ressource_categories').get().n, 11,
    'rejouer l\'amorçage a dupliqué des catégories');
});

test('ON PEUT CRÉER UNE RESSOURCE DANS CHACUNE DES 11 CATÉGORIES', async () => {
  const crees = [];
  for (const [cle, libelle] of CATEGORIES_ATTENDUES) {
    const r = await creer({ type: 'lien', titre: 'Test ' + libelle, categorie: cle,
      url: 'https://exemple.fr/' + cle });
    assert.strictEqual(r.categorie, cle);
    assert.strictEqual(r.categorieLibelle, libelle, 'le libellé doit voyager avec la fiche');
    crees.push(r.id);
  }
  // Chacune se retrouve par son filtre, et elle seule.
  for (const [cle] of CATEGORIES_ATTENDUES) {
    const vue = await collab('GET', '/api/academy/ressources?categorie=' + cle);
    assert.ok(vue.body.ressources.length, 'aucune ressource dans ' + cle);
    assert.ok(vue.body.ressources.every((x) => x.categorie === cle), 'le filtre fuit sur ' + cle);
  }
  for (const id of crees) await adm('POST', '/api/academy/admin/ressources/supprimer', { id });
});

test('LES QUATRE TYPES N\'ONT PAS BOUGÉ — catégorie et type sont deux axes', async () => {
  const { TYPES } = require('../lib/academyRessources');
  assert.deepStrictEqual(TYPES, ['pdf', 'image', 'video', 'lien'],
    'les types de ressource ne devaient pas changer');

  // Les exemples donnés : le même type sert plusieurs domaines, et le même
  // domaine accepte plusieurs types.
  const f = await envoyer(PDF, 'application/pdf', 'process-pesee.pdf', jetons[ADMIN]);
  const a = await creer({ type: 'pdf', titre: 'Process pesée client', categorie: 'coaching',
    fichierId: f.body.fichierId });
  const b = await creer({ type: 'video', titre: 'Tutoriel Deciplus', categorie: 'outils_applications',
    youtubeId: 'aBcDeFgHiJk' });
  const c = await creer({ type: 'lien', titre: 'Tableau de suivi des KPI', categorie: 'pilotage_kpi',
    url: 'https://exemple.fr/kpi' });
  assert.deepStrictEqual([a.type, a.categorie], ['pdf', 'coaching']);
  assert.deepStrictEqual([b.type, b.categorie], ['video', 'outils_applications']);
  assert.deepStrictEqual([c.type, c.categorie], ['lien', 'pilotage_kpi']);
});

test('« Toutes » n\'est pas une catégorie : c\'est l\'absence de filtre', async () => {
  const toutes = await collab('GET', '/api/academy/ressources');
  const filtree = await collab('GET', '/api/academy/ressources?categorie=coaching');
  assert.ok(toutes.body.ressources.length > filtree.body.ressources.length,
    'sans filtre, on doit voir plus que dans une seule catégorie');
  // La valeur 'toutes' est acceptée et vaut « pas de filtre » — c'est ce que
  // l'écran envoie s'il la laisse passer.
  const explicite = await collab('GET', '/api/academy/ressources?categorie=toutes');
  assert.strictEqual(explicite.body.ressources.length, toutes.body.ressources.length);
  // Et « Toutes » ne doit jamais apparaître comme une catégorie enregistrée.
  assert.ok(!toutes.body.categories.some((c) => /^toutes?$/i.test(c.cle)),
    '« Toutes » ne doit pas être une catégorie en base');
});

test('CATÉGORIE + TYPE + RECHERCHE se combinent, dans les deux sens', async () => {
  await creer({ type: 'pdf', titre: 'Script de relance prospect', categorie: 'commercial',
    description: 'Le script téléphonique de relance.',
    fichierId: (await envoyer(PDF, 'application/pdf', 'script.pdf', jetons[ADMIN])).body.fichierId });
  await creer({ type: 'lien', titre: 'Relance par e-mail', categorie: 'commercial',
    description: 'Le modèle de relance écrite.', url: 'https://exemple.fr/relance' });

  const mot = await collab('GET', '/api/academy/ressources?q=relance');
  assert.strictEqual(mot.body.ressources.length, 2, 'la recherche seule doit trouver les deux');

  const motEtType = await collab('GET', '/api/academy/ressources?q=relance&type=pdf');
  assert.deepStrictEqual(motEtType.body.ressources.map((r) => r.titre), ['Script de relance prospect'],
    'recherche + type doivent se cumuler');

  const lesTrois = await collab('GET', '/api/academy/ressources?q=relance&type=lien&categorie=commercial');
  assert.deepStrictEqual(lesTrois.body.ressources.map((r) => r.titre), ['Relance par e-mail'],
    'recherche + type + catégorie doivent se cumuler');

  // Une combinaison qui n'existe pas ne doit rien inventer.
  const vide = await collab('GET', '/api/academy/ressources?q=relance&categorie=franchise');
  assert.strictEqual(vide.body.ressources.length, 0);
});

test('RENOMMER une catégorie ne casse AUCUNE de ses ressources', async () => {
  const r = await creer({ type: 'lien', titre: 'Fiche à conserver', categorie: 'pilotage_kpi',
    url: 'https://exemple.fr/conserver' });

  const maj = await adm('POST', '/api/academy/admin/ressources/categories',
    { cle: 'pilotage_kpi', libelle: 'Pilotage, KPI & reporting' });
  assert.strictEqual(maj.status, 200, maj.txt.slice(0, 200));

  const apres = maj.body.ressources.find((x) => x.id === r.id);
  assert.strictEqual(apres.categorie, 'pilotage_kpi', 'la CLÉ ne doit jamais changer');
  assert.strictEqual(apres.categorieLibelle, 'Pilotage, KPI & reporting', 'le nouveau nom doit suivre');
  const vue = await collab('GET', '/api/academy/ressources?categorie=pilotage_kpi');
  assert.ok(vue.body.ressources.some((x) => x.id === r.id), 'le filtre doit continuer de la trouver');

  await adm('POST', '/api/academy/admin/ressources/categories',
    { cle: 'pilotage_kpi', libelle: 'Pilotage & KPI' });
});

test('RÉORDONNER change l\'affichage, et RIEN d\'autre', async () => {
  const avant = (await adm('GET', '/api/academy/admin/ressources')).body;
  const cles = avant.categories.map((c) => c.cle);
  const permute = [cles[1], cles[0], ...cles.slice(2)];

  const r = await adm('POST', '/api/academy/admin/ressources/categories/ordre', { cles: permute });
  assert.strictEqual(r.status, 200, r.txt.slice(0, 200));
  assert.deepStrictEqual(r.body.categories.map((c) => c.cle), permute, 'l\'ordre doit avoir suivi');

  // AUCUNE fiche n'a été MODIFIÉE : même nombre, mêmes catégories, mêmes
  // titres, mêmes types.
  //
  //  ⚠️ On compare des ENSEMBLES, pas des listes. L'ordre d'AFFICHAGE des
  //  ressources suit celui des catégories — c'est précisément ce qu'on vient
  //  de changer, et c'est le but du geste. Ce qui ne doit pas bouger, c'est le
  //  CONTENU des fiches ; comparer les listes dans l'ordre ferait échouer le
  //  test sur le comportement attendu.
  const empreinte = (l) => l.map((x) => JSON.stringify([x.id, x.categorie, x.titre, x.type])).sort();
  assert.deepStrictEqual(empreinte(r.body.ressources), empreinte(avant.ressources),
    'réordonner les catégories a modifié des ressources');

  // Et l'affichage, lui, A bien suivi : c'est ce qu'on attendait du geste.
  const rangDe = (cle) => permute.indexOf(cle);
  const rangs = r.body.ressources.filter((x) => x.categorie).map((x) => rangDe(x.categorie));
  assert.deepStrictEqual(rangs, [...rangs].sort((a, b) => a - b),
    'la bibliothèque doit se présenter dans le nouvel ordre de catégories');

  // On remet l'ordre décidé.
  const remis = await adm('POST', '/api/academy/admin/ressources/categories/ordre', { cles });
  assert.deepStrictEqual(remis.body.categories.map((c) => c.cle), CATEGORIES_ATTENDUES.map((c) => c[0]));
});

test('une catégorie inconnue ne peut pas être ordonnée', async () => {
  const r = await adm('POST', '/api/academy/admin/ressources/categories/ordre',
    { cles: ['coaching', 'inexistante'] });
  assert.strictEqual(r.status, 404);
});

test('ARCHIVER une catégorie NE SUPPRIME AUCUNE RESSOURCE, et le dit', async () => {
  const r = await creer({ type: 'lien', titre: 'Ne doit pas disparaître', categorie: 'franchise',
    description: 'Un résumé qui doit survivre.', url: 'https://exemple.fr/survivre' });
  const avant = dbq().prepare('SELECT COUNT(*) AS n FROM academy_ressources').get().n;

  const arch = await adm('POST', '/api/academy/admin/ressources/categories/archiver',
    { cle: 'franchise', actif: false });
  assert.strictEqual(arch.status, 200);
  // La réponse ANNONCE combien de ressources sont concernées : sans ce nombre,
  // on ne pourrait pas prévenir avant d'agir. Il doit survivre à la réponse —
  // la route y ajoute la bibliothèque complète sous la clé `ressources`.
  const portees = dbq().prepare('SELECT COUNT(*) AS n FROM academy_ressources WHERE categorie = ?')
    .get('franchise').n;
  assert.ok(portees >= 1, 'la catégorie doit être garnie pour que ce test ait du sens');
  assert.strictEqual(arch.body.ressourcesConcernees, portees,
    'l\'archivage doit dire combien de ressources sont concernées');
  assert.strictEqual(arch.body.categorie.actif, false);
  assert.ok(Array.isArray(arch.body.ressources), 'et la bibliothèque à jour repart avec');

  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_ressources').get().n, avant,
    'archiver une catégorie a supprimé des ressources');
  const fiche = dbq().prepare('SELECT categorie, actif FROM academy_ressources WHERE id = ?').get(r.id);
  assert.strictEqual(fiche.categorie, 'franchise', 'la ressource a été déclassée');
  assert.strictEqual(fiche.actif, 1, 'la ressource a été archivée avec sa catégorie');

  // Elle reste consultable côté utilisateur : seule la catégorie quitte le filtre.
  const vue = await collab('GET', '/api/academy/ressources');
  assert.ok(!vue.body.categories.some((c) => c.cle === 'franchise'), 'le filtre ne la propose plus');
  assert.ok(vue.body.ressources.some((x) => x.id === r.id), 'la ressource doit rester consultable');

  // Réactiver la rend au filtre, intacte.
  await adm('POST', '/api/academy/admin/ressources/categories/archiver', { cle: 'franchise', actif: true });
  const rendue = await collab('GET', '/api/academy/ressources?categorie=franchise');
  assert.ok(rendue.body.ressources.some((x) => x.id === r.id));
});

test('le moteur sait DIRE combien de ressources une catégorie porte', () => {
  // C'est ce nombre que l'écran affiche avant d'archiver. Sans lui, « Masquer »
  // sur douze ressources ressemblerait à une suppression.
  assert.ok(app.academyRessources.compterRessources('franchise') >= 1);
  assert.strictEqual(app.academyRessources.compterRessources('inexistante'), 0);
});

test('IL N\'Y A PAS DE SUPPRESSION DE CATÉGORIE — seulement l\'archivage', () => {
  // Une catégorie supprimée laisserait ses ressources pointer vers une clé qui
  // n'existe plus. Le moteur n'expose donc pas ce geste, et n'écrit aucun
  // DELETE sur cette table.
  assert.strictEqual(app.academyRessources.supprimerCategorie, undefined,
    'aucune suppression de catégorie ne doit être exposée');
  assert.ok(!/DELETE FROM academy_ressource_categories/.test(moteur),
    'le moteur ne doit jamais supprimer une catégorie');
});

test('on ajoute une catégorie SANS redéploiement, et on classe dedans', async () => {
  const c = await adm('POST', '/api/academy/admin/ressources/categories',
    { cle: 'juridique', libelle: 'Juridique' });
  assert.strictEqual(c.status, 200, c.txt.slice(0, 200));
  // Elle arrive EN DERNIER : ajouter ne bouscule pas l'ordre décidé.
  assert.strictEqual(c.body.categories[c.body.categories.length - 1].cle, 'juridique');

  const r = await creer({ type: 'lien', titre: 'Modèle de contrat', categorie: 'juridique',
    url: 'https://exemple.fr/contrat' });
  assert.strictEqual(r.categorie, 'juridique');
  assert.strictEqual(r.categorieLibelle, 'Juridique');
  assert.strictEqual((await collab('GET', '/api/academy/ressources?categorie=juridique')).body.ressources.length, 1);
});

test('une catégorie inconnue est refusée à la création d\'une ressource', async () => {
  const r = await adm('POST', '/api/academy/admin/ressources',
    { type: 'lien', titre: 'Mal classée', categorie: 'inventee', url: 'https://exemple.fr' });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /inventee/);
});

test('administrer les catégories reste réservé à l\'administrateur', async () => {
  for (const [route, corps] of [
    ['/api/academy/admin/ressources/categories', { cle: 'pirate', libelle: 'Pirate' }],
    ['/api/academy/admin/ressources/categories/archiver', { cle: 'coaching', actif: false }],
    ['/api/academy/admin/ressources/categories/ordre', { cles: ['coaching'] }],
  ]) {
    assert.strictEqual((await collab('POST', route, corps)).status, 403, route);
  }
  assert.strictEqual(app.academyRessources.lireCategorie('pirate'), null, 'un refus n\'écrit rien');
  assert.strictEqual(app.academyRessources.lireCategorie('coaching').actif, true);
});

// ===========================================================================
//  5. ADMINISTRER : MODIFIER, RÉORDONNER, ARCHIVER, SUPPRIMER
// ===========================================================================

test('modifier une fiche ne perd ni son fichier ni sa sous-catégorie', async () => {
  const f = await envoyer(PDF, 'application/pdf', 'a-garder.pdf', jetons[ADMIN]);
  const r = await creer({ type: 'pdf', titre: 'Titre d\'origine', categorie: 'commercial',
    description: 'Résumé d\'origine.', fichierId: f.body.fichierId });

  // On n'envoie QUE le titre : le reste ne doit pas s'effacer.
  const maj = await adm('POST', '/api/academy/admin/ressources', { id: r.id, titre: 'Titre corrigé' });
  assert.strictEqual(maj.status, 200, maj.txt.slice(0, 300));
  const apres = maj.body.ressources.find((x) => x.id === r.id);
  assert.strictEqual(apres.titre, 'Titre corrigé');
  assert.strictEqual(apres.description, 'Résumé d\'origine.', 'la description ne devait pas s\'effacer');
  assert.strictEqual(apres.categorie, 'commercial', 'la sous-catégorie ne devait pas s\'effacer');
  assert.strictEqual(apres.fichier.nom, 'a-garder.pdf', 'le fichier ne devait pas se perdre');
});

test('remplacer le fichier efface l\'ancien : pas de BLOB orphelin', async () => {
  const un = await envoyer(PDF, 'application/pdf', 'v1.pdf', jetons[ADMIN]);
  const r = await creer({ type: 'pdf', titre: 'Support versionné', fichierId: un.body.fichierId });

  const deux = await envoyer(PDF, 'application/pdf', 'v2.pdf', jetons[ADMIN]);
  await adm('POST', '/api/academy/admin/ressources', { id: r.id, fichierId: deux.body.fichierId });

  assert.strictEqual(
    dbq().prepare('SELECT id FROM academy_ressource_fichiers WHERE id = ?').get(un.body.fichierId),
    undefined, 'l\'ancien fichier est resté en base');
  const apres = (await adm('GET', '/api/academy/admin/ressources')).body.ressources.find((x) => x.id === r.id);
  assert.strictEqual(apres.fichier.nom, 'v2.pdf');
});

test('réordonner réécrit tous les rangs, et refuse de mélanger deux familles', async () => {
  const a = await creer({ type: 'lien', titre: 'Ordre A', categorie: 'divers', url: 'https://exemple.fr/a' });
  const b = await creer({ type: 'lien', titre: 'Ordre B', categorie: 'divers', url: 'https://exemple.fr/b' });
  const c = await creer({ type: 'lien', titre: 'Ordre C', categorie: 'divers', url: 'https://exemple.fr/c' });

  const r = await adm('POST', '/api/academy/admin/ressources/ordre', { ids: [c.id, a.id, b.id] });
  assert.strictEqual(r.status, 200, r.txt.slice(0, 200));
  const dansDivers = r.body.ressources.filter((x) => x.categorie === 'divers').map((x) => x.titre);
  assert.deepStrictEqual(dansDivers, ['Ordre C', 'Ordre A', 'Ordre B']);

  const etranger = await creer({ type: 'lien', titre: 'Ailleurs', categorie: 'franchise',
    url: 'https://exemple.fr/z' });
  const ko = await adm('POST', '/api/academy/admin/ressources/ordre', { ids: [a.id, etranger.id] });
  assert.strictEqual(ko.status, 400);
  assert.match(ko.body.error, /même catégorie/);
});

test('archiver puis restaurer : rien n\'est perdu entre les deux', async () => {
  const r = await creer({ type: 'lien', titre: 'Va-et-vient', categorie: 'divers',
    description: 'Un résumé à conserver.', url: 'https://exemple.fr/vv' });
  await adm('POST', '/api/academy/admin/ressources/archiver', { id: r.id, actif: false });
  const rendu = await adm('POST', '/api/academy/admin/ressources/archiver', { id: r.id, actif: true });
  const apres = rendu.body.ressources.find((x) => x.id === r.id);
  assert.strictEqual(apres.actif, true);
  assert.strictEqual(apres.description, 'Un résumé à conserver.');
});

test('supprimer emporte la fiche ET son fichier — le seul DELETE de l\'Academy', async () => {
  const f = await envoyer(PDF, 'application/pdf', 'a-effacer.pdf', jetons[ADMIN]);
  const r = await creer({ type: 'pdf', titre: 'À effacer', fichierId: f.body.fichierId });

  const sup = await adm('POST', '/api/academy/admin/ressources/supprimer', { id: r.id });
  assert.strictEqual(sup.status, 200);
  assert.ok(!sup.body.ressources.some((x) => x.id === r.id));
  assert.strictEqual(dbq().prepare('SELECT id FROM academy_ressources WHERE id = ?').get(r.id), undefined);
  assert.strictEqual(
    dbq().prepare('SELECT id FROM academy_ressource_fichiers WHERE id = ?').get(f.body.fichierId),
    undefined, 'le fichier doit partir avec la fiche');
});

// ===========================================================================
//  6. LE TEST DU LOT : CONSULTER NE FAIT AVANCER AUCUN PARCOURS
// ===========================================================================

test('CONSULTER TOUTE LA BIBLIOTHÈQUE NE TOUCHE À AUCUN PARCOURS', async () => {
  // La photo « avant », prise par l'API elle-même : c'est l'état que le
  // collaborateur voit de son parcours.
  const avantApi = await collab('GET', '/api/academy/formation');
  const avantCert = await collab('GET', '/api/academy/certification');
  const avantVus = dbq().prepare('SELECT COUNT(*) AS n FROM academy_vus').get().n;
  const avantPos = dbq().prepare('SELECT COUNT(*) AS n FROM academy_position').get().n;

  // On ouvre TOUT : la liste, chaque fiche, chaque fichier.
  const biblio = await collab('GET', '/api/academy/ressources');
  assert.ok(biblio.body.ressources.length >= 4, 'la bibliothèque doit être garnie pour que ce test ait du sens');
  for (const r of biblio.body.ressources) {
    if (!r.fichier) continue;
    const res = await fetch(base + '/api/academy/ressources/' + r.id + '/fichier',
      { headers: { Authorization: 'Bearer ' + jetons[THEO] } });
    assert.strictEqual(res.status, 200);
    await res.arrayBuffer();
  }

  // Et rien n'a bougé. NI EN BASE, NI DANS CE QUE L'API RACONTE.
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_vus').get().n, avantVus,
    'une ressource consultée a été notée comme un contenu vu');
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_position').get().n, avantPos,
    'une ressource consultée a déplacé le point de reprise');

  const apresApi = await collab('GET', '/api/academy/formation');
  assert.strictEqual(apresApi.body.formation.pourcentage, avantApi.body.formation.pourcentage);
  assert.strictEqual(apresApi.body.formation.termines, avantApi.body.formation.termines);
  assert.strictEqual(apresApi.body.formation.total, avantApi.body.formation.total,
    'une ressource s\'est glissée dans le décompte des contenus de la formation');
  assert.strictEqual(apresApi.body.formation.reprise, avantApi.body.formation.reprise);

  const apresCert = await collab('GET', '/api/academy/certification');
  assert.deepStrictEqual(apresCert.body.certifications, avantCert.body.certifications,
    'la consultation d\'une ressource a touché à une certification');
});

test('aucune ressource n\'apparaît dans les contenus d\'une formation', async () => {
  const f = await collab('GET', '/api/academy/formation');
  const titres = (f.body.formation.modules || []).flatMap((m) => m.contenus.map((c) => c.titre));
  for (const t of ['Guide d\'entretien S1', 'Affiche des macros', 'Modèle de facture']) {
    assert.ok(!titres.includes(t), 'une ressource est remontée dans une formation : ' + t);
  }
});

// ===========================================================================
//  7. L'ÉCRAN
// ===========================================================================

test('l\'écran existe, et il est branché sur les bonnes routes', () => {
  assert.ok(/id="acOutils"/.test(html), 'la section de la bibliothèque existe');
  assert.ok(/'#acOutils'/.test(js), 'l\'écran est déclaré dans afficher()');
  assert.ok(/apiAc\('\/api\/academy\/ressources'/.test(js) || /\/api\/academy\/ressources'/.test(js),
    'l\'écran lit la bibliothèque');
  assert.ok(/data-nav="outils"|cle: 'outils'/.test(js), 'la Boîte à outils a son entrée de navigation');
});

// ===========================================================================
//  7 bis. UN SEUL ÉCRAN POUR CONSULTER ET POUR ADMINISTRER
//
//  La Boîte à outils s'administrait depuis « Administrer » et se consultait
//  depuis la barre latérale : deux chemins, deux rendus, et deux endroits à
//  corriger. Tout tient désormais dans l'écran de la bibliothèque.
//
//  ⚠️ CE QUI EST VRAIMENT EN JEU : que la vue du COLLABORATEUR n'ait pas gagné
//  un bouton d'administration au passage. Le serveur garde les routes, mais un
//  bouton visible qui répond 403 est un défaut d'écran à part entière.
// ===========================================================================

test('l\'onglet « Administrer > Boîte à outils » n\'existe plus', () => {
  assert.ok(!/'contenus', 'outils'|'outils', 'contenus'/.test(js),
    'la barre d\'onglets de l\'administration cite encore la Boîte à outils');
  assert.ok(!/adminOnglet === 'outils'/.test(js),
    'un aiguillage d\'administration mène encore à la Boîte à outils');
  assert.ok(!/function rendreAdminOutils/.test(js),
    'le rendu de l\'ancien onglet subsiste : deux écrans finiraient par diverger');
  assert.ok(!/#acAdmin \[data-out\]/.test(js),
    'l\'écran d\'administration branche encore les gestes des ressources');
});

test('les gestes d\'administration sont branchés SUR la bibliothèque', () => {
  assert.ok(/#acOutils \[data-out\]/.test(js), 'l\'écran de la bibliothèque doit brancher les gestes');
  const bloc = js.slice(js.indexOf('function rendreOutils()'), js.indexOf('const archivees ='));
  assert.ok(bloc.length > 500, 'le rendu de la bibliothèque doit être délimité');
  for (const [geste, quoi] of [['neuve', 'ajouter une ressource'], ['cats', 'gérer les catégories']]) {
    assert.ok(bloc.includes('data-out="' + geste + '"'), 'geste manquant dans la bibliothèque : ' + quoi);
  }
  assert.ok(/\+ Ajouter une ressource/.test(bloc), 'le bouton d\'ajout doit être écrit en toutes lettres');
  assert.ok(/Gérer les catégories/.test(bloc), 'le bouton des catégories doit être écrit en toutes lettres');
  // Le formulaire et le gestionnaire ne sont pas réécrits : ce sont LES MÊMES.
  assert.ok(/rendreFormulaireRessource\(/.test(bloc), 'le formulaire existant doit être réutilisé');
  assert.ok(/rendrePanneauCategories\(/.test(bloc), 'le gestionnaire de catégories existant doit être réutilisé');
  assert.strictEqual((js.match(/function rendreFormulaireRessource/g) || []).length, 1,
    'il ne doit exister qu\'UN formulaire de ressource');
  assert.strictEqual((js.match(/function rendrePanneauCategories/g) || []).length, 1,
    'il ne doit exister qu\'UN gestionnaire de catégories');
});

test('AUCUN GESTE D\'ADMINISTRATION NE SE REND SANS `moiAdmin`', () => {
  // La barre : elle est tout entière sous la garde du drapeau.
  const barre = js.slice(js.indexOf('// LA BARRE D\'ADMINISTRATION.'), js.indexOf("'<p class=\"ac-eval-err\" id=\"acOutErr\""));
  assert.ok(/moiAdmin\s*\n?\s*\?/.test(barre), 'la barre doit être conditionnée à moiAdmin');
  assert.ok(barre.includes('data-out="neuve"'), 'la barre testée doit bien être celle de l\'administration');

  // Les actions de carte : la fonction refuse net pour qui n'est pas admin.
  const actions = js.slice(js.indexOf('const actionsAdmin = (r, archivee) =>'), js.indexOf('const carte = (r, archivee) =>'));
  assert.ok(/if \(!moiAdmin\) return '';/.test(actions),
    'les actions de carte doivent sortir immédiatement pour un non-administrateur');
  for (const geste of ['modifier', 'archiver', 'supprimer']) {
    assert.ok(actions.includes('\'' + geste + '\''), 'geste manquant sur la carte : ' + geste);
  }
  assert.ok(/Restaurer/.test(actions), 'une ressource archivée doit pouvoir être restaurée depuis sa carte');
});

test('L\'ÉCRAN N\'AFFICHE AUCUNE PROGRESSION sur une ressource', () => {
  const bloc = js.slice(js.indexOf('function rendreGrilleOutils'), js.indexOf('const ressourceDe'));
  assert.ok(bloc.length > 200, 'le rendu de la grille doit être trouvé');
  for (const interdit of ['ac-jauge', 'pourcentage', 'complété', 'ac-st-', 'termine']) {
    assert.ok(!bloc.includes(interdit),
      `la carte de ressource affiche « ${interdit} » : elle se ferait passer pour une formation`);
  }
});

test('le jeton ne voyage jamais dans l\'URL d\'un fichier', () => {
  // Ce serait la solution facile pour nourrir un <img src>. Elle met le jeton
  // dans les journaux du serveur et dans l'historique du navigateur.
  assert.ok(!/fichier\?token=|[?&]token=|[?&]jeton=/.test(js),
    'un jeton passe dans une URL');
  assert.ok(/createObjectURL/.test(js), 'les fichiers doivent passer par une URL d\'objet');
});

test('le filtre s\'appelle « Catégorie », et son premier choix est « Toutes »', () => {
  const bloc = js.slice(js.indexOf('function rendreOutils()'), js.indexOf('async function rafraichirOutils'));
  assert.ok(/<span>Catégorie<\/span><select id="acOutCat">/.test(bloc),
    'le filtre doit s\'appeler « Catégorie », plus « Sous-catégorie »');
  assert.ok(/value="toutes"[^>]*>Toutes</.test(bloc), 'le premier choix reste « Toutes »');
  assert.ok(/<span>Type<\/span><select id="acOutType">/.test(bloc), 'le filtre par type reste');
  assert.ok(/id="acOutQ"/.test(bloc), 'la recherche reste');
  // Plus aucune trace du mot « sous-catégorie » à l'écran.
  assert.ok(!/[Ss]ous-catégorie/.test(js), 'le mot « sous-catégorie » subsiste à l\'écran');
});

test('l\'administration porte les QUATRE gestes sur les catégories', () => {
  const bloc = js.slice(js.indexOf('function rendrePanneauCategories'), js.indexOf('// LE FORMULAIRE SUIT LE TYPE.'));
  assert.ok(bloc.length > 500, 'le panneau des catégories doit être délimité');
  for (const [geste, quoi] of [['cat-ajouter', 'ajouter'], ['cat-renommer', 'renommer'],
    ['cat-monter', 'réordonner (haut)'], ['cat-descendre', 'réordonner (bas)'],
    ['cat-archiver', 'archiver']]) {
    assert.ok(bloc.includes('data-out="' + geste + '"'), 'geste manquant : ' + quoi);
  }
  // Aucun geste de SUPPRESSION : il laisserait des ressources orphelines.
  assert.ok(!/data-out="cat-supprimer"/.test(js), 'une suppression de catégorie a été ouverte');
  // Le formulaire de ressource propose bien les catégories du serveur.
  assert.ok(/<span>Catégorie<\/span><select id="acOutCat2">/.test(js),
    'le formulaire d\'une ressource doit porter le choix de catégorie');
});

test('archiver une catégorie GARNIE se confirme, et l\'écran dit que rien n\'est supprimé', () => {
  const geste = js.slice(js.indexOf("if (geste === 'cat-archiver')"), js.indexOf("if (geste === 'cat-renommer')"));
  assert.ok(/dataset\.n/.test(geste), 'l\'écran doit regarder si la catégorie est garnie');
  assert.ok(/admOutilsCatAvert/.test(geste), 'et demander confirmation avant d\'agir');
  assert.ok(/Aucune ressource ne sera supprimée/.test(js),
    'l\'avertissement doit dire explicitement qu\'aucune ressource n\'est supprimée');
});

test('les assets sont versionnés : le navigateur ne servira pas l\'ancien écran', () => {
  const v = /academy\.js\?v=(\d+)/.exec(html);
  const c = /academy\.css\?v=(\d+)/.exec(html);
  assert.ok(v && c, 'les deux assets doivent porter un ?v=');
  assert.ok(Number(v[1]) >= 37, 'academy.js doit être re-versionné');
  assert.ok(Number(c[1]) >= 37, 'academy.css doit être re-versionné');
  assert.ok(/\.ac-out-grille/.test(css), 'la feuille porte les styles de la bibliothèque');
});
