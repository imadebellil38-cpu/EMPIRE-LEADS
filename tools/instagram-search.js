#!/usr/bin/env node
'use strict';

/**
 * Instagram Profile Finder by Niche
 * Usage: node tools/instagram-search.js "monteur video" "paris" [max_results]
 *
 * Uses multiple search engines (Bing, DuckDuckGo, Google) to find
 * Instagram profiles matching a niche + city.
 * No API key needed — uses your local Chrome browser.
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

function findChrome() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of paths) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function scrapeSearchEngine(page, url, maxWait = 10000) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: maxWait });
    await delay(2000);

    return await page.evaluate(() => {
      const results = [];
      // Get ALL links on the page
      document.querySelectorAll('a').forEach(a => {
        const href = a.href || a.getAttribute('href') || '';
        const match = href.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?(?:\?|$|#)/);
        if (match) {
          const username = match[1].toLowerCase();
          const blocked = ['p', 'explore', 'reel', 'reels', 'stories', 'accounts', 'about',
            'legal', 'developer', 'static', 'directory', 'tv', 'tags', 'locations'];
          if (!blocked.includes(username)) {
            const parent = a.closest('li') || a.closest('.b_algo') || a.closest('.result') || a.closest('.g') || a.parentElement?.parentElement;
            const text = parent?.textContent?.substring(0, 300) || '';
            results.push({ username, text });
          }
        }
      });
      return results;
    });
  } catch (e) {
    console.log(`  ⚠ Search failed: ${e.message.substring(0, 50)}`);
    return [];
  }
}

async function searchInstagramProfiles(niche, city, maxResults = 20) {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('❌ Chrome not found.');
    process.exit(1);
  }

  console.log(`\n🔍 Searching for "${niche}" in "${city}"...\n`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=fr-FR'],
  });

  const profiles = new Map(); // username -> data

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' });

    // Strategy 1: Bing (most permissive in headless)
    console.log('  📡 Bing...');
    const bingQueries = [
      `site:instagram.com "${niche}" "${city}"`,
      `site:instagram.com ${niche} ${city}`,
    ];
    for (const q of bingQueries) {
      if (profiles.size >= maxResults) break;
      const results = await scrapeSearchEngine(page, `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=30`);
      results.forEach(r => { if (!profiles.has(r.username)) profiles.set(r.username, r); });
      console.log(`    → ${results.length} profiles`);
      await delay(1000);
    }

    // Strategy 2: DuckDuckGo
    console.log('  📡 DuckDuckGo...');
    const ddgResults = await scrapeSearchEngine(page, `https://duckduckgo.com/?q=${encodeURIComponent(`site:instagram.com "${niche}" "${city}"`)}&ia=web`);
    ddgResults.forEach(r => { if (!profiles.has(r.username)) profiles.set(r.username, r); });
    console.log(`    → ${ddgResults.length} profiles`);
    await delay(1000);

    // Strategy 3: Google (might be blocked but worth trying)
    console.log('  📡 Google...');
    const googleResults = await scrapeSearchEngine(page, `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${niche}" "${city}"`)}&num=20&hl=fr`);
    googleResults.forEach(r => { if (!profiles.has(r.username)) profiles.set(r.username, r); });
    console.log(`    → ${googleResults.length} profiles`);

    // Strategy 4: Direct Instagram search (works sometimes)
    console.log('  📡 Instagram search...');
    try {
      await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(niche.replace(/\s+/g, ''))}`, {
        waitUntil: 'domcontentloaded', timeout: 8000
      });
      await delay(3000);
      const igResults = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('a[href*="/"]').forEach(a => {
          const match = a.href.match(/instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?$/);
          if (match) {
            const blocked = ['p', 'explore', 'reel', 'reels', 'stories', 'accounts', 'about', 'tags', 'locations'];
            if (!blocked.includes(match[1].toLowerCase())) {
              results.push({ username: match[1].toLowerCase(), text: '' });
            }
          }
        });
        return results;
      });
      igResults.forEach(r => { if (!profiles.has(r.username)) profiles.set(r.username, r); });
      console.log(`    → ${igResults.length} profiles`);
    } catch {}

    // Enrich top profiles with Instagram data
    const profileList = [...profiles.values()].slice(0, maxResults);
    console.log(`\n📋 ${profileList.length} profils uniques trouvés. Enrichissement...\n`);

    for (const profile of profileList) {
      try {
        await page.goto(`https://www.instagram.com/${profile.username}/`, {
          waitUntil: 'domcontentloaded', timeout: 8000
        });
        await delay(800);

        const meta = await page.evaluate(() => {
          const og = document.querySelector('meta[property="og:description"]')?.content || '';
          const title = document.querySelector('meta[property="og:title"]')?.content || '';
          return { og, title };
        });

        if (meta.og) {
          const fMatch = meta.og.match(/([\d,.]+[KkMm]?)\s*(?:Followers|abonnés)/i);
          profile.followers = fMatch ? fMatch[1] : '?';
          profile.fullName = meta.title?.replace(/\s*\(@.*/, '') || '';
          // Bio is after the "Posts -" or "publications -" part
          const bioMatch = meta.og.match(/(?:Posts|publications)\s*[-–]\s*(.*)/i);
          profile.bio = bioMatch ? bioMatch[1].substring(0, 150) : '';
        }
      } catch {
        profile.followers = '?';
        profile.bio = profile.text?.substring(0, 100) || '';
      }
      await delay(300);
    }

    return profileList;

  } finally {
    await browser.close();
  }
}

function printResults(profiles, niche, city) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  📸 INSTAGRAM: "${niche}" à ${city}`);
  console.log(`  ${profiles.length} profils trouvés`);
  console.log('═'.repeat(60));

  profiles.forEach((p, i) => {
    console.log(`\n  ${i + 1}. @${p.username}`);
    if (p.fullName) console.log(`     Nom: ${p.fullName}`);
    if (p.followers && p.followers !== '?') console.log(`     Abonnés: ${p.followers}`);
    if (p.bio) console.log(`     Bio: ${p.bio}`);
    console.log(`     🔗 https://instagram.com/${p.username}`);
  });

  console.log('\n' + '═'.repeat(60));

  // Save CSV
  const safeName = `${niche}_${city}`.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  const csvPath = path.join(__dirname, `instagram_${safeName}.csv`);
  const lines = ['Username,Nom,Abonnés,Bio,URL'];
  profiles.forEach(p => {
    const esc = s => `"${(s || '').replace(/"/g, '""')}"`;
    lines.push(`${esc(p.username)},${esc(p.fullName)},${esc(p.followers)},${esc(p.bio)},https://instagram.com/${p.username}`);
  });
  fs.writeFileSync(csvPath, '\uFEFF' + lines.join('\n'), 'utf8');
  console.log(`\n💾 CSV: ${csvPath}\n`);
}

// Main
const [,, niche, city, max] = process.argv;

if (!niche) {
  console.log(`
📸 Instagram Profile Finder

Usage: node tools/instagram-search.js "niche" "ville" [max]

Examples:
  node tools/instagram-search.js "monteur video" "paris"
  node tools/instagram-search.js "magasin manga" "lyon" 30
  node tools/instagram-search.js "coach sportif" "marseille"
  node tools/instagram-search.js "photographe" "bordeaux" 50
`);
  process.exit(0);
}

searchInstagramProfiles(niche, city || 'france', parseInt(max) || 20)
  .then(profiles => {
    printResults(profiles, niche, city || 'france');
    if (profiles.length === 0) {
      console.log('💡 Essaie avec des termes plus larges ou une plus grande ville.\n');
    }
  })
  .catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
