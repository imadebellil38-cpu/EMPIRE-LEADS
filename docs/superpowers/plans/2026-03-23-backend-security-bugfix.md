# Backend Security & Bugfix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 5 critical bugs and harden security to bring backend quality from 5/10 → 10/10 and security from 3/10 → 10/10.

**Architecture:** Patch-in-place approach — fix broken async calls (stripeWebhook, searchCache), fix business logic bugs (referral, prices), add security layers (input sanitization, CSP, auth hardening, rate limiting). No architectural refactoring.

**Tech Stack:** Node.js, Express 5, PostgreSQL, JWT, validator.js, helmet

---

## Task 1: Fix Stripe Webhook — db.prepare() → async db wrapper

**Files:**
- Modify: `routes/stripeWebhook.js` (full rewrite)

- [ ] **Step 1: Rewrite stripeWebhook.js to use async db wrapper**

Replace all synchronous `db.prepare(...).run()` and `db.prepare(...).get()` with `await db.run()` and `await db.get()`. The handler must become async.

```js
'use strict';
const express = require('express');
const db = require('../db');

const router = express.Router();

const PLAN_CREDITS = { free: 5, pro: 100, enterprise: 500 };

function getPlanFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return null;
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
        if (userId && pack && credits > 0) {
          await db.run('UPDATE users SET credits = credits + ? WHERE id = ?', [credits, userId]);
          console.log(`[STRIPE] User ${userId} bought pack "${pack}" (+${credits} credits)`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const user = await db.get('SELECT id FROM users WHERE stripe_customer_id = ?', [customerId]);
        if (user) {
          const priceId = sub.items?.data?.[0]?.price?.id;
          const plan = getPlanFromPriceId(priceId);
          if (plan) {
            await db.run('UPDATE users SET plan = ?, credits = ?, stripe_subscription_id = ? WHERE id = ?',
              [plan, PLAN_CREDITS[plan], sub.id, user.id]);
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
```

- [ ] **Step 2: Verify server starts without errors**

Run: `cd /c/i1/exemple-fix && node -e "require('./routes/stripeWebhook')"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add routes/stripeWebhook.js
git commit -m "fix: stripe webhook — migrate db.prepare() to async db wrapper"
```

---

## Task 2: Fix Search Cache — db.prepare() → async db wrapper

**Files:**
- Modify: `services/searchCache.js` (full rewrite)

- [ ] **Step 1: Rewrite searchCache.js with async PostgreSQL syntax**

```js
'use strict';
const db = require('../db');

const CACHE_TTL_DAYS = 7;

function getCacheKey(niche, countryOrGeo, searchMode) {
  return `${niche.toLowerCase().trim()}|${countryOrGeo}|${searchMode}`;
}

async function getCachedResults(key) {
  const row = await db.get(
    `SELECT results_json FROM search_cache WHERE cache_key = ? AND created_at > NOW() - INTERVAL '${CACHE_TTL_DAYS} days'`,
    [key]
  );
  if (!row) return null;
  try { return JSON.parse(row.results_json); } catch { return null; }
}

async function setCachedResults(key, data) {
  await db.run(
    `INSERT INTO search_cache (cache_key, results_json, created_at) VALUES (?, ?, NOW())
     ON CONFLICT(cache_key) DO UPDATE SET results_json = EXCLUDED.results_json, created_at = NOW()`,
    [key, JSON.stringify(data)]
  );
  // Clean expired entries
  await db.run(
    `DELETE FROM search_cache WHERE created_at < NOW() - INTERVAL '${CACHE_TTL_DAYS} days'`
  );
}

module.exports = { getCacheKey, getCachedResults, setCachedResults };
```

- [ ] **Step 2: Update callers in routes/search.js to await cache functions**

Find all calls to `getCachedResults()` and `setCachedResults()` in `routes/search.js` and ensure they are `await`ed (they should already be in async handlers, but verify).

- [ ] **Step 3: Verify module loads**

Run: `cd /c/i1/exemple-fix && node -e "require('./services/searchCache')"`

- [ ] **Step 4: Commit**

