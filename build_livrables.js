const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat, TableOfContents, HeadingLevel,
        BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber, PageBreak } = require('docx');
const fs = require('fs');

// ---------- Constantes de style ----------
const ORANGE = "EA580C";
const ORANGE_DARK = "C13F05";
const GREY_BORDER = "CCCCCC";
const HEAD_FILL = "EA580C";
const ALT_FILL = "FBEDE4";
const NOTE_FILL = "FFF4E6";

const CONTENT_W = 9360; // US Letter, 1" margins

const border = { style: BorderStyle.SINGLE, size: 1, color: GREY_BORDER };
const borders = { top: border, bottom: border, left: border, right: border,
  insideHorizontal: border, insideVertical: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

// ---------- Helpers ----------
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}
// paragraph from runs
function pr(runs, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, children: runs, ...opts });
}
function bullet(text, runs) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 40 },
    children: runs || [new TextRun(text)],
  });
}
function numbered(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 40 },
    children: [new TextRun(text)],
  });
}

// Note / callout box (single-cell table)
function note(runs) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [ new TableRow({ children: [ new TableCell({
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: ORANGE },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: ORANGE },
        left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE },
        right: { style: BorderStyle.SINGLE, size: 1, color: ORANGE },
      },
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { fill: NOTE_FILL, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 160, right: 160 },
      children: runs.map(r => new Paragraph({ children: r })),
    }) ] }) ],
  });
}

// Generic table builder. headers = [strings], rows = [[cellRuns|string]], widths = [dxa]
function makeTable(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((htext, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: HEAD_FILL, type: ShadingType.CLEAR },
      margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: htext, bold: true, color: "FFFFFF", size: 20 })] })],
    })),
  });
  const bodyRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, i) => {
      let children;
      if (Array.isArray(cell)) {
        // array of paragraphs already
        children = cell;
      } else {
        children = [new Paragraph({ children: [new TextRun({ text: String(cell), size: 20 })] })];
      }
      return new TableCell({
        borders, width: { size: widths[i], type: WidthType.DXA },
        shading: ri % 2 === 1 ? { fill: ALT_FILL, type: ShadingType.CLEAR } : undefined,
        margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
        children,
      });
    }),
  }));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

// cell helper: array of bullet-ish paragraphs inside a table cell
function cellLines(lines) {
  return lines.map(l => new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text: "• " + l, size: 18 })],
  }));
}
function cellText(text, opts = {}) {
  return [new Paragraph({ children: [new TextRun({ text, size: 20, ...opts })] })];
}

const children = [];

