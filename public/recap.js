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
  let resultats = {};// studio -> retour de calculerStudio  (ou { pending:true })
  let chartHisto = null;

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
    $('#rec-club').addEventListener('change', () => { clubCourant = $('#rec-club').value; });
    $('#rec-club-add-btn').addEventListener('click', ajouterClub);
    $('#rec-club-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterClub(); } });
    zone('encM', $('#rec-file-encM'), traiterEncM);
    zone('contrats', $('#rec-file-contrats'), traiterContrats);
    zone('membres', $('#rec-file-membres'), traiterMembres);
    $('#rec-calc').addEventListener('click', calculer);
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
    clubCourant = v; inp.value = ''; peuplerClubs();
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
  async function traiterEncM(files) {
    if (!exigeClub()) return;
    const club = clubCourant;
    const lus = [];
    for (const f of files) {
      const lignes = RetentionParse.mapEncaissements(RetentionParse.lireTabulaire(await buf(f)));
      const ymf = RetentionParse.moisDeLignes(lignes);
      // §A1 : le mois est déduit des dates. On refuse un fichier qui ne couvre pas M.
      if (ymf && ymf !== mois) { msg('Ce fichier couvre ' + moisLabel(ymf, 0) + ', or le mois à clôturer est ' + moisLabel(mois, 0) + '.', true); return; }
      lus.push({ nom: f.name, cles: new Set(lignes.map((l) => l.cle)), lignes, studio: club });
    }
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
    // Le studio vient du club choisi, pas du nom de fichier : on ne garde que les signataires.
    const sigs = Object.values(RetentionParse.mapContrats(noms)).flat();
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
    const noms = new Set([...Object.keys(archM), ...Object.keys(deposeEncM), ...Object.keys(contratsParStudio)]);
    noms.forEach((s) => {
      const encM = deposeEncM[s] || (archM[s] && archM[s].encaissements) || [];
      const signataires = contratsParStudio[s] || (archM[s] && archM[s].contrats) || [];
      let encM1 = [], src = 'manquant';
      if (deposeM1[s]) { encM1 = deposeM1[s]; src = 'depose'; }
      else if (archM1[s]) { encM1 = archM1[s]; src = 'auto'; }
      studios[s] = { encM, encM1, signataires, m1Source: src, m1Mois: m1 };
    });
    peuplerClubs(); // reflète les studios apparus (dépôts/archives) dans le menu
    renderDetection();
    renderBanners();
    renderManquants();
    recalcTout();
  }
  function groupLignes(arr) {
    const out = {};
    arr.forEach((f) => { if (!f.studio) return; (out[f.studio] = out[f.studio] || []).push(...f.lignes); });
    return out;
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
    resultats[s] = Retention.calculerStudio({ encM1: st.encM1, encM: st.encM, signataires: st.signataires, choix: choix[s] || {} });
  }
  function recalcTout() { resultats = {}; Object.keys(studios).forEach(recalcStudio); render(); }

  async function calculer() {
    assembler();
    if (!Object.keys(studios).length) { msg('Dépose les encaissements et les contrats du mois.', true); return; }
    recalcTout();
    try {
      await persister();
      const suiv = await moisSuivantArchive();
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

  // ── RENDU RECAP + détail par studio ─────────────────────────────────────────
  function render() { renderRecap(); renderDetails(); }
  const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + ' %');

  function renderRecap() {
    const calcules = Object.keys(resultats).filter((s) => !resultats[s].pending);
    const pending = Object.keys(resultats).filter((s) => resultats[s].pending);
    if (!calcules.length && !pending.length) { $('#rec-recap').innerHTML = ''; return; }
    const lignes = calcules.map((s) => ({ s, r: resultats[s] })).sort((a, b) => b.r.note - a.r.note);
    const reseau = Retention.noteReseau(lignes.map((x) => x.r));
    const rows = lignes.map((x) => '<tr><td>' + esc(x.s) + '</td><td class="rec-note">' + pct(x.r.note) + '</td></tr>').join('')
      + pending.map((s) => '<tr class="rec-pending"><td>' + esc(s) + '</td><td class="rec-note">⏳ en attente (M-1)</td></tr>').join('');
    $('#rec-recap').innerHTML = '<h3 class="rec-h3">RECAP · ' + moisLabel(mois, 0) + '</h3>'
      + '<table class="rec-table"><thead><tr><th>Studio</th><th>Note</th></tr></thead><tbody>'
      + rows + (lignes.length ? '<tr class="rec-reseau"><td>RÉSEAU (pondéré)</td><td class="rec-note">' + pct(reseau) + '</td></tr>' : '')
      + '</tbody></table>';
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
    // §B4 : sans id -> texte simple, pas d'icône, pas d'erreur.
    return id ? '<a href="' + DECIPLUS + encodeURIComponent(id) + '" target="_blank" rel="noopener">' + label + '</a>' : label;
  }

  function menu(s, cle, cat, options, courant) {
    const o = options.map((v) => '<option value="' + v.val + '"' + (v.val === courant ? ' selected' : '') + '>' + esc(v.lbl) + '</option>').join('');
    return '<select class="rec-menu" data-s="' + esc(s) + '" data-cle="' + esc(cle) + '" data-cat="' + cat + '">' + o + '</select>';
  }
  const OPT = {
    baisse: [{ val: 'sous_controle', lbl: 'Sous contrôle' }, { val: 'arrangement', lbl: 'Arrangement' }],
    nouveauNonPaye: [{ val: 'decalage', lbl: 'Décalage de paiement' }, { val: 'anomalie', lbl: 'Anomalie' }],
    aQualifier: [{ val: 'suspendu', lbl: 'Suspendu' }, { val: 'nouveau', lbl: 'Nouveau' }, { val: 'pack', lbl: 'Pack de séance' }],
  };
  const DEF = { baisse: 'arrangement', nouveauNonPaye: 'anomalie', aQualifier: 'pack' };
  const choixDe = (s, cle, cat) => ((choix[s] || {})[cle]) || DEF[cat];
  function classeChoix(cat, val) {
    if (cat === 'baisse') return val === 'sous_controle' ? 'rec-ok' : 'rec-ko';
    if (cat === 'nouveauNonPaye') return val === 'decalage' ? 'rec-ok' : 'rec-ko';
    return (val === 'suspendu' || val === 'nouveau') ? 'rec-ok' : 'rec-gris';
  }

  function renderDetails() {
    const lignes = Object.keys(resultats).filter((s) => !resultats[s].pending).sort((a, b) => resultats[b].note - resultats[a].note);
    $('#rec-details').innerHTML = lignes.map((s) => detailStudio(s, resultats[s])).join('');
    $('#rec-details').querySelectorAll('.rec-menu').forEach((sel) => sel.addEventListener('change', () => {
      const s = sel.dataset.s, cle = sel.dataset.cle;
      (choix[s] || (choix[s] = {}))[cle] = sel.value;
      recalcStudio(s); renderRecap();
      renderDetails();
      patchChoix(s, cle, sel.dataset.cat, sel.value);
    }));
  }

  function detailStudio(s, r) {
    let sansLien = 0, total = 0;
    const compter = (cle) => { total++; if (!resoudreId(cle, s)) sansLien++; };
    const chiffres = [
      ['Clients de ' + moisLabel(mois, -1), r.base],
      ['Fidèles en ' + moisLabel(mois, 0), r.fideles],
      ['Disparus', r.disparusAffichage + ' (dont ' + r.nbImpayes + ' impayés / ' + r.nbPartis + ' partis)'],
      ['Tarif en baisse', r.baisses.length],
      ['Nouveaux signés', r.nsig],
      ['À qualifier', r.aQualifier.length],
    ];
    const kpi = chiffres.map((c) => '<div class="rec-kpi"><span>' + esc(c[0]) + '</span><b>' + esc(String(c[1])) + '</b></div>').join('');
    let html = '<div class="rec-studio"><div class="rec-studio-h"><h3>' + esc(s) + '</h3><span class="rec-studio-note">' + pct(r.note) + '</span></div>'
      + '<div class="rec-kpis">' + kpi + '</div>';
    if (r.disparus.length) {
      html += section('Disparus', r.disparus.map((d) => { compter(d.cle);
        return '<li class="' + (d.type === 'IMPAYE' ? 'rec-ko' : '') + '">' + nomLien(s, d.cle, d.nom, d.prenom)
          + ' · <em>' + (d.type === 'IMPAYE' ? 'IMPAYÉ' : 'PARTI') + '</em></li>';
      }).join(''));
    }
    if (r.baisses.length) {
      html += section('Baisse de tarif', r.baisses.map((b) => { compter(b.cle);
        const v = choixDe(s, b.cle, 'baisse');
        return '<li class="' + classeChoix('baisse', v) + '">' + nomLien(s, b.cle, b.nom, b.prenom) + ' ' + menu(s, b.cle, 'baisse', OPT.baisse, v) + '</li>';
      }).join(''));
    }
    if (r.nouveauxNonPayes.length) {
      html += section('Nouveaux contrats non payés', r.nouveauxNonPayes.map((n) => { compter(n.cle);
        const v = choixDe(s, n.cle, 'nouveauNonPaye');
        return '<li class="' + classeChoix('nouveauNonPaye', v) + '">' + nomLien(s, n.cle, n.nom, n.prenom) + ' ' + menu(s, n.cle, 'nouveauNonPaye', OPT.nouveauNonPaye, v) + '</li>';
      }).join(''));
    }
    if (r.aQualifier.length) {
      html += section('À qualifier', r.aQualifier.map((q) => { compter(q.cle);
        const v = choixDe(s, q.cle, 'aQualifier');
        return '<li class="' + classeChoix('aQualifier', v) + '">' + nomLien(s, q.cle, q.nom, q.prenom) + ' ' + menu(s, q.cle, 'aQualifier', OPT.aQualifier, v) + '</li>';
      }).join(''));
    }
    // §B4 Alerte « personnes sans lien » : seulement si > 5 OU > 10 % du studio.
    if (sansLien > 5 || (total > 0 && sansLien / total > 0.10)) {
      html += bandeau('info', 'ℹ️ ' + sansLien + ' personne' + (sansLien > 1 ? 's' : '') + ' n\'ont pas de lien vers Deciplus (identifiant inconnu). '
        + '<button type="button" class="rec-link" data-maj-membres="1">Mettre à jour les membres</button>');
    }
    html += '</div>';
    return html;
  }
  const section = (titre, contenu) => contenu ? '<div class="rec-sec"><h4>' + esc(titre) + '</h4><ul class="rec-list">' + contenu + '</ul></div>' : '';

  // ── CHARGEMENT / PERSISTANCE ────────────────────────────────────────────────
  function patchChoix(s, cle, cat, val) {
    fetch('/api/retention/' + mois + '/choix', { method: 'PATCH', headers: H(), body: JSON.stringify({ studio: s, client_key: cle, categorie: cat, valeur: val }) }).catch(() => {});
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
        const st = archM[im.studio] || (archM[im.studio] = { encaissements: [], contrats: [] });
        if (im.type === 'encaissements') st.encaissements = im.contenu || [];
        if (im.type === 'contrats') st.contrats = im.contenu || [];
      });
      dejaArchiveM = (d.importsM || []).some((im) => im.type === 'encaissements');
      (d.importsM1 || []).forEach((im) => { archM1[im.studio] = im.contenu || []; m1Info[im.studio] = im.uploaded_at; });
      (d.choices || []).forEach((c) => (choix[c.studio] || (choix[c.studio] = {}))[c.client_key] = c.valeur);
      // Contrats archivés : reconstruit contratsParStudio pour le rendu des liens/menus.
      Object.keys(archM).forEach((s) => { if ((archM[s].contrats || []).length) contratsParStudio[s] = archM[s].contrats; });
      assembler();
      peuplerClubs(); // les studios archivés enrichissent la liste des clubs
      if (dejaArchiveM) msg('Données du mois rechargées.', false);
      else msg('', false);
    } catch (_) { assembler(); }
  }
  function resetLocal() {
    // NB : on NE réinitialise PAS clubs/clubCourant (sélection valable entre mois).
    archM = {}; archM1 = {}; m1Info = {}; dejaArchiveM = false;
    contratsParStudio = {}; fichiersEncM = []; fichiersM1 = []; bulkM1Ouvert = false;
    studios = {}; resultats = {}; choix = {};
    membres = { map: [], stats: {}, total: 0 }; idxStudio = new Map(); idxGlobal = new Map();
    ['encM', 'contrats', 'membres'].forEach((z) => { const el = $('#rec-info-' + z); if (el) el.textContent = ''; });
    $('#rec-detection').innerHTML = ''; $('#rec-recap').innerHTML = ''; $('#rec-details').innerHTML = '';
    $('#rec-m1-manquants').innerHTML = ''; msg('');
    // délègue le clic « Mettre à jour les membres » (bandeaux dynamiques).
    if (!resetLocal._deleg) {
      resetLocal._deleg = true;
      $('#rec-details').addEventListener('click', (e) => {
        const b = e.target.closest('[data-maj-membres]');
        if (b) { switchViewMembres(); }
      });
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
    (d.choices || []).forEach((c) => (ch[c.studio] || (ch[c.studio] = {}))[c.client_key] = c.valeur);
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
          borderColor: '#F0D488', backgroundColor: 'rgba(240,212,136,.15)', tension: .25, spanGaps: true, pointRadius: 4,
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
