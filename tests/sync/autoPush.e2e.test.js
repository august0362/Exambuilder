const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

let github, directory, dbFile, app, database, worker, service, gistId, owner;
let cloud, patches, identities, unavailable, holdRead, releaseRead;
const filename = 'exambuilder-library.json';
const blocks = [{ block_type: 'MULTIPLE_CHOICE', questions: [{
  question_type: 'MCQ', content: 'Câu hỏi?', difficulty_level: 'NB', correct_answer: 'A',
  options: [{ option_key: 'A', option_text: '1', is_correct: true },
    { option_key: 'B', option_text: '2', is_correct: false }]
}] }];
const exam = (title = 'Đề mới', extra = {}) => ({ title, blocks, ...extra });
const waitFor = async predicate => {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for automatic push');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eb-auto-sync-'));
  github = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const json = (code, value) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (unavailable) return json(503, { message: 'offline test' });
      if (req.url === '/user') {
        identities++;
        return json(200, { login: req.headers.authorization === 'Bearer owner-token' ? owner : 'another-user' });
      }
      if (req.url !== '/gists/' + gistId) return json(404, {});
      if (req.method === 'PATCH') {
        patches++;
        cloud = JSON.parse(JSON.parse(body).files[filename].content);
        return json(200, { id: gistId, html_url: 'https://gist.github.com/test' });
      }
      const reply = () => json(200, { files: { [filename]: { content: JSON.stringify(cloud) } } });
      if (holdRead) { holdRead = false; releaseRead = reply; } else reply();
    });
  });
  await new Promise(resolve => github.listen(0, '127.0.0.1', resolve));
  process.env.GITHUB_API_BASE = `http://127.0.0.1:${github.address().port}`;
});

beforeEach(() => {
  jest.resetModules();
  dbFile = path.join(directory, `test-${Date.now()}-${Math.random()}.db`);
  process.env.EXAM_DB_PATH = dbFile;
  ({ DEFAULT_GIST_ID: gistId, SHARED_GIST_OWNER: owner } = require('../../backend/sync/sharedLibrary'));
  database = require('../../backend/database');
  worker = require('../../backend/sync/autoPush');
  service = require('../../backend/sync/service');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/archive', require('../../backend/routes/archiveRoutes'));
  app.use('/api/sync', require('../../backend/routes/syncRoutes'));
  app.use(require('../../backend/errorHandler').errorHandler);
  cloud = { schema: 'exambuilder/library@1', updated_at: new Date().toISOString(), exams: [] };
  patches = 0; identities = 0; unavailable = false; holdRead = false; releaseRead = null;
});

afterEach(async () => {
  worker.stop();
  if (releaseRead) releaseRead();
  await worker.flush();
  worker.stop();
  await database.closeDb();
  fs.unlinkSync(dbFile);
});
afterAll(async () => {
  delete process.env.GITHUB_API_BASE;
  delete process.env.EXAM_DB_PATH;
  await new Promise(resolve => github.close(resolve));
  fs.rmdirSync(directory);
});
const configure = token => request(app).post('/api/sync/settings').send({ github_token: token });
const status = async () => (await request(app).get('/api/sync/settings')).body.auto_push;

test('closing the page wakes the server worker; repeated close signals do not upload twice', async () => {
  await configure('owner-token');
  await request(app).post('/api/archive').send(exam());
  worker.start();
  expect((await request(app).post('/api/sync/auto-push')).status).toBe(202);
  await waitFor(() => patches === 1);
  await worker.flush();
  expect(cloud.exams[0].title).toBe('Đề mới');
  expect(await status()).toMatchObject({ enabled: true, pending: false, last_error: null });
  await request(app).post('/api/sync/auto-push');
  await worker.flush();
  expect(patches).toBe(1);
});

test('offline pending edits survive server restart and are uploaded when it starts again', async () => {
  await configure('owner-token');
  await request(app).post('/api/archive').send(exam('Chờ mạng'));
  unavailable = true;
  expect((await worker.flush()).success).toBe(false);
  expect(await status()).toMatchObject({ pending: true, last_error: expect.stringContaining('503') });
  await database.closeDb(); // reopen the real SQLite file, not an in-memory flag
  unavailable = false;
  worker.start();
  await waitFor(() => patches === 1);
  await worker.flush();
  expect(cloud.exams[0].title).toBe('Chờ mạng');
  expect((await status()).pending).toBe(false);
});

test('missing token and non-owner cannot automatically modify the shared Gist', async () => {
  await request(app).post('/api/archive').send(exam());
  expect((await worker.flush()).skipped).toBe(true);
  expect(identities).toBe(0);
  await configure('someone-else-token');
  expect((await worker.flush()).success).toBe(false);
  expect(patches).toBe(0);
  expect((await status()).last_error).toContain(owner);
});

test('turning automatic Push off persists across restart while manual Push still works', async () => {
  await configure('owner-token');
  await request(app).post('/api/archive').send(exam());
  await request(app).post('/api/sync/settings').send({ auto_push_enabled: false });
  await database.closeDb();
  expect((await worker.flush()).skipped).toBe(true);
  expect(patches).toBe(0);
  expect((await status()).enabled).toBe(false);
  expect((await request(app).post('/api/sync/push')).body.success).toBe(true);
  expect(patches).toBe(1);
});

test('an edit during an upload remains pending and shutdown drain uploads the latest edit', async () => {
  await configure('owner-token');
  const first = await request(app).post('/api/archive').send(exam('Bản cũ'));
  holdRead = true;
  const pushing = worker.flush();
  await waitFor(() => !!releaseRead);
  await request(app).post('/api/archive').send(exam('Bản mới', { exam_id: first.body.exam_id }));
  releaseRead(); releaseRead = null;
  await pushing;
  expect((await status()).pending).toBe(true);
  worker.stop();
  await worker.drain();
  expect(cloud.exams[0].title).toBe('Bản mới');
  expect(patches).toBe(2);
  expect((await status()).pending).toBe(false);
});

test('a late/duplicate beacon cannot overwrite the latest save or create a duplicate exam', async () => {
  await configure('owner-token');
  const write = revision => ({ exam_id: 'stable-id', _write: { client_id: 'browser-tab', revision } });
  await request(app).post('/api/archive').send(exam('Mới', write(2)));
  await request(app).post('/api/archive').send(exam('Cũ', write(1)));
  await request(app).post('/api/archive').send(exam('Mới', write(2)));
  await worker.flush();
  expect(cloud.exams).toHaveLength(1);
  expect(cloud.exams[0].title).toBe('Mới');
  await request(app).post('/api/archive').send(exam('Cũ', write(1)));
  await worker.flush();
  expect(patches).toBe(1);
});

test('deletion is automatically published; Pull alone never creates a write loop', async () => {
  await configure('owner-token');
  const saved = await request(app).post('/api/archive').send(exam());
  await worker.flush();
  await request(app).delete('/api/archive/' + saved.body.exam_id);
  await worker.flush();
  expect(cloud.exams[0].deleted_at).toBeTruthy();
  await service.pullLibrary();
  expect((await worker.flush()).skipped).toBe(true);
  expect(patches).toBe(2);
});

test('bad cloud JSON is not overwritten and the outbox remains pending', async () => {
  await configure('owner-token');
  await request(app).post('/api/archive').send(exam());
  cloud = { broken: true };
  expect((await worker.flush()).success).toBe(false);
  expect(patches).toBe(0);
  expect((await status()).pending).toBe(true);
});