```bash
git add services/searchCache.js routes/search.js
git commit -m "fix: search cache — migrate db.prepare() to async db wrapper"
```

---

## Task 3: Fix Referral System — credits + 0 → credits + 5

**Files:**
- Modify: `routes/auth.js:60-61`

- [ ] **Step 1: Fix referral bonus**

Change lines 60-61 in `routes/auth.js`:

Old:
```js
await db.run('UPDATE users SET credits = credits + 0 WHERE id = ?', [referrer.id]);
await db.run('UPDATE users SET credits = credits + 0 WHERE id = ?', [result.lastInsertRowid]);
```

New:
```js
await db.run('UPDATE users SET credits = credits + 5 WHERE id = ?', [referrer.id]);
await db.run('UPDATE users SET credits = credits + 5 WHERE id = ?', [result.lastInsertRowid]);
```

- [ ] **Step 2: Commit**

```bash
git add routes/auth.js
git commit -m "fix: referral system — award 5 credits instead of 0"
```

---

## Task 4: Align Pricing — landing.html vs pricing.html

**Files:**
- Modify: `public/landing.html` (pricing section)

- [ ] **Step 1: Update landing.html prices to match pricing.html**

Find the pricing section in `landing.html` and update to match `pricing.html` values:
- Starter: 79€ / 200 leads
- Pro: 349€ / 1000 leads
- Business: 549€ / 3000 leads
- Elite: 849€ / 5000 leads

- [ ] **Step 2: Commit**

```bash
git add public/landing.html
git commit -m "fix: align landing page prices with pricing page"
```

---

## Task 5: Ensure .env is in .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Verify .env is in .gitignore, add if missing**

Check `.gitignore` for `.env` entry. If missing, add it.

- [ ] **Step 2: Remove .env from git tracking (if tracked)**

```bash
git rm --cached .env 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "fix: ensure .env is gitignored and untracked"
```

---

## Task 6: Add HTML Sanitization — prevent XSS

**Files:**
- Create: `public/sanitize.js`
- Modify: `public/index.html` (add script tag)
- Modify: `public/app.js` (replace unsafe innerHTML patterns)

- [ ] **Step 1: Create sanitize.js utility**

