const { Pool } = require('pg');

const sslConfig = (() => {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost')) return false;
  return { rejectUnauthorized: false };
})();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: process.env.VERCEL ? 2 : 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
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

module.exports = db;
