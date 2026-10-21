'use strict';
const { getDb } = require('../database');
const { withLock, createLock } = require('../mutex');
const gistClient = require('./gistClient');
const { rowsToLibrary, libraryToRows, mergeLibraries, purgeOldTombstones,
  parseLibraryStrict, sanitizeTheme, emptyLibrary, summarize } = require('./library');
const { DEFAULT_GIST_ID } = require('./sharedLibrary');
const { readAutoState } = require('./autoState');
const syncLock = createLock();

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

function syncError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// Manual Push/Pull and the automatic worker share one queue. Capture the
// revision with the snapshot; an edit saved during network I/O stays pending.
function pushLibrary({ theme, automatic = false } = {}) {
  return syncLock(async () => {
    const db = await getDb();
    const snapshot = await withLock(async () => ({
      settings: await readSettings(db), state: await readAutoState(db), local: await localLibrary(db)
    }));
    const { settings: s, state, local } = snapshot;
    if (automatic && (!state.enabled || !state.pending || !s.github_token || !s.gist_id)) {
      return { success: true, skipped: true };
    }
    if (!s.github_token) throw syncError('Chua cau hinh GitHub token trong muc Dong bo.');
    const clientTheme = sanitizeTheme(theme) || sanitizeTheme(JSON.parse(state.theme_json || 'null'));
    if (clientTheme) local.theme = clientTheme;
    let gistId = s.gist_id || null;
    let cloud = emptyLibrary();
    if (gistId) cloud = parseLibraryStrict(await gistClient.getLibrary(s.github_token, gistId));
    const merged = purgeOldTombstones(mergeLibraries(local, cloud));
    const content = JSON.stringify(merged, null, 2);
    const result = gistId
      ? await gistClient.updateGist(s.github_token, gistId, content)
      : await gistClient.createGist(s.github_token, content);
    if (!gistId) {
      gistId = result.id;
      await withLock(() => db.run(
        `INSERT INTO SYNC_SETTINGS (id, gist_id) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET gist_id = excluded.gist_id`, [gistId]));
    }
    await persistLibrary(db, merged);
    await withLock(async () => {
      await touchLastSynced(db);
      // If the destination/token changed meanwhile, this upload does not
      // acknowledge the new destination's pending work.
      const current = await readSettings(db);
      if (current.gist_id === gistId && current.github_token === s.github_token) {
        await db.run(
          `UPDATE AUTO_SYNC_STATE SET pushed_revision = MAX(pushed_revision, ?),
           last_error = NULL, last_pushed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1`,
          [state.revision]);
      }
    });
    return { success: true, direction: 'push', gist_id: gistId, gist_url: result.html_url,
      result: summarize(merged), theme: merged.theme || null };
  });
}

function pullLibrary({ theme } = {}) {
  return syncLock(async () => {
    const db = await getDb();
    const s = await readSettings(db);
    if (!s.gist_id) throw syncError('Chua co Gist ID. Hay "Day len" tu mot may de tao Gist truoc.');
    const cloud = parseLibraryStrict(await gistClient.getLibrary(s.github_token, s.gist_id));
    const local = await localLibrary(db);
    const clientTheme = sanitizeTheme(theme);
    if (clientTheme) local.theme = clientTheme;
    const merged = mergeLibraries(cloud, local);
    await persistLibrary(db, merged);
    await withLock(() => touchLastSynced(db));
    return { success: true, direction: 'pull', gist_id: s.gist_id,
      result: summarize(merged), theme: merged.theme || null };
  });
}

module.exports = { readSettings, pushLibrary, pullLibrary };
