const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = 3000;

/* ── Appel à l'API Anthropic ── */
function callClaude(apiKey, prospect, niche) {
  return new Promise((resolve, reject) => {
    const pays = prospect.city || '';
    const prompt =
`Tu es un expert commercial en création de sites web pour artisans et PME. Génère un script d'appel téléphonique en français pour démarcher ${prospect.name}, un(e) ${niche} basé(e) à ${pays}.

Informations :
- Entreprise : ${prospect.name}
- Activité : ${niche}
- Ville : ${pays}
- Note Google : ${prospect.rating ? prospect.rating + '/5' : 'non renseignée'}
- Nombre d'avis Google : ${prospect.reviews || 0}
- Situation : visible sur Google Maps, mais SANS site web

Rédige le script selon ces critères :
1. Présentation rapide (prénom fictif + agence web locale)
2. Accroche basée sur leurs avis Google pour briser la glace
3. Problème concret : clients perdus chaque mois sans site (pas de RDV en ligne, horaires introuvables, concurrents avec site captent les leads)
4. Solution simple, rapide à mettre en place
5. Question de clôture pour obtenir un rendez-vous de 15 minutes

Durée de lecture à voix haute : 60 à 90 secondes. Ton : naturel, humain, chaleureux — pas agressif ni trop vendeur. Commence directement par le script sans titre ni introduction.`;

    const body = JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 900,
      messages:   [{ role: 'user', content: prompt }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers:  {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Réponse invalide de l\'API Anthropic')); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ── Serveur HTTP ── */
const server = http.createServer(async (req, res) => {

  /* POST /api/pitch — génération du pitch via Claude */
  if (req.method === 'POST' && req.url === '/api/pitch') {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', async () => {
      try {
        const { prospect, niche, apiKey } = JSON.parse(raw);
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Clé API Anthropic manquante.' }));
          return;
        }
        const result = await callClaude(apiKey, prospect, niche);
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  /* GET — servir public/index.html */
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(500); res.end('Erreur serveur'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));
