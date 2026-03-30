/* Empire Leads — Theme Toggle (light/dark) */
(function () {
  const STORAGE_KEY = 'ph-theme';

  function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Update meta theme-color
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#09090B' : '#FFFFFF';
    // Update toggle button icon if present
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function setTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }

  window.toggleTheme = function () {
    const current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
  };

  window.getTheme = getTheme;
  window.setTheme = setTheme;

  // Apply immediately (no flash)
  applyTheme(getTheme());
})();
