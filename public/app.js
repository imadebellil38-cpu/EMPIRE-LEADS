'use strict';

/* ─────────────────────────────────────────
   AUTH
───────────────────────────────────────── */
const token = localStorage.getItem('ph_token');
if (!token) { window.location.href = '/login'; }

const AUTH = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + token,
  'X-Requested-With': 'XMLHttpRequest',
};

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let allProspects   = [];
let currentTab     = 'cold_call';
let currentSubTab  = 'meeting_to_set';
let currentProspect = null;
let pitchType      = 'appel';
let saveTimer      = null;

/* Scan selections (driven by buttons, not dropdowns) */
let scanCountry = 'fr';
let scanMode    = 'site';
let userCredits = 0;
let userPlan = 'free'; // 'free' | 'pro' | 'admin'
let calendarWeek  = getWeekStart(new Date()); // Monday of current week
let scanLat     = null;
let scanLng     = null;
let scanRadius  = 10;

/* ─────────────────────────────────────────
   STAGE CONFIG
───────────────────────────────────────── */
const STAGE_LABEL = {
  cold_call:          '📞 Cold Call',
  to_recall:          '🔄 À Rappeler',
  no_answer:          '📵 N\'a pas répondu',
  meeting_to_set:     '🗓️ À poser',
  meeting_confirmed:  '✅ Confirmé',
  closed:             '💰 Closé',
  refused:            '❌ Refusé',
};

const STAGE_CLASS = {
  cold_call:          'stage-cold_call',
  to_recall:          'stage-to_recall',
  no_answer:          'stage-no_answer',
  meeting_to_set:     'stage-meeting_to_set',
  meeting_confirmed:  'stage-meeting_confirmed',
  closed:             'stage-closed',
  refused:            'stage-refused',
};

const EMPTY_STATE = {
  cold_call: {
    icon: '🎯',
    msg: 'Aucun prospect en Cold Call',
    hint: 'Lance un scan pour trouver des prospects ↑',
  },
  to_recall: {
    icon: '🔄',
    msg: 'Aucun prospect à rappeler',
    hint: 'Les prospects intéressés apparaîtront ici',
  },
  no_answer: {
    icon: '📵',
    msg: 'Aucun prospect sans réponse',
    hint: 'Les prospects qui n\'ont pas répondu apparaîtront ici',
  },
  meeting_to_set: {
    icon: '📅',
    msg: 'Aucun rendez-vous à poser',
    hint: '',
  },
  meeting_confirmed: {
    icon: '✅',
    msg: 'Aucun rendez-vous confirmé',
    hint: '',
  },
  closed: {
    icon: '💰',
    msg: 'Aucun client closé',
    hint: 'Vos deals gagnés apparaîtront ici',
  },
  refused: {
    icon: '🚫',
    msg: 'Aucun refus',
    hint: '',
  },
};

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function showToast(msg, type = 'info', duration = 3500) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const icons = { success: '✓', error: '✗', info: 'ℹ', warn: '⚠' };
  const t = document.createElement('div');
  t.className = `toast toast-${type === 'warn' ? 'info' : type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, duration);
}

/* ─────────────────────────────────────────
   API HELPERS
───────────────────────────────────────── */
async function apiGet(url) {
  const r = await fetch(url, { headers: AUTH });
  if (r.status === 401) { logout(); return null; }
  return r.json();
}
async function apiPut(url, body) {
  const r = await fetch(url, { method: 'PUT', headers: AUTH, body: JSON.stringify(body) });
  if (r.status === 401) { logout(); return null; }
  const data = await r.json();
  return r.ok ? data : { ...data, ok: false };
}
async function apiPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: AUTH, body: JSON.stringify(body) });
  if (r.status === 401) { logout(); return null; }
  return r.json();
}
async function apiDelete(url) {
  const r = await fetch(url, { method: 'DELETE', headers: AUTH });
  if (r.status === 401) { logout(); return null; }
  return r.json();
}
async function apiPatch(url, body) {
  const r = await fetch(url, { method: 'PATCH', headers: AUTH, body: JSON.stringify(body) });
  if (r.status === 401) { logout(); return null; }
  const data = await r.json();
  return r.ok ? data : { ...data, ok: false };
}

/* ─────────────────────────────────────────
   LOGOUT
───────────────────────────────────────── */
function logout() {
  localStorage.removeItem('ph_token');
  localStorage.removeItem('ph_user');
  window.location.href = '/login';
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
async function init() {
  // Load user info
  try {
    const meData = await apiGet('/api/me');
    if (meData && meData.user) {
      const u = meData.user;
      const emailEl = document.getElementById('user-email-display');
      if (emailEl) emailEl.textContent = u.display_name || u.email;
      userCredits = u.credits || 0;
      userPlan = u.plan || 'free';
      if (u.is_admin) userPlan = 'pro'; // admins always have PRO
      updateProspectsSlider();
      // Update plan badge
      const planLabel = document.getElementById('plan-badge-label');
      const planCredits = document.getElementById('plan-badge-credits');
      if (planLabel) planLabel.textContent = u.plan || 'free';
      if (planCredits) planCredits.textContent = (u.credits || 0) + ' cr';
      // Bouton admin — visible uniquement pour les admins
      if (u.is_admin) {
        const btnAdmin = document.getElementById('btn-admin');
        const btnAdminM = document.getElementById('btn-admin-mobile');
        if (btnAdmin) btnAdmin.style.display = 'inline-flex';
        if (btnAdminM) btnAdminM.style.display = 'block';
      }
      // Bouton thème personnalisé — toggle CSS theme
      if (u.theme_url) {
        window._userTheme = u.theme_url;
        const btn = document.getElementById('btn-theme-perso');
        const btnM = document.getElementById('btn-theme-perso-mobile');
        if (btn) { btn.classList.add('theme-btn-visible'); btn.onclick = (e) => { e.preventDefault(); toggleCustomTheme(); }; }
        if (btnM) { btnM.style.display = 'block'; btnM.onclick = (e) => { e.preventDefault(); toggleCustomTheme(); }; }
        // Restore if previously active
        if (localStorage.getItem('custom_theme_active') === '1') applyCustomTheme(u.theme_url);
      }
    }
  } catch (e) {}

  await loadProspects();
}

/* ─────────────────────────────────────────
   LOAD PROSPECTS
───────────────────────────────────────── */
async function loadProspects() {
  showTableSkeleton();
  const data = await apiGet('/api/prospects');
  if (!data) return;

  allProspects = Array.isArray(data) ? data : [];
  // Ensure all have a stage
  allProspects.forEach(p => {
    if (!p.pipeline_stage) p.pipeline_stage = 'cold_call';
  });

  rebuildNicheFilter();
  updateBadges();
  renderList();
  updateOnboardingBanner();

  // Auto-enrich all non-enriched prospects in background (PRO only)
  startBackgroundEnrichment();
}

/* ─────────────────────────────────────────
   ONBOARDING BANNER
───────────────────────────────────────── */
function updateOnboardingBanner() {
  const banner = document.getElementById('onboarding-banner');
  if (!banner) return;
  const dismissed = localStorage.getItem('ph_onboarding_dismissed') === '1';
  // Show if : no prospects AND not dismissed
  const shouldShow = allProspects.length === 0 && !dismissed;
  banner.style.display = shouldShow ? 'block' : 'none';
}

function dismissOnboarding() {
  try { localStorage.setItem('ph_onboarding_dismissed', '1'); } catch (_) {}
  const banner = document.getElementById('onboarding-banner');
  if (banner) banner.style.display = 'none';
}

/* ─────────────────────────────────────────
   QUICK START TEMPLATES (scan panel)
   1-click popular combos to fill niche + country + mode + count
───────────────────────────────────────── */
const SCAN_TEMPLATES = {
  'resto-paris':          { niche: 'restaurant Paris',      country: 'fr', mode: 'site',   count: 30 },
  'plombier-lyon':        { niche: 'plombier Lyon',         country: 'fr', mode: 'social', count: 30 },
  'coiffeur-marseille':   { niche: 'coiffeur Marseille',    country: 'fr', mode: 'both',   count: 30 },
  'estheticienne-bordeaux': { niche: 'esthéticienne Bordeaux', country: 'fr', mode: 'both', count: 30 },
  'salle-sport-fr':       { niche: 'salle de sport France', country: 'fr', mode: 'site',   count: 50 },
  'dentiste-paris':       { niche: 'dentiste Paris',        country: 'fr', mode: 'site',   count: 30 },
  'garage-nice':          { niche: 'garage automobile Nice', country: 'fr', mode: 'both',  count: 30 },
  'kine-toulouse':        { niche: 'kinésithérapeute Toulouse', country: 'fr', mode: 'site', count: 30 },
};

function applyScanTemplate(key) {
  const tpl = SCAN_TEMPLATES[key];
  if (!tpl) return;
  // 1) niche
  const nicheInput = document.getElementById('scan-niche');
  if (nicheInput) nicheInput.value = tpl.niche;
  // 2) country (click the flag-btn for this country)
  try {
    const flagBtn = document.querySelector('.flag-btn[data-country="' + tpl.country + '"]');
    if (flagBtn && typeof selectCountry === 'function') selectCountry(flagBtn);
  } catch (_) {}
  // 3) mode
  try {
    const modeBtn = document.querySelector('.mode-btn[data-mode="' + tpl.mode + '"]');
    if (modeBtn && typeof selectMode === 'function') selectMode(modeBtn);
  } catch (_) {}
  // 4) prospects count
  const slider = document.getElementById('prospects-slider');
  if (slider) {
    slider.value = String(tpl.count);
    if (typeof updateProspectsSlider === 'function') updateProspectsSlider();
  }
  // 5) scroll to launch button + highlight
  const launchBtn = document.getElementById('btn-scan');
  if (launchBtn) {
    launchBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Pulse effect
    launchBtn.style.transition = 'box-shadow 0.3s';
    const originalShadow = launchBtn.style.boxShadow;
    launchBtn.style.boxShadow = '0 0 0 4px rgba(0,208,132,.4), 0 6px 20px rgba(0,208,132,.35)';
    setTimeout(() => { launchBtn.style.boxShadow = originalShadow; }, 1800);
  }
  showToast('Template "' + tpl.niche + '" chargé · clique sur "Lancer la recherche" ↓', 'success', 3000);
}

function startFirstScan() {
  // Ouvre le scan panel s'il est replié, focus sur le premier champ, scroll en haut
  try {
    const panel = document.getElementById('scan-panel');
    const body = document.getElementById('scan-body');
    if (panel && body && body.style.display === 'none') {
      // Dérouler le panel si c'est replié
      if (typeof toggleScanPanel === 'function') toggleScanPanel();
    }
    const nicheInput = document.getElementById('scan-niche');
    if (nicheInput) {
      nicheInput.focus();
      nicheInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    showToast('Choisis une niche (ex: "plombier", "coiffeur") puis clique sur Lancer ↓', 'info', 5000);
  } catch (e) {}
}

/* ─────────────────────────────────────────
   BACKGROUND AUTO-ENRICHMENT
   Processes all non-enriched prospects 1 by 1 every 2.5s.
   Shows a subtle progress indicator. PRO users only.
───────────────────────────────────────── */
let _bgEnrichRunning = false;
async function startBackgroundEnrichment() {
  if (_bgEnrichRunning) return;
  const isPro = userPlan === 'pro' || userPlan === 'admin';
  if (!isPro) return;
  _bgEnrichRunning = true;
  try {
    while (true) {
      const todo = allProspects.filter(p => !p.enriched_at && !p._bgEnrichFailed);
      if (!todo.length) break;
      showBgEnrichIndicator(allProspects.length - todo.length, allProspects.length);
      const next = todo[0];
      try {
        const res = await apiPost('/api/prospects/' + next.id + '/enrich');
        if (res && res.error) {
          // If PRO check fails or other error, stop the loop
          if (res.upgrade) { break; }
          next._bgEnrichFailed = true;
        } else if (res && res.found === false) {
          // Mark as attempted so we don't retry infinitely; set enriched_at locally so filter/UI skip it
          next._bgEnrichFailed = true;
          next.enriched_at = new Date().toISOString();
        } else if (res && res.data) {
          // Merge returned data locally
          Object.assign(next, res.data);
          next.enriched_at = new Date().toISOString();
          // If this prospect's fiche is currently open, refresh the detail view
          if (currentProspect && currentProspect.id === next.id) {
            currentProspect = next;
            buildDetailInfo(next);
          }
          // Refresh the card list to reflect the new dirigeant badge / filter eligibility
          renderList();
        }
      } catch (e) {
        next._bgEnrichFailed = true;
      }
      // Pace: 2.5s between calls to avoid Pappers rate-limit
      await new Promise(r => setTimeout(r, 2500));
    }
    hideBgEnrichIndicator();
  } catch (_) { hideBgEnrichIndicator(); }
  finally { _bgEnrichRunning = false; }
}

function showBgEnrichIndicator(done, total) {
  // Indicator disabled — removed per user request
  return;
}

function hideBgEnrichIndicator() {
  const el = document.getElementById('bg-enrich-indicator');
  if (el) el.remove();
}

/* ─────────────────────────────────────────
   BADGES
───────────────────────────────────────── */
function updateBadges() {
  const counts = {
    cold_call: 0, to_recall: 0, no_answer: 0,
    meeting_to_set: 0, meeting_confirmed: 0,
    closed: 0, refused: 0,
  };
  allProspects.forEach(p => {
    if (counts[p.pipeline_stage] !== undefined) counts[p.pipeline_stage]++;
  });

  const totalEl = document.getElementById('hstat-total');
  if (totalEl) totalEl.textContent = userCredits;

  const active = allProspects.filter(p => p.pipeline_stage !== 'refused').length;
  if (typeof updateSeeProspectsCount === 'function') updateSeeProspectsCount(active);

  document.getElementById('badge-cold_call').textContent = counts.cold_call;
  document.getElementById('badge-to_recall').textContent = counts.to_recall;
  document.getElementById('badge-no_answer').textContent = counts.no_answer;
  document.getElementById('badge-meeting').textContent   = counts.meeting_to_set + counts.meeting_confirmed;
  document.getElementById('badge-closed').textContent    = counts.closed;
  document.getElementById('badge-refused').textContent   = counts.refused;

  // Sub-tab badges
  const bMts = document.getElementById('badge-meeting_to_set');
  const bMc  = document.getElementById('badge-meeting_confirmed');
  if (bMts) { bMts.textContent = counts.meeting_to_set || ''; bMts.style.display = counts.meeting_to_set ? '' : 'none'; }
  if (bMc)  { bMc.textContent  = counts.meeting_confirmed || ''; bMc.style.display  = counts.meeting_confirmed ? '' : 'none'; }
}

/* ─────────────────────────────────────────
   TAB SWITCHING
───────────────────────────────────────── */
function switchTab(stage) {
  currentTab = stage;
  document.querySelectorAll('.pipe-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.stage === stage);
  });

  const meetingSubtabs = document.getElementById('meeting-subtabs');
  if (meetingSubtabs) {
    meetingSubtabs.style.display = stage === 'meeting' ? 'flex' : 'none';
  }

  // Auto-fermer le panel "Trouver des prospects" si on change d'onglet
  const scanBody = document.getElementById('scan-body');
  const scanToggleBtn = document.getElementById('scan-toggle-btn');
  if (scanBody && scanBody.style.display !== 'none') {
    scanBody.style.display = 'none';
    if (scanToggleBtn) scanToggleBtn.classList.add('collapsed');
  }

  rebuildNicheFilter();
  renderList();
}

function switchSubTab(sub) {
  currentSubTab = sub;
  document.querySelectorAll('.sub-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.sub === sub);
  });
  renderList();
}

/* ─────────────────────────────────────────
   FILTERS
───────────────────────────────────────── */
function applyFilters() { renderList(); }

function filterByNiche(niche) {
  const sel = document.getElementById('niche-filter');
  if (!sel) return;
  sel.value = nicheKey(niche);
  renderList();
  // Visual feedback
  showToast(`Filtre : ${niche}`, 'info', 1500);
}

function nicheKey(raw) { return decodeHtml((raw || '').trim()).toLowerCase(); }

function getTabProspects() {
  // Prospects du tab actif, sans filtre niche/search
  const stageMap = {
    cold_call: ['cold_call'],
    to_recall: ['to_recall'],
    no_answer: ['no_answer'],
    meeting:   ['meeting_to_set', 'meeting_confirmed'],
    closed:    ['closed'],
    refused:   ['refused'],
  };
  const stages = stageMap[currentTab] || [];
  return allProspects.filter(p => stages.includes(p.pipeline_stage));
}

function rebuildNicheFilter() {
  const sel = document.getElementById('niche-filter');
  if (!sel) return;
  const current = sel.value;
  const tabProspects = getTabProspects();
  // Map lowercase key → original display name (basé sur l'onglet actif)
  const nicheMap = {};
  tabProspects.forEach(p => {
    const k = nicheKey(p.niche);
    if (k && !nicheMap[k]) nicheMap[k] = decodeHtml((p.niche || '').trim());
  });
  const keys = Object.keys(nicheMap).sort((a, b) => a.localeCompare(b, 'fr'));
  // Si le filtre actuel n'existe plus dans ce tab, reset à "all"
  const newVal = nicheMap[current] ? current : 'all';
  sel.innerHTML = `<option value="all">🏷️ Tous (${tabProspects.length})</option>` +
    keys.map(k => {
      const count = tabProspects.filter(p => nicheKey(p.niche) === k).length;
      const label = nicheMap[k];
      return `<option value="${k}"${newVal === k ? ' selected' : ''}>${esc(label)} (${count})</option>`;
    }).join('');
  if (sel.value !== newVal) sel.value = newVal;
}

function getFilteredProspects() {
  const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const nicheFilter = document.getElementById('niche-filter')?.value || 'all';

  let stages = [];
  if (currentTab === 'meeting') {
    stages = [currentSubTab];
  } else if (currentTab === 'cold_call') {
    stages = ['cold_call'];
  } else if (currentTab === 'to_recall') {
    stages = ['to_recall'];
  } else if (currentTab === 'no_answer') {
    stages = ['no_answer'];
  } else if (currentTab === 'closed') {
    stages = ['closed'];
  } else if (currentTab === 'refused') {
    stages = ['refused'];
  }

  return allProspects.filter(p => {
    if (!stages.includes(p.pipeline_stage)) return false;
    if (nicheFilter !== 'all' && nicheKey(p.niche) !== nicheFilter) return false;
    if (searchVal) {
      const name  = (p.name    || '').toLowerCase();
      const phone = (p.phone   || '').toLowerCase();
      const addr  = (p.address || '').toLowerCase();
      const city  = (p.city    || '').toLowerCase();
      const niche = (p.niche   || '').toLowerCase();
      if (!name.includes(searchVal) && !phone.includes(searchVal) && !addr.includes(searchVal) && !city.includes(searchVal) && !niche.includes(searchVal)) return false;
    }
    return true;
  });
}

/* ─────────────────────────────────────────
   RENDER LIST (desktop + mobile)
───────────────────────────────────────── */
function renderList() {
  const sortMode     = document.getElementById('sort-select')?.value || 'heat';
  const signalFilter = document.getElementById('signal-filter')?.value || 'all';

  let prospects = getFilteredProspects();

  // Signal filter — robust checks (catches null, undefined, '', 0, false)
  // hasSite: priority to website_url field (truth from Google Maps). has_website flag is fallback.
  const hasSite = (p) => {
    if (p.website_url && String(p.website_url).trim().length > 3) return true;
    if (p.has_website === 1 || p.has_website === true) return true;
    return false;
  };
  // hasSocial: any Facebook OR Instagram OR TikTok presence
  const hasSocial = (p) => {
    if (p.has_facebook === 1 || p.has_facebook === true) return true;
    if (p.has_instagram === 1 || p.has_instagram === true) return true;
    if (p.has_tiktok === 1 || p.has_tiktok === true) return true;
    if (p.instagram_handle && String(p.instagram_handle).trim()) return true;
    return false;
  };
  if (signalFilter === 'nosite')    prospects = prospects.filter(p => !hasSite(p));
  if (signalFilter === 'nosocial')  prospects = prospects.filter(p => !hasSocial(p));
  if (signalFilter === 'both')      prospects = prospects.filter(p => !hasSite(p) && !hasSocial(p));
  if (signalFilter === 'mobile')    prospects = prospects.filter(p => {
    if (!p.phone) return false;
    // Strip everything except digits, then check FR mobile patterns: 06xx, 07xx, +336xx, +337xx, 0033 6xx, 0033 7xx
    const digits = String(p.phone).replace(/\D/g, '');
    // Match: starts with 06/07 (10-digit national) OR 336/337 (international FR mobile)
    return /^0[67]\d{8}$/.test(digits) || /^33[67]\d{8}$/.test(digits) || /^00337\d{8}$/.test(digits) || /^00336\d{8}$/.test(digits);
  });

  // Sort
  prospects = prospects.sort((a, b) => {
    if (sortMode === 'recent')  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    if (sortMode === 'oldest')  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    if (sortMode === 'rating')  return (b.rating || 0) - (a.rating || 0);
    if (sortMode === 'reviews') return (b.reviews || 0) - (a.reviews || 0);
    if (sortMode === 'name')    return (a.name || '').localeCompare(b.name || '', 'fr');
    return calcHeat(b) - calcHeat(a);
  });
  const empty     = document.getElementById('empty-state');
  const tblWrap   = document.getElementById('tbl-wrap');
  const cardsWrap = document.getElementById('cards-wrap');

  // Refresh onboarding banner visibility on each render
  if (typeof updateOnboardingBanner === 'function') updateOnboardingBanner();

  if (prospects.length === 0) {
    if (empty) {
      // Determine which empty config to use
      const key = currentTab === 'meeting' ? currentSubTab : currentTab;
      const cfg = EMPTY_STATE[key] || { icon: '🏜️', msg: 'Aucun prospect.', hint: '' };
      const iconEl = document.getElementById('empty-icon');
      const msgEl  = document.getElementById('empty-msg');
      const hintEl = document.getElementById('empty-hint');
      if (iconEl) iconEl.textContent = cfg.icon;
      if (msgEl)  msgEl.textContent  = cfg.msg;
      if (hintEl) hintEl.textContent = cfg.hint;
      empty.style.display = 'block';
    }
    if (tblWrap)   tblWrap.style.display   = 'none';
    if (cardsWrap) cardsWrap.style.display = 'none';
    return;
  }

  if (empty)     empty.style.display     = 'none';
  if (tblWrap)   tblWrap.style.display   = 'block';
  if (cardsWrap) cardsWrap.style.display = 'flex';

  // Always split "À rappeler" into 2 groups: Intéressés (RDV à poser) vs Pas le temps (à rappeler)
  if (currentTab === 'to_recall') {
    const interested = prospects.filter(p => (p.recall_type || 'interested') === 'interested');
    const noTime     = prospects.filter(p => p.recall_type === 'no_time');
    const groups = [];
    if (interested.length) groups.push({ title: 'Intéressés — RDV à poser', subtype: 'interested', count: interested.length, items: interested });
    if (noTime.length)     groups.push({ title: 'Pas le temps — à rappeler plus tard', subtype: 'no_time', count: noTime.length, items: noTime });
    if (groups.length >= 1) {
      renderTableGrouped(groups);
      renderCardsGrouped(groups);
      return;
    }
  }

  renderTable(prospects);
  renderCards(prospects);
}

function renderCardsGrouped(groups) {
  const wrap = document.getElementById('cards-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  groups.forEach(g => {
    const header = document.createElement('div');
    header.className = 'cards-section-header';
    if (g.subtype) header.dataset.subtype = g.subtype;
    header.innerHTML = `<span class="cards-section-title">${g.title}</span><span class="cards-section-count">${g.count}</span>`;
    wrap.appendChild(header);
    g.items.forEach(p => {
      _renderSingleCard(p, wrap);
      // Tag card with subtype for CSS coloring
      if (g.subtype) {
        const card = document.getElementById('pcard-' + p.id);
        if (card) card.dataset.recallType = g.subtype;
      }
    });
  });
}

function renderTableGrouped(groups) {
  const tbody = document.getElementById('prospects-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  groups.forEach(g => {
    const headerRow = document.createElement('tr');
    headerRow.className = 'tbl-section-header';
    if (g.subtype) headerRow.dataset.subtype = g.subtype;
    headerRow.innerHTML = `<td colspan="99"><div class="tbl-section-inner"><span class="tbl-section-title">${g.title}</span><span class="tbl-section-count">${g.count}</span></div></td>`;
    tbody.appendChild(headerRow);
    renderTableRows(g.items, tbody);
    // Tag the newly-added rows with subtype
    if (g.subtype) {
      const rows = tbody.querySelectorAll('tr:not(.tbl-section-header)');
      const startIdx = rows.length - g.items.length;
      for (let i = startIdx; i < rows.length; i++) {
        if (rows[i]) rows[i].dataset.recallType = g.subtype;
      }
    }
  });
}

/* ─────────────────────────────────────────
   HEAT SCORE
───────────────────────────────────────── */
function calcHeat(p) {
  let score = 0;
  if (!p.website_url || p.website_url === '') score += 3;
  if (p.has_facebook  === 0) score += 3;
  if (p.has_instagram === 0) score += 3;
  if (p.has_tiktok    === 0) score += 3;
  const rev = p.reviews ?? 0;
  if (rev < 10) score += 2;
  if (rev < 5)  score += 1;
  if (p.rating && p.rating < 3.5) score += 1;
  return score;
}

function buildDateChip(p) {
  const now = new Date();
  let dateStr = null, isUrgent = false, label = '';

  if ((p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed') && p.meeting_date) {
    const d = new Date(p.meeting_date);
    const hasTime = p.meeting_date.includes(' ');
    if (hasTime && d < now) isUrgent = true;
    dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = hasTime ? ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    label = `📅 RDV ${dateStr}${timeStr}`;
  } else if (p.pipeline_stage === 'to_recall' && p.rappel) {
    const d = new Date(p.rappel);
    const hasTime = p.rappel.includes(' ');
    if (hasTime && d < now) isUrgent = true;
    dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = hasTime ? ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    label = `🔄 Rappel ${dateStr}${timeStr}`;
  }

  if (!label) return '';
  return `<div class="row-date-chip${isUrgent ? ' row-date-urgent' : ''}">${label}</div>`;
}

function buildHeatBadge(p) {
  const score = calcHeat(p);
  if (score >= 6) return `<span class="heat-badge heat-burning" title="Score ${score}/9">🔥🔥 Brûlant</span>`;
  if (score >= 3) return `<span class="heat-badge heat-hot"     title="Score ${score}/9">🔥 Chaud</span>`;
  if (score >= 2) return `<span class="heat-badge heat-warm"    title="Score ${score}/9">🌡️ Tiède</span>`;
  return             `<span class="heat-badge heat-cold"        title="Score ${score}/9">❄️ Froid</span>`;
}

/* ─────────────────────────────────────────
   SIGNAL BADGES
───────────────────────────────────────── */
function buildSignals(p) {
  const badges = [];
  if (!p.website_url || p.website_url === '') {
    badges.push(`<span class="signal-badge sig-nosite">🌐 Sans site</span>`);
  }
  if (p.has_facebook === 0) {
    badges.push(`<span class="signal-badge sig-nofb">f/ Sans FB</span>`);
  }
  if (p.has_instagram === 0) {
    badges.push(`<span class="signal-badge sig-noig">📸 Sans IG</span>`);
  }
  if (p.has_tiktok === 0) {
    badges.push(`<span class="signal-badge sig-notk">♪ Sans TK</span>`);
  }
  return badges.join('');
}

/* ─────────────────────────────────────────
   ACTION BUTTONS — per stage
───────────────────────────────────────── */
function buildMainAction(p) {
  const stage = p.pipeline_stage;
  const id    = p.id;

  if (stage === 'cold_call') {
    return `
      <button class="act-btn act-btn-interested act-btn-primary" onclick="moveStage(${id},'to_recall','interested')">✅ Intéressé</button>
      <button class="act-btn act-btn-recall" onclick="moveStage(${id},'to_recall','no_time')">⏰ À rappeler</button>
      <button class="act-btn act-btn-no-answer" onclick="moveStage(${id},'no_answer')">📵 Pas répondu</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'to_recall') {
    return `
      <button class="act-btn act-btn-back" onclick="moveStage(${id},'cold_call')" title="Revenir en Cold Call">◀ Retour</button>
      <button class="act-btn act-btn-meeting act-btn-primary" onclick="moveStage(${id},'meeting_to_set')">📅 Poser RDV</button>
      <button class="act-btn act-btn-no-answer" onclick="moveStage(${id},'no_answer')">📵 Pas répondu</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'no_answer') {
    return `
      <button class="act-btn act-btn-back" onclick="moveStage(${id},'cold_call')" title="Remettre en Cold Call">◀ Relancer</button>
      <button class="act-btn act-btn-interested act-btn-primary" onclick="moveStage(${id},'to_recall')">✅ A répondu</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'meeting_to_set') {
    return `
      <button class="act-btn act-btn-back" onclick="moveStage(${id},'to_recall')" title="Revenir À Rappeler">◀ Retour</button>
      <button class="act-btn act-btn-confirm act-btn-primary" onclick="moveStage(${id},'meeting_confirmed')">✅ RDV Confirmé</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'meeting_confirmed') {
    return `
      <button class="act-btn act-btn-back" onclick="moveStage(${id},'meeting_to_set')" title="Revenir RDV à poser">◀ Retour</button>
      <button class="act-btn act-btn-close act-btn-primary" onclick="moveStage(${id},'closed')">💰 Closé !</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'closed' || stage === 'refused') {
    return `
      <button class="act-btn act-btn-restore" onclick="moveStage(${id},'cold_call')">↩️ Réactiver</button>
      ${stage === 'refused' ? `<button class="act-btn act-btn-delete" onclick="deleteProspect(${id})" title="Supprimer">🗑</button>` : ''}
    `;
  }
  return '';
}

