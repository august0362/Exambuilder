const PREFIX = 'exambuilder-archive-outbox:';

// Keep the latest unsent draft per exam, including drafts larger than Beacon's
// shared 64 KiB budget. Never delete it just because a beacon was queued.
export function createArchiveOutbox({ storage, fetch: send, uuid, beacon, onStorageError = () => {} }) {
  const clientId = uuid();
  let revision = 0;
  function stage(payload) {
    const body = JSON.stringify({ ...payload, _write: { client_id: clientId, revision: ++revision } });
    const entry = { key: PREFIX + clientId + ':' + payload.exam_id, body };
    try { storage.setItem(entry.key, body); } catch (err) { onStorageError(err); }
    return entry;
  }
  async function save(entry) {
    const response = await send('/api/archive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: entry.body
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || `HTTP ${response.status}`);
    try {
      if (storage.getItem(entry.key) === entry.body) storage.removeItem(entry.key);
    } catch { /* A successful server save remains successful if storage is unavailable. */ }
    return data;
  }
  function flushOnHide(entry) {
    if (!entry) return false;
    const blob = new Blob([entry.body], { type: 'application/json' });
    if (blob.size > 60 * 1024) return false;
    try { return !!beacon?.('/api/archive', blob); } catch { return false; }
  }
  async function recover() {
    const entries = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(PREFIX)) entries.push({ key, body: storage.getItem(key) });
      }
    } catch { return []; }
    const recovered = [];
    for (const entry of entries) {
      const result = await save(entry);
      recovered.push(result.exam_id);
    }
    return recovered;
  }
  return { stage, save, flushOnHide, recover };
}