```js
'use strict';
/**
 * Escape HTML special characters to prevent XSS.
 * Use this for ALL user-controlled data before inserting into innerHTML.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

- [ ] **Step 2: Add script tag in index.html before app.js**

```html
<script src="/sanitize.js"></script>
```

- [ ] **Step 3: Wrap all user-data in app.js with escapeHtml()**

Search for patterns in app.js where user data (prospect name, phone, address, notes, city, niche, objection, owner_name, email) is inserted via innerHTML or template literals into the DOM. Wrap each with `escapeHtml()`.

Key patterns to find and fix:
- `${p.name}` → `${escapeHtml(p.name)}`
- `${p.phone}` → `${escapeHtml(p.phone)}`
- `${p.address}` → `${escapeHtml(p.address)}`
- `${p.notes}` → `${escapeHtml(p.notes)}`
- `${p.city}` → `${escapeHtml(p.city)}`
- `${p.niche}` → `${escapeHtml(p.niche)}`
- `${p.objection}` → `${escapeHtml(p.objection)}`
- `${p.owner_name}` → `${escapeHtml(p.owner_name)}`
- `${p.email}` → `${escapeHtml(p.email)}`

Also sanitize in: pitch display, activity log display, search history, agenda items, toast messages, modal fields.

- [ ] **Step 4: Commit**

```bash
git add public/sanitize.js public/index.html public/app.js
git commit -m "security: add XSS protection via HTML escaping on all user data"
```

---

## Task 7: Enable Content Security Policy (CSP)

**Files:**
- Modify: `server.js:35-38`

- [ ] **Step 1: Enable CSP in helmet config**

Replace:
```js
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
```

With:
```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.anthropic.com", "https://maps.googleapis.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
```

- [ ] **Step 2: Commit**

```bash
git add server.js
git commit -m "security: enable Content Security Policy headers"
```

---

## Task 8: Add Input Validation on Prospect Creation (server-side)

**Files:**
- Modify: `routes/prospects.js` (POST /manual and POST /import)

- [ ] **Step 1: Add phone validation in POST /manual**

After the `cleanPhone` line, add phone format validation:

```js
if (cleanPhone && !validator.isMobilePhone(cleanPhone, 'any', { strictMode: false }) && !/^[\d\s\+\-().]{6,20}$/.test(cleanPhone)) {
  return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
}
```

- [ ] **Step 2: Add email validation in PUT /:id/notes**

After `cleanEmail` line, add:

```js
if (cleanEmail && !validator.isEmail(cleanEmail)) {
  return res.status(400).json({ error: 'Adresse email invalide.' });
}
```

- [ ] **Step 3: Add escaping for HTML in all prospect text fields server-side**

Add a `sanitizeText` helper at the top of `routes/prospects.js`:

```js
function sanitizeText(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return validator.trim(validator.escape(str)).substring(0, maxLen);
}
```

Use it in POST /manual, POST /import, PUT /:id/notes, PUT /:id/stage for all text fields (name, address, notes, objection).

- [ ] **Step 4: Commit**

```bash
git add routes/prospects.js
git commit -m "security: add server-side input validation and HTML escaping for prospects"
```

---

## Task 9: Harden JWT Admin Check — verify in DB

**Files:**
- Modify: `auth.js` (add requireAdminFromDB middleware)
- Modify: `server.js:115` (use new middleware)

- [ ] **Step 1: Add requireAdminFromDB middleware in auth.js**

Add after the existing `requireAdmin`:

```js
// Middleware: require admin with DB verification (prevents stale JWT admin claims)
async function requireAdminFromDB(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const db = require('./db');
    const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur de vérification admin.' });
  }
}
```

Export it: `module.exports = { createToken, requireAuth, requireAdmin, requireAdminFromDB };`

- [ ] **Step 2: Use requireAdminFromDB in server.js for admin routes**

In `server.js`, import `requireAdminFromDB` and use it:

```js
const { requireAuth, requireAdminFromDB } = require('./auth');
// ...
app.use('/api/admin', requireAuth, requireAdminFromDB, require('./routes/admin'));
```

- [ ] **Step 3: Commit**

```bash
git add auth.js server.js
git commit -m "security: verify admin status from DB instead of trusting JWT claim"
```

---

## Task 10: Restrict CORS to real domains

**Files:**
- Modify: `server.js:41-46`
- Modify: `.env.example`

- [ ] **Step 1: Update CORS config to reject wildcard in production**

Replace:
```js
const corsOrigins = process.env.CORS_ORIGINS || '*';
```

With:
```js
const corsOrigins = process.env.CORS_ORIGINS || (isProd ? 'https://empire-leads.fr' : '*');
```

- [ ] **Step 2: Add CORS_ORIGINS to .env.example**

Add: `CORS_ORIGINS=https://empire-leads.fr,https://www.empire-leads.fr`

- [ ] **Step 3: Commit**

```bash
git add server.js .env.example
git commit -m "security: restrict CORS to configured domains in production"
```

---

## Task 11: Fix PostgreSQL SSL

**Files:**
- Modify: `db.js:3-8`

- [ ] **Step 1: Use proper SSL config**

Replace:
```js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});
```

With:
```js
const sslConfig = (() => {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost')) return false;
  // Allow explicit override for hosted DBs that need rejectUnauthorized: false (e.g. Neon, Supabase)
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
})();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
});
```

- [ ] **Step 2: Add DB_SSL_REJECT_UNAUTHORIZED to .env.example**

Add: `DB_SSL_REJECT_UNAUTHORIZED=false  # Set to 'true' in production with proper CA certs`

- [ ] **Step 3: Commit**

```bash
git add db.js .env.example
git commit -m "security: configurable SSL verification for PostgreSQL connection"
```

---

## Task 12: Add Rate Limiting on Login/Register

**Files:**
- Modify: `routes/auth.js:12-18`

- [ ] **Step 1: Tighten auth rate limiter**

