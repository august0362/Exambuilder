const express = require('express');
const { getDb } = require('../database');
const { withLock, createLock } = require('../mutex');
const gistClient = require('../sync/gistClient');
const {
  rowsToLibrary,
  libraryToRows,
  mergeLibraries,
  purgeOldTombstones,
  parseLibraryStrict,
  sanitizeTheme,
  emptyLibrary,
  summarize
} = require('../sync/library');

const router = express.Router();

// Push/Pull xep hang rieng (khong dung withLock): 2 lan dong bo khong chay xen
// nhau, nhung luu/xoa de trong kho van chay binh thuong khi dang cho mang.
const syncLock = createLock();
const { DEFAULT_GIST_ID, SHARED_GIST_OWNER, isSharedGist } = require('../sync/sharedLibrary');

function maskToken(token) {
  if (!token) return null;
  if (token.length < 10) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

async function readSettings(db) {
  const settings = (await db.get('SELECT github_token, gist_id, last_synced_at FROM SYNC_SETTINGS WHERE id = 1')) || {};
  // Gia tri rong duoc luu ro rang de "Tao Gist moi" van tao kho rieng.
  return { ...settings, gist_id: settings.gist_id == null ? DEFAULT_GIST_ID : settings.gist_id };
}

/**
 * Ghi ket qua merge nguoc lai vao SAVED_EXAM. Vi ung dung dung chung 1 ket
 * noi SQLite, phai xep hang qua withLock() + boc transaction (xem
 * backend/routes/examRoutes.js va backend/mutex.js).
 *
 * Chi ghi de dong khi ban merge KHONG CU HON dong hien co (LWW lan nua, tai
 * thoi diem ghi): snapshot local duoc doc truoc khi goi mang, nen neu nguoi
 * dung luu / xoa de trong luc cho Gist thi ban moi do phai duoc giu lai. Bang
 * nhau -> ghi, cho khop luat hoa "primary thang" cua mergeLibraries. Kho de
 * ghi moc den mili-giay (%f) nen ban sua sau snapshot luon moi hon han.
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
             deleted_at = excluded.deleted_at
           WHERE SAVED_EXAM.updated_at IS NULL
              OR julianday(excluded.updated_at) >= julianday(SAVED_EXAM.updated_at)`,
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
      configured: !!s.gist_id,
      has_token: !!s.github_token,
      masked_token: maskToken(s.github_token),
      gist_id: s.gist_id || '',
      default_gist_id: DEFAULT_GIST_ID,
      shared_gist_owner: SHARED_GIST_OWNER,
      is_shared: isSharedGist(s.gist_id),
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
    let gistId = current.gist_id;

    if (typeof body.github_token === 'string' && body.github_token.trim()) {
      token = body.github_token.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'gist_id')) {
      gistId = body.gist_id ? String(body.gist_id).trim() : '';
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
router.post('/push', (req, res) => syncLock(async () => {
  const db = await getDb();
  try {
    const s = await readSettings(db);
    if (!s.github_token) {
      return res.status(400).json({ success: false, error: 'Chua cau hinh GitHub token trong muc Dong bo.' });
    }

    const local = await localLibrary(db);
    // Chu de mau: web luu o localStorage nen client gui kem trong body.
    const clientTheme = sanitizeTheme(req.body && req.body.theme);
    if (clientTheme) local.theme = clientTheme;

    let cloud = emptyLibrary();
    let gistId = s.gist_id || null;
    let gistUrl = null;

    if (gistId) {
      const raw = await gistClient.getLibrary(s.github_token, gistId);
      cloud = parseLibraryStrict(raw);
    }

    // Don tombstone cu SAU khi merge: neu don truoc, ban "con song" cu hon
    // tren cloud se thang va lam de da xoa song lai.
    const merged = purgeOldTombstones(mergeLibraries(local, cloud));
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
    res.status(err.status === 403 ? 403 : 502).json({ success: false, error: err.message || 'Loi day len Gist' });
  }
}));

// Pull: cloud -> may. merge(cloud, local) roi ghi ve may.
router.post('/pull', (req, res) => syncLock(async () => {
  const db = await getDb();
  try {
    const s = await readSettings(db);
    if (!s.gist_id) {
      return res.status(400).json({ success: false, error: 'Chua co Gist ID. Hay "Day len" tu mot may de tao Gist truoc.' });
    }

    const raw = await gistClient.getLibrary(s.github_token, s.gist_id);
    const cloud = parseLibraryStrict(raw);
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
}));

module.exports = router;
