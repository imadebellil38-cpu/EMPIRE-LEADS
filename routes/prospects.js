const { Router } = require('express');
const validator = require('validator');
const db = require('../db');
const { sendProspectEmail, isEmailConfigured } = require('../services/email');
const { findEmailForProspect, deepEmailSearch, extractDomain } = require('../services/emailFinder');

const router = Router();

function sanitizeText(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return validator.trim(validator.escape(str)).substring(0, maxLen);
}

const VALID_STATUSES = ['todo', 'called', 'nope', 'client'];
const VALID_STAGES = ['cold_call', 'to_recall', 'no_answer', 'meeting_to_set', 'meeting_confirmed', 'closed', 'refused'];

// GET /api/prospects/analytics/objections — objection breakdown
router.get('/analytics/objections', async (req, res) => {
  const userId = req.user.id;
  try {
    const rows = await db.all(`
      SELECT objection, COUNT(*) as count
      FROM prospects
      WHERE user_id = ? AND pipeline_stage = 'refused' AND objection IS NOT NULL AND objection != ''
      GROUP BY objection ORDER BY count DESC
    `, [userId]);
    const totalRow = await db.get(`SELECT COUNT(*) as n FROM prospects WHERE user_id = ? AND pipeline_stage = 'refused'`, [userId]);
    const total = totalRow ? totalRow.n : 0;
    res.json({ rows, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/analytics — dashboard analytics
router.get('/analytics', async (req, res) => {
  const userId = req.user.id;

  try {
    // Daily stats — prospects added per day (last 7 days)
    const dailyStats = await db.all(`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM prospects WHERE user_id = ? AND created_at >= DATE('now', '-7 days')
      GROUP BY DATE(created_at) ORDER BY day
    `, [userId]);

    // Weekly conversion — status breakdown per week (last 4 weeks)
    const weeklyConversion = await db.all(`
      SELECT strftime('%W', created_at) as week,
        SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END) as called,
        SUM(CASE WHEN status = 'client' THEN 1 ELSE 0 END) as client,
        COUNT(*) as total
      FROM prospects WHERE user_id = ? AND created_at >= DATE('now', '-28 days')
      GROUP BY week ORDER BY week
    `, [userId]);

    // Activity log — last 20 actions
    const activityLog = await db.all(`
      SELECT action, details, created_at FROM activity_log
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
    `, [userId]);

    // Totals
    const totals = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END) as called,
        SUM(CASE WHEN status = 'client' THEN 1 ELSE 0 END) as client,
        SUM(CASE WHEN status = 'nope' THEN 1 ELSE 0 END) as nope
      FROM prospects WHERE user_id = ?
    `, [userId]);

    res.json({ dailyStats, weeklyConversion, activityLog, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/export — export prospects as CSV
router.get('/export', async (req, res) => {
  const userId = req.user.id;
  try {
    const rows = await db.all(
      `SELECT name, phone, email, address, city, niche, notes, pipeline_stage, owner_name,
              deal_value, deal_type, deal_recurrence, website_url, rating, reviews, created_at
       FROM prospects WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    const cols = ['name','phone','email','address','city','niche','notes','pipeline_stage',
                  'owner_name','deal_value','deal_type','deal_recurrence','website_url','rating','reviews','created_at'];
    const header = cols.join(';');
    const escCsv = v => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[;\n\r"]/.test(s) ? `"${s}"` : s;
    };
    const body = rows.map(r => cols.map(c => escCsv(r[c])).join(';')).join('\n');
    const csv = '\ufeff' + header + '\n' + body; // BOM for Excel

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="prospects-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/stats — streak + weekly stats for analytics
router.get('/stats', async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Mon
  startOfWeek.setHours(0,0,0,0);
  const swStr = startOfWeek.toISOString().split('T')[0];

  try {
    // Contacts this week (call_attempts)
    const callsRow = await db.get(
      `SELECT COUNT(*) as n FROM call_attempts WHERE user_id = ? AND date(created_at) >= ?`,
      [userId, swStr]
    );
    const callsThisWeek = callsRow ? callsRow.n : 0;

    // Meetings set this week (stage moved to meeting*)
    const meetingsRow = await db.get(
      `SELECT COUNT(*) as n FROM activity_log
       WHERE user_id = ? AND action = 'stage_change' AND details LIKE '%meeting%'
       AND date(created_at) >= ?`,
      [userId, swStr]
    );
    const meetingsThisWeek = meetingsRow ? meetingsRow.n : 0;

    // Deals + CA this week
    const dealsRow = await db.get(
      `SELECT COUNT(*) as n, COALESCE(SUM(deal_value),0) as ca
       FROM prospects WHERE user_id = ? AND pipeline_stage='closed' AND date(created_at) >= ?`,
      [userId, swStr]
    );

    // Streak — consecutive active days (days with at least 1 call_attempt)
    const activeDaysRows = await db.all(
      `SELECT DISTINCT date(created_at) as d FROM call_attempts
       WHERE user_id = ? ORDER BY d DESC LIMIT 60`,
      [userId]
    );
    const activeDays = activeDaysRows.map(r => r.d);

    let streak = 0;
    const todayStr = now.toISOString().split('T')[0];
    const yesterStr = new Date(now - 86400000).toISOString().split('T')[0];
    const startDay = activeDays[0] === todayStr || activeDays[0] === yesterStr ? activeDays[0] : null;
    if (startDay) {
      let cursor = new Date(startDay);
      for (const d of activeDays) {
        const curStr = cursor.toISOString().split('T')[0];
        if (d === curStr) { streak++; cursor.setDate(cursor.getDate() - 1); }
        else break;
      }
    }

    res.json({
      callsThisWeek,
      meetingsThisWeek,
      dealsThisWeek: dealsRow ? dealsRow.n : 0,
      caThisWeek: dealsRow ? dealsRow.ca : 0,
      streak,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/import — bulk import from CSV
router.post('/import', async (req, res) => {
  const userId = req.user.id;
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Données requises.' });
  if (rows.length > 2000) return res.status(400).json({ error: 'Max 2000 prospects par import.' });

  try {
    // Fetch existing phones for dedup
    const existingRows = await db.all("SELECT phone FROM prospects WHERE user_id = ? AND phone != ''", [userId]);
    const existingPhones = new Set(existingRows.map(r => r.phone));

    const safe = s => (typeof s === 'string' ? validator.trim(s).substring(0, 500) : '');
    let imported = 0, skipped = 0;

    for (const row of rows) {
      const phone = safe(row.phone).replace(/\s/g, '');
      if (phone && existingPhones.has(phone)) { skipped++; continue; }
      await db.run(`
        INSERT INTO prospects (user_id, name, phone, email, address, city, notes, niche, pipeline_stage, status, owner_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cold_call', 'todo', ?)
      `, [userId, safe(row.name), phone, safe(row.email), safe(row.address), safe(row.city), safe(row.notes), safe(row.niche), safe(row.owner_name)]);
      if (phone) existingPhones.add(phone);
      imported++;
    }

    try { await db.run('INSERT INTO activity_log (user_id,action,details) VALUES (?,?,?)', [userId, 'import', JSON.stringify({ imported, skipped })]); } catch {}
    res.json({ ok: true, imported, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Erreur import: ' + err.message });
  }
});

// GET /api/prospects/searches — search history for current user
router.get('/searches', async (req, res) => {
  try {
    const searches = await db.all(
      'SELECT id, niche, country, results_count, search_mode, created_at FROM searches WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(searches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects — get all prospects for current user
router.get('/', async (req, res) => {
  try {
    const prospects = await db.all(
      'SELECT * FROM prospects WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(prospects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/prospects/:id/status — update status
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;

  // ── Validate ──
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Statut invalide. Choix: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const prospect = await db.get('SELECT id FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

    await db.run('UPDATE prospects SET status = ? WHERE id = ?', [status, id]);
    try { await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'status_change', JSON.stringify({ prospectId: id, status })]); } catch {}
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/prospects/:id/notes — update notes + rappel + owner_name + email
router.put('/:id/notes', async (req, res) => {
  const { notes, rappel, owner_name, email } = req.body;

  // ── Validate ──
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  const cleanNotes = typeof notes === 'string' ? validator.trim(notes).substring(0, 2000) : '';
  const cleanRappel = typeof rappel === 'string' ? validator.trim(rappel).substring(0, 100) : '';
  const cleanOwner = typeof owner_name === 'string' ? validator.trim(owner_name).substring(0, 200) : '';
  const cleanEmail = typeof email === 'string' ? validator.trim(email).substring(0, 200) : '';
  if (cleanEmail && !validator.isEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  try {
    const prospect = await db.get('SELECT id FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

    await db.run('UPDATE prospects SET notes = ?, rappel = ?, owner_name = ?, email = ? WHERE id = ?',
      [cleanNotes, cleanRappel, cleanOwner, cleanEmail, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/prospects/:id — delete a prospect
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const prospect = await db.get('SELECT id FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

    await db.run('DELETE FROM prospects WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/prospects/bulk/status — bulk update status
router.put('/bulk/status', async (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs requis.' });
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });

  const validIds = ids.filter(id => typeof id === 'number' && id > 0).slice(0, 500);

  try {
    const r = await db.pool.query(
      `UPDATE prospects SET status = $1 WHERE id = ANY($2::int[]) AND user_id = $3`,
      [status, validIds, req.user.id]
    );
    res.json({ ok: true, updated: r.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/prospects/:id/stage — move prospect to a new pipeline stage
router.put('/:id/stage', async (req, res) => {
  const { stage, objection, meeting_date, rappel, notes, deal_type, deal_date, deal_recurrence, deal_value } = req.body;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  if (!VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `Stage invalide. Choix: ${VALID_STAGES.join(', ')}` });
  }

  try {
    const prospect = await db.get('SELECT id FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

    // Get old stage before update
    const oldProspect = await db.get('SELECT pipeline_stage FROM prospects WHERE id = ?', [id]);
    const oldStage = oldProspect ? oldProspect.pipeline_stage : 'cold_call';

    // Base update — always move the stage
    await db.run('UPDATE prospects SET pipeline_stage = ? WHERE id = ?', [stage, id]);

    // Track stage change in history
    if (oldStage !== stage) {
      try {
        await db.run(
          'INSERT INTO stage_history (prospect_id, from_stage, to_stage) VALUES (?, ?, ?)',
          [id, oldStage, stage]
        );
      } catch (_) { /* table might not exist yet */ }
    }

    // Optional extras
    if (stage === 'refused' && objection) {
      await db.run('UPDATE prospects SET objection = ? WHERE id = ?', [String(objection).trim().substring(0, 200), id]);
    }
    if (stage === 'to_recall' && rappel) {
      await db.run('UPDATE prospects SET rappel = ? WHERE id = ?', [String(rappel).trim().substring(0, 100), id]);
    }
    if ((stage === 'meeting_to_set' || stage === 'meeting_confirmed') && meeting_date) {
      await db.run('UPDATE prospects SET meeting_date = ? WHERE id = ?', [String(meeting_date).trim().substring(0, 50), id]);
    }
    if (stage === 'closed') {
      if (deal_type)       await db.run('UPDATE prospects SET deal_type = ? WHERE id = ?', [String(deal_type).trim().substring(0, 100), id]);
      if (deal_date)       await db.run('UPDATE prospects SET deal_date = ? WHERE id = ?', [String(deal_date).trim().substring(0, 50), id]);
      if (deal_recurrence) await db.run('UPDATE prospects SET deal_recurrence = ? WHERE id = ?', [String(deal_recurrence).trim().substring(0, 50), id]);
      if (typeof deal_value === 'number' && deal_value >= 0) await db.run('UPDATE prospects SET deal_value = ? WHERE id = ?', [deal_value, id]);
    }
    if (notes) {
      await db.run('UPDATE prospects SET notes = ? WHERE id = ?', [String(notes).trim().substring(0, 2000), id]);
    }
    try { await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'stage_change', JSON.stringify({ prospectId: id, stage, objection: objection || null })]); } catch {}
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/:id/find-email — find email using Hunter.io or pattern matching
router.post('/:id/find-email', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const prospect = await db.get('SELECT id, name, website_url, owner_name FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

    const result = await findEmailForProspect(prospect);
    if (result.found) {
      await db.run('UPDATE prospects SET email = ? WHERE id = ?', [result.email, id]);
      return res.json({ ok: true, email: result.email });
    }
    return res.json({ ok: true, found: false, suggestions: result.suggestions, error: result.error });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/:id/send-email — send pitch email to prospect
router.post('/:id/send-email', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const prospect = await db.get('SELECT id, email, name FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });
    if (!prospect.email) return res.status(400).json({ error: 'Aucun email renseigné. Ajoutez l\'email dans la fiche.' });

    const { subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'Sujet et corps requis.' });

    const user = await db.get('SELECT email FROM users WHERE id = ?', [req.user.id]);
    const result = await sendProspectEmail(
      prospect.email,
      validator.trim(subject).substring(0, 200),
      validator.trim(body).substring(0, 5000),
      user?.email
    );

    if (result.ok) {
      try { await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'email_sent', JSON.stringify({ prospectId: id, to: prospect.email, subject })]); } catch {}
      try { await db.run('INSERT INTO call_attempts (prospect_id, user_id, attempt_type, result, note) VALUES (?,?,?,?,?)', [id, req.user.id, 'email', 'positive', `Email envoyé: ${subject}`]); } catch {}
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/:id/attempts — log a contact attempt
router.post('/:id/attempts', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const prospect = await db.get('SELECT id FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });
    const VALID_TYPES   = ['call','sms','email','dm'];
    const VALID_RESULTS = ['no_answer','voicemail','callback','positive','negative'];
    const { attempt_type, result, note } = req.body;
    if (!VALID_TYPES.includes(attempt_type))   return res.status(400).json({ error: 'Type invalide.' });
    if (!VALID_RESULTS.includes(result))       return res.status(400).json({ error: 'Résultat invalide.' });
    const cleanNote = typeof note === 'string' ? note.trim().substring(0, 500) : '';
    const { audio_data, audio_duration } = req.body;
    const cleanAudio = typeof audio_data === 'string' && audio_data.startsWith('data:audio') ? audio_data : '';
    const cleanDuration = typeof audio_duration === 'number' ? Math.min(Math.round(audio_duration), 300) : 0;
    const r = await db.insert('INSERT INTO call_attempts (prospect_id, user_id, attempt_type, result, note, audio_data, audio_duration) VALUES (?,?,?,?,?,?,?)',
      [id, req.user.id, attempt_type, result, cleanNote, cleanAudio, cleanDuration]);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/:id/attempts — get contact attempt history
router.get('/:id/attempts', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const prospect = await db.get('SELECT id FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });
    const attempts = await db.all('SELECT * FROM call_attempts WHERE prospect_id = ? ORDER BY created_at DESC', [id]);
    res.json(attempts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/:id/stage-history — stage change history
router.get('/:id/stage-history', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  try {
    const prospect = await db.get('SELECT id, pipeline_stage FROM prospects WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });
    const history = await db.all('SELECT from_stage, to_stage, created_at FROM stage_history WHERE prospect_id = ? ORDER BY created_at ASC', [id]);
    res.json({ current: prospect.pipeline_stage, history });
  } catch (err) {
    // If table doesn't exist, return empty
    res.json({ current: req.query.current || 'cold_call', history: [] });
  }
});

// POST /api/prospects/manual — manually add a prospect
router.post('/manual', async (req, res) => {
  const { name, phone, address, notes } = req.body;

  const cleanName = sanitizeText(name, 200);
  const cleanPhone = typeof phone === 'string' ? validator.trim(phone).substring(0, 50) : '';
  const cleanAddress = sanitizeText(address, 300);
  const cleanNotes = sanitizeText(notes, 2000);

  if (!cleanName) return res.status(400).json({ error: 'Le nom est requis.' });

  try {
    const result = await db.insert(
      `INSERT INTO prospects (user_id, name, phone, address, notes, pipeline_stage, status)
       VALUES (?, ?, ?, ?, ?, 'cold_call', 'todo')`,
      [req.user.id, cleanName, cleanPhone, cleanAddress, cleanNotes]
    );

    try { await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'manual_add', JSON.stringify({ prospectId: result.lastInsertRowid, name: cleanName })]); } catch {}

    const prospect = await db.get('SELECT * FROM prospects WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(prospect);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/prospects/bulk — bulk delete
router.delete('/bulk', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs requis.' });

  const validIds = ids.filter(id => typeof id === 'number' && id > 0).slice(0, 500);

  try {
    const r = await db.pool.query(
      `DELETE FROM prospects WHERE id = ANY($1::int[]) AND user_id = $2`,
      [validIds, req.user.id]
    );
    res.json({ ok: true, deleted: r.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/email-finder/search — deep email search for extension page
router.post('/email-finder/search', async (req, res) => {
  const { companyName, website, ownerName } = req.body;
  if (!companyName && !website) {
    return res.status(400).json({ error: 'Fournissez un nom d\'entreprise ou un site web.' });
  }
  try {
    const cleanCompany = companyName ? validator.trim(companyName).substring(0, 200) : '';
    const cleanWebsite = website ? validator.trim(website).substring(0, 500) : '';
    const cleanOwner = ownerName ? validator.trim(ownerName).substring(0, 100) : '';
    const domain = extractDomain(cleanWebsite);
    const result = await deepEmailSearch({ companyName: cleanCompany, domain, website: cleanWebsite, ownerName: cleanOwner });
    try { await db.run('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'email_search', JSON.stringify({ company: cleanCompany, domain, found: result.emails.length })]); } catch {}
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la recherche d\'emails.' });
  }
});

module.exports = router;
