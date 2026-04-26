const https = require('https');

const PAPPERS_API_KEY = process.env.PAPPERS_API_KEY || '';

/**
 * Promisified HTTPS GET returning parsed JSON.
 */
function httpGetJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// NAF codes considered "noise" for an innovation search:
// generic consulting, holdings, admin support. If a company returned by the
// API has one of these as its PRIMARY activity, we drop it even if the search
// parameter said otherwise (the API sometimes returns fuzzy matches).
const NAF_BLACKLIST = new Set([
  '70.22Z', // Conseil pour les affaires et autres conseils de gestion ← "conseiller de gestion d'affaires"
  '70.10Z', // Activités des sièges sociaux (holdings)
  '82.99Z', // Autres activités de soutien aux entreprises
  '74.90B', // Activités spécialisées, scientifiques et techniques diverses
  '64.20Z', // Activités des sociétés holding
  '66.19B', // Autres activités auxiliaires de services financiers
]);

// Keywords in the company activity label that indicate generic consulting, not innovation
const ACTIVITY_LABEL_BLACKLIST = [
  'conseil pour les affaires',
  'conseil de gestion',
  'activités des sièges',
  'holding',
  'conseils de gestion',
];

/**
 * Map a NAF code to a sector label used by the UI.
 */
function mapNafToSector(naf) {
  const m = {
    '72.11Z': 'biotech',
    '21.20Z': 'biotech',
    '26.60Z': 'medtech',
    '32.50A': 'medtech',
    '32.50B': 'medtech',
    '72.19Z': 'deeptech',
    '62.01Z': 'deeptech',
    '01.64Z': 'agritech',
    '28.30Z': 'agritech',
    '10.89Z': 'agritech',
    '86.90F': 'silvertech',
  };
  return m[naf] || 'innovation';
}

/**
 * Search Pappers by NAF code with pagination.
 * @param {string} naf - NAF code, e.g. '72.11Z'
 * @param {number} maxResults - cap on results
 * @param {number} effectifMin - minimum effectif (employees)
 * @param {number} effectifMax - maximum effectif
 * @returns {Promise<Array>} list of normalized prospect objects
 */
async function searchByNAF(naf, maxResults = 30, effectifMin = 0, effectifMax = 5000) {
  // Uses recherche-entreprises.api.gouv.fr (public, no key, based on INSEE SIRENE data)
  const results = [];
  let page = 1;
  while (results.length < maxResults && page < 8) {
    const params = new URLSearchParams({
      activite_principale: naf,
      page: String(page),
      per_page: '25',
      etat_administratif: 'A',
      minimal: 'true',
      include: 'dirigeants,siege',
    });
    const url = `https://recherche-entreprises.api.gouv.fr/search?${params}`;
    let data;
    try { data = await httpGetJson(url, 12000); }
    catch (e) { console.error('Gouv API error NAF', naf, 'page', page, ':', e.message); break; }
    const batch = data.results || [];
    if (!batch.length) break;
    for (const c of batch) {
      // BLACKLIST: drop companies whose primary activity is generic consulting / holding
      // even though we searched for an innovation NAF code (the API is fuzzy).
      const currentNaf = (c.activite_principale || c.nature_juridique || '').toUpperCase().trim();
      if (currentNaf && NAF_BLACKLIST.has(currentNaf)) continue;
      // Also check the free-text activity label if present
      const actLabel = (c.libelle_activite_principale || '').toLowerCase();
      if (actLabel && ACTIVITY_LABEL_BLACKLIST.some((kw) => actLabel.includes(kw))) continue;

      // Skip companies with no physical dirigeant (we want someone to contact)
      const dirigeants = (c.dirigeants || []).filter(d => d.type_dirigeant === 'personne physique');
      if (!dirigeants.length) continue;

      // Priority: Président > Gérant > Directeur Général > first
      const priority = ['président', 'gérant', 'directeur général'];
      let chosen = dirigeants[0];
      for (const d of dirigeants) {
        const q = (d.qualite || '').toLowerCase();
        if (priority.some(p => q.includes(p))) { chosen = d; break; }
      }

      const siege = c.siege || {};
      const prenoms = (chosen.prenoms || '').split(/\s+/);
      const prenom = prenoms[0] || '';
      const nom = chosen.nom || '';

      // Tranche effectif salarie from INSEE (code 00 to 53)
      // https://www.insee.fr/fr/information/2028606
      const effCode = siege.tranche_effectif_salarie || '';
      const effLabels = {
        '00': '0', '01': '1-2', '02': '3-5', '03': '6-9', '11': '10-19',
        '12': '20-49', '21': '50-99', '22': '100-199', '31': '200-249',
        '32': '250-499', '41': '500-999', '42': '1000-1999', '51': '2000-4999',
        '52': '5000-9999', '53': '10000+'
      };
      const effLabel = effLabels[effCode] || '';

      results.push({
        name: c.nom_complet || c.nom_raison_sociale || '',
        siren: c.siren || '',
        naf,
        secteur: mapNafToSector(naf),
        city: siege.libelle_commune || '',
        cp: siege.code_postal || '',
        address: siege.adresse || '',
        website: '', // not provided by this API — card will build a Google search link
        phone: '',   // same
        dirigeantPrenom: prenom,
        dirigeantNom: nom,
        dirigeantQualite: chosen.qualite || '',
        effectif: effLabel,
        dateCreation: c.date_creation || '',
        country: 'fr',
      });
      if (results.length >= maxResults) break;
    }
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }
  return results;
}

