process.env.EXAM_DB_PATH = ':memory:';
jest.mock('../../backend/sync/gistClient', () => ({ LIBRARY_FILENAME: 'exambuilder-library.json', getLibrary: jest.fn(), createGist: jest.fn(), updateGist: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { closeDb, getDb } = require('../../backend/database');
const archiveRoutes = require('../../backend/routes/archiveRoutes');
const syncRoutes = require('../../backend/routes/syncRoutes');
const gist = require('../../backend/sync/gistClient');
const { errorHandler } = require('../../backend/errorHandler');

const BLOCKS = [{ block_type: 'MULTIPLE_CHOICE', questions: [{ question_type: 'MCQ', content: 'Q', difficulty_level: 'NB', correct_answer: 'A', options: [{ option_key: 'A', option_text: 'A', is_correct: true }, { option_key: 'B', option_text: 'B', is_correct: false }] }] }];
const body = (over = {}) => ({ title: 'local', subject: 'Math', duration_minutes: 45, blocks: BLOCKS, ...over });
const entry = (id, title, updated_at = '2026-01-01T00:00:00.000Z', deleted_at = null) => ({ exam_id: id, title, subject: 'Math', duration_minutes: 45, school_header: '', blocks: BLOCKS, created_at: '2026-01-01T00:00:00.000Z', updated_at, deleted_at });
const lib = exams => JSON.stringify({ schema: 'exambuilder/library@1', exams });
const app = () => { const a = express(); a.use(express.json({ limit: '5mb' })); a.use('/api/archive', archiveRoutes); a.use('/api/sync', syncRoutes); a.use(errorHandler); return a; };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function setup() {
  const a = app();
  const saved = await request(a).post('/api/archive').send(body());
  expect(saved.status).toBe(200);
  expect(saved.body.exam_id).toBeTruthy();
  const configured = await request(a).post('/api/sync/settings').send({ github_token: 'token-test', gist_id: 'g1' });
  expect(configured.status).toBe(200);
  return { a, id: saved.body.exam_id, db: await getDb() };
}
async function saveEdit(a, id, title) {
  const saved = await request(a).post('/api/archive').send(body({ exam_id: id, title }));
  expect(saved.status).toBe(200);
  expect(saved.body.exam_id).toBe(id);
}
async function expectTitle(a, id, title) {
  const got = await request(a).get(`/api/archive/${id}`);
  expect(got.status).toBe(200);
  expect(got.body.exam.title).toBe(title);
}

beforeEach(() => jest.clearAllMocks());
afterEach(async () => closeDb());

test('regression: edit saved while push awaits getLibrary survives sync persistence', async () => {
  const { a, id } = await setup(); const gate = deferred(); const entered = deferred();
  gist.getLibrary.mockImplementation(() => { entered.resolve(); return gate.promise; });
  gist.updateGist.mockResolvedValue({ id: 'g1', html_url: 'url' });
  const syncing = request(a).post('/api/sync/push').then(r => r); await entered.promise;
  await saveEdit(a, id, 'edited during getLibrary'); gate.resolve(lib([]));
  const result = await syncing; expect(result.status).toBe(200);
  await expectTitle(a, id, 'edited during getLibrary');
});

test('regression: edit saved while push awaits updateGist survives sync persistence', async () => {
  const { a, id } = await setup(); const gate = deferred(); const entered = deferred();
  gist.getLibrary.mockResolvedValue(lib([]));
  gist.updateGist.mockImplementation(() => { entered.resolve(); return gate.promise; });
  const syncing = request(a).post('/api/sync/push').then(r => r); await entered.promise;
  await saveEdit(a, id, 'edited during updateGist'); gate.resolve({ id: 'g1', html_url: 'url' });
  const result = await syncing; expect(result.status).toBe(200);
  await expectTitle(a, id, 'edited during updateGist');
});

test('regression: edit saved while pull awaits getLibrary survives sync persistence', async () => {
  const { a, id } = await setup(); const gate = deferred(); const entered = deferred();
  gist.getLibrary.mockImplementation(() => { entered.resolve(); return gate.promise; });
  const syncing = request(a).post('/api/sync/pull').then(r => r); await entered.promise;
  await saveEdit(a, id, 'edited during pull'); gate.resolve(lib([entry(id, 'older cloud')]));
  const result = await syncing; expect(result.status).toBe(200);
  await expectTitle(a, id, 'edited during pull');
});

test('regression: delete during pull remains deleted after sync persistence', async () => {
  const { a, id } = await setup(); const gate = deferred(); const entered = deferred();
  gist.getLibrary.mockImplementation(() => { entered.resolve(); return gate.promise; });
  const syncing = request(a).post('/api/sync/pull').then(r => r); await entered.promise;
  const removed = await request(a).delete(`/api/archive/${id}`); expect(removed.status).toBe(200);
  gate.resolve(lib([])); const result = await syncing; expect(result.status).toBe(200);
  const got = await request(a).get(`/api/archive/${id}`); expect(got.status).toBe(404);
});

test('regression: new exam created during push remains in local archive', async () => {
  const { a } = await setup(); const gate = deferred(); const entered = deferred();
  gist.getLibrary.mockImplementation(() => { entered.resolve(); return gate.promise; });
  gist.updateGist.mockResolvedValue({ id: 'g1', html_url: 'url' });
  const syncing = request(a).post('/api/sync/push').then(r => r); await entered.promise;
  const created = await request(a).post('/api/archive').send(body({ title: 'created during push' }));
  expect(created.status).toBe(200); gate.resolve(lib([]));
  const result = await syncing; expect(result.status).toBe(200);
  await expectTitle(a, created.body.exam_id, 'created during push');
});

test('regression: two simultaneous pushes both finish successfully without transaction errors', async () => {
  const { a, id } = await setup(); const gates = [deferred(), deferred()]; const entered = [deferred(), deferred()]; let calls = 0;
  gist.getLibrary.mockImplementation(() => { const i = calls++; entered[i].resolve(); return gates[i].promise; });
  gist.updateGist.mockResolvedValue({ id: 'g1', html_url: 'url' });
  const one = request(a).post('/api/sync/push').then(r => r); const two = request(a).post('/api/sync/push').then(r => r);
  await entered[0].promise; gates[0].resolve(lib([])); await entered[1].promise; gates[1].resolve(lib([]));
  const results = await Promise.all([one, two]);
  expect(results.map(x => x.status)).toEqual([200, 200]);
  await expectTitle(a, id, 'local');
  const rows = await (await getDb()).all('SELECT exam_id FROM SAVED_EXAM'); expect(rows).toHaveLength(1);
});

test('regression: simultaneous push and pull both finish successfully without transaction errors', async () => {
  const { a, id } = await setup(); const gates = [deferred(), deferred()]; const entered = [deferred(), deferred()]; let calls = 0;
  gist.getLibrary.mockImplementation(() => { const i = calls++; entered[i].resolve(); return gates[i].promise; });
  gist.updateGist.mockResolvedValue({ id: 'g1', html_url: 'url' });
  const push = request(a).post('/api/sync/push').then(r => r); const pull = request(a).post('/api/sync/pull').then(r => r);
  await entered[0].promise; gates[0].resolve(lib([])); await entered[1].promise; gates[1].resolve(lib([]));
  const results = await Promise.all([push, pull]);
  expect(results.map(x => x.status)).toEqual([200, 200]);
  await expectTitle(a, id, 'local');
  const rows = await (await getDb()).all('SELECT exam_id FROM SAVED_EXAM'); expect(rows).toHaveLength(1);
});

test('regression: updateGist rejection returns 502 and leaves local exam rows unchanged', async () => {
  const { a, id, db } = await setup();
  await db.run('UPDATE SAVED_EXAM SET deleted_at = ? WHERE exam_id = ?', ['2026-01-02T00:00:00.000Z', id]);
  gist.getLibrary.mockResolvedValue(lib([entry(id, 'cloud title', '2026-01-03T00:00:00.000Z')]));
  gist.updateGist.mockRejectedValue(new Error('write rejected'));
  const before = await db.all('SELECT exam_id, title, deleted_at FROM SAVED_EXAM ORDER BY exam_id');
  const result = await request(a).post('/api/sync/push').then(r => r); expect(result.status).toBe(502);
  const after = await db.all('SELECT exam_id, title, deleted_at FROM SAVED_EXAM ORDER BY exam_id'); expect(after).toEqual(before);
});

test.each(['GitHub returned HTTP 401', 'network TypeError: fetch failed'])('audit: getLibrary rejection (%s) returns 502 and leaves DB unchanged', async message => {
  const { a, id, db } = await setup();
  await db.run('UPDATE SAVED_EXAM SET deleted_at = ? WHERE exam_id = ?', ['2026-01-02T00:00:00.000Z', id]);
  gist.getLibrary.mockRejectedValue(new TypeError(message));
  const before = await db.all('SELECT exam_id, title, deleted_at FROM SAVED_EXAM ORDER BY exam_id');
  const result = await request(a).post('/api/sync/pull').then(r => r); expect(result.status).toBe(502);
  expect(result.body.error).toContain(message);
  const after = await db.all('SELECT exam_id, title, deleted_at FROM SAVED_EXAM ORDER BY exam_id'); expect(after).toEqual(before);
});

test('regression: failed sync persistence rolls back cloud rows and does not partially change local rows', async () => {
  const { a, id, db } = await setup();
  const before = await db.all('SELECT exam_id, title, deleted_at FROM SAVED_EXAM ORDER BY exam_id');
  // A SQLite trigger forces the cloud upsert to fail after the transaction begins.
  await db.exec("CREATE TRIGGER reject_sync_write BEFORE INSERT ON SAVED_EXAM WHEN NEW.exam_id = 'cloud-invalid' BEGIN SELECT RAISE(ABORT, 'forced sync write failure'); END;");
  gist.getLibrary.mockResolvedValue(lib([entry(id, 'cloud edit'), entry('cloud-invalid', 'bad cloud row')]));
  const result = await request(a).post('/api/sync/pull').then(r => r); expect(result.status).toBe(502);
  const after = await db.all('SELECT exam_id, title, deleted_at FROM SAVED_EXAM ORDER BY exam_id'); expect(after).toEqual(before);
});

test('regression: archive save concurrent with failed sync persistence remains saved', async () => {
  const { a, id, db } = await setup();
  await db.exec("CREATE TRIGGER reject_sync_write BEFORE INSERT ON SAVED_EXAM WHEN NEW.exam_id = 'cloud-invalid' BEGIN SELECT RAISE(ABORT, 'forced sync write failure'); END;");
  const gate = deferred(); const entered = deferred();
  gist.getLibrary.mockImplementation(() => { entered.resolve(); return gate.promise; });
  const syncing = request(a).post('/api/sync/pull').then(r => r); await entered.promise;
  const created = await request(a).post('/api/archive').send(body({ title: 'saved during failed sync' }));
  expect(created.status).toBe(200); gate.resolve(lib([entry('cloud-invalid', 'bad cloud row')]));
  const result = await syncing; expect(result.status).toBe(502);
  await expectTitle(a, id, 'local');
  await expectTitle(a, created.body.exam_id, 'saved during failed sync');
  const rows = await db.all('SELECT exam_id FROM SAVED_EXAM ORDER BY exam_id'); expect(rows).toHaveLength(2);
});
