const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { createToken, requireAuth } = require('../auth');

const router = Router();

// Rate limiter for login/register only
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});

// POST /api/register (public, rate-limited)
router.post('/register', authLimiter, (req, res) => {
  const { email, password, referral_code } = req.body;

  // ── Validate inputs ──
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email requis.' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Mot de passe requis.' });
  }

  const cleanEmail = validator.normalizeEmail(validator.trim(email));
  if (!validator.isEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  }
  if (password.length > 128) {
    return res.status(400).json({ error: 'Mot de passe trop long (128 caractères max).' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });

  const hash = bcrypt.hashSync(password, 12);
  const newReferralCode = crypto.randomBytes(4).toString('hex');
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare(
    'INSERT INTO users (email, password, referral_code, plan, credits, trial_ends_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(cleanEmail, hash, newReferralCode, 'trial', 20, trialEndsAt);

  // Handle referral bonus (+5 parrain, +5 filleul)
  if (referral_code && typeof referral_code === 'string') {
    const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(referral_code.trim());
    if (referrer && referrer.id !== result.lastInsertRowid) {
      db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referrer.id, result.lastInsertRowid);
      db.prepare('UPDATE users SET credits = credits + 5 WHERE id = ?').run(referrer.id);
      db.prepare('UPDATE users SET credits = credits + 5 WHERE id = ?').run(result.lastInsertRowid);
    }
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = createToken(user);

  console.log(`[AUTH] New user registered: ${cleanEmail}${referral_code ? ' (referral: ' + referral_code + ')' : ''}`);

  res.json({
    token,
    user: { id: user.id, email: user.email, plan: user.plan, credits: user.credits, is_admin: user.is_admin }
  });
});

// POST /api/login (public, rate-limited)
router.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  const cleanEmail = validator.normalizeEmail(validator.trim(email));
  if (!validator.isEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }

  const token = createToken(user);

  res.json({
    token,
    user: { id: user.id, email: user.email, plan: user.plan, credits: user.credits, is_admin: user.is_admin }
  });
});

// POST /api/forgot-password (public, rate-limited)
router.post('/forgot-password', authLimiter, (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email requis.' });

  const cleanEmail = validator.normalizeEmail(validator.trim(email));
  if (!validator.isEmail(cleanEmail)) return res.status(400).json({ error: 'Adresse email invalide.' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  // Always return ok to avoid email enumeration
  if (!user) return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expires, user.id);

  const { sendResetEmail } = require('../services/email');
  sendResetEmail(cleanEmail, token).catch(() => {});

  console.log(`[AUTH] Reset token for ${cleanEmail}: ${token}`);
  // Return token in dev/test for convenience (email service may not be configured)
  res.json({ ok: true, token: process.env.NODE_ENV !== 'production' ? token : undefined });
});

// POST /api/reset-password (public)
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token requis.' });
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe invalide (6 caractères minimum).' });
  }

  const user = db.prepare(
    'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > datetime("now")'
  ).get(token.trim());
  if (!user) return res.status(400).json({ error: 'Token invalide ou expiré.' });

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?').run(hash, user.id);

  console.log(`[AUTH] Password reset for user ${user.id}`);
  res.json({ ok: true });
});

// GET /api/me — current user info (protected)
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, plan, credits, google_key, anthropic_key, is_admin, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user });
});

// PUT /api/me/keys — update API keys (protected)
router.put('/me/keys', requireAuth, (req, res) => {
  const { google_key, anthropic_key } = req.body;

  // Validate key formats (basic check)
  const gKey = typeof google_key === 'string' ? validator.trim(google_key).substring(0, 100) : '';
  const aKey = typeof anthropic_key === 'string' ? validator.trim(anthropic_key).substring(0, 200) : '';

  db.prepare('UPDATE users SET google_key = ?, anthropic_key = ? WHERE id = ?')
    .run(gKey, aKey, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
