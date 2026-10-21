const { createArchiveOutbox } = require('../../frontend/archiveOutbox');

function setup(overrides = {}) {
  const values = new Map();
  const storage = {
    setItem: (key, value) => values.set(key, value), getItem: key => values.get(key),
    removeItem: key => values.delete(key), key: i => [...values.keys()][i], get length() { return values.size; }
  };
  const fetch = jest.fn(async () => ({ json: async () => ({ success: true, exam_id: 'exam-1' }) }));
  const beacon = jest.fn(() => true);
  const options = { storage, fetch, beacon, uuid: () => 'client-1', ...overrides };
  return { values, storage, fetch, beacon, outbox: createArchiveOutbox(options), options };
}

test('a late response for an old save keeps the newer unsent draft', async () => {
  let finish;
  const s = setup({ fetch: jest.fn(() => new Promise(resolve => { finish = resolve; })) });
  const old = s.outbox.stage({ exam_id: 'exam-1', title: 'old' });
  const saving = s.outbox.save(old);
  const latest = s.outbox.stage({ exam_id: 'exam-1', title: 'new' });
  finish({ json: async () => ({ success: true, exam_id: 'exam-1' }) });
  await saving;
  expect(s.storage.getItem(latest.key)).toBe(latest.body);
});

test('a queued close beacon retains the draft until the server confirms a save', async () => {
  const s = setup();
  const entry = s.outbox.stage({ exam_id: 'exam-1', title: 'last keystroke' });
  expect(s.outbox.flushOnHide(entry)).toBe(true);
  expect(s.values.size).toBe(1);
  await s.outbox.save(entry);
  expect(s.values.size).toBe(0);
});

test('large Unicode exams survive closing and recover with ordinary fetch on next open', async () => {
  const s = setup();
  s.outbox.stage({ exam_id: 'exam-1', title: 'Đề thi', text: 'Đ'.repeat(40000) });
  const entry = s.outbox.stage({ exam_id: 'exam-1', text: 'Đ'.repeat(40000) });
  expect(s.outbox.flushOnHide(entry)).toBe(false);
  expect(s.beacon).not.toHaveBeenCalled();
  const reopened = createArchiveOutbox({ ...s.options, uuid: () => 'client-2' });
  expect(await reopened.recover()).toEqual(['exam-1']);
  expect(s.fetch.mock.calls[0][1].keepalive).toBeUndefined();
  expect(s.values.size).toBe(0);
});

test('offline and HTTP failures retain drafts, including drafts from multiple exams', async () => {
  const s = setup({ fetch: jest.fn().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ status: 500, json: async () => ({ success: false, error: 'DB busy' }) }) });
  const entry = s.outbox.stage({ exam_id: 'exam-1' });
  s.outbox.stage({ exam_id: 'exam-2' });
  await expect(s.outbox.save(entry)).rejects.toThrow('offline');
  await expect(s.outbox.save(entry)).rejects.toThrow('DB busy');
  expect(s.values.size).toBe(2);
});

test('rejected beacons and full storage leave the normal save available and report backup failure', async () => {
  const warning = jest.fn();
  const s = setup({ storage: { setItem: () => { throw new Error('quota'); }, getItem: () => null },
    onStorageError: warning, beacon: () => false });
  const entry = s.outbox.stage({ exam_id: 'exam-1' });
  expect(warning).toHaveBeenCalledTimes(1);
  expect(s.outbox.flushOnHide(entry)).toBe(false);
  expect((await s.outbox.save(entry)).success).toBe(true);
});
