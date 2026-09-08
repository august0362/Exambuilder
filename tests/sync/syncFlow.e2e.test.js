process.env.EXAM_DB_PATH = ':memory:';

const http = require('http');
const express = require('express');
const request = require('supertest');

// E2E: 2 "thiet bi" (2 CSDL in-memory rieng) dong bo qua 1 mock GitHub Gist,
// dung gistClient THAT (khong mock module) - chi tro GITHUB_API_BASE toi mock.

let ghServer;
let gistStore = null;

beforeAll(done => {
  ghServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.method === 'POST' && req.url === '/gists') {
        const f = JSON.parse(body).files;
        gistStore = { id: 'g-e2e', html_url: 'https://gist.github.com/g-e2e', files: f };
        return json(201, gistStore);
      }
      if (req.url === '/gists/g-e2e' && req.method === 'GET') return json(200, gistStore);
      if (req.url === '/gists/g-e2e' && req.method === 'PATCH') {
        gistStore.files = { ...gistStore.files, ...JSON.parse(body).files };
        return json(200, gistStore);
      }
      json(404, { message: 'nope' });
    });
  });
  ghServer.listen(0, () => {
    process.env.GITHUB_API_BASE = `http://127.0.0.1:${ghServer.address().port}`;
    done();
  });
});

afterAll(done => { delete process.env.GITHUB_API_BASE; ghServer.close(done); });

const BLOCKS = [{
  block_type: 'MULTIPLE_CHOICE',
  questions: [{
    question_type: 'MCQ', content: 'q', difficulty_level: 'NB', correct_answer: 'A',
    options: [{ option_key: 'A', option_text: '1', is_correct: true }, { option_key: 'B', option_text: '2', is_correct: false }]
  }]
}];

// Moi "thiet bi" = 1 app Express rieng tren 1 file CSDL rieng.
function makeDevice(dbFile) {
  jest.resetModules();
  process.env.EXAM_DB_PATH = dbFile;
  const archiveRoutes = require('../../backend/routes/archiveRoutes');
  const syncRoutes = require('../../backend/routes/syncRoutes');
  const { closeDb } = require('../../backend/database');
  const { errorHandler } = require('../../backend/errorHandler');
  const app = express();
  app.use(express.json());
  app.use('/api/archive', archiveRoutes);
  app.use('/api/sync', syncRoutes);
  app.use(errorHandler);
  return { app, closeDb };
}

test('TC-E2E-01: PC tao de -> Push (tao Gist) -> Android nhap Gist ID -> Pull thay de; Android xoa -> Push -> PC Pull thi de bien mat', async () => {
  const tmpdir = require('os').tmpdir();
  const path = require('path');
  const pcDbPath = path.join(tmpdir, `eb-e2e-pc-${Date.now()}.db`);
  const adrDbPath = path.join(tmpdir, `eb-e2e-adr-${Date.now()}.db`);
  const fs = require('fs');
  [pcDbPath, adrDbPath].forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });

  // --- PC ---
  let pc = makeDevice(pcDbPath);
  const saved = await request(pc.app).post('/api/archive').send({ title: 'De cua PC', blocks: BLOCKS });
  const examId = saved.body.exam_id;
  await request(pc.app).post('/api/sync/settings').send({ github_token: 'tok_pc' });
  const push1 = await request(pc.app).post('/api/sync/push');
  expect(push1.status).toBe(200);
  expect(push1.body.gist_id).toBe('g-e2e');
  await pc.closeDb();

  // --- Android ---
  let adr = makeDevice(adrDbPath);
  await request(adr.app).post('/api/sync/settings').send({ github_token: 'tok_adr', gist_id: 'g-e2e' });
  const pull1 = await request(adr.app).post('/api/sync/pull');
  expect(pull1.status).toBe(200);
  const adrList = await request(adr.app).get('/api/archive');
  expect(adrList.body.exams.map(e => e.title)).toContain('De cua PC');

  // Android xoa de roi Push
  await request(adr.app).delete(`/api/archive/${examId}`);
  const push2 = await request(adr.app).post('/api/sync/push');
  expect(push2.status).toBe(200);
  await adr.closeDb();

  // --- PC keo ve -> de da bi xoa ---
  pc = makeDevice(pcDbPath);
  const pull2 = await request(pc.app).post('/api/sync/pull');
  expect(pull2.status).toBe(200);
  const pcList = await request(pc.app).get('/api/archive');
  expect(pcList.body.exams.find(e => e.exam_id === examId)).toBeUndefined();
  await pc.closeDb();

  [pcDbPath, adrDbPath].forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
});

test('TC-E2E-02: chu de mau dong bo qua Gist - "lan doi gan nhat thang"', async () => {
  gistStore = null;
  const tmpdir = require('os').tmpdir();
  const path = require('path');
  const fs = require('fs');
  const pcDbPath = path.join(tmpdir, `eb-e2e-theme-pc-${Date.now()}.db`);
  const adrDbPath = path.join(tmpdir, `eb-e2e-theme-adr-${Date.now()}.db`);
  [pcDbPath, adrDbPath].forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });

  const T1 = '2026-03-01T00:00:00.000Z';
  const T2 = '2026-07-01T00:00:00.000Z';

  // --- PC dat theme "winter" roi Push ---
  let pc = makeDevice(pcDbPath);
  await request(pc.app).post('/api/archive').send({ title: 'De', blocks: BLOCKS });
  await request(pc.app).post('/api/sync/settings').send({ github_token: 'tok_pc' });
  const push1 = await request(pc.app).post('/api/sync/push').send({ theme: { id: 'winter', updated_at: T1 } });
  expect(push1.status).toBe(200);
  expect(push1.body.theme).toEqual({ id: 'winter', updated_at: T1 });
  await pc.closeDb();

  // --- Android Pull (chua tung doi theme) -> nhan "winter" ---
  let adr = makeDevice(adrDbPath);
  await request(adr.app).post('/api/sync/settings').send({ github_token: 'tok_adr', gist_id: 'g-e2e' });
  const pull1 = await request(adr.app).post('/api/sync/pull')
    .send({ theme: { id: 'cold', updated_at: '1970-01-01T00:00:00.000Z' } });
  expect(pull1.status).toBe(200);
  expect(pull1.body.theme.id).toBe('winter');

  // --- Android doi theme "grape" (moc moi hon) roi Push ---
  const push2 = await request(adr.app).post('/api/sync/push').send({ theme: { id: 'grape', updated_at: T2 } });
  expect(push2.status).toBe(200);
  expect(push2.body.theme).toEqual({ id: 'grape', updated_at: T2 });
  await adr.closeDb();

  // --- PC Pull -> theme cu (winter/T1) thua -> nhan "grape" ---
  pc = makeDevice(pcDbPath);
  const pull2 = await request(pc.app).post('/api/sync/pull').send({ theme: { id: 'winter', updated_at: T1 } });
  expect(pull2.status).toBe(200);
  expect(pull2.body.theme.id).toBe('grape');
  await pc.closeDb();

  [pcDbPath, adrDbPath].forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
});
