// Test setup — creates an in-memory SQLite database mimicking the real schema
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.NODE_ENV = 'test';

const Database = require('better-sqlite3');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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
      is_disabled INTEGER DEFAULT 0,
      display_name TEXT DEFAULT '',
      theme_url TEXT DEFAULT '',
      referral_code TEXT,
      referred_by INTEGER,
      reset_token TEXT,
      reset_token_expires DATETIME,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      trial_ends_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      phone TEXT,
      email TEXT DEFAULT '',
      address TEXT,
      rating REAL,
      reviews INTEGER DEFAULT 0,
      city TEXT,
      status TEXT DEFAULT 'todo',
      notes TEXT DEFAULT '',
      rappel TEXT DEFAULT '',
      niche TEXT DEFAULT '',
      search_id INTEGER,
      website_url TEXT DEFAULT '',
      has_facebook INTEGER DEFAULT -1,
      has_instagram INTEGER DEFAULT -1,
      has_tiktok INTEGER DEFAULT -1,
      search_mode TEXT DEFAULT 'site',
      owner_name TEXT DEFAULT '',
      pipeline_stage TEXT DEFAULT 'cold_call',
      objection TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      niche TEXT,
      country TEXT,
      results_count INTEGER DEFAULT 0,
      search_mode TEXT DEFAULT 'site',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT UNIQUE NOT NULL,
      results_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      prospect_id INTEGER,
      number TEXT,
      items TEXT DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      tva_rate REAL DEFAULT 20,
      tva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      valid_until TEXT DEFAULT '',
      token TEXT UNIQUE,
      status TEXT DEFAULT 'draft',
      signature_data TEXT,
      signed_at DATETIME,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_search_cache_key ON search_cache(cache_key);
  `);

  // Add async-compatible wrapper methods so routes that call db.get/all/run/insert work
  // The routes await these calls; returning a resolved Promise wraps the sync SQLite result.
  db.get = function(sql, params = []) {
    try {
      // Replace ? placeholders (SQLite uses ?) and NOW() with CURRENT_TIMESTAMP
      const adaptedSql = adaptSql(sql);
      const row = db.prepare(adaptedSql).get(...params);
      return Promise.resolve(row || null);
    } catch (err) {
      return Promise.reject(err);
    }
  };

  db.all = function(sql, params = []) {
    try {
      const adaptedSql = adaptSql(sql);
      const rows = db.prepare(adaptedSql).all(...params);
      return Promise.resolve(rows);
    } catch (err) {
      return Promise.reject(err);
    }
  };

  db.run = function(sql, params = []) {
    try {
      const adaptedSql = adaptSql(sql);
      const info = db.prepare(adaptedSql).run(...params);
      return Promise.resolve({ changes: info.changes, rowCount: info.changes });
    } catch (err) {
      return Promise.reject(err);
    }
  };

  db.insert = function(sql, params = []) {
    try {
      // Strip any RETURNING clause (PostgreSQL syntax not needed in SQLite)
      const adaptedSql = adaptSql(sql).replace(/\s+RETURNING\s+\w+\s*$/i, '');
      const info = db.prepare(adaptedSql).run(...params);
      return Promise.resolve({ lastInsertRowid: info.lastInsertRowid });
    } catch (err) {
      return Promise.reject(err);
    }
  };

  return db;
}

/**
 * Adapt SQL from PostgreSQL-style (used in routes) to SQLite-compatible SQL.
 * Handles: NOW() → CURRENT_TIMESTAMP, $1/$2 → ?, RETURNING clause removal, etc.
 */
function adaptSql(sql) {
  return sql
    // Replace NOW() with CURRENT_TIMESTAMP
    .replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP')
    // Replace $1, $2, ... positional params with ?
    .replace(/\$\d+/g, '?')
    // Strip RETURNING clause at end
    .replace(/\s+RETURNING\s+\w+\s*$/i, '');
}

module.exports = { createTestDb };
