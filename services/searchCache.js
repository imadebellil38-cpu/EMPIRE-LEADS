'use strict';
const db = require('../db');

const CACHE_TTL_DAYS = 7;

function getCacheKey(niche, countryOrGeo, searchMode) {
  return `${niche.toLowerCase().trim()}|${countryOrGeo}|${searchMode}`;
}

async function getCachedResults(key) {
  const row = await db.get(
    `SELECT results_json FROM search_cache WHERE cache_key = ? AND created_at > NOW() - INTERVAL '7 days'`,
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
  await db.run(`DELETE FROM search_cache WHERE created_at < NOW() - INTERVAL '7 days'`);
}

module.exports = { getCacheKey, getCachedResults, setCachedResults };
