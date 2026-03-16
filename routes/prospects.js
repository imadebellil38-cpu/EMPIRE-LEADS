const { Router } = require('express');
const validator = require('validator');
const db = require('../db');

const router = Router();

const VALID_STATUSES = ['todo', 'called', 'nope', 'client'];
const VALID_STAGES = ['cold_call', 'to_recall', 'meeting_to_set', 'meeting_confirmed', 'closed', 'refused'];

// GET /api/prospects/analytics/objections — objection breakdown
router.get('/analytics/objections', (req, res) => {
  const userId = req.user.id;
  const rows = db.prepare(`
    SELECT objection, COUNT(*) as count
    FROM prospects
    WHERE user_id = ? AND pipeline_stage = 'refused' AND objection IS NOT NULL AND objection != ''
    GROUP BY objection ORDER BY count DESC
  `).all(userId);
  const total = db.prepare(`SELECT COUNT(*) as n FROM prospects WHERE user_id = ? AND pipeline_stage = 'refused'`).get(userId).n;
  res.json({ rows, total });
});

// GET /api/prospects/analytics — dashboard analytics
router.get('/analytics', (req, res) => {
  const userId = req.user.id;

  // Daily stats — prospects added per day (last 7 days)
  const dailyStats = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM prospects WHERE user_id = ? AND created_at >= DATE('now', '-7 days')
    GROUP BY DATE(created_at) ORDER BY day
  `).all(userId);

  // Weekly conversion — status breakdown per week (last 4 weeks)
  const weeklyConversion = db.prepare(`
    SELECT strftime('%W', created_at) as week,
      SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END) as called,
      SUM(CASE WHEN status = 'client' THEN 1 ELSE 0 END) as client,
      COUNT(*) as total
    FROM prospects WHERE user_id = ? AND created_at >= DATE('now', '-28 days')
    GROUP BY week ORDER BY week
  `).all(userId);

  // Activity log — last 20 actions
  const activityLog = db.prepare(`
    SELECT action, details, created_at FROM activity_log
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(userId);

  // Totals
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END) as called,
      SUM(CASE WHEN status = 'client' THEN 1 ELSE 0 END) as client,
      SUM(CASE WHEN status = 'nope' THEN 1 ELSE 0 END) as nope
    FROM prospects WHERE user_id = ?
  `).get(userId);

  res.json({ dailyStats, weeklyConversion, activityLog, totals });
});

// GET /api/prospects/searches — search history for current user
router.get('/searches', (req, res) => {
  const searches = db.prepare(
    'SELECT id, niche, country, results_count, search_mode, created_at FROM searches WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json(searches);
});

// GET /api/prospects — get all prospects for current user
router.get('/', (req, res) => {
  const prospects = db.prepare(
    'SELECT * FROM prospects WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json(prospects);
});

// PUT /api/prospects/:id/status — update status
router.put('/:id/status', (req, res) => {
  const { status } = req.body;

  // ── Validate ──
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Statut invalide. Choix: ${VALID_STATUSES.join(', ')}` });
  }

  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

  db.prepare('UPDATE prospects SET status = ? WHERE id = ?').run(status, id);
  try { db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)').run(req.user.id, 'status_change', JSON.stringify({ prospectId: id, status })); } catch {}
  res.json({ ok: true });
});

// PUT /api/prospects/:id/notes — update notes + rappel + owner_name
router.put('/:id/notes', (req, res) => {
  const { notes, rappel, owner_name } = req.body;

  // ── Validate ──
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  const cleanNotes = typeof notes === 'string' ? validator.trim(notes).substring(0, 2000) : '';
  const cleanRappel = typeof rappel === 'string' ? validator.trim(rappel).substring(0, 100) : '';
  const cleanOwner = typeof owner_name === 'string' ? validator.trim(owner_name).substring(0, 200) : '';

  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

  db.prepare('UPDATE prospects SET notes = ?, rappel = ?, owner_name = ? WHERE id = ?')
    .run(cleanNotes, cleanRappel, cleanOwner, id);
  res.json({ ok: true });
});

// DELETE /api/prospects/:id — delete a prospect
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

  db.prepare('DELETE FROM prospects WHERE id = ?').run(id);
  res.json({ ok: true });
});

// PUT /api/prospects/bulk/status — bulk update status
router.put('/bulk/status', (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs requis.' });
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });

  const validIds = ids.filter(id => typeof id === 'number' && id > 0).slice(0, 500);
  const placeholders = validIds.map(() => '?').join(',');
  const update = db.prepare(`UPDATE prospects SET status = ? WHERE id IN (${placeholders}) AND user_id = ?`);
  const result = update.run(status, ...validIds, req.user.id);
  res.json({ ok: true, updated: result.changes });
});

