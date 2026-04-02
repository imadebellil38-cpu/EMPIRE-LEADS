const jwt = require('jsonwebtoken');

// JWT secret from environment (NEVER hardcode in production)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'CHANGE_ME_TO_A_RANDOM_STRING') {
  console.error('\x1b[31m[FATAL] JWT_SECRET is not set or is using the default value. Set it in .env\x1b[0m');
  if (!process.env.VERCEL) process.exit(1);
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Middleware: require auth
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant.' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
    }
    return res.status(401).json({ error: 'Token invalide.' });
  }
}

// Middleware: require admin
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
  }
  next();
}

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
    console.error('[requireAdminFromDB]', err.message, err.stack);
    return res.status(500).json({ error: 'Erreur de vérification admin.', detail: err.message });
  }
}

module.exports = { createToken, requireAuth, requireAdmin, requireAdminFromDB };
