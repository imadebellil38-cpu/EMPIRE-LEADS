// ── Load environment variables FIRST ──
const path_env = require('path');
const _env = require('dotenv').config({ path: path_env.join(__dirname, '.env') });
// dotenvx v17 parses but doesn't always inject — force it
if (_env.parsed) Object.assign(process.env, _env.parsed);

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Init database (creates tables on first run)
require('./db');

// Auto-migration: add instagram_handle column
(async () => {
  try {
    const db = require('./db');
    await db.run(`DO $$ BEGIN ALTER TABLE prospects ADD COLUMN instagram_handle TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
  } catch (e) { /* column already exists or DB not ready */ }
})();

const { requireAuth, requireAdminFromDB } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Request logger ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 400 ? '\x1b[31m' : res.statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}${req.method}\x1b[0m ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ── Security headers ──
// CSP: relaxed for instagram-finder (needs inline script for bookmarklet)
app.use((req, res, next) => {
  const isIgFinder = req.path === '/instagram-finder';
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isIgFinder ? ["'self'", "'unsafe-inline'"] : ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.anthropic.com", "https://maps.googleapis.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })(req, res, next);
});

// ── CORS ──
const corsOrigins = process.env.CORS_ORIGINS || (isProd ? 'https://empire-leads.fr' : '*');
app.use(cors({
  origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Compression (gzip) ──
app.use(compression());

// ── Body parser ──
app.use(express.json({ limit: '5mb' }));

// ── Global rate limiter (100 req / 15 min per IP) ──
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
});
app.use('/api/', globalLimiter);

// ── Strict rate limiter for search (10 req / 15 min per IP) ──
const searchLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.SEARCH_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de recherches. Réessayez dans quelques minutes.' },
});

// ── Health check ──
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── QR Code access page ──
app.get('/qr', async (req, res) => {
  const QRCode = require('qrcode');
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIP = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
  }
  const url = `http://${localIP}:${PORT}/app`;
  const qrSvg = await QRCode.toString(url, { type: 'svg', width: 220, margin: 2 });
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR Code</title>
  <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff;gap:1rem}
  .qr{background:#fff;padding:16px;border-radius:16px}.url{font-size:.85rem;color:#f97316;word-break:break-all;text-align:center;max-width:280px}</style></head>
  <body><h2 style="margin:0">📱 Scanner pour ouvrir l'app</h2><div class="qr">${qrSvg}</div><div class="url">${url}</div></body></html>`);
});

// === Pages (BEFORE static so they take priority) ===
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));
app.get('/instagram-finder', (req, res) => res.sendFile(path.join(__dirname, 'public', 'instagram-finder.html')));

// ── Static files (CSS, JS, images) ──
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProd ? '1d' : 0,
  index: false, // Don't serve index.html on / — landing.html handles that
}));

// === Public auth routes (rate-limited on login/register only) ===
app.use('/api', require('./routes/auth'));

// === Protected routes (require JWT) ===
app.use('/api/search', requireAuth, searchLimiter, require('./routes/search'));
app.use('/api/prospects', requireAuth, require('./routes/prospects'));
app.use('/api/pitch', requireAuth, require('./routes/pitch'));
app.use('/api/admin', requireAuth, requireAdminFromDB, require('./routes/admin'));
app.use('/api/subscription', requireAuth, require('./routes/subscription'));
app.use('/api/referral', requireAuth, require('./routes/referral'));
app.use('/api/quotes', require('./routes/quotes')); // sign/* are public, others need auth inline

// ── Sign page (public) ──
app.get('/sign/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sign.html')));

// ── 404 handler for API routes ──
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error('\x1b[31m[ERROR]\x1b[0m', err.stack || err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: isProd ? 'Erreur interne du serveur.' : (err.message || 'Erreur interne.'),
  });
});

// ── Start ──
const http = require('http');
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\x1b[36m⚡ Prospecto SaaS\x1b[0m démarré sur \x1b[4mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`   Mode: ${isProd ? 'production' : 'development'} | Rate limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 100} req/15min`);
});
server.on('error', (err) => {
  console.error('\x1b[31m[ERROR] Impossible de démarrer le serveur:\x1b[0m', err.message);
  process.exit(1);
});
