'use strict';
// ============================================================================
//  MY COACH ACADEMY — registre des formations certifiantes (lot 4).
//
//  LE MOTEUR DE CERTIFICATION EST GÉNÉRIQUE ; CE FICHIER DIT CE QU'IL CERTIFIE.
//  Ajouter « Coach Leader », « Vente » ou « Management » demain, c'est ajouter
//  une entrée ici — pas rouvrir lib/academyCertifications.js.
//
//  POURQUOI UN REGISTRE EN CODE ET PAS UNE TABLE :
//  une formation ne porte pas que des libellés, elle porte des PRÉREQUIS. Or un
//  prérequis est une question posée au reste de l'application (« le QCM est-il
//  validé ? », « la pratique est-elle validée ? »), pas une valeur qu'on range
//  dans une colonne. Une table de formations obligerait de toute façon à écrire
//  ces fonctions quelque part, et ajouterait un écran d'administration pour
//  saisir des lignes que personne ne saisira avant d'avoir écrit le code
//  correspondant. On assume donc : le catalogue est du code, versionné et testé.
//
//  ⚠️ CE QUI RESTE MONO-FORMATION, ET C'EST DÉLIBÉRÉ :
//  le CONTENU de l'Academy (modules, contenus, banque de questions,
//  configuration du QCM, tentatives) n'a pas de colonne `formation`. Le rendre
//  multi-formation demanderait de scoper une dizaine de requêtes des lots 1 et
//  2 — un lot à part entière. Ce qui est générique ici, c'est le REGISTRE des
//  certifications : le jour où une seconde formation aura son contenu, elle
//  n'aura rien à migrer de ce côté-ci.
// ============================================================================

const COACH_NUTRITION = 'coach_nutrition';

// Les détails de prérequis sont LUS PAR LE COLLABORATEUR : une date y sort en
// français, pas au format de stockage.
const enFrancais = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
};

// Le catalogue reçoit les moteurs dont les prérequis ont besoin. Il ne les
// interroge JAMAIS de lui-même : c'est le moteur de certification qui appelle
// `prerequis()` au moment de délivrer, donc toujours sur des données fraîches.
function creerRegistre({ qcm, pratique }) {
  const FORMATIONS = [
    {
      cle: COACH_NUTRITION,
      libelle: 'Coach Nutrition',
      titre: 'Coach Nutrition certifié',
      // Ce que la certification OUVRE dans le reste de l'application. Seule
      // Nutrition ouvre les dossiers du Boost aujourd'hui ; une formation
      // « Vente » n'aurait rien à y refléter, et ce drapeau le dira.
      refletBoost: true,

      // Les conditions, dans l'ordre où on les raconte. Chacune INTERROGE le
      // lot qui en est propriétaire — jamais de recalcul local : « la théorie
      // est-elle validée » a une seule réponse dans l'application, et elle vit
      // dans le lot 2.
      prerequis: (email) => {
        const t = qcm.etatPour(email);
        const p = pratique.etatPour(email);
        return [
          {
            cle: 'theorie',
            libelle: 'Évaluation théorique (QCM)',
            rempli: !!t.theorieValidee,
            detail: t.scoreValide === null || t.scoreValide === undefined
              ? null : 'score : ' + t.scoreValide + ' %',
          },
          {
            cle: 'pratique',
            libelle: 'Évaluation pratique',
            rempli: !!p.validee,
            detail: p.valideeLe ? 'validée le ' + enFrancais(p.valideeLe) : null,
          },
        ];
      },

      // Les PREUVES recopiées dans le diplôme au moment de la délivrance. Un
      // diplôme doit pouvoir se relire seul, des années plus tard, sans dépendre
      // de données qui auront bougé entre-temps.
      preuves: (email) => {
        const t = qcm.etatPour(email);
        const p = pratique.etatPour(email);
        const validee = p.historique.find((h) => h.resultat === 'valide') || null;
        return {
          scoreQcm: t.scoreValide === undefined ? null : t.scoreValide,
          pratiqueLe: validee ? (validee.dateEvaluation || validee.decideLe) : null,
          pratiquePar: validee ? validee.evaluateur : null,
        };
      },
    },
  ];

  const parCle = new Map(FORMATIONS.map((f) => [f.cle, f]));

  return {
    liste: () => FORMATIONS.map((f) => ({ cle: f.cle, libelle: f.libelle, titre: f.titre, refletBoost: !!f.refletBoost })),
    lire: (cle) => parCle.get(String(cle || '').trim()) || null,
    // La formation par défaut tant qu'il n'y en a qu'une : les routes n'ont pas
    // à l'exiger, et l'écran n'a pas à la choisir.
    defaut: () => FORMATIONS[0],
  };
}

module.exports = { creerRegistre, COACH_NUTRITION };
