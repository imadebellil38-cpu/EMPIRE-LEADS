/* Empire Leads — Pricing Page Logic */

const token = localStorage.getItem('ph_token');
if (!token) window.location.href = '/login';

const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'X-Requested-With': 'XMLHttpRequest' };
let currentPlan = 'free';

async function init() {
  try {
    const res = await fetch('/api/me', { headers });
    if (!res.ok) { window.location.href = '/login'; return; }
    const { user } = await res.json();
    currentPlan = user.plan || 'free';
    updateUI();
  } catch { window.location.href = '/login'; }
}

function updateUI() {
  ['free', 'pro', 'enterprise'].forEach(p => {
    const btn = document.getElementById('btn-' + p);
    const tag = document.getElementById('tag-' + p);
    if (p === currentPlan) {
      btn.disabled = true;
      btn.textContent = 'Plan actuel';
      tag.style.display = 'block';
    } else {
      btn.disabled = false;
      btn.textContent = p === 'free' ? 'Downgrade' : 'Choisir ' + p.charAt(0).toUpperCase() + p.slice(1);
      tag.style.display = 'none';
    }
  });

  const manageBtn = document.getElementById('btn-manage');
  if (manageBtn) {
    manageBtn.style.display = (currentPlan !== 'free') ? '' : 'none';
  }
}

async function upgrade(plan) {
  if (plan === currentPlan) return;

  try {
    const statusRes = await fetch('/api/stripe/status', { headers });
    const status = await statusRes.json();

    if (status.enabled && status.packs[plan]?.configured) {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST', headers,
        body: JSON.stringify({ pack: plan }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Erreur'); return; }
      window.location.href = data.url;
      return;
    }
  } catch {}

  try {
    const res = await fetch('/api/subscription/upgrade', {
      method: 'PUT', headers,
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Erreur'); return; }
    currentPlan = plan;
    updateUI();
    setTimeout(() => { window.location.href = '/app'; }, 500);
  } catch (e) { alert('Erreur de connexion.'); }
}

async function manageSubscription() {
  alert('Gestion de l\'abonnement disponible depuis le dashboard Stripe.');
}

init();

// Handle success/cancel from Stripe
const params = new URLSearchParams(window.location.search);
if (params.get('success') === '1') {
  setTimeout(() => {
    alert('Paiement réussi ! Votre plan a été mis à jour.');
    window.location.href = '/app';
  }, 500);
}
