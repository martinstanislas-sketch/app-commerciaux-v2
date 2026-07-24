'use strict';
// ============================================================================
//  RÉTENTION — PARSING des fichiers déposés (contrats, encaissements, membres).
//
//  Deux couches, séparées volontairement :
//   - la TRANSFORMATION de lignes (mapEncaissements, mapMembres, détection de
//     colonnes, parsing des montants) : PURE, sans dépendance -> testable en Node ;
//   - les ADAPTATEURS de lecture (lireTabulaire via XLSX, lireContratsZip via
//     JSZip) : navigateur seulement, minces, non testés en unité.
//
//  ⚠️ RGPD : mapMembres ne conserve QUE Id_client + Nom + Prénom. Toute autre
//  colonne (IBAN, BIC, RIB, RUM, e-mail, téléphone, adresse) est jetée à la
//  lecture et n'est ni renvoyée, ni stockée, ni journalisée.
// ============================================================================

(function (root, factory) {
  const api = factory(root && root.Retention);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RetentionParse = api;
}(typeof self !== 'undefined' ? self : this, function (RetentionMod) {

  // En Node (tests), on charge le moteur pour cleClient ; au navigateur il est
  // déjà global (window.Retention).
  const Retention = RetentionMod || (typeof require !== 'undefined' ? require('./retention.js') : null);
  const cleClient = (nom, prenom) => Retention.cleClient(nom, prenom);

  // ── Détection tolérante d'une colonne par son en-tête ──────────────────────
  // Les exports Deciplus varient (accents, majuscules, espaces). On normalise
  // l'en-tête et on teste plusieurs libellés candidats.
  function normEntete(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function trouverColonne(entetes, candidats) {
    const norm = entetes.map(normEntete);
    for (const c of candidats) {
      const cn = normEntete(c);
      const i = norm.findIndex((e) => e === cn);
      if (i >= 0) return entetes[i];
    }
    // repli : correspondance partielle (l'en-tête CONTIENT le candidat)
    for (const c of candidats) {
      const cn = normEntete(c);
      const i = norm.findIndex((e) => e.includes(cn));
      if (i >= 0) return entetes[i];
    }
    return null;
  }

  // Montant « 69 », « 69,00 », « 1 234,56 », « -69 » -> nombre. '' -> 0.
  function parseMontant(v) {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).trim().replace(/[€\s ]/g, '');
    if (!s) return 0;
    // format FR : la virgule est le séparateur décimal.
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  const contient = (s, mot) => normEntete(s).includes(normEntete(mot));

  // Mois couvert (AAAA-MM) d'UNE date, quel que soit le format Deciplus :
  //  - 'JJ/MM/AAAA' (+ heure éventuelle) ;
  //  - 'AAAA-MM-JJ' / 'AAAA/MM/JJ' ;
  //  - numéro de série Excel (jours depuis 1899-12-30), si SheetJS n'a pas
  //    converti la cellule en date.
  //  - objet Date (cellDates).
  function ymDeDate(v) {
    if (v instanceof Date && !isNaN(v)) return v.getUTCFullYear() + '-' + String(v.getUTCMonth() + 1).padStart(2, '0');
    let s = String(v == null ? '' : v).trim();
    if (!s) return null;
    let m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(s); // AAAA-MM-JJ
    if (m) return m[1] + '-' + m[2].padStart(2, '0');
    m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);   // JJ/MM/AAAA
    if (m) return m[3] + '-' + m[2].padStart(2, '0');
    if (/^\d+(\.\d+)?$/.test(s)) {                          // série Excel
      const n = Math.floor(Number(s));
      if (n > 20000 && n < 80000) {
        const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      }
    }
    return null;
  }
  // Mois couvert d'un fichier = le mois MAJORITAIRE de ses lignes (§A1 : déduit
  // des dates, jamais du nom de fichier ni de la date d'upload). Les lignes de
  // date illisible sont ignorées.
  function moisDeLignes(lignes) {
    const compte = new Map();
    (lignes || []).forEach((l) => { const ym = ymDeDate(l.date); if (ym) compte.set(ym, (compte.get(ym) || 0) + 1); });
    let best = null, bestN = -1;
    compte.forEach((n, ym) => { if (n > bestN) { bestN = n; best = ym; } });
    return best;
  }
  // Mois précédent d'un AAAA-MM (pour résoudre le M-1).
  function moisPrecedent(ym) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return null;
    const d = new Date(Date.UTC(a, m - 2, 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  // ── §2.2 ENCAISSEMENTS : lignes -> objets exploités par le moteur ──────────
  // `rows` = tableau d'objets { En-tête: valeur } (sortie de XLSX.utils.sheet_to_json).
  // Sortie : { cle, montant, decaissement } (+ date, description, nom, prenom pour l'UI).
  function mapEncaissements(rows) {
    if (!rows || !rows.length) return [];
    const entetes = Object.keys(rows[0]);
    const cDate = trouverColonne(entetes, ['Date']);
    const cDesc = trouverColonne(entetes, ['Description', 'Libellé', 'Libelle']);
    const cPrix = trouverColonne(entetes, ['Prix TTC total', 'Prix TTC', 'Montant TTC', 'Montant', 'Prix']);
    const cNom = trouverColonne(entetes, ['Nom']);
    const cPrenom = trouverColonne(entetes, ['Prenom', 'Prénom']);
    if (!cPrix || !cNom || !cPrenom) {
      throw new Error('Colonnes manquantes (attendu Prix TTC total, Nom, Prénom). En-têtes lus : ' + entetes.join(', '));
    }
    return rows.map((r) => {
      const desc = cDesc ? String(r[cDesc] || '') : '';
      const decaissement = contient(desc, 'decaissement');
      const encaissement = contient(desc, 'encaissement echeance');
      let montant = parseMontant(r[cPrix]);
      // Le marqueur prime sur le signe brut : décaissement = négatif, échéance = positif.
      if (decaissement) montant = -Math.abs(montant);
      else if (encaissement) montant = Math.abs(montant);
      return {
        cle: cleClient(r[cNom], r[cPrenom]),
        montant,
        decaissement,
        date: cDate ? String(r[cDate] || '') : '',
        description: desc,
        nom: String(r[cNom] || ''),
        prenom: String(r[cPrenom] || ''),
      };
    });
  }

  // ── §2.4 MEMBRES : mapping clé -> Id_client, et RIEN d'autre (RGPD) ─────────
  function mapMembres(rows) {
    const out = {};
    if (!rows || !rows.length) return out;
    const entetes = Object.keys(rows[0]);
    const cId = trouverColonne(entetes, ['Id_client', 'Id client', 'IdClient', 'Id']);
    const cNom = trouverColonne(entetes, ['Nom']);
    const cPrenom = trouverColonne(entetes, ['Prenom', 'Prénom']);
    if (!cId || !cNom || !cPrenom) {
      throw new Error('Fichier membres : colonnes Id_client / Nom / Prénom introuvables.');
    }
    rows.forEach((r) => {
      const id = String(r[cId] == null ? '' : r[cId]).trim();
      if (!id) return;
      // ⚠️ On ne lit QUE ces 3 champs. r peut contenir IBAN/RIB/e-mail : on n'y
      // touche pas, et rien du reste ne sort d'ici.
      out[cleClient(r[cNom], r[cPrenom])] = id;
    });
    return out;
  }

  // ── RÉSILIATIONS : export « contrats résiliés » -> clés des départs du mois ──
  // Colonnes Deciplus : Prénom, Nom, Prestation, …, Date de résiliation, Date
  // d'annulation, Date de fin. On ne garde QUE Nom/Prénom, filtrés sur le mois M
  // (via la date de résiliation/annulation/fin, la première lisible).
  function mapResiliations(rows, moisM) {
    const out = [];
    if (!rows || !rows.length) return out;
    const entetes = Object.keys(rows[0]);
    const cNom = trouverColonne(entetes, ['Nom']);
    const cPrenom = trouverColonne(entetes, ['Prenom', 'Prénom']);
    if (!cNom || !cPrenom) {
      throw new Error('Fichier résiliations : colonnes Nom / Prénom introuvables. En-têtes lus : ' + entetes.join(', '));
    }
    const dateCols = ['Date de résiliation', 'Date de resiliation', "Date d'annulation", 'Date de fin']
      .map((c) => trouverColonne(entetes, [c])).filter(Boolean);
    const seen = new Set();
    rows.forEach((r) => {
      const nom = String(r[cNom] || ''), prenom = String(r[cPrenom] || '');
      if (!nom && !prenom) return;
      // Mois de résiliation (1re date lisible parmi les colonnes candidates).
      let ym = null;
      for (const dc of dateCols) { const y = ymDeDate(r[dc]); if (y) { ym = y; break; } }
      if (moisM && ym !== moisM) return; // filtre optionnel (usage mono-mois)
      const cle = cleClient(nom, prenom);
      if (seen.has(cle)) return; seen.add(cle);
      out.push({ cle, nom, prenom, ym }); // ym exposé pour la répartition multi-mois
    });
    return out;
  }

  // ── §2.1 CONTRATS : noms de fichiers -> signataires ────────────────────────
  // `nomsFichiers` = tableau de noms de fichiers .pdf (issus du zip ou déposés
  // directement). On dédup les contrats identiques (§8).
  function mapContrats(nomsFichiers) {
    const parStudio = {}; // studio -> [{ cles, nom, prenom, date }]
    const vus = new Set();
    (nomsFichiers || []).forEach((nom) => {
      const c = Retention.parseContratFilename(nom);
      if (!c) return;
      const id = c.studio + '#' + c.cles.slice().sort().join('#');
      if (vus.has(id)) return;
      vus.add(id);
      // Le bloc « prénom nom » : on garde une version lisible pour l'affichage.
      const parts = c.nomComplet.split(' ');
      const prenom = parts[0] || '';
      const nomFam = parts.slice(1).join(' ');
      (parStudio[c.studio] = parStudio[c.studio] || []).push({ cles: c.cles, nom: nomFam, prenom, date: c.date });
    });
    return parStudio;
  }

  // ── ADAPTATEURS NAVIGATEUR (XLSX / JSZip) ──────────────────────────────────
  // Lit un fichier tabulaire : vrai .xlsx (OOXML) OU .xls qui est en réalité du
  // HTML (vieux exports Deciplus). SheetJS gère les deux ; on détecte le HTML
  // pour le lire en 'string'. Renvoie le tableau d'objets ligne.
  function estHTML(u8) {
    // Cherche '<' / '<table' / '<html' dans les premiers octets.
    const debut = new TextDecoder('utf-8', { fatal: false }).decode(u8.slice(0, 512)).toLowerCase();
    return debut.includes('<table') || debut.includes('<html') || debut.trimStart().startsWith('<');
  }
  function lireTabulaire(arrayBuffer) {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS (XLSX) non chargé.');
    const u8 = new Uint8Array(arrayBuffer);
    let wb;
    if (estHTML(u8)) {
      const html = new TextDecoder('utf-8', { fatal: false }).decode(u8);
      wb = XLSX.read(html, { type: 'string' });
    } else {
      wb = XLSX.read(u8, { type: 'array' });
    }
    // La feuille de données = celle qui a le plus de lignes (les exports Deciplus
    // n'ont qu'une feuille utile).
    let best = null, bestN = -1;
    wb.SheetNames.forEach((n) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
      if (rows.length > bestN) { bestN = rows.length; best = rows; }
    });
    return best || [];
  }
  // Liste les noms de fichiers .pdf d'un zip de contrats (on n'ouvre pas les PDF).
  async function lireContratsZip(arrayBuffer) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip non chargé.');
    const zip = await JSZip.loadAsync(arrayBuffer);
    const noms = [];
    zip.forEach((chemin, entree) => {
      if (!entree.dir && /\.pdf$/i.test(chemin)) noms.push(chemin.split('/').pop());
    });
    return noms;
  }

  return {
    normEntete, trouverColonne, parseMontant,
    mapEncaissements, mapMembres, mapContrats, mapResiliations,
    ymDeDate, moisDeLignes, moisPrecedent,
    // adaptateurs navigateur
    estHTML, lireTabulaire, lireContratsZip,
  };
}));
