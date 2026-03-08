const { Router } = require('express');
const db = require('../db');

const router = Router();

const PLANS = {
  free:       { credits: 5,   price: 0  },
  pro:        { credits: 100, price: 29 },
  enterprise: { credits: 500, price: 79 },
};

// GET /api/subscription/plans — list available plans
router.get('/plans', (req, res) => {
  res.json(PLANS);
});

// PUT /api/subscription/upgrade — change plan (simulated, no payment)
router.put('/upgrade', (req, res) => {
  const { plan } = req.body;

  if (!PLANS[plan]) {
    return res.status(400).json({ error: `Plan invalide. Choix: ${Object.keys(PLANS).join(', ')}` });
  }

  const user = db.prepare('SELECT id, plan FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  if (user.plan === plan) {
    return res.status(400).json({ error: 'Vous avez déjà ce plan.' });
  }

  db.prepare('UPDATE users SET plan = ?, credits = ? WHERE id = ?')
    .run(plan, PLANS[plan].credits, req.user.id);

  const updated = db.prepare('SELECT id, email, plan, credits FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, user: updated });
});

module.exports = router;
