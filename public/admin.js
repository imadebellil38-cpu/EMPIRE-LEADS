/* Empire Leads — Admin Page Logic v2 — Dark Green Theme */

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const token = localStorage.getItem('ph_token');
if (!token) window.location.href = '/login';

const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Requested-With': 'XMLHttpRequest' };

async function loadAll() {
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

    const stats = await statsRes.json();
    const users = await usersRes.json();
    const searches = await searchesRes.json();
    const revenue = await revenueRes.json();
    const daily = await dailyRes.json();
    const top = await topRes.json();
    const connections = await connRes.json();

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
    document.getElementById('users-body').innerHTML = users.map(u => {
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
    document.getElementById('searches-body').innerHTML = searches.slice(0, 30).map(s => `
      <tr>
        <td style="font-weight:600">${esc(s.email)}</td>
        <td>${esc(s.niche || '—')}</td>
        <td>${esc((s.country||'').toUpperCase())}</td>
        <td>${parseInt(s.results_count)||0}</td>
        <td style="color:var(--muted);font-size:.78rem">${new Date(s.created_at).toLocaleString('fr-FR')}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--muted);text-align:center">Aucune recherche.</td></tr>';

    // ── Connections table ──
    document.getElementById('connections-body').innerHTML = connections.slice(0, 30).map(c => {
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

// ── Auto-refresh every 30s ──
loadAll();
setInterval(loadAll, 30000);
