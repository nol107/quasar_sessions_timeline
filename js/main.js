// Bootstrap, état d'UI (filtres, dépliages, panneau) et délégation d'événements.
import * as store from './store.js';
import { renderList, detail, liveTasks, STATUS, NEXT, hasFilters, matches } from './render/list.js';
import { renderTimeline } from './render/timeline.js';
import { toEmbedUrl } from './embed.js';
import { initSettings } from './settings.js';
import { esc, todayStr, daysBetween, fmtDate } from './util.js';

const $ = s => document.querySelector(s);
const listEl = $('#list');
const panel = $('#panel');

// ---- état d'UI --------------------------------------------------------------
const filters = readUrl();
const expanded = new Set();
const collapsedInFilter = new Set();
const collapsedSecs = new Set();
let panelId = null;
let seed;

function readUrl() {
  const p = new URLSearchParams(location.search);
  const csv = k => (p.get(k) || '').split(',').filter(Boolean);
  // Les tâches faites sont masquées par défaut ; ?done=1 les affiche.
  return { cats: csv('cat'), statuses: csv('status'), owner: p.get('owner') || '', prio: p.get('prio') || '', hideDone: p.get('done') !== '1', q: p.get('q') || '' };
}

function writeUrl() {
  const p = new URLSearchParams();
  if (filters.cats.length) p.set('cat', filters.cats.join(','));
  if (filters.statuses.length) p.set('status', filters.statuses.join(','));
  if (filters.owner) p.set('owner', filters.owner);
  if (filters.prio) p.set('prio', filters.prio);
  if (!filters.hideDone) p.set('done', '1');
  if (filters.q) p.set('q', filters.q);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

const isExpanded = id => expanded.has(id) || (filters.cats.length > 0 && !collapsedInFilter.has(id));
const toggle = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

// ---- rendu ------------------------------------------------------------------
function renderHeader(state) {
  const today = todayStr();
  $('#hdr-info').innerHTML = [...state.project.milestones].sort((a, b) => a.date.localeCompare(b.date)).map(m => {
    const n = daysBetween(today, m.date);
    const big = n > 0 ? `J-${n}` : n === 0 ? 'Jour J' : 'Passé';
    return `<div class="cd${n < 0 ? ' past' : ''}"><b>${big}</b><span class="kicker">${esc(m.label.split(' — ')[0])}</span><small>${esc(fmtDate(m.date, { day: 'numeric', month: 'long' }))}</small></div>`;
  }).join('');

  const tasks = liveTasks(state);
  const tab = (act, cat, color, label, n, on) => `
    <button type="button" class="cat-tab${on ? ' on' : ''}" data-act="${act}" data-cat="${cat}" style="--c:${color}" aria-pressed="${on}">
      <span class="sq"></span>${esc(label)}<small>${n}</small></button>`;
  const open = t => t.status !== 'done';
  $('#cats').innerHTML = tab('filter-all', '', 'var(--fg)', 'Tout', tasks.filter(open).length, !filters.cats.length) +
    state.categories.map(c => tab('filter-cat', c.id, esc(c.color), c.label, tasks.filter(t => t.category === c.id && open(t)).length, filters.cats.includes(c.id))).join('') +
    `<span class="cats-sum">${tasks.filter(t => t.status === 'done').length} / ${tasks.length} faites</span>`;
}

function buildFilters(state) {
  $('#filters').innerHTML = `
    <select id="f-status" aria-label="Statut"><option value="">Tous les statuts</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
    <select id="f-owner" aria-label="Responsable"><option value="">Tous les respos</option>${state.people.map(p => `<option>${esc(p)}</option>`).join('')}</select>
    <select id="f-prio" aria-label="Priorité"><option value="">Toutes priorités</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}">Priorité ${n}</option>`).join('')}</select>
    <label class="chk"><input type="checkbox" id="f-done"> Afficher les faites</label>
    <input type="search" id="f-q" placeholder="Rechercher…" aria-label="Recherche">
    <button type="button" class="tg" id="f-reset" hidden>Réinitialiser</button>`;
  $('#f-status').value = filters.statuses.length === 1 ? filters.statuses[0] : '';
  $('#f-owner').value = filters.owner;
  $('#f-prio').value = filters.prio;
  $('#f-done').checked = !filters.hideDone;
  $('#f-q').value = filters.q;
}

const syncFilterUi = () => { $('#f-reset').hidden = !hasFilters(filters); };

function renderTimelineOnly() {
  // Tableau : 80 % de la hauteur de fenêtre, sans dépasser le bas de l'écran (min 60 %).
  const vh = window.innerHeight;
  const maxH = Math.max(Math.round(vh * 0.6), Math.min(Math.round(vh * 0.8), vh - $('#timeline').offsetTop - 12));
  $('#timeline').innerHTML = renderTimeline(store.getState(), todayStr(), filters, maxH);
}

function renderListOnly() {
  listEl.innerHTML = renderList(store.getState(), {
    filters, isExpanded, collapsedSecs, editable: store.isEditable(), today: todayStr(),
  });
}

function renderAll() {
  renderHeader(store.getState());
  renderTimelineOnly();
  syncFilterUi();
  renderListOnly();
  if (panel.open) renderPanel();
}

// ---- panneau de détail ------------------------------------------------------
function renderPanel() {
  const state = store.getState();
  const t = store.getTask(panelId);
  if (!t || t.deleted) return panel.close();
  const c = state.categories.find(x => x.id === t.category);
  const ed = store.isEditable();
  const top = panel.scrollTop;
  panel.innerHTML = `
    <div class="pn-head">
      <span class="kicker" style="--c:${esc(c?.color || '#888')}"><span class="sq"></span>${esc(c?.label || '')}</span>
      <button type="button" class="btn sm" data-act="close-panel">Fermer</button>
    </div>
    <input type="text" class="pn-title" data-field="title" data-id="${t.id}" value="${esc(t.title)}" aria-label="Titre"${ed ? '' : ' disabled'}>
    ${detail(t, state, { editable: ed, panel: true })}`;
  panel.scrollTop = top;
}

function openPanel(id) {
  panelId = id;
  renderPanel();
  if (!panel.open) panel.showModal();
}
panel.addEventListener('close', () => { panelId = null; });
panel.addEventListener('click', e => { if (e.target === panel) panel.close(); });

// ---- statut de sync ---------------------------------------------------------
const SYNC_LABEL = {
  synced: ['Synchronisé', 'ok'], syncing: ['Synchronisation…', 'wait'], dirty: ['Modifs non envoyées', 'warn'],
  offline: ['Hors ligne', 'warn'], conflict: ['Conflit résolu', 'warn'], error: ['Erreur de sync', 'err'],
  local: ['Local uniquement', 'muted'], readonly: ['Lecture seule', 'muted'],
};
function renderSync(status, msg) {
  const [label, cls] = SYNC_LABEL[status];
  const b = $('#sync');
  b.className = `sync ${cls}`;
  b.textContent = label;
  b.title = msg || (status === 'local' || status === 'readonly' ? 'Configurer la synchronisation' : 'Synchroniser maintenant');
  $('#save').hidden = !(status === 'dirty' || status === 'error');
}

// ---- toasts -----------------------------------------------------------------
function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.append(Object.assign(document.createElement('span'), { textContent: msg }));
  if (action) {
    const b = Object.assign(document.createElement('button'), { className: 'btn sm', textContent: action.label });
    b.onclick = () => { action.run(); el.remove(); };
    el.append(b);
  }
  const x = Object.assign(document.createElement('button'), { className: 'btn sm ghost', textContent: 'Fermer' });
  x.onclick = () => el.remove();
  el.append(x);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 12000);
}

// ---- overlay ressources -----------------------------------------------------
const ov = $('#overlay'), frame = $('#ov-frame');
let ovTimer;
function openResource(url, label) {
  const r = toEmbedUrl(url);
  if (r.kind === 'invalid') return toast('URL invalide ou non supportée');
  if (r.blocked) return window.open(r.openUrl, '_blank', 'noopener,noreferrer');
  $('#ov-title').textContent = label || url;
  $('#ov-open').href = $('#ov-open2').href = r.openUrl;
  $('#ov-hint').hidden = true;
  $('#ov-loading').hidden = false;
  frame.src = r.embedUrl;
  clearTimeout(ovTimer);
  ovTimer = setTimeout(() => ($('#ov-hint').hidden = false), 4000);
  ov.showModal();
}
frame.addEventListener('load', () => { if (frame.src !== 'about:blank') $('#ov-loading').hidden = true; });
const closeOverlay = () => { clearTimeout(ovTimer); frame.src = 'about:blank'; };
ov.addEventListener('close', closeOverlay);
$('#ov-close').onclick = () => ov.close();
ov.addEventListener('click', e => { if (e.target === ov) ov.close(); });

// ---- interactions -----------------------------------------------------------
function resetFilters() {
  Object.assign(filters, { cats: [], statuses: [], owner: '', prio: '', q: '' });
  $('#f-status').value = ''; $('#f-owner').value = ''; $('#f-prio').value = ''; $('#f-q').value = '';
  onFilterChange();
}

function onFilterChange() { writeUrl(); renderAll(); }

document.addEventListener('click', e => {
  if (e.target.id === 'f-reset') return resetFilters();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id, cat } = el.dataset;
  switch (act) {
    case 'cycle': store.updateTask(id, { status: NEXT[store.getTask(id).status] }); break;
    case 'toggle-row':
      if (isExpanded(id)) { expanded.delete(id); collapsedInFilter.add(id); }
      else { expanded.add(id); collapsedInFilter.delete(id); }
      renderListOnly(); break;
    case 'toggle-sec':
      collapsedSecs.has(cat) ? collapsedSecs.delete(cat) : collapsedSecs.add(cat);
      renderListOnly(); break;
    case 'add': {
      const nid = store.addTask(cat);
      openPanel(nid);
      const inp = panel.querySelector('.pn-title');
      inp?.focus(); inp?.select();
      break;
    }
    case 'del': {
      const t = store.getTask(id);
      if (confirm(`Supprimer « ${t.title} » ?`)) store.deleteTask(id);
      break;
    }
    case 'res-add': store.updateTask(id, { resources: [...store.getTask(id).resources, { label: 'Ressource', url: '' }] }); break;
    case 'res-del': store.updateTask(id, { resources: store.getTask(id).resources.filter((_, i) => i !== +el.dataset.idx) }); break;
    case 'open': openResource(el.dataset.url, el.dataset.label); break;
    case 'goto': openPanel(id); break;
    case 'close-panel': panel.close(); break;
    case 'filter-cat': filters.cats = toggle(filters.cats, cat); collapsedInFilter.clear(); onFilterChange(); break;
    case 'filter-all': filters.cats = []; collapsedInFilter.clear(); onFilterChange(); break;
  }
});

function applyField(el, silent) {
  const { id, field, idx } = el.dataset;
  const t = store.getTask(id);
  if (!t) return;
  let patch;
  if (field === 'priority') patch = { priority: +el.value };
  else if (field === 'owner') {
    const s = new Set(t.owners);
    el.checked ? s.add(el.value) : s.delete(el.value);
    patch = { owners: [...s] };
  } else if (field === 'res-label' || field === 'res-url') {
    const resources = t.resources.map(r => ({ ...r }));
    resources[+idx][field === 'res-label' ? 'label' : 'url'] = el.value;
    patch = { resources };
  } else patch = { [field]: el.value };
  store.updateTask(id, patch, { silent });
}

// Champs texte : sauvegarde silencieuse (le re-rendu casserait le focus), puis on rafraîchit
// seulement l'en-tête et le tableau quand le champ perd le focus.
const TEXT = new Set(['title', 'notes', 'res-label', 'res-url']);

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.field && TEXT.has(el.dataset.field)) return applyField(el, true);
  if (el.id !== 'f-q') return;
  filters.q = el.value; writeUrl(); syncFilterUi(); renderTimelineOnly(); renderListOnly();
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.field) {
    if (!TEXT.has(el.dataset.field)) return applyField(el, false);
    applyField(el, true);
    renderHeader(store.getState()); renderTimelineOnly();
    if (el.dataset.field === 'title') listEl.querySelectorAll(`.ttl[data-id="${el.dataset.id}"]`).forEach(b => (b.textContent = el.value));
    return;
  }
  if (el.id === 'f-status') filters.statuses = el.value ? [el.value] : [];
  else if (el.id === 'f-owner') filters.owner = el.value;
  else if (el.id === 'f-prio') filters.prio = el.value;
  else if (el.id === 'f-done') filters.hideDone = !el.checked;
  else return;
  onFilterChange();
});

$('#sync').onclick = () => {
  const { status } = store.getStatus();
  status === 'local' || status === 'readonly' ? settings.open() : store.sync();
};
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderTimelineOnly, 150); });
$('#save').onclick = () => store.sync();
$('#btn-settings').onclick = () => settings.open();

// ---- démarrage --------------------------------------------------------------
const settings = initSettings($('#settings'), { toast, getSeed: () => store.getState() });

async function boot() {
  seed = await (await fetch('data/seed-data.json')).json();
  store.init(seed);
  // Vue d'ensemble d'abord : sections du bas repliées tant qu'aucune catégorie n'est choisie.
  store.getState().categories.forEach(c => collapsedSecs.add(c.id));
  buildFilters(store.getState());
  store.subscribe(renderAll);
  store.onStatus(renderSync);
  store.onConflicts(cs => cs.forEach(c => toast(`Conflit résolu sur « ${c.title} »`, {
    label: 'Restaurer l\'autre version', run: () => store.restoreVersion(c.loser),
  })));
  renderSync(...Object.values(store.getStatus()));
  renderAll();
  store.sync();

  // Refresh léger toutes les 60 s quand l'onglet est visible, et au retour sur l'onglet.
  setInterval(() => document.visibilityState === 'visible' && store.sync(), 60000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && store.sync());
}

boot().catch(err => {
  listEl.innerHTML = `<p class="muted empty">Impossible de charger les données : ${esc(err.message)}.<br>Les modules ES ne fonctionnent pas en <code>file://</code> : lance <code>python -m http.server</code>.</p>`;
});
