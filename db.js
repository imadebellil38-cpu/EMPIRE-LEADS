const { Pool } = require('pg');

const sslConfig = (() => {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost')) return false;
  return { rejectUnauthorized: false };
})();

// Supabase pooler (pgbouncer transaction mode) + Vercel serverless:
// - max:1 per function instance (Supabase transaction pool limit is tight on free/pro tiers)
// - short idle: release the connection quickly so other instances can reuse the pool slot
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: process.env.VERCEL ? 1 : 10,
  idleTimeoutMillis: process.env.VERCEL ? 1000 : 10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true,
});

// Convert ? placeholders → $1, $2, ...
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Convert SQLite-specific syntax → PostgreSQL
function adapt(sql) {
  return toPositional(sql)
    .replace(/DATE\('now',\s*'(-?\d+)\s+days'\)/gi, (_, n) => `(CURRENT_DATE + INTERVAL '${n} days')`)
    .replace(/DATE\('now'\)/gi, 'CURRENT_DATE')
    .replace(/datetime\("now"\)/gi, 'NOW()')
    .replace(/date\(([^)]+)\)/gi, (_, c) => `(${c})::date`)
    .replace(/strftime\('%W',\s*([^)]+)\)/gi, (_, c) => `TO_CHAR(${c}, 'IW')`)
    .replace(/COALESCE\(NULL,\s*/gi, 'COALESCE(NULL, ');
}

const db = {
  async get(sql, params = []) {
    const r = await pool.query(adapt(sql), params);
    return r.rows[0] || null;
  },
  async all(sql, params = []) {
    const r = await pool.query(adapt(sql), params);
    return r.rows;
  },
  async run(sql, params = []) {
    const r = await pool.query(adapt(sql), params);
    return { changes: r.rowCount, rowCount: r.rowCount };
  },
  async insert(sql, params = []) {
    const rSql = adapt(sql) + ' RETURNING id';
    const r = await pool.query(rSql, params);
    return { lastInsertRowid: r.rows[0]?.id };
  },
  pool,
};

// === Idempotent startup migrations ===
// Adds non-destructive columns required by newer features.
// Uses Postgres "ADD COLUMN IF NOT EXISTS" so it can be re-run safely.
(async () => {
  try {
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS recall_type TEXT");
    await pool.query(`CREATE TABLE IF NOT EXISTS deleted_prospects (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      phone TEXT,
      name_key TEXT,
      addr_key TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query("CREATE INDEX IF NOT EXISTS idx_deleted_prospects_user ON deleted_prospects(user_id)");
    // PRO enrichment columns (Pappers data)
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS siren TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dirigeant_nom TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dirigeant_prenom TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dirigeant_role TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS effectif TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS chiffre_affaires TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS secteur_naf TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS phone_pappers TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS linkedin_url TEXT");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE prospects ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0");
    // User plan column for PRO features
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free'");
    // Google OAuth column
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT");
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL AND google_id != ''");
    // === BI / Analytics columns (ajout avril 2026) ===
    // last_activity_at: mis à jour à chaque requête authentifiée → calcul MAU instant
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity_at) WHERE last_activity_at IS NOT NULL");
    // signup_source: 'direct' | 'referral' | 'google_oauth' — pour analyse d'acquisition
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_source TEXT DEFAULT 'direct'");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_users_signup_source ON users(signup_source)");
    // trial_activated_at: quand le trial a commencé réellement (= signup pour free, upgrade date pour trial→paid)
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_activated_at TIMESTAMPTZ");
    // trial_converted_at: quand le user est passé trial → paid (pour calcul conversion rate)
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_converted_at TIMESTAMPTZ");
    // Backfill trial_activated_at pour users existants (= created_at)
    await pool.query("UPDATE users SET trial_activated_at = created_at WHERE trial_activated_at IS NULL AND created_at IS NOT NULL");
    // Backfill last_activity_at depuis activity_log (dernier login ou action)
    // → les dashboards BI ont des données utiles immédiatement au lieu d'attendre
    //   que les users se reconnectent pour peupler la colonne
    await pool.query(`
      UPDATE users u
      SET last_activity_at = sub.max_ts
      FROM (
        SELECT user_id, MAX(created_at) as max_ts
        FROM activity_log
        WHERE user_id IS NOT NULL
        GROUP BY user_id
      ) sub
      WHERE u.id = sub.user_id AND u.last_activity_at IS NULL
    `);
    // Pour les users sans activity_log mais avec created_at → utiliser created_at (ils ont au moins créé leur compte)
    await pool.query("UPDATE users SET last_activity_at = created_at WHERE last_activity_at IS NULL AND created_at IS NOT NULL");
    // Set extension key for ilyess — will match 0 rows if user doesn't exist yet
    const r = await pool.query("UPDATE users SET extension_key = 'EL-ILY-4829' WHERE email = 'ilyess@empireleads.fr'");
    if (r.rowCount === 0) console.log('[migration] ilyess@empireleads.fr not found — extension key not set');
    else console.log('[migration] extension key set for ilyess@empireleads.fr');
    // Set extension key for matheo
    const rm = await pool.query("UPDATE users SET extension_key = 'EL-MAT-7392' WHERE email = 'matheo@empireleads.fr'");
    if (rm.rowCount === 0) console.log('[migration] matheo@empireleads.fr not found — extension key not set');
    else console.log('[migration] extension key set for matheo@empireleads.fr');
  } catch (e) { /* table may not exist yet on cold start; harmless */ }
})();

module.exports = db;
