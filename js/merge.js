// Merge par tâche (fonction pure). Le updatedAt le plus récent gagne, les tombstones se propagent.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Signature de contenu, indépendante de l'ordre des tâches et du updatedAt global. */
export function sig(s) {
  const tasks = [...s.tasks].sort((a, b) => (a.id < b.id ? -1 : 1));
  return JSON.stringify({ p: s.project, c: s.categories, pe: s.people, t: tasks });
}

/**
 * @param local  état local
 * @param remote état distant
 * @param base   dernier état synchronisé (null si inconnu) — sert à détecter les vrais conflits
 * @returns {{state, conflicts: {id, title, winner, loser}[]}}
 */
export function mergeStates(local, remote, base = null) {
  const lm = new Map(local.tasks.map(t => [t.id, t]));
  const rm = new Map(remote.tasks.map(t => [t.id, t]));
  const bm = new Map((base?.tasks || []).map(t => [t.id, t]));
  const tasks = [];
  const conflicts = [];

  for (const id of new Set([...lm.keys(), ...rm.keys()])) {
    const l = lm.get(id), r = rm.get(id);
    if (!l) { tasks.push(r); continue; }
    if (!r) { tasks.push(l); continue; }
    if (same(l, r)) { tasks.push(l); continue; }

    const winner = l.updatedAt >= r.updatedAt ? l : r;
    const loser = winner === l ? r : l;
    const b = bm.get(id);
    if (b && l.updatedAt > b.updatedAt && r.updatedAt > b.updatedAt) {
      conflicts.push({ id, title: winner.title, winner, loser });
    }
    tasks.push(winner);
  }

  // Méta (projet, catégories, personnes) : l'état le plus récent l'emporte.
  const meta = local.updatedAt >= remote.updatedAt ? local : remote;
  return {
    state: {
      ...meta,
      updatedAt: local.updatedAt >= remote.updatedAt ? local.updatedAt : remote.updatedAt,
      tasks,
    },
    conflicts,
  };
}
