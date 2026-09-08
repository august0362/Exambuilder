const express = require('express');
const { getDb } = require('../database');
const { withLock } = require('../mutex');
const gistClient = require('../sync/gistClient');
const {
  rowsToLibrary,
  libraryToRows,
  mergeLibraries,
  purgeOldTombstones,
  parseLibrary,
  sanitizeTheme,
  emptyLibrary,
  summarize
} = require('../sync/library');

const router = express.Router();

function maskToken(token) {
  if (!token) return null;
  if (token.length < 10) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

async function readSettings(db) {
  return (await db.get('SELECT github_token, gist_id, last_synced_at FROM SYNC_SETTINGS WHERE id = 1')) || {};
}

/**
 * Ghi ket qua merge nguoc lai vao SAVED_EXAM. Vi ung dung dung chung 1 ket
 * noi SQLite, phai xep hang qua withLock() + boc transaction (xem
 * backend/routes/examRoutes.js va backend/mutex.js).
 */
async function persistLibrary(db, library) {
  const rows = libraryToRows(library);
  await withLock(async () => {
    await db.exec('BEGIN TRANSACTION');
    try {
      for (const r of rows) {
        await db.run(
          `INSERT INTO SAVED_EXAM
             (exam_id, title, subject, duration_minutes, school_header, payload_json, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(exam_id) DO UPDATE SET
             title = excluded.title,
             subject = excluded.subject,
             duration_minutes = excluded.duration_minutes,
             school_header = excluded.school_header,
             payload_json = excluded.payload_json,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             deleted_at = excluded.deleted_at`,
          [
            r.exam_id, r.title, r.subject, r.duration_minutes, r.school_header,
            r.payload_json, r.created_at, r.updated_at, r.deleted_at
          ]
        );
      }
      await db.exec('COMMIT');
    } catch (err) {
      try {
        await db.exec('ROLLBACK');
      } catch (rollbackErr) {
        console.error('ROLLBACK that bai:', rollbackErr);
      }
      throw err;
    }
  });
}

async function touchLastSynced(db) {
  await db.run(
    `INSERT INTO SYNC_SETTINGS (id, last_synced_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(id) DO UPDATE SET last_synced_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
  );
}

async function localLibrary(db) {
  const rows = await db.all('SELECT * FROM SAVED_EXAM');
  return rowsToLibrary(rows);
}

router.get('/settings', async (req, res) => {
  const db = await getDb();
  try {
    const s = await readSettings(db);
    res.json({
      success: true,
      configured: !!s.github_token,
      has_token: !!s.github_token,
      masked_token: maskToken(s.github_token),
      gist_id: s.gist_id || '',
      last_synced_at: s.last_synced_at || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc cau hinh dong bo' });
  }
});

router.post('/settings', async (req, res) => {
  const db = await getDb();
  const body = req.body || {};
  try {
    const current = await readSettings(db);
    let token = current.github_token || null;
    let gistId = current.gist_id || null;

    if (typeof body.github_token === 'string' && body.github_token.trim()) {
      token = body.github_token.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'gist_id')) {
      gistId = body.gist_id ? String(body.gist_id).trim() : null;
    }

    await db.run(
      `INSERT INTO SYNC_SETTINGS (id, github_token, gist_id) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET github_token = excluded.github_token, gist_id = excluded.gist_id`,
      [token, gistId]
    );
    res.json({ success: true, has_token: !!token, gist_id: gistId || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi luu cau hinh dong bo' });
  }
});

// Push: may -> cloud. merge(local, cloud) roi ghi de Gist va ghi nguoc ve may.
router.post('/push', async (req, res) => {
  const db = await getDb();
  try {
    const s = await readSettings(db);
    if (!s.github_token) {
      return res.status(400).json({ success: false, error: 'Chua cau hinh GitHub token trong muc Dong bo.' });
    }

    let local = purgeOldTombstones(await localLibrary(db));
    // Chu de mau: web luu o localStorage nen client gui kem trong body.
    const clientTheme = sanitizeTheme(req.body && req.body.theme);
    if (clientTheme) local.theme = clientTheme;

    let cloud = emptyLibrary();
    let gistId = s.gist_id || null;
    let gistUrl = null;

    if (gistId) {
      const raw = await gistClient.getLibrary(s.github_token, gistId);
      cloud = raw ? parseLibrary(raw) : emptyLibrary();
    }

    const merged = mergeLibraries(local, cloud);
    const content = JSON.stringify(merged, null, 2);

    if (gistId) {
      const r = await gistClient.updateGist(s.github_token, gistId, content);
      gistUrl = r.html_url;
    } else {
      const r = await gistClient.createGist(s.github_token, content);
      gistId = r.id;
      gistUrl = r.html_url;
      await db.run(
        `INSERT INTO SYNC_SETTINGS (id, gist_id) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET gist_id = excluded.gist_id`,
        [gistId]
      );
    }

    await persistLibrary(db, merged);
    await touchLastSynced(db);

    res.json({ success: true, direction: 'push', gist_id: gistId, gist_url: gistUrl, result: summarize(merged), theme: merged.theme || null });
  } catch (err) {
    console.error(err);
    res.status(502).json({ success: false, error: err.message || 'Loi day len Gist' });
  }
});

// Pull: cloud -> may. merge(cloud, local) roi ghi ve may.
router.post('/pull', async (req, res) => {
  const db = await getDb();
  try {
    const s = await readSettings(db);
    if (!s.github_token) {
      return res.status(400).json({ success: false, error: 'Chua cau hinh GitHub token trong muc Dong bo.' });
    }
    if (!s.gist_id) {
      return res.status(400).json({ success: false, error: 'Chua co Gist ID. Hay "Day len" tu mot may de tao Gist truoc.' });
    }

    const raw = await gistClient.getLibrary(s.github_token, s.gist_id);
    const cloud = raw ? parseLibrary(raw) : emptyLibrary();
    const local = await localLibrary(db);
    const clientTheme = sanitizeTheme(req.body && req.body.theme);
    if (clientTheme) local.theme = clientTheme;

    const merged = mergeLibraries(cloud, local);
    await persistLibrary(db, merged);
    await touchLastSynced(db);

    res.json({ success: true, direction: 'pull', gist_id: s.gist_id, result: summarize(merged), theme: merged.theme || null });
  } catch (err) {
    console.error(err);
    res.status(502).json({ success: false, error: err.message || 'Loi keo ve tu Gist' });
  }
});

module.exports = router;