// ============================================================
// TITRE / COUVERTURE
// ============================================================
children.push(new Paragraph({
  spacing: { before: 2400, after: 0 },
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "MYCOACH", bold: true, size: 72, color: ORANGE })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 360 },
  children: [new TextRun({ text: "Méthode Hormozy — Architecture & Déploiement", bold: true, size: 32, color: "333333" })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 120 },
  children: [new TextRun({ text: "Les 4 livrables clé en main", size: 28, color: "666666" })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 1200 },
  children: [new TextRun({ text: "Document opérationnel — coachs & studios", italics: true, size: 24, color: "888888" })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 4 } },
  spacing: { before: 600 },
  children: [new TextRun({ text: "Architecture d'offres  ·  Offre core (Défi 6 sem.)  ·  Plan de délivrance  ·  Lancement interne", size: 18, color: "999999" })],
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
// SOMMAIRE
// ============================================================
children.push(h1("Sommaire"));
children.push(new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-2" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
// CONTEXTE
// ============================================================
children.push(h1("Le système en bref"));
children.push(p("Le marché du fitness s'est polarisé : low price (Basic Fit, Fitness Park) d'un côté, premium de l'autre. Le mid-market se fait écraser. La méthode Hormozy consiste à arrêter de courir après le volume de leads et à basculer sur la marge via une offre premium."));
children.push(pr([
  new TextRun({ text: "Inversion des priorités : ", bold: true }),
  new TextRun("Offre → Produit → Vente → Pub (et non l'inverse)."),
]));
children.push(p("La chaîne complète (les 4 livrables) :"));
children.push(numbered("Livrable 1 — L'architecture d'offres : les 4 niveaux de la value ladder."));
children.push(numbered("Livrable 2 — Le descriptif complet de l'offre core (le Défi 6 semaines)."));
children.push(numbered("Livrable 3 — Le plan de délivrance semaine par semaine, utilisable par les coachs."));
children.push(numbered("Livrable 4 — Le plan de lancement interne sur la base existante."));
children.push(note([[
  new TextRun({ text: "Règle de la chaîne de vélo : ", bold: true, color: ORANGE_DARK }),
  new TextRun("un seul maillon cassé (rappel trop lent, lead magnet faible, pas de filtrage, vente high-ticket non maîtrisée, suivi absent) et tout le système s'arrête. Il faut tout mettre en place, dans l'ordre."),
]]));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
// LIVRABLE 1
// ============================================================
children.push(h1("Livrable 1 — Architecture d'offres MyCoach"));
children.push(p("Quatre niveaux. On attire par le Défi (N1), on upsell immédiatement vers le Premium (N2), on maximise le cash en comptant (N3), et on garde un filet de secours jamais mis en avant (N4)."));

children.push(makeTable(
  ["Niveau", "Nom de l'offre", "Rôle dans le système", "Inclus", "Prix"],
  [
    [
      cellText("N1 — Le Défi", { bold: true }),
      cellText("« Métamorphose 42 » (-10% de masse grasse en 6 sem.)"),
      cellText("Front-end / aimant. Remplace la séance d'essai. Crée l'opportunité de vente, filtre les touristes, encaisse cash d'avance. Tremplin vers le N2."),
      cellLines(["Bilan corporel entrée + sortie","3 séances small group / sem","Nutrition pilotée (appli)","Accountability quotidienne","Communauté","Garantie résultat"]),
      cellText("497 € (déductible du N2)"),
    ],
    [
      cellText("N2 — Le Premium", { bold: true }),
      cellText("« Programme Signature MyCoach »"),
      cellText("Cœur de marge. Cible de l'upsell immédiat, puis relances S4 et S6."),
      cellLines(["Tout le N1","Coaching small group personnalisé","Programmation individualisée","Nutrition pilotée par le coach","Bilans mensuels","Coach référent + events"]),
      cellText("297–320 €/mois (12 mois)"),
    ],
    [
      cellText("N3 — Le VIP comptant", { bold: true }),
      cellText("« Pack Transformation Annuel VIP »"),
      cellText("Maximisation trésorerie. Encaisser comptant (Client Financed Acquisition)."),
      cellLines(["Tout le N2 sur 12 mois","Bonus séances individuelles","Suivi composition corporelle renforcé","Place event + goodies","Payé comptant"]),
      cellText("~3 200 € comptant"),
    ],
    [
      cellText("N4 — L'Essentiel", { bold: true }),
      cellText("« Accès Essentiel »"),
      cellText("Downsell / filet. Jamais présenté d'emblée. Sert d'ancrage. À garder seulement si rentable."),
      cellLines(["Accès séances collectives / plateau","Sans accompagnement perso","Sans nutrition","Sans accountability"]),
      cellText("49–69 €/mois (sortie)"),
    ],
  ],
  [1100, 1700, 2400, 2660, 1500]
));

children.push(h3("Comment ça s'enchaîne (le shift mental de la vente)"));
children.push(numbered("Le prospect vient pour le Défi (N1) → on vend ça."));
children.push(numbered("Au closing : « Ce défi, je peux te l'offrir : on le recrédite sur le Programme Signature, et je t'ajoute X. » → upsell N2."));
children.push(numbered("S'il dit oui au mensuel → on tente le comptant N3 (cash tout de suite)."));
children.push(numbered("S'il bloque sur le premium → downsell vers le défi seul, puis re-tentatives S4 et S6."));
children.push(numbered("Vraiment rien ne passe → N4 en dernier recours (jamais en vitrine)."));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
// LIVRABLE 2
// ============================================================
children.push(h1("Livrable 2 — Descriptif de l'offre core (Défi 6 semaines)"));
children.push(p("Le moteur du système : l'offre qui attire, filtre et finance l'acquisition. Construite sur les leviers Hormozy : résultat réel + certitude + rapidité + facilité, dépôt de confiance, scarcity."));

children.push(h3("Nom de l'offre"));
children.push(p("« Métamorphose 42 — Le défi qui transforme ton corps en 6 semaines »", { bold: true }));

children.push(h3("Promesse principale (1 phrase)"));
children.push(note([[
  new TextRun({ text: "En 6 semaines, perds jusqu'à 10% de ta masse grasse — accompagné·e, nourri·e et suivi·e chaque jour — ou on te rembourse.", bold: true }),
]]));

children.push(h3("Les 3 dimensions détaillées"));
children.push(p("Le prospect veut un résultat, pas un accès à une salle. On vend les 3 piliers qui produisent ce résultat :"));
children.push(makeTable(
  ["Dimension", "Ce que c'est", "Pourquoi ça vend"],
  [
    [ cellText("1. L'Entraînement encadré", { bold: true }),
      cellText("3 séances/sem en small group, programmées et corrigées par un coach (fitness / fight), progressives."),
      cellText("Il a essayé seul et a échoué → ici il est pris en main, ça devient facile.") ],
    [ cellText("2. La Nutrition pilotée", { bold: true }),
      cellText("Plan personnalisé via appli : recettes selon ses goûts, liste de courses, macros / déficit calculés, ajusté par le coach."),
      cellText("« Si tu suis, c'est mathématique » → apporte la certitude du résultat.") ],
    [ cellText("3. Accountability + Communauté", { bold: true }),
      cellText("Photos repas + check-in quotidien, relance dès qu'il décroche, groupe de challengers qui s'encouragent."),
      cellText("On ne quitte pas une famille → c'est ce qui retient et fait venir.") ],
  ],
  [2400, 4060, 2900]
));

children.push(h3("Les inclus (liste complète)"));
[
  "Bilan corporel d'entrée et de sortie (masse grasse / musculaire / mensurations)",
  "3 séances coaching small group / semaine (18 séances au total)",
  "Accès appli nutrition personnalisée (recettes + liste de courses + macros)",
  "Suivi nutrition piloté par le coach",
  "Check-in quotidien + relances accountability (WhatsApp / appli)",
  "Accès au groupe communauté privé des challengers",
  "Photo avant / après + débrief des résultats en fin de défi",
  "Coach référent identifié pendant toute la durée",
].forEach(t => children.push(bullet(t)));

children.push(h3("La garantie choisie"));
children.push(pr([
  new TextRun({ text: "Garantie résultat « satisfait ou remboursé » : ", bold: true }),
  new TextRun("si tu suis le protocole (présence aux séances + plan nutrition + check-ins) et que tu n'atteins pas ton objectif, on te rembourse intégralement."),
]));
children.push(p("Renverse le risque sur le club, pas sur le client. Conditionnée au sérieux → filtre les touristes et protège juridiquement (conditions écrites au contrat → pas de publicité trompeuse).", { italics: true, size: 20 }));

children.push(h3("Le dépôt de confiance (montant + conditions)"));
children.push(pr([new TextRun({ text: "Montant : 497 € ", bold: true }), new TextRun("encaissés à l'inscription.")]));
children.push(bullet("Objectif atteint + envie de continuer → recrédité à 100% sur le Programme Signature (N2) → le défi devient « gratuit »."));
children.push(bullet("Objectif atteint + veut s'arrêter → remboursé (≈ 20-30% des cas)."));
children.push(bullet("Protocole non suivi → conservé (le client a choisi de ne pas jouer le jeu)."));

children.push(h3("Les bonus (liste avec valeur perçue)"));
children.push(p("À annoncer « uniquement si tu signes aujourd'hui » (scarcity / urgence) :", { size: 20 }));
children.push(makeTable(
  ["Bonus", "Valeur perçue"],
  [
    ["Accès à vie à l'appli nutrition + bibliothèque de recettes", "149 €"],
    ["1 séance bilan individuelle avec le coach référent", "80 €"],
    ["Guide « Maintenir tes résultats après le défi » (PDF/vidéos)", "49 €"],
    ["Place pour le challenge inter-clubs de l'été", "39 €"],
    [ cellText("Valeur bonus totale", { bold: true }), cellText("317 € offerts", { bold: true }) ],
  ],
  [7000, 2360]
));

children.push(h3("Prix et modalités de paiement"));
children.push(bullet("Prix affiché : 497 € (face à une valeur réelle > 1 000 € avec les bonus)."));
children.push(bullet("Comptant 497 € (CB / RIB sur place) → option mise en avant."));
children.push(bullet("Facilité 3 × 169 € sans frais (pour lever l'objection cash)."));
children.push(bullet("Engagement : aucun au-delà des 6 semaines → la date de fin certaine est ce qui fait signer."));
children.push(note([[
  new TextRun({ text: "Point d'attention : ", bold: true, color: ORANGE_DARK }),
  new TextRun("le test précédent a échoué sur le prix (3 participants / 100 leads). Ici la valeur perçue (3 dimensions + bonus + garantie) est ce qui débloque ça. Le reste se joue sur le produit et la vente émotionnelle."),
]]));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
// LIVRABLE 3
// ============================================================
children.push(h1("Livrable 3 — Plan de délivrance semaine par semaine"));
children.push(p("Document opérationnel : chaque coach peut le suivre tel quel pour piloter un challenger de J-1 à S6. Objectif double = résultats (rétention + bouche-à-oreille) et conversion vers le Programme Signature (3 fenêtres d'upsell : J0, S4, S6)."));
children.push(note([[
  new TextRun({ text: "Règle d'or : ", bold: true, color: ORANGE_DARK }),
  new TextRun("chaque point de contact où le challenger ne répond pas = relance dans les 24h. L'accountability, c'est le produit."),
]]));

children.push(h2("Onboarding (J-1 et J0)"));
children.push(h3("J-1 — Avant la 1re séance"));
[
  "Message de bienvenue perso (vocal > texte) : « Hâte de te voir demain, voici ton créneau + ce qu'il faut prévoir ».",
  "Envoi accès appli nutrition + ajout au groupe communauté des challengers.",
  "Présentation publique dans le groupe : « On accueille [Prénom] qui démarre le défi 💪 ».",
  "Rappel J-1 du RDV bilan (réduit le no-show).",
].forEach(t => children.push(bullet(t)));
children.push(h3("J0 — Bilan d'entrée + 1re séance"));
[
  "Bilan corporel complet (masse grasse / musculaire / mensurations / photo départ).",
  "Fixer l'objectif chiffré ensemble (ex. -X kg / -10% MG) → engagement écrit.",
  "Paramétrer le plan nutrition dans l'appli (goûts, contraintes).",
  "Expliquer le deal accountability : « Tu m'envoies tes repas en photo + check-in chaque jour, et je te relance si tu décroches — c'est pour ça que ça marche ».",
  "1re séance encadrée (qu'il/elle réussisse et reparte fier·e).",
  "Programmer dès maintenant les RDV S4 et S6 dans l'agenda.",
].forEach(t => children.push(bullet(t)));

children.push(h2("S1 — Lancement & habitudes"));
children.push(pr([new TextRun({ text: "Actions coach : ", bold: true }), new TextRun("corriger technique + ajuster intensité (réussite = motivation) ; valider la prise en main de l'appli nutrition.")]));
children.push(pr([new TextRun({ text: "Points de contact : ", bold: true }), new TextRun("3 séances small group ; check-in quotidien (photos repas validées dans le groupe) ; 1 message de feedback en milieu de semaine ; relance immédiate à la moindre absence.")]));

children.push(h2("S2–S3 — Premiers résultats & relances"));
children.push(pr([new TextRun({ text: "Actions coach : ", bold: true }), new TextRun("faire constater les 1ers résultats (énergie, vêtements, balance) → ancrer le « ça marche » ; ajuster nutrition ; mettre en avant un challenger qui progresse (preuve sociale).")]));
children.push(pr([new TextRun({ text: "Relances (cœur de la rétention) : ", bold: true }), new TextRun("repérer les décrocheurs → appel, pas SMS. Script : « Je n'ai pas vu ton repas hier, tout va bien ? On ne lâche pas, t'es exactement là où il faut être. » Réinscrire les absents au prochain créneau.")]));

children.push(h2("S4–S5 — Bilan intermédiaire + 1re conversation de continuation"));
children.push(pr([new TextRun({ text: "Actions coach : ", bold: true }), new TextRun("RDV bilan S4 (déjà calé à J0) : mesures + comparaison à l'objectif ; ajuster le plan pour la dernière ligne droite.")]));
children.push(pr([new TextRun({ text: "Conversation de continuation (1er upsell) : ", bold: true }), new TextRun("« T'as déjà perdu X. Il te reste 2 semaines. Mais le vrai changement, c'est sur la durée. Je peux te recréditer ton défi (497 €) sur le Programme Signature — du coup il te revient à 0, et je t'offre 2 mois. Mais c'est valable aujourd'hui. » Si oui → bascule N2 (et tenter le comptant N3). Si non → « On en reparle à la fin » + noter pour S6.")]));

children.push(h2("S6 — Bilan final + conversion"));
children.push(pr([new TextRun({ text: "Actions coach : ", bold: true }), new TextRun("bilan de sortie complet (mesures finales, photo après, comparatif avant/après) ; célébration publique dans le groupe + recueil témoignage (texte/vidéo → réutilisé en pub) ; statuer sur la garantie (remboursement OU recrédit).")]));
children.push(pr([new TextRun({ text: "Conversion (2e upsell — fenêtre décisive) : ", bold: true }), new TextRun("émotionnel d'abord (« Regarde d'où tu pars. Tu veux t'arrêter là ou aller au bout ? ») ; proposer le Programme Signature (défi recrédité = quasi offert s'il a réussi) ; tenter le comptant VIP (N3) ; refus premium → downsell vers l'Essentiel (N4), jamais avant ; refus total → garder dans le groupe communauté (reste chaud).")]));

children.push(h3("Récap des points de contact (à cocher par coach)"));
children.push(makeTable(
  ["Moment", "Séances", "Check-in quotidien", "RDV / Appel clé", "Upsell"],
  [
    ["J-1 / J0", "1re séance", "démarrage", "Bilan entrée", "(semer)"],
    ["S1", "3", "Oui", "feedback mi-semaine", "—"],
    ["S2–3", "6", "Oui", "relance décrocheurs", "—"],
    ["S4–5", "6", "Oui", "Bilan S4", "#1"],
    ["S6", "3", "Oui", "Bilan final", "#2 + comptant"],
  ],
  [1500, 1700, 2300, 2360, 1500]
));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ============================================================
// LIVRABLE 4
// ============================================================
children.push(h1("Livrable 4 — Plan de Lancement Interne (base existante)"));
children.push(p("Avant de dépenser 1 € en pub, on monétise la base chaude. Les membres actuels te connaissent déjà → ils signent plus vite, donnent du cash immédiat et les premiers témoignages avant/après (le carburant des futures pubs). Logique en 3 vagues à prix croissant = rareté réelle + urgence."));

children.push(h3("Liste des 10 meilleurs clients à contacter en Beta 1"));
children.push(p("Critères de priorité (le « bon grain ») :", { bold: true, size: 20 }));
children.push(numbered("Ancienneté + assiduité (vient régulièrement = croit déjà en toi)."));
children.push(numbered("A déjà un objectif clair non atteint (perte de poids / recomposition)."));
children.push(numbered("Bon payeur, jamais d'impayé."));
children.push(numbered("Ambassadeur potentiel (parraine déjà)."));
children.push(numbered("A le budget (panier actuel ≥ moyenne)."));
children.push(p("Sélection issue de ton export adhérents (154 membres, My Coach Vieux Lille), classée par score : assiduité récente + ancienneté + engagement (nb de transactions), comptes gratuits/influenceurs et impayés écartés.", { size: 20, italics: true }));
const STUDIO = "Vieux Lille";
const beta = [
  ["1",  "Cédric Demanze",         STUDIO, "3,6 ans", "Perte de poids (à conf.)", "128 achats · formule à conf.",  "🟢"],
  ["2",  "Thierry Delavalle",      STUDIO, "3,4 ans", "Perte de poids (à conf.)", "164 achats · formule à conf.",  "🟢"],
  ["3",  "Jacques Houssin",        STUDIO, "2,9 ans", "Perte de poids (à conf.)", "127 achats · formule à conf.",  "🟢"],
  ["4",  "Tom Gobart",             STUDIO, "2,8 ans", "Perte de poids (à conf.)", "133 achats · Challenge 7 mois", "🟢"],
  ["5",  "Claire Bontemps",        STUDIO, "3,4 ans", "Perte de poids (à conf.)", "162 achats · formule à conf.",  "🟢"],
  ["6",  "Claude Gardanne",        STUDIO, "2,9 ans", "Perte de poids (à conf.)", "145 achats · Challenge 7 mois", "🟢"],
  ["7",  "Aurélie Vermesse",       STUDIO, "3,9 ans", "Perte de poids (à conf.)", "50 achats · formule à conf.",   "🟢"],
  ["8",  "Yannick Skrzypacz",      STUDIO, "2,9 ans", "Perte de poids (à conf.)", "145 achats · Challenge 4 mois", "🟢"],
  ["9",  "Alexandre Mikolajczak",  STUDIO, "3,9 ans", "Perte de poids (à conf.)", "50 achats · formule à conf.",   "🟡"],
  ["10", "Mickaël Buffard",        STUDIO, "1,6 an",  "Perte de poids (à conf.)", "82 achats · Challenge 7 mois",  "🟢"],
];
children.push(makeTable(
  ["#", "Prénom Nom", "Studio", "Ancienneté", "Objectif", "Engagement / Panier", "Proba."],
  beta,
  [460, 2200, 1300, 1200, 1900, 1700, 600]
));
children.push(p("À confirmer en RDV : l'objectif précis et le panier mensuel exact ne figurent pas dans l'export (déduits du programme suivi). « Achats » = nombre de transactions enregistrées, proxy d'engagement et d'ancienneté de consommation.", { size: 18, italics: true, color: "666666" }));

children.push(h3("Pitch du Lancement Interne (3 phrases)"));
children.push(p("À envoyer en vocal/message perso, jamais en masse :", { size: 20, italics: true }));
children.push(numbered("« [Prénom], on lance un nouveau programme d'accompagnement premium — résultat garanti en 6 semaines, nutrition + coaching + suivi quotidien — et je pense direct à toi vu ton objectif. »"));
children.push(numbered("« Comme tu fais partie de mes membres les plus fidèles, je t'offre la place fondateur : le meilleur tarif, qu'on ne refera jamais, avant l'ouverture au public. »"));
children.push(numbered("« Il n'y a que 10 places à ce prix, je te réserve la tienne ? On en parle 10 min cette semaine. »"));

children.push(h3("Prix des 3 vagues"));
children.push(p("(base : Programme Signature N2 = ~300 €/mois public)", { size: 20, italics: true }));
children.push(makeTable(
  ["Vague", "Qui", "Positionnement", "Prix", "Places"],
  [
    [ cellText("Beta 1 — Fondateurs", { bold: true }), "Top 10 base chaude", "Tarif « jamais revu », contre témoignage avant/après", "197 €/mois (ou 1 997 € comptant/an)", "10"],
    [ cellText("Vague 2 — Pionniers", { bold: true }), "Reste de la base", "Tarif de lancement", "247 €/mois", "15–20"],
    [ cellText("Vague 3 — Public", { bold: true }), "Nouveaux (pub)", "Tarif normal", "297–320 €/mois", "ouvert"],
  ],
  [1900, 1700, 2660, 2200, 900]
));
children.push(p("Le prix monte à chaque vague → ceux qui hésitent voient le train partir (scarcity vraie). Les Fondateurs deviennent ambassadeurs et preuves sociales.", { size: 20, italics: true }));

children.push(h3("Objectif de CA (nombre de clients × prix)"));
children.push(p("Hypothèse Beta 1 (à valider sur ta base) :", { bold: true, size: 20 }));
children.push(makeTable(
  ["Scénario", "Clients signés", "Prix", "CA mensuel récurrent", "CA annualisé"],
  [
    ["Prudent", "5 / 10", "197 €", "985 €/mois", "11 820 €"],
    ["Réaliste", "7 / 10", "197 €", "1 379 €/mois", "16 548 €"],
    [ cellText("Si comptant", { bold: true }), "7 × 1 997 €", "—", cellText("13 979 € cash immédiat", { bold: true }), "—"],
  ],
  [1600, 1900, 1400, 2700, 1760]
));
children.push(pr([
  new TextRun({ text: "En ajoutant la Vague 2 ", bold: true }),
  new TextRun("(réaliste, 12 signés à 247 €) → +2 964 €/mois récurrent → base totale ≈ 4 300 €/mois de récurrent neuf, sans 1 € de pub."),
]));

children.push(h3("Séquence d'exécution (7 jours)"));
children.push(numbered("J1 : sélectionner les 10 (critères ci-dessus)."));
children.push(numbered("J2-3 : vocaux persos + caler les RDV."));
children.push(numbered("J4-6 : RDV de présentation (vente émotionnelle, closing)."));
children.push(numbered("J7 : clôturer Beta 1, annoncer Vague 2 dans la communauté."));
children.push(numbered("Récolter témoignages avant/après → alimente la pub."));

// ============================================================
// DOCUMENT
// ============================================================
const doc = new Document({
  creator: "MyCoach",
  title: "MyCoach — Méthode Hormozy : les 4 livrables",
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: "222222" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, font: "Arial", color: ORANGE },
        paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: ORANGE_DARK },
        paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [ new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 2 } },
      children: [new TextRun({ text: "MyCoach · Méthode Hormozy", size: 16, color: "999999" })],
    }) ] }) },
    footers: { default: new Footer({ children: [ new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [ new TextRun({ text: "Page ", size: 16, color: "999999" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "999999" }),
        new TextRun({ text: " / ", size: 16, color: "999999" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "999999" }) ],
    }) ] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MyCoach-Methode-Hormozy-4-Livrables.docx", buffer);
  console.log("OK: MyCoach-Methode-Hormozy-4-Livrables.docx (" + buffer.length + " bytes)");
});
