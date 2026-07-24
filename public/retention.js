'use strict';
// ============================================================================
//  RÉTENTION — moteur de calcul de la note mensuelle par studio + note réseau.
//
//  PUR et DÉTERMINISTE : il ne lit aucun fichier, aucune base. On lui passe des
//  données DÉJÀ parsées (lignes d'encaissement, signataires, choix de menus) et
//  il rend des nombres et des listes. Le parsing (PDF/xlsx/HTML) et l'UI vivent
//  ailleurs — ici, seulement la logique métier, validée sur données réelles.
//
//  Chargé DES DEUX CÔTÉS (UMD) : le navigateur pour le calcul en direct, Node
//  pour les tests. La règle « reproduire exactement » se vérifie donc par test.
//
//  ⚠️ RÈGLE D'OR : on compare les clients sur le PRIX UNITAIRE, jamais sur le
//  total mensuel seul (la facturation est hebdomadaire → 4 ou 5 semaines selon
//  le mois). Une vraie baisse de tarif = prix unitaire EN BAISSE *et* net en
//  baisse (sinon on signalerait à tort une montée en gamme).
// ============================================================================

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Retention = api;
}(typeof self !== 'undefined' ? self : this, function () {

  // ── §2.5 NORMALISATION ─────────────────────────────────────────────────────
  // MAJUSCULES, sans accents, espaces réduits. La clé de rapprochement d'un
  // client entre M-1, M et les contrats en dépend : deux graphies du même nom
  // doivent produire la MÊME clé.
  function normNom(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ') // ponctuation/tirets -> espace
      .trim()
      .replace(/\s+/g, ' ');
  }
  // Clé client = NORM(Nom)|NORM(Prenom). Les colonnes Nom/Prenom des exports
  // d'encaissement sont structurées : la clé est donc NON ambiguë ici.
  function cleClient(nom, prenom) { return normNom(nom) + '|' + normNom(prenom); }

  // ── §2.1 CONTRATS : parsing du NOM DE FICHIER (on n'ouvre pas le PDF) ───────
  // {YYMMDD}{seq}-{prenom}-{nom}-contrat-My-coach-{studio}.pdf
  function titleCase(s) {
    return String(s || '').split(' ').filter(Boolean)
      .map((m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()).join(' ');
  }
  function parseContratFilename(nomFichier) {
    const base = String(nomFichier || '').replace(/\.pdf$/i, '');
    // 6 chiffres de date + séquence(s) ignorée(s), puis nom, puis studio.
    const m = /^(\d{6})\d*-(.+)-contrat-my-coach-(.+)$/i.exec(base);
    if (!m) return null;
    const [, ymd, nomBloc, studioBloc] = m;
    const an = 2000 + Number(ymd.slice(0, 2));
    const mois = ymd.slice(2, 4);
    const jour = ymd.slice(4, 6);
    const date = an + '-' + mois + '-' + jour;
    const nomComplet = nomBloc.replace(/-/g, ' ').trim();
    const studio = titleCase(studioBloc.replace(/-/g, ' ').trim());
    return { date, studio, nomComplet, cles: clesContrat(nomComplet) };
  }

  // Le nom de fichier donne « prénom nom » collés, mais on ne sait pas où
  // s'arrête le prénom (noms composés). On génère donc TOUTES les clés candidates
  // — pour chaque point de coupe, dans les DEUX lectures (prénom-nom et
  // nom-prénom). Il y a correspondance si l'une matche la clé d'un client.
  function clesContrat(nomComplet) {
    const toks = normNom(nomComplet).split(' ').filter(Boolean);
    const out = new Set();
    if (!toks.length) return [];
    if (toks.length === 1) { out.add(toks[0] + '|'); out.add('|' + toks[0]); return [...out]; }
    for (let i = 1; i < toks.length; i++) {
      const a = toks.slice(0, i).join(' ');
      const b = toks.slice(i).join(' ');
      out.add(b + '|' + a); // lecture « prénom(a) nom(b) » -> NOM|PRENOM
      out.add(a + '|' + b); // lecture « nom(a) prénom(b) » -> NOM|PRENOM
    }
    return [...out];
  }

  // ── §4.1 AGRÉGATS PAR CLIENT (sur UN mois) ─────────────────────────────────
  // Chaque ligne : { cle, montant (nombre, signé), decaissement (bool) }.
  // On raisonne TOUJOURS sur le net (positifs + négatifs) : un rejet s'annule
  // avec son prélèvement. Jamais ligne par ligne.
  function agregerParClient(lignes) {
    const map = new Map();
    (lignes || []).forEach((l) => {
      const cle = l.cle;
      let a = map.get(cle);
      if (!a) { a = { cle, net: 0, positifs: [], aDecaissement: false, nbLignes: 0 }; map.set(cle, a); }
      const montant = Number(l.montant) || 0;
      a.net += montant;
      a.nbLignes += 1;
      if (montant > 0) a.positifs.push(montant);
      if (l.decaissement) a.aDecaissement = true;
    });
    map.forEach((a) => {
      a.pu = modeMontant(a.positifs);           // prix unitaire = mode des positifs
      a.nbEcheances = a.positifs.length;         // nb de lignes positives
    });
    return map;
  }

  // Prix unitaire = valeur la plus fréquente parmi les lignes positives.
  // Départage déterministe : à fréquence égale, le montant le plus élevé (le
  // tarif « de référence » plutôt qu'une régularisation partielle). 0 si aucune.
  function modeMontant(positifs) {
    if (!positifs || !positifs.length) return 0;
    const compte = new Map();
    positifs.forEach((v) => compte.set(v, (compte.get(v) || 0) + 1));
    let meilleur = 0, meilleurN = -1;
    compte.forEach((n, v) => {
      if (n > meilleurN || (n === meilleurN && v > meilleur)) { meilleurN = n; meilleur = v; }
    });
    return meilleur;
  }

  // ── §5 MENUS : options et valeurs par défaut ───────────────────────────────
  const MENU = {
    baisse: { options: ['sous_controle', 'arrangement'], defaut: 'arrangement' },
    nouveauNonPaye: { options: ['decalage', 'anomalie'], defaut: 'anomalie' },
    aQualifier: { options: ['suspendu', 'nouveau', 'pack'], defaut: 'pack' },
    // Qualification d'un disparu : « impaye » / « resilie » comptent PAREIL
    // (churn, aucune différence de note) ; « pack » (pack de séance) est EXCLU
    // du calcul. Défaut = le type auto détecté (impayé si décaissement, sinon
    // résilié).
    disparu: { options: ['impaye', 'resilie', 'anomalie', 'pack'], defaut: 'resilie' },
  };
  const choixOu = (choix, cle, defaut) => {
    const v = choix && choix[cle];
    return v == null || v === '' ? defaut : v;
  };

  // ── §4 + §6 CALCUL D'UN STUDIO ─────────────────────────────────────────────
  // Entrée :
  //   encM1, encM : tableaux de lignes { cle, montant, decaissement }
  //   signataires : [{ cles:[...candidates], nom, prenom }]  (déjà dédupliqués)
  //   choix       : { [cle]: 'sous_controle'|'arrangement'|'decalage'|'anomalie'|
  //                          'suspendu'|'nouveau'|'pack' }
  // Sortie : les listes détaillées + les compteurs + la note.
  function calculerStudio({ encM1, encM, signataires, choix, resiliations } = {}) {
    const agM1 = agregerParClient(encM1);
    const agM = agregerParClient(encM);
    choix = choix || {};

    // Résiliations du mois (fichier « contrats résiliés ») : un résilié est un
    // DÉPART CERTAIN. On l'ajoute à la population et on le force en disparu, même
    // s'il a encore payé une échéance ce mois-ci (préavis). Prioritaire sur la
    // détection par paiement.
    const resSet = new Set();
    const resInfo = new Map();
    (resiliations || []).forEach((r) => {
      if (!r || !r.cle || resSet.has(r.cle)) return;
      resSet.add(r.cle); resInfo.set(r.cle, r);
    });

    // §4.2 BASE = clients de M-1 qui ont réellement payé (net > 0) + les résiliés
    // (ils faisaient partie des membres, même s'ils n'ont pas payé en M-1).
    const base = new Set();
    agM1.forEach((a, cle) => { if (a.net > 0) base.add(cle); });
    resSet.forEach((cle) => base.add(cle));

    // §4.3 Classement de chaque client de la base (M-1 -> M).
    const fidelesList = [];       // FIDÈLE (compte au numérateur)
    const baisses = [];           // EN PROBLÈME (baisse de tarif) -> menu §5.1
    const disparus = [];          // DISPARU { cle, type: 'IMPAYE'|'PARTI'|'RESILIE' }
    const preavis = [];           // RÉSILIÉ mais ENCORE PAYÉ (préavis) -> NEUTRE (hors note)
    base.forEach((cle) => {
      const aM1 = agM1.get(cle);
      const aM = agM.get(cle);
      if (resSet.has(cle)) {
        const r = resInfo.get(cle);
        const infosR = { cle, nom: (r && r.nom) || nomDe(cle), prenom: (r && r.prenom) || prenomDe(cle) };
        if (aM && aM.net > 0) {
          // Résilié mais a encore payé ce mois (préavis) -> NEUTRE : ni fidèle, ni
          // disparu, EXCLU du dénominateur. Il sera compté au mois où le paiement
          // disparaît (détection normale par non-paiement) -> évite le double comptage.
          infosR.baisse = !!(aM1 && aM.pu < aM1.pu && aM.net < aM1.net);
          preavis.push(infosR);
        } else {
          // Résilié ET ne paie plus -> vrai départ, compté ce mois-ci (une seule fois).
          disparus.push(Object.assign(infosR, { type: 'RESILIE' }));
        }
        return;
      }
      const infos = { cle, nom: nomDe(cle), prenom: prenomDe(cle) };
      if (aM && aM.net > 0) {
        if (aM1 && aM.pu < aM1.pu && aM.net < aM1.net) baisses.push(infos); // baisse de tarif
        else fidelesList.push(infos);                                        // fidèle
      } else {
        // net(M) <= 0 -> disparu. Décaissement = impayé (récupérable) ; sinon parti.
        const type = (aM && aM.aDecaissement) ? 'IMPAYE' : 'PARTI';
        disparus.push(Object.assign(infos, { type }));
      }
    });

    // §4.4 NOUVEAUX CONTRATS (signataires de M) -> payé / non payé.
    const sig = dedupSignataires(signataires);
    const clesSignataires = new Set(); // les clés M déjà « prises » par un signataire
    let nouveauxPayes = 0;
    const nouveauxNonPayes = [];
    sig.forEach((s) => {
      if ((s.cles || []).some((k) => resSet.has(k))) return; // signé ET résilié le même mois -> ignoré ici
      let netM = 0, cleMatch = null;
      (s.cles || []).forEach((k) => {
        const a = agM.get(k);
        if (a) { clesSignataires.add(k); if (a.net > netM) { netM = a.net; cleMatch = k; } }
      });
      if (netM > 0) nouveauxPayes += 1;
      else nouveauxNonPayes.push({ cle: cleMatch || (s.cles && s.cles[0]) || cleClient(s.nom, s.prenom), nom: s.nom, prenom: s.prenom });
    });

    // Liste des signataires (pour l'affichage « Nouveaux signés » : payés + non
    // payés). N'entre PAS dans le calcul — expose juste des données déjà connues.
    const signatairesListe = sig.filter((s) => !(s.cles || []).some((k) => resSet.has(k))).map((s) => {
      let netM = 0, cleMatch = null;
      (s.cles || []).forEach((k) => { const a = agM.get(k); if (a && a.net > netM) { netM = a.net; cleMatch = k; } });
      return { cle: cleMatch || (s.cles && s.cles[0]) || cleClient(s.nom, s.prenom), nom: s.nom, prenom: s.prenom, paye: netM > 0 };
    });

    // §4.5 À QUALIFIER = net(M) > 0, hors base, hors signataires.
    const aQualifier = [];
    agM.forEach((a, cle) => {
      if (a.net > 0 && !base.has(cle) && !clesSignataires.has(cle)) {
        aQualifier.push({ cle, nom: nomDe(cle), prenom: prenomDe(cle) });
      }
    });

    // §5 application des choix -> §6 compteurs.
    const nbSousControle = baisses.filter((b) => choixOu(choix, b.cle, MENU.baisse.defaut) === 'sous_controle').length;
    const nbDecalage = nouveauxNonPayes.filter((n) => choixOu(choix, n.cle, MENU.nouveauNonPaye.defaut) === 'decalage').length;
    const nbAnomalie = nouveauxNonPayes.filter((n) => choixOu(choix, n.cle, MENU.nouveauNonPaye.defaut) === 'anomalie').length;
    const nbQualActifs = aQualifier.filter((q) => {
      const v = choixOu(choix, q.cle, MENU.aQualifier.defaut);
      return v === 'suspendu' || v === 'nouveau';
    }).length;
    // Qualification effective d'un disparu : le choix s'il existe, sinon le type
    // auto (impayé si décaissement, sinon résilié). « pack » -> exclu du calcul.
    const disparuChoix = (d) => {
      const v = choix[d.cle];
      return (v === 'impaye' || v === 'resilie' || v === 'anomalie' || v === 'pack') ? v : (d.type === 'IMPAYE' ? 'impaye' : 'resilie');
    };
    // « pack » exclu du calcul ; « anomalie » reste compté comme perte (déjà en
    // base M-1) -> aucun double comptage, juste un libellé distinct pour le suivi.
    const disparusComptes = disparus.filter((d) => disparuChoix(d) !== 'pack');
    const nbDisparuPack = disparus.length - disparusComptes.length;
    const nbPreavis = preavis.length; // résiliés encore en paiement : neutres (hors dénominateur)

    const fideles = fidelesList.length + nbSousControle; // §6
    const baseN = base.size;
    const nsig = nouveauxPayes + nbDecalage;
    const numerateur = fideles + nsig + nbQualActifs;
    const denominateur = (baseN - nbDisparuPack - nbPreavis) + nsig + nbAnomalie + nbQualActifs;
    const note = denominateur > 0 ? numerateur / denominateur : 0;

    return {
      // compteurs bruts
      base: baseN,
      fideles,
      nbFideles: fidelesList.length,
      nbSousControle,
      nouveauxPayes,
      nsig,
      anomalies: nbAnomalie,
      qualActifs: nbQualActifs,
      numerateur,
      denominateur,
      note,
      // §6 « Disparus » affiché = disparus COMPTÉS (hors packs) + anomalies.
      // Les compteurs impayés/résiliés suivent le choix du menu (défaut = type auto).
      disparusAffichage: disparusComptes.length + nbAnomalie,
      nbImpayes: disparusComptes.filter((d) => disparuChoix(d) === 'impaye').length,
      nbPartis: disparusComptes.filter((d) => disparuChoix(d) === 'resilie').length,
      nbResilies: disparus.filter((d) => d.type === 'RESILIE').length,
      nbDisparuPack,
      nbPreavis,
      // listes détaillées (pour l'écran §7)
      disparus,
      baisses,
      nouveauxNonPayes,
      aQualifier,
      preavis,
      // Listes exposées pour la navigation par carte KPI (déjà calculées).
      baseListe: Array.from(base).map((cle) => { const rr = resInfo.get(cle); return { cle, nom: (rr && rr.nom) || nomDe(cle), prenom: (rr && rr.prenom) || prenomDe(cle) }; }),
      fidelesListe: fidelesList,
      signatairesListe,
    };

    // Ces deux helpers ne servent qu'à réétaler la clé en Nom/Prénom lisibles.
    function nomDe(cle) { return (cle.split('|')[0] || ''); }
    function prenomDe(cle) { return (cle.split('|')[1] || ''); }
  }

  // Dédup des contrats identiques (même personne, même studio) : on garde une
  // occurrence par jeu de clés candidates.
  function dedupSignataires(signataires) {
    const vus = new Set();
    const out = [];
    (signataires || []).forEach((s) => {
      const id = (s.cles || []).slice().sort().join('#');
      if (vus.has(id)) return;
      vus.add(id); out.push(s);
    });
    return out;
  }

  // ── §6 NOTE RÉSEAU (pondérée) ──────────────────────────────────────────────
  // Σ numérateurs / Σ dénominateurs : un gros studio pèse plus qu'un petit.
  function noteReseau(resultats) {
    let num = 0, den = 0;
    (resultats || []).forEach((r) => { num += (r.numerateur || 0); den += (r.denominateur || 0); });
    return den > 0 ? num / den : 0;
  }

  // ── §3 DÉTECTION DU STUDIO D'UN FICHIER D'ENCAISSEMENT ──────────────────────
  // Les fichiers ne portent pas le nom du studio ; on le déduit.
  function jaccard(setA, setB) {
    if (!setA.size && !setB.size) return 0;
    let inter = 0;
    setA.forEach((x) => { if (setB.has(x)) inter += 1; });
    const union = setA.size + setB.size - inter;
    return union ? inter / union : 0;
  }
  // Fichiers M : studio = celui dont le PLUS de signataires apparaissent dans les
  // clients du fichier. `signatairesParStudio` : { studio: Set(cles candidates) }.
  function detecterStudioM(clesFichier, signatairesParStudio) {
    let best = null, bestN = -1;
    Object.keys(signatairesParStudio || {}).forEach((studio) => {
      const keys = signatairesParStudio[studio];
      let n = 0;
      keys.forEach((k) => { if (clesFichier.has(k)) n += 1; });
      if (n > bestN) { bestN = n; best = studio; }
    });
    return { studio: best, score: bestN };
  }
  // Fichiers M-1 : les signataires de M n'existent pas encore -> on rapproche par
  // similarité de clientèle (Jaccard maximal) avec les fichiers M déjà rattachés.
  // `fichiersMParStudio` : { studio: Set(cles clients du fichier M) }.
  function detecterStudioM1(clesFichier, fichiersMParStudio) {
    let best = null, bestJ = -1;
    Object.keys(fichiersMParStudio || {}).forEach((studio) => {
      const j = jaccard(clesFichier, fichiersMParStudio[studio]);
      if (j > bestJ) { bestJ = j; best = studio; }
    });
    return { studio: best, score: bestJ };
  }

  // ── §7.1 LIEN FICHE DECIPLUS ───────────────────────────────────────────────
  // Résout l'Id_client via le mapping du fichier membres (clé -> id). Sans id,
  // renvoie null (l'UI affiche alors le nom en texte simple, pas un lien cassé).
  function lienDeciplus(cle, mappingIds) {
    const id = mappingIds && mappingIds[cle];
    if (!id) return null;
    return 'https://ginkgo-sport.deciplus.pro/nextgen/legacy?path=check.php?idj=' + encodeURIComponent(id);
  }

  return {
    normNom, cleClient, clesContrat, parseContratFilename, titleCase,
    agregerParClient, modeMontant,
    calculerStudio, noteReseau, dedupSignataires,
    jaccard, detecterStudioM, detecterStudioM1,
    lienDeciplus, MENU,
  };
}));