/**
 * Search Pappers API for a company and return the owner/manager name
 * @param {string} companyName - Business name
 * @param {string} city - City for better matching
 * @returns {Promise<string>} Owner name or ''
 */
function findOwnerName(companyName, city) {
  if (!PAPPERS_API_KEY) return Promise.resolve('');

  // Clean company name for search
  const q = companyName.replace(/[✂🔥💇📍]/g, '').trim();
  const params = new URLSearchParams({
    api_token: PAPPERS_API_KEY,
    q,
    par_page: '1',
  });
  if (city) params.append('code_postal', '');

  const url = `https://api.pappers.fr/v2/recherche?${params}`;

  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const company = json.resultats?.[0];
          if (!company) return resolve('');

          // Try to find the main dirigeant (représentant légal)
          const dirigeants = company.dirigeants || company.representants || [];
          if (dirigeants.length === 0) return resolve('');

          // Priority: président, gérant, directeur général
          const priority = ['président', 'gérant', 'directeur général', 'directeur'];
          let best = dirigeants[0];
          for (const d of dirigeants) {
            const qual = (d.qualite || '').toLowerCase();
            if (priority.some(p => qual.includes(p))) {
              best = d;
              break;
            }
          }

          const prenom = best.prenom || best.prenom_usuel || '';
          const nom = best.nom || best.nom_usage || '';
          if (!nom && !prenom) return resolve('');

          resolve(`${prenom} ${nom}`.trim());
        } catch {
          resolve('');
        }
      });
    });

    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

/**
 * Batch lookup owner names for multiple prospects
 * @param {Array} prospects - Array of prospect objects with name and city
 * @returns {Promise<string[]>} Array of owner names
 */
async function batchFindOwners(prospects) {
  if (!PAPPERS_API_KEY) return prospects.map(() => '');

  const results = [];
  for (const p of prospects) {
    // Rate limit: small delay between calls
    const name = await findOwnerName(p.name, p.city);
    results.push(name);
    if (name) await new Promise(r => setTimeout(r, 200)); // politeness delay
  }
  return results;
}

/**
 * Enrich a company by name+city: returns full Pappers data for PRO features.
 * Uses the free Pappers API (1 credit per call).
 * @param {string} companyName - Business name
 * @param {string} city - City for better matching
 * @returns {Promise<Object|null>} Enriched data or null
 */
async function enrichCompany(companyName, city) {
  // Try Pappers first (if API key configured), then fall back to the free gouv API.
  // Micro-entrepreneurs & auto-entrepreneurs are often missing from Pappers but indexed on recherche-entreprises.api.gouv.fr.
  if (PAPPERS_API_KEY) {
    const pappersResult = await tryPappers(companyName, city);
    if (pappersResult) return pappersResult;
  }
  // Fallback 1: gouv API with full name
  const gouv1 = await enrichCompanyGouv(companyName, city);
  if (gouv1) return gouv1;
  // Fallback 2: gouv API with just the last token (often the family name for micro-entrepreneurs)
  const tokens = companyName.replace(/[✂🔥💇📍]/g, '').trim().split(/\s+/);
  if (tokens.length >= 2) {
    const lastName = tokens[tokens.length - 1];
    if (lastName.length >= 3) {
      const gouv2 = await enrichCompanyGouv(lastName, city);
      if (gouv2) return gouv2;
    }
  }
  return null;
}

