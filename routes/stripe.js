const { Router } = require('express');
const db = require('../db');

const router = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// 4 plans : Starter / Pro / Business / Legend
const PACKS = {
  starter:  { credits: 200,  price: (process.env.STRIPE_PRICE_STARTER   || '').trim(), label: 'Starter 200 leads',   eur: 79 },
  pro:      { credits: 1000, price: (process.env.STRIPE_PRICE_PRO      || '').trim(), label: 'Pro 1000 leads',      eur: 349 },
  business: { credits: 3000, price: (process.env.STRIPE_PRICE_BUSINESS  || '').trim(), label: 'Business 3000 leads', eur: 549 },
  legend:   { credits: 5000, price: (process.env.STRIPE_PRICE_LEGEND    || '').trim(), label: 'Legend 5000 leads',   eur: 849 },
};

// Helper : appel REST Stripe via fetch natif (contourne les problèmes SDK/Vercel)
async function stripePost(path, body) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) params.append(`${k}[${k2}]`, v2);
    } else {
      params.append(k, v);
    }
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Stripe error');
  return data;
}

// POST /api/stripe/checkout — create Stripe Checkout session
router.post('/checkout', async (req, res) => {
  if (!STRIPE_SECRET) return res.status(503).json({ error: 'Paiement non configuré.' });

  const { pack } = req.body;
  if (!pack || !PACKS[pack]) return res.status(400).json({ error: 'Pack invalide.' });
  if (!PACKS[pack].price) return res.status(400).json({ error: `Prix ${pack} non configuré.` });

  const user = await db.get('SELECT id, email, stripe_customer_id FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  try {
    const APP_URL = process.env.APP_URL || 'https://prospecthunter.vercel.app';

    // Créer ou réutiliser le customer Stripe
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripePost('/customers', {
        email: user.email,
        'metadata[user_id]': String(user.id),
      });
      customerId = customer.id;
      await db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, user.id]);
    }

    // Créer la session checkout
    const session = await stripePost('/checkout/sessions', {
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': PACKS[pack].price,
      'line_items[0][quantity]': '1',
      allow_promotion_codes: 'true',
      success_url: `${APP_URL}/app?success=1&pack=${pack}`,
      cancel_url: `${APP_URL}/app?cancelled=1`,
      'metadata[user_id]': String(user.id),
      'metadata[pack]': pack,
      'metadata[credits]': String(PACKS[pack].credits),
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[STRIPE] Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stripe/status
router.get('/status', (req, res) => {
  res.json({
    enabled: !!STRIPE_SECRET,
    packs: Object.fromEntries(Object.entries(PACKS).map(([k, v]) => [k, { credits: v.credits, eur: v.eur, configured: !!v.price }]))
  });
});

module.exports = { router, stripe: null, STRIPE_WEBHOOK_SECRET, PACKS };
