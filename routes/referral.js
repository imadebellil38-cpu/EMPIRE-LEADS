const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/referral — referral stats for current user
router.get('/', (req, res) => {
  const user = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const totalReferrals = db.prepare(
    'SELECT COUNT(*) as c FROM users WHERE referred_by = ?'
  ).get(req.user.id).c;

  res.json({
    referral_code: user.referral_code,
    total_referrals: totalReferrals,
    credits_earned: totalReferrals * 5,
  });
});

module.exports = router;
