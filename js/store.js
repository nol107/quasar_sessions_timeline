// État local (localStorage) + synchronisation offline-first avec le Gist.
import { mergeStates, sig } from './merge.js';
import * as gist from './gist.js';
import { nowIso, uid, todayStr } from './util.js';

const K = { state: 'ep2.state.v1', meta: 'ep2.meta.v1', cfg: 'ep2.cfg.v1' };
const rd = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota / mode privé */ } };
const clone = o => JSON.parse(JSON.stringify(o));

// Gist ID en dur, VOLONTAIREMENT : le site n'est connu que de l'équipe et les données ne sont pas critiques.
// Un ID seul donne uniquement la lecture ; l'écriture exige toujours le token, saisi dans Réglages (jamais commité).
const DEFAULT_GIST_ID = '';

let state, base = null, dirty = false;
let cfg = { token: '', ...rd(K.cfg, {}) };
cfg.gistId = cfg.gistId || DEFAULT_GIST_ID;
let status = 'local', statusMsg = '';
let editCount = 0, timer = null, syncing = false, again = false;
const dataSubs = new Set(), statusSubs = new Set(), conflictSubs = new Set();

export const subscribe = fn => (dataSubs.add(fn), () => dataSubs.delete(fn));
export const onStatus = fn => (statusSubs.add(fn), () => statusSubs.delete(fn));
export const onConflicts = fn => (conflictSubs.add(fn), () => conflictSubs.delete(fn));

const emitData = () => dataSubs.forEach(f => f(state));
const emitStatus = () => statusSubs.forEach(f => f(status, statusMsg));

export function migrate(s, defaultTs) {
  const ts = new Date(defaultTs || s.updatedAt || nowIso()).toISOString();
  return {
    schemaVersion: 1,
    project: s.project, categories: s.categories, people: s.people || [],
    updatedAt: new Date(s.updatedAt || ts).toISOString(),
    tasks: (s.tasks || []).map(t => ({
      notes: '', owners: [], resources: [], deadline: '', status: 'todo', priority: 3,
      ...t,
      updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : ts,
      deleted: !!t.deleted,
    })),
  };
}

export function init(seed) {
  const cached = rd(K.state, null);
  const meta = rd(K.meta, {});
  if (cached) {
    state = migrate(cached);
    base = meta.base || null;
    dirty = !!meta.dirty;
    // Jalons, catégories et personnes ne sont pas éditables dans l'UI : le seed fait foi.
    // Si le seed a changé, on l'applique et on avance updatedAt pour que le changement se propage au gist.
    const conf = s => JSON.stringify({ p: s.project, c: s.categories, pe: s.people });
    if (conf(state) !== conf(seed)) {
      Object.assign(state, { project: seed.project, categories: seed.categories, people: seed.people || [], updatedAt: nowIso() });
      dirty = true;
      persist();
    }
  } else {
    // Avec un gist configuré, les tâches du seed doivent perdre face au distant.
    state = migrate(seed, cfg.gistId ? '1970-01-01T00:00:00.000Z' : undefined);
  }
  refreshStatus();
  return state;
}

const persist = () => { wr(K.state, state); wr(K.meta, { base, dirty }); };

// ---- lecture ---------------------------------------------------------------
export const getState = () => state;
export const getTask = id => state.tasks.find(t => t.id === id);
export const getConfig = () => ({ ...cfg });
export const getStatus = () => ({ status, msg: statusMsg });
/** Éditable en local pur ou avec un token ; lecture seule si gist sans token. */
export const isEditable = () => !cfg.gistId || !!cfg.token;

// ---- édition ---------------------------------------------------------------
function touch() {
  state.updatedAt = nowIso();
  editCount++; dirty = true;
  persist();
  refreshStatus();
  if (cfg.gistId && cfg.token) scheduleSync(1500);
}

export function updateTask(id, patch, { silent = false } = {}) {
  const t = getTask(id);
  if (!t || !isEditable()) return;
  Object.assign(t, patch, { updatedAt: nowIso() });
  touch();
  if (!silent) emitData();
}

