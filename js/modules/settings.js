// settings.js — theme helpers only (module removed; settings live in Profile)
export function getTheme() {
  return localStorage.getItem('eb_theme') || 'dark';
}
export function applyTheme(t) {
  document.body.classList.toggle('theme-y2k', t === 'y2k');
  localStorage.setItem('eb_theme', t);
}
applyTheme(getTheme());
