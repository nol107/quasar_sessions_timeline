// Dialogue ⚙️ : Gist ID + token (localStorage uniquement), création du gist, export / import.
import * as store from './store.js';
import { esc } from './util.js';

export function initSettings(dlg, { toast, getSeed }) {
  function render() {
    const c = store.getConfig();
    dlg.innerHTML = `
    <form method="dialog" class="dlg-body" id="settings-form">
      <header class="dlg-head"><h2>Réglages</h2><button type="button" class="btn sm" data-close>Fermer</button></header>
      <p class="muted">Ces valeurs restent dans le <code>localStorage</code> de ce navigateur, jamais commitées.
        Tout le monde édite avec le <strong>même token partagé</strong> ; sans token, l'app est en lecture seule (si un Gist ID est renseigné).</p>
      <label class="f">Gist ID
        <input type="text" name="gistId" value="${esc(c.gistId)}" autocomplete="off" spellcheck="false" placeholder="ex. 1a2b3c…"></label>
      <label class="f">Token GitHub (fine-grained, permission « Gists : Read and write » uniquement)
        <input type="password" name="token" value="${esc(c.token)}" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
      <p class="muted">⚠ Un gist « secret » n'est pas privé : quiconque a l'URL peut le lire. N'y mets rien de sensible.</p>
      <div class="actions">
        <button type="submit" class="btn primary" value="save">Enregistrer</button>
        <button type="button" class="btn" id="btn-create" ${c.token ? '' : 'disabled'} title="Nécessite un token">Créer le gist à partir des données actuelles</button>
      </div>
      <hr>
      <div class="actions">
        <button type="button" class="btn" id="btn-export">Exporter JSON</button>
        <label class="btn">Importer JSON<input type="file" accept="application/json,.json" id="file-import" hidden></label>
        <button type="button" class="btn" id="btn-reset">Repartir du seed (local)</button>
      </div>
    </form>`;
  }

  dlg.addEventListener('click', async e => {
    if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
    const id = e.target.id;
    if (id === 'btn-export') {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' })),
        download: `ep2-retroplanning-${new Date().toISOString().slice(0, 10)}.json`,
      });
      a.click(); URL.revokeObjectURL(a.href);
    }
    if (id === 'btn-create') {
      try {
        const f = new FormData(dlg.querySelector('form'));
        await store.setConfig({ gistId: '', token: f.get('token') });
        const newId = await store.bootstrapGist(getSeed());
        toast(`Gist créé : ${newId}`);
        render();
      } catch (err) { toast(`Création impossible : ${err.message}`); }
    }
    if (id === 'btn-reset' && confirm('Remplacer les données locales par le seed ? (les modifs non envoyées seront perdues)')) {
      localStorage.removeItem('ep2.state.v1'); localStorage.removeItem('ep2.meta.v1');
      location.reload();
    }
  });

  dlg.addEventListener('change', async e => {
    if (e.target.id !== 'file-import') return;
    const file = e.target.files[0];
    if (!file) return;
    try { store.importJson(await file.text()); toast('Import réussi'); dlg.close(); }
    catch (err) { toast(`Import impossible : ${err.message}`); }
  });

  dlg.addEventListener('submit', () => {
    const f = new FormData(dlg.querySelector('form'));
    store.setConfig({ gistId: f.get('gistId'), token: f.get('token') });
  });

  return { open() { render(); dlg.showModal(); } };
}
