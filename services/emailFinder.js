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

/* ──────────────────────────────────────────
   WEB SCRAPING — fetch page and extract emails
────────────────────────────────────────── */

function fetchPage(url, timeout) {
  timeout = timeout || 5000;
  return new Promise(function(resolve) {
    try {
      var req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmpireLeads/1.0)' } }, function(res) {
        if (res.statusCode !== 200) { res.resume(); return resolve(''); }
        var data = '';
        res.setEncoding('utf8');
        res.on('data', function(c) { data += c; if (data.length > 200000) res.destroy(); });
        res.on('end', function() { resolve(data); });
        res.on('error', function() { resolve(''); });
      });
      req.on('error', function() { resolve(''); });
      req.setTimeout(timeout, function() { req.destroy(); resolve(''); });
    } catch(e) { resolve(''); }
  });
}

function extractEmailsFromText(text) {
  if (!text) return [];
  var regex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  var raw = text.match(regex) || [];
  var seen = {};
  return raw.filter(function(e) {
    var lower = e.toLowerCase();
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js)$/i.test(lower)) return false;
    if (lower.indexOf('example.com') !== -1 || lower.indexOf('sentry.io') !== -1) return false;
    if (lower.indexOf('@2x') !== -1 || lower.indexOf('@3x') !== -1) return false;
    if (seen[lower]) return false;
    seen[lower] = true;
    return true;
  });
}

function scrapeWebsiteEmails(domain) {
  var baseUrl = 'https://' + domain;
  var paths = ['/', '/contact', '/contactez-nous', '/a-propos', '/about', '/mentions-legales'];
  return Promise.allSettled(
    paths.map(function(p) { return fetchPage(baseUrl + p, 5000); })
  ).then(function(results) {
    var emails = {};
    results.forEach(function(r) {
      if (r.status === 'fulfilled' && r.value) {
        extractEmailsFromText(r.value).forEach(function(e) { emails[e.toLowerCase()] = true; });
      }
    });
    var all = Object.keys(emails);
    return {
      domainEmails: all.filter(function(e) { return e.endsWith('@' + domain); }),
      otherEmails: all.filter(function(e) { return !e.endsWith('@' + domain); }),
    };
  }).catch(function() { return { domainEmails: [], otherEmails: [] }; });
}

/* ──────────────────────────────────────────
   PATTERN GENERATION
────────────────────────────────────────── */

function generateEmailPatterns(domain, ownerName) {
  var patterns = [];
  var generic = ['contact', 'info', 'hello', 'bonjour', 'accueil', 'commercial', 'direction', 'admin'];
  generic.forEach(function(prefix) {
    patterns.push({ email: prefix + '@' + domain, type: 'generic', confidence: 30 });
  });
  if (ownerName) {
    var clean = function(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, ''); };
    var parts = ownerName.trim().split(/\s+/);
    if (parts.length >= 2) {
      var first = clean(parts[0]);
      var last = clean(parts[parts.length - 1]);
      if (first && last) {
        patterns.unshift(
          { email: first + '.' + last + '@' + domain, type: 'personal', confidence: 50 },
          { email: first[0] + last + '@' + domain, type: 'personal', confidence: 45 },
          { email: first + '@' + domain, type: 'personal', confidence: 40 }
        );
      }
    }
  }
  return patterns;
}

/* ──────────────────────────────────────────
   DEEP EMAIL SEARCH (for extension page)
────────────────────────────────────────── */

async function deepEmailSearch(opts) {
  var companyName = opts.companyName || '';
  var website = opts.website || '';
  var ownerName = opts.ownerName || '';
  var domain = opts.domain || extractDomain(website);

  var results = { domain: domain, emails: [], patterns: [], sources: [] };
  if (!domain && !companyName) {
    results.error = 'Fournissez un nom d\'entreprise ou un site web.';
    return results;
  }

  var seen = {};
  function addEmail(email, source, confidence, type) {
    var lower = email.toLowerCase();
    if (seen[lower]) return;
    seen[lower] = true;
    results.emails.push({ email: lower, source: source, confidence: confidence, type: type });
  }

  var tasks = [];

  // Hunter.io
  if (domain && HUNTER_API_KEY) {
    tasks.push(
      hunterSearch(domain).then(function(emails) {
        if (emails.length > 0) results.sources.push('hunter');
        emails.forEach(function(e) { addEmail(e, 'hunter', 60, 'hunter'); });
      }).catch(function() {})
    );
  }

  // Scrape website
  if (domain) {
    tasks.push(
      scrapeWebsiteEmails(domain).then(function(r) {
        if (r.domainEmails.length > 0 || r.otherEmails.length > 0) results.sources.push('scraping');
        r.domainEmails.forEach(function(e) { addEmail(e, 'scraping', 70, 'domain'); });
        r.otherEmails.forEach(function(e) { addEmail(e, 'scraping', 40, 'external'); });
      }).catch(function() {})
    );
  }

  await Promise.allSettled(tasks);
  results.emails.sort(function(a, b) { return b.confidence - a.confidence; });

  if (domain) {
    results.patterns = generateEmailPatterns(domain, ownerName);
  }

  return results;
}

module.exports = { findEmailForProspect, deepEmailSearch, extractDomain };
