process.env.EXAM_DB_PATH = ':memory:';
jest.mock('../../backend/sync/gistClient', () => ({ LIBRARY_FILENAME: 'exambuilder-library.json', getLibrary: jest.fn(), createGist: jest.fn(), updateGist: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { closeDb, getDb } = require('../../backend/database');
const archiveRoutes = require('../../backend/routes/archiveRoutes');
const examRoutes = require('../../backend/routes/examRoutes');
const syncRoutes = require('../../backend/routes/syncRoutes');
const backgroundRoutes = require('../../backend/routes/backgroundRoutes');
const resourceRoutes = require('../../backend/routes/resourceRoutes');
const templateRoutes = require('../../backend/routes/templateRoutes');
const settingsRoutes = require('../../backend/routes/settingsRoutes');
const { errorHandler } = require('../../backend/errorHandler');
const gist = require('../../backend/sync/gistClient');
const BLOCKS = [{ block_type: 'MULTIPLE_CHOICE', questions: [{ question_type: 'MCQ', content: 'Q', difficulty_level: 'NB', correct_answer: 'A', explanation: 'secret explanation', options: [{ option_key: 'A', option_text: 'A', is_correct: true }, { option_key: 'B', option_text: 'B', is_correct: false }] }] }];
const examBody = (over = {}) => ({ title: 'Audit', subject: 'Math', duration_minutes: 45, blocks: BLOCKS, ...over });
function app() {
  const a = express();
  a.use(express.json({ limit: '5mb' }));
  a.use('/api/exams', examRoutes);
  a.use('/api/archive', archiveRoutes);
  a.use('/api/sync', syncRoutes);
  a.use('/api/backgrounds', backgroundRoutes);
  a.use('/api/resources', resourceRoutes);
  a.use('/api/templates', templateRoutes);
  a.use('/api/settings', settingsRoutes);
  a.use(errorHandler);
  return a;
}
async function setupArchive(a = app(), body = examBody()) {
  const r = await request(a).post('/api/archive').send(body);
  expect(r.status).toBe(200);
  expect(r.body.exam_id).toBeTruthy();
  return r.body.exam_id;
}
async function setupExam(a = app()) {
  const r = await request(a).post('/api/exams/save').send(examBody());
  expect(r.status).toBe(200);
  expect(r.body.exam_id).toBeTruthy();
  return r.body.exam_id;
}
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await closeDb(); });

 test('regression: archive body __proto__ and constructor keys do not pollute Object.prototype', async () => {
  const a = app();
  const body = JSON.parse('{"title":"Proto","blocks":[],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
  const r = await request(a).post('/api/archive').send(body);
  expect(r.status).toBe(200);
  expect({}.polluted).toBeUndefined();
  expect(Object.prototype.polluted).toBeUndefined();
});

test.each([-1, 'soon', 1e308, 'NaN'])('audit: archive duration_minutes value %p is handled without corrupting or crashing', async value => {
  const a = app();
  const r = await request(a).post('/api/archive').send(examBody({ duration_minutes: value }));
  expect([200, 400]).toContain(r.status);
  if (r.status === 200) {
    const got = await request(a).get(`/api/archive/${r.body.exam_id}`);
    expect(got.status).toBe(200);
    expect(got.body.exam.title).toBe('Audit');
  }
});

test('regression: archive round-trips a 100k title and Unicode title and ID safely', async () => {
  const a = app();
  const title = '😀你好' + 'x'.repeat(100000);
  const id = 'id-😀-你好';
  const saved = await request(a).post('/api/archive').send(examBody({ exam_id: id, title }));
  expect(saved.status).toBe(200);
  const got = await request(a).get(`/api/archive/${encodeURIComponent(id)}`);
  expect(got.status).toBe(200);
  expect(got.body.exam.title).toBe(title);
});

test('regression: archive treats SQL-like exam IDs as bound data', async () => {
  const a = app();
  const id = "x' OR 1=1 --";
  const saved = await request(a).post('/api/archive').send(examBody({ exam_id: id }));
  expect(saved.status).toBe(200);
  const got = await request(a).get(`/api/archive/${encodeURIComponent(id)}`);
  expect(got.status).toBe(200);
  expect(got.body.exam.exam_id).toBe(id);
  expect((await request(a).get('/api/archive')).body.exams).toHaveLength(1);
});

test('regression: archive autosave does not resurrect a soft-deleted row', async () => {
  const a = app(); const id = await setupArchive(a);
  const del = await request(a).delete(`/api/archive/${id}`); expect(del.status).toBe(200);
  const save = await request(a).post('/api/archive').send(examBody({ exam_id: id, title: 'again' }));
  expect(save.status).toBe(200);
  expect((await request(a).get(`/api/archive/${id}`)).status).toBe(404);
});

test('regression: corrupt archive payload returns JSON 500 and repeated delete returns 404', async () => {
  const a = app(); const id = await setupArchive(a); const db = await getDb();
  await db.run('UPDATE SAVED_EXAM SET payload_json=? WHERE exam_id=?', ['{bad', id]);
  const broken = await request(a).get(`/api/archive/${id}`);
  expect(broken.status).toBe(500); expect(broken.headers['content-type']).toMatch(/application\/json/); expect(broken.body.success).toBe(false);
  expect((await request(a).delete(`/api/archive/${id}`)).status).toBe(200);
  expect((await request(a).delete(`/api/archive/${id}`)).status).toBe(404);
});

test('regression: JSON parser reports malformed JSON as 400 JSON and over-limit body as 413', async () => {
  const a = app();
  const malformed = await request(a).post('/api/archive').set('Content-Type', 'application/json').send('{');
  expect(malformed.status).toBe(400); expect(malformed.headers['content-type']).toMatch(/application\/json/);
  const tooLarge = await request(a).post('/api/archive').set('Content-Type', 'application/json').send(JSON.stringify({ title: 'x', blocks: [], padding: 'x'.repeat(5 * 1024 * 1024) }));
  expect(tooLarge.status).toBe(413);
});

test.each([-1, 'soon', 1e308])('audit: share expiry value %p does not crash or create an unbounded invalid link', async value => {
  const a = app(); const id = await setupExam(a);
  const r = await request(a).post('/api/exams/share').send({ exam_id: id, expires_in_days: value });
  expect([200, 400]).toContain(r.status);
  if (r.status === 200) {
    expect(r.body.share_code).toBeTruthy();
    const shared = await request(a).get(`/api/exams/shared/${r.body.share_code}`);
    expect([200, 410]).toContain(shared.status);
  }
});

test('regression: shared exam response redacts answers, explanations, and correctness flags', async () => {
  const a = app(); const id = await setupExam(a);
  const share = await request(a).post('/api/exams/share').send({ exam_id: id });
  expect(share.status).toBe(200);
  const get = await request(a).get(`/api/exams/shared/${share.body.share_code}`);
  expect(get.status).toBe(200);
  // Redaction null hoa GIA TRI (khoa van con) - kiem tra khong lo dap an.
  expect(JSON.stringify(get.body)).not.toContain('secret explanation');
  for (const q of get.body.exam.blocks.flatMap(b => b.questions)) {
    expect(q.correct_answer == null).toBe(true);
    expect(q.explanation == null).toBe(true);
    expect((q.options || []).some(o => o.is_correct)).toBe(false);
  }
});

test('regression: whitespace-only sync token preserves the previously configured token and response masks it', async () => {
  const a = app(); const token = 'ghp-very-secret-token-value';
  const first = await request(a).post('/api/sync/settings').send({ github_token: token, gist_id: 'g1' }); expect(first.status).toBe(200);
  const second = await request(a).post('/api/sync/settings').send({ github_token: '   ', gist_id: 'g1' }); expect(second.status).toBe(200);
  const get = await request(a).get('/api/sync/settings'); expect(get.status).toBe(200);
  expect(JSON.stringify(get.body)).not.toContain(token); expect(get.body.has_token).toBe(true);
});

test('regression: sync settings responses do not expose the full token on write or read', async () => {
  const a = app(); const token = 'github-token-secret-123456';
  const save = await request(a).post('/api/sync/settings').send({ github_token: token, gist_id: 'g1' }); expect(save.status).toBe(200);
  const get = await request(a).get('/api/sync/settings'); expect(get.status).toBe(200);
  expect(JSON.stringify(save.body)).not.toContain(token); expect(JSON.stringify(get.body)).not.toContain(token);
});

test('regression: background upload rejects path traversal and NUL filenames', async () => {
  const a = app();
  for (const name of ['../secret.png', '..%2Fsecret.png', 'C:\\secret.png', 'nul\u0000.png']) {
    const r = await request(a).post('/api/backgrounds/upload').attach('file', Buffer.from('not an image'), name);
    expect([400, 404]).toContain(r.status);
  }
});

test('regression: resource upload requires a file', async () => {
  const a = app(); const doc = await request(a).post('/api/resources').send({ title: 'Resource' });
  expect(doc.status).toBe(200);
  const missing = await request(a).post(`/api/resources/${doc.body.doc_id}/sections/upload`).send({}); expect(missing.status).toBe(400);
  // Ten file la (../, C:\, NUL) khong nguy hiem o day: upload dung multer
  // memoryStorage, ten goc chi dung de doan dinh dang, khong ghi ra dia.
});

test('regression: resource JSON section endpoint rejects missing body fields and wrong content type safely', async () => {
  const a = app(); const doc = await request(a).post('/api/resources').send({ title: 'Resource' }); expect(doc.status).toBe(200);
  const missing = await request(a).post(`/api/resources/${doc.body.doc_id}/sections`).send({}); expect(missing.status).toBe(400);
  const wrong = await request(a).post(`/api/resources/${doc.body.doc_id}/sections`).set('Content-Type', 'text/plain').send('not json');
  expect([400, 415]).toContain(wrong.status);
});

test('regression: template routes return controlled errors for traversal-like IDs and missing bodies', async () => {
  const a = app();
  for (const id of ['../secret', '..%2Fsecret', 'C:\\secret', 'nul\u0000']) {
    const r = await request(a).get(`/api/templates/${encodeURIComponent(id)}`);
    expect([400, 404]).toContain(r.status);
  }
  const missing = await request(a).post('/api/templates').send({});
  expect([400, 422]).toContain(missing.status);
});

test('regression: settings API key responses never return the full key', async () => {
  const a = app(); const key = 'sk-very-secret-key-123456';
  const saved = await request(a).post('/api/settings/llm').send({ provider: 'openai', api_key: key }); expect(saved.status).toBe(200);
  const got = await request(a).get('/api/settings/llm'); expect(got.status).toBe(200);
  expect(JSON.stringify(saved.body)).not.toContain(key); expect(JSON.stringify(got.body)).not.toContain(key);
});
