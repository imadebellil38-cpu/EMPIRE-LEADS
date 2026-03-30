const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/referral — referral stats for current user
router.get('/', async (req, res) => {
  try {
    const user = await db.get('SELECT referral_code FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const totalRow = await db.get(
      'SELECT COUNT(*) as c FROM users WHERE referred_by = ?',
      [req.user.id]
    );
    const totalReferrals = totalRow ? totalRow.c : 0;

    res.json({
      referral_code: user.referral_code,
      total_referrals: totalReferrals,
      credits_earned: totalReferrals * 5,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
