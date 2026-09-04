'use strict';
// ============================================================================
//  MY COACH ACADEMY — LE RÉFÉRENTIEL, LU PAR LE CERTIFICATEUR.
//
//  LE MÉTIER D'ABORD. Un certificateur ne suit pas de parcours : il suit CEUX
//  DES AUTRES. Pour prononcer un résultat, il doit connaître exactement ce sur
//  quoi il prononce — les modules, les contenus, les questions du QCM, les cas
//  pratiques, la grille et les règles qui mènent au diplôme.
//
//  CE QU'IL N'AVAIT PAS. Un seul chemin existait pour lire tout cela : entrer
//  dans la formation COMME APPRENANT (`/api/academy/formation`). Ce chemin lui
//  servait un écran de progression personnelle qui ne le concerne pas — et,
//  sur un certificateur non collaborateur, se refermait sur un 403. Ce module
//  est l'autre chemin : la même matière, sans le parcours.
//
//  TROIS PROPRIÉTÉS, ET ELLES SONT STRUCTURELLES :
//
//   1. IL NE SAIT PAS ÉCRIRE. Pas une seule instruction INSERT, UPDATE ou
//      DELETE ici. Consulter un QCM n'ouvre donc aucune tentative, consulter
//      une évaluation pratique n'ouvre aucune évaluation, et lire une
//      formation ne crée aucune progression. Ce n'est pas une promesse tenue
//      par la prudence de l'appelant : il n'y a rien à appeler.
//   2. IL N'INVENTE AUCUNE RÈGLE. Tout se compose de lectures existantes —
//      `formations.lister`, `admin.arbre`, `pratique.listerCas`,
//      `grilles.grillePour` — ou se déduit des drapeaux de la formation. Une
//      règle réécrite ici finirait par diverger de celle du moteur.
//   3. IL NE MONTRE QUE LE VIVANT. Modules, contenus, questions, cas et
//      critères ARCHIVÉS n'en sortent pas : le certificateur doit voir ce
//      qu'un coach traverse aujourd'hui, pas l'histoire du catalogue. Les
//      brouillons, eux, se filtrent d'un cran plus haut — c'est la route qui
//      décide quelles formations elle demande (cf. academyRoutes).
// ============================================================================

const { USAGE_FINALE, USAGE_MINI } = require('./academyQcm');
const { statutAxe, LIB_AXE, MAITRISE, A_RENFORCER, NON_MAITRISE } = require('./academyGrilles');

