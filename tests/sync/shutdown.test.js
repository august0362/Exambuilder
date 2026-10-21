const { createShutdown } = require('../../backend/shutdown');

test('shutdown drains accepted saves, then Pushes, then closes SQLite; repeated signals share one shutdown', async () => {
  const events = [];
  let finishRequests;
  const shutdown = createShutdown({
    server: { close: done => { events.push('stop HTTP'); finishRequests = done; } },
    autoPush: { stop: () => events.push('stop retries'), drain: async () => {
      events.push('push'); return { success: true };
    } },
    closeDb: async () => events.push('close DB'), exit: () => events.push('exit')
  });
  const first = shutdown();
  const second = shutdown();
  expect(first).toBe(second);
  expect(events).toEqual(['stop retries', 'stop HTTP']);
  finishRequests();
  await first;
  expect(events).toEqual(['stop retries', 'stop HTTP', 'push', 'close DB', 'exit']);
});
