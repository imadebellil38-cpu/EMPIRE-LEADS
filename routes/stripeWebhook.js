'use strict';
const express = require('express');
const db = require('../db');
const { sendPaymentConfirmEmail } = require('../services/email');

const router = express.Router();

const PLAN_CREDITS = { free: 5, starter: 200, pro: 1000, business: 3000, legend: 5000 };

function getPlanFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business';
  if (priceId === process.env.STRIPE_PRICE_LEGEND) return 'legend';
  return null;
}

// Mark user as converted (free/trial → paid) the FIRST time they upgrade
async function markTrialConverted(userId) {
  try {
    await db.run(
      'UPDATE users SET trial_converted_at = ? WHERE id = ? AND trial_converted_at IS NULL',
      [new Date().toISOString(), userId]
    );
  } catch (_) {}
}

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET) return res.status(503).send('Stripe not configured');

  const stripe = require('stripe')(STRIPE_SECRET);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    if (STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('[STRIPE WEBHOOK] Signature error:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  console.log(`[STRIPE WEBHOOK] ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = parseInt(session.metadata?.user_id);
        const pack = session.metadata?.pack;
        const credits = parseInt(session.metadata?.credits);
        if (userId && pack) {
          // Mettre à jour le plan ET les crédits en une fois (avant on faisait que les crédits)
          if (PLAN_CREDITS[pack] !== undefined) {
            await db.run('UPDATE users SET plan = ?, credits = ? WHERE id = ?',
              [pack, PLAN_CREDITS[pack], userId]);
          } else if (credits > 0) {
            await db.run('UPDATE users SET credits = credits + ? WHERE id = ?', [credits, userId]);
          }
          // Tag trial→paid conversion pour BI
          await markTrialConverted(userId);
          console.log(`[STRIPE] User ${userId} bought pack "${pack}" (plan=${pack}, credits=${PLAN_CREDITS[pack] || credits})`);
          // Send payment confirmation email (non-blocking)
          const user = await db.get('SELECT email FROM users WHERE id = ?', [userId]);
          if (user) sendPaymentConfirmEmail(user.email, pack, PLAN_CREDITS[pack] || credits).catch(() => {});
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const user = await db.get('SELECT id, plan FROM users WHERE stripe_customer_id = ?', [customerId]);
        if (user) {
          const priceId = sub.items?.data?.[0]?.price?.id;
          const plan = getPlanFromPriceId(priceId);
          if (plan) {
            await db.run('UPDATE users SET plan = ?, credits = ?, stripe_subscription_id = ? WHERE id = ?',
              [plan, PLAN_CREDITS[plan], sub.id, user.id]);
            // Si le user passait de free/trial à un plan payant, c'est une conversion
            if (user.plan === 'free' || user.plan === 'trial' || !user.plan) {
              await markTrialConverted(user.id);
            }
            console.log(`[STRIPE] Subscription updated: user ${user.id} → ${plan}`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const user = await db.get('SELECT id FROM users WHERE stripe_customer_id = ?', [customerId]);
        if (user) {
          await db.run('UPDATE users SET plan = ?, credits = ?, stripe_subscription_id = NULL WHERE id = ?',
            ['free', PLAN_CREDITS.free, user.id]);
          console.log(`[STRIPE] Subscription cancelled: user ${user.id} → free`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const user = await db.get('SELECT id, plan FROM users WHERE stripe_customer_id = ?', [customerId]);
        if (user && user.plan !== 'free') {
          await db.run('UPDATE users SET credits = ? WHERE id = ?',
            [PLAN_CREDITS[user.plan] || 0, user.id]);
          console.log(`[STRIPE] Credits renewed: user ${user.id} (${user.plan})`);
        }
        break;
      }
    }
  } catch (err) {
    console.error('[STRIPE WEBHOOK] Processing error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  res.json({ received: true });
});

module.exports = router;