function createAcademyReferentiel({ getDb, formations, admin, pratique, grilles }) {
  const db = () => getDb();
  const cleDe = (c) => String(c || '').trim().toLowerCase();

  // ==========================================================================
  //  LES COMPTEURS DE LA LISTE — et pourquoi ils passent par du SQL.
  //
  //  `admin.arbre` sait déjà tout compter, mais il rapporte AUSSI le texte
  //  intégral de chaque contenu. L'appeler 34 fois pour afficher « 6 modules »
  //  ferait voyager des mégaoctets de cours pour six chiffres. On compte donc
  //  ici, en base, et on garde `admin.arbre` pour la fiche d'UNE formation —
  //  là où le texte est justement ce qu'on vient lire.
  //
  //  Ces requêtes ne décident de rien : elles comptent ce que les lectures
  //  canoniques serviraient (`actif = 1`, la même colonne partout).
  // ==========================================================================
  const CPT_MODULES = 'SELECT COUNT(*) AS n FROM academy_modules WHERE formation = ? AND actif = 1';
  const CPT_CONTENUS = `SELECT COUNT(*) AS n FROM academy_contenus c
                        JOIN academy_modules m ON m.id = c.module_id
                        WHERE m.formation = ? AND m.actif = 1 AND c.actif = 1`;
  const CPT_QUESTIONS = `SELECT usage, COUNT(*) AS n FROM academy_questions
                         WHERE formation = ? AND actif = 1 GROUP BY usage`;

  function compteurs(formationCle) {
    const cle = cleDe(formationCle);
    const parUsage = new Map(db().prepare(CPT_QUESTIONS).all(cle).map((r) => [r.usage, r.n]));
    // Les cas et la grille passent par leurs lectures canoniques : elles sont
    // courtes, et ce sont EXACTEMENT les listes que le certificateur verra.
    const grille = grilles ? grilles.grillePour(cle) : [];
    return {
      nbModules: db().prepare(CPT_MODULES).get(cle).n,
      nbContenus: db().prepare(CPT_CONTENUS).get(cle).n,
      nbQuestionsFinale: parUsage.get(USAGE_FINALE) || 0,
      nbQuestionsMini: parUsage.get(USAGE_MINI) || 0,
      nbCas: pratique.listerCas(cle).length,
      nbAxes: grille.length,
      nbCriteres: grille.reduce((n, a) => n + a.criteres.length, 0),
    };
  }

  // La carte d'identité d'une formation, telle que le certificateur la lit :
  // ce qu'elle est, ce qu'elle exige, et les réglages de ses deux épreuves.
  // AUCUN champ de progression — il n'en a pas, et lui en servir un vide
  // ferait croire à un parcours personnel qui n'existe pas.
  const carte = (f) => ({
    cle: f.cle,
    libelle: f.libelle,
    description: f.description || null,
    categorie: f.categorie || null,
    titre: f.titre || null,
    ordre: f.ordre,
    actif: !!f.actif,
    pratiqueObligatoire: !!f.pratiqueObligatoire,
    certificationActive: !!f.certificationActive,
    qcm: { nbQuestions: f.qcmNbQuestions, seuilPct: f.qcmSeuilPct },
    mini: { nbQuestions: f.miniNbQuestions, seuilPct: f.miniSeuilPct },
  });

  // Le catalogue du certificateur. `toutes` n'est PAS un droit qu'on prend
  // ici : la route le passe, et elle ne le passe qu'à l'administrateur.
  function lister({ toutes = false } = {}) {
    return formations.lister({ toutes }).map((f) => ({ ...carte(f), ...compteurs(f.cle) }));
  }

  // ==========================================================================
  //  LES ÉTAPES QUI MÈNENT AU DIPLÔME — la règle, sans personne pour la subir.
  //
  //  `academyCertifications.prerequisDe` répond « où en est CETTE personne ? ».
  //  Le certificateur pose l'autre question : « qu'exige cette formation ? ».
  //  Les deux se déduisent des MÊMES DEUX DRAPEAUX — la théorie est toujours
  //  demandée, la pratique seulement si `pratique_obligatoire` — et la suite
  //  des clés est donc identique, ce qu'un test vérifie.
  // ==========================================================================
  const etapesDe = (f) => {
    const liste = [{
      cle: 'theorie',
      libelle: 'Évaluation théorique (QCM)',
      regle: 'Score d\'au moins ' + f.qcmSeuilPct + ' % sur ' + f.qcmNbQuestions +
        ' questions tirées de la banque finale.',
    }];
    if (f.pratiqueObligatoire) {
      liste.push({
        cle: 'pratique',
        libelle: 'Évaluation pratique',
        // LA GRILLE NE PRONONCE RIEN, et le dire ici évite qu'un certificateur
        // cherche un seuil qui n'existe pas (cf. academyGrilles).
        regle: 'Mise en situation prononcée « validée » par un certificateur. ' +
          'La grille éclaire la décision, elle ne la remplace pas ; un commentaire ' +
          'est exigé dès qu\'un critère n\'est pas acquis.',
      });
    }
    return liste;
  };

  // La règle de lecture d'un axe, telle que `statutAxe` la calcule. Servie au
  // certificateur pour qu'il lise sa grille sans avoir à la deviner.
  const REGLES_AXE = [
    { cle: MAITRISE, libelle: LIB_AXE[MAITRISE], regle: 'tous les critères de l\'axe sont acquis' },
    { cle: A_RENFORCER, libelle: LIB_AXE[A_RENFORCER], regle: 'un seul critère manque, et au moins un est acquis' },
    { cle: NON_MAITRISE, libelle: LIB_AXE[NON_MAITRISE], regle: 'au-delà d\'un critère manquant' },
  ];

  // ==========================================================================
  //  UNE QUESTION, AVEC OU SANS SON CORRIGÉ.
  //
  //  ⚠️ SANS CORRIGÉ, ON RETIRE LA CLÉ — on ne la met pas à `false`. Un
  //  `correct: false` partout serait un corrigé, et il serait faux.
  //  `multiple` part avec : savoir qu'une question attend deux réponses est
  //  déjà la moitié du corrigé.
  // ==========================================================================
  const vueQuestion = (q, corrige) => {
    const base = {
      id: q.id, moduleId: q.moduleId, usage: q.usage, enonce: q.enonce, ordre: q.ordre,
      choix: q.choix.filter((c) => c.actif).map((c) => (corrige
        ? { id: c.id, texte: c.texte, correct: !!c.correct }
        : { id: c.id, texte: c.texte })),
    };
    return corrige ? { ...base, multiple: !!q.multiple } : base;
  };

  // ==========================================================================
  //  LE RÉFÉRENTIEL COMPLET D'UNE FORMATION.
  //
  //  `corrige` est décidé par la route, jamais ici : ce module ne connaît
  //  personne — il ne reçoit ni email ni jeton, et ne peut donc pas se tromper
  //  de destinataire.
  // ==========================================================================
  function lire(formationCle, { corrige = false } = {}) {
    const a = admin.arbre(cleDe(formationCle));
    if (!a || !a.formation) return null;
    const f = a.formation;

    const modules = a.modules.filter((m) => m.actif).map((m) => ({
      id: m.id,
      titre: m.titre,
      description: m.description || null,
      ordre: m.ordre,
      contenus: m.contenus.filter((c) => c.actif).map((c) => ({
        id: c.id, type: c.type, titre: c.titre, description: c.description || null,
        youtubeId: c.youtubeId || null, texte: c.texte || null,
        dureeMin: c.dureeMin, ordre: c.ordre,
      })),
    }));

    const vivantes = a.questions.filter((q) => q.actif);
    const grille = grilles ? grilles.grillePour(f.cle) : [];

    return {
      formation: carte(f),
      modules,
      qcm: {
        corrige: !!corrige,
        finale: {
          nbQuestions: f.qcmNbQuestions,
          seuilPct: f.qcmSeuilPct,
          questions: vivantes.filter((q) => q.usage === USAGE_FINALE).map((q) => vueQuestion(q, corrige)),
        },
        mini: {
          nbQuestions: f.miniNbQuestions,
          seuilPct: f.miniSeuilPct,
          questions: vivantes.filter((q) => q.usage === USAGE_MINI).map((q) => vueQuestion(q, corrige)),
        },
      },
      pratique: {
        obligatoire: !!f.pratiqueObligatoire,
        // Les cas ACTIFS, dans leur forme d'évaluation — scénario compris, tel
        // que la fiche réelle les sert. C'est ce qui garantit que le
        // référentiel ne peut pas diverger de ce qui sera évalué.
        cas: pratique.listerCas(f.cle),
        grille,
        reglesAxe: REGLES_AXE,
        verdicts: [
          { cle: 'valide', libelle: 'Validée' },
          { cle: 'a_repasser', libelle: 'À repasser' },
        ],
      },
      certification: {
        active: !!f.certificationActive,
        titre: f.titre || null,
        etapes: etapesDe(f),
      },
      compteurs: compteurs(f.cle),
    };
  }

  return { lister, lire, compteurs, etapesDe };
}

module.exports = { createAcademyReferentiel };
