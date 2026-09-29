// URL de ressource → URL embarquable (fonction pure) + domaines connus pour refuser l'iframe.
export const EMBED_BLOCKED = ['shotgun.live'];

const blocked = (kind, openUrl) => ({ kind, embedUrl: null, blocked: true, openUrl });

/** Nom court affiché sur les pastilles de ressource (les libellés du seed sont tous « Ressource »). */
export function resourceName(raw) {
  const kind = toEmbedUrl(raw).kind;
  const known = { slides: 'Slides', sheets: 'Sheet', docs: 'Doc', drive: 'Fichier', soundcloud: 'Son' };
  if (known[kind]) return known[kind];
  try {
    const h = new URL(raw).hostname.replace(/^www\./, '').split('.')[0];
    return h.charAt(0).toUpperCase() + h.slice(1);
  } catch { return 'Lien'; }
}

export function toEmbedUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return blocked('invalid', null); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return blocked('invalid', null);

  const host = u.hostname.replace(/^www\./, '');
  const open = u.href;
  const ok = (kind, embedUrl) => ({ kind, embedUrl, blocked: false, openUrl: open });

  if (EMBED_BLOCKED.some(h => host === h || host.endsWith('.' + h))) return blocked('blocked', open);

  if (host === 'docs.google.com') {
    let m = u.pathname.match(/^\/presentation\/d\/([\w-]+)/);
    if (m) return ok('slides', `https://docs.google.com/presentation/d/${m[1]}/embed`);
    m = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
    if (m) {
      const gid = u.searchParams.get('gid') || (u.hash.match(/gid=(\d+)/) || [])[1];
      return ok('sheets', `https://docs.google.com/spreadsheets/d/${m[1]}/preview${gid ? `?gid=${gid}` : ''}`);
    }
    m = u.pathname.match(/^\/document\/d\/([\w-]+)/);
    if (m) return ok('docs', `https://docs.google.com/document/d/${m[1]}/preview`);
  }

  if (host === 'drive.google.com') {
    const m = u.pathname.match(/^\/file\/d\/([\w-]+)/);
    if (m) return ok('drive', `https://drive.google.com/file/d/${m[1]}/preview`);
  }

  if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
    return ok('soundcloud', `https://w.soundcloud.com/player/?url=${encodeURIComponent(open)}&auto_play=false&visual=true`);
  }

  return ok('other', open);
}
