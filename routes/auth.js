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

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

// POST /api/register (public, rate-limited)
router.post('/register', authLimiter, async (req, res) => {
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

  try {
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });

    const hash = bcrypt.hashSync(password, 12);
    const newReferralCode = crypto.randomBytes(4).toString('hex');
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.insert(
      'INSERT INTO users (email, password, referral_code, plan, credits, trial_ends_at) VALUES (?, ?, ?, ?, ?, ?)',
      [cleanEmail, hash, newReferralCode, 'free', 0, trialEndsAt]
    );

    // Handle referral bonus (+5 parrain, +5 filleul)
    if (referral_code && typeof referral_code === 'string') {
      const referrer = await db.get('SELECT id FROM users WHERE referral_code = ?', [referral_code.trim()]);
      if (referrer && referrer.id !== result.lastInsertRowid) {
        await db.run('UPDATE users SET referred_by = ? WHERE id = ?', [referrer.id, result.lastInsertRowid]);
        await db.run('UPDATE users SET credits = credits + 5 WHERE id = ?', [referrer.id]);
        await db.run('UPDATE users SET credits = credits + 5 WHERE id = ?', [result.lastInsertRowid]);
      }
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
    const token = createToken(user);

    console.log(`[AUTH] New user registered: ${cleanEmail}${referral_code ? ' (referral: ' + referral_code + ')' : ''}`);

    res.json({
      token,
      user: { id: user.id, email: user.email, plan: user.plan, credits: user.credits, is_admin: user.is_admin, display_name: user.display_name || '', theme_url: user.theme_url || '' }
    });
  } catch (err) {
    console.error('[AUTH] Register error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'inscription.' });
  }
});

// POST /api/login (public, rate-limited)
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  const cleanEmail = validator.normalizeEmail(validator.trim(email));
  if (!validator.isEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    if (user.is_disabled) {
      return res.status(403).json({ error: 'Ce compte a ete desactive. Contactez l\'administrateur.' });
    }

    const token = createToken(user);

    // Log connexion
    try {
      await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?,?,?)',
        [user.id, 'login', JSON.stringify({ ip: req.ip || req.headers['x-forwarded-for'] || 'unknown' })]);
    } catch (_) {}

    res.json({
      token,
      user: { id: user.id, email: user.email, plan: user.plan, credits: user.credits, is_admin: user.is_admin, display_name: user.display_name || '', theme_url: user.theme_url || '' }
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
});

// POST /api/forgot-password (public, rate-limited)
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email requis.' });

  const cleanEmail = validator.normalizeEmail(validator.trim(email));
  if (!validator.isEmail(cleanEmail)) return res.status(400).json({ error: 'Adresse email invalide.' });

  try {
    const user = await db.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    // Always return ok to avoid email enumeration
    if (!user) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
    await db.run('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, user.id]);

    const { sendResetEmail } = require('../services/email');
    sendResetEmail(cleanEmail, token).catch(() => {});

    console.log(`[AUTH] Reset token for ${cleanEmail}: ${token}`);
    // Return token in dev/test for convenience (email service may not be configured)
    res.json({ ok: true, token: process.env.NODE_ENV !== 'production' ? token : undefined });
  } catch (err) {
    console.error('[AUTH] Forgot-password error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la demande de réinitialisation.' });
  }
});

// POST /api/reset-password (public)
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token requis.' });
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe invalide (6 caractères minimum).' });
  }

  try {
    const user = await db.get(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [token.trim()]
    );
    if (!user) return res.status(400).json({ error: 'Token invalide ou expiré.' });

    const hash = bcrypt.hashSync(password, 12);
    await db.run('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, user.id]);

    console.log(`[AUTH] Password reset for user ${user.id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] Reset-password error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation.' });
  }
});

// GET /api/me — current user info (protected)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get('SELECT id, email, plan, credits, google_key, anthropic_key, is_admin, display_name, theme_url, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json({ user });
  } catch (err) {
    console.error('[AUTH] Me error:', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PUT /api/me/keys — update API keys (protected)
router.put('/me/keys', requireAuth, async (req, res) => {
  const { google_key, anthropic_key } = req.body;

  // Validate key formats (basic check)
  const gKey = typeof google_key === 'string' ? validator.trim(google_key).substring(0, 100) : '';
  const aKey = typeof anthropic_key === 'string' ? validator.trim(anthropic_key).substring(0, 200) : '';

  try {
    await db.run('UPDATE users SET google_key = ?, anthropic_key = ? WHERE id = ?', [gKey, aKey, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] Keys update error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des clés.' });
  }
});

module.exports = router;
