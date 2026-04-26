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

/**
 * Send welcome email after registration
 */
async function sendWelcomeEmail(to, displayName) {
  if (!transporter) { console.log('[EMAIL] SMTP non config — welcome email skip pour', to); return false; }
  const name = displayName || to.split('@')[0];
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: 'Bienvenue sur Empire Leads ! 🚀',
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a14;color:#e0e0f0;padding:32px;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:48px;margin-bottom:8px">👑</div>
          <h1 style="font-size:24px;color:#22c55e;margin:0">Bienvenue ${name} !</h1>
        </div>
        <p style="font-size:15px;line-height:1.6;color:#c0c0d0">Ton compte Empire Leads est actif. Tu peux maintenant :</p>
        <ul style="font-size:14px;line-height:2;color:#c0c0d0;padding-left:20px">
          <li>Explorer le dashboard et le pipeline CRM</li>
          <li>Decouvrir les fonctionnalites de prospection</li>
          <li>Passer a un plan Pro pour debloquer les leads</li>
        </ul>
        <div style="text-align:center;margin:24px 0">
          <a href="https://prospecthunter.vercel.app/app" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-weight:800;font-size:15px;text-decoration:none;border-radius:10px">Acceder a mon compte</a>
        </div>
        <p style="font-size:12px;color:#666;text-align:center;margin-top:24px">Empire Leads — Prospection B2B automatisee</p>
      </div>`,
    });
    console.log('[EMAIL] Welcome email sent to', to);
    return true;
  } catch (err) { console.error('[EMAIL] Welcome email error:', err.message); return false; }
}

/**
 * Send payment confirmation email after Stripe checkout
 */
async function sendPaymentConfirmEmail(to, planName, credits) {
  if (!transporter) { console.log('[EMAIL] SMTP non config — payment email skip pour', to); return false; }
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `Paiement confirme — Plan ${planName} active ! ✅`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a14;color:#e0e0f0;padding:32px;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:48px;margin-bottom:8px">✅</div>
          <h1 style="font-size:24px;color:#22c55e;margin:0">Paiement confirme !</h1>
        </div>
        <div style="background:#111128;border:1px solid #1f1f2c;border-radius:12px;padding:20px;margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#888">Plan</span>
            <span style="font-weight:800;color:#22c55e;text-transform:capitalize">${planName}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:#888">Credits ajoutes</span>
            <span style="font-weight:800">${credits.toLocaleString('fr-FR')} leads</span>
          </div>
        </div>
        <p style="font-size:14px;color:#c0c0d0;line-height:1.6">Tes credits sont disponibles immediatement. Tu peux lancer tes premieres recherches de prospects.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="https://prospecthunter.vercel.app/app" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-weight:800;font-size:15px;text-decoration:none;border-radius:10px">Lancer une recherche</a>
        </div>
        <p style="font-size:11px;color:#666;text-align:center;margin-top:24px">Ta facture Stripe est disponible dans ton espace client Stripe.<br>Empire Leads — Prospection B2B automatisee</p>
      </div>`,
    });
    console.log('[EMAIL] Payment confirmation sent to', to);
    return true;
  } catch (err) { console.error('[EMAIL] Payment email error:', err.message); return false; }
}

module.exports = { sendResetEmail, sendProspectEmail, isEmailConfigured, sendWelcomeEmail, sendPaymentConfirmEmail };