export function addTask(category) {
  const t = {
    id: uid(), category, title: 'Nouvelle tâche', priority: 3, deadline: todayStr(),
    status: 'todo', owners: [], notes: '', resources: [], updatedAt: nowIso(), deleted: false,
  };
  state.tasks.push(t);
  touch(); emitData();
  return t.id;
}

/** Suppression = tombstone, pour que la suppression se propage au merge. */
export function deleteTask(id) { updateTask(id, { deleted: true }); }

export function restoreVersion(task) {
  const t = getTask(task.id);
  if (!t) return;
  Object.assign(t, clone(task), { updatedAt: nowIso() });
  touch(); emitData();
}

// ---- config ----------------------------------------------------------------
export function setConfig(next) {
  cfg = { gistId: (next.gistId || '').trim() || DEFAULT_GIST_ID, token: (next.token || '').trim() };
  wr(K.cfg, cfg);
  base = null;
  persist(); refreshStatus(); emitData();
  return sync();
}

export async function bootstrapGist(seed) {
  if (!cfg.token) throw new Error('Token requis pour créer un gist');
  const id = await gist.createGist(cfg.token, migrate(state || seed));
  await setConfig({ gistId: id, token: cfg.token });
  return id;
}

// ---- import / export -------------------------------------------------------
export const exportJson = () => JSON.stringify(state, null, 2);

export function importJson(text) {
  const inc = migrate(JSON.parse(text));
  if (!Array.isArray(inc.tasks) || !inc.categories) throw new Error('Fichier invalide');
  const ts = nowIso(), ids = new Set(inc.tasks.map(t => t.id));
  const gone = state.tasks.filter(t => !ids.has(t.id)).map(t => ({ ...t, deleted: true, updatedAt: ts }));
  state = { ...inc, updatedAt: ts, tasks: [...inc.tasks.map(t => ({ ...t, updatedAt: ts })), ...gone] };
  touch(); emitData();
}

// ---- statut ----------------------------------------------------------------
function setStatus(s, msg = '') { status = s; statusMsg = msg; emitStatus(); }

export function refreshStatus() {
  if (!cfg.gistId) return setStatus('local');
  if (!cfg.token) return setStatus('readonly');
  if (!navigator.onLine) return setStatus('offline');
  setStatus(dirty ? 'dirty' : 'synced');
}

// ---- sync ------------------------------------------------------------------
function scheduleSync(ms) { clearTimeout(timer); timer = setTimeout(sync, ms); }

const errMsg = e =>
  e.status === 401 ? 'Token invalide ou expiré' :
  e.status === 404 ? 'Gist introuvable (ID ou token sans accès)' :
  e.status === 403 ? 'Accès refusé ou limite de débit atteinte' :
  e.message;

export async function sync() {
  if (!cfg.gistId) return refreshStatus();
  if (syncing) { again = true; return; }
  if (!navigator.onLine) return setStatus('offline');

  syncing = true; clearTimeout(timer); setStatus('syncing');
  const startEdits = editCount;
  let ok = false;
  try {
    // 1. re-GET systématique : on ne pousse jamais sans avoir vu le distant.
    const remote = migrate(await gist.fetchGist(cfg.gistId, cfg.token));
    // 2-3. merge par tâche, conflits détectés par rapport à la dernière base synchronisée.
    const { state: merged, conflicts } = mergeStates(state, remote, base);
    const changedLocal = sig(merged) !== sig(state);
    const needPush = sig(merged) !== sig(remote);
    state = merged;
    const sent = clone(state);
    if (needPush && cfg.token) await gist.pushGist(cfg.gistId, cfg.token, sent);
    base = sent;
    dirty = editCount !== startEdits;
    persist();
    ok = true;
    if (changedLocal) emitData();
    if (conflicts.length) conflictSubs.forEach(f => f(conflicts));
  } catch (e) {
    if (e instanceof TypeError) setStatus('offline');           // fetch réseau
    else setStatus('error', errMsg(e));
  } finally {
    syncing = false;
    if (ok) refreshStatus();
    if (again || (ok && dirty)) { again = false; scheduleSync(300); }
  }
}

addEventListener('online', () => sync());
addEventListener('offline', () => refreshStatus());
