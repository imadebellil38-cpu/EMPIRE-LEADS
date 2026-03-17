const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite'));

// Performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    credits INTEGER DEFAULT 5,
    google_key TEXT DEFAULT '',
    anthropic_key TEXT DEFAULT '',
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT,
    phone TEXT,
    address TEXT,
    rating REAL,
    reviews INTEGER DEFAULT 0,
    city TEXT,
    status TEXT DEFAULT 'todo',
    notes TEXT DEFAULT '',
    rappel TEXT DEFAULT '',
    niche TEXT DEFAULT '',
    search_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    niche TEXT,
    country TEXT,
    results_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_prospects_user ON prospects(user_id);
  CREATE INDEX IF NOT EXISTS idx_prospects_phone ON prospects(user_id, phone);
  CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at);
`);

// ── Migrations ──
const crypto = require('crypto');

const migrations = [
  `ALTER TABLE users ADD COLUMN referral_code TEXT`,
  `ALTER TABLE users ADD COLUMN referred_by INTEGER`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`,
  `CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referred_by)`,
  `UPDATE users SET plan = 'enterprise' WHERE plan = 'business'`,
  // ── Search modes & social check ──
  `ALTER TABLE prospects ADD COLUMN website_url TEXT DEFAULT ''`,
  `ALTER TABLE prospects ADD COLUMN has_facebook INTEGER DEFAULT -1`,
  `ALTER TABLE prospects ADD COLUMN has_instagram INTEGER DEFAULT -1`,
  `ALTER TABLE prospects ADD COLUMN has_tiktok INTEGER DEFAULT -1`,
  `ALTER TABLE prospects ADD COLUMN search_mode TEXT DEFAULT 'site'`,
  `ALTER TABLE searches ADD COLUMN search_mode TEXT DEFAULT 'site'`,
  `ALTER TABLE prospects ADD COLUMN owner_name TEXT DEFAULT ''`,
  // ── Pipeline CRM ──
  `ALTER TABLE prospects ADD COLUMN pipeline_stage TEXT DEFAULT 'cold_call'`,
  `ALTER TABLE prospects ADD COLUMN objection TEXT DEFAULT ''`,
  `ALTER TABLE prospects ADD COLUMN meeting_date TEXT DEFAULT ''`,
  // ── Deal details ──
  `ALTER TABLE prospects ADD COLUMN deal_type TEXT DEFAULT ''`,
  `ALTER TABLE prospects ADD COLUMN deal_date TEXT DEFAULT ''`,
  `ALTER TABLE prospects ADD COLUMN deal_recurrence TEXT DEFAULT ''`,
  // ── Call attempts ──
  `CREATE TABLE IF NOT EXISTS call_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    attempt_type TEXT NOT NULL,
    result TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_call_attempts_prospect ON call_attempts(prospect_id)`,
  // ── Stripe ──
  `ALTER TABLE users ADD COLUMN stripe_customer_id TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id)`,
  // ── Trial plan ──
  `ALTER TABLE users ADD COLUMN trial_ends_at DATETIME`,
  // ── Reset password ──
  `ALTER TABLE users ADD COLUMN reset_token TEXT`,
  `ALTER TABLE users ADD COLUMN reset_token_expires DATETIME`,
  // ── Search cache ──
  `CREATE TABLE IF NOT EXISTS search_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    results_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_cache_key ON search_cache(cache_key)`,
];

for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column/index already exists */ }
}

// Backfill referral codes for existing users
const usersWithoutCode = db.prepare('SELECT id FROM users WHERE referral_code IS NULL').all();
const updateCode = db.prepare('UPDATE users SET referral_code = ? WHERE id = ?');
for (const u of usersWithoutCode) {
  const code = crypto.randomBytes(4).toString('hex');
  try { updateCode.run(code, u.id); } catch (e) { /* collision — skip */ }
}

module.exports = db;
