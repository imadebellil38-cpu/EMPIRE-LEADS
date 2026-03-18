'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const { generateQuotePDF } = require('../services/pdf');
const { isEmailConfigured } = require('../services/email');
const { requireAuth } = require('../auth');

const router = Router();

// ── Helpers ──
function nextQuoteNumber(userId) {
  const year = new Date().getFullYear();
  const row = db.prepare(
    `SELECT COUNT(*) as n FROM quotes WHERE user_id = ? AND number LIKE ?`
  ).get(userId, `${year}-%`);
  const seq = String((row.n || 0) + 1).padStart(3, '0');
  return `${year}-${seq}`;
}

function parseItems(items) {
  if (typeof items === 'string') {
    try { return JSON.parse(items); } catch { return []; }
  }
  return Array.isArray(items) ? items : [];
}

function computeTotals(items, tvaRate) {
  const subtotal = items.reduce((s, it) => {
    return s + (parseFloat(it.qty) || 1) * (parseFloat(it.price) || 0);
  }, 0);
  const rate = parseFloat(tvaRate) ?? 20;
  const tva  = Math.round(subtotal * rate) / 100;
  const total = subtotal + tva;
  return { subtotal, tva, total };
}

// ══════════════════════════════════════════
// PUBLIC routes (no auth) — MUST come first
// ══════════════════════════════════════════

// ── GET /api/quotes/sign/:token — public: get quote for signing ──
router.get('/sign/:token', (req, res) => {
  const q = db.prepare(`SELECT * FROM quotes WHERE token = ?`).get(req.params.token);
  if (!q || (q.status !== 'sent' && q.status !== 'accepted')) {
    return res.status(404).json({ error: 'Devis introuvable ou non disponible.' });
  }
  const prospect = q.prospect_id
    ? db.prepare(`SELECT name, address, phone, email FROM prospects WHERE id = ?`).get(q.prospect_id)
    : null;
  const user = db.prepare(`SELECT email FROM users WHERE id = ?`).get(q.user_id);
  res.json({ ...q, prospect, sender_email: user?.email });
});

