'use strict';
// ============================================================================
//  ENVOI DU LIEN MAGIQUE — SMTP (mêmes variables que l'app principale).
//
//  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE.
//  Sans SMTP configuré, l'envoi est simulé : le lien est écrit dans les logs
//  (mode développement). En production il FAUT configurer le SMTP.
// ============================================================================

let transporter = null;

function smtpConfigure() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (transporter || !smtpConfigure()) return transporter;
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    family: 4, // Railway : l'IPv6 de certains SMTP est injoignable
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 12000, greetingTimeout: 8000, socketTimeout: 15000,
  });
  return transporter;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function contenuMail(lien, minutes, appNom) {
  const text = [
    'Bonjour,',
    '',
    `Voici ton lien de connexion à ${appNom} :`,
    lien,
    '',
    `Il est valable ${minutes} minutes et ne fonctionne qu'une fois.`,
    'Si tu n\'as rien demandé, ignore simplement ce message.',
    '',
    'L\'équipe My Coach',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f8f9ff;font-family:Arial,Helvetica,sans-serif;color:#0b1c30">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:22px;font-weight:bold;padding-bottom:12px">Ton plan repas t'attend</td></tr>
<tr><td style="font-size:15px;line-height:22px;color:#434653;padding-bottom:24px">Clique sur le bouton ci-dessous pour te connecter à ${esc(appNom)}. Aucun mot de passe à retenir.</td></tr>
<tr><td align="center" style="padding-bottom:24px"><a href="${esc(lien)}" style="display:inline-block;background:#0f52ba;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:999px">Me connecter</a></td></tr>
<tr><td style="font-size:13px;line-height:20px;color:#737784">Ce lien est valable ${minutes} minutes et ne fonctionne qu'une fois. Si tu n'as rien demandé, ignore simplement ce message.</td></tr>
<tr><td style="font-size:13px;color:#737784;padding-top:24px">L'équipe My Coach</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `Ton lien de connexion ${appNom}`, text, html };
}

// Renvoie { envoye: true } ou { envoye: false, simule: true } (pas de SMTP).
async function envoyerLienMagique({ to, lien, minutes, appNom }) {
  const { subject, text, html } = contenuMail(lien, minutes, appNom);
  const t = getTransporter();
  if (!t) {
    console.log(`\n  [lien magique — SMTP non configuré] ${to}\n  ${lien}\n`);
    return { envoye: false, simule: true };
  }
  await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  return { envoye: true };
}

module.exports = { envoyerLienMagique, smtpConfigure, contenuMail };