// PUT /api/prospects/:id/stage — move prospect to a new pipeline stage
router.put('/:id/stage', (req, res) => {
  const { stage, objection, meeting_date, rappel, notes, deal_type, deal_date, deal_recurrence } = req.body;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  if (!VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `Stage invalide. Choix: ${VALID_STAGES.join(', ')}` });
  }

  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

  // Base update — always move the stage
  db.prepare('UPDATE prospects SET pipeline_stage = ? WHERE id = ?').run(stage, id);

  // Optional extras
  if (stage === 'refused' && objection) {
    db.prepare('UPDATE prospects SET objection = ? WHERE id = ?').run(String(objection).trim().substring(0, 200), id);
  }
  if (stage === 'to_recall' && rappel) {
    db.prepare('UPDATE prospects SET rappel = ? WHERE id = ?').run(String(rappel).trim().substring(0, 100), id);
  }
  if ((stage === 'meeting_to_set' || stage === 'meeting_confirmed') && meeting_date) {
    db.prepare('UPDATE prospects SET meeting_date = ? WHERE id = ?').run(String(meeting_date).trim().substring(0, 50), id);
  }
  if (stage === 'closed') {
    if (deal_type)       db.prepare('UPDATE prospects SET deal_type = ? WHERE id = ?').run(String(deal_type).trim().substring(0, 100), id);
    if (deal_date)       db.prepare('UPDATE prospects SET deal_date = ? WHERE id = ?').run(String(deal_date).trim().substring(0, 50), id);
    if (deal_recurrence) db.prepare('UPDATE prospects SET deal_recurrence = ? WHERE id = ?').run(String(deal_recurrence).trim().substring(0, 50), id);
  }
  if (notes) {
    db.prepare('UPDATE prospects SET notes = ? WHERE id = ?').run(String(notes).trim().substring(0, 2000), id);
  }
  try { db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)').run(req.user.id, 'stage_change', JSON.stringify({ prospectId: id, stage, objection: objection || null })); } catch {}
  res.json({ ok: true });
});

// POST /api/prospects/:id/attempts — log a contact attempt
router.post('/:id/attempts', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });
  const VALID_TYPES   = ['call','sms','email','dm'];
  const VALID_RESULTS = ['no_answer','voicemail','callback','positive','negative'];
  const { attempt_type, result, note } = req.body;
  if (!VALID_TYPES.includes(attempt_type))   return res.status(400).json({ error: 'Type invalide.' });
  if (!VALID_RESULTS.includes(result))       return res.status(400).json({ error: 'Résultat invalide.' });
  const cleanNote = typeof note === 'string' ? note.trim().substring(0, 500) : '';
  const r = db.prepare('INSERT INTO call_attempts (prospect_id, user_id, attempt_type, result, note) VALUES (?,?,?,?,?)').run(id, req.user.id, attempt_type, result, cleanNote);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// GET /api/prospects/:id/attempts — get contact attempt history
router.get('/:id/attempts', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });
  const attempts = db.prepare('SELECT * FROM call_attempts WHERE prospect_id = ? ORDER BY created_at DESC').all(id);
  res.json(attempts);
});

// POST /api/prospects/manual — manually add a prospect
router.post('/manual', (req, res) => {
  const { name, phone, address, notes } = req.body;

  const cleanName = typeof name === 'string' ? validator.trim(name).substring(0, 200) : '';
  const cleanPhone = typeof phone === 'string' ? validator.trim(phone).substring(0, 50) : '';
  const cleanAddress = typeof address === 'string' ? validator.trim(address).substring(0, 300) : '';
  const cleanNotes = typeof notes === 'string' ? validator.trim(notes).substring(0, 2000) : '';

  if (!cleanName) return res.status(400).json({ error: 'Le nom est requis.' });

  const result = db.prepare(
    `INSERT INTO prospects (user_id, name, phone, address, notes, pipeline_stage, status)
     VALUES (?, ?, ?, ?, ?, 'cold_call', 'todo')`
  ).run(req.user.id, cleanName, cleanPhone, cleanAddress, cleanNotes);

  try { db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)').run(req.user.id, 'manual_add', JSON.stringify({ prospectId: result.lastInsertRowid, name: cleanName })); } catch {}

  const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(prospect);
});

// DELETE /api/prospects/bulk — bulk delete
router.delete('/bulk', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs requis.' });

  const validIds = ids.filter(id => typeof id === 'number' && id > 0).slice(0, 500);
  const placeholders = validIds.map(() => '?').join(',');
  const del = db.prepare(`DELETE FROM prospects WHERE id IN (${placeholders}) AND user_id = ?`);
  const result = del.run(...validIds, req.user.id);
  res.json({ ok: true, deleted: result.changes });
});

module.exports = router;