/* ─────────────────────────────────────────
   RENDER TABLE (desktop)
───────────────────────────────────────── */
function renderTableRows(prospects, tbody) {
  prospects.forEach(p => {
    const tr = document.createElement('tr');
    tr.dataset.stage = p.pipeline_stage;
    if (bulkSelectMode && selectedIds.has(p.id)) tr.classList.add('prospect-card-selected');

    const signals = buildSignals(p);
    const actions = buildMainAction(p);

    const phoneDisplay = p.phone || '—';
    const phoneCopy = p.phone
      ? `<button class="btn-copy-phone" onclick="copyPhone('${escAttr(p.phone)}', event)" title="Copier">📋</button>`
      : '';

    const callLink = p.phone
      ? `<button class="btn-call-big" onclick="callProspect(${p.id})">📞 Appeler</button>`
      : `<span class="btn-call-big btn-call-disabled">Pas de tél.</span>`;

    const dateChip = buildDateChip(p);
    const objBadge = (p.pipeline_stage === 'refused' && p.objection)
      ? `<span class="refused-obj-badge">❌ ${esc(p.objection)}</span>` : '';
    const notesBtn = p.notes
      ? `<button class="notes-peek-btn" onclick="toggleNotesPreview(${p.id}, this)" title="Voir les notes">📝 Notes</button>
         <div class="notes-preview" id="notes-preview-${p.id}" style="display:none">${esc(p.notes)}</div>`
      : '';
    const ratingHtml = p.rating
      ? `<span class="row-rating">★ ${p.rating}${p.reviews ? ` <span class="row-avis">${p.reviews} avis</span>` : ''}</span>`
      : '';

    const nicheBadge = p.niche ? `<span class="niche-tag" onclick="filterByNiche('${escAttr(p.niche)}')" title="Filtrer par ${esc(p.niche)}">${esc(p.niche)}</span>` : '';

    const bulkCheckboxTd = bulkSelectMode
      ? `<td class="td-bulk" style="width:40px;padding:0 4px 0 12px;vertical-align:middle;text-align:center"><input type="checkbox" class="bulk-cb" id="bulk-cb-${p.id}" ${selectedIds.has(p.id) ? 'checked' : ''} onchange="toggleProspectSelection(${p.id}, this.checked)" style="width:20px;height:20px;accent-color:#E1306C;cursor:pointer"></td>`
      : '';

    tr.innerHTML = `
      ${bulkCheckboxTd}
      <td class="td-main">
        <div class="prospect-name" onclick="openDetail(${p.id})">${esc(p.name || '—')}</div>
        ${p.address ? `<div class="prospect-addr">${esc(p.address)}</div>` : ''}
        <div class="row-meta-line">
          ${nicheBadge}${ratingHtml}${signals}${dateChip}${objBadge}
        </div>
        <div class="row-bottom-line">
          <div class="row-heat">${buildHeatBadge(p)}</div>
          <div class="row-actions">${actions}</div>
        </div>
        ${notesBtn}
      </td>
      <td class="td-phone">
        <div class="phone-cell">
          ${p.phone
            ? `<button class="phone-call-link" onclick="callProspect(${p.id})" title="Appuyer pour appeler"><span>📞 ${esc(p.phone)}</span></button>`
            : `<span class="phone-text">—</span>`
          }
          ${phoneCopy}
        </div>
        <a class="btn-fiche btn-fiche-google" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.name || '') + ' ' + (p.address || ''))}" target="_blank" rel="noopener" title="Voir sur Google Maps">📋 Fiche Google</a>
        ${bulkSelectMode ? '' : `<button class="prospect-menu-btn" onclick="openProspectMenu(event, ${p.id})" title="Actions">⋮</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTable(prospects) {
  const tbody = document.getElementById('prospects-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  renderTableRows(prospects, tbody);
}

/* ─────────────────────────────────────────
   RENDER CARDS (mobile)
───────────────────────────────────────── */
const STAGE_LABELS = {
  cold_call:          { icon: '📞', label: 'À appeler',     cls: 'stage-badge-cold' },
  to_recall:          { icon: '🔄', label: 'À rappeler',    cls: 'stage-badge-recall' },
  no_answer:          { icon: '📵', label: 'Pas répondu',   cls: 'stage-badge-noanswer' },
  meeting_to_set:     { icon: '📅', label: 'RDV à poser',   cls: 'stage-badge-meeting' },
  meeting_confirmed:  { icon: '✅', label: 'RDV confirmé',  cls: 'stage-badge-confirm' },
  closed:             { icon: '💰', label: 'Deal closé',    cls: 'stage-badge-closed' },
  refused:            { icon: '❌', label: 'Refusé',        cls: 'stage-badge-refused' },
};

function buildStageBadge(stage) {
  const s = STAGE_LABELS[stage];
  if (!s) return '';
  return `<span class="stage-badge ${s.cls}">${s.icon} ${s.label}</span>`;
}

const COACH_PHRASES = {
  cold_call: [
    "Spoiler : il va pas\nte rappeler tout seul 🙄",
    "Ta zone de confort,\nc'est là où les deals meurent 😂",
    "Chaque appel que tu fais,\nc'est un concurrent qui le fait pas 🏆",
    "Le téléphone c'est\nton arme secrète. DÉGAINE ! 🔫",
    "Il a un problème.\nT'as la solution. APPELLE ! 💥",
    "Les millionnaires ont commencé\npar des coups de fil. Vas-y 💰",
    "Ce prospect attend\nquelqu'un comme toi… Bouge ! 🚀",
    "Jordan a raté 9000 tirs.\nToi t'as même pas essayé 😤",
    "1 appel = 1 chance.\nZéro appel = zéro chance 🎯",
    "Il dort peut-être.\nOu il a juste besoin qu'on l'appelle 😴",
    "T'as peur de quoi ?\nIl peut pas te mordre au téléphone 😂",
    "Le deal de ta vie\nest peut-être dans cette liste 🤑",
  ],
  to_recall: [
    "Il était chaud.\nRappelle avant qu'il refroidisse ! 🔥",
    "T'as planté la graine.\nArrose-la maintenant 🌱",
    "Un rappel = un deal\npotentiel. Fais le math 🧮",
    "Il t'attend même\ns'il le sait pas encore 😏",
    "Les champions font\nle suivi. Les autres font pas 👑",
    "Tu l'as accroché.\nMaintenant ferme ! 🎣",
    "Chaque minute qui passe,\nil oublie qui t'es 😬",
    "Dans 10 ans tu te diras\n« j'aurais dû rappeler » 🤦",
  ],
  no_answer: [
    "La messagerie c'est\npas un non ! Réessaie 📵",
    "Statistiquement il faut\n8 tentatives. T'en es où ? 📊",
    "Il était peut-être\naux toilettes. Réessaie ! 🚽",
    "Les losers abandonnent\nau 1er essai. Toi non 💪",
    "Son téléphone existe.\nIl va finir par répondre 😅",
    "La persistance c'est\nce qui sépare les pros 🏆",
    "Il a juste pas vu\nton appel. Encore ! 🔔",
    "Thomas Edison a essayé\n1000 fois. T'as essayé combien ? 💡",
  ],
  meeting_to_set: [
    "Un RDV dans l'agenda =\nargent dans ta poche 💼",
    "Propose 2 créneaux.\nL'un des deux va marcher 📅",
    "T'es à 1 appel\nd'un deal. UN seul 🎯",
    "Il a dit oui à l'intérêt.\nMaintenant pose la date ! 🗓️",
    "Le RDV c'est 80%\ndu deal déjà fait 💰",
    "Pendant que tu lis ça,\nun concurrent appelle 😬",
  ],
  meeting_confirmed: [
    "Prépare ton meilleur pitch.\nC'est maintenant ou jamais 🎪",
    "Il a dit oui au RDV.\nFais-le dire oui au deal 💰",
    "Ferme dès qu'il accepte.\nLe silence est d'or 🤐",
    "T'es à deux doigts\nde fermer. Lâche rien ! 🏁",
    "Visualise la signature.\nPuis va la chercher 🖊️",
    "Ce RDV c'est\nton moment. Brille ! ✨",
  ],
  closed: [
    "Deal closé 🏆\nT'assures vraiment !",
    "CHAMPION ! 🥇\nPassons au prochain ?",
    "Compte les billets.\nPuis recommence 💸",
    "C'est ce qu'on fait\nquand on est bon 😎",
    "Mérite un café ☕\nCelui du gagnant !",
  ],
  refused: [
    "Pas grave.\nProchain !! 🚀",
    "Michael Jordan aussi\na été recalé. Suite ! 🏀",
    "Chaque refus te rapproche\ndu oui suivant 📈",
    "C'était pas le bon.\nLe bon arrive 🎯",
    "Statistiquement tu viens\nde te rapprocher d'un oui 😎",
    "Les meilleurs vendeurs\nont les plus de refus aussi 🏆",
  ],
};

function pickCoachPhrase(stage) {
  const pool = COACH_PHRASES[stage] || COACH_PHRASES.cold_call;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildSwipeActions(p) {
  return '';
}

function addSwipeHandler(card) {
  // Swipe disabled — cards stay fixed in place
  return;
}

function _renderSingleCard(p, wrap) {
  const card = document.createElement('div');
  card.className = 'prospect-card';
  card.id = 'pcard-' + p.id;
  card.dataset.stage = p.pipeline_stage;

  const actions  = buildMainAction(p);
  const address  = p.address || p.city || '';

  const metaParts = [];
  if (p.niche)    metaParts.push(`<span class="cm-tag" onclick="filterByNiche('${escAttr(nicheKey(p.niche))}')">${esc(p.niche)}</span>`);
  if (p.rating)   metaParts.push(`★ ${p.rating}${p.reviews ? ` (${p.reviews})` : ''}`);
  const heatScore = calcHeat(p);
  if (heatScore >= 6) metaParts.push('🔥🔥 Brûlant');
  else if (heatScore >= 3) metaParts.push('🔥 Chaud');
  if (!p.website_url) metaParts.push('🌐 Sans site');
  if (p.has_facebook === 0 && p.has_instagram === 0) metaParts.push('📵 Sans réseaux');
  if (p.instagram_handle) metaParts.push(`📸 @${esc(p.instagram_handle)}`);
  if (p.pipeline_stage === 'refused' && p.objection) metaParts.push(`❌ ${esc(p.objection)}`);
  const metaLine = metaParts.join(' · ');

  const mapsQuery = encodeURIComponent((p.name || '') + ' ' + address);
  const mapsUrl   = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const callBtnMobile = p.phone
    ? `<button class="card-call-btn-mobile" onclick="callProspect(${p.id})">📞 Appeler</button>`
    : '';

  const swipeActions = buildSwipeActions(p);
  const stageBadge   = buildStageBadge(p.pipeline_stage);
  const dateChip     = buildDateChip(p);

  const bulkCheckbox = bulkSelectMode
    ? `<div class="bulk-cb-wrap" style="position:absolute;top:12px;right:12px;z-index:10"><input type="checkbox" class="bulk-cb" id="bulk-cb-${p.id}" ${selectedIds.has(p.id) ? 'checked' : ''} onchange="toggleProspectSelection(${p.id}, this.checked)" style="width:22px;height:22px;accent-color:#E1306C;cursor:pointer"></div>`
    : '';
  const menuBtn = bulkSelectMode ? '' : `<button class="prospect-menu-btn" onclick="openProspectMenu(event, ${p.id})" title="Actions">⋮</button>`;
  if (selectedIds.has(p.id)) card.classList.add('prospect-card-selected');

  card.innerHTML = `
    <div class="card-swipe-actions">${swipeActions}</div>
    ${bulkCheckbox}
    ${menuBtn}
    <div class="card-inner" style="cursor:pointer">
      ${stageBadge}
      <div class="stage-journey" id="journey-${p.id}"></div>
      <div class="card-name" style="text-decoration:underline;text-decoration-color:rgba(225,48,108,.4);text-underline-offset:3px">${esc(p.name || '—')}</div>
      ${address ? `<div class="card-address">${esc(address)}</div>` : ''}
      <div class="card-meta-line">${metaLine}${dateChip}</div>
      <div class="card-links-row">
        <button class="card-link-btn card-fiche-btn" onclick="event.stopPropagation();openDetail(${p.id})" style="background:linear-gradient(135deg,#E1306C,#F77737);color:#fff;border:none;font-weight:800">👁️ Ouvrir fiche</button>
        <a class="card-link-btn" href="${escAttr(mapsUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📍 Google Maps</a>
        <button class="card-link-btn" onclick="event.stopPropagation();openDetail(${p.id});setTimeout(()=>switchModalTab('crm'),50)">📞 Historique</button>
      </div>
      <div class="card-actions">${actions}</div>
      ${callBtnMobile}
      ${p.notes ? `<div class="card-notes-row"><button class="notes-peek-btn" onclick="event.stopPropagation();toggleNotesPreview('c${p.id}', this)">📝 Notes</button><div class="notes-preview" id="notes-preview-c${p.id}" style="display:none">${esc(p.notes)}</div></div>` : ''}
    </div>
  `;
  // Make the whole card-inner clickable — opens the fiche. Inner buttons/links with event.stopPropagation() override.
  const inner = card.querySelector('.card-inner');
  if (inner) {
    inner.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input, .bulk-cb-wrap, .prospect-menu-btn')) return;
      openDetail(p.id);
    });
  }
  _loadStageJourney(p.id);
  wrap.appendChild(card);
  addSwipeHandler(card);
}

function renderCards(prospects) {
  const wrap = document.getElementById('cards-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  prospects.forEach(p => _renderSingleCard(p, wrap));
}

/* ─────────────────────────────────────────
   MOVE STAGE (optimistic)
───────────────────────────────────────── */
/* ─────────────────────────────────────────
   OBJECTION MODAL
───────────────────────────────────────── */
let _objectionTargetId = null;
let _objectionValue    = '';
let _stageTargetId     = null;
let _stageTargetStage  = null;

let _dealTargetId = null;
let _dealType = ''; let _dealRec = '';

function _restoreCard(id) {
  const cardEl = document.getElementById('pcard-' + id);
  if (cardEl) {
    cardEl.style.opacity = '';
    cardEl.style.transform = '';
    cardEl.style.pointerEvents = '';
    cardEl.style.transition = '';
  }
}

let _stageTargetRecallType = null;

function moveStage(id, stage, recallType) {
  // Fade-out immédiat de la carte pour éviter l'effet "bouton collé" iOS
  const cardEl = document.getElementById('pcard-' + id);
  if (cardEl) {
    cardEl.style.transition = 'opacity .15s, transform .15s';
    cardEl.style.opacity = '0.15';
    cardEl.style.transform = 'scale(0.97)';
    cardEl.style.pointerEvents = 'none';
  }
  if (stage === 'refused') {
    _objectionTargetId = id;
    _objectionValue    = '';
    document.querySelectorAll('.obj-chip').forEach(c => c.classList.remove('obj-chip-selected'));
    document.getElementById('objection-input').value = '';
    document.getElementById('objection-overlay').style.display = 'flex';
    return;
  }
  if (stage === 'closed') {
    _dealTargetId = id; _dealType = ''; _dealRec = '';
    document.querySelectorAll('.deal-chip').forEach(c => c.classList.remove('deal-chip-selected'));
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('deal-date-input').value = today;
    document.getElementById('deal-modal-overlay').style.display = 'flex';
    return;
  }
  if (stage === 'to_recall' || stage === 'meeting_to_set' || stage === 'meeting_confirmed') {
    _stageTargetId    = id;
    _stageTargetStage = stage;
    _stageTargetRecallType = recallType || null;
    const isRecall = stage === 'to_recall';
    const isNoTime = isRecall && recallType === 'no_time';
    document.getElementById('stage-modal-title').textContent       = isNoTime ? '⏰ À Rappeler (pas le temps) — date & heure' : (isRecall ? '🔥 Intéressé — RDV à poser' : '📅 Rendez-vous — date & heure');
    document.getElementById('stage-modal-confirm-btn').textContent = isRecall ? 'Enregistrer le rappel' : 'Confirmer le RDV';
    document.getElementById('stage-time-optional').style.display   = isRecall ? '' : 'none';
    document.getElementById('stage-date-input').value  = '';
    document.getElementById('stage-time-input').value  = '';
    document.getElementById('stage-notes-input').value = '';
    document.querySelectorAll('.date-shortcut').forEach(b => b.classList.remove('date-shortcut-active'));
    document.getElementById('stage-modal-overlay').style.display = 'flex';
    return;
  }
  _doMoveStage(id, stage, null, null, null, null);
}

function setDateShortcut(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  document.getElementById('stage-date-input').value = `${yyyy}-${mm}-${dd}`;
  document.querySelectorAll('.date-shortcut').forEach(b => b.classList.remove('date-shortcut-active'));
  event.target.classList.add('date-shortcut-active');
}

function closeStageModal() {
  document.getElementById('stage-modal-overlay').style.display = 'none';
  if (_stageTargetId) _restoreCard(_stageTargetId);
  _stageTargetId = null; _stageTargetStage = null; _stageTargetRecallType = null;
}

function confirmStageModal() {
  if (!_stageTargetId) return;
  // Capture before closeStageModal() nulls them
  const id         = _stageTargetId;
  const stage      = _stageTargetStage;
  const recallType = _stageTargetRecallType;
  const date       = document.getElementById('stage-date-input').value;
  const time       = document.getElementById('stage-time-input').value;
  const notes      = document.getElementById('stage-notes-input').value.trim();
  const isRecall   = stage === 'to_recall';
  const datetime   = date ? (time ? `${date} ${time}` : date) : null;

  // Obliger une date pour les rappels et RDV
  if (!datetime) {
    const msg = isRecall ? 'Choisis une date pour le rappel !' : 'Choisis une date pour le RDV !';
    showToast(msg, 'warning');
    // Reopen modal
    _stageTargetId = id;
    _stageTargetStage = stage;
    _stageTargetRecallType = recallType;
    document.getElementById('stage-modal-overlay').style.display = 'flex';
    return;
  }

  closeStageModal();
  if (isRecall) {
    _doMoveStage(id, 'to_recall', null, datetime, null, notes || null, null, null, null, null, recallType);
  } else {
    _doMoveStage(id, stage, null, null, datetime, notes || null);
  }
}

function selectObjChip(btn) {
  document.querySelectorAll('.obj-chip').forEach(c => c.classList.remove('obj-chip-selected'));
  btn.classList.add('obj-chip-selected');
  document.getElementById('objection-input').value = '';
  const preview = document.getElementById('objection-custom-preview');
  if (preview) preview.style.display = 'none';
  _objectionValue = btn.textContent;
}

function onObjInput(input) {
  document.querySelectorAll('.obj-chip').forEach(c => c.classList.remove('obj-chip-selected'));
  const val = input.value.trim();
  _objectionValue = val ? '⚡ ' + val : '';
  const preview = document.getElementById('objection-custom-preview');
  if (preview) {
    if (val) {
      preview.style.display = 'block';
      preview.innerHTML = `<span class="obj-chip obj-chip-pro obj-chip-selected">⚡ ${esc(val)}</span>`;
    } else {
      preview.style.display = 'none';
    }
  }
}

function closeObjectionModal() {
  document.getElementById('objection-overlay').style.display = 'none';
  if (_objectionTargetId) _restoreCard(_objectionTargetId);
  _objectionTargetId = null;
}

function confirmObjection() {
  if (!_objectionTargetId) return;
  const id  = _objectionTargetId; // capture AVANT close qui null l'id
  const obj = _objectionValue || document.getElementById('objection-input').value.trim() || 'Non précisé';
  closeObjectionModal();
  _doMoveStage(id, 'refused', obj, null, null, null);
}

async function _doMoveStage(id, stage, objection, rappel, meeting_date, notes, deal_type, deal_date, deal_recurrence, deal_value, recall_type) {
  const prospect = allProspects.find(p => p.id === id);
  if (!prospect) return;

  const oldStage = prospect.pipeline_stage;
  prospect.pipeline_stage = stage;
  if (objection)       prospect.objection       = objection;
  if (rappel)          prospect.rappel          = rappel;
  if (meeting_date)    prospect.meeting_date    = meeting_date;
  if (notes)           prospect.notes           = notes;
  if (deal_type)       prospect.deal_type       = deal_type;
  if (deal_date)       prospect.deal_date       = deal_date;
  if (deal_recurrence) prospect.deal_recurrence = deal_recurrence;
  if (deal_value)      prospect.deal_value      = deal_value;
  if (stage === 'to_recall') prospect.recall_type = recall_type || 'interested';
  else prospect.recall_type = null;
  updateBadges();
  // Délai iOS : évite que le touch state colle sur la prochaine carte (400ms = iOS safe)
  setTimeout(() => renderList(), 400);

  const body = { stage };
  if (objection)       body.objection       = objection;
  if (rappel)          body.rappel          = rappel;
  if (meeting_date)    body.meeting_date    = meeting_date;
  if (notes)           body.notes           = notes;
  if (deal_type)       body.deal_type       = deal_type;
  if (deal_date)       body.deal_date       = deal_date;
  if (deal_recurrence) body.deal_recurrence = deal_recurrence;
  if (deal_value)      body.deal_value      = deal_value;
  if (recall_type)     body.recall_type     = recall_type;
  const res = await apiPut(`/api/prospects/${id}/stage`, body);
  if (!res || !res.ok) {
    prospect.pipeline_stage = oldStage;
    updateBadges();
    renderList();
    showToast((res && res.error) || 'Erreur lors du déplacement.', 'error');
    return;
  }

  const stageMessages = {
    to_recall:          '🔄 Déplacé vers À Rappeler',
    meeting_to_set:     '📅 Rendez-vous à poser !',
    meeting_confirmed:  '✅ RDV confirmé !',
    closed:             '💰 CLOSÉ ! Bravo !',
    refused:            `❌ Refus enregistré${objection ? ' — ' + objection : ''}.`,
    cold_call:          '↩️ Remis en Cold Call.',
  };
  const isSuccess = stage === 'closed';
  showToast(stageMessages[stage] || 'Étape mise à jour.', isSuccess ? 'success' : 'info');

  if (stage === 'closed') launchConfetti();
}

/* ── DEAL MODAL ── */
function selectDealChip(group, btn, val) {
  const selector = group === 'type' ? '#deal-type-chips .deal-chip' : '#deal-rec-chips .deal-chip';
  document.querySelectorAll(selector).forEach(c => c.classList.remove('deal-chip-selected'));
  btn.classList.add('deal-chip-selected');
  if (group === 'type') _dealType = val; else _dealRec = val;
}
function closeDealModal() {
  document.getElementById('deal-modal-overlay').style.display = 'none';
  if (_dealTargetId) _restoreCard(_dealTargetId);
  _dealTargetId = null;
}
function confirmDeal() {
  if (!_dealTargetId) return;
  const id        = _dealTargetId;
  const dealDate  = document.getElementById('deal-date-input').value;
  const dealValue = parseFloat(document.getElementById('deal-value-input')?.value) || null;
  closeDealModal();
  _doMoveStage(id, 'closed', null, null, null, null, _dealType || null, dealDate || null, _dealRec || null, dealValue);
}

/* ── CALL ATTEMPTS ── */
let _attemptType = ''; let _attemptResult = '';

function selectAttemptChip(group, btn) {
  const cls = group === 'type' ? '.attempt-type-chip' : '.attempt-result-chip';
  document.querySelectorAll(cls).forEach(c => c.classList.remove('chip-selected'));
  btn.classList.add('chip-selected');
  if (group === 'type') _attemptType = btn.dataset.val;
  else _attemptResult = btn.dataset.val;
}

// ── Voice recorder state ──
let _voiceMediaRecorder = null;
let _voiceChunks = [];
let _voiceBlob = null;
let _voiceBase64 = '';
let _voiceDuration = 0;
let _voiceTimerInterval = null;
let _voiceStartTime = 0;
// Per-prospect voice storage (survives navigation between prospects)
const _voiceStore = {}; // { prospectId: { blob, base64, duration } }

// ── Call recorder state ──
let _callRec = { active: false, prospectId: null, stream: null, recorder: null, chunks: [], startTime: 0, timerInterval: null };

async function toggleVoiceRec() {
  if (_voiceMediaRecorder && _voiceMediaRecorder.state === 'recording') {
    stopVoiceRec(); return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _voiceChunks = [];
    _voiceMediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
    _voiceMediaRecorder.ondataavailable = e => { if (e.data.size > 0) _voiceChunks.push(e.data); };
    _voiceMediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      _voiceBlob = new Blob(_voiceChunks, { type: 'audio/webm' });
      _voiceDuration = Math.round((Date.now() - _voiceStartTime) / 1000);
      const reader = new FileReader();
      reader.onloadend = () => {
        _voiceBase64 = reader.result;
        const audioEl = document.getElementById('voice-rec-audio');
        audioEl.src = URL.createObjectURL(_voiceBlob);
        document.getElementById('voice-rec-preview').style.display = 'flex';
      };
      reader.readAsDataURL(_voiceBlob);
    };
    _voiceMediaRecorder.start(250);
    _voiceStartTime = Date.now();
    document.getElementById('voice-rec-btn').style.display = 'none';
    document.getElementById('voice-rec-active').style.display = 'flex';
    _voiceTimerInterval = setInterval(() => {
      const secs = Math.round((Date.now() - _voiceStartTime) / 1000);
      const m = Math.floor(secs / 60), s = secs % 60;
      document.getElementById('voice-rec-timer').textContent = `${m}:${String(s).padStart(2,'0')}`;
      if (secs >= 120) stopVoiceRec(); // Max 2 min
    }, 500);
  } catch (err) {
    showToast('Micro non disponible — autorise l\'accès', 'error');
  }
}

function stopVoiceRec() {
  if (_voiceMediaRecorder && _voiceMediaRecorder.state === 'recording') _voiceMediaRecorder.stop();
  clearInterval(_voiceTimerInterval);
  document.getElementById('voice-rec-active').style.display = 'none';
  document.getElementById('voice-rec-btn').style.display = 'flex';
}

function deleteVoiceRec() {
  // Also remove from per-prospect store
  if (currentProspect && _voiceStore[currentProspect.id]) delete _voiceStore[currentProspect.id];
  _voiceBlob = null; _voiceBase64 = ''; _voiceDuration = 0;
  const preview = document.getElementById('voice-rec-preview');
  if (preview) preview.style.display = 'none';
  const audio = document.getElementById('voice-rec-audio');
  if (audio) audio.src = '';
}

function _saveVoiceToStore() {
  if (currentProspect && _voiceBase64) {
    _voiceStore[currentProspect.id] = { blob: _voiceBlob, base64: _voiceBase64, duration: _voiceDuration };
  }
}

function _restoreVoiceFromStore(prospectId) {
  _voiceBlob = null; _voiceBase64 = ''; _voiceDuration = 0;
  const preview = document.getElementById('voice-rec-preview');
  const audio = document.getElementById('voice-rec-audio');
  if (_voiceStore[prospectId]) {
    const s = _voiceStore[prospectId];
    _voiceBlob = s.blob; _voiceBase64 = s.base64; _voiceDuration = s.duration;
    if (audio) audio.src = s.blob ? URL.createObjectURL(s.blob) : '';
    if (preview) preview.style.display = 'flex';
  } else {
    if (preview) preview.style.display = 'none';
    if (audio) audio.src = '';
  }
}

/* ─────────────────────────────────────────
   CALL RECORDER — record call via speakerphone
───────────────────────────────────────── */
async function callProspect(id) {
  const p = allProspects.find(x => x.id === id);
  if (!p || !p.phone) return;

  // Store which prospect we're calling (kept for downstream use)
  _callRec.prospectId = id;

  // Dial synchronously (works on iOS)
  _dialSync(p.phone);
  // No auto-open of the prospect modal anymore — user opens it manually if needed.
}

// Synchronous tel: navigation via hidden anchor (preserves iOS user gesture context)
function _dialSync(phone) {
  const a = document.createElement('a');
  a.href = `tel:${phone}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function _onCallVisibilityChange() {
  if (document.visibilityState === 'visible' && _callRec.active) {
    // User returned to the app — show a toast reminder but DON'T auto-stop
    // The user must click the Stop button manually when the call is truly over
    const secs = Math.round((Date.now() - _callRec.startTime) / 1000);
    if (secs < 3) return; // Ignore quick bounces (iOS dialer preview)
    showToast('📞 Appel en cours — appuie sur Stop quand tu raccroches', 'info');
  }
}

function _stopCallRec() {
  if (!_callRec.active) return;
  clearInterval(_callRec.timerInterval);
  try { if (_callRec.recorder && _callRec.recorder.state === 'recording') _callRec.recorder.stop(); } catch (e) {}
  try { _callRec.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  _hideCallRecIndicator();
}

function stopCallRecEarly() {
  document.removeEventListener('visibilitychange', _onCallVisibilityChange);
  _stopCallRec();
}

function _onCallRecordStop() {
  const { chunks, startTime } = _callRec;
  _callRec.active = false;

  if (!chunks.length) return;

  const blob = new Blob(chunks, { type: 'audio/webm' });
  const duration = Math.round((Date.now() - startTime) / 1000);

  const reader = new FileReader();
  reader.onloadend = () => {
    // Save into voice recorder state so logAttempt() picks it up if user opens the prospect
    _voiceBase64 = reader.result;
    _voiceDuration = duration;
    _voiceBlob = blob;
    // No auto-open of the prospect modal anymore — just a discrete toast.
    const m = Math.floor(duration / 60), s = duration % 60;
    showToast(`📞 Appel terminé (${m}:${String(s).padStart(2, '0')})`, 'success');
  };
  reader.readAsDataURL(blob);
}

function _showCallRecIndicator(name) {
  let el = document.getElementById('call-rec-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'call-rec-indicator';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <span class="call-rec-dot"></span>
    <span class="call-rec-info">🎙️ Enregistrement · <b>${esc(name)}</b> · <span id="call-rec-timer">0:00</span></span>
    <button class="call-rec-stop-btn" onclick="stopCallRecEarly()">⏹️ Stop</button>
  `;
  el.style.display = 'flex';
}

function _hideCallRecIndicator() {
  const el = document.getElementById('call-rec-indicator');
  if (el) el.style.display = 'none';
}

async function logAttempt() {
  if (!currentProspect) return;
  if (!_attemptType)   return showToast('Choisis un type de contact', 'error');
  if (!_attemptResult) return showToast('Choisis un résultat', 'error');
  const note = document.getElementById('attempt-note').value.trim();
  const body = { attempt_type: _attemptType, result: _attemptResult, note };
  if (_voiceBase64) { body.audio_data = _voiceBase64; body.audio_duration = _voiceDuration; }
  const res = await apiPost(`/api/prospects/${currentProspect.id}/attempts`, body);
  if (!res || res.error) return showToast(res?.error || 'Erreur', 'error');
  const lastResult = _attemptResult;
  document.getElementById('attempt-note').value = '';
  deleteVoiceRec();
  _attemptType = ''; _attemptResult = '';
  document.querySelectorAll('.attempt-type-chip,.attempt-result-chip').forEach(c => c.classList.remove('chip-selected'));
  showToast('Contact loggué ✅', 'success');
  loadAttempts(currentProspect.id);
  // Suggérer de passer en no_answer après 3 sans réponse
  if (lastResult === 'no_answer' && currentProspect.pipeline_stage !== 'no_answer') {
    const allAttempts = await apiGet(`/api/prospects/${currentProspect.id}/attempts`);
    if (allAttempts) {
      const noAnswerCount = allAttempts.filter(a => a.result === 'no_answer').length;
      if (noAnswerCount >= 3) {
        showToast(`📵 ${noAnswerCount}× sans réponse — clic sur "Pas répondu" pour déplacer.`, 'warn', 6000);
      }
    }
  }
}

async function loadAttempts(prospectId) {
  const attempts = await apiGet(`/api/prospects/${prospectId}/attempts`);
  const el = document.getElementById('attempt-list');
  if (!el) return;
  const TYPE_ICON   = { call:'📞', sms:'💬', email:'📧', dm:'📱' };
  const RESULT_LABEL = { no_answer:'Pas répondu', voicemail:'Messagerie', callback:'Rappel demandé', positive:'Positif ✅', negative:'Négatif ❌' };
  if (!attempts || !attempts.length) {
    el.innerHTML = '<div class="activity-empty">Aucun contact loggué.</div>'; return;
  }
  const callCount = attempts.filter(a => a.attempt_type === 'call').length;
  const totalDuration = attempts.reduce((sum, a) => sum + (a.audio_duration || 0), 0);
  const totalMin = Math.floor(totalDuration / 60), totalSec = totalDuration % 60;

  let headerHtml = `<div class="attempt-stats">
    <span>📊 ${attempts.length} contact${attempts.length > 1 ? 's' : ''}</span>
    ${callCount ? `<span>📞 ${callCount} appel${callCount > 1 ? 's' : ''}</span>` : ''}
    ${totalDuration ? `<span>⏱️ ${totalMin}:${String(totalSec).padStart(2,'0')} total</span>` : ''}
  </div>`;

  el.innerHTML = headerHtml + attempts.map(a => {
    const d = new Date(a.created_at);
    const when = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const durLabel = a.audio_duration ? ` · ${Math.floor(a.audio_duration/60)}:${String(a.audio_duration%60).padStart(2,'0')}` : '';
    const audioHtml = a.audio_data ? `<div class="attempt-audio"><audio src="${a.audio_data}" controls preload="none" style="width:100%;height:32px"></audio><span class="attempt-audio-dur">${a.audio_duration}s</span></div>` : '';
    const noteHtml = a.note
      ? `<div class="attempt-note-line"><em>${esc(a.note)}</em></div>`
      : `<div class="attempt-note-line attempt-note-empty"><em>Aucune note</em></div>`;
    return `<div class="attempt-row">
      <span class="attempt-icon">${TYPE_ICON[a.attempt_type] || '📞'}</span>
      <span class="attempt-info">
        <div class="attempt-info-top"><strong>${RESULT_LABEL[a.result] || a.result}</strong>${durLabel}</div>
        ${noteHtml}
        ${audioHtml}
      </span>
      <span class="attempt-actions">
        <button class="attempt-edit-btn" onclick="editAttemptNote(${a.id}, ${currentProspect ? currentProspect.id : 'null'})" title="Modifier la note">✏️</button>
        <span class="attempt-date">${when}</span>
      </span>
    </div>`;
  }).join('');
}

// Edit a note on an existing attempt
async function editAttemptNote(attemptId, prospectId) {
  if (!attemptId || !prospectId) return;
  // Fetch existing note
  const all = await apiGet(`/api/prospects/${prospectId}/attempts`);
  const cur = all && all.find(x => x.id === attemptId);
  const existingNote = (cur && cur.note) || '';
  const newNote = window.prompt('📝 Modifier la note de ce contact :', existingNote);
  if (newNote === null) return; // cancelled
  const res = await apiPatch(`/api/prospects/${prospectId}/attempts/${attemptId}`, { note: newNote });
  if (!res || res.error) {
    showToast(res?.error || 'Erreur lors de la sauvegarde', 'error');
    return;
  }
  showToast('✅ Note mise à jour', 'success');
  loadAttempts(prospectId);
}

async function _loadStageJourney(prospectId) {
  const el = document.getElementById(`journey-${prospectId}`);
  if (!el) return;
  try {
    const data = await apiGet(`/api/prospects/${prospectId}/stage-history`);
    if (!data || !data.history || data.history.length === 0) {
      el.style.display = 'none'; return;
    }
    // Build unique ordered stages: first stage → ... → current
    const stages = [data.history[0].from_stage];
    data.history.forEach(h => {
      if (stages[stages.length - 1] !== h.to_stage) stages.push(h.to_stage);
    });
    const MINI_LABEL = {
      cold_call: '📞', to_recall: '🔄', no_answer: '📵',
      meeting_to_set: '📅', meeting_confirmed: '✅', closed: '💰', refused: '❌'
    };
    const MINI_NAME = {
      cold_call: 'Appel', to_recall: 'Rappel', no_answer: 'Pas rép.',
      meeting_to_set: 'RDV', meeting_confirmed: 'Confirmé', closed: 'Closé', refused: 'Refusé'
    };
    el.innerHTML = stages.map((s, i) => {
      const isLast = i === stages.length - 1;
      return `<span class="journey-step ${isLast ? 'journey-current' : ''}">${MINI_LABEL[s] || ''} ${MINI_NAME[s] || s}</span>${!isLast ? '<span class="journey-arrow">→</span>' : ''}`;
    }).join('');
    el.style.display = 'flex';
  } catch (_) {
    el.style.display = 'none';
  }
}

function toggleNotesPreview(id, btn) {
  const el = document.getElementById(`notes-preview-${id}`);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? '' : 'none';
  btn.textContent = open ? '📝 Masquer' : '📝 Notes';
}

/* ─────────────────────────────────────────
   DELETE PROSPECT
───────────────────────────────────────── */
async function deleteProspect(id) {
  if (!confirm('Supprimer ce prospect définitivement ?')) return;
  const res = await apiDelete(`/api/prospects/${id}`);
  if (res && res.ok) {
    allProspects = allProspects.filter(p => p.id !== id);
    updateBadges();
    renderList();
    showToast('Prospect supprimé.', 'info');
  } else {
    showToast('Erreur lors de la suppression.', 'error');
  }
}

/* ─────────────────────────────────────────
   COPY PHONE
───────────────────────────────────────── */
function copyPhone(phone, event) {
  if (event) event.stopPropagation();
  navigator.clipboard.writeText(phone).then(() => {
    showToast(`📋 ${phone} copié !`, 'success', 2000);
  }).catch(() => {
    showToast('Impossible de copier.', 'error');
  });
}

/* ─────────────────────────────────────────
   DETAIL MODAL
───────────────────────────────────────── */
function openDetail(id) {
  const p = allProspects.find(x => x.id === id);
  if (!p) return;

  // Save current prospect's voice recording before switching
  _saveVoiceToStore();
  currentProspect = p;

  // Restore voice recording for this prospect (if any)
  _restoreVoiceFromStore(id);

  document.getElementById('detail-name').textContent = p.name || '—';
  document.getElementById('detail-meta').textContent =
    [p.city, p.niche].filter(Boolean).join(' · ') || p.address || '';

  buildDetailInfo(p);

  // Auto-enrich in background if not already enriched (PRO only, to avoid wasting credits on free users who can't see data anyway)
  const isProUser = userPlan === 'pro' || userPlan === 'admin';
  if (isProUser && !p.enriched_at && !p._autoEnrichAttempted) {
    p._autoEnrichAttempted = true; // prevent re-triggering on the same session
    // fire-and-forget — enrichProspect updates the UI itself when done
    setTimeout(() => { if (currentProspect && currentProspect.id === id) enrichProspect(id); }, 100);
  }

  const notesEl  = document.getElementById('m-notes');
  const rappelEl = document.getElementById('m-rappel');
  const ownerEl  = document.getElementById('m-owner');
  const emailEl  = document.getElementById('m-email');
  if (notesEl)  notesEl.value  = p.notes      || '';
  if (rappelEl) rappelEl.value = p.rappel      || '';
  if (ownerEl)  ownerEl.value  = p.owner_name || '';
  if (emailEl)  emailEl.value  = p.email       || '';

  const savedEl = document.getElementById('crm-saved');
  if (savedEl) savedEl.style.display = 'none';

  switchModalTab('info');
  loadAttempts(p.id);

  const overlay = document.getElementById('detail-overlay');
  if (overlay) overlay.classList.add('open');
}

function closeDetailModal() {
  const overlay = document.getElementById('detail-overlay');
  if (overlay) overlay.classList.remove('open');
  currentProspect = null;
}

function buildDetailInfo(p) {
  const c = document.getElementById('detail-info-content');
  if (!c) return;

  const isPro = userPlan === 'pro' || userPlan === 'admin';
  const signals = buildSignals(p);
  const stageBadge = `<span class="stage-badge ${STAGE_CLASS[p.pipeline_stage]}">${STAGE_LABEL[p.pipeline_stage] || p.pipeline_stage}</span>`;

  // Helper: blur phone for free users
  function blurPhone(ph) {
    if (!ph) return '—';
    if (isPro) return esc(ph);
    // Show first 4 chars, blur rest
    const clean = ph.replace(/\s/g, '');
    return esc(clean.substring(0, 4)) + '<span style="filter:blur(4px);user-select:none;color:var(--muted)"> ' + clean.substring(4).replace(/./g, '█') + '</span>';
  }

  // Helper: lock badge for PRO features
  function lockBadge(label) {
    if (isPro) return '';
    return `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(249,115,22,.1);color:#f97316;font-size:.7rem;font-weight:800;padding:2px 8px;border-radius:6px;margin-left:6px;cursor:pointer" onclick="showUpgradeModal()">🔒 PRO</span>`;
  }

  // Score badge
  let scoreBadge = '';
  if (p.enriched_at && p.score != null) {
    const sc = p.score || 0;
    const scColor = sc >= 70 ? '#22c55e' : sc >= 40 ? '#f97316' : '#6b7280';
    scoreBadge = `<div style="position:absolute;top:12px;right:12px;background:${scColor}20;color:${scColor};font-size:1.1rem;font-weight:900;padding:6px 12px;border-radius:10px;border:1.5px solid ${scColor}40">${sc}<span style="font-size:.7rem;opacity:.7">/100</span></div>`;
  }

  let html = `<div style="position:relative">${scoreBadge}`;

  // === BASIC INFO (visible to all) ===
  html += `
    <div class="detail-grid" style="margin-bottom:1rem;">
      <div class="detail-item">
        <div class="detail-label">Entreprise</div>
        <div class="detail-value" style="font-weight:700;font-size:1rem">${esc(p.name || '—')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Niche / Secteur</div>
        <div class="detail-value">${esc(p.secteur_naf || p.niche || '—')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Ville</div>
        <div class="detail-value">${esc(p.city || p.address || '—')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Étape pipeline</div>
        <div class="detail-value">${stageBadge}</div>
      </div>
    </div>
  `;

  // === PRO SECTION: Dirigeant ===
  html += `<div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:14px;margin-bottom:1rem">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
      <span style="font-size:.85rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2)">👤 Dirigeant</span>
      ${lockBadge('dirigeant')}
    </div>`;

  if (p.enriched_at) {
    const hasDirigeant = !!(p.dirigeant_prenom || p.dirigeant_nom);
    const dirigeantDisplay = hasDirigeant
      ? esc(((p.dirigeant_prenom || '') + ' ' + (p.dirigeant_nom || '')).trim())
      : '<span style="color:var(--muted);font-style:italic">Non publié sur Pappers</span>';
    html += `<div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Nom</div><div class="detail-value" style="font-weight:700">${isPro ? dirigeantDisplay : '<span style="filter:blur(5px);user-select:none">Prénom Nom</span>'}</div></div>
      <div class="detail-item"><div class="detail-label">Rôle</div><div class="detail-value">${isPro ? esc(p.dirigeant_role || '—') : '<span style="filter:blur(5px);user-select:none">Président</span>'}</div></div>
      <div class="detail-item"><div class="detail-label">Effectif</div><div class="detail-value">${isPro ? esc(p.effectif || '—') : '<span style="filter:blur(5px);user-select:none">10-19</span>'}</div></div>
      <div class="detail-item"><div class="detail-label">SIREN</div><div class="detail-value">${isPro ? esc(p.siren || '—') : '<span style="filter:blur(5px);user-select:none">123456789</span>'}</div></div>
    </div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn-action-sm" onclick="enrichProspect(${p.id})" id="btn-enrich-${p.id}" style="background:rgba(249,115,22,.15);color:#f97316;border:1px solid rgba(249,115,22,.3);font-size:.75rem">🔄 Re-enrichir</button>
    </div>`;
  } else if (isPro) {
    // PRO user, not yet enriched → auto-enrich kicks in on openDetail, show loading state
    html += `<div style="text-align:center;padding:12px;color:var(--text2);font-size:.85rem">
      <button class="btn-action-sm" id="btn-enrich-${p.id}" disabled style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;border:none;border-radius:10px;font-weight:800;font-size:.9rem;cursor:pointer;opacity:.85">
        ⏳ Enrichissement auto...
      </button>
      <div style="margin-top:6px;font-size:.75rem;color:var(--muted)">Recherche du dirigeant, SIREN, effectif, CA, téléphone Pappers</div>
    </div>`;
  } else {
    html += `<div style="text-align:center;padding:12px;color:var(--text2);font-size:.85rem">
      <button class="btn-action-sm" onclick="showUpgradeModal()" id="btn-enrich-${p.id}" style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;border:none;border-radius:10px;font-weight:800;font-size:.9rem;cursor:pointer">
        🔒 Enrichir (PRO)
      </button>
      <div style="margin-top:6px;font-size:.75rem;color:var(--muted)">Trouve dirigeant, SIREN, effectif, CA, téléphone Pappers</div>
    </div>`;
  }
  html += `</div>`;

  // === PRO SECTION: Contact ===
  html += `<div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:14px;margin-bottom:1rem">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
      <span style="font-size:.85rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2)">📞 Contact</span>
      ${lockBadge('contact')}
    </div>
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">Tél. Google Maps</div>
        <div class="detail-value">${p.phone ? blurPhone(p.phone) + (isPro ? ' <span style="color:#22c55e;font-size:.7rem;font-weight:700">✓ Vérifié</span>' : '') : '—'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Tél. Pappers (siège)</div>
        <div class="detail-value">${p.phone_pappers ? blurPhone(p.phone_pappers) + (isPro ? ' <span style="color:#22c55e;font-size:.7rem;font-weight:700">✓ Vérifié</span>' : '') : (p.enriched_at ? '—' : '<span style="color:var(--muted);font-size:.8rem">Enrichir pour trouver</span>')}</div>
      </div>
    </div>`;

  // CA section
  html += `<div class="detail-grid" style="margin-top:.6rem">
    <div class="detail-item">
      <div class="detail-label">Chiffre d'affaires ${lockBadge('ca')}</div>
      <div class="detail-value">${p.chiffre_affaires && isPro
        ? '<span style="font-weight:800;color:#22c55e;font-size:1.05rem">' + esc(parseInt(p.chiffre_affaires).toLocaleString('fr-FR')) + ' €</span>'
        : (p.chiffre_affaires ? '<span style="filter:blur(6px);user-select:none;font-weight:800">1 250 000 €</span>' : '—')}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Note Google</div>
      <div class="detail-value">${p.rating ? `⭐ ${p.rating} (${p.reviews || 0} avis)` : '—'}</div>
    </div>
  </div>`;
  html += `</div>`;

  // === Signals ===
  if (signals) {
    html += `<div style="margin-bottom:1rem;">
      <div class="detail-label" style="margin-bottom:.5rem;">Signaux</div>
      <div style="display:flex;gap:.3rem;flex-wrap:wrap;">${signals}</div>
    </div>`;
  }

  // === Site web ===
  if (p.website_url) {
    html += `<div class="detail-item" style="margin-bottom:.75rem;">
      <div class="detail-label">Site web</div>
      <div class="detail-value"><a href="${escAttr(p.website_url)}" target="_blank" rel="noopener" style="color:var(--stage-cold)">🌐 ${esc(p.website_url)}</a></div>
    </div>`;
  } else {
    html += `<div class="detail-item" style="margin-bottom:.75rem;">
      <div class="detail-label">Site web</div>
      <div class="detail-value"><span style="color:#f97316;font-weight:700;font-size:.85rem">❌ Aucun site — opportunité refonte</span></div>
    </div>`;
  }

  if (p.instagram_handle) {
    html += `<div class="detail-item" style="margin-bottom:.75rem;">
      <div class="detail-label">Instagram</div>
      <div class="detail-value"><a href="https://www.instagram.com/${escAttr(p.instagram_handle)}/" target="_blank" rel="noopener" style="color:#E1306C;font-weight:600;">📸 @${esc(p.instagram_handle)}</a></div>
    </div>`;
  }

  // === ACTION BUTTONS (PRO) ===
  html += `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">`;

  // LinkedIn button — direct LinkedIn (pas Google)
  if (p.linkedin_url && isPro) {
    html += `<a class="btn-action-sm" href="${escAttr(p.linkedin_url)}" target="_blank" rel="noopener" style="background:rgba(10,102,194,.15);color:#0a66c2;border-color:rgba(10,102,194,.3);font-weight:700">🔗 LinkedIn</a>`;
  } else {
    const liKeywords = escAttr((p.owner_name || p.name || '').trim());
    const liType = p.owner_name ? 'people' : 'companies';
    html += `<button class="btn-action-sm" ${isPro ? `onclick="window.open('https://www.linkedin.com/search/results/${liType}/?keywords='+encodeURIComponent('${liKeywords}')+'&origin=GLOBAL_SEARCH_HEADER', '_blank')"` : `onclick="showUpgradeModal()"`} style="${isPro ? 'background:rgba(10,102,194,.15);color:#0a66c2;border-color:rgba(10,102,194,.3)' : 'opacity:.6'}">🔗 LinkedIn ${isPro ? '' : '🔒'}</button>`;
  }

  // Google Maps
  html += `<a class="btn-action-sm" href="https://www.google.com/maps/search/${encodeURIComponent(p.name + ' ' + (p.city || p.address || ''))}" target="_blank" rel="noopener" style="background:rgba(234,67,53,.1);color:#ea4335;border-color:rgba(234,67,53,.25)">📍 Google Maps</a>`;

  // Phone actions (only if PRO)
  if (p.phone && isPro) {
    const waPhone = p.phone.replace(/\\D/g, '');
    const intlWa = waPhone.startsWith('33') ? waPhone : waPhone.startsWith('0') ? '33' + waPhone.slice(1) : waPhone;
    html += `<a class="btn-action-sm btn-wa-sm" href="https://wa.me/${intlWa}" target="_blank" rel="noopener">💬 WhatsApp</a>`;
    html += `<a class="btn-action-sm btn-sms-sm" href="sms:${escAttr(p.phone)}">📱 SMS</a>`;
  } else if (p.phone && !isPro) {
    html += `<button class="btn-action-sm" onclick="showUpgradeModal()" style="opacity:.6">💬 WhatsApp 🔒</button>`;
    html += `<button class="btn-action-sm" onclick="showUpgradeModal()" style="opacity:.6">📱 SMS 🔒</button>`;
  }

  html += `</div>`;

  // === Ajouté le ===
  html += `<div style="font-size:.75rem;color:var(--muted);margin-top:.5rem">Ajouté le ${p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : '—'}</div>`;

  html += `</div>`;
  c.innerHTML = html;
}

// Enrich prospect via Pappers API
async function enrichProspect(id) {
  const btn = document.getElementById('btn-enrich-' + id);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Enrichissement...'; }
  try {
    const res = await apiPost('/api/prospects/' + id + '/enrich');
    if (res.error) {
      if (res.upgrade) { showUpgradeModal(); return; }
      showEnrichInlineError(id, res.error);
      if (btn) { btn.disabled = false; btn.textContent = '🔍 Enrichir'; }
      return;
    }
    if (res.found === false) {
      showEnrichNotFound(id);
      if (btn) { btn.disabled = false; btn.textContent = '🔍 Ré-essayer'; }
      return;
    }
    // Reload prospect data
    await loadProspects();
    const updated = allProspects.find(x => x.id === id);
    if (updated) { currentProspect = updated; buildDetailInfo(updated); }
  } catch (e) {
    showEnrichInlineError(id, e.message);
    if (btn) { btn.disabled = false; btn.textContent = '🔍 Enrichir'; }
  }
}

// Show a friendly "not found" message with fallback actions (no popup alert)
function showEnrichNotFound(id) {
  const btn = document.getElementById('btn-enrich-' + id);
  if (!btn) return;
  const container = btn.closest('div');
  if (!container) return;
  const name = (currentProspect && currentProspect.name) || '';
  const city = (currentProspect && (currentProspect.city || currentProspect.address)) || '';
  const q = encodeURIComponent((name + ' ' + city).trim());
  container.innerHTML = `
    <div style="text-align:left;padding:10px 12px;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.25);border-radius:10px;font-size:.82rem;color:var(--text);line-height:1.5">
      <div style="font-weight:800;color:#f97316;margin-bottom:4px">⚠️ Pas trouvé automatiquement</div>
      <div style="color:var(--text2);margin-bottom:10px">C'est souvent le cas pour les micro-entrepreneurs, auto-entrepreneurs ou boîtes au nom personnel. Tu peux chercher manuellement :</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <a href="https://www.pappers.fr/recherche?q=${q}" target="_blank" rel="noopener" class="btn-action-sm" style="background:rgba(10,102,194,.15);color:#0a66c2;border-color:rgba(10,102,194,.3);text-decoration:none">🔍 Chercher sur Pappers</a>
        <a href="https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${q}" target="_blank" rel="noopener" class="btn-action-sm" style="background:rgba(34,197,94,.15);color:#22c55e;border-color:rgba(34,197,94,.3);text-decoration:none">🏛️ Annuaire gouv</a>
        <button class="btn-action-sm" onclick="enrichProspect(${id})" style="background:rgba(249,115,22,.15);color:#f97316;border-color:rgba(249,115,22,.3)">🔄 Ré-essayer</button>
      </div>
    </div>`;
}

// Generic inline error display
function showEnrichInlineError(id, msg) {
  const btn = document.getElementById('btn-enrich-' + id);
  if (!btn) return;
  const container = btn.closest('div');
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:left;padding:10px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:10px;font-size:.82rem;color:#ef4444;line-height:1.5">
      <div style="font-weight:800;margin-bottom:4px">❌ Erreur</div>
      <div style="color:var(--text2);margin-bottom:10px">${esc(msg || 'Erreur inconnue')}</div>
      <button class="btn-action-sm" onclick="enrichProspect(${id})" style="background:rgba(249,115,22,.15);color:#f97316;border-color:rgba(249,115,22,.3)">🔄 Ré-essayer</button>
    </div>`;
}

// Show upgrade modal for free users
function showUpgradeModal() {
  const existing = document.querySelector('.upgrade-modal-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'upgrade-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:var(--card);border:2px solid #f97316;border-radius:20px;max-width:420px;width:100%;padding:2rem;text-align:center">
      <div style="font-size:3rem;margin-bottom:1rem">🔒</div>
      <h2 style="font-size:1.3rem;font-weight:900;color:#fff;margin-bottom:.5rem">Fonctionnalité PRO</h2>
      <p style="color:var(--muted);font-size:.9rem;margin-bottom:1.5rem;line-height:1.5">
        Accédez aux <strong style="color:#f97316">numéros de téléphone</strong>, <strong style="color:#0a66c2">LinkedIn</strong>, <strong style="color:#22c55e">emails</strong>, <strong style="color:#22c55e">chiffre d'affaires</strong> et au <strong>score de prospection</strong> avec le plan PRO.
      </p>
      <div style="background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.2);border-radius:12px;padding:1rem;margin-bottom:1.5rem">
        <div style="font-size:2rem;font-weight:900;color:#f97316">349€<span style="font-size:.9rem;color:var(--muted);font-weight:600">/mois</span></div>
        <div style="font-size:.8rem;color:var(--muted);margin-top:.3rem">Accès illimité à toutes les fonctionnalités</div>
      </div>
      <a href="/pricing" style="display:block;padding:14px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-weight:800;font-size:1rem;border-radius:12px;text-decoration:none;margin-bottom:.75rem">Passer PRO →</a>
      <button onclick="this.closest('.upgrade-modal-overlay').remove()" style="background:none;border:none;color:var(--muted);font-size:.85rem;cursor:pointer">Plus tard</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Check PRO before CSV export
function checkProExport(e) {
  if (userPlan === 'pro' || userPlan === 'admin') return true;
  e.preventDefault();
  showUpgradeModal();
  return false;
}

/* ─────────────────────────────────────────
   MODAL TAB SWITCHING
───────────────────────────────────────── */
function switchModalTab(tab) {
  document.querySelectorAll('.mtab').forEach(t => t.classList.toggle('active', t.dataset.mtab === tab));
  document.querySelectorAll('.mtab-panel').forEach(p => p.classList.toggle('active', p.dataset.mtab === tab));
  if (tab === 'devis' && currentProspect) loadProspectQuotes(currentProspect.id);
}

/* ─────────────────────────────────────────
   PITCH TYPE
───────────────────────────────────────── */
function setPitchType(type) {
  pitchType = type;
  document.querySelectorAll('.pitch-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
}

/* ─────────────────────────────────────────
   GENERATE PITCH
───────────────────────────────────────── */
async function generatePitch() {
  if (!currentProspect) return;

  const p     = currentProspect;
  const stage = p.pipeline_stage;

  const stageContext = {
    cold_call:         'pitch de prospection téléphonique à froid',
    to_recall:         'pitch de rappel pour fixer un rendez-vous',
    meeting_to_set:    'pitch pour confirmer le rendez-vous',
    meeting_confirmed: 'pitch de vente pour closer',
    closed:            'pitch de fidélisation client',
    refused:           'pitch de relance après refus',
  };

  const btn  = document.getElementById('btn-gen-pitch');
  const zone = document.getElementById('pitch-zone');
  if (btn)  { btn.disabled = true; btn.textContent = '✨ Génération...'; }
  if (zone) zone.innerHTML = `<div class="pitch-result" style="color:var(--muted)">Génération en cours...</div>`;

  try {
    const _pitchAbort = new AbortController();
    const _pitchTimeout = setTimeout(() => _pitchAbort.abort(), 35000);
    const res = await fetch('/api/pitch', {
      method: 'POST',
      headers: AUTH,
      signal: _pitchAbort.signal,
      body: JSON.stringify({
        prospect: {
          name:        p.name,
          phone:       p.phone,
          address:     p.address,
          city:        p.city,
          niche:       p.niche,
          rating:      p.rating,
          reviews:     p.reviews,
          search_mode: p.search_mode,
          owner_name:  p.owner_name,
        },
        niche:     p.niche || p.city || '',
        pitchType: pitchType,
      }),
    });
    clearTimeout(_pitchTimeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (zone) zone.innerHTML = `<div class="pitch-result" style="color:var(--red-tx)">${esc(err.error || 'Erreur lors de la génération.')}</div>`;
      return;
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || data.pitch || data.text || '';
    if (zone) {
      // Action buttons depending on pitch type
      let extraBtns = '';
      if (pitchType === 'email') {
        extraBtns = currentProspect?.email
          ? `<button class="btn-send-pitch-email" onclick="sendPitchEmail(this)">📧 Envoyer à ${esc(currentProspect.email)}</button>`
          : `<button class="btn-send-pitch-email" style="opacity:.5" title="Ajoutez l'email dans la fiche" disabled>📧 Email manquant</button>`;
      }
      if ((pitchType === 'dm' || pitchType === 'sms') && currentProspect?.phone) {
        const phone = currentProspect.phone.replace(/\D/g, '');
        const intlPhone = phone.startsWith('33') ? phone : phone.startsWith('0') ? '33' + phone.slice(1) : phone;
        const waUrl = `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`;
        const smsUrl = `sms:${currentProspect.phone}?body=${encodeURIComponent(text.substring(0, 160))}`;
        extraBtns = `<a class="btn-whatsapp" href="${waUrl}" target="_blank" rel="noopener">💬 WhatsApp</a>
                     <a class="btn-sms-link" href="${smsUrl}">📱 SMS natif</a>`;
      }
      zone.innerHTML = `
        <div class="pitch-result">${esc(text)}</div>
        <div class="pitch-actions">
          <button class="btn-copy-pitch" onclick="copyPitch(this)">📋 Copier</button>
          ${extraBtns}
        </div>
      `;
    }
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Timeout — la génération a pris trop de temps. Réessaie.' : 'Erreur réseau.';
    if (zone) zone.innerHTML = `<div class="pitch-result" style="color:var(--red-tx)">${msg}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Générer le pitch'; }
  }
}

/* ─────────────────────────────────────────
   EMAIL FINDER
───────────────────────────────────────── */
async function findEmail() {
  if (!currentProspect) return;
  const btn = document.getElementById('btn-find-email');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Recherche...'; }

  const res = await apiPost(`/api/prospects/${currentProspect.id}/find-email`, {});
  if (btn) { btn.disabled = false; btn.textContent = '🔍 Trouver email'; }

  if (res && res.email) {
    currentProspect.email = res.email;
    const emailEl = document.getElementById('m-email');
    if (emailEl) emailEl.value = res.email;
    showToast(`📧 Email trouvé : ${res.email}`, 'success', 5000);
    switchModalTab('crm');
  } else if (res && res.suggestions && res.suggestions.length) {
    showToast(`💡 Essayez : ${res.suggestions.slice(0, 3).join(' · ')}`, 'info', 7000);
  } else {
    showToast(res?.error || 'Email introuvable.', 'warn', 4000);
  }
}

async function sendPitchEmail(btn) {
  if (!currentProspect || !currentProspect.email) return showToast('Ajoutez l\'email dans la fiche', 'error');
  const zone = document.getElementById('pitch-zone');
  const pitchEl = zone?.querySelector('.pitch-result');
  if (!pitchEl) return;
  const fullText = pitchEl.textContent.trim();
  // Extract subject (first line) and body (rest)
  const lines = fullText.split('\n');
  let subject = lines[0].replace(/^(Objet\s*:\s*|Subject\s*:\s*)/i, '').trim() || `Proposition pour ${currentProspect.name}`;
  const body = lines.slice(1).join('\n').trim() || fullText;
  btn.disabled = true; btn.textContent = '⏳ Envoi...';
  const res = await apiPost(`/api/prospects/${currentProspect.id}/send-email`, { subject, body });
  if (res && res.ok) {
    showToast(`📧 Email envoyé à ${currentProspect.email} !`, 'success');
    btn.textContent = '✅ Envoyé !';
    setTimeout(() => { btn.disabled = false; btn.textContent = `📧 Envoyer à ${currentProspect.email}`; }, 3000);
  } else {
    showToast(res?.error || 'Erreur d\'envoi', 'error');
    btn.disabled = false; btn.textContent = `📧 Envoyer à ${currentProspect.email}`;
  }
}

function copyPitch(btn) {
  const pitchEl = btn.closest('div')?.previousElementSibling || btn.previousElementSibling;
  if (!pitchEl) return;
  navigator.clipboard.writeText(pitchEl.textContent.trim()).then(() => {
    showToast('Pitch copié !', 'success', 2000);
    btn.textContent = '✓ Copié !';
    setTimeout(() => { btn.textContent = '📋 Copier le pitch'; }, 2000);
  });
}

/* ─────────────────────────────────────────
   CRM SAVE (debounced)
───────────────────────────────────────── */
function debounceSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCRM, 1000);
}

