// Accès brut à l'API Gists. Aucune logique de merge ici (voir merge.js / store.js).
const API = 'https://api.github.com';
export const FILE = 'ep2-retroplanning.json';

async function req(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchGist(id, token) {
  const g = await req(`/gists/${encodeURIComponent(id)}`, { token });
  const f = g.files?.[FILE];
  if (!f) throw Object.assign(new Error(`Fichier ${FILE} introuvable dans le gist`), { status: 422 });
  const content = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
  return JSON.parse(content);
}

export const pushGist = (id, token, state) =>
  req(`/gists/${encodeURIComponent(id)}`, {
    token, method: 'PATCH',
    body: { files: { [FILE]: { content: JSON.stringify(state, null, 2) } } },
  });

export async function createGist(token, state) {
  const g = await req('/gists', {
    token, method: 'POST',
    body: {
      description: 'QUASAR SESSIONS EP.2 — rétroplanning',
      public: false,
      files: { [FILE]: { content: JSON.stringify(state, null, 2) } },
    },
  });
  return g.id;
}
