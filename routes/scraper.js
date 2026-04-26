const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');

// Simple HTML fetch helper
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      timeout: 15000,
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Parse Codeur.com project listings from HTML
function parseProjects(html) {
  const projects = [];

  // Match project blocks — each project is in a card/list item
  // Pattern: find project titles with links, budgets, dates, descriptions
  const titleRegex = /<a[^>]*href="(\/projects\/[^"]+)"[^>]*class="[^"]*project[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const blockRegex = /<div[^>]*class="[^"]*project-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

  // Simpler approach: extract all project links and surrounding text
  // Codeur.com structure: each project has a link like /projects/XXXXX-title
  const linkPattern = /href="(\/projects\/(\d+)-([^"]+))"/g;
  let match;
  const seenIds = new Set();

  while ((match = linkPattern.exec(html)) !== null) {
    const path = match[1];
    const id = match[2];
    const slug = match[3];

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Extract surrounding context (500 chars around the match)
    const start = Math.max(0, match.index - 300);
    const end = Math.min(html.length, match.index + 500);
    const context = html.substring(start, end);

    // Try to extract title from the link text
    const titleMatch = context.match(new RegExp('href="' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>\\s*([^<]+)'));
    const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');

    // Try to extract budget
    const budgetMatch = context.match(/(\d[\d\s]*€|<\s*500\s*€|500.*1\s*000\s*€|1\s*000.*10\s*000\s*€|10\s*000\s*€\+|\+\s*de\s*\d+\s*€|Moins de \d+\s*€)/i);
    const budget = budgetMatch ? budgetMatch[1].replace(/\s+/g, ' ').trim() : '';

    // Try to extract time ago
    const timeMatch = context.match(/(il y a [^<]+|(\d+)\s*(minute|heure|jour|semaine|mois)[s]?\s*(ago)?)/i);
    const timeAgo = timeMatch ? timeMatch[1].trim() : '';

    // Try to extract description
    const descMatch = context.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().substring(0, 200) : '';

    projects.push({
      id,
      title,
      budget,
      timeAgo,
      description,
      url: 'https://www.codeur.com' + path,
      slug,
    });
  }

  return projects;
}

// Alternative simpler parser using text patterns
function parseProjectsSimple(html) {
  const projects = [];
  // Remove scripts and styles
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');

  // Find all project links
  const regex = /href="(\/projects\/(\d+)-([^"]+))"/g;
  let m;
  const seen = new Set();

  while ((m = regex.exec(clean)) !== null) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);

    const url = 'https://www.codeur.com' + m[1];
    const title = m[3].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    projects.push({
      id: m[2],
      title,
      url,
    });
  }
  return projects;
}

// Cache: store results for 30 minutes
let cache = { data: null, ts: 0 };
const CACHE_TTL = 30 * 60 * 1000;

// GET /api/scrape/codeur?pages=3&keyword=site
router.get('/codeur', async (req, res) => {
  try {
    const pages = Math.min(parseInt(req.query.pages) || 3, 10);
    const keyword = (req.query.keyword || '').toLowerCase();

    // Check cache
    const cacheKey = `codeur_${pages}_${keyword}`;
    if (cache.data && cache.key === cacheKey && Date.now() - cache.ts < CACHE_TTL) {
      return res.json({ projects: cache.data, cached: true, count: cache.data.length });
    }

    const allProjects = [];

    for (let p = 1; p <= pages; p++) {
      try {
        const url = `https://www.codeur.com/projects?page=${p}`;
        const html = await fetchPage(url);

        // Use both parsers, merge results
        let batch = parseProjects(html);
        if (batch.length === 0) batch = parseProjectsSimple(html);

        allProjects.push(...batch);

        // Small delay between pages
        if (p < pages) await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        console.error(`Codeur.com page ${p} error:`, e.message);
      }
    }

    // Dedup by id
    const seen = new Set();
    let unique = allProjects.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // Filter by keyword if provided
    if (keyword) {
      unique = unique.filter(p =>
        (p.title || '').toLowerCase().includes(keyword) ||
        (p.description || '').toLowerCase().includes(keyword) ||
        (p.slug || '').toLowerCase().includes(keyword)
      );
    }

    // Sort by id desc (newest first)
    unique.sort((a, b) => parseInt(b.id) - parseInt(a.id));

    // Cache
    cache = { data: unique, ts: Date.now(), key: cacheKey };

    res.json({ projects: unique, cached: false, count: unique.length });
  } catch (e) {
    console.error('Scraper error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