async function saveCRM() {
  if (!currentProspect) return;
  const notes      = document.getElementById('m-notes')?.value  || '';
  const rappel     = document.getElementById('m-rappel')?.value || '';
  const owner_name = document.getElementById('m-owner')?.value  || '';
  const email      = document.getElementById('m-email')?.value  || '';

  const res = await apiPut(`/api/prospects/${currentProspect.id}/notes`, { notes, rappel, owner_name, email });
  if (res && res.ok) {
    currentProspect.notes      = notes;
    currentProspect.rappel     = rappel;
    currentProspect.owner_name = owner_name;
    currentProspect.email      = email;
    const savedEl = document.getElementById('crm-saved');
    if (savedEl) {
      savedEl.style.display = 'block';
      setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
    }
  }
}

/* ─────────────────────────────────────────
   ADD PROSPECT MODAL
───────────────────────────────────────── */
async function deleteProspect(id) {
  const p = allProspects.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Supprimer "${p.name}" ? Irréversible.`)) return;
  try {
    const res = await apiDelete(`/api/prospects/${id}`);
    if (res && !res.error) {
      allProspects = allProspects.filter(x => x.id !== id);
      rebuildNicheFilter(); updateBadges(); renderList();
      showToast('Prospect supprimé.', 'success');
    } else {
      showToast('Erreur lors de la suppression', 'error');
    }
  } catch (e) {
    console.error('deleteProspect error', e);
    showToast('Erreur lors de la suppression', 'error');
  }
}

/* ─────────────────────────────────────────
   BULK SELECTION MODE
───────────────────────────────────────── */
let bulkSelectMode = false;
const selectedIds = new Set();

function toggleSelectMode() {
  bulkSelectMode = !bulkSelectMode;
  selectedIds.clear();
  const bar = document.getElementById('bulk-action-bar');
  const btn = document.getElementById('btn-select-mode');
  if (bulkSelectMode) {
    if (bar) bar.style.display = 'flex';
    if (btn) { btn.style.borderColor = '#E1306C'; btn.style.color = '#E1306C'; btn.textContent = '✕'; }
  } else {
    if (bar) bar.style.display = 'none';
    if (btn) { btn.style.borderColor = '#2a2a38'; btn.style.color = '#6a6a80'; btn.textContent = '☑'; }
  }
  renderList();
  updateBulkCount();
}

function updateBulkCount() {
  const el = document.getElementById('bulk-count');
  if (el) el.textContent = `${selectedIds.size} sélectionné${selectedIds.size > 1 ? 's' : ''}`;
}

function toggleProspectSelection(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBulkCount();
  // Highlight card view
  const card = document.getElementById('pcard-' + id);
  if (card) {
    if (checked) card.classList.add('prospect-card-selected');
    else card.classList.remove('prospect-card-selected');
  }
  // Highlight table row
  const cb = document.getElementById('bulk-cb-' + id);
  if (cb) {
    const tr = cb.closest('tr');
    if (tr) {
      if (checked) tr.classList.add('prospect-card-selected');
      else tr.classList.remove('prospect-card-selected');
    }
  }
}

function bulkSelectAllVisible() {
  getFilteredProspects().forEach(p => {
    selectedIds.add(p.id);
    const cb = document.getElementById('bulk-cb-' + p.id);
    if (cb) cb.checked = true;
    const card = document.getElementById('pcard-' + p.id);
    if (card) card.classList.add('prospect-card-selected');
  });
  updateBulkCount();
}

function bulkSelectNone() {
  selectedIds.clear();
  document.querySelectorAll('.bulk-cb').forEach(cb => cb.checked = false);
  document.querySelectorAll('.prospect-card-selected').forEach(el => el.classList.remove('prospect-card-selected'));
  updateBulkCount();
}

async function bulkDeleteSelected() {
  if (selectedIds.size === 0) { showToast('Aucun prospect sélectionné.', 'info'); return; }
  const n = selectedIds.size;
  if (!confirm(`Supprimer ${n} prospect${n > 1 ? 's' : ''} ? Cette action est irréversible.`)) return;
  let deleted = 0;
  const ids = Array.from(selectedIds);
  for (const id of ids) {
    try {
      const res = await apiDelete(`/api/prospects/${id}`);
      if (res && !res.error) { deleted++; allProspects = allProspects.filter(x => x.id !== id); }
    } catch (e) { console.error('Delete failed for', id, e); }
  }
  selectedIds.clear();
  rebuildNicheFilter();
  updateBadges();
  renderList();
  updateBulkCount();
  showToast(`${deleted} prospect${deleted > 1 ? 's' : ''} supprimé${deleted > 1 ? 's' : ''}.`, 'success');
}

/* ─────────────────────────────────────────
   PROSPECT CONTEXT MENU (⋮)
───────────────────────────────────────── */
let _openMenu = null;

function closeProspectMenu() {
  if (_openMenu) { _openMenu.remove(); _openMenu = null; }
  document.removeEventListener('click', _handleMenuOutsideClick, true);
}

function _handleMenuOutsideClick(e) {
  if (_openMenu && !_openMenu.contains(e.target) && !e.target.classList.contains('prospect-menu-btn')) {
    closeProspectMenu();
  }
}

function openProspectMenu(event, id) {
  event.stopPropagation();
  closeProspectMenu();
  const p = allProspects.find(x => x.id === id);
  if (!p) return;

  const stage = p.pipeline_stage;
  const recall = p.recall_type || 'interested';

  const items = [];
  items.push({ label: 'Fiche CRM complète', icon: '📋', action: `openDetail(${id})` });
  if (p.phone) items.push({ label: 'Appeler', icon: '📞', action: `callProspect(${id})` });
  items.push({ sep: true });
  items.push({ label: 'Changer d\'état', isLabel: true });
  if (stage !== 'cold_call')          items.push({ label: 'Cold Call', icon: '📞', action: `_menuMove(${id},'cold_call')` });
  if (!(stage === 'to_recall' && recall === 'interested'))
    items.push({ label: 'À rappeler — Intéressé', icon: '🔥', action: `_menuMove(${id},'to_recall','interested')`, color: '#ff8c42' });
  if (!(stage === 'to_recall' && recall === 'no_time'))
    items.push({ label: 'À rappeler — Pas le temps', icon: '⏰', action: `_menuMove(${id},'to_recall','no_time')`, color: '#4da6ff' });
  if (stage !== 'no_answer')          items.push({ label: 'Pas répondu', icon: '📵', action: `_menuMove(${id},'no_answer')` });
  if (stage !== 'meeting_to_set')     items.push({ label: 'RDV à poser', icon: '🗓️', action: `_menuMove(${id},'meeting_to_set')` });
  if (stage !== 'meeting_confirmed')  items.push({ label: 'RDV confirmé', icon: '✅', action: `_menuMove(${id},'meeting_confirmed')` });
  if (stage !== 'closed')             items.push({ label: 'Closé (deal)', icon: '💰', action: `_menuMove(${id},'closed')` });
  if (stage !== 'refused')            items.push({ label: 'Refusé', icon: '❌', action: `_menuMove(${id},'refused')` });
  items.push({ sep: true });
  items.push({ label: 'Supprimer le prospect', icon: '🗑', action: `closeProspectMenu(); deleteProspect(${id})`, danger: true });

  const menu = document.createElement('div');
  menu.className = 'prospect-menu-popup open';
  menu.innerHTML = items.map(it => {
    if (it.sep) return '<div class="pm-sep"></div>';
    if (it.isLabel) return `<div class="pm-label">${it.label}</div>`;
    const color = it.color ? `style="color:${it.color}"` : '';
    const danger = it.danger ? ' pm-danger' : '';
    return `<button class="pm-item${danger}" ${color} onclick="closeProspectMenu();${it.action}">
      <span style="font-size:15px">${it.icon || ''}</span>
      <span>${it.label}</span>
    </button>`;
  }).join('');

  document.body.appendChild(menu);
  _openMenu = menu;

  // Position near the button
  const btn = event.target.closest('.prospect-menu-btn');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.right - menuRect.width;
    if (left < 8) left = 8;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = rect.top - menuRect.height - 6;
    }
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
  }

  setTimeout(() => document.addEventListener('click', _handleMenuOutsideClick, true), 0);
}

function _menuMove(id, stage, recallType) {
  // Stages that require modal input (date, objection, deal): go through moveStage()
  if (stage === 'to_recall' || stage === 'meeting_to_set' || stage === 'meeting_confirmed' || stage === 'closed' || stage === 'refused') {
    moveStage(id, stage, recallType);
  } else {
    _doMoveStage(id, stage, null, null, null, null, null, null, null, null, null);
  }
}

async function deleteFilteredProspects() {
  const visible = getFilteredProspects();
  if (visible.length === 0) { showToast('Aucun prospect à supprimer.', 'info'); return; }
  const ok = confirm(`Supprimer ${visible.length} prospect${visible.length > 1 ? 's' : ''} ? Cette action est irréversible.`);
  if (!ok) return;
  let deleted = 0;
  for (const p of visible) {
    const res = await apiDelete(`/api/prospects/${p.id}`);
    if (res && !res.error) { deleted++; allProspects = allProspects.filter(x => x.id !== p.id); }
  }
  rebuildNicheFilter();
  updateBadges();
  renderList();
  showToast(`${deleted} prospect${deleted > 1 ? 's' : ''} supprimé${deleted > 1 ? 's' : ''}.`, 'success');
}

function openAddModal() {
  const overlay = document.getElementById('add-overlay');
  if (overlay) overlay.classList.add('open');
  const nameEl = document.getElementById('add-name');
  if (nameEl) { nameEl.value = ''; nameEl.focus(); }
  ['add-phone', 'add-address', 'add-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const errEl = document.getElementById('add-error');
  if (errEl) errEl.style.display = 'none';
}

function closeAddModal() {
  const overlay = document.getElementById('add-overlay');
  if (overlay) overlay.classList.remove('open');
}

async function submitAddProspect() {
  const name    = document.getElementById('add-name')?.value.trim()    || '';
  const phone   = document.getElementById('add-phone')?.value.trim()   || '';
  const address = document.getElementById('add-address')?.value.trim() || '';
  const notes   = document.getElementById('add-notes')?.value.trim()   || '';

  const errEl = document.getElementById('add-error');
  if (!name) {
    if (errEl) { errEl.textContent = 'Le nom est requis.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  const btn = document.getElementById('btn-add-submit');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/prospects/manual', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ name, phone, address, notes }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (errEl) { errEl.textContent = data.error || 'Erreur.'; errEl.style.display = 'block'; }
      return;
    }
    allProspects.unshift(data);
    updateBadges();
    closeAddModal();
    switchTab('cold_call');
    showToast(`${name} ajouté en Cold Call !`, 'success');
  } catch (e) {
    if (errEl) { errEl.textContent = 'Erreur réseau.'; errEl.style.display = 'block'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ─────────────────────────────────────────
   NICHE PICKER
───────────────────────────────────────── */
const NICHES = {
  batiment: [
    { icon: '🔧', label: 'Plombier' },
    { icon: '⚡', label: 'Électricien' },
    { icon: '🪟', label: 'Menuisier' },
    { icon: '🎨', label: 'Peintre' },
    { icon: '🧱', label: 'Maçon' },
    { icon: '🔑', label: 'Serrurier' },
    { icon: '🔥', label: 'Chauffagiste' },
    { icon: '❄️', label: 'Climaticien' },
    { icon: '🏠', label: 'Toiturier' },
    { icon: '🌿', label: 'Jardinier paysagiste' },
    { icon: '🏊', label: 'Pisciniste' },
    { icon: '🪵', label: 'Carreleur' },
    { icon: '🪚', label: 'Charpentier' },
    { icon: '🧰', label: 'Plaquiste' },
    { icon: '🛠️', label: 'Façadier' },
    { icon: '🪜', label: 'Couvreur' },
    { icon: '🧊', label: 'Vitrier' },
    { icon: '⛏️', label: 'Terrassier' },
    { icon: '🏗️', label: 'Entreprise générale BTP' },
    { icon: '🌡️', label: 'Isolation thermique' },
    { icon: '☀️', label: 'Panneaux solaires' },
    { icon: '💧', label: 'Pompe à chaleur' },
  ],
  restaurant: [
    { icon: '🍕', label: 'Pizzeria' },
    { icon: '🥖', label: 'Boulangerie' },
    { icon: '🥩', label: 'Boucherie' },
    { icon: '🍰', label: 'Pâtisserie' },
    { icon: '🍽️', label: 'Restaurant' },
    { icon: '☕', label: 'Café / Bar' },
    { icon: '🛒', label: 'Épicerie' },
    { icon: '🎂', label: 'Traiteur' },
    { icon: '🍔', label: 'Fast food / Burger' },
    { icon: '🍣', label: 'Sushi / Japonais' },
    { icon: '🥗', label: 'Restaurant bio / végé' },
    { icon: '🌮', label: 'Tacos / Kebab' },
    { icon: '🍨', label: 'Glacier' },
    { icon: '🧀', label: 'Fromagerie' },
    { icon: '🍷', label: 'Caviste' },
    { icon: '🦞', label: 'Poissonnerie' },
    { icon: '🍱', label: 'Dark kitchen' },
    { icon: '🥐', label: 'Food truck' },
  ],
  sante: [
    { icon: '🦷', label: 'Dentiste' },
    { icon: '🩺', label: 'Médecin généraliste' },
    { icon: '💊', label: 'Pharmacie' },
    { icon: '🐾', label: 'Vétérinaire' },
    { icon: '👁️', label: 'Opticien' },
    { icon: '🤸', label: 'Kiné' },
    { icon: '🧘', label: 'Ostéopathe' },
    { icon: '💉', label: 'Infirmier libéral' },
    { icon: '🧠', label: 'Psychologue' },
    { icon: '🦶', label: 'Podologue' },
    { icon: '👂', label: 'Audioprothésiste' },
    { icon: '🤰', label: 'Sage-femme' },
    { icon: '🥽', label: 'Orthoptiste' },
    { icon: '🗣️', label: 'Orthophoniste' },
    { icon: '🌿', label: 'Naturopathe' },
    { icon: '🏥', label: 'Clinique privée' },
    { icon: '💆', label: 'Diététicien' },
  ],
  beaute: [
    { icon: '✂️', label: 'Coiffeur' },
    { icon: '💈', label: 'Barbier' },
    { icon: '💅', label: 'Onglerie' },
    { icon: '🌸', label: 'Institut beauté' },
    { icon: '🖋️', label: 'Tatoueur' },
    { icon: '✨', label: 'Esthétique' },
    { icon: '💆', label: 'Spa / Massage' },
    { icon: '👁️', label: 'Extensions de cils' },
    { icon: '🦷', label: 'Blanchiment dentaire' },
    { icon: '💇', label: 'Coiffeur à domicile' },
    { icon: '🌺', label: 'Épilation laser' },
    { icon: '🧖', label: 'Hammam' },
    { icon: '💄', label: 'Makeup artist' },
  ],
  auto: [
    { icon: '🔩', label: 'Garage auto' },
    { icon: '🚗', label: 'Carrosserie' },
    { icon: '🔍', label: 'Contrôle technique' },
    { icon: '🛞', label: 'Pneumatiques' },
    { icon: '🚐', label: 'Déménageur' },
    { icon: '🏍️', label: 'Moto / Scooter' },
    { icon: '🚙', label: 'Concessionnaire auto' },
    { icon: '🚘', label: 'Lavage auto' },
    { icon: '🔋', label: 'Batteries auto' },
    { icon: '🔧', label: 'Mécanique rapide' },
    { icon: '🚓', label: 'Location véhicules' },
    { icon: '⚡', label: 'Borne recharge VE' },
  ],
  services: [
    { icon: '🧹', label: 'Nettoyage' },
    { icon: '👔', label: 'Pressing' },
    { icon: '📊', label: 'Comptable' },
    { icon: '⚖️', label: 'Avocat' },
    { icon: '📸', label: 'Photographe' },
    { icon: '🚘', label: 'Auto-école' },
    { icon: '💐', label: 'Fleuriste' },
    { icon: '📱', label: 'Agence comm.' },
    { icon: '🗂️', label: 'Secrétariat indépendant' },
    { icon: '🧽', label: 'Entretien espaces verts' },
    { icon: '🛡️', label: 'Assurance' },
    { icon: '💼', label: 'Conseil RH' },
    { icon: '🐕', label: 'Pet-sitter / dog walker' },
    { icon: '📦', label: 'Conciergerie' },
    { icon: '🧺', label: 'Laverie' },
  ],
  immo: [
    { icon: '🏡', label: 'Agence immobilière' },
    { icon: '🔑', label: 'Chasseur immobilier' },
    { icon: '🏢', label: 'Administrateur biens' },
    { icon: '📜', label: 'Notaire' },
    { icon: '🧑‍💼', label: 'Mandataire immo' },
    { icon: '🏗️', label: 'Promoteur' },
    { icon: '🏘️', label: 'Syndic de copropriété' },
    { icon: '📐', label: 'Architecte' },
    { icon: '📏', label: 'Géomètre' },
    { icon: '🏕️', label: 'Location saisonnière' },
    { icon: '🔍', label: 'Diagnostiqueur immo' },
    { icon: '🏠', label: 'Home staging' },
  ],
  tech: [
    { icon: '💻', label: 'Agence web' },
    { icon: '🖱️', label: 'Développeur freelance' },
    { icon: '📱', label: 'App mobile' },
    { icon: '🎨', label: 'UI/UX designer' },
    { icon: '📊', label: 'Consultant data' },
    { icon: '🛒', label: 'Agence e-commerce' },
    { icon: '🔎', label: 'Agence SEO' },
    { icon: '🤖', label: 'Agence IA / automation' },
    { icon: '📹', label: 'Motion designer' },
    { icon: '🎬', label: 'Monteur vidéo' },
    { icon: '🎯', label: 'Agence pub Meta/Google' },
    { icon: '☁️', label: 'Infogérance IT' },
  ],
  sport: [
    { icon: '🏋️', label: 'Salle de sport' },
    { icon: '🧘', label: 'Studio yoga' },
    { icon: '🤸', label: 'Pilates' },
    { icon: '🥊', label: 'Salle de boxe' },
    { icon: '⚽', label: 'Club de foot' },
    { icon: '🎾', label: 'Club de tennis' },
    { icon: '🏊', label: 'Piscine privée' },
    { icon: '🚴', label: 'Coach perso' },
    { icon: '⛸️', label: 'Patinoire' },
    { icon: '🎳', label: 'Bowling' },
    { icon: '🎯', label: 'Escape game' },
    { icon: '🏃', label: 'Prep physique' },
  ],
  mode: [
    { icon: '👗', label: 'Boutique prêt-à-porter' },
    { icon: '👜', label: 'Maroquinerie' },
    { icon: '👠', label: 'Chausseur' },
    { icon: '💎', label: 'Bijouterie' },
    { icon: '⌚', label: 'Horlogerie' },
    { icon: '👓', label: 'Lunetterie' },
    { icon: '🧵', label: 'Retoucherie' },
    { icon: '🎩', label: 'Mode sur mesure' },
    { icon: '👕', label: 'Concept store' },
    { icon: '♻️', label: 'Friperie' },
    { icon: '🛍️', label: 'E-commerce mode' },
  ],
  event: [
    { icon: '🎉', label: 'Wedding planner' },
    { icon: '🎂', label: 'Traiteur événement' },
    { icon: '🎵', label: 'DJ / animation' },
    { icon: '📸', label: 'Photographe mariage' },
    { icon: '🎥', label: 'Vidéaste mariage' },
    { icon: '🎨', label: 'Décorateur événementiel' },
    { icon: '🎭', label: 'Agence artistique' },
    { icon: '🍾', label: 'Bar mobile' },
    { icon: '🎪', label: 'Location chapiteau' },
    { icon: '💐', label: 'Fleuriste événement' },
    { icon: '🎆', label: 'Agence événementielle B2B' },
  ],
  formation: [
    { icon: '📚', label: 'Organisme formation' },
    { icon: '👨‍🏫', label: 'Prof particulier' },
    { icon: '🌍', label: 'École de langues' },
    { icon: '💻', label: 'Formation digitale' },
    { icon: '🎓', label: 'École privée' },
    { icon: '🛠️', label: 'CFA / alternance' },
    { icon: '👶', label: 'Crèche privée' },
    { icon: '🎨', label: 'Atelier créatif' },
    { icon: '♟️', label: 'Cours d\'échecs / logique' },
    { icon: '🎹', label: 'École de musique' },
    { icon: '🏊', label: 'Moniteur sportif' },
    { icon: '📖', label: 'Coaching scolaire' },
  ],
  tourisme: [
    { icon: '🏨', label: 'Hôtel indépendant' },
    { icon: '🏡', label: 'Chambre d\'hôtes' },
    { icon: '⛺', label: 'Camping' },
    { icon: '🛎️', label: 'Gîte rural' },
    { icon: '✈️', label: 'Agence de voyage' },
    { icon: '🗺️', label: 'Guide touristique' },
    { icon: '🚤', label: 'Location bateau' },
    { icon: '🚴', label: 'Location vélo' },
    { icon: '🏔️', label: 'École de ski' },
    { icon: '🧗', label: 'Activité outdoor' },
  ],
  artisanat: [
    { icon: '🎨', label: 'Peintre d\'art' },
    { icon: '🏺', label: 'Céramiste' },
    { icon: '🧵', label: 'Couturière' },
    { icon: '💍', label: 'Joaillier' },
    { icon: '🪑', label: 'Ébéniste d\'art' },
    { icon: '🔨', label: 'Forgeron' },
    { icon: '🧶', label: 'Tapissier' },
    { icon: '🎭', label: 'Créateur d\'objets' },
    { icon: '📿', label: 'Créateur bijoux' },
    { icon: '🪞', label: 'Encadreur' },
    { icon: '🕯️', label: 'Bougies artisanales' },
  ],
  agri: [
    { icon: '🌾', label: 'Exploitation céréalière' },
    { icon: '🍇', label: 'Viticulteur' },
    { icon: '🐄', label: 'Élevage bovin' },
    { icon: '🐑', label: 'Élevage ovin' },
    { icon: '🐓', label: 'Élevage volaille' },
    { icon: '🌻', label: 'Maraîcher bio' },
    { icon: '🫒', label: 'Oléiculteur' },
    { icon: '🍎', label: 'Arboriculteur' },
    { icon: '🌱', label: 'Pépiniériste' },
    { icon: '🍯', label: 'Apiculteur' },
    { icon: '🥛', label: 'Fromager producteur' },
    { icon: '🚜', label: 'Entreprise agricole' },
  ],
  transport: [
    { icon: '🚚', label: 'Transporteur routier' },
    { icon: '📦', label: 'Messagerie / coursier' },
    { icon: '🚐', label: 'Déménageur pro' },
    { icon: '🚕', label: 'Taxi' },
    { icon: '🚙', label: 'VTC' },
    { icon: '🛵', label: 'Livraison express' },
    { icon: '🚢', label: 'Transport maritime' },
    { icon: '🚛', label: 'Logistique entrepôt' },
    { icon: '⛽', label: 'Station service' },
    { icon: '🚌', label: 'Transport voyageurs' },
  ],
  industrie: [
    { icon: '🏭', label: 'Métallurgie' },
    { icon: '⚙️', label: 'Mécanique industrielle' },
    { icon: '🧪', label: 'Plasturgie' },
    { icon: '📐', label: 'Bureau d\'études' },
    { icon: '🔩', label: 'Tôlerie' },
    { icon: '📦', label: 'Emballage industriel' },
    { icon: '🪚', label: 'Menuiserie industrielle' },
    { icon: '🧼', label: 'Cosmétique fabricant' },
    { icon: '🍪', label: 'Agroalimentaire' },
    { icon: '🖨️', label: 'Imprimerie industrielle' },
    { icon: '♻️', label: 'Recyclage / déchets' },
    { icon: '🔬', label: 'Biotech / Medtech' },
  ],
  juridique: [
    { icon: '⚖️', label: 'Avocat d\'affaires' },
    { icon: '📜', label: 'Notaire' },
    { icon: '🏛️', label: 'Huissier' },
    { icon: '📊', label: 'Expert-comptable' },
    { icon: '🧮', label: 'Commissaire aux comptes' },
    { icon: '💼', label: 'Conseil en gestion' },
    { icon: '💰', label: 'Conseiller patrimoine' },
    { icon: '🏦', label: 'Courtier crédit' },
    { icon: '🛡️', label: 'Courtier assurance' },
    { icon: '📈', label: 'Cabinet conseil' },
    { icon: '🔐', label: 'Gestionnaire paie' },
  ],
};

// Generic search term per category — used by "Tous les métiers" button
const CAT_ALL_LABELS = {
  batiment:   { icon: '🏗️', label: 'Tous les métiers du bâtiment',    query: 'bâtiment' },
  restaurant: { icon: '🍽️', label: 'Tous les métiers de la resto',    query: 'restaurant' },
  sante:      { icon: '🏥', label: 'Tous les métiers de la santé',    query: 'santé' },
  beaute:     { icon: '💅', label: 'Tous les métiers de la beauté',   query: 'beauté' },
  auto:       { icon: '🚗', label: 'Tous les métiers de l\'auto',     query: 'automobile' },
  services:   { icon: '💼', label: 'Tous les services',               query: 'services aux entreprises' },
  immo:       { icon: '🏡', label: 'Tous les métiers immo',           query: 'immobilier' },
  tech:       { icon: '🖥️', label: 'Toutes les agences tech',         query: 'agence digitale' },
  sport:      { icon: '🏋️', label: 'Tous les métiers sport',          query: 'salle de sport' },
  mode:       { icon: '👗', label: 'Toutes les boutiques mode',       query: 'boutique prêt-à-porter' },
  event:      { icon: '🎉', label: 'Tous les métiers événementiel',   query: 'événementiel' },
  formation:  { icon: '📚', label: 'Toutes les formations',           query: 'formation professionnelle' },
  tourisme:   { icon: '✈️', label: 'Tous les métiers tourisme',       query: 'hôtel tourisme' },
  artisanat:  { icon: '🎨', label: 'Tous les artisans d\'art',        query: 'artisan d\'art' },
  agri:       { icon: '🌾', label: 'Toute l\'agriculture',            query: 'exploitation agricole' },
  transport:  { icon: '🚚', label: 'Tout le transport',               query: 'transport logistique' },
  industrie:  { icon: '🏭', label: 'Toute l\'industrie',              query: 'industrie PME' },
  juridique:  { icon: '⚖️', label: 'Tous les cabinets',               query: 'cabinet juridique' },
};

function renderNicheChips(cat) {
  const container = document.getElementById('niche-chips');
  container.innerHTML = '';

  // ── "Tous les métiers" chip (first, highlighted) ──
  const allMeta = CAT_ALL_LABELS[cat];
  if (allMeta) {
    const allBtn = document.createElement('button');
    allBtn.className = 'niche-chip niche-chip-all';
    allBtn.style.cssText = 'background:linear-gradient(135deg,rgba(34,197,94,.18),rgba(34,197,94,.08));border:1.5px solid #22c55e;color:#22c55e;font-weight:800';
    allBtn.innerHTML = `<span class="niche-chip-icon">${allMeta.icon}</span><span>${allMeta.label}</span>`;
    allBtn.onclick = () => {
      document.getElementById('scan-niche').value = allMeta.query;
      document.querySelectorAll('.niche-chip').forEach(b => b.classList.remove('active'));
      allBtn.classList.add('active');
      const disp = document.getElementById('niche-selected-display');
      if (disp) {
        disp.innerHTML = `✅ Sélectionné : <strong>${allMeta.icon} ${allMeta.label}</strong> — clique sur <b>⚡ Lancer</b> pour démarrer`;
        disp.style.display = '';
      }
    };
    container.appendChild(allBtn);
  }

  // ── Individual niche chips ──
  (NICHES[cat] || []).forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'niche-chip';
    btn.innerHTML = `<span class="niche-chip-icon">${n.icon}</span><span>${n.label}</span>`;
    btn.onclick = () => {
      document.getElementById('scan-niche').value = n.label;
      document.querySelectorAll('.niche-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const disp = document.getElementById('niche-selected-display');
      if (disp) {
        disp.innerHTML = `✅ Sélectionné : <strong>${n.icon} ${n.label}</strong> — clique sur <b>⚡ Lancer</b> pour démarrer`;
        disp.style.display = '';
      }
    };
    container.appendChild(btn);
  });
}

function switchNicheCat(btn) {
  document.querySelectorAll('.niche-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNicheChips(btn.dataset.cat);
}

// Init chips on load
document.addEventListener('DOMContentLoaded', () => {
  renderNicheChips('batiment');
  initSwipeToClose();
  initNicheAutocomplete();
});

/* ─────────────────────────────────────────
   NICHE AUTOCOMPLETE (strict — no free text)
───────────────────────────────────────── */
const NICHE_CAT_LABELS = {
  batiment: 'BTP',
  restaurant: 'Resto',
  sante: 'Santé',
  beaute: 'Beauté',
  auto: 'Auto',
  services: 'Services',
  immo: 'Immo',
  commerce: 'Commerce',
  tech: 'Tech',
  industrie: 'Industrie',
  juridique: 'Juridique',
  sport: 'Sport',
  education: 'Éducation',
  art: 'Art',
};

function getAllNichesFlat() {
  const out = [];
  Object.keys(NICHES).forEach(cat => {
    (NICHES[cat] || []).forEach(n => {
      out.push({ icon: n.icon, label: n.label, cat });
    });
  });
  return out;
}

function normalizeNicheStr(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip accents
}

function initNicheAutocomplete() {
  const input = document.getElementById('scan-niche');
  const box   = document.getElementById('niche-suggestions');
  if (!input || !box) return;

  const ALL = getAllNichesFlat();
  let activeIdx = -1;
  let currentMatches = [];

  function render(matches) {
    currentMatches = matches;
    if (!matches.length) {
      box.innerHTML = '<div class="niche-sugg-empty">Aucune niche disponible pour ce mot</div>';
      box.style.display = '';
      return;
    }
    box.innerHTML = matches.slice(0, 10).map((n, i) => `
      <div class="niche-sugg-item${i === activeIdx ? ' active' : ''}" data-idx="${i}" data-label="${n.label.replace(/"/g, '&quot;')}">
        <span class="niche-sugg-icon">${n.icon}</span>
        <span>${n.label}</span>
        <span class="niche-sugg-cat">${NICHE_CAT_LABELS[n.cat] || n.cat}</span>
      </div>
    `).join('');
    box.style.display = '';
    // Wire clicks
    box.querySelectorAll('.niche-sugg-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent blur before click registers
        const label = el.getAttribute('data-label');
        selectNiche(label);
      });
    });
  }

  function filter(q) {
    const nq = normalizeNicheStr(q);
    if (!nq) return ALL.slice(0, 10);
    // Priority 1: startsWith. Priority 2: includes
    const starts = [];
    const contains = [];
    ALL.forEach(n => {
      const nn = normalizeNicheStr(n.label);
      if (nn.startsWith(nq)) starts.push(n);
      else if (nn.includes(nq)) contains.push(n);
    });
    return starts.concat(contains);
  }

  function selectNiche(label) {
    input.value = label;
    box.style.display = 'none';
    activeIdx = -1;
    // Visually mark the matching chip as active (if currently rendered)
    document.querySelectorAll('.niche-chip').forEach(b => {
      const bl = (b.textContent || '').trim();
      if (bl.endsWith(label)) b.classList.add('active');
      else b.classList.remove('active');
    });
    const disp = document.getElementById('niche-selected-display');
    if (disp) {
      const found = ALL.find(n => n.label === label);
      const icon = found ? found.icon : '✅';
      disp.innerHTML = `✅ Sélectionné : <strong>${icon} ${label}</strong> — clique sur <b>⚡ Lancer</b> pour démarrer`;
      disp.style.display = '';
    }
  }

  input.addEventListener('input', () => {
    activeIdx = -1;
    render(filter(input.value));
  });

  input.addEventListener('focus', () => {
    render(filter(input.value));
  });

  input.addEventListener('blur', () => {
    // Delay so click on suggestion registers first
    setTimeout(() => {
      box.style.display = 'none';
      // Strict mode: if typed value isn't a valid niche, clear it
      const v = (input.value || '').trim();
      if (v && !ALL.some(n => n.label.toLowerCase() === v.toLowerCase())) {
        input.value = '';
        const disp = document.getElementById('niche-selected-display');
        if (disp) disp.style.display = 'none';
      }
    }, 180);
  });

  input.addEventListener('keydown', (e) => {
    const visible = box.style.display !== 'none' && currentMatches.length > 0;
    if (e.key === 'ArrowDown') {
      if (!visible) { render(filter(input.value)); return; }
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, Math.min(currentMatches.length, 10) - 1);
      render(currentMatches);
    } else if (e.key === 'ArrowUp') {
      if (!visible) return;
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      render(currentMatches);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible && activeIdx >= 0) {
        selectNiche(currentMatches[activeIdx].label);
      } else if (visible && currentMatches[0]) {
        // Auto-pick first match if user pressed Enter without arrow-selecting
        selectNiche(currentMatches[0].label);
      } else if (input.value && ALL.some(n => n.label.toLowerCase() === input.value.trim().toLowerCase())) {
        // Already a valid niche selected — launch
        if (typeof launchScan === 'function') launchScan();
      }
    } else if (e.key === 'Escape') {
      box.style.display = 'none';
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !box.contains(e.target)) {
      box.style.display = 'none';
    }
  });
}

/* ─────────────────────────────────────────
   SWIPE DOWN TO CLOSE — bottom sheet modals
───────────────────────────────────────── */
function initSwipeToClose() {
  // Close function per overlay id
  const closeFns = {
    'stage-modal-overlay':   () => closeStageModal(),
    'deal-modal-overlay':    () => closeDealModal(),
    'detail-overlay':        () => closeDetailModal(),
    'add-overlay':           () => closeAddModal(),
    'objection-overlay':     () => closeObjectionModal(),
  };

  document.querySelectorAll('.modal').forEach(modal => {
    let startY = 0, startX = 0;

    modal.addEventListener('touchstart', e => {
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      modal.style.transition = 'none';
    }, { passive: true });

    modal.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) {
        modal.style.transform = `translateY(${dy}px)`;
        modal.style.opacity = Math.max(0, 1 - dy / 300);
      }
    }, { passive: true });

    modal.addEventListener('touchend', e => {
      const dy = e.changedTouches[0].clientY - startY;
      modal.style.transition = 'transform .25s ease, opacity .25s ease';
      if (dy > 130 && modal.scrollTop <= 0) {
        modal.style.transform = 'translateY(100%)';
        modal.style.opacity = '0';
        setTimeout(() => {
          modal.style.transform = '';
          modal.style.opacity = '';
          modal.style.transition = '';
          // Find and call the close function
          const overlay = modal.closest('.modal-overlay');
          if (overlay) {
            const fn = closeFns[overlay.id];
            if (fn) fn();
            else overlay.style.display = 'none';
          }
        }, 250);
      } else {
        modal.style.transform = '';
        modal.style.opacity = '';
        modal.style.transition = '';
      }
    }, { passive: true });
  });
}

/* ─────────────────────────────────────────
   SCAN — country / mode selectors
───────────────────────────────────────── */
function selectCountry(btn) {
  scanCountry = btn.dataset.country;
  document.querySelectorAll('.flag-btn').forEach(b => b.classList.toggle('active', b === btn));

  const geoWrap = document.getElementById('geo-radius-wrap');
  if (scanCountry === 'around_me') {
    if (geoWrap) geoWrap.style.display = '';
    // Demande la géolocalisation
    if (!navigator.geolocation) {
      showToast('Géolocalisation non supportée par ce navigateur.', 'error'); return;
    }
    btn.textContent = '📍 Localisation…';
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        scanLat = pos.coords.latitude;
        scanLng = pos.coords.longitude;
        btn.textContent = `📍 Autour de moi ✓`;
        btn.disabled = false;
        showToast('Position détectée ✓', 'success', 2000);
      },
      err => {
        btn.textContent = '📍 Autour de moi';
        btn.disabled = false;
        showToast('Impossible d\'obtenir ta position. Active la géolocalisation.', 'error');
        // Revenir sur France
        const frBtn = document.querySelector('.flag-btn[data-country="fr"]');
        if (frBtn) selectCountry(frBtn);
      }
    );
  } else {
    if (geoWrap) geoWrap.style.display = 'none';
    scanLat = null; scanLng = null;
  }
}

function selectMode(btn) {
  scanMode = btn.dataset.mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
}

function updateRadiusSlider() {
  scanRadius = parseInt(document.getElementById('radius-slider').value);
  document.getElementById('radius-display').textContent = scanRadius;
}

function updateProspectsSlider() {
  const slider = document.getElementById('prospects-slider');
  if (!slider) return;
  const multiplier = scanMode === 'both' ? 2 : 1;
  const maxAllowed = Math.min(100, Math.max(0, Math.floor(userCredits / multiplier)));
  slider.max = maxAllowed;
  if (parseInt(slider.value) > maxAllowed) slider.value = maxAllowed;
  const val = parseInt(slider.value);
  const cost = val * multiplier;
  const el = document.getElementById('prospects-count');
  const costEl = document.getElementById('credits-cost');
  const maxEl = document.getElementById('prospects-max-label');
  if (el) el.textContent = val;
  if (costEl) costEl.textContent = cost;
  if (maxEl) maxEl.textContent = maxAllowed + ' max';
}

function toggleScanPanel() {
  const body = document.getElementById('scan-body');
  const toggleBtn = document.getElementById('scan-toggle-btn');
  if (!body) return;
  const isCollapsed = body.style.display === 'none';
  body.style.display = isCollapsed ? '' : 'none';
  if (toggleBtn) {
    toggleBtn.classList.toggle('collapsed', !isCollapsed);
    toggleBtn.title = isCollapsed ? 'Réduire' : 'Agrandir';
  }
}

/* ─────────────────────────────────────────
   LAUNCH SCAN
───────────────────────────────────────── */
async function launchScan() {
  // Block if no credits
  if (userCredits <= 0) {
    showToast('Plus de crédits disponibles. Contacte le support.', 'error');
    return;
  }

  const niche = document.getElementById('scan-niche').value.trim();

  if (!niche) {
    document.getElementById('scan-niche').focus();
    showToast('Tape un métier avant de lancer !', 'warn');
    return;
  }

  const btn        = document.getElementById('btn-scan');
  const statusWrap = document.getElementById('scan-status');
  const statusText = document.getElementById('scan-status-text');
  const fillBar    = document.getElementById('scan-progress-fill');

  if (btn)        btn.disabled = true;
  if (statusWrap) statusWrap.style.display = 'flex';
  if (statusText) statusText.textContent   = 'Scan en cours...';

  // Animated progress bar (indeterminate feel)
  let progress = 0;
  const progressTimer = setInterval(() => {
    progress = Math.min(progress + Math.random() * 12, 85);
    if (fillBar) fillBar.style.width = progress + '%';
  }, 400);

  // Safety net : force-reset the UI after 90s no matter what
  const safetyTimer = setTimeout(() => {
    clearInterval(progressTimer);
    if (btn) btn.disabled = false;
    if (statusText) statusText.textContent = '⚠️ Timeout — réessaie';
    setTimeout(() => {
      if (statusWrap) statusWrap.style.display = 'none';
      if (fillBar)    fillBar.style.width = '0%';
    }, 2000);
  }, 90000);

  try {
    const _searchAbort = new AbortController();
    const _searchTimeout = setTimeout(() => _searchAbort.abort(), 60000);
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      signal: _searchAbort.signal,
      body: JSON.stringify({
        niche,
        country: scanCountry,
        searchMode: scanMode,
        numProspects: parseInt(document.getElementById('prospects-slider')?.value || 10),
        ...(scanCountry === 'around_me' && scanLat ? { lat: scanLat, lng: scanLng, radius: scanRadius } : {}),
      }),
    });
    clearTimeout(_searchTimeout);
    const data = await res.json().catch(() => ({}));

    clearInterval(progressTimer);
    if (fillBar) fillBar.style.width = '100%';

    if (!res.ok) {
      if (statusText) statusText.textContent = '❌ ' + (data.error || ('Erreur HTTP ' + res.status));
      if (data.upgrade) {
        showToast('Plus de crédits disponibles. Contacte le support.', 'error');
      } else {
        showToast(data.error || 'Erreur lors du scan', 'error');
      }
      return;
    }

    const count = data.count || (data.prospects && data.prospects.length) || 0;
    if (count === 0) {
      if (statusText) statusText.textContent = '⚠️ Aucun prospect trouvé pour cette recherche';
      showToast('Aucun prospect trouvé — essaie un autre métier ou une autre ville', 'warn', 4500);
    } else {
      if (statusText) statusText.textContent = '✅ ' + count + ' prospects ajoutés !';
      showToast('🎯 ' + count + ' prospects ajoutés en Cold Call', 'success', 4000);
    }

    // Update local credit count from server response
    if (typeof data.credits === 'number') {
      userCredits = data.credits;
      const planCredits = document.getElementById('plan-badge-credits');
      if (planCredits) planCredits.textContent = userCredits + ' cr';
      updateProspectsSlider();
    }

    if (count > 0) {
      await loadProspects();
      switchTab('cold_call');
    }

  } catch (e) {
    clearInterval(progressTimer);
    if (statusText) statusText.textContent = '❌ Erreur de connexion';
    showToast('Erreur de connexion : ' + (e.message || 'inconnue'), 'error', 5000);
  } finally {
    clearTimeout(safetyTimer);
    // Reset button IMMEDIATELY (no 3.5s wait) so user can retry
    if (btn) btn.disabled = false;
    // Hide the status bar + progress after a short delay to let user read the result
    setTimeout(() => {
      if (statusWrap) statusWrap.style.display = 'none';
      if (fillBar)    fillBar.style.width = '0%';
      if (statusText) statusText.textContent = 'Scan en cours...';
    }, 3500);
  }
}

/* ─────────────────────────────────────────
   SKELETON LOADER
───────────────────────────────────────── */
function showTableSkeleton() {
  const tbody   = document.getElementById('prospects-tbody');
  const tblWrap = document.getElementById('tbl-wrap');
  const empty   = document.getElementById('empty-state');
  const cardsWrap = document.getElementById('cards-wrap');

  if (tbody) {
    tbody.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const tr = document.createElement('tr');
      tr.className = 'skeleton-row';
      tr.innerHTML = `<td colspan="5"><div style="display:grid;grid-template-columns:2fr 1fr 1fr 2fr .5fr;gap:.5rem;"><div class="skeleton-cell"></div><div class="skeleton-cell"></div><div class="skeleton-cell"></div><div class="skeleton-cell"></div><div class="skeleton-cell"></div></div></td>`;
      tbody.appendChild(tr);
    }
  }
  if (tblWrap)   tblWrap.style.display   = 'block';
  if (empty)     empty.style.display     = 'none';
  if (cardsWrap) cardsWrap.style.display = 'none';
}

/* ─────────────────────────────────────────
   CONFETTI
───────────────────────────────────────── */
function launchConfetti() {
  const colors = ['#3b82f6', '#a855f7', '#14b8a6', '#22c55e', '#f97316', '#f43f5e', '#fff'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;z-index:99999;
      width:${5+Math.random()*7}px;height:${5+Math.random()*7}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      border-radius:${Math.random()>.5?'50%':'2px'};
      left:${20+Math.random()*60}%;top:-10px;
      pointer-events:none;opacity:1;
      animation:confettiFall ${1.4+Math.random()*2}s cubic-bezier(.22,1,.36,1) forwards;
      animation-delay:${Math.random()*.4}s;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

const confettiStyle = document.createElement('style');
confettiStyle.textContent = `
  @keyframes confettiFall {
    0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg) scale(.3); opacity: 0; }
  }