async function tryPappers(companyName, city) {
  const q = companyName.replace(/[✂🔥💇📍]/g, '').trim();
  const params = new URLSearchParams({ api_token: PAPPERS_API_KEY, q, par_page: '1' });
  if (city) params.append('code_postal', '');
  try {
    const json = await httpGetJson(`https://api.pappers.fr/v2/recherche?${params}`, 10000);
    const c = json.resultats?.[0];
    if (!c) return null;

    const dirigeants = c.dirigeants || c.representants || [];
    const priority = ['président', 'gérant', 'directeur général', 'directeur'];
    let best = dirigeants[0] || {};
    for (const d of dirigeants) {
      const qual = (d.qualite || '').toLowerCase();
      if (priority.some(p => qual.includes(p))) { best = d; break; }
    }

    return {
      siren: c.siren || '',
      dirigeant_nom: best.nom || best.nom_usage || '',
      dirigeant_prenom: best.prenom || best.prenom_usuel || '',
      dirigeant_role: best.qualite || '',
      effectif: c.effectif || c.tranche_effectif || '',
      chiffre_affaires: c.chiffre_affaires ? String(c.chiffre_affaires) : '',
      secteur_naf: c.code_naf || '',
      phone_pappers: c.telephone || '',
      site_web: c.site_web || '',
    };
  } catch (e) {
    console.error('Pappers enrich error:', e.message);
    return null;
  }
}

/**
 * Fallback enrichment using the free gouvernement API (no API key needed).
 */
async function enrichCompanyGouv(companyName, city) {
  const q = encodeURIComponent(companyName.replace(/[✂🔥💇📍]/g, '').trim());
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${q}&per_page=1&etat_administratif=A`;
  try {
    const data = await httpGetJson(url, 10000);
    const c = (data.results || [])[0];
    if (!c) return null;

    const dirigeants = (c.dirigeants || []).filter(d => d.type_dirigeant === 'personne physique');
    const priority = ['président', 'gérant', 'directeur général'];
    let chosen = dirigeants[0] || {};
    for (const d of dirigeants) {
      const qual = (d.qualite || '').toLowerCase();
      if (priority.some(p => qual.includes(p))) { chosen = d; break; }
    }

    const siege = c.siege || {};
    const prenoms = (chosen.prenoms || '').split(/\s+/);

    return {
      siren: c.siren || '',
      dirigeant_nom: chosen.nom || '',
      dirigeant_prenom: prenoms[0] || '',
      dirigeant_role: chosen.qualite || '',
      effectif: siege.tranche_effectif_salarie || '',
      chiffre_affaires: '',
      secteur_naf: c.activite_principale || '',
      phone_pappers: '',
      site_web: '',
    };
  } catch (e) {
    console.error('Gouv enrich error:', e.message);
    return null;
  }
}

/**
 * Calculate prospect score (0-100) based on available data.
 */
function calcProspectScore(prospect) {
  let score = 0;
  // Petite équipe (5-50) = +25
  const eff = parseInt(prospect.effectif) || 0;
  if (eff >= 5 && eff <= 50) score += 25;
  else if (eff >= 1 && eff <= 4) score += 15;
  else if (eff > 50 && eff <= 200) score += 10;
  // Dirigeant identifié = +10
  if (prospect.dirigeant_nom || prospect.dirigeant_prenom) score += 10;
  // Numéro dispo = +15
  if (prospect.phone || prospect.phone_pappers) score += 15;
  // Email trouvé = +15
  if (prospect.email) score += 15;
  // LinkedIn = +15
  if (prospect.linkedin_url) score += 15;
  // Création récente (<5 ans) = +20
  if (prospect.created_at) {
    const created = new Date(prospect.created_at);
    const yearsOld = (Date.now() - created.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (yearsOld < 5) score += 20;
  }
  return Math.min(score, 100);
}

module.exports = { findOwnerName, batchFindOwners, searchByNAF, mapNafToSector, httpGetJson, enrichCompany, calcProspectScore };
