/* Empire Leads — Admin Page Logic v2 — Dark Green Theme */

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const token = localStorage.getItem('ph_token');
if (!token) window.location.href = '/login';

const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Requested-With': 'XMLHttpRequest' };

async function loadBiOverview() {
  const body = document.getElementById('bi-body');
  if (!body) return;
  try {
    const r = await fetch('/api/admin/bi-overview', { headers });
    if (!r.ok) { body.innerHTML = '<div style="color:#ff6666;grid-column:1/-1">Erreur BI: HTTP ' + r.status + '</div>'; return; }
    const d = await r.json();
    const tile = (label, value, sub, color) => `
      <div style="background:var(--card-bg,#111);border:1.5px solid var(--border,#1f2937);border-radius:12px;padding:14px 16px">
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#9090a8);margin-bottom:6px">${esc(label)}</div>
        <div style="font-size:1.55rem;font-weight:800;color:${color || '#fff'};line-height:1.1">${esc(String(value))}</div>
        ${sub ? `<div style="font-size:.75rem;color:var(--muted,#9090a8);margin-top:4px">${esc(sub)}</div>` : ''}
      </div>`;
    const sourceBd = (d.bySource || []).map(s => `${esc(s.source)}: <b>${s.count}</b>`).join(' &middot; ') || '—';
    const planBd = (d.byPlan || []).map(p => `${esc(p.plan)}: <b>${p.count}</b>`).join(' &middot; ') || '—';
    const topRefs = (d.topReferrers || []).map(r => `${esc(r.display_name || r.email)} (${r.invited_count})`).join(', ') || 'aucun';
    body.innerHTML =
      tile('Total users', (d.totals?.users || 0).toLocaleString('fr-FR')) +
      tile('Payants', (d.totals?.paid || 0).toLocaleString('fr-FR'), `${d.totals?.free || 0} free`, '#00d084') +
      tile('Active 7j', (d.active?.d7 || 0).toLocaleString('fr-FR'), `${d.active?.d30 || 0} sur 30j`, '#00d084') +
      tile('Inactive 30j', (d.active?.inactive30d || 0).toLocaleString('fr-FR'), 'à relancer', '#F77737') +
      tile('Signups 7j', (d.signups?.d7 || 0).toLocaleString('fr-FR'), `${d.signups?.d30 || 0} sur 30j · ${d.signups?.d90 || 0} sur 90j`) +
      tile('Conversion trial→paid', (d.trialConversion?.rate_pct || 0) + ' %', `${d.trialConversion?.converted || 0} / ${d.trialConversion?.eligible || 0} (cohorte 60-7j)`, '#00d084') +
      tile('MRR estimé', (d.mrr_estimate_eur || 0).toLocaleString('fr-FR') + ' €', `ARR ≈ ${(d.arr_estimate_eur || 0).toLocaleString('fr-FR')} €`, '#00d084') +
      tile('Activité 7j', (d.activity7d?.searches || 0) + ' recherches', `${d.activity7d?.prospects_added || 0} prospects ajoutés`) +
      `<div style="grid-column:1/-1;background:var(--card-bg,#111);border:1.5px solid var(--border,#1f2937);border-radius:12px;padding:12px 16px;font-size:.85rem;color:var(--muted,#9090a8)">
        <div><b style="color:#fff">Sources d'acquisition :</b> ${sourceBd}</div>
        <div style="margin-top:4px"><b style="color:#fff">Plans :</b> ${planBd}</div>
        <div style="margin-top:4px"><b style="color:#fff">Top parrains :</b> ${topRefs}</div>
      </div>`;
  } catch (e) {
    body.innerHTML = '<div style="color:#ff6666;grid-column:1/-1">Erreur: ' + esc(e.message) + '</div>';
  }
}