`;
document.head.appendChild(confettiStyle);

/* ─────────────────────────────────────────
   ESCAPE HELPERS
───────────────────────────────────────── */
function mbnSwitch(btn) {
  document.querySelectorAll('.mbn-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function mbnGoScan() {
  switchView('pipeline');
  const body = document.getElementById('scan-body');
  const toggleBtn = document.getElementById('scan-toggle-btn');
  if (body && body.style.display === 'none') {
    body.style.display = '';
    if (toggleBtn) toggleBtn.classList.remove('collapsed');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function decodeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&#x27;/gi, "'").replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/').replace(/&#47;/gi, '/')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#x(\w+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
function esc(str) {
  if (!str) return '';
  return String(decodeHtml(str))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ─────────────────────────────────────────
   KEYBOARD SHORTCUTS
───────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDetailModal();
    closeAddModal();
  }
});

/* ─────────────────────────────────────────
   VIEW SWITCHER (Pipeline | Rappels | Analyse)
───────────────────────────────────────── */
function openExtension(name) {
  window.location.href = '/' + name;
}

function switchView(view) {
  ['pipeline', 'rappels', 'analyse', 'calendrier', 'extensions', 'abonnement'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = v === view ? '' : 'none';
  });
  document.querySelectorAll('.app-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  if (view === 'rappels')    loadRappels();
  if (view === 'analyse')    loadAnalyse();
  if (view === 'calendrier') renderCalendar();
}

/* ─────────────────────────────────────────
   RAPPELS
───────────────────────────────────────── */
async function loadRappels() {
  const prospects = await apiGet('/api/prospects');
  if (!prospects) return;

  const now     = new Date();
  const today   = new Date(); today.setHours(23,59,59,999);
  const endWeek = new Date(); endWeek.setDate(endWeek.getDate() + 7); endWeek.setHours(23,59,59,999);

  // Build unified agenda items from rappels + meetings
  const items = [];
  const noDateItems = [];
  prospects.forEach(p => {
    if (p.pipeline_stage === 'to_recall' && p.rappel) {
      items.push({ ...p, _agendaDate: p.rappel, _agendaType: 'recall' });
    } else if (p.pipeline_stage === 'to_recall' && !p.rappel) {
      noDateItems.push(p);
    }
    if ((p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed') && p.meeting_date) {
      items.push({ ...p, _agendaDate: p.meeting_date, _agendaType: 'meeting' });
    }
  });

  // Sort chronologically
  items.sort((a, b) => new Date(a._agendaDate) - new Date(b._agendaDate));

  const overdueList = items.filter(p => new Date(p._agendaDate) <= today);
  const weekList    = items.filter(p => { const d = new Date(p._agendaDate); return d > today && d <= endWeek; });
  const laterList   = items.filter(p => new Date(p._agendaDate) > endWeek);

  renderAgendaList('agenda-overdue-list', overdueList, now);
  renderAgendaList('agenda-week-list',    weekList,    now);
  renderAgendaList('agenda-later-list',   laterList,   now);

  const _setAgendaSection = (id, visible) => {
    const el = document.getElementById(id);
    if (!el) return;
    const display = visible ? '' : 'none';
    el._wasDisplay = display; // remember for calendar toggle
    if (agendaView === 'list') el.style.display = display;
  };
  _setAgendaSection('agenda-overdue-section', overdueList.length > 0);
  _setAgendaSection('agenda-week-section',    weekList.length > 0);
  _setAgendaSection('agenda-later-section',   laterList.length > 0);
  _setAgendaSection('rappel-empty',           items.length === 0 && noDateItems.length === 0);

  // Show prospects in to_recall WITHOUT a date (warning section)
  let noDatEl = document.getElementById('agenda-nodate-section');
  if (!noDatEl) {
    noDatEl = document.createElement('div');
    noDatEl.id = 'agenda-nodate-section';
    const emptyEl = document.getElementById('rappel-empty');
    if (emptyEl) emptyEl.parentNode.insertBefore(noDatEl, emptyEl);
    else document.querySelector('.view-rappels')?.appendChild(noDatEl);
  }
  if (noDateItems.length > 0) {
    noDatEl.style.display = agendaView === 'list' ? '' : 'none';
    noDatEl.innerHTML = `<div class="agenda-section-title" style="color:#f59e0b">⚠️ Sans date de rappel (${noDateItems.length})</div>`
      + noDateItems.map(p => `<div class="agenda-card" style="border-left:3px solid #f59e0b;cursor:pointer" onclick="openProspect(${p.id})">
        <div class="agenda-card-name">${p.name || '—'}</div>
        <div class="agenda-card-meta">${p.niche || ''} ${p.city || ''}</div>
        <div style="font-size:.72rem;color:#f59e0b;margin-top:4px">Pas de date — clique pour ajouter un rappel</div>
      </div>`).join('');
  } else {
    noDatEl.style.display = 'none';
    noDatEl.innerHTML = '';
  }

  renderCalendar();

  // Nav dot
  const dot = document.getElementById('nav-notif-dot');
  if (dot) dot.style.display = overdueList.length > 0 ? '' : 'none';

  // Browser notification
  if (overdueList.length > 0 && Notification.permission === 'granted') {
    new Notification('🔔 Empire Leads', {
      body: `${overdueList.length} rappel(s)/RDV prévu(s) aujourd'hui !`,
      icon: '/favicon.ico'
    });
  }
}

