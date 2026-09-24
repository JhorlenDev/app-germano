(() => {
  const rows = new Map(), versions = new Map(), baselines = new Map(), listeners = new Set(), queues = new Map();
  let pending = false, generation = 0, timer, refreshPromise;
  const status = message => { document.getElementById('server-status').textContent = message; };
  async function request(path, options = {}) {
    const response = await fetch(`/api/${path}`, {
      credentials: 'same-origin', ...options,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'gm-app', ...options.headers },
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Falha na comunicação com o servidor.');
      status(response.status === 401 ? 'Sessão expirada. Entre novamente em outra aba para salvar.' : error.message);
      throw error;
    }
    return data;
  }
  function snapshot() {
    return { docs: [...rows.values()].map(row => ({ id: row.record.id, data: () => row.record })) };
  }
  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const data = await request('original/clients');
      rows.clear(); data.forEach(row => rows.set(row.record.id, row));
      listeners.forEach(l => l.next(snapshot()));
    })().catch(error => { listeners.forEach(l => l.error(error)); throw error; }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  const collection = {
    orderBy() { return this; }, limit() { return this; },
    onSnapshot(next, error) {
      const listener = { next, error }; listeners.add(listener);
      refresh().catch(() => {});
      if (!timer) timer = setInterval(() => refresh().catch(() => {}), 10000);
      return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); timer = null; } };
    },
  };
  function enqueue(id, work) {
    const promise = (queues.get(id) || Promise.resolve()).catch(() => {}).then(work);
    queues.set(id, promise);
    promise.finally(() => { if (queues.get(id) === promise) queues.delete(id); }).catch(() => {});
    return promise;
  }
  const db = {
    collection: () => collection,
    doc(path) {
      const id = path.split('/').pop();
      return {
        set(record, options = {}) { const saveGeneration = generation; return enqueue(id, async () => {
          if (!options.restore && baselines.get(id) === JSON.stringify(record.d)) { if (saveGeneration === generation) pending = false; status("Dados salvos no servidor"); return; }
          const version = options.restore ? (rows.get(id)?.version || 0) : (versions.get(id) || 0);
          status('Salvando no servidor…');
          try {
            const saved = await request(`original/clients/${id}`, { method: 'PUT', body: JSON.stringify({ record, version }) });
            versions.set(id, saved.version); baselines.set(id, JSON.stringify(saved.record.d)); rows.set(id, saved);
            if (saveGeneration === generation) pending = false; status(pending ? 'Alterações aguardando salvamento…' : 'Dados salvos no servidor');
            listeners.forEach(l => l.next(snapshot()));
          } catch (error) { pending = true; status(`Não foi salvo: ${error.message}`); throw error; }
        }); },
        delete() { return enqueue(id, async () => {
          await request(`original/clients/${id}`, { method: 'DELETE', body: JSON.stringify({ version: versions.get(id) || rows.get(id)?.version }) });
          versions.delete(id); baselines.delete(id); rows.delete(id); pending = false;
          listeners.forEach(l => l.next(snapshot())); status('Cliente excluído do servidor');
        }); },
      };
    },
  };
  const downloads = { async save({ filename, data }) {
    // Fetch a fresh complete snapshot so a backup never depends on the visible page limit.
    await refresh();
    const blob = new Blob([JSON.stringify([...rows.values()].map(r => r.record), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } };
  window.gmServices = {
    async use(service) { return service === 'db' ? db : downloads; },
    select(id) { versions.set(id, rows.get(id)?.version || 0); baselines.set(id, JSON.stringify(rows.get(id)?.record.d)); },
    unsaved() { return pending || queues.size > 0; },
    dirty() { generation++; pending = true; status('Alterações aguardando salvamento…'); },
    idle() { pending = false; status('Conectado ao servidor'); },
  };
  addEventListener('beforeunload', event => { if (pending || queues.size) { event.preventDefault(); event.returnValue = ''; } });
  document.getElementById('server-logout').addEventListener('click', async () => {
    if ((pending || queues.size) && !confirm('Há alterações ainda não salvas. Deseja sair mesmo assim?')) return;
    try { await request('auth/logout', { method: 'POST' }); pending = false; location.assign('/login'); }
    catch (error) { status(error.message); }
  });
})();