The auth limiter already exists at 20 req/15min. Tighten to 5 req/15min for login specifically:

After the existing `authLimiter`, add a strict login limiter:

```js
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});
```

Change `router.post('/login', authLimiter,` to `router.post('/login', loginLimiter,`

- [ ] **Step 2: Commit**

```bash
git add routes/auth.js
git commit -m "security: stricter rate limiting on login endpoint (5 req/15min)"
```

---

## Task 13: Secure Quotes Routes — add auth where missing

**Files:**
- Modify: `routes/quotes.js`

- [ ] **Step 1: Verify all non-sign routes have requireAuth**

Review `routes/quotes.js`. The public routes (`/sign/:token` GET and POST) are correctly public. All other routes already use `requireAuth` inline. Verify this is correct — no changes needed if all non-sign routes have `requireAuth`.

Current state:
- GET `/sign/:token` — public ✓
- POST `/sign/:token` — public ✓
- GET `/` — has `requireAuth` ✓
- GET `/:id/pdf` — has `requireAuth` ✓
- POST `/:id/send` — has `requireAuth` ✓
- GET `/:id` — has `requireAuth` ✓
- POST `/` — has `requireAuth` ✓
- PUT `/:id` — has `requireAuth` ✓
- DELETE `/:id` — has `requireAuth` ✓

All protected. No changes needed.

- [ ] **Step 2: Add signature_data size limit on POST /sign/:token**

Add size validation for signature data to prevent abuse:

After `if (!signature_data || !signature_data.startsWith('data:image/'))`:
```js
if (signature_data.length > 500000) {
  return res.status(400).json({ error: 'Signature trop volumineuse.' });
}
```

- [ ] **Step 3: Commit**

```bash
git add routes/quotes.js
git commit -m "security: add signature data size limit on public quote signing"
```

---

## Task 14: Add Tests — auth, search, admin, quotes, webhook

**Files:**
- Create: `tests/auth.test.js`
- Create: `tests/quotes.test.js`
- Create: `tests/stripeWebhook.test.js`
- Create: `tests/security.test.js`
- Modify: `package.json` (add test script if needed)

- [ ] **Step 1: Create auth.test.js**

Test: register (valid, duplicate, invalid email, short password), login (valid, wrong password, disabled account), forgot-password, reset-password, /me endpoint, referral bonus (+5 credits).

- [ ] **Step 2: Create quotes.test.js**

Test: create quote, update, delete, PDF generation, public signing (valid/invalid token, oversized signature), ownership isolation.

- [ ] **Step 3: Create stripeWebhook.test.js**

Test: checkout.session.completed (credits added), subscription.updated (plan changed), subscription.deleted (downgrade to free), invoice.payment_succeeded (credits renewed). Mock stripe signature verification.

- [ ] **Step 4: Create security.test.js**

Test: XSS payloads in prospect name/notes are escaped, rate limiting on login, CORS headers in production mode, CSP headers present, auth required on protected routes.

- [ ] **Step 5: Run all tests**

Run: `cd /c/i1/exemple-fix && npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test: add comprehensive test suites for auth, quotes, webhook, security"
```

---

## Summary

| Task | Category | Impact |
|------|----------|--------|
| 1. Stripe webhook | Critical bug | Payments now credit users |
| 2. Search cache | Critical bug | Cache works, saves API costs |
| 3. Referral +5 | Critical bug | Referral system functional |
| 4. Align prices | Critical bug | No more pricing confusion |
| 5. .env gitignore | Critical bug | Secrets not leaked |
| 6. XSS sanitization | Security | No stored XSS possible |
| 7. CSP headers | Security | Script injection blocked |
| 8. Input validation | Security | Server rejects bad data |
| 9. JWT admin DB check | Security | Admin revocation works |
| 10. CORS restrict | Security | No cross-origin abuse |
| 11. PostgreSQL SSL | Security | DB connection encrypted |
| 12. Login rate limit | Security | Brute force blocked |
| 13. Quotes auth audit | Security | Signature size limited |
| 14. Tests | Quality | Full coverage on critical paths |
