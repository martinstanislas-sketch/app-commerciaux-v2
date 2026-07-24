'use strict';
// ============================================================================
//  RECAP — UI de l'onglet Rétention (admin). Orchestration seulement.
//
//  ÉVOLUTION (modèle par MOIS ABSOLU) :
//   • À partir du 2e mois, l'admin ne dépose QUE les 2 fichiers du mois à
//     clôturer : encaissements M + contrats M. Le M-1 est REPRIS automatiquement
//     de l'historique (le M-1 d'un mois = le M d'un mois déjà importé).
//   • Le fichier membres (clé -> Id_client Deciplus) est CUMULATIF et permanent :
//     un seul import suffit ; ensuite la zone est masquée derrière un bandeau.
//   • Écran Historique : mois clôturés, note réseau, notes par studio, graphe.
//
//  Le calcul et le parsing ne vivent PAS ici (modules purs, testés). RGPD : le
//  fichier membres est lu dans le navigateur ; seul le mapping clé -> Id_client
//  en ressort (jamais d'IBAN/RIB/contact).
// ============================================================================

const RecapUI = (function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const T = () => (window.localStorage.getItem('authToken') || '');
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + T() });
  const DECIPLUS = 'https://ginkgo-sport.deciplus.pro/nextgen/legacy?path=check.php?idj=';

  // ── État de la session ──────────────────────────────────────────────────────
  let mois = '', m1 = '';
  let inited = false;
  // Archives (lues en base pour le mois affiché)
  let archM = {};    // studio -> { encaissements:[lignes], contrats:[sig] }
  let archM1 = {};   // studio -> [lignes]   (encaissements M-1 archivés)
  let m1Info = {};   // studio -> uploaded_at (pour le bandeau de reprise)
  let dejaArchiveM = false;
  // Import club par club : l'admin choisit le club, aucune détection automatique.
  let clubs = [];          // clubs connus (menu déroulant)
  let clubCourant = '';    // club sélectionné -> tous les dépôts lui sont attribués
  // Dépôts en attente (fichiers glissés, pas encore archivés)
  let contratsParStudio = {}; // studio -> [{ cles, nom, prenom, date }]
  let resiliationsParStudio = {}; // studio -> [{ cle, nom, prenom }] (départs du mois)
  let fichiersEncM = [];   // [{ nom, cles:Set, lignes, studio }]
  let fichiersM1 = [];     // [{ nom, cles:Set, lignes, studio }] (dépôts M-1 ciblés/bulk)
  let bulkM1Ouvert = false;
  // Membres (mapping cumulatif renvoyé par le serveur)
  let membres = { map: [], stats: {}, total: 0 };
  let idxStudio = new Map(); // "studio|cle" -> id
  let idxGlobal = new Map(); // cle -> Set(id)
  // Résolus
  let studios = {};  // studio -> { encM, encM1, signataires, m1Source, m1Mois }
  let choix = {};    // studio -> { cle -> valeur }
  let besoin = {};   // studio -> { cle -> true }  (clients cochés « besoin d'infos »)
  let besoinNote = {}; // studio -> { cle -> texte }  (note libre par fiche « besoin d'infos »)
  let resultats = {};// studio -> retour de calculerStudio  (ou { pending:true })
  let chartHisto = null;
  let resClub = '';  // club affiché dans la zone de résultats (onglets)
  let kpiActive = 'disparus'; // KPI/catégorie affiché(e) : la carte cliquée pilote la liste
  let triCol = 'nom';         // colonne de tri du tableau clients : 'nom' | 'situ' | 'qual'
  let triSens = 1;            // 1 = croissant (A→Z), -1 = décroissant
  let besoinTri = 'club';     // tri de l'onglet « Besoin d'infos » : 'nom' | 'club' | 'cat'
  let besoinSens = 1;
  let importOuvert = false; // panneau d'import replié par défaut (consultation avant tout)
  const BESOIN_TAB = '__besoin__'; // onglet spécial (à droite des clubs) agrégeant les clients cochés
  const BESOIN_CAT = '_besoin';    // catégorie réservée en base (réutilise retention_choices)
  const BESOIN_NOTE_CAT = '_besoin_note'; // note libre par fiche (réutilise retention_choices)

  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#rec-mois').value) $('#rec-mois').value = moisParDefaut();
    mois = $('#rec-mois').value;
    m1 = RetentionParse.moisPrecedent(mois);
    switchView('analyse');
    charger();
  }

  // Mois par défaut = dernier mois calendaire révolu (le mois à clôturer).
  function moisParDefaut() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function moisLabel(ym, delta) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return ym || '';
    const d = new Date(a, m - 1 + (delta || 0), 1);
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  function wire() {
    $('#rec-mois').addEventListener('change', () => {
      mois = $('#rec-mois').value; m1 = RetentionParse.moisPrecedent(mois); charger();
    });
    $$('.rec-nav-btn').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('#rec-club').addEventListener('change', () => { clubCourant = $('#rec-club').value; majZones(); renderApercu(); });
    $('#rec-club-add-btn').addEventListener('click', ajouterClub);
    $('#rec-club-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterClub(); } });
    zone('encM', $('#rec-file-encM'), traiterEncM);
    zone('contrats', $('#rec-file-contrats'), traiterContrats);
    zone('resiliations', $('#rec-file-resiliations'), traiterResiliations);
    zone('membres', $('#rec-file-membres'), traiterMembres);
    $('#rec-calc').addEventListener('click', calculer);
    const help = $('#rec-help-open'); if (help) help.addEventListener('click', openHelp);
    const head = $('#rec-import-head');
    if (head) head.addEventListener('click', (e) => {
      if (e.target.closest('[data-toggle]')) { importOuvert = !importOuvert; renderImportBar(); }
      else if (e.target.closest('[data-modif]')) { importOuvert = true; renderImportBar(); }
    });
    wireAide();
  }

  // §2+§3 Barre d'import repliable : discrète par défaut, ✓ quand le mois est calculé.
  function renderImportBar() {
    const head = $('#rec-import-head'), body = $('#rec-import-body');
    if (!head || !body) return;
    body.hidden = !importOuvert;
    const nb = Object.keys(studios).length;
    const computed = Object.keys(resultats).some((s) => !resultats[s].pending);
    const capMois = () => { const s = moisLabel(mois, 0); return s.charAt(0).toUpperCase() + s.slice(1); };
    if (importOuvert) {
      head.innerHTML = '<button type="button" class="rec-import-toggle is-open" data-toggle><span class="ri-title">📂 Importer les données du mois</span><span class="ri-chev">▲</span></button>';
    } else if (computed) {
      head.innerHTML = '<div class="rec-import-done"><span class="ri-ok">✓ ' + esc(capMois()) + ' calculé</span><button type="button" class="rec-link" data-modif>Modifier les imports</button></div>';
    } else {
      const sum = nb ? (capMois() + ' • ' + nb + ' club' + (nb > 1 ? 's' : '')) : 'Aucun import pour ce mois';
      head.innerHTML = '<button type="button" class="rec-import-toggle" data-toggle><span class="ri-title">📂 Importer les données du mois</span><span class="ri-sum">' + esc(sum) + '</span><span class="ri-chev">▼</span></button>';
    }
  }

  // ── Clubs (menu déroulant, import club par club) ─────────────────────────────
  async function chargerClubs() {
    try { const d = await (await fetch('/api/retention/studios', { headers: H() })).json(); clubs = d.studios || []; }
    catch (_) { /* garde la liste courante */ }
    peuplerClubs();
  }
  function peuplerClubs() {
    const sel = $('#rec-club'); if (!sel) return;
    const known = [...new Set([...clubs, ...Object.keys(studios || {})])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
    sel.innerHTML = '<option value="">— choisis un club —</option>' + known.map((s) => '<option' + (s === clubCourant ? ' selected' : '') + '>' + esc(s) + '</option>').join('');
    if (clubCourant && known.includes(clubCourant)) sel.value = clubCourant; else clubCourant = sel.value;
  }
  function ajouterClub() {
    const inp = $('#rec-club-new'); const v = (inp.value || '').trim();
    if (!v) return;
    if (!clubs.includes(v)) clubs.push(v);
    clubCourant = v; inp.value = ''; peuplerClubs(); majZones(); renderApercu();
    msg('Club « ' + v +' » sélectionné. Dépose ses fichiers.', false);
  }
  function exigeClub() {
    if (clubCourant) return true;
    msg('Choisis d’abord le club (menu « Club en cours ») avant de déposer.', true);
    return false;
  }

  function switchView(v) {
    $('#rec-view-analyse').hidden = v !== 'analyse';
    $('#rec-view-historique').hidden = v !== 'historique';
    $$('.rec-nav-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.view === v));
    if (v === 'historique') renderHistorique();
  }

  // Câble une zone de dépôt existante (glisser/déposer + clic).
  function zone(nom, input, handler) { wireDrop(nom, handler, input); }
  function wireDrop(id, handler, inputEl) {
    const drop = $('#rec-drop-' + id);
    const input = inputEl || $('#rec-file-' + id);
    if (!drop || !input) return;
    const go = (files) => { if (files && files.length) Promise.resolve(handler([...files])).catch((e) => msg(e.message || 'Erreur de lecture.', true)); };
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => go(input.files));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('rec-drop-on'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('rec-drop-on'); }));
    drop.addEventListener('drop', (e) => go(e.dataTransfer.files));
  }

  const buf = (file) => file.arrayBuffer();
  function msg(txt, err) { const el = $('#rec-msg'); if (el) { el.textContent = txt || ''; el.className = 'rec-msg' + (err ? ' rec-msg-err' : ''); } }

  // ── PARSING DES DÉPÔTS (club par club : studio = clubCourant, sans devinette) ─
  // Regroupe des lignes datées par mois (colonne Date / date du contrat / résil.).
  function grouperParMois(items, dateOf) {
    const parMois = {};
    (items || []).forEach((it) => { const ym = RetentionParse.ymDeDate(dateOf(it)); if (ym) (parMois[ym] = parMois[ym] || []).push(it); });
    return parMois;
  }
  // Archive une base multi-mois (un fichier annuel réparti mois par mois).
  async function archiverMultiMois(club, type, parMois, libelle) {
    const moisPresents = Object.keys(parMois).sort();
    const imports = moisPresents.map((ym) => ({ studio: club, mois: ym, type, contenu: parMois[ym] }));
    try {
      await fetch('/api/retention/imports', { method: 'POST', headers: H(), body: JSON.stringify({ imports }) });
      const n = Object.values(parMois).reduce((a, l) => a + l.length, 0);
      await charger();
      msg('✅ ' + libelle + ' ' + club + ' : ' + moisPresents.length + ' mois répartis (' + moisLabel(moisPresents[0], 0) + ' → ' + moisLabel(moisPresents[moisPresents.length - 1], 0) + ') · ' + n + ' ligne(s).', false);
    } catch (_) { msg('Import multi-mois impossible (réseau).', true); }
  }

  async function traiterEncM(files) {
    if (!exigeClub()) return;
    const club = clubCourant;
    const perFichier = [];
    let toutes = [];
    for (const f of files) {
      const lignes = RetentionParse.mapEncaissements(RetentionParse.lireTabulaire(await buf(f)));
      perFichier.push({ nom: f.name, lignes }); toutes = toutes.concat(lignes);
    }
    const parMois = grouperParMois(toutes, (l) => l.date);
    const moisPresents = Object.keys(parMois);
    // Fichier annuel (plusieurs mois) -> réparti et archivé mois par mois.
    if (moisPresents.length > 1) { await archiverMultiMois(club, 'encaissements', parMois, 'Encaissements'); return; }
    // Mono-mois : édition live + garde (le fichier doit couvrir le mois clôturé).
    const ymf = moisPresents[0];
    if (ymf && ymf !== mois) { msg('Ce fichier couvre ' + moisLabel(ymf, 0) + ', or le mois à clôturer est ' + moisLabel(mois, 0) + '.', true); return; }
    const lus = perFichier.map((x) => ({ nom: x.nom, cles: new Set(x.lignes.map((l) => l.cle)), lignes: x.lignes, studio: club }));
    fichiersEncM = dedupFichiers(fichiersEncM.concat(lus));
    $('#rec-info-encM').textContent = club + ' · ' + lus.length + ' fichier(s)';
    assembler();
    await autoEnregistrer('Encaissements ' + club);
  }
  async function traiterContrats(files) {
    if (!exigeClub()) return;
    const club = clubCourant;
    const noms = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) { const l = await RetentionParse.lireContratsZip(await buf(f)); noms.push(...l); }
      else if (/\.pdf$/i.test(f.name)) noms.push(f.name);
    }
    // Studio = club choisi ; on garde les signataires (avec leur date de signature).
    const sigs = Object.values(RetentionParse.mapContrats(noms)).flat();
    const parMois = grouperParMois(sigs, (s) => s.date);
    const moisPresents = Object.keys(parMois);
    // Zip annuel (plusieurs mois de signature) -> réparti mois par mois.
    if (moisPresents.length > 1) {
      Object.keys(parMois).forEach((ym) => { parMois[ym] = dedupSig(parMois[ym]); });
      await archiverMultiMois(club, 'contrats', parMois, 'Contrats'); return;
    }
    // Mono-mois : rattaché au mois clôturé (comportement existant).
    contratsParStudio[club] = dedupSig((contratsParStudio[club] || []).concat(sigs));
    $('#rec-info-contrats').textContent = club + ' · ' + contratsParStudio[club].length + ' contrat(s)';
    assembler();
    await autoEnregistrer('Contrats ' + club);
  }
  function dedupSig(list) {
    const seen = new Set(); const out = [];
    list.forEach((s) => { const k = (s.cles || []).slice().sort().join('#'); if (seen.has(k)) return; seen.add(k); out.push(s); });
    return out;
  }
  // Résiliations du club : réparties par mois de résiliation (mono ou multi-mois).
  async function traiterResiliations(files) {
    if (!exigeClub()) return;
    const club = clubCourant;
    let all = [];
    for (const f of files) all = all.concat(RetentionParse.mapResiliations(RetentionParse.lireTabulaire(await buf(f)))); // sans filtre -> ym par ligne
    const parMois = grouperParMois(all, (r) => r.ym);
    const moisPresents = Object.keys(parMois);
    if (!moisPresents.length) { msg('Aucune résiliation datée dans ce fichier.', false); return; }
    // On ne garde que cle/nom/prenom dans le contenu archivé.
    Object.keys(parMois).forEach((ym) => { parMois[ym] = parMois[ym].map((r) => ({ cle: r.cle, nom: r.nom, prenom: r.prenom })); });
    await archiverMultiMois(club, 'resiliations', parMois, 'Résiliations');
  }
  // §A3 : encaissements M-1 déposés (par studio ciblé, ou en bulk tous studios).
  async function traiterM1(files, studioForce) {
    const lus = [];
    for (const f of files) {
      const lignes = RetentionParse.mapEncaissements(RetentionParse.lireTabulaire(await buf(f)));
      const ymf = RetentionParse.moisDeLignes(lignes);
      // On EXIGE le vrai M-1 : jamais de repli sur un autre mois (§A3, mois sauté).
      if (ymf && ymf !== m1) { msg('Ce fichier couvre ' + moisLabel(ymf, 0) + ', or on attend ' + moisLabel(m1, 0) + ' (mois précédent).', true); return; }
      lus.push({ nom: f.name, cles: new Set(lignes.map((l) => l.cle)), lignes, studio: studioForce || null });
    }
    fichiersM1 = dedupFichiers(fichiersM1.concat(lus));
    assembler();
    await autoEnregistrer('Encaissements ' + moisLabel(m1, 0) + (studioForce ? ' — ' + studioForce : ''));
  }
  async function traiterMembres(files) {
    if (!exigeClub()) return;
    const club = clubCourant;
    const entries = [];
    for (const f of files) {
      const map = RetentionParse.mapMembres(RetentionParse.lireTabulaire(await buf(f))); // clé -> Id_client
      // Le studio est le club choisi (import club par club) : aucune devinette.
      Object.keys(map).forEach((cle) => entries.push({ cle, id: map[cle], studio: club }));
    }
    if (!entries.length) { msg('Aucun identifiant lu dans ce fichier membres.', true); return; }
    try {
      const r = await (await fetch('/api/retention/membres', { method: 'POST', headers: H(), body: JSON.stringify({ entries }) })).json();
      if (r && r.membres) { membres = r.membres; construireIndexMembres(); }
      $('#rec-info-membres').textContent = (r ? (r.ajouts + ' ajout(s), ' + r.maj + ' m.à.j.') : '') + ' · ' + nb(membres.total) + ' au total';
      renderBanners(); render();
    } catch (_) { msg('Import membres impossible (réseau).', true); }
  }
  function dedupFichiers(list) {
    const vus = new Set(); const out = [];
    list.forEach((f) => { const id = (f.studio || '?') + '#' + [...f.cles].sort().join('#'); if (vus.has(id)) return; vus.add(id); out.push(f); });
    return out;
  }

  // ── ASSEMBLAGE : archives + dépôts -> studios résolus, M-1 repris ───────────
  function assembler() {
    const deposeEncM = groupLignes(fichiersEncM);
    const deposeM1 = groupLignes(fichiersM1);
    studios = {};
    const noms = new Set([...Object.keys(archM), ...Object.keys(deposeEncM), ...Object.keys(contratsParStudio), ...Object.keys(resiliationsParStudio)]);
    noms.forEach((s) => {
      const encM = deposeEncM[s] || (archM[s] && archM[s].encaissements) || [];
      const signataires = contratsParStudio[s] || (archM[s] && archM[s].contrats) || [];
      const resiliations = resiliationsParStudio[s] || (archM[s] && archM[s].resiliations) || [];
      let encM1 = [], src = 'manquant';
      if (deposeM1[s]) { encM1 = deposeM1[s]; src = 'depose'; }
      else if (archM1[s]) { encM1 = archM1[s]; src = 'auto'; }
      studios[s] = { encM, encM1, signataires, resiliations, m1Source: src, m1Mois: m1 };
    });
    peuplerClubs(); // reflète les studios apparus (dépôts/archives) dans le menu
    renderDetection();
    renderBanners();
    renderManquants();
    majZones();
    renderApercu();
    recalcTout();
    renderImportBar();
  }
  function groupLignes(arr) {
    const out = {};
    arr.forEach((f) => { if (!f.studio) return; (out[f.studio] = out[f.studio] || []).push(...f.lignes); });
    return out;
  }

  // ── AVANCEMENT DES IMPORTS ───────────────────────────────────────────────────
  // Statut d'un club pour le mois affiché : encaissements / contrats / membres.
  function statutClub(club) {
    const encN = fichiersEncM.filter((f) => f.studio === club).reduce((n, f) => n + f.lignes.length, 0)
      || ((archM[club] && archM[club].encaissements) || []).length;
    const conN = (contratsParStudio[club] || []).length;
    const resN = (resiliationsParStudio[club] || (archM[club] && archM[club].resiliations) || []).length;
    return { enc: encN > 0, encN, con: conN > 0, conN, res: resN > 0, resN, mem: !!(membres.stats && membres.stats[club]) };
  }
  // Replie une zone de dépôt en carte compacte quand son fichier est importé ;
  // la laisse en grand (dashed) tant qu'elle est vide -> l'action restante saute aux yeux.
  function majZones() {
    const st = clubCourant ? statutClub(clubCourant) : { enc: false, con: false, res: false };
    toggleZone('encM', st.enc, st.enc ? 'Encaissements — ' + st.encN + ' ligne' + (st.encN > 1 ? 's' : '') : '');
    toggleZone('contrats', st.con, st.con ? 'Contrats — ' + st.conN + ' signataire' + (st.conN > 1 ? 's' : '') : '');
    toggleZone('resiliations', st.res, st.res ? 'Résiliations — ' + st.resN + ' départ' + (st.resN > 1 ? 's' : '') : '');
  }
  function toggleZone(zone, done, label) {
    const z = $('#rec-zone-' + zone); if (!z) return;
    z.classList.toggle('is-done', !!done);
    const card = $('#rec-done-' + zone);
    if (done) {
      card.innerHTML = '<span class="rec-done-ic">✓</span><span class="rec-done-txt">' + esc(label) + '</span>'
        + '<button type="button" class="rec-link rec-done-rep">Remplacer</button>';
      card.querySelector('.rec-done-rep').addEventListener('click', () => $('#rec-file-' + zone).click());
    } else { card.innerHTML = ''; }
  }
  // Tableau « club -> ce qui est importé / ce qui manque » (coup d'œil global).
  function renderApercu() {
    const host = $('#rec-apercu'); if (!host) return;
    const noms = [...new Set([...clubs, ...Object.keys(studios || {})])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
    if (!noms.length) { host.innerHTML = ''; return; }
    const cell = (ok) => ok ? '<span class="rec-ap-ok">✓</span>' : '<span class="rec-ap-ko">○</span>';
    const cellOpt = (ok) => ok ? '<span class="rec-ap-ok">✓</span>' : '<span class="rec-ap-opt">–</span>';
    const rows = noms.map((s) => {
      const st = statutClub(s);
      const restant = !(st.enc && st.con); // résiliations = optionnel, ne bloque pas
      return '<tr data-club="' + esc(s) + '"' + (s === clubCourant ? ' class="is-cur"' : '') + '>'
        + '<td class="rec-ap-club">' + esc(s) + (restant ? ' <em>à compléter</em>' : '') + '</td>'
        + '<td>' + cell(st.enc) + '</td><td>' + cell(st.con) + '</td><td>' + cellOpt(st.res) + '</td><td>' + cell(st.mem) + '</td></tr>';
    }).join('');
    host.innerHTML = '<h3 class="rec-h3">Avancement · ' + moisLabel(mois, 0) + ' <small>(clique un club pour le sélectionner)</small></h3>'
      + '<table class="rec-ap-table"><thead><tr><th>Club</th><th>Encaiss.</th><th>Contrats</th><th>Résil.</th><th>Membres</th></tr></thead><tbody>' + rows + '</tbody></table>';
    host.querySelectorAll('tr[data-club]').forEach((tr) => tr.addEventListener('click', () => {
      clubCourant = tr.dataset.club; peuplerClubs(); majZones(); renderApercu();
    }));
  }

  // ── BANDEAUX (reprise M-1, membres) ─────────────────────────────────────────
  function renderBanners() {
    const bM1 = $('#rec-banner-m1');
    const autos = Object.keys(studios).filter((s) => studios[s].m1Source === 'auto');
    if (autos.length) {
      const dates = autos.map((s) => m1Info[s]).filter(Boolean).sort();
      const d = dates.length ? ' · importé le ' + esc(fmtDate(dates[dates.length - 1])) : '';
      bM1.hidden = false;
      bM1.innerHTML = '✅ Mois précédent repris automatiquement : <b>' + esc(moisLabel(m1, 0)) + '</b> — '
        + autos.length + ' studio' + (autos.length > 1 ? 's' : '') + d
        + ' <button type="button" class="rec-link" id="rec-remplacer-m1">Remplacer</button>';
      $('#rec-remplacer-m1').addEventListener('click', () => { bulkM1Ouvert = !bulkM1Ouvert; renderManquants(); });
    } else { bM1.hidden = true; }

    const bMe = $('#rec-banner-membres'), zMe = $('#rec-zone-membres');
    if (membres.total > 0) {
      const d = derniereDateMembres();
      bMe.hidden = false;
      bMe.innerHTML = '👥 Membres : <b>' + nb(membres.total) + '</b> identifiants connus' + (d ? ' — dernier import le ' + esc(fmtDate(d)) : '')
        + ' <button type="button" class="rec-link" id="rec-maj-membres">Mettre à jour</button>';
      zMe.hidden = true;
      $('#rec-maj-membres').addEventListener('click', () => { zMe.hidden = !zMe.hidden; });
    } else { bMe.hidden = true; zMe.hidden = false; }
  }
  function derniereDateMembres() {
    let d = '';
    Object.values(membres.stats || {}).forEach((s) => { if (s.dernier > d) d = s.dernier; });
    return d;
  }

  // §A3 Clubs sans M-1 archivé : dépôt ciblé par club (jamais de repli sur un
  // autre mois). Import club par club -> une zone par club concerné.
  function renderManquants() {
    const host = $('#rec-m1-manquants');
    const manquants = Object.keys(studios).filter((s) => studios[s].m1Source === 'manquant');
    const autos = Object.keys(studios).filter((s) => studios[s].m1Source !== 'manquant');
    let html = '';
    manquants.forEach((s) => {
      const id = 'm1-' + cleId(s);
      html += '<div class="rec-manq">'
        + bandeau('warn', '⚠️ <b>' + esc(s) + '</b> : aucun encaissement archivé pour ' + esc(moisLabel(m1, 0)) + '. Dépose le fichier de ' + esc(moisLabel(m1, 0)) + ' pour ce club.')
        + dropHTML(id, 'Encaissements ' + moisLabel(m1, 0) + ' — ' + s)
        + '</div>';
    });
    // [Remplacer] : rouvrir un dépôt M-1 pour les clubs déjà repris automatiquement.
    if (bulkM1Ouvert && autos.length) {
      html += bandeau('info', 'Remplacer le mois précédent d’un club (dépôt ciblé) :');
      autos.forEach((s) => { html += '<div class="rec-manq">' + dropHTML('m1-' + cleId(s), 'Remplacer ' + moisLabel(m1, 0) + ' — ' + s) + '</div>'; });
    }
    host.innerHTML = html;
    [...manquants, ...(bulkM1Ouvert ? autos : [])].forEach((s) => {
      const id = 'm1-' + cleId(s);
      if ($('#rec-drop-' + id)) wireDrop(id, (files) => traiterM1(files, s));
    });
  }
  const bandeau = (type, html) => '<div class="rec-banner rec-banner-' + type + '">' + html + '</div>';
  function dropHTML(id, label) {
    return '<div class="rec-zone rec-zone-inline">'
      + '<div class="rec-drop" id="rec-drop-' + id + '"><span>' + esc(label) + '</span></div>'
      + '<input type="file" id="rec-file-' + id + '" accept=".xlsx,.xls" multiple style="display:none">'
      + '<div class="rec-zone-info" id="rec-info-' + id + '"></div></div>';
  }
  const cleId = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  // ── CALCUL ───────────────────────────────────────────────────────────────────
  function recalcStudio(s) {
    const st = studios[s];
    if (st.m1Source === 'manquant') { resultats[s] = { pending: true, m1Mois: st.m1Mois }; return; }
    resultats[s] = Retention.calculerStudio({ encM1: st.encM1, encM: st.encM, signataires: st.signataires, resiliations: st.resiliations, choix: choix[s] || {} });
  }
  function recalcTout() { resultats = {}; Object.keys(studios).forEach(recalcStudio); render(); }

  async function calculer() {
    assembler();
    if (!Object.keys(studios).length) { msg('Dépose les encaissements et les contrats du mois.', true); return; }
    recalcTout();
    try {
      await persister();
      const suiv = await moisSuivantArchive();
      importOuvert = false; // une fois calculé, on replie l'import et on montre les résultats
      await charger(); // recharge l'état canonique (dépôts -> archives)
      msg('✅ ' + moisLabel(mois, 0) + ' calculé et enregistré.' + (suiv ? ' ↻ ' + moisLabel(suiv, 0) + ' recalculé (son mois précédent a changé).' : ''), false);
    } catch (_) { msg('Enregistrement impossible (réseau).', true); }
  }
  // Sauvegarde immédiate à chaque dépôt : rien n'est perdu si on change de mois
  // ou de club avant d'avoir cliqué « Calculer ».
  async function autoEnregistrer(label) {
    try { await persister(); msg((label || 'Fichier') + ' — enregistré automatiquement ✓', false); }
    catch (_) { msg('⚠️ Sauvegarde réseau impossible — les données restent à l’écran, réessaie ou clique Calculer.', true); }
  }
  async function persister() {
    const imports = [];
    const deposeEncM = groupLignes(fichiersEncM);
    const deposeM1 = groupLignes(fichiersM1);
    Object.keys(deposeEncM).forEach((s) => imports.push({ studio: s, mois, type: 'encaissements', contenu: deposeEncM[s] }));
    Object.keys(contratsParStudio).forEach((s) => imports.push({ studio: s, mois, type: 'contrats', contenu: contratsParStudio[s] }));
    Object.keys(resiliationsParStudio).forEach((s) => { if (resiliationsParStudio[s].length) imports.push({ studio: s, mois, type: 'resiliations', contenu: resiliationsParStudio[s] }); });
    Object.keys(deposeM1).forEach((s) => imports.push({ studio: s, mois: m1, type: 'encaissements', contenu: deposeM1[s] }));
    if (!imports.length) return; // rien de neuf (mois déjà archivé, aucune modif)
    await fetch('/api/retention/imports', { method: 'POST', headers: H(), body: JSON.stringify({ imports }) });
  }
  // §A4 : re-déposer un mois recalcule aussi le mois suivant (son M-1 a changé).
  async function moisSuivantArchive() {
    if (!Object.keys(groupLignes(fichiersEncM)).length) return null; // pas de nouvel encaissement -> pas de cascade
    try {
      const { mois: liste } = await (await fetch('/api/retention/mois', { headers: H() })).json();
      const [a, m] = mois.split('-').map(Number);
      const suiv = new Date(a, m, 1);
      const ymSuiv = suiv.getFullYear() + '-' + String(suiv.getMonth() + 1).padStart(2, '0');
      return (liste || []).some((x) => x.mois === ymSuiv) ? ymSuiv : null;
    } catch (_) { return null; }
  }

  // ── RENDU RÉSULTATS : onglets clubs -> KPI -> sous-onglets -> tableau ────────
  function render() { renderClubTabs(); renderClubPanel(); }
  const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + ' %');

  // Icônes discrètes (SVG monochrome, hérite de currentColor) pour les KPI.
  const ICONS = {
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    trend: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    plus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  };
  const ico = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || '') + '</svg>';

  // ── AIDE CONTEXTUELLE : définition / calcul / importance / actions ──────────
  const AIDE = {
    clients: { titre: 'Clients du mois précédent', def: "Clients ayant réellement payé le mois précédent (M-1). C'est la base de référence de la rétention.", calcul: 'Clients avec un encaissement net positif au mois M-1.', importance: "Point de départ du calcul : on mesure combien de ces clients sont encore là ce mois-ci.", actions: [] },
    fideles: { titre: 'Fidèles', def: 'Clients présents le mois précédent qui ont de nouveau payé ce mois-ci, au même tarif.', calcul: 'Présents en M-1 ET net positif en M, sans baisse de tarif.', importance: 'Cœur de la rétention : plus ils sont nombreux, meilleure est la note.', actions: ['Entretenir la relation (suivi coach, fidélisation).', 'Repérer les profils à fort potentiel de parrainage.'] },
    disparus: { titre: 'Disparus', def: 'Clients présents le mois précédent mais absents ce mois-ci.', calcul: 'Présents au mois M-1 mais net nul ou négatif au mois M.', importance: "Mesure les pertes de clients et permet d'agir vite.", actions: ["Vérifier s'il y a eu une résiliation.", 'Contrôler un éventuel impayé.', 'Identifier un changement de formule.', 'Corriger une erreur de saisie si nécessaire.'] },
    impayes: { titre: 'Impayés', def: 'Disparus dont un prélèvement a été rejeté : client souvent récupérable.', calcul: 'Disparu avec au moins une ligne de décaissement (rejet) au mois M.', importance: 'Perte fréquemment récupérable : une relance peut sauver le client.', actions: ['Relancer le client pour régulariser.', 'Vérifier le motif du rejet (RIB, provision).', 'Reprogrammer un prélèvement.'] },
    baisses: { titre: 'Tarifs en baisse', def: "Clients toujours présents mais qui paient moins cher qu'avant.", calcul: 'Présents en M-1 et M, avec prix unitaire ET montant net en baisse.', importance: 'Signale une érosion du panier moyen, à surveiller.', actions: ["Vérifier si c'est un arrangement accordé.", 'Confirmer que la baisse est justifiée.', 'Qualifier « Sous contrôle » ou « Arrangement ».'] },
    nouveauxSignes: { titre: 'Nouveaux signés', def: 'Nouveaux clients comptés positivement ce mois-ci.', calcul: 'Contrats signés et payés au mois M (+ non payés qualifiés « décalage »).', importance: 'Compensent les départs et participent à la note de rétention.', actions: ['Confirmer le paiement du 1er mois.', 'Assurer un bon démarrage (onboarding).'] },
    nouveauxNonPayes: { titre: 'Nouveaux non payés', def: "Contrats signés ce mois-ci mais dont le paiement n'est pas encore constaté.", calcul: "Signataire d'un contrat au mois M sans encaissement net positif.", importance: "Distingue un simple décalage de paiement d'une vraie anomalie.", actions: ['Vérifier si le 1er prélèvement arrive plus tard (décalage).', 'Contrôler une anomalie (mandat, saisie).', 'Qualifier « Décalage » ou « Anomalie ».'] },
    aqualifier: { titre: 'À qualifier', def: 'Clients ayant payé ce mois-ci sans être ni dans la base M-1 ni parmi les nouveaux signataires.', calcul: 'Net positif au mois M, hors base M-1 et hors signataires.', importance: 'Cas ambigus à trancher pour fiabiliser la note.', actions: ['Client suspendu qui revient → « Suspendu ».', 'Nouveau non rattaché à un contrat → « Nouveau ».', 'Achat de séances hors abonnement → « Pack de séances ».'] },
    preavis: { titre: 'Résilié (préavis)', def: 'Clients qui ont résilié mais qui paient encore leur préavis ce mois-ci.', calcul: 'Présents dans le fichier résiliations ET net > 0 ce mois-ci.', importance: "Neutralisés : ni fidèles, ni perdus — ils ne comptent PAS dans la note (hors dénominateur) tant qu'ils paient. Ils seront comptés comme départ, une seule fois, au mois où le prélèvement disparaît. Évite le double comptage.", actions: ['Anticiper la relance de rétention pendant le préavis.', 'Vérifier la date de fin de contrat.'] },
  };
  const GLOSSAIRE = [
    ['Impayé', 'Prélèvement rejeté ce mois-ci — client récupérable, compté comme perte.'],
    ['Résilié', 'Départ confirmé (contrat résilié) — compté comme perte.'],
    ['Parti', 'Absent sans impayé ni résiliation formelle — compté comme perte.'],
    ['Sous contrôle', 'Baisse de tarif maîtrisée/temporaire — comptée comme fidèle.'],
    ['Arrangement', 'Baisse de tarif accordée — comptée comme perte partielle.'],
    ['Décalage', 'Paiement en léger retard — compté comme nouveau payé.'],
    ['Anomalie', 'Incohérence à corriger — non comptée au numérateur.'],
    ['Suspendu', 'Client en pause encore rattaché — compté comme actif.'],
    ['Nouveau', 'Nouveau client à rattacher — compté comme actif.'],
    ['Pack de séances', 'Achat hors abonnement mensuel — EXCLU du calcul.'],
  ];
  const NOTE_TXT = "Note d'un club = (fidèles + nouveaux payés + « à qualifier » actifs) ÷ (clients M-1 + nouveaux payés + anomalies + « à qualifier » actifs). Les packs de séances et les exclusions ne comptent pas. La note réseau est la moyenne de tous les clubs, pondérée par leur taille.";
  const aideBtn = (key) => AIDE[key] ? '<span class="rec-info" data-aide="' + key + '" role="button" tabindex="0" aria-label="Aide : ' + esc(AIDE[key].titre) + '">' + ico('info') + '</span>' : '';

  // Infobulle (survol desktop / clic mobile), refermable auto.
  let tipTrigger = null, tipPinned = false;
  function ensureTip() { let el = $('#rec-tip'); if (!el) { el = document.createElement('div'); el.id = 'rec-tip'; el.className = 'rec-tip'; document.body.appendChild(el); } return el; }
  function tipHTML(a) {
    return '<div class="rec-tip-t">' + esc(a.titre) + '</div><p class="rec-tip-def">' + esc(a.def) + '</p>'
      + '<div class="rec-tip-row"><span>Calcul</span>' + esc(a.calcul) + '</div>'
      + '<div class="rec-tip-row"><span>Pourquoi c\'est important</span>' + esc(a.importance) + '</div>'
      + (a.actions && a.actions.length ? '<div class="rec-tip-row"><span>Actions</span><ul>' + a.actions.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '');
  }
  function showTip(trigger) {
    const a = AIDE[trigger.dataset.aide]; if (!a) return;
    const el = ensureTip(); tipTrigger = trigger; el.innerHTML = tipHTML(a);
    el.style.left = '0px'; el.style.top = '0px';
    const r = trigger.getBoundingClientRect(), w = Math.min(el.offsetWidth || 320, 320), h = el.offsetHeight || 0;
    let left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h + 8 > window.innerHeight && r.top - h - 8 > 0) top = r.top - h - 8;
    el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
    el.classList.add('is-open');
  }
  function hideTip() { const el = $('#rec-tip'); if (el) el.classList.remove('is-open'); tipTrigger = null; }
  function wireAide() {
    document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-aide]'); if (t && !tipPinned) showTip(t); });
    document.addEventListener('mouseout', (e) => { const t = e.target.closest && e.target.closest('[data-aide]'); if (t && !tipPinned && !t.contains(e.relatedTarget)) hideTip(); });
    document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('[data-aide]');
      if (t) { e.preventDefault(); e.stopPropagation(); if (tipPinned && tipTrigger === t) { tipPinned = false; hideTip(); } else { tipPinned = true; showTip(t); } return; }
      if (tipPinned && !(e.target.closest && e.target.closest('#rec-tip'))) { tipPinned = false; hideTip(); }
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { tipPinned = false; hideTip(); closeHelp(); } });
    window.addEventListener('scroll', () => { if (!tipPinned) hideTip(); }, true);
  }

  // Fenêtre « Comment sont calculés les indicateurs ? »
  function ensureHelpModal() {
    let o = $('#rec-help-modal'); if (o) return o;
    o = document.createElement('div'); o.id = 'rec-help-modal'; o.className = 'rec-modal';
    o.innerHTML = '<div class="rec-modal-card" role="dialog" aria-modal="true"><button type="button" class="rec-modal-x" aria-label="Fermer">×</button><div class="rec-modal-body"></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o || (e.target.closest && e.target.closest('.rec-modal-x'))) closeHelp(); });
    return o;
  }
  function buildHelpHTML() {
    const ordre = ['clients', 'fideles', 'disparus', 'impayes', 'baisses', 'nouveauxSignes', 'nouveauxNonPayes', 'aqualifier'];
    const section = (k) => { const a = AIDE[k]; return '<section class="rec-help-item"><h3>' + esc(a.titre) + '</h3><p>' + esc(a.def) + '</p>'
      + '<div class="rec-help-meta"><b>Calcul</b>' + esc(a.calcul) + '</div>'
      + '<div class="rec-help-meta"><b>Pourquoi</b>' + esc(a.importance) + '</div>'
      + (a.actions && a.actions.length ? '<div class="rec-help-meta"><b>Actions</b><ul>' + a.actions.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') + '</section>'; };
    return '<h2 class="rec-help-h2">Comment sont calculés les indicateurs ?</h2>'
      + '<p class="rec-help-sub">Chaque indicateur du tableau : définition, calcul, utilité et actions attendues — pour comprendre le tableau sans formation.</p>'
      + ordre.map(section).join('')
      + '<section class="rec-help-item"><h3>La note de rétention</h3><p>' + esc(NOTE_TXT) + '</p></section>'
      + '<section class="rec-help-item"><h3>Qualifications possibles</h3><ul class="rec-help-gloss">' + GLOSSAIRE.map((g) => '<li><b>' + esc(g[0]) + '</b> — ' + esc(g[1]) + '</li>').join('') + '</ul></section>';
  }
  function openHelp() { const o = ensureHelpModal(); o.querySelector('.rec-modal-body').innerHTML = buildHelpHTML(); o.classList.add('is-open'); }
  function closeHelp() { const o = $('#rec-help-modal'); if (o) o.classList.remove('is-open'); }

  // Ordre d'affichage des clubs (réseau My Coach), les autres à la suite.
  const ORDRE = ['Lille', 'Marcq', 'Wasquehal', 'Boulogne', 'Neuilly', 'Levallois'];
  // Clubs classés par % de rétention CROISSANT (plus faible à gauche, meilleur à
  // droite). Les clubs sans note (en attente M-1) sont renvoyés en fin de liste.
  // Recalculé à chaque render -> se met à jour au changement de données/mois.
  function clubsResultats() {
    const cles = Object.keys(resultats);
    const noteDe = (s) => { const r = resultats[s]; return (r && !r.pending && typeof r.note === 'number') ? r.note : Infinity; };
    return cles.sort((a, b) => (noteDe(a) - noteDe(b)) || a.localeCompare(b, 'fr'));
  }
  const normClub = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  // §1 Rangée d'onglets clubs (nom, note, disparus, à qualifier) + note réseau.
  function renderClubTabs() {
    const host = $('#rec-recap');
    const clubsCalc = clubsResultats();
    if (!clubsCalc.length) { host.innerHTML = ''; return; }
    // Conserve la ville sélectionnée d'un mois à l'autre : match exact d'abord,
    // puis tolérant (accents/casse/espaces) pour survivre aux variantes de nom.
    if (resClub !== BESOIN_TAB && (!resClub || !resultats[resClub])) {
      const garde = resClub && clubsCalc.find((s) => normClub(s) === normClub(resClub));
      resClub = garde || clubsCalc[0];
    }
    const reseau = Retention.noteReseau(clubsCalc.filter((s) => !resultats[s].pending).map((s) => resultats[s]));
    const tabs = clubsCalc.map((s) => {
      const r = resultats[s];
      const actif = s === resClub ? ' is-active' : '';
      if (r.pending) {
        return '<button type="button" class="rec-club-tab is-pending' + actif + '" data-club="' + esc(s) + '">'
          + '<span class="rec-club-nom">' + esc(s) + '</span><span class="rec-club-note">⏳</span>'
          + '<span class="rec-club-sub">en attente M-1</span></button>';
      }
      const vert = clubTraite(s) ? ' is-done' : ''; // club entièrement traité -> liseré vert
      return '<button type="button" class="rec-club-tab' + actif + vert + '" data-club="' + esc(s) + '">'
        + '<span class="rec-club-nom">' + esc(s) + '</span>'
        + '<span class="rec-club-note">' + pct(r.note) + '</span>'
        + '<span class="rec-club-sub">' + (r.disparus || []).length + ' disparus · ' + r.aQualifier.length + ' à qualifier</span>'
        + '</button>';
    }).join('');
    // Onglet spécial « Besoin d'infos » à droite des clubs (agrégé tous clubs).
    const nBesoin = besoinListe().length;
    const besoinTab = '<button type="button" class="rec-club-tab rec-club-besoin' + (resClub === BESOIN_TAB ? ' is-active' : '') + '" data-club="' + BESOIN_TAB + '">'
      + '<span class="rec-club-nom">🔎 Besoin d\'infos</span>'
      + '<span class="rec-club-note">' + nBesoin + '</span>'
      + '<span class="rec-club-sub">' + (nBesoin > 1 ? 'clients à revoir' : 'client à revoir') + '</span></button>';
    const clos = moisTraite(); // tous les clubs traités -> récap mensuel vert (« clôturé »)
    host.innerHTML = '<div class="rec-res-head"><h3 class="rec-h3">Résultats · ' + moisLabel(mois, 0) + '</h3>'
      + '<span class="rec-reseau-badge' + (clos ? ' is-done' : '') + '">Réseau <b>' + pct(reseau) + '</b>'
      + (clos ? '<span class="rec-mois-clos">✓ Mois clôturé</span>' : '') + '</span></div>'
      + '<div class="rec-club-tabs">' + tabs + besoinTab + '</div>';
    host.querySelectorAll('.rec-club-tab').forEach((t) => t.addEventListener('click', () => {
      resClub = t.dataset.club; renderClubTabs(); renderClubPanel();
    }));
  }

  // §B5 Résolution de l'Id_client : studio courant, puis global ; homonyme -> null.
  function resoudreId(cle, studio) {
    const local = idxStudio.get(studio + '|' + cle);
    if (local) return local;
    const set = idxGlobal.get(cle);
    if (set && set.size === 1) return [...set][0];
    return null; // absent, ou plusieurs ids (homonymes) -> pas de lien
  }
  function construireIndexMembres() {
    idxStudio = new Map(); idxGlobal = new Map();
    (membres.map || []).forEach(({ cle, id, studio }) => {
      idxStudio.set(studio + '|' + cle, id);
      const set = idxGlobal.get(cle) || new Set(); set.add(id); idxGlobal.set(cle, set);
    });
  }
  function nomLien(s, cle, nom, prenom) {
    const id = resoudreId(cle, s);
    const label = esc(((prenom || '') + ' ' + (nom || '')).trim() || cle);
    if (id) return '<a href="' + DECIPLUS + encodeURIComponent(id) + '" target="_blank" rel="noopener">' + label + '</a>';
    // §B4 : sans id Deciplus -> nom atténué + marqueur repérable (aucun lien).
    return '<span class="rec-nolink" title="Sans lien Deciplus (identifiant inconnu)">' + label + ' <span class="rec-nolink-mk">⚠</span></span>';
  }

  const RESET_VAL = '__reset__'; // option « Réinitialiser » du menu de qualification
  function menu(s, cle, cat, options, courant) {
    // État vide : placeholder sélectionné -> choisir une vraie option déclenche « change ».
    const has = options.some((v) => v.val === courant);
    const ph = has ? '' : '<option value="" disabled selected>— choisir —</option>';
    const o = options.map((v) => '<option value="' + v.val + '"' + (v.val === courant ? ' selected' : '') + '>' + esc(v.lbl) + '</option>').join('');
    // Si déjà qualifié : option pour remettre la fiche à zéro (état initial vide).
    const reset = has ? '<option value="' + RESET_VAL + '">↺ Réinitialiser</option>' : '';
    return '<select class="rec-menu" data-s="' + esc(s) + '" data-cle="' + esc(cle) + '" data-cat="' + cat + '">' + ph + o + reset + '</select>';
  }
  const OPT = {
    baisse: [{ val: 'sous_controle', lbl: 'Sous contrôle' }, { val: 'arrangement', lbl: 'Arrangement' }],
    nouveauNonPaye: [{ val: 'decalage', lbl: 'OK' }, { val: 'anomalie', lbl: 'Anomalie' }],
    aQualifier: [{ val: 'suspendu', lbl: 'Suspendu' }, { val: 'nouveau', lbl: 'Nouveau' }, { val: 'pack', lbl: 'Pack de séance' }],
    disparu: [{ val: 'impaye', lbl: 'Impayé' }, { val: 'resilie', lbl: 'Résilié' }, { val: 'anomalie', lbl: 'Anomalie' }, { val: 'pack', lbl: 'Pack de séance' }],
    preavis: [{ val: 'ok', lbl: 'OK' }, { val: 'ctx', lbl: 'Ctx' }],
  };
  const DEF = { baisse: 'arrangement', nouveauNonPaye: 'anomalie', aQualifier: 'pack', disparu: 'resilie', preavis: 'ok' };
  // Catégories où la qualification part VIDE (rien noté par défaut ; un clic
  // ouvre le menu) et où la colonne « Situation détectée » est masquée
  // (redondante avec la qualification). N.B. purement UI : le calcul garde son
  // propre défaut via choixOu(), donc la note est inchangée.
  const CAT_QUAL_VIDE = new Set(['disparus', 'impayes', 'baisses', 'nouveaux', 'aqualifier', 'preavis']);

  // Les 7 cartes KPI = l'unique navigation entre les listes (plus de sous-onglets).
  const KPIS = [
    { key: 'clients', label: () => 'Clients ' + moisLabel(mois, -1), icon: 'users', aide: 'clients' },
    { key: 'fideles', label: () => 'Fidèles ' + moisLabel(mois, 0), icon: 'check', aide: 'fideles' },
    { key: 'disparus', label: () => 'Disparus', icon: 'down', aide: 'disparus' },
    { key: 'impayes', label: () => 'Impayés', icon: 'alert', aide: 'impayes' },
    { key: 'baisses', label: () => 'Tarifs en baisse', icon: 'trend', aide: 'baisses' },
    { key: 'nouveaux', label: () => 'Nouveaux signés', icon: 'plus', aide: 'nouveauxSignes' },
    { key: 'aqualifier', label: () => 'À qualifier', icon: 'list', aide: 'aqualifier' },
  ];
  const KPI_TITRE = { clients: 'Clients du mois précédent', fideles: 'Fidèles', disparus: 'Disparus', impayes: 'Impayés', baisses: 'Tarifs en baisse', nouveaux: 'Nouveaux signés', aqualifier: 'À qualifier', preavis: 'Résilié (préavis)' };
  // Carte affichée uniquement s'il y a des résiliés en préavis (issue du fichier résiliations).
  const KPI_PREAVIS = { key: 'preavis', label: () => 'Résilié préavis', icon: 'clock', aide: 'preavis' };

  // Construit la liste de clients correspondant à une carte KPI (données déjà
  // calculées ; aucune modification du calcul). Chaque ligne : { cle, nom, prenom,
  // menuCat (menu de qualification, ou null), situ (badge de situation) }.
  function listeKPI(r, key, s) {
    switch (key) {
      case 'clients': return (r.baseListe || []).map((x) => ({ cle: x.cle, nom: x.nom, prenom: x.prenom, menuCat: null, situ: 'client' }));
      case 'fideles': {
        const fid = (r.fidelesListe || []).map((x) => ({ cle: x.cle, nom: x.nom, prenom: x.prenom, menuCat: null, situ: 'fidele' }));
        // + baisses maîtrisées (« sous contrôle »), comptées comme fidèles.
        const sc = (r.baisses || []).filter((b) => valeurCourante(s, b, 'baisse') === 'sous_controle')
          .map((b) => ({ cle: b.cle, nom: b.nom, prenom: b.prenom, menuCat: 'baisse', situ: 'fidele' }));
        return fid.concat(sc);
      }
      case 'disparus': return (r.disparus || []).map((d) => ({ cle: d.cle, nom: d.nom, prenom: d.prenom, type: d.type, menuCat: 'disparu', situ: 'disparu' }));
      case 'impayes': return (r.disparus || []).filter((d) => d.type === 'IMPAYE').map((d) => ({ cle: d.cle, nom: d.nom, prenom: d.prenom, type: d.type, menuCat: 'disparu', situ: 'disparu' }));
      case 'baisses': return (r.baisses || []).map((b) => ({ cle: b.cle, nom: b.nom, prenom: b.prenom, menuCat: 'baisse', situ: 'baisse' }));
      case 'nouveaux': return (r.signatairesListe || []).map((n) => ({ cle: n.cle, nom: n.nom, prenom: n.prenom, menuCat: 'nouveauNonPaye', situ: n.paye ? 'nouveauPaye' : 'nonPaye' }));
      case 'aqualifier': return (r.aQualifier || []).map((q) => ({ cle: q.cle, nom: q.nom, prenom: q.prenom, menuCat: 'aQualifier', situ: 'aqualifier' }));
      case 'preavis': return (r.preavis || []).map((p) => ({ cle: p.cle, nom: p.nom, prenom: p.prenom, baisse: p.baisse, menuCat: 'preavis', situ: 'preavis' }));
      default: return [];
    }
  }

  // ── ÉTAT « TRAITÉ » (liseré vert) ───────────────────────────────────────────
  // Une catégorie est traitée quand TOUTES ses fiches qualifiables ont un choix
  // explicite (les fiches sans menu — ex. nouveaux payés — ne bloquent pas ;
  // une catégorie vide est considérée traitée).
  function categorieTraitee(r, s, key) {
    if (!r || r.pending) return false;
    return listeKPI(r, key, s).every((it) => !it.menuCat || aChoix(s, it.cle));
  }
  // Les 6 catégories dont le traitement complet « verdit » le club.
  const CATS_TRAITEMENT = ['disparus', 'impayes', 'baisses', 'nouveaux', 'aqualifier', 'preavis'];
  function clubTraite(s) {
    const r = resultats[s];
    if (!r || r.pending) return false;
    return CATS_TRAITEMENT.every((k) => categorieTraitee(r, s, k));
  }
  function moisTraite() {
    const cs = clubsResultats();
    return cs.length > 0 && cs.every((s) => clubTraite(s));
  }

  // §2+§3 Panneau du club : KPI cliquables (navigation) + tableau de la catégorie.
  function renderClubPanel() {
    const host = $('#rec-details');
    if (resClub === BESOIN_TAB) { renderBesoinPanel(); return; }
    const s = resClub, r = resultats[s];
    if (!s || !r) { host.innerHTML = ''; return; }
    if (r.pending) {
      host.innerHTML = '<div class="rec-panel">' + bandeau('warn', '⏳ <b>' + esc(s) + '</b> : le mois précédent (' + esc(moisLabel(m1, 0)) + ') n\'est pas encore importé. Dépose-le pour calculer ce club.') + '</div>';
      return;
    }
    // Cartes = les 7 KPI + « Résilié préavis » uniquement s'il y en a.
    const cartes = (r.preavis && r.preavis.length) ? KPIS.concat([KPI_PREAVIS]) : KPIS;
    if (!cartes.some((k) => k.key === kpiActive)) kpiActive = 'disparus';
    // §5 Cartes KPI = navigation. Le chiffre = la taille EXACTE de la liste ouverte
    // au clic -> carte, en-tête et tableau affichent toujours le même nombre.
    const kpis = cartes.map((k) => {
      // Vert par défaut pour Clients/Fidèles ; sinon vert quand tout est traité.
      const vert = (k.key === 'clients' || k.key === 'fideles') || categorieTraitee(r, s, k.key);
      return '<button type="button" class="rec-kpi2' + (k.key === kpiActive ? ' is-active' : '') + (vert ? ' is-done' : '') + '" data-kpi="' + k.key + '">'
        + '<b>' + listeKPI(r, k.key, s).length + '</b><span>' + ico(k.icon) + esc(k.label()) + aideBtn(k.aide) + '</span></button>';
    }).join('');

    // §5 Tableau de la catégorie sélectionnée, trié (par nom par défaut ;
    // en-têtes cliquables pour trier par situation ou par qualification).
    // Catégories « qualifiables » : colonne Situation masquée + qualification vide.
    const modeVide = CAT_QUAL_VIDE.has(kpiActive);
    if (modeVide && triCol === 'situ') triCol = 'nom'; // colonne situation absente -> retombe sur le nom
    const rows = trierRows(listeKPI(r, kpiActive, s), s);
    let sansLien = 0, total = 0;
    const corps = rows.map((it) => {
      total++; if (!resoudreId(it.cle, s)) sansLien++;
      const situ = modeVide ? '' : '<td>' + situBadge(it.situ, it) + '</td>';
      // Petite case « besoin d'infos » devant le nom (catégories qualifiables).
      const chk = modeVide ? '<input type="checkbox" class="rec-besoin-chk" title="Besoin d\'infos" data-s="' + esc(s) + '" data-cle="' + esc(it.cle) + '"' + (estBesoin(s, it.cle) ? ' checked' : '') + '>' : '';
      // Remarque libre inline (même donnée que la note « Besoin d'infos »).
      const note = modeVide ? '<td class="rec-besoin-notecell"><input type="text" class="rec-besoin-note" placeholder="Remarque…" value="' + esc(noteBesoin(s, it.cle)) + '" data-s="' + esc(s) + '" data-cle="' + esc(it.cle) + '"></td>' : '';
      return '<tr><td class="rec-cli-nom">' + chk + nomLien(s, it.cle, it.nom, it.prenom) + '</td>'
        + situ + '<td class="rec-cli-qual">' + qualCell(s, it, modeVide) + '</td>' + note + '</tr>';
    }).join('');
    const thTri = (col, lbl) => {
      const actif = triCol === col;
      const glyph = actif ? (triSens > 0 ? '▲' : '▼') : '↕'; // ↕ = triable ; ▲/▼ = tri actif
      return '<th class="rec-th-tri' + (actif ? ' is-tri' : '') + '" data-tri="' + col + '">'
        + esc(lbl) + '<span class="rec-tri-arw">' + glyph + '</span></th>';
    };
    const thead = '<tr>' + thTri('nom', 'Client') + (modeVide ? '' : thTri('situ', 'Situation détectée')) + thTri('qual', 'Qualification') + (modeVide ? '<th>Note</th>' : '') + '</tr>';
    const table = rows.length
      ? '<table class="rec-cli-table' + (modeVide ? ' rec-cli-note3' : '') + '"><thead>' + thead + '</thead><tbody>' + corps + '</tbody></table>'
      : '<p class="rec-vide">Aucun client dans cette catégorie.</p>';
    const nb = rows.length;
    const listHead = '<div class="rec-list-head">' + esc((KPI_TITRE[kpiActive] || '').toUpperCase()) + ' — ' + nb + ' client' + (nb > 1 ? 's' : '') + '</div>';

    // §B4 Alerte « sans lien Deciplus ».
    let alerte = '';
    if (sansLien > 5 || (total > 0 && sansLien / total > 0.10)) {
      alerte = bandeau('info', 'ℹ️ ' + sansLien + ' personne' + (sansLien > 1 ? 's' : '') + ' sans lien Deciplus (identifiant inconnu). '
        + '<button type="button" class="rec-link" data-maj-membres="1">Mettre à jour les membres</button>');
    }

    host.innerHTML = '<div class="rec-panel"><div class="rec-kpis2">' + kpis + '</div>' + listHead + table + alerte + '</div>';
    host.querySelectorAll('.rec-kpi2[data-kpi]').forEach((c) => c.addEventListener('click', () => { kpiActive = c.dataset.kpi; renderClubPanel(); }));
    // En-têtes de colonne = tri en un clic (même colonne -> inverse le sens).
    host.querySelectorAll('.rec-th-tri[data-tri]').forEach((h) => h.addEventListener('click', () => {
      const col = h.dataset.tri;
      if (triCol === col) triSens = -triSens; else { triCol = col; triSens = 1; }
      renderClubPanel();
    }));
    // Remarque libre : persiste à la sortie du champ (partagée avec « Besoin d'infos »).
    host.querySelectorAll('.rec-besoin-note').forEach((inp) => inp.addEventListener('change', () => {
      setNoteBesoin(inp.dataset.s, inp.dataset.cle, inp.value.trim());
    }));
  }

  // Onglet « Besoin d'infos » : liste agrégée (tous clubs) des clients cochés.
  function renderBesoinPanel() {
    const host = $('#rec-details');
    const liste = besoinListe();
    const nb = liste.length;
    const exportBtn = nb ? '<button type="button" class="rec-export-besoin" id="rec-export-besoin">📤 Exporter les besoins d\'informations</button>' : '';
    const head = '<div class="rec-besoin-head"><div class="rec-list-head">🔎 BESOIN D\'INFOS — ' + nb + ' client' + (nb > 1 ? 's' : '') + '</div>' + exportBtn + '</div><div class="rec-export-msg" id="rec-export-msg"></div>';
    if (!nb) {
      host.innerHTML = '<div class="rec-panel">' + head + '<p class="rec-vide">Aucun client signalé. Coche la case devant un nom (Disparus, Impayés, Tarifs en baisse, Nouveaux signés, À qualifier, Résilié préavis) pour l\'ajouter ici.</p></div>';
      return;
    }
    const corps = liste.map((x) =>
      '<tr><td class="rec-besoin-cell"><input type="checkbox" class="rec-besoin-chk" checked title="Retirer" data-s="' + esc(x.studio) + '" data-cle="' + esc(x.cle) + '"></td>'
      + '<td class="rec-cli-nom">' + nomLien(x.studio, x.cle, x.nom, x.prenom) + '</td>'
      + '<td>' + esc(x.studio) + '</td>'
      + '<td class="rec-cli-qual">' + x.qual + '</td>'
      + '<td class="rec-besoin-notecell"><input type="text" class="rec-besoin-note" placeholder="Note libre…" value="' + esc(x.note || '') + '" data-s="' + esc(x.studio) + '" data-cle="' + esc(x.cle) + '"></td></tr>'
    ).join('');
    const thB = (col, lbl) => {
      const actif = besoinTri === col;
      const glyph = actif ? (besoinSens > 0 ? '▲' : '▼') : '↕';
      return '<th class="rec-th-tri' + (actif ? ' is-tri' : '') + '" data-btri="' + col + '">'
        + esc(lbl) + '<span class="rec-tri-arw">' + glyph + '</span></th>';
    };
    const table = '<table class="rec-cli-table rec-besoin-table"><thead><tr>'
      + '<th></th>' + thB('nom', 'Client') + thB('club', 'Club') + '<th>Qualification</th><th>Note</th></tr></thead><tbody>' + corps + '</tbody></table>';
    host.innerHTML = '<div class="rec-panel">' + head + table + '</div>';
    host.querySelectorAll('.rec-th-tri[data-btri]').forEach((h) => h.addEventListener('click', () => {
      const col = h.dataset.btri;
      if (besoinTri === col) besoinSens = -besoinSens; else { besoinTri = col; besoinSens = 1; }
      renderBesoinPanel();
    }));
    // Note libre : persiste à la sortie du champ (change), sans re-render (garde le focus fluide).
    host.querySelectorAll('.rec-besoin-note').forEach((inp) => inp.addEventListener('change', () => {
      setNoteBesoin(inp.dataset.s, inp.dataset.cle, inp.value.trim());
    }));
    const eb = $('#rec-export-besoin');
    if (eb) eb.addEventListener('click', () => exporterBesoin(liste, eb));
  }

  // Export vers Google Sheets (Club, Nom, Prénom, Qualification, Note) via le backend.
  async function exporterBesoin(liste, btn) {
    const msg = $('#rec-export-msg');
    const rows = liste.map((x) => ({ club: x.studio, nom: x.nom, prenom: x.prenom, qual: x.qualTxt || '', note: noteBesoin(x.studio, x.cle) }));
    const libel = btn.textContent; btn.disabled = true; btn.textContent = '⏳ Export en cours…';
    if (msg) { msg.textContent = ''; msg.className = 'rec-export-msg'; }
    try {
      const r = await fetch('/api/retention/besoin/export', { method: 'POST', headers: H(), body: JSON.stringify({ mois, rows }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Export impossible.');
      if (msg) { msg.textContent = '✅ ' + j.count + ' fiche' + (j.count > 1 ? 's' : '') + ' exportée' + (j.count > 1 ? 's' : '') + ' vers Google Sheets.'; msg.className = 'rec-export-msg is-ok'; }
    } catch (e) {
      if (msg) { msg.textContent = '⚠️ ' + (e.message || 'Export impossible.'); msg.className = 'rec-export-msg is-err'; }
    } finally { btn.disabled = false; btn.textContent = libel; }
  }

  // Tri du tableau clients selon triCol/triSens. Clé par colonne ; le nom reste
  // toujours le critère secondaire pour un ordre stable et lisible.
  // Déplacement automatique : un client qualifié à la main descend en bas de liste
  // (sauf tri explicite par qualification, où l'on veut un regroupement pur).
  function trierRows(rows, s) {
    const traite = (it) => (it.menuCat && aChoix(s, it.cle)) ? 1 : 0; // qualifié -> en bas
    const groupeTraite = triCol !== 'qual';
    const nomCle = (it) => ((it.nom || '') + ' ' + (it.prenom || '')).trim().toLowerCase();
    const cle = (it) => {
      if (triCol === 'situ') return String(it.situ || '');
      if (triCol === 'qual') return it.menuCat ? String(valeurCourante(s, it, it.menuCat)) : '￿'; // « — » en dernier
      return nomCle(it);
    };
    return rows.slice().sort((a, b) =>
      (groupeTraite ? (traite(a) - traite(b)) : 0)
      || (cle(a).localeCompare(cle(b), 'fr') * triSens)
      || nomCle(a).localeCompare(nomCle(b), 'fr'));
  }

  // Valeur de qualification courante d'une ligne (défaut spécial pour les disparus).
  function valeurCourante(s, it, cat) {
    if ((choix[s] || {})[it.cle]) return choix[s][it.cle];
    if (cat === 'disparu') return it.type === 'IMPAYE' ? 'impaye' : 'resilie';
    return DEF[cat];
  }
  // Un client est « qualifié à la main » s'il a un choix explicite NON vide.
  // (Le reset persiste une valeur vide '' -> doit compter comme « pas de choix ».)
  function aChoix(s, cle) { const v = (choix[s] || {})[cle]; return v != null && v !== ''; }
  // Badge « situation détectée » selon le type de ligne.
  function situBadge(situ, it) {
    switch (situ) {
      case 'client': return badge('Présent M-1', 'neutral');
      case 'fidele': return badge('Fidèle', 'green');
      case 'baisse': return badge('Tarif en baisse', 'orange');
      case 'nouveauPaye': return badge('Nouveau payé', 'green');
      case 'nonPaye': return badge('Non payé', 'redlight');
      case 'aqualifier': return badge('À qualifier', 'neutral');
      case 'preavis': return badge('Résilié préavis', 'blue') + (it.baisse ? ' ' + badge('tarif en baisse', 'orange') : '');
      case 'disparu':
        if (it.type === 'IMPAYE') return badge('Impayé', 'red');
        if (it.type === 'RESILIE') return badge('Résilié', 'gray');
        return badge('Parti', 'gray');
      default: return badge(situ, 'neutral');
    }
  }
  // §6 Bouton compact = badge de la valeur courante ; le menu s'ouvre au clic.
  const QUAL = {
    disparu: { impaye: ['Impayé', 'red'], resilie: ['Résilié', 'gray'], anomalie: ['Anomalie', 'redlight'], pack: ['Pack de séances', 'blue'] },
    baisse: { sous_controle: ['Sous contrôle', 'green'], arrangement: ['Arrangement', 'orange'] },
    nouveauNonPaye: { decalage: ['OK', 'green'], anomalie: ['Anomalie', 'redlight'] },
    aQualifier: { suspendu: ['Suspendu', 'green'], nouveau: ['Nouveau', 'green'], pack: ['Pack de séances', 'blue'] },
    preavis: { ok: ['OK', 'green'], ctx: ['Ctx', 'orange'] },
  };
  function qualBtn(s, cle, cat, v) {
    const [lbl, col] = (QUAL[cat] && QUAL[cat][v]) || [v, 'neutral'];
    return '<button type="button" class="rec-qual" data-s="' + esc(s) + '" data-cle="' + esc(cle) + '" data-cat="' + cat + '" data-val="' + esc(v) + '">'
      + badge(lbl, col) + '<span class="rec-qual-caret">▾</span></button>';
  }
  // Cellule de qualification. En mode « vide » (catégories qualifiables) et tant
  // que rien n'a été choisi à la main : bouton vide -> un clic ouvre le menu.
  function qualCell(s, it, modeVide) {
    if (!it.menuCat) return '<span class="rec-qual-none">—</span>';
    const explicite = aChoix(s, it.cle);
    if (modeVide && !explicite) {
      return '<button type="button" class="rec-qual rec-qual-vide" title="Qualifier" data-s="' + esc(s) + '" data-cle="' + esc(it.cle) + '" data-cat="' + it.menuCat + '" data-val="">'
        + '<span class="rec-qual-ph">Qualifier</span><span class="rec-qual-caret">▾</span></button>';
    }
    return qualBtn(s, it.cle, it.menuCat, valeurCourante(s, it, it.menuCat));
  }
  const badge = (txt, col) => '<span class="rec-badge2 rec-b-' + col + '">' + esc(txt) + '</span>';

  // §6 Délégué UNE fois sur #rec-details : clic sur un bouton -> le menu déroulant
  // remplace le badge ; à la sélection -> applique + persiste + recalcule.
  function onDetailsClick(e) {
    const maj = e.target.closest('[data-maj-membres]');
    if (maj) { switchViewMembres(); return; }
    const chk = e.target.closest('.rec-besoin-chk'); // case « besoin d'infos »
    if (chk) { toggleBesoin(chk.dataset.s, chk.dataset.cle, chk.checked); return; }
    const btn = e.target.closest('.rec-qual');
    if (!btn) return;
    const cell = btn.parentElement;
    const s = btn.dataset.s, cle = btn.dataset.cle, cat = btn.dataset.cat, v = btn.dataset.val;
    cell.innerHTML = menu(s, cle, cat, OPT[cat], v);
    const sel = cell.querySelector('select'); sel.classList.add('rec-menu-open'); sel.focus();
    try { sel.showPicker(); } catch (_) { /* navigateur sans showPicker : le clic suivant ouvre la liste */ }
    sel.addEventListener('change', () => {
      if (sel.value === RESET_VAL) reinitialiserChoix(s, cle, cat);
      else appliquerChoix(s, cle, cat, sel.value);
    });
    sel.addEventListener('blur', () => renderClubPanel());
  }
  function appliquerChoix(s, cle, cat, val) {
    (choix[s] || (choix[s] = {}))[cle] = val;
    recalcStudio(s);
    patchChoix(s, cle, cat, val);
    render(); // met à jour les onglets (note/compteurs) ET le panneau ; resClub/kpiActive conservés
  }
  // Remet une fiche à son état initial (vide) : efface le choix local + persiste
  // une valeur vide, puis recalcule et re-rend (la fiche redevient « Qualifier »).
  function reinitialiserChoix(s, cle, cat) {
    if (choix[s]) delete choix[s][cle];
    recalcStudio(s);
    patchChoix(s, cle, cat, ''); // '' = pas de choix (voir aChoix)
    render();
  }

  // ── CHARGEMENT / PERSISTANCE ────────────────────────────────────────────────
  function patchChoix(s, cle, cat, val) {
    fetch('/api/retention/' + mois + '/choix', { method: 'PATCH', headers: H(), body: JSON.stringify({ studio: s, client_key: cle, categorie: cat, valeur: val }) }).catch(() => {});
  }

  // ── BESOIN D'INFOS (case à cocher -> onglet agrégé à droite des clubs) ───────
  // Cocher persiste (catégorie réservée BESOIN_CAT dans retention_choices) mais
  // NE change PAS l'affichage courant ni le calcul ; ça alimente l'onglet dédié.
  const BESOIN_CATS = [
    { key: 'disparus', label: 'Disparus' },
    { key: 'baisses', label: 'Tarifs en baisse' },
    { key: 'nouveaux', label: 'Nouveaux signés' },
    { key: 'aqualifier', label: 'À qualifier' },
    { key: 'preavis', label: 'Résilié préavis' },
  ];
  function estBesoin(s, cle) { return !!((besoin[s] || {})[cle]); }
  function toggleBesoin(s, cle, on) {
    (besoin[s] || (besoin[s] = {}))[cle] = !!on;
    fetch('/api/retention/' + mois + '/choix', { method: 'PATCH', headers: H(),
      body: JSON.stringify({ studio: s, client_key: cle, categorie: BESOIN_CAT, valeur: on ? '1' : '0' }) }).catch(() => {});
    renderClubTabs(); // rafraîchit le compteur de l'onglet, sans toucher au panneau courant
    if (resClub === BESOIN_TAB) renderClubPanel(); // dans l'onglet dédié, la ligne décochée disparaît
  }
  function noteBesoin(s, cle) { return (besoinNote[s] || {})[cle] || ''; }
  function setNoteBesoin(s, cle, txt) {
    (besoinNote[s] || (besoinNote[s] = {}))[cle] = txt;
    fetch('/api/retention/' + mois + '/choix', { method: 'PATCH', headers: H(),
      body: JSON.stringify({ studio: s, client_key: cle, categorie: BESOIN_NOTE_CAT, valeur: txt }) }).catch(() => {});
  }
  // Retrouve nom/prénom + catégorie + qualification d'un client coché (par club).
  function trouverClientBesoin(s, cle) {
    const r = resultats[s]; if (!r || r.pending) return null;
    for (const c of BESOIN_CATS) {
      const it = listeKPI(r, c.key, s).find((x) => x.cle === cle);
      if (it) {
        let catLabel = c.label;
        if (c.key === 'disparus' && it.type === 'IMPAYE') catLabel = 'Impayés';
        return { nom: it.nom, prenom: it.prenom, cat: catLabel, qual: qualLabelBadge(s, it), qualTxt: qualLabelText(s, it) };
      }
    }
    return null;
  }
  // Badge de la qualification courante (ou « — » si pas encore qualifié).
  function qualLabelBadge(s, it) {
    const t = qualLabelText(s, it);
    if (!t) return '<span class="rec-qual-none">—</span>';
    const v = valeurCourante(s, it, it.menuCat);
    const col = (QUAL[it.menuCat] && QUAL[it.menuCat][v]) ? QUAL[it.menuCat][v][1] : 'neutral';
    return badge(t, col);
  }
  // Qualification en texte brut (pour l'export) ; '' si pas encore qualifié.
  function qualLabelText(s, it) {
    if (!it.menuCat) return '';
    if (!aChoix(s, it.cle)) return '';
    const v = valeurCourante(s, it, it.menuCat);
    return (QUAL[it.menuCat] && QUAL[it.menuCat][v]) ? QUAL[it.menuCat][v][0] : String(v);
  }
  // Liste agrégée (tous clubs) des clients cochés, résolus dans le mois courant.
  function besoinListe() {
    const out = [];
    Object.keys(besoin).forEach((s) => Object.keys(besoin[s] || {}).forEach((cle) => {
      if (!besoin[s][cle]) return;
      const info = trouverClientBesoin(s, cle);
      if (info) out.push(Object.assign({ studio: s, cle, note: noteBesoin(s, cle) }, info));
    }));
    const nomCle = (x) => ((x.nom || '') + ' ' + (x.prenom || '')).toLowerCase();
    const cle = (x) => besoinTri === 'nom' ? nomCle(x) : String(x.studio || '').toLowerCase();
    return out.sort((a, b) => (cle(a).localeCompare(cle(b), 'fr') * besoinSens) || nomCle(a).localeCompare(nomCle(b), 'fr'));
  }

  async function charger() {
    resetLocal();
    await chargerClubs();
    try {
      const d = await (await fetch('/api/retention/' + mois, { headers: H() })).json();
      if (!d) return;
      m1 = d.m1 || RetentionParse.moisPrecedent(mois);
      membres = d.membres || { map: [], stats: {}, total: 0 };
      construireIndexMembres();
      (d.importsM || []).forEach((im) => {
        const st = archM[im.studio] || (archM[im.studio] = { encaissements: [], contrats: [], resiliations: [] });
        if (im.type === 'encaissements') st.encaissements = im.contenu || [];
        if (im.type === 'contrats') st.contrats = im.contenu || [];
        if (im.type === 'resiliations') st.resiliations = im.contenu || [];
      });
      dejaArchiveM = (d.importsM || []).some((im) => im.type === 'encaissements');
      (d.importsM1 || []).forEach((im) => { archM1[im.studio] = im.contenu || []; m1Info[im.studio] = im.uploaded_at; });
      (d.choices || []).forEach((c) => {
        if (c.categorie === BESOIN_CAT) { // flag « besoin d'infos » -> map séparée
          if (c.valeur === '1') (besoin[c.studio] || (besoin[c.studio] = {}))[c.client_key] = true;
        } else if (c.categorie === BESOIN_NOTE_CAT) { // note libre -> map séparée
          if (c.valeur) (besoinNote[c.studio] || (besoinNote[c.studio] = {}))[c.client_key] = c.valeur;
        } else {
          (choix[c.studio] || (choix[c.studio] = {}))[c.client_key] = c.valeur;
        }
      });
      // Contrats/résiliations archivés : reconstruit pour le rendu.
      Object.keys(archM).forEach((s) => {
        if ((archM[s].contrats || []).length) contratsParStudio[s] = archM[s].contrats;
        if ((archM[s].resiliations || []).length) resiliationsParStudio[s] = archM[s].resiliations;
      });
      assembler();
      peuplerClubs(); // les studios archivés enrichissent la liste des clubs
      if (dejaArchiveM) msg('Données du mois rechargées.', false);
      else msg('', false);
    } catch (_) { assembler(); }
  }
  function resetLocal() {
    // NB : on NE réinitialise PAS clubs/clubCourant (sélection valable entre mois).
    archM = {}; archM1 = {}; m1Info = {}; dejaArchiveM = false;
    contratsParStudio = {}; resiliationsParStudio = {}; fichiersEncM = []; fichiersM1 = []; bulkM1Ouvert = false;
    studios = {}; resultats = {}; choix = {}; besoin = {}; besoinNote = {};
    membres = { map: [], stats: {}, total: 0 }; idxStudio = new Map(); idxGlobal = new Map();
    ['encM', 'contrats', 'resiliations', 'membres'].forEach((z) => { const el = $('#rec-info-' + z); if (el) el.textContent = ''; });
    ['encM', 'contrats', 'resiliations'].forEach((z) => { const zn = $('#rec-zone-' + z); if (zn) zn.classList.remove('is-done'); const c = $('#rec-done-' + z); if (c) c.innerHTML = ''; });
    $('#rec-detection').innerHTML = ''; $('#rec-recap').innerHTML = ''; $('#rec-details').innerHTML = '';
    $('#rec-m1-manquants').innerHTML = ''; const ap = $('#rec-apercu'); if (ap) ap.innerHTML = ''; msg('');
    // délègue UNE fois les clics du panneau (qualification + « mettre à jour membres »).
    if (!resetLocal._deleg) {
      resetLocal._deleg = true;
      $('#rec-details').addEventListener('click', onDetailsClick);
    }
  }
  function switchViewMembres() {
    const zMe = $('#rec-zone-membres'); zMe.hidden = false;
    zMe.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // §3 Récap « fichier → club », corrigeable avant calcul (filet de sécurité si
  // un fichier a été déposé avec le mauvais club sélectionné).
  function renderDetection() {
    const host = $('#rec-detection');
    const aM1 = fichiersM1.length, aM = fichiersEncM.length;
    if (!aM && !aM1) { host.innerHTML = ''; return; }
    const studiosConnus = [...new Set([...clubs, ...Object.keys(contratsParStudio), ...Object.keys(archM)])].sort((a, b) => a.localeCompare(b, 'fr'));
    const ligne = (f, quand, i) => {
      const opts = ['<option value="">— non rattaché —</option>']
        .concat(studiosConnus.map((s) => '<option' + (s === f.studio ? ' selected' : '') + '>' + esc(s) + '</option>'));
      if (f.studio && !studiosConnus.includes(f.studio)) opts.push('<option selected>' + esc(f.studio) + '</option>');
      return '<div class="rec-det-row"><span class="rec-det-file">' + esc(f.nom) + '</span><span class="rec-det-arrow">→</span>'
        + '<select class="rec-det-sel" data-quand="' + quand + '" data-i="' + i + '">' + opts.join('') + '</select></div>';
    };
    host.innerHTML = '<h3 class="rec-h3">Fichiers → club <small>(corrige si besoin avant de calculer)</small></h3>'
      + (aM ? '<div class="rec-det-grp"><b>Encaissements ' + moisLabel(mois, 0) + '</b>' + fichiersEncM.map((f, i) => ligne(f, 'M', i)).join('') + '</div>' : '')
      + (aM1 ? '<div class="rec-det-grp"><b>Encaissements ' + moisLabel(m1, 0) + ' (mois précédent)</b>' + fichiersM1.map((f, i) => ligne(f, 'M1', i)).join('') + '</div>' : '');
    host.querySelectorAll('.rec-det-sel').forEach((sel) => sel.addEventListener('change', () => {
      const arr = sel.dataset.quand === 'M' ? fichiersEncM : fichiersM1;
      arr[Number(sel.dataset.i)].studio = sel.value || null;
      assembler();
    }));
  }

  // ── HISTORIQUE (§A6) ─────────────────────────────────────────────────────────
  async function renderHistorique() {
    const host = $('#rec-histo');
    host.innerHTML = '<p class="rec-sub">Chargement de l’historique…</p>';
    let liste;
    try { liste = (await (await fetch('/api/retention/mois', { headers: H() })).json()).mois || []; }
    catch (_) { host.innerHTML = '<p class="rec-msg rec-msg-err">Historique indisponible (réseau).</p>'; return; }
    if (!liste.length) { host.innerHTML = '<p class="rec-sub">Aucun mois clôturé pour l’instant.</p>'; return; }
    const calculs = [];
    for (const item of liste) { calculs.push(await calcMois(item)); } // liste triée du + récent au + ancien
    const asc = calculs.slice().reverse();
    host.innerHTML = '<h3 class="rec-h3">Historique · note réseau</h3>'
      + '<div class="rec-histo-graph"><canvas id="rec-chart" height="120"></canvas></div>'
      + '<p class="rec-sub">La note d’un mois reste <b>provisoire</b> tant que le mois suivant n’existe pas (son mois précédent peut encore changer) ; elle devient <b>consolidée</b> ensuite.</p>'
      + '<div class="rec-histo-list">' + calculs.map(carteHisto).join('') + '</div>';
    dessinerGraphe(asc);
  }
  async function calcMois(meta) {
    const ym = meta.mois;
    const d = await (await fetch('/api/retention/' + ym, { headers: H() })).json();
    const aM = {}, aM1 = {}, ch = {};
    (d.importsM || []).forEach((im) => { const s = aM[im.studio] || (aM[im.studio] = { enc: [], con: [] }); if (im.type === 'encaissements') s.enc = im.contenu || []; if (im.type === 'contrats') s.con = im.contenu || []; });
    (d.importsM1 || []).forEach((im) => { aM1[im.studio] = im.contenu || []; });
    (d.choices || []).forEach((c) => { if (c.categorie !== BESOIN_CAT && c.categorie !== BESOIN_NOTE_CAT) (ch[c.studio] || (ch[c.studio] = {}))[c.client_key] = c.valeur; });
    const parStudio = []; const rs = [];
    Object.keys(aM).forEach((s) => {
      if (!aM1[s]) return; // sans M-1 -> pas de note (studio en attente)
      const r = Retention.calculerStudio({ encM1: aM1[s], encM: aM[s].enc, signataires: aM[s].con, choix: ch[s] || {} });
      rs.push(r); parStudio.push({ s, note: r.note });
    });
    parStudio.sort((a, b) => b.note - a.note);
    return { mois: ym, label: moisLabel(ym, 0), reseau: rs.length ? Retention.noteReseau(rs) : null, parStudio, consolide: !!meta.consolide, dernier: meta.dernier };
  }
  function carteHisto(c) {
    return '<div class="rec-histo-card">'
      + '<div class="rec-histo-h"><b>' + esc(c.label) + '</b> <span class="rec-badge ' + (c.consolide ? 'ok' : 'prov') + '">' + (c.consolide ? 'consolidé' : 'provisoire') + '</span></div>'
      + '<div class="rec-histo-note">Réseau : <b>' + pct(c.reseau) + '</b></div>'
      + '<div class="rec-histo-sub">' + (c.consolide ? 'consolidé' : 'importé') + ' le ' + esc(fmtDate(c.dernier)) + ' · ' + c.parStudio.length + ' studio' + (c.parStudio.length > 1 ? 's' : '') + '</div>'
      + '<ul class="rec-histo-studios">' + c.parStudio.map((x) => '<li>' + esc(x.s) + ' <b>' + pct(x.note) + '</b></li>').join('') + '</ul>'
      + '</div>';
  }
  function dessinerGraphe(asc) {
    const el = $('#rec-chart'); if (!el || typeof Chart === 'undefined') return;
    if (chartHisto) { chartHisto.destroy(); chartHisto = null; }
    chartHisto = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: asc.map((c) => c.label),
        datasets: [{
          label: 'Note réseau', data: asc.map((c) => c.reseau == null ? null : +(c.reseau * 100).toFixed(1)),
          borderColor: '#818CF8', backgroundColor: 'rgba(99,102,241,.15)', tension: .25, spanGaps: true, pointRadius: 4,
        }],
      },
      options: {
        plugins: { legend: { labels: { color: '#E8ECF4' } } },
        scales: {
          y: { min: 0, max: 100, ticks: { color: '#9AA6BF', callback: (v) => v + ' %' }, grid: { color: 'rgba(255,255,255,.06)' } },
          x: { ticks: { color: '#9AA6BF' }, grid: { color: 'rgba(255,255,255,.06)' } },
        },
      },
    });
  }

  // ── utilitaires ──────────────────────────────────────────────────────────────
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return String(iso).slice(0, 10);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  const nb = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  return { open };
})();