// ── POST /api/quotes/sign/:token — public: submit signature ──
router.post('/sign/:token', (req, res) => {
  const q = db.prepare(`SELECT * FROM quotes WHERE token = ?`).get(req.params.token);
  if (!q || q.status === 'accepted') {
    return res.status(400).json({ error: 'Devis déjà signé ou invalide.' });
  }

  const { signature_data } = req.body;
  if (!signature_data || !signature_data.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Signature invalide.' });
  }

  db.prepare(`UPDATE quotes SET status = 'accepted', signature_data = ?, signed_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(signature_data, q.id);

  // Auto-close prospect if linked
  if (q.prospect_id) {
    db.prepare(`UPDATE prospects SET pipeline_stage = 'closed' WHERE id = ? AND pipeline_stage != 'closed'`).run(q.prospect_id);
    db.prepare(`INSERT INTO activity_log (user_id, action, details) VALUES (?, 'stage_change', ?)`)
      .run(q.user_id, `Devis ${q.number} signé — prospect auto-closé`);
  }

  res.json({ ok: true });
});

// ══════════════════════════════════════════
// PROTECTED routes (requireAuth)
// ══════════════════════════════════════════

// ── GET /api/quotes — list all quotes for user ──
router.get('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  const rows = db.prepare(`
    SELECT q.*, p.name as prospect_name
    FROM quotes q
    LEFT JOIN prospects p ON q.prospect_id = p.id
    WHERE q.user_id = ?
    ORDER BY q.created_at DESC
    LIMIT 100
  `).all(userId);
  res.json(rows);
});

// ── GET /api/quotes/:id/pdf — download PDF ──
router.get('/:id/pdf', requireAuth, async (req, res) => {
  const q = db.prepare(`SELECT * FROM quotes WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.id);
  if (!q) return res.status(404).json({ error: 'Devis introuvable.' });

  const prospect = q.prospect_id
    ? db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(q.prospect_id)
    : { name: 'Client', address: '', phone: '', email: '' };
  const user = db.prepare(`SELECT email FROM users WHERE id = ?`).get(req.user.id);

  try {
    const pdfBuf = await generateQuotePDF(q, prospect, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="devis-${q.number}.pdf"`);
    res.send(pdfBuf);
  } catch (err) {
    console.error('[PDF]', err.message);
    res.status(500).json({ error: 'Erreur génération PDF.' });
  }
});

// ── POST /api/quotes/:id/send — send by email ──
router.post('/:id/send', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const q = db.prepare(`SELECT * FROM quotes WHERE id = ? AND user_id = ?`).get(req.params.id, userId);
  if (!q) return res.status(404).json({ error: 'Devis introuvable.' });

  const prospect = q.prospect_id
    ? db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(q.prospect_id)
    : null;
  const toEmail = req.body.email || prospect?.email || '';
  if (!toEmail) return res.status(400).json({ error: 'Email du prospect manquant.' });

  const user = db.prepare(`SELECT email FROM users WHERE id = ?`).get(userId);
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const signLink = `${appUrl}/sign/${q.token}`;

  let pdfBuf;
  try {
    pdfBuf = await generateQuotePDF(q, prospect || { name: 'Client' }, user);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur génération PDF.' });
  }

  if (!isEmailConfigured()) {
    db.prepare(`UPDATE quotes SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?`).run(q.id);
    return res.json({ ok: true, warning: 'SMTP non configuré — lien de signature: ' + signLink });
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: (parseInt(process.env.SMTP_PORT, 10) || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const subject = `Devis N° ${q.number} — ${user.email.split('@')[0]}`;
  const bodyText = `Bonjour,\n\nVeuillez trouver ci-joint votre devis N° ${q.number}.\n\nPour l'accepter et le signer en ligne :\n${signLink}\n\nCordialement`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `ProspectHunter <noreply@prospecthunter.fr>`,
      to: toEmail,
      replyTo: user.email,
      subject,
      text: bodyText,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;background:#020b18;color:#ddeeff;padding:2rem;border-radius:12px;">
        <h2 style="color:#00c8f8">Votre devis N° ${q.number}</h2>
        <p>Bonjour,</p><p>Veuillez trouver ci-joint votre devis.</p>
        <p>Pour l'accepter et le signer en ligne :</p>
        <div style="text-align:center;margin:2rem 0;">
          <a href="${signLink}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#00c8f8,#0096d4);color:#020b18;font-weight:bold;text-decoration:none;border-radius:10px;font-size:16px;">
            ✅ Signer le devis
          </a>
        </div>
        <p style="font-size:13px;color:#7a9ab8;">Cordialement,<br>${user.email.split('@')[0]}</p>
      </div>`,
      attachments: [{ filename: `devis-${q.number}.pdf`, content: pdfBuf, contentType: 'application/pdf' }],
    });
    db.prepare(`UPDATE quotes SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?`).run(q.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[QUOTE SEND]', err.message);
    res.status(500).json({ error: 'Erreur envoi email: ' + err.message });
  }
});

// ── GET /api/quotes/:id ──
router.get('/:id', requireAuth, (req, res) => {
  const q = db.prepare(`SELECT * FROM quotes WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!q) return res.status(404).json({ error: 'Devis introuvable.' });
  const prospect = q.prospect_id
    ? db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(q.prospect_id)
    : null;
  res.json({ ...q, prospect });
});

// ── POST /api/quotes — create ──
router.post('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  const { prospect_id, items = [], tva_rate = 20, notes = '', valid_until = '' } = req.body;

  const parsedItems = parseItems(items);
  const { subtotal, tva, total } = computeTotals(parsedItems, tva_rate);
  const number = nextQuoteNumber(userId);
  const token  = crypto.randomBytes(16).toString('hex');

  const r = db.prepare(`
    INSERT INTO quotes (user_id, prospect_id, number, items, subtotal, tva_rate, tva, total, notes, valid_until, token, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(userId, prospect_id || null, number, JSON.stringify(parsedItems), subtotal, tva_rate, tva, total, notes, valid_until, token);

  res.json({ id: r.lastInsertRowid, number, token });
});

// ── PUT /api/quotes/:id — update ──
router.put('/:id', requireAuth, (req, res) => {
  const userId = req.user.id;
  const q = db.prepare(`SELECT * FROM quotes WHERE id = ? AND user_id = ?`).get(req.params.id, userId);
  if (!q) return res.status(404).json({ error: 'Devis introuvable.' });

  const { items, tva_rate, notes, valid_until, status, prospect_id } = req.body;
  const parsedItems = items !== undefined ? parseItems(items) : parseItems(q.items);
  const rate = tva_rate !== undefined ? parseFloat(tva_rate) : q.tva_rate;
  const { subtotal, tva, total } = computeTotals(parsedItems, rate);

  db.prepare(`
    UPDATE quotes SET
      items = ?, subtotal = ?, tva_rate = ?, tva = ?, total = ?,
      notes = COALESCE(?, notes),
      valid_until = COALESCE(?, valid_until),
      status = COALESCE(?, status),
      prospect_id = COALESCE(?, prospect_id)
    WHERE id = ? AND user_id = ?
  `).run(
    JSON.stringify(parsedItems), subtotal, rate, tva, total,
    notes ?? null, valid_until ?? null, status ?? null, prospect_id ?? null,
    req.params.id, userId
  );
  res.json({ ok: true, subtotal, tva, total });
});

// ── DELETE /api/quotes/:id ──
router.delete('/:id', requireAuth, (req, res) => {
  const r = db.prepare(`DELETE FROM quotes WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Devis introuvable.' });
  res.json({ ok: true });
});

module.exports = router;
