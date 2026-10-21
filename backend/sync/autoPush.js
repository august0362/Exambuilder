'use strict';
const { getDb } = require('../database');
const { withLock } = require('../mutex');
const { pushLibrary } = require('./service');
const { readAutoState } = require('./autoState');

let active = false;
let timer = null;
let running = null;
let retryMs = 5000;

function schedule(delay = 3000) {
  if (!active) return;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, delay);
  timer.unref?.();
}

function flush() {
  if (running) return running;
  clearTimeout(timer);
  timer = null;
  running = (async () => {
    try {
      const result = await pushLibrary({ automatic: true });
      retryMs = 5000;
      if (!result.skipped) {
        const state = await readAutoState(await getDb());
        if (state.pending) schedule();
      }
      return result;
    } catch (err) {
      const db = await getDb();
      await withLock(() => db.run('UPDATE AUTO_SYNC_STATE SET last_error = ? WHERE id = 1',
        [err.message || 'Khong day duoc kho de.']));
      // An invalid/unauthorized token needs a settings change, not a retry loop.
      if (err.status !== 401 && err.status !== 403) {
        schedule(retryMs);
        retryMs = Math.min(60000, retryMs * 2);
      }
      return { success: false, error: err.message };
    }
  })().finally(() => { running = null; });
  return running;
}

function start() { active = true; schedule(0); }
function stop() { active = false; clearTimeout(timer); timer = null; }
async function drain() {
  let result;
  do {
    result = await flush();
    if (!result.success || result.skipped) break;
  } while ((await readAutoState(await getDb())).pending);
  return result;
}
module.exports = { start, stop, schedule, flush, drain };
