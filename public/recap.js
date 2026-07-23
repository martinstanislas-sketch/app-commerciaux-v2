'use strict';
// ============================================================================
//  RECAP — UI de l'onglet Rétention (admin). Orchestration seulement :
//   - dépôts glisser/déposer -> parsing (RetentionParse, dans le navigateur) ;
//   - détection du studio de chaque fichier (Retention), corrigeable ;
//   - calcul (Retention.calculerStudio) + tableau trié en direct + détail ;
//   - persistance par (mois, studio) via /api/retention.
//
//  Le calcul et le parsing ne vivent PAS ici (modules purs, testés). Ce fichier
//  ne fait que coller l'interface au moteur. RGPD : le fichier membres est lu
//  ici, dans le navigateur ; seul le mapping clé -> Id_client en ressort.
// ============================================================================

const RecapUI = (function () {
  const $ = (s) => document.querySelector(s);
  const T = () => (window.localStorage.getItem('authToken') || '');
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + T() });

  // État de la session courante.
  let mois = '';                 // AAAA-MM (mois M)
  let contratsParStudio = {};    // studio -> [{ cles, nom, prenom }]
  let membres = {};              // clé -> Id_client
  let fichiersM = [];            // [{ nom, cles:Set, lignes, studio }]
  let fichiersM1 = [];
  let studios = {};              // studio -> { encM1, encM, signataires }
  let choix = {};                // studio -> { clientKey -> valeur }
  let resultats = {};            // studio -> retour de calculerStudio
  let inited = false;

  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#rec-mois').value) $('#rec-mois').value = moisParDefaut();
    mois = $('#rec-mois').value;
    charger(); // recharge l'existant du mois
  }

  // Mois M par défaut = le mois précédent (la photo consolidée a un mois de
  // décalage, cf. §8 : M est provisoire tant que le recouvrement n'est pas clos).
  function moisParDefaut() {
    const d = new Date();
    d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function moisLabel(ym, delta) {
    const [a, m] = ym.split('-').map(Number);
    const d = new Date(a, m - 1 + (delta || 0), 1);
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  function wire() {
    $('#rec-mois').addEventListener('change', () => { mois = $('#rec-mois').value; charger(); });
    zone('contrats', $('#rec-file-contrats'), traiterContrats);
    zone('encM1', $('#rec-file-encM1'), (files) => traiterEnc(files, 'M1'));
    zone('encM', $('#rec-file-encM'), (files) => traiterEnc(files, 'M'));
    zone('membres', $('#rec-file-membres'), traiterMembres);
    $('#rec-calc').addEventListener('click', calculer);
  }

  // Une zone de dépôt : glisser/déposer + clic -> input fichier.
  function zone(nom, input, handler) {
    const drop = $('#rec-drop-' + nom);
    const go = (files) => { if (files && files.length) Promise.resolve(handler([...files])).catch((e) => msg(e.message || 'Erreur de lecture.', true)); };
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => go(input.files));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('rec-drop-on'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('rec-drop-on'); }));
    drop.addEventListener('drop', (e) => go(e.dataTransfer.files));
  }

  const buf = (file) => file.arrayBuffer();
  function msg(txt, err) { const el = $('#rec-msg'); if (el) { el.textContent = txt || ''; el.className = 'rec-msg' + (err ? ' rec-msg-err' : ''); } }

  // ── PARSING DES DÉPÔTS ──────────────────────────────────────────────────────
  async function traiterContrats(files) {
    const noms = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) { const l = await RetentionParse.lireContratsZip(await buf(f)); noms.push(...l); }
      else if (/\.pdf$/i.test(f.name)) noms.push(f.name);
    }
    contratsParStudio = RetentionParse.mapContrats(noms);
    const nbC = Object.values(contratsParStudio).reduce((n, l) => n + l.length, 0);
    $('#rec-info-contrats').textContent = nbC + ' contrat(s) · ' + Object.keys(contratsParStudio).length + ' studio(s)';
    detecter();
  }
  async function traiterEnc(files, quand) {
    const lus = [];
    for (const f of files) {
      const rows = RetentionParse.lireTabulaire(await buf(f));
      const lignes = RetentionParse.mapEncaissements(rows);
      const cles = new Set(lignes.map((l) => l.cle));
      lus.push({ nom: f.name, cles, lignes, studio: null });
    }
    if (quand === 'M') fichiersM = dedupFichiers(lus); else fichiersM1 = dedupFichiers(lus);
    $('#rec-info-' + (quand === 'M' ? 'encM' : 'encM1')).textContent = lus.length + ' fichier(s)';
    detecter();
  }
  async function traiterMembres(files) {
    let n = 0;
    for (const f of files) {
      const rows = RetentionParse.lireTabulaire(await buf(f));
      const map = RetentionParse.mapMembres(rows); // RGPD : seulement clé -> Id_client
      Object.assign(membres, map); n += Object.keys(map).length;
    }
    $('#rec-info-membres').textContent = n + ' membre(s) mappé(s) pour les liens Deciplus';
  }
  // Dédup des fichiers d'encaissement identiques (mêmes clients, §8).
  function dedupFichiers(list) {
    const vus = new Set(); const out = [];
    list.forEach((f) => { const id = [...f.cles].sort().join('#'); if (vus.has(id)) return; vus.add(id); out.push(f); });
    return out;
  }

  // ── §3 DÉTECTION DU STUDIO DE CHAQUE FICHIER (corrigeable) ──────────────────
  function detecter() {
    // clés candidates de signataires par studio.
    const sigParStudio = {};
    Object.keys(contratsParStudio).forEach((s) => {
      const set = new Set();
      contratsParStudio[s].forEach((sig) => (sig.cles || []).forEach((k) => set.add(k)));
      sigParStudio[s] = set;
    });
    // M : intersection maximale avec les signataires.
    fichiersM.forEach((f) => { if (!f.studio) f.studio = Retention.detecterStudioM(f.cles, sigParStudio).studio; });
    // M-1 : Jaccard maximal avec les fichiers M déjà rattachés.
    const mParStudio = {};
    fichiersM.forEach((f) => { if (f.studio) mParStudio[f.studio] = f.cles; });
    fichiersM1.forEach((f) => { if (!f.studio) f.studio = Retention.detecterStudioM1(f.cles, mParStudio).studio; });
    renderDetection();
  }

  function renderDetection() {
    const host = $('#rec-detection');
    if (!fichiersM.length && !fichiersM1.length) { host.innerHTML = ''; return; }
    const studiosConnus = [...new Set(Object.keys(contratsParStudio))];
    const ligne = (f, quand, i) => {
      const opts = ['<option value="">— non rattaché —</option>']
        .concat(studiosConnus.map((s) => '<option' + (s === f.studio ? ' selected' : '') + '>' + esc(s) + '</option>'));
      // Studio libre autorisé (si absent des contrats) : on ajoute l'option courante.
      if (f.studio && !studiosConnus.includes(f.studio)) opts.push('<option selected>' + esc(f.studio) + '</option>');
      return '<div class="rec-det-row"><span class="rec-det-file">' + esc(f.nom) + '</span>'
        + '<span class="rec-det-arrow">→</span>'
        + '<select class="rec-det-sel" data-quand="' + quand + '" data-i="' + i + '">' + opts.join('') + '</select></div>';
    };
    host.innerHTML = '<h3 class="rec-h3">Fichiers → studio détecté <small>(corrige si besoin avant de calculer)</small></h3>'
      + (fichiersM1.length ? '<div class="rec-det-grp"><b>Encaissements M-1 (' + moisLabel(mois, -1) + ')</b>' + fichiersM1.map((f, i) => ligne(f, 'M1', i)).join('') + '</div>' : '')
      + (fichiersM.length ? '<div class="rec-det-grp"><b>Encaissements M (' + moisLabel(mois, 0) + ')</b>' + fichiersM.map((f, i) => ligne(f, 'M', i)).join('') + '</div>' : '');
    host.querySelectorAll('.rec-det-sel').forEach((sel) => sel.addEventListener('change', () => {
      const arr = sel.dataset.quand === 'M' ? fichiersM : fichiersM1;
      arr[Number(sel.dataset.i)].studio = sel.value || null;
    }));
  }

  // ── CALCUL ──────────────────────────────────────────────────────────────────
  function calculer() {
    // Regroupe les lignes par studio.
    studios = {};
    const ajoute = (f, cle) => {
      if (!f.studio) return;
      const s = studios[f.studio] || (studios[f.studio] = { encM1: [], encM: [], signataires: [] });
      s[cle] = s[cle].concat(f.lignes);
    };
    fichiersM1.forEach((f) => ajoute(f, 'encM1'));
    fichiersM.forEach((f) => ajoute(f, 'encM'));
    Object.keys(contratsParStudio).forEach((s) => {
      const st = studios[s] || (studios[s] = { encM1: [], encM: [], signataires: [] });
      st.signataires = contratsParStudio[s];
    });
    if (!Object.keys(studios).length) { msg('Dépose au moins des encaissements ou des contrats.', true); return; }
    recalcTout();
    persister();
    msg('Calculé et enregistré.', false);
  }

  function recalcStudio(s) {
    const st = studios[s];
    resultats[s] = Retention.calculerStudio({
      encM1: st.encM1, encM: st.encM, signataires: st.signataires, choix: choix[s] || {},
    });
  }
  function recalcTout() { Object.keys(studios).forEach(recalcStudio); render(); }

  // ── §7 RENDU : tableau RECAP (trié en direct) + détail par studio ───────────
  function render() {
    renderRecap();
    renderDetails();
  }
  const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + ' %');

  function renderRecap() {
    const lignes = Object.keys(resultats).map((s) => ({ s, r: resultats[s] }));
    lignes.sort((a, b) => b.r.note - a.r.note); // meilleur en haut
    const reseau = Retention.noteReseau(lignes.map((x) => x.r));
    const rows = lignes.map((x) => '<tr><td>' + esc(x.s) + '</td><td class="rec-note">' + pct(x.r.note) + '</td></tr>').join('');
    $('#rec-recap').innerHTML = '<h3 class="rec-h3">RECAP · ' + moisLabel(mois, 0) + '</h3>'
      + '<table class="rec-table"><thead><tr><th>Studio</th><th>Note</th></tr></thead><tbody>'
      + rows + '<tr class="rec-reseau"><td>RÉSEAU (pondéré)</td><td class="rec-note">' + pct(reseau) + '</td></tr>'
      + '</tbody></table>';
  }

  function nomLien(cle, nom, prenom) {
    const url = Retention.lienDeciplus(cle, membres);
    const label = esc(((prenom || '') + ' ' + (nom || '')).trim() || cle);
    return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + label + '</a>' : label;
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
  // Couleur de ligne selon le choix (vert = compté, rouge = perte, gris = exclu).
  function classeChoix(cat, val) {
    if (cat === 'baisse') return val === 'sous_controle' ? 'rec-ok' : 'rec-ko';
    if (cat === 'nouveauNonPaye') return val === 'decalage' ? 'rec-ok' : 'rec-ko';
    return (val === 'suspendu' || val === 'nouveau') ? 'rec-ok' : 'rec-gris';
  }

  function renderDetails() {
    const lignes = Object.keys(resultats).sort((a, b) => resultats[b].note - resultats[a].note);
    $('#rec-details').innerHTML = lignes.map((s) => detailStudio(s, resultats[s])).join('');
    // menus -> recalcul en direct + persistance du choix.
    $('#rec-details').querySelectorAll('.rec-menu').forEach((sel) => sel.addEventListener('change', () => {
      const s = sel.dataset.s, cle = sel.dataset.cle;
      (choix[s] || (choix[s] = {}))[cle] = sel.value;
      recalcStudio(s); renderRecap();
      // ré-affiche seulement ce studio (garde le tri des autres inchangé visuellement).
      const bloc = sel.closest('.rec-studio'); if (bloc) bloc.outerHTML = detailStudio(s, resultats[s]);
      renderDetails(); // ré-attache les écouteurs (simple et sûr)
      patchChoix(s, cle, sel.dataset.cat, sel.value);
    }));
  }

  function detailStudio(s, r) {
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
    // Disparus
    if (r.disparus.length) {
      html += section('Disparus', r.disparus.map((d) =>
        '<li class="' + (d.type === 'IMPAYE' ? 'rec-ko' : '') + '">' + nomLien(d.cle, d.nom, d.prenom)
        + ' · <em>' + (d.type === 'IMPAYE' ? 'IMPAYÉ' : 'PARTI') + '</em></li>').join(''));
    }
    // Baisse de tarif
    if (r.baisses.length) {
      html += section('Baisse de tarif', r.baisses.map((b) => {
        const v = choixDe(s, b.cle, 'baisse');
        return '<li class="' + classeChoix('baisse', v) + '">' + nomLien(b.cle, b.nom, b.prenom) + ' ' + menu(s, b.cle, 'baisse', OPT.baisse, v) + '</li>';
      }).join(''));
    }
    // Nouveaux contrats non payés
    if (r.nouveauxNonPayes.length) {
      html += section('Nouveaux contrats non payés', r.nouveauxNonPayes.map((n) => {
        const v = choixDe(s, n.cle, 'nouveauNonPaye');
        return '<li class="' + classeChoix('nouveauNonPaye', v) + '">' + nomLien(n.cle, n.nom, n.prenom) + ' ' + menu(s, n.cle, 'nouveauNonPaye', OPT.nouveauNonPaye, v) + '</li>';
      }).join(''));
    }
    // À qualifier
    if (r.aQualifier.length) {
      html += section('À qualifier', r.aQualifier.map((q) => {
        const v = choixDe(s, q.cle, 'aQualifier');
        return '<li class="' + classeChoix('aQualifier', v) + '">' + nomLien(q.cle, q.nom, q.prenom) + ' ' + menu(s, q.cle, 'aQualifier', OPT.aQualifier, v) + '</li>';
      }).join(''));
    }
    return html + '</div>';
  }
  const section = (titre, contenu) => contenu ? '<div class="rec-sec"><h4>' + esc(titre) + '</h4><ul class="rec-list">' + contenu + '</ul></div>' : '';

  // ── PERSISTANCE ─────────────────────────────────────────────────────────────
  function datasetsPayload() {
    const out = [];
    Object.keys(studios).forEach((s) => {
      out.push({ studio: s, type: 'enc_m1', contenu: studios[s].encM1 });
      out.push({ studio: s, type: 'enc_m', contenu: studios[s].encM });
      out.push({ studio: s, type: 'contrats', contenu: studios[s].signataires });
    });
    // membres : mapping global (RGPD : clé -> Id_client seulement), sous studio '*'.
    out.push({ studio: '*', type: 'membres', contenu: membres });
    return out;
  }
  function choicesPayload() {
    const out = [];
    Object.keys(choix).forEach((s) => Object.keys(choix[s]).forEach((cle) => {
      out.push({ studio: s, client_key: cle, categorie: categorieDe(s, cle), valeur: choix[s][cle] });
    }));
    return out;
  }
  // Retrouve la catégorie d'un choix (pour la persistance) depuis les résultats.
  function categorieDe(s, cle) {
    const r = resultats[s]; if (!r) return 'baisse';
    if (r.baisses.some((x) => x.cle === cle)) return 'baisse';
    if (r.nouveauxNonPayes.some((x) => x.cle === cle)) return 'nouveauNonPaye';
    return 'aQualifier';
  }
  function persister() {
    fetch('/api/retention/' + mois, { method: 'PUT', headers: H(), body: JSON.stringify({ datasets: datasetsPayload(), choices: choicesPayload() }) })
      .catch(() => msg('Enregistrement impossible (réseau).', true));
  }
  function patchChoix(s, cle, cat, val) {
    fetch('/api/retention/' + mois + '/choix', { method: 'PATCH', headers: H(), body: JSON.stringify({ studio: s, client_key: cle, categorie: cat, valeur: val }) }).catch(() => {});
  }

  async function charger() {
    reset();
    try {
      const d = await (await fetch('/api/retention/' + mois, { headers: H() })).json();
      if (!d || !d.datasets) return;
      d.datasets.forEach((ds) => {
        if (ds.type === 'membres') { membres = ds.contenu || {}; return; }
        const st = studios[ds.studio] || (studios[ds.studio] = { encM1: [], encM: [], signataires: [] });
        if (ds.type === 'enc_m1') st.encM1 = ds.contenu || [];
        if (ds.type === 'enc_m') st.encM = ds.contenu || [];
        if (ds.type === 'contrats') st.signataires = ds.contenu || [];
      });
      (d.choices || []).forEach((c) => { (choix[c.studio] || (choix[c.studio] = {}))[c.client_key] = c.valeur; });
      if (Object.keys(studios).length) { recalcTout(); msg('Données du mois rechargées.', false); }
    } catch (_) { /* rien à recharger */ }
  }
  function reset() {
    contratsParStudio = {}; membres = {}; fichiersM = []; fichiersM1 = [];
    studios = {}; choix = {}; resultats = {};
    ['contrats', 'encM1', 'encM', 'membres'].forEach((z) => { const el = $('#rec-info-' + z); if (el) el.textContent = ''; });
    $('#rec-detection').innerHTML = ''; $('#rec-recap').innerHTML = ''; $('#rec-details').innerHTML = ''; msg('');
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  return { open };
})();
