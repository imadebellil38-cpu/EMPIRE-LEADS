const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = Router();

// All admin routes require admin
router.use(requireAdmin);

const VALID_PLANS = { free: 5, starter: 100, pro: 500, business: 2000, legend: 3000, trial: 20, enterprise: 500 };
const PLAN_PRICES = { free: 0, starter: 40, pro: 100, business: 300, legend: 445, trial: 0, enterprise: 100 };

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

module.exports = router;