function renderAgendaList(containerId, items, now) {
  const el = document.getElementById(containerId);
  if (!el || !items.length) { if (el) el.innerHTML = ''; return; }

  el.innerHTML = items.map(p => {
    const dateStr   = p._agendaDate;
    const d         = new Date(dateStr);
    const hasTime   = dateStr.includes(' ') && dateStr.split(' ')[1] !== '00:00';
    const isOverdue = hasTime && d < now;
    const isMeeting = p._agendaType === 'meeting';

    const timeDisplay = hasTime
      ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '—';
    const dayDisplay = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

    const borderClass = isOverdue ? 'agenda-card-overdue'
                      : isMeeting ? 'agenda-card-meeting'
                      : 'agenda-card-recall';

    const tag = isOverdue
      ? `<span class="agenda-tag tag-overdue">🚨 EN RETARD</span>`
      : isMeeting
        ? `<span class="agenda-tag tag-meeting">📅 RDV</span>`
        : `<span class="agenda-tag tag-recall">🔄 Rappel</span>`;

    const stageLabel = {
      to_recall: 'À Rappeler', meeting_to_set: 'RDV à poser', meeting_confirmed: 'RDV confirmé'
    }[p.pipeline_stage] || p.pipeline_stage;

    const notesPreview = p.notes ? esc(p.notes.substring(0, 60)) + (p.notes.length > 60 ? '…' : '') : '';
    const notesFull    = p.notes && p.notes.length > 60 ? esc(p.notes) : '';

    return `
      <div class="agenda-card ${borderClass}" onclick="openDetail(${p.id})">
        <div class="agenda-hour-col ${isOverdue ? 'hour-overdue' : isMeeting ? 'hour-meeting' : 'hour-recall'}">
          <div class="agenda-hour">${timeDisplay}</div>
          <div class="agenda-day">${dayDisplay}</div>
        </div>
        <div class="agenda-content">
          <div class="agenda-top-row">
            <span class="agenda-name">${esc(p.name || '—')}</span>
            ${tag}
          </div>
          ${p.phone ? `<a class="agenda-phone" href="tel:${escAttr(p.phone)}" onclick="event.stopPropagation()">📞 ${esc(p.phone)}</a>` : ''}
          ${notesPreview ? `
            <div class="agenda-notes-row" onclick="event.stopPropagation()">
              <span class="agenda-notes-preview" id="notes-prev-${p.id}">${notesPreview}</span>
              ${notesFull ? `
                <span class="agenda-notes-full" id="notes-full-${p.id}" style="display:none">${notesFull}</span>
                <button class="agenda-expand-btn" id="expand-btn-${p.id}" onclick="toggleAgendaNotes(${p.id})">▼</button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>`;
  }).join('');
}

function toggleAgendaNotes(id) {
  const prev = document.getElementById(`notes-prev-${id}`);
  const full = document.getElementById(`notes-full-${id}`);
  const btn  = document.getElementById(`expand-btn-${id}`);
  if (!full) return;
  const expanded = full.style.display !== 'none';
  prev.style.display = expanded ? '' : 'none';
  full.style.display = expanded ? 'none' : '';
  btn.textContent    = expanded ? '▼' : '▲';
}

async function requestNotifPerm() {
  if (!('Notification' in window)) { showToast('Notifications non supportées sur ce navigateur', 'error'); return; }
  const perm = await Notification.requestPermission();
  const btn = document.getElementById('btn-notif');
  if (perm === 'granted') {
    btn.textContent = '✅ Notifications activées';
    btn.disabled = true;
    showToast('Notifications activées !', 'success');
    loadRappels();
  } else {
    showToast('Notifications refusées', 'error');
  }
}

/* ─────────────────────────────────────────
   AGENDA VIEW SWITCHER (Liste / Calendrier)
───────────────────────────────────────── */
let agendaView = 'list';
let calendarMonth = new Date();

function switchAgendaView(view) {
  agendaView = view;
  document.getElementById('btn-agenda-list')?.classList.toggle('active', view === 'list');
  document.getElementById('btn-agenda-cal')?.classList.toggle('active', view === 'calendar');
  document.getElementById('agenda-calendar-wrap').style.display = view === 'calendar' ? '' : 'none';
  const listSections = ['agenda-overdue-section', 'agenda-week-section', 'agenda-later-section', 'rappel-empty'];
  listSections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = view === 'list' ? (el._wasDisplay ?? 'none') : 'none';
  });
  if (view === 'calendar') renderCalendar();
}

