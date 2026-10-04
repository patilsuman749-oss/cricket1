/** Theme: applied before first paint by an inline script in index.html; this module keeps it in sync. */
const KEY = 'cricket1-theme';

export function getTheme() {
  try { const saved = localStorage.getItem(KEY); if (saved === 'dark' || saved === 'light') return saved; } catch { /* private mode */ }
  return 'light';
}
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1529' : '#0f5bd7');
}
export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* still applies for this session */ }
  applyTheme(theme);
  return theme;
}
export function toggleTheme() { return setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
