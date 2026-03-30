const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'Empire Leads <noreply@empire-leads.fr>';

let transporter = null;

if (SMTP_HOST && SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  // Verify connection
  transporter.verify()
    .then(() => console.log('\x1b[32m[EMAIL] SMTP connecté\x1b[0m'))
    .catch(err => console.error('\x1b[31m[EMAIL] SMTP erreur:\x1b[0m', err.message));
} else {
  console.warn('\x1b[33m[WARN] SMTP non configuré — emails désactivés (token affiché en console)\x1b[0m');
}

/**
 * Send password reset email
 * @param {string} to - recipient email
 * @param {string} token - reset token
 * @param {string} [appUrl] - base URL of the app
 * @returns {Promise<boolean>} true if sent
 */
async function sendResetEmail(to, token, appUrl) {
  const baseUrl = appUrl || process.env.APP_URL || 'http://localhost:3000';
  const resetLink = `${baseUrl}/login?reset=${token}`;

  if (!transporter) {
    console.log(`\x1b[33m[EMAIL] Reset email pour ${to} (pas de SMTP):\x1b[0m`);
    console.log(`  Token: ${token}`);
    console.log(`  Lien:  ${resetLink}`);
    return false;
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:2rem;background:#061222;color:#ddeeff;border-radius:16px;">
      <h2 style="color:#00c8f8;margin-bottom:1rem;">Empire Leads</h2>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p>Cliquez sur le bouton ci-dessous (valable 1 heure) :</p>
      <div style="text-align:center;margin:2rem 0;">
        <a href="${resetLink}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#00c8f8,#0096d4);color:#020b18;font-weight:bold;text-decoration:none;border-radius:10px;font-size:16px;">
          Réinitialiser mon mot de passe
        </a>
      </div>
      <p style="font-size:13px;color:#7a9ab8;">Si vous n'avez pas fait cette demande, ignorez cet email.</p>
      <p style="font-size:12px;color:#4a6a88;margin-top:2rem;">— L'équipe Empire Leads</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: 'Réinitialisation de votre mot de passe — Empire Leads',
      html,
      text: `Réinitialisation de mot de passe Empire Leads\n\nCliquez sur ce lien (valable 1h) :\n${resetLink}\n\nSi vous n'avez pas fait cette demande, ignorez cet email.`,
    });
    console.log(`[EMAIL] Reset email envoyé à ${to}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL] Erreur envoi à ${to}:`, err.message);
    return false;
  }
}

/**
 * Send an email to a prospect (from the pitch generator)
 */
async function sendProspectEmail(to, subject, body, userEmail) {
  if (!transporter) {
    return { ok: false, error: 'SMTP non configuré. Ajoutez SMTP_HOST, SMTP_USER, SMTP_PASS dans .env.' };
  }
  try {
    const safeBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      replyTo: userEmail || SMTP_FROM,
      subject,
      text: body,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;white-space:pre-wrap">${safeBody}</div>`,
    });
    console.log(`[EMAIL] Email prospect envoyé à ${to}`);
    return { ok: true };
  } catch (err) {
    console.error(`[EMAIL] Erreur envoi prospect à ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

function isEmailConfigured() {
  return !!transporter;
}

module.exports = { sendResetEmail, sendProspectEmail, isEmailConfigured };
