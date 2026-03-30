/* Empire Leads — Login Page Logic */

// If already logged in, redirect
if (localStorage.getItem('ph_token')) {
  window.location.href = '/app';
}

// Referral code from URL
const urlParams = new URLSearchParams(window.location.search);
const tabParam = urlParams.get('tab');
if (tabParam) {
  setTimeout(() => showTab(tabParam), 100);
}

const refCode = urlParams.get('ref');
if (refCode) {
  setTimeout(() => {
    showTab('register');
    showSuccess('Vous avez ete invite ! Inscrivez-vous pour recevoir 5 credits bonus.');
  }, 100);
}

// Reset token from email link
const resetToken = urlParams.get('reset');
if (resetToken) {
  setTimeout(() => {
    showTab('reset');
    const tokenInput = document.getElementById('reset-token');
    if (tokenInput) tokenInput.value = resetToken;
  }, 100);
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('on', i === (tab === 'login' ? 0 : 1)));
  document.querySelector('.tabs').style.display = (tab === 'forgot' || tab === 'reset') ? 'none' : 'flex';
  ['login', 'register', 'forgot', 'reset'].forEach(f => {
    document.getElementById('form-' + f).classList.toggle('on', f === tab);
  });
  hideMessages();
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg; el.classList.add('on');
  document.getElementById('success').classList.remove('on');
}
function showSuccess(msg) {
  const el = document.getElementById('success');
  el.textContent = msg; el.classList.add('on');
  document.getElementById('error').classList.remove('on');
}
function hideMessages() {
  document.getElementById('error').classList.remove('on');
  document.getElementById('success').classList.remove('on');
}

async function doLogin() {
  hideMessages();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!email || !password) return showError('Remplissez tous les champs.');

  document.getElementById('btn-login').disabled = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return showError(data.error || 'Erreur de connexion.');

    localStorage.setItem('ph_token', data.token);
    localStorage.setItem('ph_user', JSON.stringify(data.user));
    window.location.href = '/app';
  } catch (err) {
    showError('Erreur réseau.');
  } finally {
    document.getElementById('btn-login').disabled = false;
  }
}

async function doRegister() {
  hideMessages();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pass').value;
  const password2 = document.getElementById('reg-pass2').value;

  if (!email || !password || !password2) return showError('Remplissez tous les champs.');
  if (password !== password2) return showError('Les mots de passe ne correspondent pas.');
  if (password.length < 6) return showError('Mot de passe : 6 caractères minimum.');

  document.getElementById('btn-register').disabled = true;
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ email, password, referral_code: refCode || undefined }),
    });
    const data = await res.json();
    if (!res.ok) return showError(data.error || "Erreur lors de l'inscription.");

    localStorage.setItem('ph_token', data.token);
    localStorage.setItem('ph_user', JSON.stringify(data.user));
    window.location.href = '/app';
  } catch (err) {
    showError('Erreur réseau.');
  } finally {
    document.getElementById('btn-register').disabled = false;
  }
}

async function doForgot() {
  hideMessages();
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return showError('Entrez votre email.');

  document.getElementById('btn-forgot').disabled = true;
  try {
    const res = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) return showError(data.error || 'Erreur.');

    if (data.token) {
      document.getElementById('reset-token').value = data.token;
    }
    showTab('reset');
    showSuccess('Lien envoyé ! ' + (data.token ? 'Token (dev) : ' + data.token : 'Vérifiez votre email.'));
  } catch (err) {
    showError('Erreur réseau.');
  } finally {
    document.getElementById('btn-forgot').disabled = false;
  }
}

async function doReset() {
  hideMessages();
  const token = document.getElementById('reset-token').value.trim();
  const password = document.getElementById('reset-pass').value;
  const password2 = document.getElementById('reset-pass2').value;

  if (!token || !password || !password2) return showError('Remplissez tous les champs.');
  if (password !== password2) return showError('Les mots de passe ne correspondent pas.');
  if (password.length < 6) return showError('Mot de passe : 6 caractères minimum.');

  document.getElementById('btn-reset').disabled = true;
  try {
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) return showError(data.error || 'Erreur.');

    showTab('login');
    showSuccess('Mot de passe réinitialisé ! Connectez-vous.');
  } catch (err) {
    showError('Erreur réseau.');
  } finally {
    document.getElementById('btn-reset').disabled = false;
  }
}

// Enter key support
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const active = ['login', 'register', 'forgot', 'reset'].find(f =>
      document.getElementById('form-' + f).classList.contains('on')
    );
    if (active === 'login') doLogin();
    else if (active === 'register') doRegister();
    else if (active === 'forgot') doForgot();
    else if (active === 'reset') doReset();
  }
});
