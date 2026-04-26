const { Router } = require('express');
const https = require('https');
const validator = require('validator');
const db = require('../db');
const { batchCheckSocialMedia, isSocialCheckAvailable } = require('../services/socialCheck');
const { batchFindOwners } = require('../services/pappers');
const { batchSearchInstagram, isInstagramSearchAvailable } = require('../services/instagramSearch');
const { getCacheKey, getCachedResults, setCachedResults } = require('../services/searchCache');

const router = Router();

const VALID_SEARCH_MODES = ['site', 'social', 'both', 'owners', 'fewreviews', 'new', 'instagram', 'all'];

// Anthropic API key for owner name extraction (owners mode)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function callClaudeRaw(prompt, maxTokens = 2000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Réponse invalide Anthropic')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Anthropic API timeout')); });
    req.write(body);
    req.end();
  });
}

// API key from environment
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error('\x1b[31m[WARN] GOOGLE_API_KEY not set in .env — search will fail\x1b[0m');
}

// City lists
const CITIES = {
  fr: [
    {name:'Paris',lat:48.8566,lng:2.3522},{name:'Marseille',lat:43.2965,lng:5.3698},
    {name:'Lyon',lat:45.7640,lng:4.8357},{name:'Toulouse',lat:43.6047,lng:1.4442},
    {name:'Nice',lat:43.7102,lng:7.2620},{name:'Nantes',lat:47.2184,lng:-1.5536},
    {name:'Strasbourg',lat:48.5734,lng:7.7521},{name:'Montpellier',lat:43.6108,lng:3.8767},
    {name:'Bordeaux',lat:44.8378,lng:-0.5792},{name:'Lille',lat:50.6292,lng:3.0573},
    {name:'Rennes',lat:48.1173,lng:-1.6778},{name:'Reims',lat:49.2583,lng:3.7994},
    {name:'Toulon',lat:43.1242,lng:5.928},{name:'Saint-Étienne',lat:45.4397,lng:4.3872},
    {name:'Le Havre',lat:49.4944,lng:0.1079},{name:'Grenoble',lat:45.1885,lng:5.7245},
    {name:'Dijon',lat:47.3220,lng:5.0415},{name:'Angers',lat:47.4784,lng:-0.5632},
    {name:'Nîmes',lat:43.8367,lng:4.3601},{name:'Clermont-Ferrand',lat:45.7772,lng:3.0870},
    {name:'Le Mans',lat:48.0061,lng:0.1996},{name:'Aix-en-Provence',lat:43.5297,lng:5.4474},
    {name:'Brest',lat:48.3904,lng:-4.4861},{name:'Tours',lat:47.3941,lng:0.6848},
    {name:'Amiens',lat:49.8941,lng:2.2958},{name:'Limoges',lat:45.8336,lng:1.2611},
    {name:'Perpignan',lat:42.6887,lng:2.8948},{name:'Metz',lat:49.1193,lng:6.1757},
    {name:'Besançon',lat:47.2378,lng:6.0241},{name:'Orléans',lat:47.9029,lng:1.9093},
    {name:'Rouen',lat:49.4432,lng:1.0993},{name:'Mulhouse',lat:47.7508,lng:7.3359},
    {name:'Caen',lat:49.1829,lng:-0.3707},{name:'Nancy',lat:48.6921,lng:6.1844},
    {name:'Argenteuil',lat:48.9472,lng:2.2467},{name:'Saint-Denis',lat:48.9362,lng:2.3574},
    {name:'Montreuil',lat:48.8638,lng:2.4484},{name:'Roubaix',lat:50.6942,lng:3.1746},
    {name:'Tourcoing',lat:50.7239,lng:3.1612},{name:'Avignon',lat:43.9493,lng:4.8055},
    {name:'Dunkerque',lat:51.0343,lng:2.3768},{name:'Créteil',lat:48.7905,lng:2.4559},
    {name:'Nanterre',lat:48.8924,lng:2.2071},{name:'Poitiers',lat:46.5802,lng:0.3404},
    {name:'Versailles',lat:48.8014,lng:2.1301},{name:'Courbevoie',lat:48.8966,lng:2.2529},
    {name:'Vitry-sur-Seine',lat:48.7876,lng:2.4015},{name:'Colombes',lat:48.9225,lng:2.2549},
    {name:'Pau',lat:43.2951,lng:-0.3708},{name:'Aulnay-sous-Bois',lat:48.9385,lng:2.4905},
    {name:'Asnières-sur-Seine',lat:48.9117,lng:2.2885},{name:'Rueil-Malmaison',lat:48.8769,lng:2.1894},
    {name:'La Rochelle',lat:46.1603,lng:-1.1511},{name:'Antibes',lat:43.5808,lng:7.1239},
    {name:'Saint-Maur-des-Fossés',lat:48.7933,lng:2.4925},{name:'Calais',lat:50.9513,lng:1.8587},
    {name:'Cannes',lat:43.5528,lng:7.0174},{name:'Béziers',lat:43.3442,lng:3.2192},
    {name:'Colmar',lat:48.0794,lng:7.3584},{name:'Bourges',lat:47.0810,lng:2.3988},
    {name:'Quimper',lat:47.9960,lng:-4.0999},{name:'Valence',lat:44.9334,lng:4.8924},
    {name:'Troyes',lat:48.2973,lng:4.0744},{name:'Lorient',lat:47.7483,lng:-3.3600},
    {name:'Chambéry',lat:45.5646,lng:5.9178},{name:'Niort',lat:46.3234,lng:-0.4584},
    {name:'Laval',lat:48.0735,lng:-0.7696},{name:'Sète',lat:43.4075,lng:3.6976},
    {name:'Ajaccio',lat:41.9192,lng:8.7386},{name:'Bastia',lat:42.6970,lng:9.4503},
  ],
  ch: [
    {name:'Zurich',lat:47.3769,lng:8.5417},{name:'Genève',lat:46.2044,lng:6.1432},
    {name:'Bâle',lat:47.5596,lng:7.5886},{name:'Lausanne',lat:46.5197,lng:6.6323},
    {name:'Berne',lat:46.9480,lng:7.4474},{name:'Winterthour',lat:47.5056,lng:8.7241},
    {name:'Lucerne',lat:47.0502,lng:8.3093},{name:'Saint-Gall',lat:47.4245,lng:9.3767},
    {name:'Lugano',lat:46.0037,lng:8.9511},{name:'Bienne',lat:47.1368,lng:7.2467},
    {name:'Thoune',lat:46.7580,lng:7.6280},{name:'Fribourg',lat:46.8065,lng:7.1620},
    {name:'Schaffhouse',lat:47.6960,lng:8.6361},{name:'Neuchâtel',lat:46.9900,lng:6.9293},
    {name:'Sion',lat:46.2270,lng:7.3586},{name:'Montreux',lat:46.4312,lng:6.9107},
    {name:'Yverdon',lat:46.7785,lng:6.6411},{name:'Nyon',lat:46.3833,lng:6.2398},
    {name:'Delémont',lat:47.3653,lng:7.3469},{name:'Martigny',lat:46.1029,lng:7.0714},
  ],
  be: [
    // Bruxelles — 19 communes
    {name:'Bruxelles',lat:50.8503,lng:4.3517},{name:'Ixelles',lat:50.8278,lng:4.3753},
    {name:'Uccle',lat:50.8000,lng:4.3333},{name:'Schaerbeek',lat:50.8667,lng:4.3833},
    {name:'Etterbeek',lat:50.8372,lng:4.3886},{name:'Saint-Gilles',lat:50.8278,lng:4.3461},
    {name:'Anderlecht',lat:50.8333,lng:4.3000},{name:'Woluwe-Saint-Lambert',lat:50.8417,lng:4.4333},
    {name:'Woluwe-Saint-Pierre',lat:50.8333,lng:4.4333},{name:'Forest',lat:50.8103,lng:4.3242},
    {name:'Molenbeek-Saint-Jean',lat:50.8561,lng:4.3283},{name:'Jette',lat:50.8789,lng:4.3244},
    {name:'Auderghem',lat:50.8150,lng:4.4317},{name:'Watermael-Boitsfort',lat:50.7983,lng:4.4083},
    {name:'Evere',lat:50.8667,lng:4.4000},{name:'Berchem-Sainte-Agathe',lat:50.8667,lng:4.2917},
    {name:'Ganshoren',lat:50.8750,lng:4.3083},{name:'Koekelberg',lat:50.8633,lng:4.3317},
    // Hainaut
    {name:'Charleroi',lat:50.4108,lng:4.4446},{name:'Mons',lat:50.4542,lng:3.9563},
    {name:'Tournai',lat:50.6060,lng:3.3880},{name:'La Louvière',lat:50.4791,lng:4.1859},
    {name:'Mouscron',lat:50.7436,lng:3.2064},{name:'Soignies',lat:50.5792,lng:4.0722},
    {name:'Binche',lat:50.4117,lng:4.1656},{name:'Braine-le-Comte',lat:50.6108,lng:4.1375},
    {name:'Enghien',lat:50.6917,lng:4.0333},{name:'Ath',lat:50.6294,lng:3.7786},
    {name:'Lessines',lat:50.7117,lng:3.8375},{name:'Comines-Warneton',lat:50.7614,lng:2.9958},
    {name:'Manage',lat:50.5028,lng:4.2339},{name:'Châtelet',lat:50.4000,lng:4.5167},
    {name:'Fleurus',lat:50.4833,lng:4.5500},{name:'Fontaine-l\'Évêque',lat:50.4000,lng:4.3333},
    {name:'Courcelles',lat:50.4597,lng:4.3769},{name:'Thuin',lat:50.3389,lng:4.2853},
    // Liège
    {name:'Liège',lat:50.6326,lng:5.5797},{name:'Seraing',lat:50.5836,lng:5.5006},
    {name:'Verviers',lat:50.5895,lng:5.8636},{name:'Herstal',lat:50.6667,lng:5.6333},
    {name:'Ans',lat:50.6667,lng:5.5167},{name:'Saint-Nicolas',lat:50.6333,lng:5.5333},
    {name:'Grâce-Hollogne',lat:50.6333,lng:5.5000},{name:'Waremme',lat:50.6958,lng:5.2556},
    {name:'Huy',lat:50.5186,lng:5.2375},{name:'Visé',lat:50.7344,lng:5.6942},
    {name:'Eupen',lat:50.6286,lng:6.0356},{name:'Malmedy',lat:50.4264,lng:6.0267},
    {name:'Spa',lat:50.4833,lng:5.8667},{name:'Stavelot',lat:50.3953,lng:5.9308},
    // Namur
    {name:'Namur',lat:50.4674,lng:4.8720},{name:'Sambreville',lat:50.4353,lng:4.6167},
    {name:'Gembloux',lat:50.5608,lng:4.6978},{name:'Andenne',lat:50.4886,lng:5.0972},
    {name:'Ciney',lat:50.2942,lng:5.0983},{name:'Dinant',lat:50.2611,lng:4.9122},
    {name:'Couvin',lat:50.0536,lng:4.4931},{name:'Philippeville',lat:50.1953,lng:4.5439},
    {name:'Rochefort',lat:50.1594,lng:5.2219},{name:'Fosses-la-Ville',lat:50.3917,lng:4.6917},
    // Brabant wallon
    {name:'Wavre',lat:50.7167,lng:4.6000},{name:'Nivelles',lat:50.5986,lng:4.3278},
    {name:'Ottignies-Louvain-la-Neuve',lat:50.6667,lng:4.5667},{name:'Braine-l\'Alleud',lat:50.6833,lng:4.3667},
    {name:'Tubize',lat:50.6908,lng:4.2014},{name:'Waterloo',lat:50.7147,lng:4.3997},
    {name:'Rixensart',lat:50.7167,lng:4.5333},{name:'Jodoigne',lat:50.7233,lng:4.8700},
    {name:'Perwez',lat:50.6333,lng:4.8167},{name:'Court-Saint-Étienne',lat:50.6333,lng:4.5667},
    // Luxembourg belge
    {name:'Arlon',lat:49.6833,lng:5.8167},{name:'Marche-en-Famenne',lat:50.2264,lng:5.3444},
    {name:'Bastogne',lat:50.0000,lng:5.7167},{name:'Virton',lat:49.5667,lng:5.5333},
    {name:'Neufchâteau',lat:49.8406,lng:5.4344},{name:'Libramont',lat:49.9206,lng:5.3783},
    {name:'Bouillon',lat:49.7933,lng:5.0672},{name:'Durbuy',lat:50.3528,lng:5.4569},
    {name:'Hotton',lat:50.2667,lng:5.4500},{name:'Saint-Hubert',lat:50.0264,lng:5.3750},
  ],
};

