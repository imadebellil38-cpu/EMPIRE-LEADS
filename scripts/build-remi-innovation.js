/**
 * Build script for the Rémi Innovation lead page.
 *
 * Sources:
 *  - France: api.recherche-entreprises.api.gouv.fr (free, no API key, official)
 *  - Switzerland: hand-curated array (no free FR-equivalent API in CH)
 *
 * Output: public/remi-innovation.html (built from public/_remi-innovation-template.html)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ===== NAF codes covering biotech / medtech / agritech / deeptech / silvertech =====
const NAF_TARGETS = [
  { code: '72.11Z', secteur: 'biotech',    label: 'R&D biotechnologie' },
  { code: '21.20Z', secteur: 'biotech',    label: 'Préparations pharmaceutiques' },
  { code: '21.10Z', secteur: 'biotech',    label: 'Produits pharma de base' },
  { code: '26.60Z', secteur: 'medtech',    label: 'Équipements électromédicaux' },
  { code: '32.50A', secteur: 'medtech',    label: 'Matériel médico-chirurgical' },
  { code: '32.50B', secteur: 'medtech',    label: 'Lunettes & prothèses' },
  { code: '72.19Z', secteur: 'deeptech',   label: 'R&D autres sciences' },
  { code: '01.64Z', secteur: 'agritech',   label: 'Traitement semences' },
  { code: '28.30Z', secteur: 'agritech',   label: 'Machines agricoles' },
  { code: '86.90F', secteur: 'silvertech', label: 'Activités santé humaine' },
  { code: '87.30A', secteur: 'silvertech', label: 'Hébergement seniors médicalisé' },
];

// ===== Hand-curated Swiss innovation companies =====
// Sourced from public knowledge: Swiss Biotech Association, Swiss Medtech, startup.ch
const SWISS_LEADS = [
  { name: 'Sophia Genetics',           secteur: 'biotech',    city: 'Saint-Sulpice',  cp: '1025', website: 'https://www.sophiagenetics.com',     phone: '+41 21 691 80 00', dirigeantPrenom: 'Jurgi',     dirigeantNom: 'Camblong',    dirigeantQualite: 'CEO' },
  { name: 'MindMaze',                  secteur: 'medtech',    city: 'Lausanne',       cp: '1015', website: 'https://www.mindmaze.com',           phone: '+41 21 533 50 00', dirigeantPrenom: 'Tej',       dirigeantNom: 'Tadi',        dirigeantQualite: 'CEO' },
  { name: 'Lonza Group',               secteur: 'biotech',    city: 'Bâle',           cp: '4002', website: 'https://www.lonza.com',              phone: '+41 61 316 81 11', dirigeantPrenom: 'Wolfgang',  dirigeantNom: 'Wienand',     dirigeantQualite: 'CEO' },
  { name: 'Anokion',                   secteur: 'biotech',    city: 'Écublens',       cp: '1024', website: 'https://www.anokion.com',            phone: '+41 21 552 35 50', dirigeantPrenom: 'Deborah',   dirigeantNom: 'Geraghty',    dirigeantQualite: 'CEO' },
  { name: 'ndd Medizintechnik',        secteur: 'medtech',    city: 'Zürich',         cp: '8005', website: 'https://www.ndd.ch',                 phone: '+41 44 445 27 70', dirigeantPrenom: 'Anatole',   dirigeantNom: 'von Hippel',  dirigeantQualite: 'CEO' },
  { name: 'Insightness',               secteur: 'deeptech',   city: 'Zürich',         cp: '8005', website: 'https://www.insightness.com',        phone: '+41 44 500 88 00', dirigeantPrenom: 'Christian', dirigeantNom: 'Brändli',     dirigeantQualite: 'CEO' },
  { name: 'Climeworks',                secteur: 'deeptech',   city: 'Zürich',         cp: '8005', website: 'https://climeworks.com',             phone: '+41 44 533 29 99', dirigeantPrenom: 'Christoph', dirigeantNom: 'Gebald',      dirigeantQualite: 'Co-CEO' },
  { name: 'ANYbotics',                 secteur: 'deeptech',   city: 'Zürich',         cp: '8092', website: 'https://www.anybotics.com',          phone: '+41 44 633 93 84', dirigeantPrenom: 'Péter',     dirigeantNom: 'Fankhauser',  dirigeantQualite: 'CEO' },
  { name: 'GetYourGuide',              secteur: 'deeptech',   city: 'Zürich',         cp: '8005', website: 'https://www.getyourguide.com',       phone: '',                  dirigeantPrenom: 'Johannes',  dirigeantNom: 'Reck',        dirigeantQualite: 'CEO' },
  { name: 'Distalmotion',              secteur: 'medtech',    city: 'Épalinges',      cp: '1066', website: 'https://www.distalmotion.com',       phone: '+41 21 552 19 00', dirigeantPrenom: 'Greg',      dirigeantNom: 'Roche',       dirigeantQualite: 'CEO' },
  { name: 'Sensirion',                 secteur: 'deeptech',   city: 'Stäfa',          cp: '8712', website: 'https://www.sensirion.com',          phone: '+41 44 306 40 00', dirigeantPrenom: 'Marc',      dirigeantNom: 'von Waldkirch', dirigeantQualite: 'CEO' },
  { name: 'CSEM',                      secteur: 'deeptech',   city: 'Neuchâtel',      cp: '2002', website: 'https://www.csem.ch',                phone: '+41 32 720 51 11', dirigeantPrenom: 'Alexandre', dirigeantNom: 'Pauchard',    dirigeantQualite: 'CEO' },
  { name: 'Bioring',                   secteur: 'medtech',    city: 'Lonay',          cp: '1027', website: 'https://www.bioring.ch',             phone: '+41 21 802 21 90', dirigeantPrenom: '',          dirigeantNom: '',            dirigeantQualite: 'Direction' },
  { name: 'Alentis Therapeutics',      secteur: 'biotech',    city: 'Bâle',           cp: '4051', website: 'https://www.alentis.ch',             phone: '+41 61 691 30 30', dirigeantPrenom: 'Roberto',   dirigeantNom: 'Iacone',      dirigeantQualite: 'CEO' },
  { name: 'Numab Therapeutics',        secteur: 'biotech',    city: 'Wädenswil',      cp: '8820', website: 'https://www.numab.com',              phone: '+41 44 783 30 50', dirigeantPrenom: 'David',     dirigeantNom: 'Urech',       dirigeantQualite: 'CEO' },
  { name: 'Bachem',                    secteur: 'biotech',    city: 'Bubendorf',      cp: '4416', website: 'https://www.bachem.com',             phone: '+41 61 935 23 23', dirigeantPrenom: 'Thomas',    dirigeantNom: 'Meier',       dirigeantQualite: 'CEO' },
  { name: 'Polyneuros',                secteur: 'medtech',    city: 'Lausanne',       cp: '1015', website: '',                                    phone: '',                  dirigeantPrenom: '',          dirigeantNom: '',            dirigeantQualite: 'Direction' },
  { name: 'Neurosoft Bioelectronics',  secteur: 'medtech',    city: 'Plan-les-Ouates',cp: '1228', website: 'https://www.neurosoft-bio.com',      phone: '',                  dirigeantPrenom: 'Nicolas',   dirigeantNom: 'Vachicouras', dirigeantQualite: 'CEO' },
  { name: 'CUTISS',                    secteur: 'biotech',    city: 'Schlieren',      cp: '8952', website: 'https://www.cutiss.swiss',           phone: '+41 44 633 02 53', dirigeantPrenom: 'Daniela',   dirigeantNom: 'Marino',      dirigeantQualite: 'CEO' },
  { name: 'AgroSustain',               secteur: 'agritech',   city: 'Morges',         cp: '1110', website: 'https://www.agrosustain.ch',         phone: '',                  dirigeantPrenom: 'Olga',      dirigeantNom: 'Dubey',       dirigeantQualite: 'CEO' },
  { name: 'Ecorobotix',                secteur: 'agritech',   city: 'Yverdon-les-Bains', cp: '1400', website: 'https://www.ecorobotix.com',     phone: '+41 24 552 04 80', dirigeantPrenom: 'Aurélien',  dirigeantNom: 'Demaurex',    dirigeantQualite: 'CEO' },
  { name: 'Caribou Biosciences',       secteur: 'agritech',   city: 'Bâle',           cp: '4051', website: '',                                    phone: '',                  dirigeantPrenom: '',          dirigeantNom: '',            dirigeantQualite: 'Direction' },
  { name: 'Senergy',                   secteur: 'silvertech', city: 'Genève',         cp: '1207', website: '',                                    phone: '',                  dirigeantPrenom: '',          dirigeantNom: '',            dirigeantQualite: 'Direction' },
  { name: 'Dom Sweet Home',            secteur: 'silvertech', city: 'Lausanne',       cp: '1003', website: '',                                    phone: '',                  dirigeantPrenom: '',          dirigeantNom: '',            dirigeantQualite: 'Direction' },
  { name: 'Senior Living Group CH',    secteur: 'silvertech', city: 'Genève',         cp: '1201', website: '',                                    phone: '',                  dirigeantPrenom: '',          dirigeantNom: '',            dirigeantQualite: 'Direction' },
];

// ===== HTTP helper =====
function httpGetJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'EmpireLeadsBot/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + e.message + ' / ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ===== Fetch from recherche-entreprises.api.gouv.fr =====
const EFFECTIF_LABELS = {
  '00': '0', '01': '1-2', '02': '3-5', '03': '6-9', '11': '10-19',
  '12': '20-49', '21': '50-99', '22': '100-199', '31': '200-249',
  '32': '250-499', '41': '500-999', '42': '1000-1999', '51': '2000-4999',
  '52': '5000-9999', '53': '10000+', 'NN': '',
};

async function fetchFrenchByNAF(naf, secteur, perPage = 25) {
  const out = [];
  for (let page = 1; page <= 4 && out.length < perPage; page++) {
    const url = `https://recherche-entreprises.api.gouv.fr/search?activite_principale=${encodeURIComponent(naf)}&page=${page}&per_page=15&etat_administratif=A&minimal=true&include=dirigeants,siege`;
    try {
      const data = await httpGetJson(url);
      const results = data.results || [];
      if (!results.length) break;
      for (const r of results) {
        const siege = r.siege || {};
        // Only keep physical person dirigeants (we want someone to contact)
        const personnesPhysiques = (r.dirigeants || []).filter((d) => d.type_dirigeant === 'personne physique');
        if (!personnesPhysiques.length) continue;
        // Prioritize Président > Gérant > Directeur Général
        const priority = ['président', 'gérant', 'directeur général'];
        let chosen = personnesPhysiques[0];
        for (const d of personnesPhysiques) {
          const q = (d.qualite || '').toLowerCase();
          if (priority.some((p) => q.includes(p))) { chosen = d; break; }
        }
        const prenoms = (chosen.prenoms || '').split(/\s+/);
        const effCode = siege.tranche_effectif_salarie || '';
        out.push({
          name: r.nom_complet || r.nom_raison_sociale || '',
          siren: r.siren || '',
          naf: naf,
          secteur: secteur,
          city: siege.libelle_commune || '',
          cp: siege.code_postal || '',
          address: siege.adresse || '',
          website: '', // not provided by this API
          phone: '',   // not provided
          dirigeantPrenom: prenoms[0] || '',
          dirigeantNom: chosen.nom || '',
          dirigeantQualite: chosen.qualite || '',
          effectif: EFFECTIF_LABELS[effCode] || '',
          dateCreation: r.date_creation || '',
          country: 'fr',
        });
        if (out.length >= perPage) break;
      }
      await sleep(200);
    } catch (e) {
      console.error(`  ✗ Erreur NAF ${naf} page ${page}:`, e.message);
      break;
    }
  }
  return out;
}

// ===== Build search URLs =====
function buildLinkedInSearchUrl(p) {
  if (p.dirigeantPrenom || p.dirigeantNom) {
    const fullName = `${p.dirigeantPrenom} ${p.dirigeantNom}`.trim();
    const q = `site:linkedin.com/in "${fullName}" "${p.name}"`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/company "${p.name}"`)}`;
}

function buildHunterUrl(p) {
  if (p.website) {
    const domain = p.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    return `https://hunter.io/search/${domain}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`"${p.name}" email contact`)}`;
}

// ===== Main =====
async function main() {
  console.log('🚀 Build remi-innovation.html\n');

  const all = [];

  // 1. France via API gouv
  console.log('📊 Sourcing FR via recherche-entreprises.api.gouv.fr...');
  for (const target of NAF_TARGETS) {
    process.stdout.write(`  - ${target.code} (${target.secteur}) ... `);
    const batch = await fetchFrenchByNAF(target.code, target.secteur, 12);
    console.log(`${batch.length} résultats`);
    all.push(...batch);
  }

  // 2. Switzerland — hand-curated
  console.log(`\n🇨🇭 Adding ${SWISS_LEADS.length} Swiss leads (hand-curated)`);
  for (const s of SWISS_LEADS) {
    all.push({
      ...s,
      siren: '',
      naf: '',
      address: '',
      effectif: 0,
      dateCreation: '',
      country: 'ch',
    });
  }

  // 3. Dedup (split FR/CH so the 100-cap doesn't drop all Swiss)
  const seen = new Set();
  const dedupedFR = [];
  const dedupedCH = [];
  for (const p of all) {
    if (!p.name) continue;
    const key = (p.siren || (p.name + p.city)).toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    if (p.country === 'ch') dedupedCH.push(p);
    else dedupedFR.push(p);
  }

  // 4. Cap : 75 FR + 25 CH = 100 (or as many CH as available)
  const targetCH = Math.min(dedupedCH.length, 25);
  const targetFR = 100 - targetCH;
  const top = [...dedupedFR.slice(0, targetFR), ...dedupedCH.slice(0, targetCH)];

  // 5. Add LinkedIn + Hunter URLs + flag hasSite
  for (const p of top) {
    p.linkedin = buildLinkedInSearchUrl(p);
    p.emailUrl = buildHunterUrl(p);
    p.hasSite = !!p.website;
  }

  // Write raw JSON for debugging
  const outDir = path.join(__dirname, '..', 'public');
  fs.writeFileSync(path.join(__dirname, '_remi-prospects-raw.json'), JSON.stringify(top, null, 2));

  // 6. Inject into template
  const templatePath = path.join(outDir, '_remi-innovation-template.html');
  if (!fs.existsSync(templatePath)) {
    console.error('\n❌ Template missing: ' + templatePath);
    process.exit(1);
  }
  const template = fs.readFileSync(templatePath, 'utf8');
  const html = template.replace('/*__PROSPECTS_DATA__*/', JSON.stringify(top, null, 2));
  const outPath = path.join(outDir, 'remi-innovation.html');
  fs.writeFileSync(outPath, html);

  console.log(`\n✅ Done. ${top.length} prospects written to public/remi-innovation.html`);
  console.log(`   FR: ${top.filter((p) => p.country === 'fr').length}`);
  console.log(`   CH: ${top.filter((p) => p.country === 'ch').length}`);
  console.log(`   Avec site: ${top.filter((p) => p.hasSite).length}`);
  console.log(`   Sans site: ${top.filter((p) => !p.hasSite).length}`);
  console.log(`   Avec dirigeant: ${top.filter((p) => p.dirigeantPrenom || p.dirigeantNom).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
