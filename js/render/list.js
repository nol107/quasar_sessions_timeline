// Rendu de la liste des tâches groupées par catégorie (HTML string, délégation d'événements dans main.js).
import { esc, relLabel, fmtDate, initials, isLate } from '../util.js';
import { resourceName } from '../embed.js';

export const STATUS = {
  todo: { label: 'À faire', glyph: '○' },
  doing: { label: 'En cours', glyph: '◐' },
  done: { label: 'Fait', glyph: '●' },
};
export const NEXT = { todo: 'doing', doing: 'done', done: 'todo' };

export const liveTasks = state => state.tasks.filter(t => !t.deleted);

/** Filtres actifs (hors « masquer les faites », qui est le réglage par défaut). */
export function hasFilters(f) {
  return !!(f.cats.length || f.statuses.length || f.owner || f.prio || f.q);
}

export function matches(t, f) {
  if (f.cats.length && !f.cats.includes(t.category)) return false;
  if (f.statuses.length && !f.statuses.includes(t.status)) return false;
  if (f.hideDone && t.status === 'done' && !f.statuses.includes('done')) return false;
  if (f.owner && !t.owners.includes(f.owner)) return false;
  if (f.prio && String(t.priority) !== String(f.prio)) return false;
  if (f.q) {
    const hay = `${t.title} ${t.notes} ${t.owners.join(' ')}`.toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

export const byDeadline = (a, b) =>
  (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.priority - b.priority || a.title.localeCompare(b.title);

const opts = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');

/** Formulaire de détail d'une tâche (liste du bas, ou panneau latéral avec ctx.panel). */
export function detail(t, state, ctx) {
  const ed = ctx.editable;
  const pid = ctx.panel ? 'p' : 'd';
  const dis = ed ? '' : ' disabled';
  const owners = state.people.map(p =>
    `<label class="chk"><input type="checkbox" data-field="owner" data-id="${t.id}" value="${esc(p)}"${t.owners.includes(p) ? ' checked' : ''}${dis}> ${esc(p)}</label>`).join('');

  const resources = t.resources.map((r, i) => `
    <div class="res">
      <input type="text" data-field="res-label" data-id="${t.id}" data-idx="${i}" value="${esc(r.label)}" placeholder="Libellé" aria-label="Libellé de la ressource"${dis}>
      <input type="url" data-field="res-url" data-id="${t.id}" data-idx="${i}" value="${esc(r.url)}" placeholder="https://…" aria-label="URL de la ressource"${dis}>
      <button type="button" class="btn sm primary" data-act="open" data-url="${esc(r.url)}" data-label="${esc(r.label || t.title)}">Ouvrir en overlay</button>
      ${ed ? `<button type="button" class="btn sm ghost" data-act="res-del" data-id="${t.id}" data-idx="${i}" aria-label="Supprimer la ressource">✕</button>` : ''}
    </div>`).join('');

  return `
  <div class="detail${ctx.panel ? ' in-panel' : ''}" id="${pid}-${t.id}">
    <div class="grid">
      ${ctx.panel ? '' : `<label class="f wide">Titre
        <input type="text" data-field="title" data-id="${t.id}" value="${esc(t.title)}"${dis}></label>`}
      <label class="f">Catégorie
        <select data-field="category" data-id="${t.id}"${dis}>${opts(state.categories.map(c => [c.id, c.label]), t.category)}</select></label>
      <label class="f">Deadline
        <input type="date" data-field="deadline" data-id="${t.id}" value="${esc(t.deadline)}"${dis}></label>
      <label class="f">Priorité
        <select data-field="priority" data-id="${t.id}"${dis}>${opts([1, 2, 3, 4, 5].map(n => [n, n === 1 ? '1 — le plus urgent' : String(n)]), t.priority)}</select></label>
      <label class="f">Statut
        <select data-field="status" data-id="${t.id}"${dis}>${opts(Object.entries(STATUS).map(([k, v]) => [k, v.label]), t.status)}</select></label>
      <fieldset class="f wide"><legend>Responsables</legend><div class="chks">${owners}</div></fieldset>
      <label class="f wide">Notes
        <textarea rows="3" data-field="notes" data-id="${t.id}"${dis}>${esc(t.notes)}</textarea></label>
    </div>
    <div class="resources"><h4>Ressources</h4>${resources || '<p class="muted">Aucune ressource.</p>'}
      ${ed ? `<button type="button" class="btn sm" data-act="res-add" data-id="${t.id}">+ Ressource</button>` : ''}</div>
    ${ed ? `<div class="danger"><button type="button" class="btn sm danger-btn" data-act="del" data-id="${t.id}">Supprimer la tâche</button></div>` : ''}
  </div>`;
}

function row(t, state, ctx) {
  const open = ctx.isExpanded(t.id);
  const rel = relLabel(t.deadline, t.status, ctx.today);
  const s = STATUS[t.status];
  const late = isLate(t, ctx.today);
  const owners = t.owners.map(o => `<span class="av" title="${esc(o)}">${esc(initials(o))}</span>`).join('');
  return `
  <li class="task st-${t.status}${late ? ' is-late' : ''}" data-id="${t.id}">
    <div class="row">
      <button type="button" class="stbtn st-${t.status}" data-act="cycle" data-id="${t.id}"
        ${ctx.editable ? '' : 'disabled'} aria-label="Statut : ${s.label}. Cliquer pour changer" title="Cliquer pour changer le statut">${s.label}</button>
      <button type="button" class="ttl" data-act="toggle-row" data-id="${t.id}" aria-expanded="${open}" aria-controls="d-${t.id}">${esc(t.title)}</button>
      <span class="meta">
        <span class="due ${rel.cls}" title="${esc(fmtDate(t.deadline))}">${esc(rel.text)}</span>
        <span class="owners">${owners}</span>
        ${t.resources.filter(r => r.url).map(r => `<button type="button" class="rchip" data-act="open" data-url="${esc(r.url)}" data-label="${esc(r.label || t.title)}" title="Ouvrir : ${esc(r.label || r.url)}">↗ ${esc(resourceName(r.url))}</button>`).join('')}
      </span>
    </div>
    ${open ? detail(t, state, ctx) : ''}
  </li>`;
}

export function renderList(state, ctx) {
  const f = ctx.filters;
  const filtered = hasFilters(f) || f.hideDone;
  const tasks = liveTasks(state).filter(t => matches(t, f)).sort(byDeadline);
  let html = '';

  for (const c of state.categories) {
    const all = liveTasks(state).filter(t => t.category === c.id);
    const mine = tasks.filter(t => t.category === c.id);
    if (filtered && !mine.length) continue;
    const collapsed = ctx.collapsedSecs.has(c.id) && !f.cats.includes(c.id);
    const done = all.filter(t => t.status === 'done').length;
    html += `
    <section class="cat" style="--c:${esc(c.color)}" aria-labelledby="h-${c.id}">
      <h2 id="h-${c.id}"><button type="button" data-act="toggle-sec" data-cat="${c.id}" aria-expanded="${!collapsed}">
        <span class="dot"></span><span class="lbl">${esc(c.label)}</span>
        <span class="count">${done}/${all.length}</span><span class="chev" aria-hidden="true">▾</span></button></h2>
      ${collapsed ? '' : `<ul class="tasks">${mine.map(t => row(t, state, ctx)).join('') || '<li class="muted empty">Aucune tâche.</li>'}</ul>
      ${ctx.editable ? `<button type="button" class="btn sm add" data-act="add" data-cat="${c.id}">+ Tâche</button>` : ''}`}
    </section>`;
  }
  return html || '<p class="muted empty">Aucune tâche ne correspond à ces filtres.</p>';
}
