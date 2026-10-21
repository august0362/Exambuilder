const express = require('express');
const { getDb } = require('../database');
const { withLock } = require('../mutex');
const { readSettings, pushLibrary, pullLibrary } = require('../sync/service');
const { markDirty, readAutoState } = require('../sync/autoState');
const autoPush = require('../sync/autoPush');
const { sanitizeTheme } = require('../sync/library');
const { DEFAULT_GIST_ID, SHARED_GIST_OWNER, isSharedGist } = require('../sync/sharedLibrary');
const router = express.Router();

function maskToken(token) {
  if (!token) return null;
  if (token.length < 10) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

router.get('/settings', async (req, res) => {
  const db = await getDb();
  try {
    const s = await readSettings(db);
    const auto = await readAutoState(db);
    res.json({
      success: true,
      configured: !!s.gist_id,
      has_token: !!s.github_token,
      masked_token: maskToken(s.github_token),
      gist_id: s.gist_id || '',
      default_gist_id: DEFAULT_GIST_ID,
      shared_gist_owner: SHARED_GIST_OWNER,
      is_shared: isSharedGist(s.gist_id),
      last_synced_at: s.last_synced_at || null,
      auto_push: { enabled: auto.enabled, pending: auto.pending,
        last_error: auto.last_error || null, last_pushed_at: auto.last_pushed_at || null }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc cau hinh dong bo' });
  }
});

router.post('/settings', async (req, res) => {
  const db = await getDb();
  const body = req.body || {};
  if ('auto_push_enabled' in body && typeof body.auto_push_enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'auto_push_enabled phai la boolean' });
  }
  try {
    const { token, gistId } = await withLock(async () => {
      const current = await readSettings(db);
      const token = typeof body.github_token === 'string' && body.github_token.trim()
        ? body.github_token.trim() : current.github_token || null;
      const gistId = Object.prototype.hasOwnProperty.call(body, 'gist_id')
        ? String(body.gist_id || '').trim() : current.gist_id;
      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `INSERT INTO SYNC_SETTINGS (id, github_token, gist_id) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET github_token = excluded.github_token, gist_id = excluded.gist_id`,
          [token, gistId]);
        if ('auto_push_enabled' in body) {
          await db.run('UPDATE AUTO_SYNC_STATE SET enabled = ? WHERE id = 1', [body.auto_push_enabled ? 1 : 0]);
        }
        if (token !== (current.github_token || null) || gistId !== current.gist_id) await markDirty(db);
        await db.exec('COMMIT');
        return { token, gistId };
      } catch (err) { await db.exec('ROLLBACK'); throw err; }
    });
    autoPush.schedule();
    res.json({ success: true, has_token: !!token, gist_id: gistId || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi luu cau hinh dong bo' });
  }
});


for (const [direction, sync] of [['push', pushLibrary], ['pull', pullLibrary]]) {
  router.post('/' + direction, async (req, res) => {
    try {
      res.json(await sync({ theme: req.body && req.body.theme }));
    } catch (err) {
      console.error(err);
      res.status(err.status === 400 || err.status === 403 ? err.status : 502)
        .json({ success: false, error: err.message || 'Loi dong bo Gist' });
    }
  });
}

// A small beacon, not the exam itself. Upload continues in the server after
// the browser has closed; archive writes already have a durable outbox entry.
router.post('/auto-push', async (req, res, next) => {
  try {
    const db = await getDb();
    const theme = sanitizeTheme(req.body && req.body.theme);
    if (theme) await withLock(async () => {
      const state = await readAutoState(db);
      const json = JSON.stringify(theme);
      if (state.theme_json !== json) {
        await db.run('UPDATE AUTO_SYNC_STATE SET theme_json = ? WHERE id = 1', [json]);
        await markDirty(db);
      }
    });
    autoPush.schedule(0);
    res.status(202).json({ success: true, queued: true });
  } catch (err) { next(err); }
});
module.exports = router;
