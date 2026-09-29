// Utilitaires purs (dates, échappement HTML). Testés dans tests/cases.js.
export const DAY = 86400000;
const pad = n => String(n).padStart(2, '0');

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

export function addDays(s, n) {
  const d = new Date(parseDate(s) + n * DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!s) return '—';
  return new Date(parseDate(s)).toLocaleDateString('fr-FR', { ...opts, timeZone: 'UTC' });
}

/** Libellé de deadline : « J-6 », « en retard de 3 j », etc. */
export function relLabel(deadline, status, today = todayStr()) {
  if (!deadline) return { text: 'sans date', cls: 'none', n: null };
  if (status === 'done') return { text: fmtDate(deadline), cls: 'done', n: null };
  const n = daysBetween(today, deadline);
  if (n < 0) return { text: `en retard de ${-n} j`, cls: 'late', n };
  if (n === 0) return { text: "aujourd'hui", cls: 'today', n };
  return { text: `J-${n}`, cls: n <= 3 ? 'soon' : '', n };
}

export const isLate = (t, today = todayStr()) =>
  !!t.deadline && t.status !== 'done' && daysBetween(today, t.deadline) < 0;

export const initials = name => (name || '?').trim().slice(0, 2);

export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
export const nowIso = () => new Date().toISOString();
