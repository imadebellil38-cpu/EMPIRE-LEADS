const https = require('https');

const HUNTER_API_KEY = process.env.HUNTER_API_KEY || '';

function extractDomain(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    const url = websiteUrl.startsWith('http') ? websiteUrl : 'https://' + websiteUrl;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch { return null; }
}

function hunterSearch(domain) {
  return new Promise((resolve) => {
    const path = `/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(HUNTER_API_KEY)}&limit=5`;
    const req = https.request({ hostname: 'api.hunter.io', path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed?.data?.emails || []).map(e => e.value).filter(Boolean));
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

async function findEmailForProspect(prospect) {
  const domain = extractDomain(prospect.website_url);

  if (!domain) {
    return { found: false, suggestions: [], error: 'Aucun site web renseigné pour ce prospect.' };
  }

  // Try Hunter.io if key configured
  if (HUNTER_API_KEY) {
    const emails = await hunterSearch(domain);
    if (emails.length > 0) {
      return { found: true, email: emails[0], all: emails };
    }
  }

  // Generate likely patterns
  const suggestions = [`contact@${domain}`, `info@${domain}`, `hello@${domain}`, `bonjour@${domain}`];

  if (prospect.owner_name) {
    const clean = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    const parts = prospect.owner_name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = clean(parts[0]);
      const last  = clean(parts[parts.length - 1]);
      suggestions.unshift(`${first}.${last}@${domain}`, `${first[0]}${last}@${domain}`);
    } else {
      suggestions.unshift(`${clean(parts[0])}@${domain}`);
    }
  }

  return { found: false, domain, suggestions: suggestions.slice(0, 5) };
}

module.exports = { findEmailForProspect };
