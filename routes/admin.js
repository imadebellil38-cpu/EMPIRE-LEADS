const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = Router();

// All admin routes require admin
router.use(requireAdmin);

const VALID_PLANS = { free: 0, pro: 1000, business: 3000, legend: 5000 };
const PLAN_PRICES = { free: 0, trial: 0, pro: 349, business: 549, legend: 849 };

// GET /api/admin/bi-overview — BI dashboard (MAU, conversion, acquisition sources)
router.get('/bi-overview', async (req, res) => {
  try {
    const now = Date.now();
    const d7 = new Date(now - 7 * 86400000).toISOString();
    const d30 = new Date(now - 30 * 86400000).toISOString();
    const d90 = new Date(now - 90 * 86400000).toISOString();

    // Totaux
    const totalUsers = (await db.get('SELECT COUNT(*) as c FROM users')).c || 0;
    const totalPaid = (await db.get("SELECT COUNT(*) as c FROM users WHERE plan IN ('pro','business','legend','starter','enterprise')")).c || 0;
    const totalFree = (await db.get("SELECT COUNT(*) as c FROM users WHERE plan IN ('free','trial') OR plan IS NULL")).c || 0;
    const totalDisabled = (await db.get('SELECT COUNT(*) as c FROM users WHERE is_disabled = 1')).c || 0;

    // Active users (basé sur last_activity_at)
    const active7d = (await db.get('SELECT COUNT(*) as c FROM users WHERE last_activity_at >= ?', [d7])).c || 0;
    const active30d = (await db.get('SELECT COUNT(*) as c FROM users WHERE last_activity_at >= ?', [d30])).c || 0;
    const inactive30d = Math.max(0, totalUsers - active30d);

    // Signups récents
    const signups7d = (await db.get('SELECT COUNT(*) as c FROM users WHERE created_at >= ?', [d7])).c || 0;
    const signups30d = (await db.get('SELECT COUNT(*) as c FROM users WHERE created_at >= ?', [d30])).c || 0;
    const signups90d = (await db.get('SELECT COUNT(*) as c FROM users WHERE created_at >= ?', [d90])).c || 0;

    // Breakdown signup source
    const bySource = await db.all("SELECT COALESCE(signup_source, 'direct') as source, COUNT(*) as count FROM users GROUP BY COALESCE(signup_source, 'direct')");

    // Breakdown par plan
    const byPlan = await db.all("SELECT COALESCE(plan, 'free') as plan, COUNT(*) as count FROM users GROUP BY COALESCE(plan, 'free')");

    // Conversion trial → paid (users créés il y a 30-60j qui ont un plan payant)
    const trialCutoff = new Date(now - 60 * 86400000).toISOString();
    const trialStart = new Date(now - 60 * 86400000).toISOString();
    const trialEnd = new Date(now - 7 * 86400000).toISOString();
    const eligibleTrials = (await db.get('SELECT COUNT(*) as c FROM users WHERE created_at BETWEEN ? AND ?', [trialStart, trialEnd])).c || 0;
    const convertedTrials = (await db.get("SELECT COUNT(*) as c FROM users WHERE created_at BETWEEN ? AND ? AND plan IN ('pro','business','legend','starter','enterprise')", [trialStart, trialEnd])).c || 0;
    const trialConvRate = eligibleTrials > 0 ? Math.round((convertedTrials / eligibleTrials) * 1000) / 10 : 0;

    // MRR estimation (basique — sommation par plan)
    const PLAN_PRICE = { free: 0, trial: 0, starter: 79, pro: 349, business: 549, legend: 849, enterprise: 1500 };
    let mrr = 0;
    for (const row of byPlan) {
      mrr += (PLAN_PRICE[row.plan] || 0) * (row.count || 0);
    }

    // Activité produit 7d
    const searches7d = (await db.get('SELECT COUNT(*) as c FROM searches WHERE created_at >= ?', [d7])).c || 0;
    const prospects7d = (await db.get('SELECT COUNT(*) as c FROM prospects WHERE created_at >= ?', [d7])).c || 0;

    // Top referrers (users qui ont amené le plus de filleuls)
    const topReferrers = await db.all(`
      SELECT ref.email, ref.display_name, COUNT(u.id) as invited_count
      FROM users u
      JOIN users ref ON u.referred_by = ref.id
      GROUP BY ref.id, ref.email, ref.display_name
      ORDER BY invited_count DESC
      LIMIT 5
    `);

    res.json({
      totals: { users: totalUsers, paid: totalPaid, free: totalFree, disabled: totalDisabled },
      active: { d7: active7d, d30: active30d, inactive30d },
      signups: { d7: signups7d, d30: signups30d, d90: signups90d },
      bySource,
      byPlan,
      trialConversion: { eligible: eligibleTrials, converted: convertedTrials, rate_pct: trialConvRate },
      mrr_estimate_eur: mrr,
      arr_estimate_eur: mrr * 12,
      activity7d: { searches: searches7d, prospects_added: prospects7d },
      topReferrers,
    });
  } catch (err) {
    console.error('[bi-overview]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT u.id, u.email, u.plan, u.credits, u.is_admin,
             COALESCE(u.display_name, '') as display_name,
             COALESCE(u.theme_url, '') as theme_url,
             COALESCE(u.is_disabled, 0) as is_disabled,
             u.created_at,
             (SELECT MAX(al.created_at) FROM activity_log al WHERE al.user_id = u.id AND al.action = 'login') as last_login,
             (SELECT COUNT(*) FROM searches WHERE user_id = u.id) as total_searches,
             (SELECT COUNT(*) FROM prospects WHERE user_id = u.id) as total_prospects
      FROM users u ORDER BY u.created_at DESC
    `);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/credits — set credits
router.put('/users/:id/credits', async (req, res) => {
  const { credits } = req.body;
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID utilisateur invalide.' });
  if (typeof credits !== 'number' || credits < 0 || credits > 9999999) {
    return res.status(400).json({ error: 'Nombre de credits invalide (0-9999999).' });
  }

  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    await db.run('UPDATE users SET credits = ? WHERE id = ?', [Math.floor(credits), id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/plan — change plan
router.put('/users/:id/plan', async (req, res) => {
  const { plan } = req.body;
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID utilisateur invalide.' });
  if (!VALID_PLANS[plan]) {
    return res.status(400).json({ error: `Plan invalide. Choix: ${Object.keys(VALID_PLANS).join(', ')}` });
  }

  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    await db.run('UPDATE users SET plan = ?, credits = ? WHERE id = ?', [plan, VALID_PLANS[plan], id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/admin — toggle admin
router.put('/users/:id/admin', async (req, res) => {
  const { is_admin } = req.body;
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID utilisateur invalide.' });

  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    await db.run('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/disable — toggle disable
router.put('/users/:id/disable', async (req, res) => {
  const { is_disabled } = req.body;
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID utilisateur invalide.' });

  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    await db.run('UPDATE users SET is_disabled = ? WHERE id = ?', [is_disabled ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users — create new user
router.post('/users', async (req, res) => {
  const { email, password, display_name, plan, credits, theme_url, is_admin } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Email invalide.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe requis (6 caracteres min).' });
  }

  const selectedPlan = VALID_PLANS[plan] !== undefined ? plan : 'free';
  const selectedCredits = typeof credits === 'number' && credits >= 0 ? Math.floor(credits) : VALID_PLANS[selectedPlan];

  try {
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) return res.status(409).json({ error: 'Cet email est deja utilise.' });

    const hash = bcrypt.hashSync(password, 12);
    const referralCode = crypto.randomBytes(4).toString('hex');

    await db.run(
      `INSERT INTO users (email, password, display_name, plan, credits, theme_url, referral_code, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email.toLowerCase().trim(),
        hash,
        display_name || '',
        selectedPlan,
        selectedCredits,
        theme_url || '',
        referralCode,
        is_admin ? 1 : 0,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/searches — recent searches
router.get('/searches', async (req, res) => {
  try {
    const searches = await db.all(`
      SELECT s.*, u.email FROM searches s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC LIMIT 100
    `);
    res.json(searches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats/revenue — MRR
router.get('/stats/revenue', async (req, res) => {
  try {
    const planCounts = await db.all('SELECT plan, COUNT(*) as c FROM users GROUP BY plan');
    let mrr = 0;
    for (const p of planCounts) {
      mrr += (PLAN_PRICES[p.plan] || 0) * p.c;
    }
    res.json({ mrr, planCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats/daily — registrations + searches per day (30 days)
router.get('/stats/daily', async (req, res) => {
  try {
    const registrations = await db.all(`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM users WHERE created_at >= DATE('now', '-30 days')
      GROUP BY DATE(created_at) ORDER BY day
    `);

    const searches = await db.all(`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM searches WHERE created_at >= DATE('now', '-30 days')
      GROUP BY DATE(created_at) ORDER BY day
    `);

    res.json({ registrations, searches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats/top-users — top 10 by searches and prospects
router.get('/stats/top-users', async (req, res) => {
  try {
    const bySearches = await db.all(`
      SELECT u.id, u.email, u.plan, COUNT(s.id) as total
      FROM users u LEFT JOIN searches s ON s.user_id = u.id
      GROUP BY u.id ORDER BY total DESC LIMIT 10
    `);

    const byProspects = await db.all(`
      SELECT u.id, u.email, u.plan, COUNT(p.id) as total
      FROM users u LEFT JOIN prospects p ON p.user_id = u.id
      GROUP BY u.id ORDER BY total DESC LIMIT 10
    `);

    res.json({ bySearches, byProspects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/connections — recent logins
router.get('/connections', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT al.id, al.user_id, al.details, al.created_at, u.email, u.plan
      FROM activity_log al
      JOIN users u ON u.id = al.user_id
      WHERE al.action = 'login'
      ORDER BY al.created_at DESC LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/activity — recent activity (all types)
router.get('/activity', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT al.id, al.user_id, al.action, al.details, al.created_at, u.email
      FROM activity_log al
      JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const totalUsersRow = await db.get('SELECT COUNT(*) as c FROM users');
    const totalSearchesRow = await db.get('SELECT COUNT(*) as c FROM searches');
    const totalProspectsRow = await db.get('SELECT COUNT(*) as c FROM prospects');
    const totalCreditsUsedRow = await db.get('SELECT COALESCE(SUM(results_count), 0) as c FROM searches');
    const planCounts = await db.all('SELECT plan, COUNT(*) as c FROM users GROUP BY plan');

    res.json({
      totalUsers: totalUsersRow ? totalUsersRow.c : 0,
      totalSearches: totalSearchesRow ? totalSearchesRow.c : 0,
      totalProspects: totalProspectsRow ? totalProspectsRow.c : 0,
      totalCreditsUsed: totalCreditsUsedRow ? totalCreditsUsedRow.c : 0,
      planCounts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/extensions-log — accès aux extensions
router.get('/extensions-log', async (req, res) => {
  try {
    const logs = await db.all(`
      SELECT al.id, al.user_id, al.details, al.created_at, u.email
      FROM activity_log al
      JOIN users u ON u.id = al.user_id
      WHERE al.action = 'extension_access'
      ORDER BY al.created_at DESC
      LIMIT 200
    `);
    const parsed = logs.map(function(l) {
      let details = {};
      try { details = JSON.parse(l.details || '{}'); } catch(e) {}
      return { id: l.id, email: l.email, extension: details.extension || '', ip: details.ip || '', granted: details.granted || false, created_at: l.created_at };
    });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/extension-key — définir le code secret d'un user
router.put('/users/:id/extension-key', async (req, res) => {
  try {
    const { key } = req.body;
    if (key === undefined) return res.status(400).json({ error: 'key requis' });
    await db.run('UPDATE users SET extension_key = $1 WHERE id = $2', [String(key).trim(), req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id/prospects — voir tous les prospects d'un user
router.get('/users/:id/prospects', async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalide' });
  try {
    const prospects = await db.all(`
      SELECT id, name, phone, niche, city, pipeline_stage, status, rappel, meeting_date, website_url, created_at
      FROM prospects WHERE user_id = ? ORDER BY created_at DESC
    `, [userId]);
    res.json(prospects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id/searches — voir toutes les recherches d'un user
router.get('/users/:id/searches', async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalide' });
  try {
    const searches = await db.all(`
      SELECT id, niche, country, city, results_count, created_at
      FROM searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 200
    `, [userId]);
    res.json(searches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id/activity — voir toute l'activité d'un user
router.get('/users/:id/activity', async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalide' });
  try {
    const activity = await db.all(`
      SELECT id, action, details, created_at
      FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 200
    `, [userId]);
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/bulk-reset — reset all non-admin users to free plan, 0 credits
router.post('/bulk-reset', async (req, res) => {
  try {
    const result = await db.run(
      `UPDATE users SET plan = 'free', credits = 0 WHERE is_admin = 0 OR is_admin IS NULL`
    );
    res.json({ ok: true, updated: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
