'use strict';
// ============================================================================
//  ÉTAPE 1 — OUVRIR LE CRM, ET RIEN D'AUTRE.
//
//  Ce script ouvre Chromium (visible), sur un PROFIL PERSISTANT dédié, et
//  s'efface : c'est TOI qui te connectes, à la main, dans la fenêtre. Il ne lit
//  rien, n'extrait rien, ne clique nulle part.
//
//  ⚠️ AUCUN IDENTIFIANT ICI, ET JAMAIS. Le script ne demande, ne stocke et ne
//  journalise aucun login ni mot de passe. La connexion se fait dans le
//  navigateur, comme d'habitude ; c'est le profil persistant qui retient la
//  session ensuite (cookies), exactement comme un Chrome ordinaire.
//
//  ⚠️ LE DOSSIER DE PROFIL EST UN SECRET. Il contient la session connectée :
//  il est ignoré par git (.gitignore) et ne doit jamais être partagé.
//
//  Usage :
//    node open-crm.js                    -> ouvre CRM_URL (ou l'URL par défaut)
//    node open-crm.js https://mon-crm/   -> ouvre l'URL passée en argument
//    CRM_URL=https://mon-crm/ node open-crm.js
// ============================================================================

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

// URL du CRM : argument, puis variable d'environnement, puis valeur par défaut
// (celle du CRM déjà référencé dans l'app — RECAP en fait des liens de fiche).
// Rien de sensible : c'est une adresse publique, pas un accès.
const DEFAUT = 'https://ginkgo-sport.deciplus.pro/';
const CRM_URL = process.argv[2] || process.env.CRM_URL || DEFAUT;

// Profil persistant : un vrai dossier de profil Chromium, gardé entre deux
// lancements. C'est LUI qui rend la session durable — on se reconnecte une
// fois, pas à chaque exécution.
const PROFIL = path.join(__dirname, '.session', 'chromium');

(async () => {
  fs.mkdirSync(PROFIL, { recursive: true });
  const dejaVu = fs.existsSync(path.join(PROFIL, 'Default'));

  console.log('┌─ CRM — ouverture du navigateur');
  console.log('│  URL      : ' + CRM_URL);
  console.log('│  Profil   : ' + PROFIL);
  console.log('│  Session  : ' + (dejaVu ? 'profil existant réutilisé (tu es peut-être déjà connecté)' : 'profil neuf — première connexion à faire à la main'));
  console.log('└─ Ctrl+C dans ce terminal pour fermer le navigateur.\n');

  // Port de debug OPTIONNEL (CRM_DEBUG_PORT=9222). Il permet à un script
  // d'observation de s'ATTACHER à cette fenêtre déjà connectée, puis de se
  // détacher sans la fermer — donc sans jamais te faire refaire le login.
  // ⚠️ N'écoute que sur la boucle locale, et seulement si tu le demandes.
  const port = parseInt(process.env.CRM_DEBUG_PORT || '', 10);
  const args = ['--start-maximized'];
  if (Number.isFinite(port) && port > 0) {
    args.push('--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1');
    console.log('│  Debug    : port ' + port + ' (127.0.0.1) — attache possible, aucune donnée exposée à l\'extérieur');
  }

  // headless: false PAR DÉFAUT -> fenêtre visible, tu gardes la main.
  // CRM_HEADLESS=1 lance sans fenêtre : beaucoup plus léger en mémoire, utile
  // pour la COLLECTE une fois la session déjà établie dans le profil (Chromium
  // visible s'est fait tuer trois fois par manque de mémoire). À ne pas utiliser
  // pour la première connexion, qui demande de voir l'écran.
  const sansFenetre = /^(1|true|on)$/i.test(process.env.CRM_HEADLESS || '');
  if (sansFenetre) console.log('│  Mode     : headless (aucune fenêtre) — session lue dans le profil');
  const contexte = await chromium.launchPersistentContext(PROFIL, {
    headless: sansFenetre,
    viewport: null,            // la page occupe toute la fenêtre
    args,
  });

  const page = contexte.pages()[0] || (await contexte.newPage());
  await page.goto(CRM_URL, { waitUntil: 'domcontentloaded' }).catch((e) => {
    console.log('⚠️  Chargement interrompu : ' + e.message);
    console.log('    (la fenêtre reste ouverte — tu peux saisir l\'adresse à la main)');
  });

  // Simple témoin de navigation : on voit passer les pages, on ne lit RIEN de
  // leur contenu. Utile pour constater que la connexion a abouti.
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('→ ' + f.url()); });

  console.log('\n✅ Navigateur ouvert. Connecte-toi normalement dans la fenêtre.');
  console.log('   Le script ne fait rien d\'autre : il attend.\n');

  // Fermeture propre : uniquement sur ta demande (Ctrl+C) ou si tu fermes la
  // fenêtre. La session reste écrite dans le profil dans les deux cas.
  let fini = false;
  const fermer = async (raison) => {
    if (fini) return;
    fini = true;
    console.log('\n' + raison + ' — fermeture. La session reste enregistrée dans le profil.');
    await contexte.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => fermer('Ctrl+C reçu'));
  process.on('SIGTERM', () => fermer('Arrêt demandé'));
  contexte.on('close', () => fermer('Fenêtre fermée'));

  // Vérification de persistance, à la demande : combien de cookies le profil
  // porte-t-il ? On n'affiche QUE le nombre et les domaines — jamais une valeur.
  setInterval(async () => {
    if (fini) return;
    try {
      const cookies = await contexte.cookies();
      if (!cookies.length) return;
      const domaines = [...new Set(cookies.map((c) => c.domain))].slice(0, 4).join(', ');
      console.log('· session en place : ' + cookies.length + ' cookie(s) [' + domaines + ']');
    } catch (_) { /* contexte fermé entre-temps */ }
  }, 60000).unref();
})().catch((e) => {
  console.error('Échec du lancement : ' + e.message);
  process.exit(1);
});
