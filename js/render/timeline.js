// Rétroplanning en colonnes : une colonne par semaine, cartes courtes, jalons intégrés.
// Colonnes spéciales : « En retard » (rouge), « Plus tard » (après la party ou sans date).
import { esc, daysBetween, addDays, fmtDate, initials, isLate } from '../util.js';
import { liveTasks, matches, byDeadline, hasFilters } from './list.js';
import { resourceName } from '../embed.js';

const weekStart = d => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));

export function renderTimeline(state, today, filters, maxH) {
  const miles = [...state.project.milestones].sort((a, b) => a.date.localeCompare(b.date));
  if (!miles.length) return '';
  const w0 = weekStart(today);
  const wEnd = weekStart(miles[miles.length - 1].date);
  const cat = Object.fromEntries(state.categories.map(c => [c.id, c.color]));

  const weeks = [];
  for (let w = w0; daysBetween(w, wEnd) >= 0; w = addDays(w, 7)) weeks.push({ kind: 'week', start: w, items: [] });
  const past = { kind: 'past', items: [] }, late = { kind: 'late', items: [] }, later = { kind: 'later', items: [] };
  const weekOf = d => Math.floor(daysBetween(w0, d) / 7);

  for (const t of liveTasks(state).filter(t => matches(t, filters)).sort(byDeadline)) {
    if (!t.deadline) { later.items.push({ date: '', task: t }); continue; }
    const i = weekOf(t.deadline);
    const target = isLate(t, today) ? late : i < 0 ? past : i >= weeks.length ? later : weeks[i];
    target.items.push({ date: t.deadline, task: t });
  }
  for (const m of miles) {
    const i = weekOf(m.date);
    if (i >= 0 && i < weeks.length) weeks[i].items.push({ date: m.date, ms: m });
  }

  const cols = [past, late, ...weeks, later].filter(c => c.kind === 'week' || c.items.length);
  const full = !hasFilters(filters);
  const h = maxH;

  return `<div class="board" style="${full ? `height:${h}px` : `max-height:${h}px`}">${cols.map(c => column(c, today, w0, cat)).join('')}</div>`;
}

function column(c, today, w0, cat) {
  const tasks = c.items.filter(i => i.task);
  const hasMs = c.items.some(i => i.ms);
  const isNow = c.kind === 'week' && c.start === w0;
  const kicker = {
    week: isNow ? 'Cette semaine' : `Sem. du ${fmtDate(c.start, { day: 'numeric', month: 'short' })}`,
    late: 'En retard', later: 'Plus tard', past: 'Déjà fait',
  }[c.kind];
  const empty = !c.items.length;
  const grow = empty ? 0 : hasMs && !tasks.length ? 0.9 : 1 + tasks.length * 0.1;

  // Regroupement par jour (jalons avant les tâches du même jour).
  const days = new Map();
  for (const it of [...c.items].sort((a, b) => a.date.localeCompare(b.date) || (a.ms ? -1 : 1))) {
    if (!days.has(it.date)) days.set(it.date, []);
    days.get(it.date).push(it);
  }
  const dayFmt = c.kind === 'week' ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' };
  const body = [...days].map(([date, its]) => `
    <div class="day"><h4>${date ? esc(fmtDate(date, dayFmt)) : 'Sans date'}</h4>
      ${its.map(it => it.ms ? milestone(it.ms) : card(it.task, cat)).join('')}</div>`).join('');

  return `<section class="col ${c.kind}${isNow ? ' now' : ''}${empty ? ' empty' : ''}" style="flex-grow:${grow}">
    <header><span class="kicker">${kicker}</span>${tasks.length ? `<b>${tasks.length}</b>` : ''}</header>
    <div class="col-body">${body || (isNow ? '<p class="nothing">Rien de prévu</p>' : '')}</div></section>`;
}

function milestone(m) {
  const [main, sub] = m.label.split(' — ');
  return `<div class="ms"><b>${esc(main)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
}

const STAT = { todo: 'À faire', doing: 'En cours', done: 'Fait' };

function card(t, cat) {
  const who = t.owners.map(initials).join(' ');
  const res = t.resources.filter(r => r.url).map(r =>
    `<button type="button" class="rchip" data-act="open" data-url="${esc(r.url)}" data-label="${esc(r.label || t.title)}" title="Ouvrir : ${esc(r.label || r.url)}">↗ ${esc(resourceName(r.url))}</button>`).join('');
  return `<article class="bc st-${t.status}" style="--c:${esc(cat[t.category] || '#888')}">
    <button type="button" class="bc-main" data-act="goto" data-id="${t.id}"><span class="bc-t">${esc(t.title)}</span></button>
    ${res ? `<div class="bc-res">${res}</div>` : ''}
    <div class="bc-m"><span class="stat">${STAT[t.status]}</span>${who ? `<em>${esc(who)}</em>` : ''}</div>
  </article>`;
}