const VALID_COUNTRIES = Object.keys(CITIES);

function googlePlacesRequest(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed?.error?.message || `Google API HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(new Error('Réponse invalide Google Places')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Google API timeout')); });
    req.write(payload);
    req.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// GET /api/search/cities — return city counts per country
router.get('/cities', (req, res) => {
  const counts = {};
  for (const [code, list] of Object.entries(CITIES)) {
    counts[code] = list.length;
  }
  res.json(counts);
});

// POST /api/search — search (1 credit = 1 prospect)
router.post('/', async (req, res) => {
  const userId = req.user.id;

  // ── Validate API key availability ──
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'Clé Google API non configurée. Contactez l\'administrateur.' });
  }

  // ── Check credits ──
  const user = await db.get('SELECT credits, is_admin FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const isAdmin = !!user.is_admin;
  if (!isAdmin && user.credits <= 0) return res.status(403).json({ error: 'Plus de crédits. Passez au plan supérieur.', upgrade: true });

  // ── Extract & validate inputs ──
  const { niche, country, smartKeywords, numProspects, searchMode: rawMode } = req.body;
  // Frontend sends country='around_me' + lat/lng/radius ; normalize to geoMode/geoLat/geoLng/geoRadius
  const geoMode = req.body.geoMode || country === 'around_me';
  const geoLat = req.body.geoLat || req.body.lat;
  const geoLng = req.body.geoLng || req.body.lng;
  const geoRadius = req.body.geoRadius || req.body.radius;

  // Search mode: 'site' (no website), 'social' (no socials), 'both' (neither), 'owners' (find owner names)
  const searchMode = VALID_SEARCH_MODES.includes(rawMode) ? rawMode : 'site';
  const creditMultiplier = searchMode === 'both' ? 2 : 1;

  // If social mode requested, check CSE availability
  if ((searchMode === 'social' || searchMode === 'both') && !isSocialCheckAvailable()) {
    return res.status(400).json({ error: 'Vérification réseaux sociaux non configurée. Ajoutez GOOGLE_CSE_ID dans les paramètres serveur.' });
  }

  // If owners mode requested, check Anthropic API key
  if (searchMode === 'owners' && !ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: 'Clé Anthropic API non configurée. Ajoutez ANTHROPIC_API_KEY dans les paramètres serveur.' });
  }

  // If instagram mode requested, check CSE availability
  if (searchMode === 'instagram' && !isInstagramSearchAvailable()) {
    return res.status(400).json({ error: 'Recherche Instagram non configurée. Ajoutez GOOGLE_CSE_ID dans les paramètres serveur.' });
  }

  if (!niche || typeof niche !== 'string') {
    return res.status(400).json({ error: 'Niche requise.' });
  }
  const sanitizedNiche = validator.escape(validator.trim(niche)).substring(0, 100);
  if (!sanitizedNiche) return res.status(400).json({ error: 'Niche invalide.' });

  const countryCode = (typeof country === 'string' ? country.toLowerCase().trim() : 'fr');
  if (!geoMode && !VALID_COUNTRIES.includes(countryCode)) {
    return res.status(400).json({ error: 'Pays non supporté. Choix: ' + VALID_COUNTRIES.join(', ') });
  }

  // Validate numProspects — no hard cap, only limited by credits (or unlimited for admins)
  const requestedNum = Math.max(1, parseInt(numProspects, 10) || 5);
  const maxAffordable = isAdmin ? requestedNum : Math.floor(user.credits / creditMultiplier);
  const maxProspects = Math.min(requestedNum, maxAffordable);
  if (!isAdmin && maxProspects <= 0) return res.status(403).json({ error: 'Plus de crédits. Passez au plan supérieur.', upgrade: true });

  // Validate geo params if geo mode
  if (geoMode) {
    if (typeof geoLat !== 'number' || typeof geoLng !== 'number' || geoLat < -90 || geoLat > 90 || geoLng < -180 || geoLng > 180) {
      return res.status(400).json({ error: 'Coordonnées géographiques invalides.' });
    }
  }

  // Validate smartKeywords
  const validKeywords = Array.isArray(smartKeywords) ? smartKeywords.filter(k => typeof k === 'string').slice(0, 100) : [];

  console.log(`[SEARCH] user=${userId} niche="${sanitizedNiche}" geo=${geoMode ? 'yes' : countryCode} searchMode=${searchMode} maxProspects=${maxProspects} creditX=${creditMultiplier}`);

  // ── Log search ──
  const searchLabel = geoMode ? 'geo' : countryCode;
  const searchInsert = await db.insert('INSERT INTO searches (user_id, niche, country, search_mode) VALUES (?, ?, ?, ?)', [userId, sanitizedNiche, searchLabel, searchMode]);
  const searchId = searchInsert.lastInsertRowid;

  // ── Normalize function for keyword filtering ──
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const keywords = validKeywords.map(k => norm(k));

  const seenPhones = new Set();
  const seenNames = new Set(); // normalized name+city to catch duplicates without phone match
  const prospects = [];

  // Get existing phones for this user to avoid duplicates
  const existingProspects = await db.all('SELECT phone, name, address FROM prospects WHERE user_id = ?', [userId]);
  existingProspects.forEach(p => {
    if (p.phone) seenPhones.add(p.phone);
    // Also add existing names to dedup set
    const nk = norm(p.name || '').replace(/[^a-z0-9]/g, '');
    const ak = norm(p.address || '').replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (nk.length > 3) seenNames.add(nk + '|' + ak);
  });

  // Also exclude previously deleted prospects so they don't reappear
  const deletedProspects = await db.all('SELECT phone, name_key, addr_key FROM deleted_prospects WHERE user_id = ?', [userId]);
  deletedProspects.forEach(d => {
    if (d.phone) seenPhones.add(d.phone);
    if (d.name_key && d.name_key.length > 3) seenNames.add(d.name_key + '|' + (d.addr_key || ''));
  });

  // Collect target: owners mode over-fetches ×3 since we'll filter by found names
  const collectMax = searchMode === 'owners' ? Math.min(maxProspects * 3, 200) : maxProspects;

  // ── Helper: process places from a Google API response ──
  function processPlaces(places, cityName) {
    for (const place of places) {
      if (prospects.length >= collectMax) break;

      const name = place.displayName?.text || '';
      const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || null;
      const websiteUrl = place.websiteUri || '';
      const address = place.formattedAddress || '';

      // Deduplicate by phone
      if (phone && seenPhones.has(phone)) continue;

      // Deduplicate by normalized name (catches same business across city searches)
      const nameKey = norm(name).replace(/[^a-z0-9]/g, '');
      const addrKey = norm(address).replace(/[^a-z0-9]/g, '').slice(0, 40);
      const dedupKey = nameKey + '|' + addrKey;
      if (seenNames.has(dedupKey)) continue;
      if (nameKey.length > 3) seenNames.add(dedupKey);

      // Also deduplicate by name alone if very similar (same biz, different branch listing)
      if (seenNames.has(nameKey) && !phone) continue;

      if (!phone) continue;

      // Mode 'site' or 'both': filter OUT businesses WITH a website
      if ((searchMode === 'site' || searchMode === 'both') && websiteUrl) continue;

      // Mode 'fewreviews': keep only businesses with < 10 reviews
      const reviewCount = place.userRatingCount ?? 0;
      if (searchMode === 'fewreviews' && reviewCount >= 10) continue;

      // Mode 'new': keep only businesses with < 5 reviews (proxy for newly opened)
      if (searchMode === 'new' && reviewCount >= 5) continue;

      // Smart keyword filter
      if (keywords.length > 0) {
        const nameLow = norm(name);
        if (!keywords.some(k => nameLow.includes(k))) continue;
      }

      seenPhones.add(phone);
      prospects.push({
        name: validator.escape(name).substring(0, 200),
        phone: phone.substring(0, 30),
        address: address.substring(0, 300),
        rating: place.rating ?? null,
        reviews: place.userRatingCount ?? 0,
        city: cityName,
        website_url: websiteUrl,
        has_facebook: -1,
        has_instagram: -1,
        has_tiktok: -1,
      });
    }
  }

  try {
    // ── INSTAGRAM MODE: bypass Google Places, use CSE ──
    if (searchMode === 'instagram') {
      const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
      const searchLabel = geoMode ? 'geo' : countryCode;

      // Check cache first
      const cacheKey = getCacheKey(sanitizedNiche, searchLabel, 'instagram');
      let igResults = await getCachedResults(cacheKey);

      if (!igResults) {
        // Build city list
        const cityNames = geoMode
          ? [''] // Empty string = no city filter for geo mode
          : (CITIES[countryCode] || []).map(c => c.name);

        igResults = await batchSearchInstagram(sanitizedNiche, cityNames, GOOGLE_API_KEY, GOOGLE_CSE_ID, collectMax);

        // Cache results
        if (igResults.length > 0) {
          await setCachedResults(cacheKey, igResults);
        }
      }

      // Deduplicate against user's existing Instagram prospects
      const existingHandles = await db.all(
        "SELECT instagram_handle FROM prospects WHERE user_id = ? AND instagram_handle != ''",
        [userId]
      );
      const seenHandles = new Set(existingHandles.map(r => r.instagram_handle.toLowerCase()));

      for (const ig of igResults) {
        if (prospects.length >= maxProspects) break;
        if (seenHandles.has(ig.instagram_handle.toLowerCase())) continue;
        seenHandles.add(ig.instagram_handle.toLowerCase());

        prospects.push({
          name: ig.name || ig.instagram_handle,
          phone: '',
          address: '',
          rating: null,
          reviews: ig.followers || 0,
          city: ig.city || '',
          website_url: ig.external_url || ig.profile_url,
          has_facebook: -1,
          has_instagram: 1,
          has_tiktok: -1,
          owner_name: '',
          instagram_handle: ig.instagram_handle,
        });
      }

      console.log(`[SEARCH] Instagram mode: ${prospects.length} profiles for "${sanitizedNiche}"`);

    } else if (geoMode && geoLat && geoLng) {
      // ── GEO MODE: search around user's location ──
      const radiusMeters = Math.max(1000, Math.min((parseInt(geoRadius, 10) || 30) * 1000, 100000));
      let pageToken = null;

      for (let page = 1; page <= 5; page++) {
        if (prospects.length >= maxProspects) break;

        const body = {
          textQuery: niche, // Use original niche for Google (not escaped)
          languageCode: 'fr',
          locationBias: { circle: { center: { latitude: geoLat, longitude: geoLng }, radius: radiusMeters } },
          maxResultCount: 20,
        };
        if (pageToken) body.pageToken = pageToken;

        try {
          const data = await googlePlacesRequest(GOOGLE_API_KEY, body);
          const places = data.places || [];
          processPlaces(places, 'Autour de moi');

          pageToken = data.nextPageToken || null;
          if (!pageToken || places.length === 0) break;
          if (page < 5) await delay(300);
        } catch (err) {
          console.error(`[SEARCH] Geo search error page ${page}:`, err.message);
          break;
        }
      }

    } else {
      // ── CITY MODE: iterate through country cities ──
      const allCities = CITIES[countryCode];

      for (const city of allCities) {
        if (prospects.length >= maxProspects) break;

        let pageToken = null;

        for (let page = 1; page <= 3; page++) {
          if (prospects.length >= maxProspects) break;

          const body = {
            textQuery: `${niche} ${city.name}`,
            languageCode: 'fr',
            regionCode: countryCode,
            locationBias: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 50000 } },
            maxResultCount: 20,
          };
          if (pageToken) body.pageToken = pageToken;

          try {
            const data = await googlePlacesRequest(GOOGLE_API_KEY, body);
            const places = data.places || [];
            processPlaces(places, city.name);

            pageToken = data.nextPageToken || null;
            if (!pageToken || places.length === 0) break;
            if (page < 3) await delay(300);
          } catch (err) {
            console.error(`[SEARCH] City ${city.name} error:`, err.message);
            break;
          }
        }

        await delay(150);
      }
    }

    console.log(`[SEARCH] Google Places done. Collected ${prospects.length} raw prospects for user ${userId}`);

    // ── Social media check (modes: social, both) ──
    if (searchMode === 'social' || searchMode === 'both') {
      const toCheck = prospects.slice(0, maxProspects);
      console.log(`[SEARCH] Running social media check on ${toCheck.length} prospects...`);
      const socialResults = await batchCheckSocialMedia(toCheck, GOOGLE_API_KEY);

      for (let i = 0; i < toCheck.length; i++) {
        toCheck[i].has_facebook = socialResults[i].facebook;
        toCheck[i].has_instagram = socialResults[i].instagram;
        toCheck[i].has_tiktok = socialResults[i].tiktok;
      }

      toCheck.sort((a, b) => {
        const scoreA = (a.has_facebook === 0 ? 0 : 1) + (a.has_instagram === 0 ? 0 : 1) + (a.has_tiktok === 0 ? 0 : 1);
        const scoreB = (b.has_facebook === 0 ? 0 : 1) + (b.has_instagram === 0 ? 0 : 1) + (b.has_tiktok === 0 ? 0 : 1);
        return scoreA - scoreB;
      });

      prospects.length = 0;
      prospects.push(...toCheck);
      console.log(`[SEARCH] Social check done: ${prospects.length} prospects`);

    } else if (searchMode === 'owners') {
      // ── OWNERS MODE: Extract owner names from business names via Claude ──
      console.log(`[SEARCH] Owners mode: analyzing ${prospects.length} business names for owner names...`);

      // Process in batches of 30
      const batchSize = 30;
      for (let i = 0; i < prospects.length; i += batchSize) {
        const batch = prospects.slice(i, i + batchSize);
        const listText = batch.map((p, idx) => `${idx + 1}. "${p.name}" (${p.city})`).join('\n');

        const prompt = `Tu es un expert en identification de noms de propriétaires/gérants à partir de noms d'entreprises françaises.

Analyse ces noms d'entreprises et extrais le nom du gérant/propriétaire quand il est VISIBLE dans le nom de l'entreprise.

Règles strictes :
- "Boulangerie Martin" → "Martin" (nom de famille dans le nom)
- "Garage Dupont et Fils" → "Dupont" (nom de famille visible)
- "Pizzeria Da Luigi" → "Luigi" (prénom visible)
- "Coiffure Sandra" → "Sandra" (prénom visible)
- "Plomberie J.Durand" → "J. Durand" (initiale + nom)
- "Restaurant Le Petit Jardin" → "" (pas de nom de personne)
- "Auto Ecole 2000" → "" (pas de nom de personne)
- "Carrefour Market" → "" (chaîne/marque, pas un gérant)

Entreprises à analyser :
${listText}

Réponds UNIQUEMENT en JSON, un tableau avec le numéro et le nom trouvé (vide si aucun) :
[{"n":1,"name":"Martin"},{"n":2,"name":""},...]`;

        try {
          const result = await callClaudeRaw(prompt, 2000);
          if (result.status === 200 && result.body.content?.[0]?.text) {
            const text = result.body.content[0].text;
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              for (const item of parsed) {
                const idx = (item.n || 0) - 1;
                if (idx >= 0 && idx < batch.length && item.name) {
                  batch[idx].owner_name = item.name.trim();
                }
              }
            }
          }
        } catch (err) {
          console.error(`[SEARCH] Claude owner extraction batch error:`, err.message);
        }

        if (i + batchSize < prospects.length) await delay(300);
      }

      // Filter: only keep prospects WHERE an owner name was found
      const withNames = prospects.filter(p => p.owner_name && p.owner_name.length > 0);
      const totalFound = withNames.length;
      console.log(`[SEARCH] Owners mode: found ${totalFound}/${prospects.length} with owner names`);

      // Trim to maxProspects
      prospects.length = 0;
      prospects.push(...withNames.slice(0, maxProspects));

    } else {
      // Mode 'site': trim to maxProspects
      prospects.length = Math.min(prospects.length, maxProspects);
    }

    console.log(`[SEARCH] Final: ${prospects.length}/${maxProspects} prospects for user ${userId}`);

    // ── Owner name lookup via Pappers (for non-owners modes) ──
    if (searchMode !== 'owners' && process.env.PAPPERS_API_KEY) {
      console.log(`[SEARCH] Looking up owner names via Pappers for ${prospects.length} prospects...`);
      try {
        const ownerNames = await batchFindOwners(prospects);
        for (let i = 0; i < prospects.length; i++) {
          prospects[i].owner_name = ownerNames[i] || '';
        }
        const found = ownerNames.filter(n => n).length;
        console.log(`[SEARCH] Pappers: found ${found}/${prospects.length} owner names`);
      } catch (err) {
        console.error('[SEARCH] Pappers error:', err.message);
      }
    }

    // ── Charge credits (atomic, race-condition safe) ──
    // Admin: never charged. Never charge more than what user actually has.
    const creditsToCharge = isAdmin ? 0 : Math.min(prospects.length * creditMultiplier, user.credits);
    if (creditsToCharge > 0) {
      await db.run(
        'UPDATE users SET credits = GREATEST(credits - ?, 0) WHERE id = ?',
        [creditsToCharge, userId]
      );
    }

    // ── Save prospects to DB (loop) ──
    for (const p of prospects) {
      await db.run(`
        INSERT INTO prospects (user_id, name, phone, address, rating, reviews, city, niche, search_id, website_url, has_facebook, has_instagram, has_tiktok, search_mode, owner_name, instagram_handle)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, p.name, p.phone, p.address, p.rating, p.reviews, p.city, sanitizedNiche, searchId,
          p.website_url || '', p.has_facebook, p.has_instagram, p.has_tiktok, searchMode, p.owner_name || '', p.instagram_handle || '']);
    }

    // Update search results count
    await db.run('UPDATE searches SET results_count = ? WHERE id = ?', [prospects.length, searchId]);

    // Log activity
    try { await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)', [userId, 'search', JSON.stringify({ niche: sanitizedNiche, count: prospects.length, searchMode })]); } catch {}

    // Get updated credits
    const updated = await db.get('SELECT credits FROM users WHERE id = ?', [userId]);

    res.json({
      ok: true,
      count: prospects.length,
      credits: updated ? updated.credits : 0,
      searchMode,
      prospects: prospects.map((p, i) => ({
        id: i,
        ...p,
        status: 'todo',
        notes: '',
        rappel: '',
      })),
    });

  } catch (err) {
    console.error('[SEARCH] Fatal error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recherche. Réessayez.' });
  }
});

// GET /api/search/modes — return available search modes
router.get('/modes', (req, res) => {
  res.json({
    socialCheckAvailable: isSocialCheckAvailable(),
    modes: [
      { id: 'site', label: 'Sans site web', icon: '🔍', cost: 1, available: true },
      { id: 'social', label: 'Sans réseaux', icon: '📱', cost: 1, available: isSocialCheckAvailable() },
      { id: 'both', label: 'Complet', icon: '🔥', cost: 2, available: isSocialCheckAvailable() },
      { id: 'owners', label: 'Noms des gérants', icon: '👤', cost: 1, available: !!ANTHROPIC_API_KEY },
      { id: 'fewreviews', label: 'Peu d\'avis', icon: '⭐', cost: 1, available: true },
      { id: 'new', label: 'Nouveaux business', icon: '🆕', cost: 1, available: true },
      { id: 'instagram', label: 'Profils Instagram', icon: '📸', cost: 1, available: isInstagramSearchAvailable() },
    ],
  });
});

module.exports = router;
