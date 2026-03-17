const { Router } = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = Router();

// All admin routes require admin
router.use(requireAdmin);

const VALID_PLANS = { free: 5, starter: 100, pro: 500, business: 2000, legend: 3000, trial: 20, enterprise: 500 };
const PLAN_PRICES = { free: 0, starter: 40, pro: 100, business: 300, legend: 445, trial: 0, enterprise: 100 };

// GET /api/admin/users — list all users
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.plan, u.credits, u.is_admin, u.created_at,
           (SELECT COUNT(*) FROM searches WHERE user_id = u.id) as total_searches,
           (SELECT COUNT(*) FROM prospects WHERE user_id = u.id) as total_prospects
    FROM users u ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// PUT /api/admin/users/:id/credits — set credits
router.put('/users/:id/credits', (req, res) => {
  const { credits } = req.body;
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID utilisateur invalide.' });
  if (typeof credits !== 'number' || credits < 0 || credits > 100000) {
    return res.status(400).json({ error: 'Nombre de crédits invalide (0-100000).' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(Math.floor(credits), id);
  res.json({ ok: true });
});

// PUT /api/admin/users/:id/plan — change plan
router.put('/users/:id/plan', (req, res) => {
  const { plan } = req.body;
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID utilisateur invalide.' });
  if (!VALID_PLANS[plan]) {
    return res.status(400).json({ error: `Plan invalide. Choix: ${Object.keys(VALID_PLANS).join(', ')}` });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  db.prepare('UPDATE users SET plan = ?, credits = ? WHERE id = ?')
    .run(plan, VALID_PLANS[plan], id);
  res.json({ ok: true });
});

// PUT /api/admin/users/:id/admin — toggle admin
router.put('/users/:id/admin', (req, res) => {
  const { is_admin } = req.body;
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID utilisateur invalide.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, id);
  res.json({ ok: true });
});

// GET /api/admin/searches — recent searches
router.get('/searches', (req, res) => {
  const searches = db.prepare(`
    SELECT s.*, u.email FROM searches s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC LIMIT 100
  `).all();
  res.json(searches);
});

// GET /api/admin/stats/revenue — MRR
router.get('/stats/revenue', (req, res) => {
  const planCounts = db.prepare('SELECT plan, COUNT(*) as c FROM users GROUP BY plan').all();
  let mrr = 0;
  for (const p of planCounts) {
    mrr += (PLAN_PRICES[p.plan] || 0) * p.c;
  }
  res.json({ mrr, planCounts });
});

// GET /api/admin/stats/daily — registrations + searches per day (30 days)
router.get('/stats/daily', (req, res) => {
  const registrations = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM users WHERE created_at >= DATE('now', '-30 days')
    GROUP BY DATE(created_at) ORDER BY day
  `).all();

  const searches = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM searches WHERE created_at >= DATE('now', '-30 days')
    GROUP BY DATE(created_at) ORDER BY day
  `).all();

  res.json({ registrations, searches });
});

// GET /api/admin/stats/top-users — top 10 by searches and prospects
router.get('/stats/top-users', (req, res) => {
  const bySearches = db.prepare(`
    SELECT u.id, u.email, u.plan, COUNT(s.id) as total
    FROM users u LEFT JOIN searches s ON s.user_id = u.id
    GROUP BY u.id ORDER BY total DESC LIMIT 10
  `).all();

  const byProspects = db.prepare(`
    SELECT u.id, u.email, u.plan, COUNT(p.id) as total
    FROM users u LEFT JOIN prospects p ON p.user_id = u.id
    GROUP BY u.id ORDER BY total DESC LIMIT 10
  `).all();

  res.json({ bySearches, byProspects });
});

// GET /api/admin/connections — recent logins
router.get('/connections', (req, res) => {
  const rows = db.prepare(`
    SELECT al.id, al.user_id, al.details, al.created_at, u.email, u.plan
    FROM activity_log al
    JOIN users u ON u.id = al.user_id
    WHERE al.action = 'login'
    ORDER BY al.created_at DESC LIMIT 100
  `).all();
  res.json(rows);
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalSearches = db.prepare('SELECT COUNT(*) as c FROM searches').get().c;
  const totalProspects = db.prepare('SELECT COUNT(*) as c FROM prospects').get().c;
  const planCounts = db.prepare('SELECT plan, COUNT(*) as c FROM users GROUP BY plan').all();

  res.json({ totalUsers, totalSearches, totalProspects, planCounts });
});

module.exports = router;
