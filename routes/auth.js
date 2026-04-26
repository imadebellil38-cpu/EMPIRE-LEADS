const express = require('express');
const { Router } = express;
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { createToken, requireAuth } = require('../auth');
const { sendWelcomeEmail } = require('../services/email');

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
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
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
    // Determine signup source for BI tracking
    const signupSource = (referral_code && typeof referral_code === 'string' && referral_code.trim())
      ? 'referral'
      : 'direct';
    const nowIso = new Date().toISOString();
    const result = await db.insert(
      'INSERT INTO users (email, password, referral_code, plan, credits, trial_ends_at, signup_source, trial_activated_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [cleanEmail, hash, newReferralCode, 'free', 0, trialEndsAt, signupSource, nowIso, nowIso]
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

    // Send welcome email (non-blocking)
    sendWelcomeEmail(cleanEmail, user.display_name || '').catch(() => {});

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

// GET /api/auth/google-enabled — check if Google OAuth is configured (public)
router.get('/auth/google-enabled', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  res.json({ enabled: !!clientId, clientId: clientId || undefined });
});

// POST /api/auth/google — Google Sign-In (public, rate-limited)
router.post('/auth/google', authLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential || typeof credential !== 'string') {
    return res.status(400).json({ error: 'Token Google manquant.' });
  }
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google Sign-In non configure.' });
  }
  try {
    // Verify token via Google tokeninfo endpoint (no extra dependency needed)
    const https = require('https');
    const tokenInfo = await new Promise((resolve, reject) => {
      const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
      https.get(url, { timeout: 8000 }, (r) => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid Google response')); }
        });
      }).on('error', reject);
    });
    // Validate audience matches our client ID
    if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Token Google invalide (audience).' });
    }
    if (!tokenInfo.email || tokenInfo.email_verified !== 'true') {
      return res.status(401).json({ error: 'Email Google non verifie.' });
    }
    const googleId = tokenInfo.sub;
    const email = validator.normalizeEmail(tokenInfo.email);
    const displayName = tokenInfo.name || email.split('@')[0];

    // Check if user exists by google_id or email
    let user = await db.get('SELECT * FROM users WHERE google_id = ?', [googleId]);
    if (!user) {
      user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (user) {
        // Link Google to existing account
        await db.run('UPDATE users SET google_id = ?, display_name = COALESCE(NULLIF(display_name, \'\'), ?) WHERE id = ?', [googleId, displayName, user.id]);
      } else {
        // Create new account (no password needed for Google users)
        const randomPwd = crypto.randomBytes(32).toString('hex');
        const hash = bcrypt.hashSync(randomPwd, 12);
        const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
        const nowIso = new Date().toISOString();
        const result = await db.run(
          'INSERT INTO users (email, password, google_id, display_name, plan, credits, trial_ends_at, signup_source, trial_activated_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [email, hash, googleId, displayName, 'free', 0, trialEnd, 'google_oauth', nowIso, nowIso]
        );
        user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID || result.id]);
      }
    }
    if (user.is_disabled) {
      return res.status(403).json({ error: 'Ce compte a ete desactive.' });
    }
    const token = createToken(user);
    // Log connexion
    try {
      await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?,?,?)',
        [user.id, 'login', JSON.stringify({ method: 'google', ip: req.ip || 'unknown' })]);
    } catch (_) {}
    res.json({
      token,
      user: { id: user.id, email: user.email, plan: user.plan, credits: user.credits, is_admin: user.is_admin, display_name: user.display_name || displayName }
    });
  } catch (err) {
    console.error('[AUTH] Google login error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la connexion Google.' });
  }
});

// GET /api/auth/google/redirect — OAuth 2.0 callback (standard code flow)
router.get('/auth/google/redirect', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login?error=google_missing');
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.redirect('/login?error=google_disabled');
  try {
    const https = require('https');
    // Exchange authorization code for tokens — force HTTPS (Vercel terminates SSL at edge)
    const host = req.get('host');
    const redirectUri = `https://${host}/api/auth/google/redirect`;
    const tokenBody = `code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&client_secret=${encodeURIComponent(GOOGLE_CLIENT_SECRET)}&redirect_uri=${encodeURIComponent(redirectUri)}&grant_type=authorization_code`;
    const tokens = await new Promise((resolve, reject) => {
      const r = https.request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) }, timeout: 10000 }, (resp) => {
        let data = '';
        resp.on('data', c => { data += c; });
        resp.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('bad json')); } });
      });
      r.on('error', reject);
      r.write(tokenBody);
      r.end();
    });
    if (tokens.error) {
      console.error('[AUTH] Google token exchange error:', tokens.error, tokens.error_description);
      return res.redirect('/login?error=google_token_fail&detail=' + encodeURIComponent(tokens.error + ': ' + (tokens.error_description || '')));
    }
    if (!tokens.id_token) {
      console.error('[AUTH] No id_token in response:', JSON.stringify(tokens).substring(0, 200));
      return res.redirect('/login?error=google_no_token');
    }
    // Decode id_token JWT payload (base64)
    const parts = (tokens.id_token || '').split('.');
    if (parts.length < 2) return res.redirect('/login?error=google_bad_jwt');
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString());
    if (!payload.email) {
      console.error('[AUTH] No email in Google payload');
      return res.redirect('/login?error=google_no_email');
    }
    const googleId = payload.sub;
    const email = validator.normalizeEmail(payload.email);
    const displayName = payload.name || email.split('@')[0];
    let user = await db.get('SELECT * FROM users WHERE google_id = ?', [googleId]);
    if (!user) {
      user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (user) {
        await db.run('UPDATE users SET google_id = ?, display_name = COALESCE(NULLIF(display_name, \'\'), ?) WHERE id = ?', [googleId, displayName, user.id]);
      } else {
        const hash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
        const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
        const nowIso = new Date().toISOString();
        const result = await db.run('INSERT INTO users (email, password, google_id, display_name, plan, credits, trial_ends_at, signup_source, trial_activated_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [email, hash, googleId, displayName, 'free', 0, trialEnd, 'google_oauth', nowIso, nowIso]);
        user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID || result.id]);
      }
    }
    if (user.is_disabled) return res.redirect('/login?error=disabled');
    const isNew = !user.google_id || user.google_id !== googleId ? false : true;
    // Detect truly new user: created less than 10 seconds ago
    const createdAt = new Date(user.created_at).getTime();
    const justCreated = (Date.now() - createdAt) < 10000;
    const token = createToken(user);
    try { await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?,?,?)', [user.id, 'login', JSON.stringify({ method: 'google', ip: req.ip || 'unknown' })]); } catch (_) {}
    const userData = encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, plan: user.plan, credits: user.credits, is_admin: user.is_admin, display_name: user.display_name || displayName }));
    res.redirect(`/login?google_token=${token}&google_user=${userData}${justCreated ? '&new=1' : ''}`);
  } catch (err) {
    console.error('[AUTH] Google redirect error:', err.message);
    res.redirect('/login?error=google_fail');
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