async function loadAll() {
  loadBiOverview();
  try {
    const [statsRes, usersRes, searchesRes, revenueRes, dailyRes, topRes, connRes] = await Promise.all([
      fetch('/api/admin/stats', { headers }),
      fetch('/api/admin/users', { headers }),
      fetch('/api/admin/searches', { headers }),
      fetch('/api/admin/stats/revenue', { headers }),
      fetch('/api/admin/stats/daily', { headers }),
      fetch('/api/admin/stats/top-users', { headers }),
      fetch('/api/admin/connections', { headers }),
    ]);

    if (statsRes.status === 403 || usersRes.status === 403) {
      alert('Acces refuse. Vous devez etre administrateur.');
      window.location.href = '/';
      return;
    }

    const stats = await statsRes.json().catch(() => ({}));
    const users = await usersRes.json().catch(() => []);
    const searches = await searchesRes.json().catch(() => []);
    const revenue = await revenueRes.json().catch(() => ({}));
    const daily = await dailyRes.json().catch(() => ({}));
    const top = await topRes.json().catch(() => ({}));
    const connections = await connRes.json().catch(() => []);

    // Ensure arrays when API returns error objects
    if (!Array.isArray(users)) { console.warn('users API error:', users); }
    if (!Array.isArray(searches)) { console.warn('searches API error:', searches); }
    if (!Array.isArray(connections)) { console.warn('connections API error:', connections); }

    // ── Dashboard stats ──
    document.getElementById('s-users').textContent = (stats.totalUsers || 0).toLocaleString('fr-FR');
    document.getElementById('s-credits-used').textContent = (stats.totalCreditsUsed || 0).toLocaleString('fr-FR');
    document.getElementById('s-prospects').textContent = (stats.totalProspects || 0).toLocaleString('fr-FR');
    document.getElementById('s-searches').textContent = (stats.totalSearches || 0).toLocaleString('fr-FR');
    document.getElementById('s-mrr').textContent = (revenue.mrr || 0).toLocaleString('fr-FR') + ' \u20ac';

    // ── Charts ──
    renderChart('chart-registrations', daily.registrations, 'bar-green');
    renderChart('chart-searches', daily.searches, 'bar-emerald');

    // ── Top users ──
    renderTopTable('top-searches', top.bySearches);
    renderTopTable('top-prospects', top.byProspects);

    // ── Users management table ──
    const usersList = Array.isArray(users) ? users : [];
    document.getElementById('users-body').innerHTML = usersList.map(u => {
      const uid = parseInt(u.id);
      const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString('fr-FR') : '—';
      const createdAt = new Date(u.created_at).toLocaleDateString('fr-FR');
      const isDisabled = parseInt(u.is_disabled) === 1;
      const isAdmin = parseInt(u.is_admin) === 1;

      return `<tr${isDisabled ? ' style="opacity:.5"' : ''}>
        <td style="font-weight:600">${esc(u.email)}</td>
        <td>${esc(u.display_name || '—')}</td>
        <td>
          <input class="credits-input" type="number" value="${parseInt(u.credits)||0}" id="credits-${uid}" min="0">
          <button class="btn-sm btn-green" onclick="setCredits(${uid})">OK</button>
        </td>
        <td>
          <select class="plan-select" onchange="changePlan(${uid}, this.value)">
            <option value="free" ${u.plan==='free'?'selected':''}>Free</option>
            <option value="trial" ${u.plan==='trial'?'selected':''}>Trial</option>
            <option value="starter" ${u.plan==='starter'?'selected':''}>Starter</option>
            <option value="pro" ${u.plan==='pro'?'selected':''}>Pro</option>
            <option value="business" ${u.plan==='business'?'selected':''}>Business</option>
            <option value="legend" ${u.plan==='legend'?'selected':''}>Legend</option>
            <option value="enterprise" ${u.plan==='enterprise'?'selected':''}>Enterprise</option>
          </select>
        </td>
        <td style="color:var(--muted);font-size:.78rem">${esc(u.theme_url || '—')}</td>
        <td style="color:var(--muted);font-size:.78rem">${lastLogin}</td>
        <td style="color:var(--muted);font-size:.78rem">${createdAt}</td>
        <td>
          <span class="${isDisabled ? 'status-disabled' : 'status-active'}">${isDisabled ? 'Desactive' : 'Actif'}</span>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn-sm btn-blue" onclick="viewUser(${uid}, '${esc(u.email).replace(/'/g,"\\'")}')">Voir</button>
            <button class="btn-sm ${isDisabled ? 'btn-green' : 'btn-red'}" onclick="toggleDisable(${uid}, ${isDisabled ? 0 : 1})">
              ${isDisabled ? 'Activer' : 'Desactiver'}
            </button>
            <button class="btn-sm ${isAdmin ? 'btn-amber' : 'btn-purple'}" onclick="toggleAdmin(${uid}, ${isAdmin ? 0 : 1})">
              ${isAdmin ? '- Admin' : '+ Admin'}
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // ── Searches table ──
    const searchesList = Array.isArray(searches) ? searches : [];
    document.getElementById('searches-body').innerHTML = searchesList.slice(0, 30).map(s => `
      <tr>
        <td style="font-weight:600">${esc(s.email)}</td>
        <td>${esc(s.niche || '—')}</td>
        <td>${esc((s.country||'').toUpperCase())}</td>
        <td>${parseInt(s.results_count)||0}</td>
        <td style="color:var(--muted);font-size:.78rem">${new Date(s.created_at).toLocaleString('fr-FR')}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--muted);text-align:center">Aucune recherche.</td></tr>';

    // ── Connections table ──
    const connectionsList = Array.isArray(connections) ? connections : [];
    document.getElementById('connections-body').innerHTML = connectionsList.slice(0, 30).map(c => {
      let ip = '—';
      try { ip = JSON.parse(c.details).ip || '—'; } catch(_) {}
      return `<tr>
        <td style="font-weight:600">${esc(c.email)}</td>
        <td><span class="plan-badge plan-${esc(c.plan)}">${esc(c.plan)}</span></td>
        <td style="color:var(--muted);font-size:.78rem">${esc(ip)}</td>
        <td style="color:var(--muted);font-size:.78rem">${new Date(c.created_at).toLocaleString('fr-FR')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="color:var(--muted);text-align:center">Aucune connexion.</td></tr>';

  } catch (err) {
    console.error(err);
    alert('Erreur lors du chargement des donnees admin.');
  }
}

function renderChart(containerId, data, barClass) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<span style="color:var(--muted);font-size:.8rem">Pas de donnees</span>';
    return;
  }
  const max = Math.max(...data.map(d => d.count), 1);
  container.innerHTML = data.map(d => {
    const pct = (parseInt(d.count)||0) / max * 100;
    const day = esc(String(d.day).slice(5));
    return `<div class="bar-col">
      <div class="bar ${barClass}" style="height:${Math.max(pct, 2)}%" title="${esc(d.day)}: ${parseInt(d.count)||0}"></div>
      <span class="bar-date">${day}</span>
    </div>`;
  }).join('');
}

function renderTopTable(containerId, data) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<tr><td colspan="3" style="color:var(--muted);text-align:center">Aucune donnee</td></tr>';
    return;
  }
  container.innerHTML = data.map(u => `
    <tr>
      <td style="font-weight:600">${esc(u.email)}</td>
      <td><span class="plan-badge plan-${esc(u.plan)}">${esc(u.plan)}</span></td>
      <td style="font-weight:700;color:var(--accent)">${parseInt(u.total)||0}</td>
    </tr>
  `).join('');
}

// ── Set credits ──
async function setCredits(userId) {
  const val = parseInt(document.getElementById('credits-' + userId).value);
  if (isNaN(val) || val < 0) return;
  await fetch('/api/admin/users/' + userId + '/credits', {
    method: 'PUT', headers, body: JSON.stringify({ credits: val }),
  });
  loadAll();
}

// ── Change plan ──
async function changePlan(userId, plan) {
  if (!confirm('Changer le plan de cet utilisateur vers ' + plan + ' ?')) { loadAll(); return; }
  await fetch('/api/admin/users/' + userId + '/plan', {
    method: 'PUT', headers, body: JSON.stringify({ plan }),
  });
  loadAll();
}

// ── Toggle admin ──
async function toggleAdmin(userId, isAdmin) {
  const action = isAdmin ? 'Rendre cet utilisateur admin' : 'Retirer les droits admin';
  if (!confirm(action + ' ?')) return;
  await fetch('/api/admin/users/' + userId + '/admin', {
    method: 'PUT', headers, body: JSON.stringify({ is_admin: isAdmin }),
  });
  loadAll();
}

// ── Toggle disable ──
async function toggleDisable(userId, isDisabled) {
  const action = isDisabled ? 'Desactiver ce compte' : 'Reactiver ce compte';
  if (!confirm(action + ' ?')) return;
  await fetch('/api/admin/users/' + userId + '/disable', {
    method: 'PUT', headers, body: JSON.stringify({ is_disabled: isDisabled }),
  });
  loadAll();
}

// ── Create user ──
async function createUser() {
  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-password').value;
  const display_name = document.getElementById('new-display-name').value.trim();
  const plan = document.getElementById('new-plan').value;
  const credits = parseInt(document.getElementById('new-credits').value) || 0;
  const theme_url = document.getElementById('new-theme').value.trim();
  const is_admin = parseInt(document.getElementById('new-is-admin').value) === 1;

  const msgEl = document.getElementById('create-msg');
  msgEl.textContent = '';
  msgEl.className = 'create-msg';

  if (!email || !password) {
    msgEl.textContent = 'Email et mot de passe requis.';
    msgEl.className = 'create-msg error';
    return;
  }

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers,
      body: JSON.stringify({ email, password, display_name, plan, credits, theme_url, is_admin }),
    });
    const data = await res.json();

    if (!res.ok) {
      msgEl.textContent = data.error || 'Erreur lors de la creation.';
      msgEl.className = 'create-msg error';
      return;
    }

    msgEl.textContent = 'Compte cree avec succes !';
    msgEl.className = 'create-msg success';

    // Reset form
    document.getElementById('new-email').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('new-display-name').value = '';
    document.getElementById('new-theme').value = '';
    document.getElementById('new-credits').value = '500';

    loadAll();
  } catch (err) {
    msgEl.textContent = 'Erreur reseau.';
    msgEl.className = 'create-msg error';
  }
}

// ── View user detail panel ──
async function viewUser(userId, email) {
  // Remove existing panel
  const old = document.getElementById('user-detail-panel');
  if (old) old.remove();

  const panel = document.createElement('div');
  panel.id = 'user-detail-panel';
  panel.innerHTML = `
    <div class="udp-overlay" onclick="closeUserPanel()"></div>
    <div class="udp-content">
      <div class="udp-header">
        <h2>Historique — ${esc(email)}</h2>
        <button class="udp-close" onclick="closeUserPanel()">&times;</button>
      </div>
      <div class="udp-tabs">
        <button class="udp-tab active" onclick="switchUdpTab('prospects',this)">Prospects</button>
        <button class="udp-tab" onclick="switchUdpTab('searches',this)">Recherches</button>
        <button class="udp-tab" onclick="switchUdpTab('activity',this)">Activite</button>
      </div>
      <div id="udp-body"><div class="udp-loading">Chargement...</div></div>
    </div>`;
  document.body.appendChild(panel);
  document.body.style.overflow = 'hidden';

  // Load all 3 tabs data
  try {
    const [prospectsRes, searchesRes, activityRes] = await Promise.all([
      fetch('/api/admin/users/' + userId + '/prospects', { headers }),
      fetch('/api/admin/users/' + userId + '/searches', { headers }),
      fetch('/api/admin/users/' + userId + '/activity', { headers }),
    ]);
    window._udpData = {
      prospects: await prospectsRes.json().catch(() => []),
      searches: await searchesRes.json().catch(() => []),
      activity: await activityRes.json().catch(() => []),
    };
    // Ensure arrays
    if (!Array.isArray(window._udpData.prospects)) window._udpData.prospects = [];
    if (!Array.isArray(window._udpData.searches)) window._udpData.searches = [];
    if (!Array.isArray(window._udpData.activity)) window._udpData.activity = [];

    renderUdpTab('prospects');
  } catch (err) {
    document.getElementById('udp-body').innerHTML = '<div style="color:#ff4444;padding:20px">Erreur de chargement</div>';
  }
}

function closeUserPanel() {
  const panel = document.getElementById('user-detail-panel');
  if (panel) panel.remove();
  document.body.style.overflow = '';
}

function switchUdpTab(tab, btn) {
  document.querySelectorAll('.udp-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderUdpTab(tab);
}

function renderUdpTab(tab, filter) {
  const body = document.getElementById('udp-body');
  const data = window._udpData || {};

  const stageLabels = {
    cold_call: 'Appel a froid', to_recall: 'A rappeler', no_answer: 'Pas de reponse',
    meeting_to_set: 'RDV a fixer', meeting_confirmed: 'RDV confirme', closed: 'Signe', refused: 'Refuse'
  };

  if (tab === 'prospects') {
    let list = data.prospects || [];
    if (!list.length) { body.innerHTML = '<div class="udp-empty">Aucun prospect</div>'; return; }

    // Count per stage for filter buttons
    const counts = {};
    list.forEach(p => { const s = p.pipeline_stage || 'cold_call'; counts[s] = (counts[s] || 0) + 1; });

    // Apply filter
    const activeFilter = filter || window._udpFilter || 'all';
    window._udpFilter = activeFilter;
    const filtered = activeFilter === 'all' ? list : list.filter(p => p.pipeline_stage === activeFilter);

    // Build filter bar
    let filtersHtml = '<div class="udp-filters">'
      + `<button class="udp-fbtn ${activeFilter === 'all' ? 'active' : ''}" onclick="window._udpFilter='all';renderUdpTab('prospects','all')">Tous (${list.length})</button>`;
    Object.keys(stageLabels).forEach(s => {
      if (counts[s]) filtersHtml += `<button class="udp-fbtn ${activeFilter === s ? 'active' : ''}" onclick="window._udpFilter='${s}';renderUdpTab('prospects','${s}')">${stageLabels[s]} (${counts[s]})</button>`;
    });
    filtersHtml += `<button class="udp-fbtn udp-fbtn-export" onclick="exportUserPDF()">PDF</button></div>`;

    body.innerHTML = filtersHtml
      + '<div class="udp-count">' + filtered.length + ' / ' + list.length + ' prospects</div>'
      + '<table class="udp-table"><thead><tr><th>Nom</th><th>Telephone</th><th>Niche</th><th>Ville</th><th>Etape</th><th>Statut</th><th>Rappel</th><th>Date</th></tr></thead><tbody>'
      + filtered.map(p => {
        const stage = p.pipeline_stage || 'cold_call';
        const stageClass = stage === 'to_recall' ? 'stage-recall' : stage === 'meeting_to_set' || stage === 'meeting_confirmed' ? 'stage-meeting' : stage === 'closed' ? 'stage-signed' : stage === 'refused' ? 'stage-refused' : '';
        return `<tr>
          <td style="font-weight:600">${esc(p.name || '—')}</td>
          <td>${esc(p.phone || '—')}</td>
          <td>${esc(p.niche || '—')}</td>
          <td>${esc(p.city || '—')}</td>
          <td><span class="udp-stage ${stageClass}">${esc(stageLabels[stage] || stage)}</span></td>
          <td>${esc(p.status || '—')}</td>
          <td>${p.rappel ? new Date(p.rappel).toLocaleString('fr-FR') : '—'}</td>
          <td style="color:#9090a8;font-size:.78rem">${new Date(p.created_at).toLocaleDateString('fr-FR')}</td>
        </tr>`;
      }).join('') + '</tbody></table>';

  } else if (tab === 'searches') {
    const list = data.searches || [];
    if (!list.length) { body.innerHTML = '<div class="udp-empty">Aucune recherche</div>'; return; }
    body.innerHTML = '<div class="udp-count">' + list.length + ' recherches</div><table class="udp-table"><thead><tr><th>Niche</th><th>Pays</th><th>Ville</th><th>Resultats</th><th>Date</th></tr></thead><tbody>'
      + list.map(s => `<tr>
          <td style="font-weight:600">${esc(s.niche || '—')}</td>
          <td>${esc((s.country || '').toUpperCase())}</td>
          <td>${esc(s.city || '—')}</td>
          <td>${parseInt(s.results_count) || 0}</td>
          <td style="color:#9090a8;font-size:.78rem">${new Date(s.created_at).toLocaleString('fr-FR')}</td>
        </tr>`).join('') + '</tbody></table>';

  } else if (tab === 'activity') {
    const list = data.activity || [];
    if (!list.length) { body.innerHTML = '<div class="udp-empty">Aucune activite</div>'; return; }
    body.innerHTML = '<div class="udp-count">' + list.length + ' actions</div><table class="udp-table"><thead><tr><th>Action</th><th>Details</th><th>Date</th></tr></thead><tbody>'
      + list.map(a => {
        let details = esc(a.details || '—');
        try { const d = JSON.parse(a.details); details = esc(Object.entries(d).map(([k,v]) => k + ': ' + v).join(', ')); } catch(_) {}
        const actionLabel = ({ login: 'Connexion', search: 'Recherche', extension_access: 'Extension', prospect_add: 'Ajout prospect', pitch: 'Pitch IA' })[a.action] || esc(a.action);
        return `<tr>
          <td><span class="udp-action">${actionLabel}</span></td>
          <td style="color:#9090a8;font-size:.78rem;max-width:400px;overflow:hidden;text-overflow:ellipsis">${details}</td>
          <td style="color:#9090a8;font-size:.78rem;white-space:nowrap">${new Date(a.created_at).toLocaleString('fr-FR')}</td>
        </tr>`;
      }).join('') + '</tbody></table>';
  }
}

// ── Export user prospects to PDF ──
function exportUserPDF() {
  const data = window._udpData || {};
  const prospects = data.prospects || [];
  if (!prospects.length) { alert('Aucun prospect a exporter'); return; }

  const filter = window._udpFilter || 'all';
  const stageLabels = {
    cold_call: 'Appel a froid', to_recall: 'A rappeler', no_answer: 'Pas de reponse',
    meeting_to_set: 'RDV a fixer', meeting_confirmed: 'RDV confirme', closed: 'Signe', refused: 'Refuse'
  };
  const list = filter === 'all' ? prospects : prospects.filter(p => p.pipeline_stage === filter);
  const filterLabel = filter === 'all' ? 'Tous les prospects' : (stageLabels[filter] || filter);

  // Build print-friendly HTML
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Export Prospects</title>
<style>
body{font-family:Arial,sans-serif;padding:30px;color:#222;font-size:12px}
h1{font-size:18px;margin-bottom:4px}
.meta{color:#666;margin-bottom:16px;font-size:11px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;border-bottom:2px solid #ccc}
td{padding:5px 8px;border-bottom:1px solid #e0e0e0;font-size:11px}
tr:nth-child(even){background:#fafafa}
.stage{display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700}
.s-to_recall{background:#fff3cd;color:#856404}
.s-meeting_to_set,.s-meeting_confirmed{background:#cce5ff;color:#004085}
.s-closed{background:#d4edda;color:#155724}
.s-refused{background:#f8d7da;color:#721c24}
@media print{body{padding:10px}}
</style></head><body>
<h1>Empire Leads — ${esc(filterLabel)}</h1>
<div class="meta">${list.length} prospects — Exporte le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}</div>
<table><thead><tr><th>Nom</th><th>Telephone</th><th>Niche</th><th>Ville</th><th>Etape</th><th>Rappel</th><th>Date creation</th></tr></thead><tbody>
${list.map(p => {
  const s = p.pipeline_stage || 'cold_call';
  return `<tr><td><b>${esc(p.name||'—')}</b></td><td>${esc(p.phone||'—')}</td><td>${esc(p.niche||'—')}</td><td>${esc(p.city||'—')}</td><td><span class="stage s-${s}">${esc(stageLabels[s]||s)}</span></td><td>${p.rappel?new Date(p.rappel).toLocaleString('fr-FR'):'—'}</td><td>${new Date(p.created_at).toLocaleDateString('fr-FR')}</td></tr>`;
}).join('')}
</tbody></table></body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); }, 500);
}

// ── Bulk reset credits ──
async function bulkResetCredits() {
  if (!confirm('⚠️ ATTENTION : Tous les comptes non-admin vont passer à Free avec 0 crédit. Cette action est irréversible. Confirmer ?')) return;
  const msg = document.getElementById('bulk-reset-msg');
  msg.textContent = 'En cours...';
  try {
    const res = await fetch('/api/admin/bulk-reset', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('ph_token') } });
    const data = await res.json();
    if (res.ok) {
      msg.style.color = '#22c55e';
      msg.textContent = `✅ ${data.updated} comptes réinitialisés à Free / 0 crédit.`;
      loadAll();
    } else {
      msg.style.color = '#ff4444';
      msg.textContent = 'Erreur : ' + (data.error || 'inconnue');
    }
  } catch (e) {
    msg.style.color = '#ff4444';
    msg.textContent = 'Erreur réseau.';
  }
}

// ── Auto-refresh only when tab is visible ──
loadAll();
let _adminRefresh = setInterval(loadAll, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(_adminRefresh); _adminRefresh = null; }
  else { loadAll(); _adminRefresh = setInterval(loadAll, 30000); }
});
