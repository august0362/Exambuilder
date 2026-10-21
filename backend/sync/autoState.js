'use strict';
const { withLock } = require('../mutex');

// Call markDirty inside the same transaction as the local archive write.
async function markDirty(db) {
  await db.run('UPDATE AUTO_SYNC_STATE SET revision = revision + 1, last_error = NULL WHERE id = 1');
}

async function readAutoState(db) {
  const s = await db.get('SELECT * FROM AUTO_SYNC_STATE WHERE id = 1');
  return { ...s, enabled: !!s.enabled, pending: s.revision > s.pushed_revision };
}

async function writeLocalChange(db, write) {
  return withLock(async () => {
    await db.exec('BEGIN TRANSACTION');
    try {
      const result = await write();
      if (result?.changes !== 0 && result?.changed !== false) await markDirty(db);
      await db.exec('COMMIT');
      return result;
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  });
}

module.exports = { markDirty, readAutoState, writeLocalChange };