function getWeekStart(d) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0,0,0,0);
  return mon;
}

function renderCalendar() {
  const cal = document.getElementById('agenda-calendar');
  if (!cal) return;

  const weekStart = new Date(calendarWeek);
  const weekEnd   = new Date(calendarWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23,59,59);

  // Collect all events this week
  const items = [];
  const now = new Date();
  function parseLD(str) {
    if (!str) return null;
    const parts = str.trim().split(' ');
    const [y, m, d] = parts[0].split('-').map(Number);
    return parts[1] ? new Date(y, m-1, d, ...parts[1].split(':').map(Number)) : new Date(y, m-1, d);
  }
  allProspects.forEach(p => {
    if (p.rappel) {
      const d = parseLD(p.rappel);
      if (d && d >= weekStart && d <= weekEnd) {
        items.push({ date: d, p, type: 'rappel' });
      }
    }
    if (p.meeting_date) {
      const d = parseLD(p.meeting_date);
      if (d && d >= weekStart && d <= weekEnd) {
        items.push({ date: d, p, type: 'meeting' });
      }
    }
  });

  const MONTHS_FR = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
  const DAYS_FR   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  const fmt = d => `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
  const title = `${fmt(weekStart)} — ${fmt(weekEnd)} ${weekEnd.getFullYear()}`;

  let html = `
    <div class="wcal-header">
      <button class="wcal-btn" onclick="calNavWeek(-1)">‹</button>
      <div class="wcal-title">${title}</div>
      <button class="wcal-btn wcal-today-btn" onclick="calTodayWeek()">Auj.</button>
      <button class="wcal-btn" onclick="calNavWeek(1)">›</button>
    </div>
    <div class="wcal-body">
  `;

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);

    const isToday = day.toDateString() === now.toDateString();
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const dayItems = items.filter(it => it.date.toDateString() === day.toDateString())
                          .sort((a,b) => a.date - b.date);

    const dayClass = ['wcal-day', isToday ? 'wcal-today' : '', isWeekend ? 'wcal-weekend' : ''].filter(Boolean).join(' ');

    html += `<div class="${dayClass}">
      <div class="wcal-day-header">
        <span class="wcal-day-name">${DAYS_FR[day.getDay()]}</span>
        <span class="wcal-day-num ${isToday ? 'wcal-day-num-today' : ''}">${day.getDate()}</span>
      </div>`;

    if (dayItems.length === 0) {
      html += `<div class="wcal-empty">—</div>`;
    } else {
      dayItems.forEach(it => {
        const timeStr = it.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const cls = it.type === 'meeting' ? 'wcal-evt-meeting' : 'wcal-evt-rappel';
        const name = (it.p.name || '').substring(0, 22);
        html += `<div class="wcal-evt ${cls}" onclick="openDetail(${it.p.id})">
          <span class="wcal-evt-time">${timeStr}</span>
          <span class="wcal-evt-name">${esc(name)}</span>
        </div>`;
      });
    }

    html += `</div>`;
  }

  html += `</div>`;
  cal.innerHTML = html;
}

function calNavWeek(dir) {
  calendarWeek = new Date(calendarWeek);
  calendarWeek.setDate(calendarWeek.getDate() + dir * 7);
  renderCalendar();
}

function calTodayWeek() {
  calendarWeek = getWeekStart(new Date());
  renderCalendar();
}

function calNav(dir) { calNavWeek(dir); }
function calToday()  { calTodayWeek(); }

/* ─────────────────────────────────────────
   AGENDA PANEL (quick view)
───────────────────────────────────────── */
let miniCalMonth = new Date();

function renderMiniCalendar() {
  const wrap = document.getElementById('agenda-panel-calendar');
  if (!wrap) return;
  const now = new Date();

  function parseLD(str) {
    if (!str) return null;
    const parts = str.trim().split(' ');
    const [y, m, d] = parts[0].split('-').map(Number);
    return parts[1] ? new Date(y, m-1, d, ...parts[1].split(':').map(Number)) : new Date(y, m-1, d);
  }

  // Collect all upcoming events (next 30 days)
  const horizon = new Date(now); horizon.setDate(horizon.getDate() + 30);
  const upcoming = [];
  allProspects.forEach(p => {
    if (p.rappel) {
      const d = parseLD(p.rappel);
      if (d && d >= now && d <= horizon) upcoming.push({ date: d, p, type: 'rappel' });
    }
    if (p.meeting_date) {
      const d = parseLD(p.meeting_date);
      if (d && d >= now && d <= horizon) upcoming.push({ date: d, p, type: 'meeting' });
    }
  });
  upcoming.sort((a, b) => a.date - b.date);

  const DAYS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const MONTHS_FR = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];

  let html = `<div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem">📅 Prochains rendez-vous</div>`;

  if (upcoming.length === 0) {
    html += `<div style="text-align:center;color:var(--muted);font-size:.8rem;padding:.75rem 0">Aucun RDV à venir ✌️</div>`;
  } else {
    upcoming.slice(0, 8).forEach(it => {
      const d = it.date;
      const dayLabel = d.toDateString() === now.toDateString() ? "Aujourd'hui" : `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
      const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const isToday = d.toDateString() === now.toDateString();
      const color = it.type === 'meeting' ? 'var(--accent)' : 'var(--text2)';
      const bg = it.type === 'meeting' ? 'var(--accent-soft)' : 'var(--surface)';
      const icon = it.type === 'meeting' ? '📋' : '🔔';
      html += `<div onclick="openDetail(${it.p.id})" style="
        display:flex;align-items:center;gap:.5rem;padding:.45rem .5rem;border-radius:8px;
        background:${bg};border-left:3px solid ${color};margin-bottom:.35rem;cursor:pointer;
        ${isToday ? 'border-color:var(--accent);' : ''}
      ">
        <span style="font-size:.8rem">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.75rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.p.name || '—')}</div>
          <div style="font-size:.68rem;color:var(--muted)">${dayLabel}</div>
        </div>
        <div style="font-size:.75rem;font-weight:800;color:${color};flex-shrink:0">${timeStr}</div>
      </div>`;
    });
  }

  html += `<div style="text-align:center;margin-top:.5rem">
    <button onclick="closeAgenda();switchView('calendrier')" style="background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent);padding:.3rem .9rem;border-radius:7px;font-size:.72rem;font-weight:700;cursor:pointer">Voir le calendrier →</button>
  </div>`;

  wrap.innerHTML = html;
}

function openAgenda() {
  const panel = document.getElementById('agenda-panel');
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
  if (panel.style.display !== 'none') {
    renderAgendaPanel();
    renderMiniCalendar();
  }
}
function closeAgenda() {
  document.getElementById('agenda-panel').style.display = 'none';
}

function renderAgendaPanel() {
  const now = new Date();
  const items = allProspects
    .filter(p => (p.rappel && p.pipeline_stage === 'to_recall') || (p.meeting_date && (p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed')))
    .map(p => ({
      ...p,
      _date: new Date(p.pipeline_stage === 'to_recall' ? p.rappel : p.meeting_date),
      _type: p.pipeline_stage === 'to_recall' ? 'rappel' : 'rdv'
    }))
    .sort((a, b) => a._date - b._date);

  // Update count badge
  const countEl = document.getElementById('agenda-count');
  if (countEl) { countEl.textContent = items.length; countEl.style.display = items.length ? '' : 'none'; }

  const body = document.getElementById('agenda-panel-body');
  if (!items.length) { body.innerHTML = '<div class="agenda-empty">Aucun rappel ou RDV planifié.</div>'; return; }

  body.innerHTML = items.map(p => {
    const isOverdue = p._date < now;
    const dayStr  = p._date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = (p.rappel || p.meeting_date || '').includes(' ')
      ? p._date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const notePreview = p.notes ? p.notes.substring(0, 60) + (p.notes.length > 60 ? '…' : '') : '';
    return `<div class="agenda-item ${isOverdue ? 'agenda-overdue' : ''}" onclick="openDetail(${p.id}); closeAgenda();">
      <div class="agenda-item-time">
        ${isOverdue ? '🔴' : p._type === 'rdv' ? '📅' : '🔄'}
        <strong>${timeStr || '—'}</strong>
        <span class="agenda-item-day">${dayStr}</span>
      </div>
      <div class="agenda-item-name">${esc(p.name || '—')}</div>
      ${notePreview ? `<div class="agenda-item-note">${esc(notePreview)}</div>` : ''}
    </div>`;
  }).join('');
}

/* ─────────────────────────────────────────
   ANALYSE
───────────────────────────────────────── */
async function loadAnalyse() {
  loadFunnelAndGoals(); // async, runs in parallel
  // Pipeline breakdown from allProspects (already loaded)
  const stages = { cold_call: 0, to_recall: 0, meeting: 0, closed: 0, refused: 0 };
  allProspects.forEach(p => {
    if (p.pipeline_stage === 'cold_call')           stages.cold_call++;
    else if (p.pipeline_stage === 'to_recall')      stages.to_recall++;
    else if (p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed') stages.meeting++;
    else if (p.pipeline_stage === 'closed')         stages.closed++;
    else if (p.pipeline_stage === 'refused')        stages.refused++;
  });

  const total = allProspects.length;
  const called = allProspects.filter(p => p.status === 'called').length;
  const rate = total > 0 ? Math.round((stages.closed / total) * 100) : 0;

  const ca = allProspects.filter(p => p.pipeline_stage === 'closed' && p.deal_value > 0)
    .reduce((sum, p) => sum + (p.deal_value || 0), 0);

  document.getElementById('kpi-total').textContent   = total;
  document.getElementById('kpi-called').textContent  = called;
  document.getElementById('kpi-meeting').textContent = stages.meeting;
  document.getElementById('kpi-closed').textContent  = stages.closed;
  document.getElementById('kpi-rate').textContent    = rate + '%';
  const caEl = document.getElementById('kpi-ca');
  if (caEl) caEl.textContent = ca > 0 ? ca.toLocaleString('fr-FR') + ' €' : '0 €';

  // Bars
  const maxVal = Math.max(...Object.values(stages), 1);
  const setPbar = (id, val) => {
    document.getElementById('pbar-' + id).style.width = Math.round((val / maxVal) * 100) + '%';
    document.getElementById('pbar-' + id + '-n').textContent = val;
  };
  setPbar('cold',    stages.cold_call);
  setPbar('recall',  stages.to_recall);
  setPbar('meeting', stages.meeting);
  setPbar('closed',  stages.closed);
  setPbar('refused', stages.refused);

  // Search history
  const searches = await apiGet('/api/prospects/searches');
  const searchEl = document.getElementById('search-history');
  const MODE_META = {
    site:        { label: 'Sans site web',        icon: '🌐', color: '#3b82f6' },
    social:      { label: 'Sans réseaux sociaux', icon: '📱', color: '#a855f7' },
    both:        { label: 'Sans site & réseaux',  icon: '🌐📱', color: '#f59e0b' },
    fewreviews:  { label: 'Peu d\'avis',           icon: '⭐', color: '#f59e0b' },
    owners:      { label: 'Gérants IA',            icon: '🤖', color: '#10b981' },
    new:         { label: 'Récents',               icon: '🆕', color: '#6b7280' },
  };
  if (searchEl) {
    if (searches && searches.length) {
      searchEl.innerHTML = `<div class="sh-list">${searches.slice(0,30).map(s => {
        const d = new Date(s.created_at);
        const when = d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'}) + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
        const meta = MODE_META[s.search_mode] || { label: s.search_mode, icon: '🔍', color: '#6b7280' };
        return `<div class="sh-row">
          <div class="sh-left">
            <div class="sh-niche">${esc(s.niche || '—')}</div>
            <div class="sh-location">${esc(s.country || '')}</div>
          </div>
          <div class="sh-center">
            <span class="sh-mode-badge" style="border-color:${meta.color};color:${meta.color}">${meta.icon} ${meta.label}</span>
          </div>
          <div class="sh-right">
            <span class="sh-count">${s.results_count} résultats</span>
            <span class="sh-date">${when}</span>
          </div>
        </div>`;
      }).join('')}</div>`;
    } else {
      searchEl.innerHTML = '<div class="activity-empty">Aucune recherche enregistrée.</div>';
    }
  }

  // Objection report
  const objData = await apiGet('/api/prospects/analytics/objections');
  const reportEl = document.getElementById('objection-report');
  if (objData && objData.rows && objData.rows.length > 0) {
    const maxObj = Math.max(...objData.rows.map(r => r.count), 1);
    reportEl.innerHTML = `
      <div class="obj-report-total">Sur <strong>${objData.total}</strong> refus total${objData.total > 1 ? 's' : ''} :</div>
      ${objData.rows.map(r => {
        const pct = Math.round((r.count / objData.total) * 100);
        const w   = Math.round((r.count / maxObj) * 100);
        return `<div class="obj-report-row">
          <span class="obj-report-label">${esc(r.objection)}</span>
          <div class="pbar-track"><div class="pbar-fill pbar-refused" style="width:${w}%"></div></div>
          <span class="obj-report-count">${r.count} <small>(${pct}%)</small></span>
        </div>`;
      }).join('')}
    `;
  } else {
    reportEl.innerHTML = '<div class="activity-empty">Pas encore de refus enregistrés.</div>';
  }

  // Activity log
  const data = await apiGet('/api/prospects/analytics');
  if (data && data.activityLog) {
    const logEl = document.getElementById('activity-log');
    if (!data.activityLog.length) {
      logEl.innerHTML = '<div class="activity-empty">Aucune activité récente.</div>';
    } else {
      const actionLabel = { status_change: '🔄 Statut modifié', stage_change: '➡️ Étape changée', manual_add: '➕ Prospect ajouté', search: '🔍 Recherche lancée' };
      logEl.innerHTML = data.activityLog.map(a => {
        const d = new Date(a.created_at);
        const when = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `<div class="activity-row">
          <span class="activity-action">${actionLabel[a.action] || a.action}</span>
          <span class="activity-when">${when}</span>
        </div>`;
      }).join('');
    }
  }
}

/* ─────────────────────────────────────────
   FUNNEL + GOALS + STREAK
───────────────────────────────────────── */
async function loadFunnelAndGoals() {
  // Funnel from allProspects
  const total    = allProspects.length;
  const contacted = allProspects.filter(p => (p.status === 'called' || p.status === 'client')).length;
  const meeting  = allProspects.filter(p => p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed').length;
  const closed   = allProspects.filter(p => p.pipeline_stage === 'closed').length;

  const funnelEl = document.getElementById('conversion-funnel');
  if (funnelEl) {
    const steps = [
      { label: '🎯 Trouvés',   n: total,     color: '#3b82f6' },
      { label: '📞 Contactés', n: contacted, color: '#f59e0b' },
      { label: '📅 RDV',       n: meeting,   color: '#8b5cf6' },
      { label: '✅ Closés',    n: closed,    color: '#10b981' },
    ];
    const maxN = Math.max(total, 1);
    funnelEl.innerHTML = steps.map((s, i) => {
      const prev = steps[i - 1];
      const pct = i === 0 ? null : Math.round((s.n / Math.max(prev.n, 1)) * 100);
      const w = Math.max(Math.round((s.n / maxN) * 100), 6);
      return `<div class="funnel-step">
        ${i > 0 ? `<div class="funnel-arrow">↓ <span class="funnel-conv-pct">${pct}%</span></div>` : ''}
        <div class="funnel-bar-wrap">
          <div class="funnel-bar" style="width:${w}%;background:${s.color}18;border:1.5px solid ${s.color}50">
            <span class="funnel-label" style="color:${s.color}">${s.label}</span>
            <span class="funnel-n" style="color:${s.color}">${s.n}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // Goals + weekly stats
  const stats = await apiGet('/api/prospects/stats');
  if (!stats) return;

  const goals = JSON.parse(localStorage.getItem('ph_goals') || '{}');
  const g = {
    calls:    parseInt(goals.calls)    || 20,
    meetings: parseInt(goals.meetings) || 5,
    deals:    parseInt(goals.deals)    || 2,
    ca:       parseInt(goals.ca)       || 3000,
  };

  const goalRows = [
    { label: '📞 Contacts',  val: stats.callsThisWeek,    goal: g.calls,    unit: '' },
    { label: '📅 RDV',       val: stats.meetingsThisWeek, goal: g.meetings, unit: '' },
    { label: '✅ Deals',     val: stats.dealsThisWeek,    goal: g.deals,    unit: '' },
    { label: '💰 CA',        val: stats.caThisWeek,       goal: g.ca,       unit: ' €' },
  ];

  const streakHtml = stats.streak > 0
    ? `<div class="streak-badge">🔥 ${stats.streak} jour${stats.streak > 1 ? 's' : ''} d'affilée !</div>`
    : '<div class="streak-badge streak-zero">💤 Pas encore d\'activité cette semaine</div>';

  const goalsEl = document.getElementById('goals-display');
  if (goalsEl) {
    goalsEl.innerHTML = streakHtml + goalRows.map(r => {
      const pct = Math.min(Math.round((r.val / r.goal) * 100), 100);
      const color = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#3b82f6';
      const valFmt = r.unit ? (r.val || 0).toLocaleString('fr-FR') + r.unit : r.val;
      const goalFmt = r.unit ? (r.goal || 0).toLocaleString('fr-FR') + r.unit : r.goal;
      return `<div class="goal-row">
        <div class="goal-row-top">
          <span class="goal-label">${r.label}</span>
          <span class="goal-progress-text" style="color:${color}">${valFmt} / ${goalFmt} <small>(${pct}%)</small></span>
        </div>
        <div class="goal-track"><div class="goal-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
    }).join('');
  }
}

function toggleGoalsEdit() {
  const editEl = document.getElementById('goals-edit');
  const isOpen = editEl.style.display !== 'none';
  if (!isOpen) {
    const goals = JSON.parse(localStorage.getItem('ph_goals') || '{}');
    document.getElementById('goal-calls').value    = goals.calls    || 20;
    document.getElementById('goal-meetings').value = goals.meetings || 5;
    document.getElementById('goal-deals').value    = goals.deals    || 2;
    document.getElementById('goal-ca').value       = goals.ca       || 3000;
  }
  editEl.style.display = isOpen ? 'none' : 'block';
}

function saveGoals() {
  const goals = {
    calls:    parseInt(document.getElementById('goal-calls').value)    || 20,
    meetings: parseInt(document.getElementById('goal-meetings').value) || 5,
    deals:    parseInt(document.getElementById('goal-deals').value)    || 2,
    ca:       parseInt(document.getElementById('goal-ca').value)       || 3000,
  };
  localStorage.setItem('ph_goals', JSON.stringify(goals));
  document.getElementById('goals-edit').style.display = 'none';
  loadFunnelAndGoals();
  showToast('Objectifs sauvegardés ✅', 'success');
}

/* ─────────────────────────────────────────
   IMPORT CSV
───────────────────────────────────────── */
let csvParsedRows = [];
let csvHeaders = [];

function openImportModal() {
  document.getElementById('import-modal-overlay').style.display = 'flex';
  resetImport();
}
function closeImportModal() {
  document.getElementById('import-modal-overlay').style.display = 'none';
}
function resetImport() {
  csvParsedRows = []; csvHeaders = [];
  document.getElementById('import-step-upload').style.display = 'block';
  document.getElementById('import-step-preview').style.display = 'none';
  document.getElementById('import-step-done').style.display = 'none';
  const dz = document.getElementById('import-dropzone');
  if (dz) dz.classList.remove('drag-over');
}
function handleCsvDrop(e) {
  e.preventDefault();
  document.getElementById('import-dropzone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleCsvFile(file);
}
function handleCsvFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseCsvContent(e.target.result);
  reader.readAsText(file, 'utf-8');
}
function parseCsvLine(line, sep) {
  const fields = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; continue; }
    if (c === sep && !inQ) { fields.push(cur.trim()); cur = ''; } else cur += c;
  }
  fields.push(cur.trim());
  return fields;
}
function parseCsvContent(text) {
  const t = text.replace(/^\ufeff/, ''); // strip BOM
  const firstLine = t.split('\n')[0];
  const sep = firstLine.includes(';') ? ';' : ',';
  const lines = t.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return showToast('Fichier CSV vide ou invalide', 'error');
  csvHeaders = parseCsvLine(lines[0], sep).map(h =>
    h.toLowerCase().replace(/\s+/g,'_').replace(/[éèê]/g,'e').replace(/[àâ]/g,'a').replace(/ô/g,'o').replace(/[^a-z0-9_]/g,''));
  csvParsedRows = lines.slice(1).map(l => parseCsvLine(l, sep));
  showImportPreview();
}
const CSV_FIELD_MAP = {
  nom:'name', name:'name', entreprise:'name', company:'name', raison_sociale:'name',
  telephone:'phone', tel:'phone', phone:'phone', mobile:'phone', portable:'phone', num:'phone',
  email:'email', mail:'email', courriel:'email',
  adresse:'address', address:'address', rue:'address',
  ville:'city', city:'city', commune:'city',
  notes:'notes', note:'notes', commentaire:'notes', commentaires:'notes',
  secteur:'niche', niche:'niche', activite:'niche', metier:'niche',
  gerant:'owner_name', dirigeant:'owner_name', owner:'owner_name', contact:'owner_name',
};
function showImportPreview() {
  document.getElementById('import-step-upload').style.display = 'none';
  document.getElementById('import-step-preview').style.display = 'block';
  const mappings = csvHeaders.map(h => CSV_FIELD_MAP[h] || '');
  const FIELD_OPTS = ['','name','phone','email','address','city','notes','niche','owner_name'];
  const FIELD_LBL  = {'':'Ignorer','name':'Nom','phone':'Téléphone','email':'Email','address':'Adresse','city':'Ville','notes':'Notes','niche':'Secteur','owner_name':'Gérant'};
  document.getElementById('import-mapping').innerHTML = `
    <div class="import-mapping-title">Correspondance des colonnes</div>
    <div class="import-mapping-grid">${csvHeaders.map((h,i) => `
      <div class="import-col-map">
        <div class="import-col-orig">${esc(h)}</div>
        <select class="import-col-sel" id="col-map-${i}">
          ${FIELD_OPTS.map(f => `<option value="${f}"${mappings[i]===f?' selected':''}>${FIELD_LBL[f]}</option>`).join('')}
        </select>
      </div>`).join('')}
    </div>`;
  const preview = csvParsedRows.slice(0, 8);
  document.getElementById('import-preview-count').textContent = csvParsedRows.length;
  document.getElementById('import-btn-count').textContent = csvParsedRows.length;
  document.getElementById('import-preview-table').innerHTML = `
    <thead><tr>${csvHeaders.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${preview.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
async function doImport() {
  const colMap = csvHeaders.map((_,i) => { const s = document.getElementById(`col-map-${i}`); return s ? s.value : ''; });
  const rows = csvParsedRows.map(fields => {
    const obj = {};
    colMap.forEach((t,i) => { if (t) obj[t] = (fields[i]||'').trim(); });
    return obj;
  }).filter(r => r.name || r.phone);
  if (!rows.length) return showToast('Aucune ligne valide (nom ou téléphone requis)', 'error');
  const btn = document.getElementById('btn-do-import');
  btn.disabled = true; btn.textContent = 'Import en cours…';
  const res = await apiPost('/api/prospects/import', { rows });
  btn.disabled = false;
  if (res?.ok) {
    document.getElementById('import-step-preview').style.display = 'none';
    document.getElementById('import-step-done').style.display = 'block';
    document.getElementById('import-done-msg').textContent =
      `${res.imported} prospect${res.imported > 1 ? 's' : ''} importé${res.imported > 1 ? 's' : ''} ! (${res.skipped} doublons ignorés)`;
  } else {
    showToast(res?.error || 'Erreur import', 'error');
    btn.textContent = '✅ Importer';
  }
}

/* ─────────────────────────────────────────
   DEVIS / QUOTES
───────────────────────────────────────── */
let currentQuoteId = null;
let quoteLines = [];

function openNewQuoteModal() {
  currentQuoteId = null;
  quoteLines = [{ description: '', qty: 1, price: 0 }];
  document.getElementById('quote-modal-title').textContent = '📄 Nouveau devis';
  document.getElementById('btn-quote-pdf').style.display = 'none';
  document.getElementById('btn-send-quote').style.display = 'none';
  document.getElementById('btn-save-draft').textContent = '💾 Créer le devis';
  document.getElementById('q-notes').value = '';
  document.getElementById('q-tva-rate').value = 20;
  // Set default validity: +30 days
  const d = new Date(); d.setDate(d.getDate() + 30);
  document.getElementById('q-valid-until').value = d.toISOString().split('T')[0];
  renderQuoteLines();
  updateQuoteTotals();
  document.getElementById('quote-modal-overlay').style.display = 'flex';
}

function openEditQuoteModal(quoteId) {
  apiGet(`/api/quotes/${quoteId}`).then(q => {
    if (!q) return;
    currentQuoteId = quoteId;
    quoteLines = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []);
    if (!quoteLines.length) quoteLines = [{ description: '', qty: 1, price: 0 }];
    document.getElementById('quote-modal-title').textContent = `📄 Devis N° ${q.number}`;
    document.getElementById('q-notes').value = q.notes || '';
    document.getElementById('q-tva-rate').value = q.tva_rate || 20;
    document.getElementById('q-valid-until').value = q.valid_until || '';
    document.getElementById('btn-quote-pdf').style.display = '';
    document.getElementById('btn-send-quote').style.display = '';
    document.getElementById('btn-save-draft').textContent = '💾 Sauvegarder';
    renderQuoteLines();
    updateQuoteTotals();
    document.getElementById('quote-modal-overlay').style.display = 'flex';
  });
}

function closeQuoteModal() {
  document.getElementById('quote-modal-overlay').style.display = 'none';
}

function renderQuoteLines() {
  const container = document.getElementById('quote-items-list');
  container.innerHTML = quoteLines.map((line, i) => `
    <div class="quote-line" data-idx="${i}">
      <input class="crm-inp quote-line-desc" type="text" placeholder="Description de la prestation…"
        value="${esc(line.description || '')}" oninput="updateQuoteLine(${i},'description',this.value)" />
      <input class="crm-inp quote-line-qty" type="number" min="0.5" step="0.5" placeholder="Qté"
        value="${line.qty || 1}" oninput="updateQuoteLine(${i},'qty',this.value)" />
      <input class="crm-inp quote-line-price" type="number" min="0" step="10" placeholder="Prix HT (€)"
        value="${line.price || ''}" oninput="updateQuoteLine(${i},'price',this.value)" />
      <span class="quote-line-total">${fmtEur((parseFloat(line.qty)||1)*(parseFloat(line.price)||0))}</span>
      <button class="quote-line-del" onclick="removeQuoteLine(${i})" title="Supprimer">✕</button>
    </div>
  `).join('');
}

function updateQuoteLine(idx, field, val) {
  quoteLines[idx][field] = field === 'description' ? val : (parseFloat(val) || 0);
  // Update total cell without full re-render
  const lineEl = document.querySelector(`.quote-line[data-idx="${idx}"] .quote-line-total`);
  if (lineEl) lineEl.textContent = fmtEur((parseFloat(quoteLines[idx].qty)||1)*(parseFloat(quoteLines[idx].price)||0));
  updateQuoteTotals();
}

function addQuoteLine() {
  quoteLines.push({ description: '', qty: 1, price: 0 });
  renderQuoteLines();
  updateQuoteTotals();
}

function removeQuoteLine(idx) {
  if (quoteLines.length <= 1) { quoteLines[0] = { description: '', qty: 1, price: 0 }; renderQuoteLines(); return; }
  quoteLines.splice(idx, 1);
  renderQuoteLines();
  updateQuoteTotals();
}

function updateQuoteTotals() {
  const tvaRate = parseFloat(document.getElementById('q-tva-rate').value) || 20;
  const subtotal = quoteLines.reduce((s, l) => s + (parseFloat(l.qty)||1)*(parseFloat(l.price)||0), 0);
  const tva   = Math.round(subtotal * tvaRate) / 100;
  const total = subtotal + tva;
  document.getElementById('quote-totals-preview').innerHTML = `
    <div class="qt-row"><span>Sous-total HT</span><span>${fmtEur(subtotal)}</span></div>
    <div class="qt-row"><span>TVA (${tvaRate}%)</span><span>${fmtEur(tva)}</span></div>
    <div class="qt-row qt-total"><span>TOTAL TTC</span><span>${fmtEur(total)}</span></div>
  `;
}

async function saveQuote(status = 'draft') {
  if (!currentProspect) return;
  const payload = {
    prospect_id: currentProspect.id,
    items: quoteLines,
    tva_rate: parseFloat(document.getElementById('q-tva-rate').value) || 20,
    notes: document.getElementById('q-notes').value.trim(),
    valid_until: document.getElementById('q-valid-until').value,
    status,
  };

  let res;
  if (currentQuoteId) {
    res = await apiPut(`/api/quotes/${currentQuoteId}`, payload);
    showToast('Devis mis à jour', 'success');
  } else {
    res = await apiPost('/api/quotes', payload);
    if (res?.id) {
      currentQuoteId = res.id;
      document.getElementById('btn-quote-pdf').style.display = '';
      document.getElementById('btn-send-quote').style.display = '';
      document.getElementById('btn-save-draft').textContent = '💾 Sauvegarder';
      showToast(`Devis ${res.number} créé`, 'success');
    }
  }
  loadProspectQuotes(currentProspect.id);
}

async function downloadQuotePDF() {
  if (!currentQuoteId) return;
  await saveQuote();
  window.open(`/api/quotes/${currentQuoteId}/pdf`, '_blank');
}

async function sendQuoteEmail() {
  if (!currentQuoteId || !currentProspect) return;
  await saveQuote();
  const email = currentProspect.email || '';
  const to = email || prompt('Email du prospect ?');
  if (!to) return;
  const res = await apiPost(`/api/quotes/${currentQuoteId}/send`, { email: to });
  if (res?.ok) {
    showToast(res.warning ? res.warning : 'Devis envoyé par email ✅', res.warning ? 'info' : 'success');
    loadProspectQuotes(currentProspect.id);
  } else {
    showToast(res?.error || 'Erreur envoi email', 'error');
  }
}

async function deleteQuote(quoteId) {
  if (!confirm('Supprimer ce devis ?')) return;
  await apiDelete(`/api/quotes/${quoteId}`);
  showToast('Devis supprimé', 'info');
  loadProspectQuotes(currentProspect.id);
}

async function loadProspectQuotes(prospectId) {
  const listEl = document.getElementById('devis-list');
  if (!listEl) return;
  const loadEl = document.getElementById('devis-list-loading');
  if (loadEl) loadEl.style.display = 'block';

  const all = await apiGet('/api/quotes');
  if (loadEl) loadEl.style.display = 'none';

  const quotes = (all || []).filter(q => q.prospect_id === prospectId);

  if (!quotes.length) {
    listEl.innerHTML = '<div class="activity-empty">Aucun devis pour ce prospect.<br>Cliquez sur "+ Nouveau devis" pour en créer un.</div>';
    return;
  }

  const STATUS_COLORS = { draft: '#6b7280', sent: '#3b82f6', accepted: '#10b981', refused: '#ef4444' };
  const STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', refused: 'Refusé' };

  listEl.innerHTML = quotes.map(q => {
    const sc = STATUS_COLORS[q.status] || '#6b7280';
    const sl = STATUS_LABELS[q.status] || q.status;
    const date = new Date(q.created_at).toLocaleDateString('fr-FR');
    return `<div class="devis-row">
      <div class="devis-row-left">
        <div class="devis-num">N° ${q.number}</div>
        <div class="devis-date">${date}</div>
      </div>
      <div class="devis-row-center">
        <span class="devis-status-badge" style="background:${sc}20;color:${sc};border-color:${sc}40">${sl}</span>
        <span class="devis-total">${fmtEur(q.total)}</span>
      </div>
      <div class="devis-row-actions">
        <button class="btn-devis-edit" onclick="openEditQuoteModal(${q.id})" title="Modifier">✏️</button>
        <a class="btn-devis-pdf" href="/api/quotes/${q.id}/pdf" target="_blank" title="Télécharger PDF">📥</a>
        <button class="btn-devis-del" onclick="deleteQuote(${q.id})" title="Supprimer">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function fmtEur(n) {
  return (parseFloat(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
}

/* ─────────────────────────────────────────
   CUSTOM THEMES
───────────────────────────────────────── */
const THEMES = {
  naruto: {
    accent: '#FF6B00', accentHover: '#FF8C00', accentLight: 'rgba(255,107,0,.12)',
    accentSoft: 'rgba(255,107,0,.08)', accentBorder: 'rgba(255,107,0,.35)',
    quotes: ['Believe it! 🍥', 'Dattebayo!', 'Je ne reviens jamais sur ma parole!', 'Le vrai pouvoir, c\'est de protéger ceux qu\'on aime', 'Shadow Clone Jutsu! 🌀', 'Rasengan! ⚡'],
    label: '🍥 Naruto'
  },
  manga: {
    accent: '#8B5CF6', accentHover: '#A78BFA', accentLight: 'rgba(139,92,246,.12)',
    accentSoft: 'rgba(139,92,246,.08)', accentBorder: 'rgba(139,92,246,.35)',
    quotes: ['Plus Ultra! 💥', 'Omae wa mou shindeiru', 'Tatakae! ⚔️', 'Je deviendrai le roi des pirates! 🏴‍☠️', 'Bankai! 🗡️', 'Kamehameha! 🔥'],
    label: '🎌 Manga'
  },
  goggins: {
    accent: '#DC2626', accentHover: '#EF4444', accentLight: 'rgba(220,38,38,.12)',
    accentSoft: 'rgba(220,38,38,.08)', accentBorder: 'rgba(220,38,38,.35)',
    quotes: ['STAY HARD! 💪', 'Who\'s gonna carry the boats?!', 'Callous your mind!', 'You don\'t know me, son!', 'Never finished! 🔥', 'Embrace the suck!'],
    label: '💪 Goggins'
  },
  candy: {
    accent: '#EC4899', accentHover: '#F472B6', accentLight: 'rgba(236,72,153,.12)',
    accentSoft: 'rgba(236,72,153,.08)', accentBorder: 'rgba(236,72,153,.35)',
    quotes: ['Sweet! 🍬', 'Sugar Rush! 🍭', 'Yum! 🍩', 'Power Up! ⭐', 'Wahoo! 🎉', 'Let\'s Go! 🚀'],
    label: '🍬 Candy'
  },
  wolf: {
    accent: '#3B82F6', accentHover: '#60A5FA', accentLight: 'rgba(59,130,246,.12)',
    accentSoft: 'rgba(59,130,246,.08)', accentBorder: 'rgba(59,130,246,.35)',
    quotes: ['Sell me this pen! 🖊️', 'The show goes on! 💵', 'Wolf Mode! 🐺', 'Close the deal!', 'Grind! 💰', 'Let\'s hustle! 🔥'],
    label: '🐺 Wolf'
  }
};

let _customThemeActive = false;
let _quoteInterval = null;

function toggleCustomTheme() {
  if (_customThemeActive) {
    removeCustomTheme();
  } else {
    applyCustomTheme(window._userTheme);
  }
}

function applyCustomTheme(themeId) {
  const t = THEMES[themeId];
  if (!t) return;
  _customThemeActive = true;
  localStorage.setItem('custom_theme_active', '1');
  document.documentElement.setAttribute('data-custom-theme', themeId);

  // Override CSS variables
  const r = document.documentElement.style;
  r.setProperty('--accent', t.accent);
  r.setProperty('--accent-hover', t.accentHover);
  r.setProperty('--accent-light', t.accentLight);
  r.setProperty('--accent-soft', t.accentSoft);
  r.setProperty('--accent-border', t.accentBorder);

  // Update button text
  const btn = document.getElementById('btn-theme-perso');
  if (btn) btn.innerHTML = '✨ ' + t.label;

  // Show rotating quotes
  _startQuotes(t.quotes);

  showToast(t.label + ' activé!', 'success');
}

function removeCustomTheme() {
  _customThemeActive = false;
  localStorage.setItem('custom_theme_active', '0');
  document.documentElement.removeAttribute('data-custom-theme');

  // Reset CSS variables
  const r = document.documentElement.style;
  ['--accent','--accent-hover','--accent-light','--accent-soft','--accent-border'].forEach(v => r.removeProperty(v));

  // Reset button
  const btn = document.getElementById('btn-theme-perso');
  if (btn) btn.innerHTML = '🎨 Mon thème';

  // Stop quotes
  _stopQuotes();

  showToast('Thème par défaut restauré', 'info');
}

function _startQuotes(quotes) {
  _stopQuotes();
  // Create floating quote element
  let el = document.getElementById('theme-quote-float');
  if (!el) {
    el = document.createElement('div');
    el.id = 'theme-quote-float';
    el.className = 'theme-quote-float';
    document.body.appendChild(el);
  }
  el.style.display = 'block';
  let idx = 0;
  const show = () => {
    el.textContent = quotes[idx % quotes.length];
    el.classList.remove('theme-quote-in');
    void el.offsetWidth;
    el.classList.add('theme-quote-in');
    idx++;
  };
  show();
  _quoteInterval = setInterval(show, 6000);
}

function _stopQuotes() {
  if (_quoteInterval) { clearInterval(_quoteInterval); _quoteInterval = null; }
  const el = document.getElementById('theme-quote-float');
  if (el) el.style.display = 'none';
}

/* ─────────────────────────────────────────
   START
───────────────────────────────────────── */
init();
