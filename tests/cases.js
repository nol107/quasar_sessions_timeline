// Cas de test partagés entre tests.html (navigateur) et tests/run.mjs (Node).
import { toEmbedUrl, resourceName } from '../js/embed.js';
import { mergeStates } from '../js/merge.js';
import { relLabel, isLate, daysBetween, addDays } from '../js/util.js';

export function run(t) {
  // ---- toEmbedUrl : chaque URL du seed ----
  const e = toEmbedUrl('https://docs.google.com/presentation/d/18hh_tmPF5VMCcpiCuhplJwQPfRp-MN6OVZZYHipewQ0/edit?usp=sharing');
  t.eq('slides', e.embedUrl, 'https://docs.google.com/presentation/d/18hh_tmPF5VMCcpiCuhplJwQPfRp-MN6OVZZYHipewQ0/embed');

  t.eq('sheets sans gid', toEmbedUrl('https://docs.google.com/spreadsheets/d/1NJdhvZ2-EoQpY3eR3DuN9tUNipgawkl_WVZpkmAwxdY/edit?usp=sharing').embedUrl,
    'https://docs.google.com/spreadsheets/d/1NJdhvZ2-EoQpY3eR3DuN9tUNipgawkl_WVZpkmAwxdY/preview');
  t.eq('sheets avec gid (hash)', toEmbedUrl('https://docs.google.com/spreadsheets/d/13ZtK-BWEqG52Ipsx-0Hx25R-MlY-HWE29Si7c0M-kcU/edit?gid=0#gid=0').embedUrl,
    'https://docs.google.com/spreadsheets/d/13ZtK-BWEqG52Ipsx-0Hx25R-MlY-HWE29Si7c0M-kcU/preview?gid=0');
  t.eq('drive', toEmbedUrl('https://drive.google.com/file/d/1ud7OiksBlcr7wc5D_K3h7lCHXQxTB7Yo/view').embedUrl,
    'https://drive.google.com/file/d/1ud7OiksBlcr7wc5D_K3h7lCHXQxTB7Yo/preview');

  const sc = toEmbedUrl('https://on.soundcloud.com/k35wD0pMbPjnd7zarL');
  t.eq('soundcloud widget', sc.embedUrl.startsWith('https://w.soundcloud.com/player/?url=https%3A%2F%2Fon.soundcloud.com%2Fk35wD0pMbPjnd7zarL'), true);

  const sg = toEmbedUrl('https://shotgun.live/events/quasar-session-vol-2-release-party');
  t.eq('shotgun bloqué', [sg.blocked, sg.embedUrl, sg.openUrl.includes('shotgun.live')], [true, null, true]);
  t.eq('autre → iframe directe', toEmbedUrl('https://example.com/x').blocked, false);
  t.eq('javascript: refusé', toEmbedUrl('javascript:alert(1)').blocked, true);
  t.eq('url invalide', toEmbedUrl('pas une url').openUrl, null);

  t.eq('noms de pastilles', [
    resourceName('https://docs.google.com/presentation/d/abc/edit'), resourceName('https://docs.google.com/spreadsheets/d/abc/edit'),
    resourceName('https://drive.google.com/file/d/abc/view'), resourceName('https://on.soundcloud.com/x'), resourceName('https://shotgun.live/events/y'),
  ], ['Slides', 'Sheet', 'Fichier', 'Son', 'Shotgun']);

  // ---- mergeStates ----
  const T = (id, updatedAt, extra = {}) => ({ id, title: id, updatedAt, deleted: false, ...extra });
  const S = (updatedAt, tasks) => ({ project: {}, categories: [], people: [], updatedAt, tasks });
  const A = '2026-01-01T00:00:00.000Z', B = '2026-01-02T00:00:00.000Z', C = '2026-01-03T00:00:00.000Z';

  let m = mergeStates(S(B, [T('a', B, { status: 'done' }), T('b', A)]), S(C, [T('a', A), T('b', C, { status: 'doing' })]), S(A, [T('a', A), T('b', A)]));
  t.eq('2 tâches différentes modifiées → les 2 survivent', m.state.tasks.map(x => `${x.id}:${x.status ?? '-'}`).sort(), ['a:done', 'b:doing']);
  t.eq('pas de conflit', m.conflicts.length, 0);

  m = mergeStates(S(B, [T('a', A), T('local-new', B)]), S(C, [T('a', A), T('remote-new', C)]), S(A, [T('a', A)]));
  t.eq('ajouts des deux côtés conservés', m.state.tasks.map(x => x.id).sort(), ['a', 'local-new', 'remote-new']);

  m = mergeStates(S(A, [T('a', A)]), S(B, [T('a', B, { deleted: true })]), S(A, [T('a', A)]));
  t.eq('tombstone distant respecté', m.state.tasks[0].deleted, true);

  m = mergeStates(S(C, [T('a', C, { title: 'local' })]), S(B, [T('a', B, { deleted: true })]), S(A, [T('a', A)]));
  t.eq('suppression vs modif plus récente : modif gagne + conflit', [m.state.tasks[0].title, m.state.tasks[0].deleted, m.conflicts.length], ['local', false, 1]);

  m = mergeStates(S(B, [T('a', B, { title: 'local' })]), S(C, [T('a', C, { title: 'remote' })]), S(A, [T('a', A)]));
  t.eq('même tâche modifiée 2 fois → la plus récente + conflit', [m.state.tasks[0].title, m.conflicts[0].loser.title], ['remote', 'local']);

  m = mergeStates(S(B, [T('a', B, { title: 'x' })]), S(A, [T('a', A)]), null);
  t.eq('sans base : LWW sans conflit', [m.state.tasks[0].title, m.conflicts.length], ['x', 0]);

  // ---- dates ----
  t.eq('J-6', relLabel('2026-10-05', 'todo', '2026-09-29').text, 'J-6');
  t.eq('retard', [relLabel('2026-09-26', 'todo', '2026-09-29').text, relLabel('2026-09-26', 'todo', '2026-09-29').cls], ['en retard de 3 j', 'late']);
  t.eq("aujourd'hui", relLabel('2026-09-29', 'doing', '2026-09-29').text, "aujourd'hui");
  t.eq('fait jamais en retard', [relLabel('2026-09-01', 'done', '2026-09-29').cls, isLate({ deadline: '2026-09-01', status: 'done' }, '2026-09-29')], ['done', false]);
  t.eq('daysBetween / addDays (passage heure d\'été)', [daysBetween('2026-10-24', '2026-10-26'), addDays('2026-10-30', 3)], [2, '2026-11-02']);
}
