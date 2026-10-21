'use strict';

// Drain accepted HTTP writes before the final Push. A forced termination leaves
// the durable revision pending for the next start, rather than acknowledging it.
function createShutdown({ server, autoPush, closeDb, exit = code => process.exit(code) }) {
  let stopping = null;
  return function shutdown(signal = 'SIGINT') {
    if (stopping) return stopping;
    stopping = (async () => {
      autoPush.stop();
      const deadline = setTimeout(() => exit(0), signal === 'SIGHUP' ? 8000 : 25000);
      let exitCode = 0;
      try {
        await new Promise(resolve => server.close(resolve));
        const result = await autoPush.drain();
        if (!result.success) console.warn('[ExamBuilder] Chua day duoc de; se thu lai khi mo ung dung.');
        await closeDb();
      } catch (err) {
        exitCode = 1;
        console.error('[ExamBuilder] Loi khi dong ung dung:', err.message);
      } finally {
        clearTimeout(deadline);
        exit(exitCode);
      }
    })();
    return stopping;
  };
}
module.exports = { createShutdown };
