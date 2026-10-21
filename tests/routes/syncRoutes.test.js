process.env.EXAM_DB_PATH = ':memory:';

jest.mock('../../backend/sync/gistClient', () => ({
  LIBRARY_FILENAME: 'exambuilder-library.json',
  getLibrary: jest.fn(),
  createGist: jest.fn(),
  updateGist: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const { closeDb } = require('../../backend/database');
const archiveRoutes = require('../../backend/routes/archiveRoutes');
const syncRoutes = require('../../backend/routes/syncRoutes');
const gistClient = require('../../backend/sync/gistClient');
const { errorHandler } = require('../../backend/errorHandler');
const { DEFAULT_GIST_ID, SHARED_GIST_OWNER } = require('../../backend/sync/sharedLibrary');

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/archive', archiveRoutes);
  app.use('/api/sync', syncRoutes);
  app.use(errorHandler);
  return app;
}

afterEach(async () => {
  jest.clearAllMocks();
  await closeDb();
});

const BLOCKS = [
  {
    block_type: 'MULTIPLE_CHOICE',
    questions: [{
      question_type: 'MCQ', content: 'x', difficulty_level: 'NB', correct_answer: 'A',
      options: [
        { option_key: 'A', option_text: '1', is_correct: true },
        { option_key: 'B', option_text: '2', is_correct: false }
      ]
    }]
  }
];

function examBody(over = {}) {
  return { title: 'De', subject: 'Toan', duration_minutes: 45, school_header: '', blocks: BLOCKS, ...over };
}

function cloudLibrary(exams, theme) {
  const lib = { schema: 'exambuilder/library@1', updated_at: '2026-01-01T00:00:00Z', exams };
  if (theme) lib.theme = theme;
  return JSON.stringify(lib);
}

describe('GET/POST /api/sync/settings', () => {
  test('TC-SYNC-01: may moi co san kho chung, khong can token de doc', async () => {
    const res = await request(buildApp()).get('/api/sync/settings');
    expect(res.body).toMatchObject({ success: true, configured: true, has_token: false,
      gist_id: DEFAULT_GIST_ID, default_gist_id: DEFAULT_GIST_ID, shared_gist_owner: SHARED_GIST_OWNER, is_shared: true });
  });

  test('TC-SYNC-02: luu token roi doc lai chi thay token da che', async () => {
    const app = buildApp();
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_supersecrettoken123', gist_id: 'abc123' });
    const res = await request(app).get('/api/sync/settings');
    expect(res.body.has_token).toBe(true);
    expect(res.body.gist_id).toBe('abc123');
    expect(res.body.masked_token).not.toContain('supersecret');
    expect(JSON.stringify(res.body)).not.toContain('ghp_supersecrettoken123');
  });

  test('TC-SYNC-03: POST chi kem gist_id giu nguyen token da luu', async () => {
    const app = buildApp();
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_keepme_000000' });
    await request(app).post('/api/sync/settings').send({ gist_id: 'newgist' });
    const res = await request(app).get('/api/sync/settings');
    expect(res.body.has_token).toBe(true);
    expect(res.body.gist_id).toBe('newgist');
  });
});

describe('POST /api/sync/push', () => {
  test('TC-SYNC-04: chua co token -> 400', async () => {
    const res = await request(buildApp()).post('/api/sync/push');
    expect(res.status).toBe(400);
  });

  test('TC-SYNC-05: chua co gist_id -> tao Gist moi va luu lai id', async () => {
    const app = buildApp();
    await request(app).post('/api/archive').send(examBody({ title: 'De local' }));
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: '' });
    gistClient.createGist.mockResolvedValue({ id: 'created-gist-id', html_url: 'https://gist.github.com/x' });

    const res = await request(app).post('/api/sync/push');
    expect(res.status).toBe(200);
    expect(gistClient.createGist).toHaveBeenCalledTimes(1);
    expect(gistClient.updateGist).not.toHaveBeenCalled();
    expect(res.body.gist_id).toBe('created-gist-id');

    // id moi da duoc luu vao settings
    const settings = await request(app).get('/api/sync/settings');
    expect(settings.body.gist_id).toBe('created-gist-id');

    // noi dung day len co chua de local
    const pushedContent = JSON.parse(gistClient.createGist.mock.calls[0][1]);
    expect(pushedContent.exams.some(e => e.title === 'De local')).toBe(true);
  });

  test('TC-SYNC-06: co gist_id -> merge(local, cloud) roi updateGist; local thang khi trung id', async () => {
    const app = buildApp();
    const saved = await request(app).post('/api/archive').send(examBody({ title: 'Ban LOCAL' }));
    const id = saved.body.exam_id;
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });

    gistClient.getLibrary.mockResolvedValue(cloudLibrary([
      { exam_id: id, title: 'ban cloud cu', subject: '', duration_minutes: null, school_header: '', blocks: BLOCKS,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null },
      { exam_id: 'cloud-only', title: 'chi co tren cloud', subject: '', duration_minutes: null, school_header: '', blocks: BLOCKS,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null }
    ]));
    gistClient.updateGist.mockResolvedValue({ id: 'g1', html_url: 'https://gist.github.com/g1' });

    const res = await request(app).post('/api/sync/push');
    expect(res.status).toBe(200);
    const content = JSON.parse(gistClient.updateGist.mock.calls[0][2]);
    const merged = Object.fromEntries(content.exams.map(e => [e.exam_id, e]));
    expect(merged[id].title).toBe('Ban LOCAL');          // local thang
    expect(merged['cloud-only'].title).toBe('chi co tren cloud'); // union giu de chi co tren cloud

    // de chi-co-cloud da duoc keo ve may (persist merged)
    const list = await request(app).get('/api/archive');
    expect(list.body.exams.some(e => e.title === 'chi co tren cloud')).toBe(true);
  });

  test('TC-SYNC-07: loi GitHub (401) -> 502 kem thong bao', async () => {
    const app = buildApp();
    await request(app).post('/api/archive').send(examBody());
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_bad_000000000', gist_id: 'g1' });
    gistClient.getLibrary.mockRejectedValue(new Error('GitHub tu choi token (HTTP 401).'));

    const res = await request(app).post('/api/sync/push');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/401/);
  });

  test('cloud co exam hong -> dung push, khong ghi de Gist hoac local', async () => {
    const app = buildApp();
    const saved = await request(app).post('/api/archive').send(examBody({ title: 'ban local' }));
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });
    gistClient.getLibrary.mockResolvedValue(cloudLibrary([null]));

    const res = await request(app).post('/api/sync/push');
    expect(res.status).toBe(502);
    expect(gistClient.updateGist).not.toHaveBeenCalled();
    expect((await request(app).get(`/api/archive/${saved.body.exam_id}`)).body.exam.title).toBe('ban local');
  });
});

describe('POST /api/sync/pull', () => {
  test('may moi Pull kho chung khong can token, khong ghi len GitHub', async () => {
    const app = buildApp();
    gistClient.getLibrary.mockResolvedValue(cloudLibrary([
      { exam_id: 'shared-example', title: 'De chung', subject: '', blocks: BLOCKS,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null }
    ]));
    const res = await request(app).post('/api/sync/pull');
    expect(res.status).toBe(200);
    expect(gistClient.getLibrary).toHaveBeenCalledWith(undefined, DEFAULT_GIST_ID);
    expect(gistClient.updateGist).not.toHaveBeenCalled();
    expect(gistClient.createGist).not.toHaveBeenCalled();
    expect((await request(app).get('/api/archive')).body.exams.some(e => e.exam_id === 'shared-example')).toBe(true);
  });

  test('TC-SYNC-08: chua co gist_id -> 400', async () => {
    const app = buildApp();
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: '' });
    const res = await request(app).post('/api/sync/pull');
    expect(res.status).toBe(400);
  });

  test('TC-SYNC-09: LWW - ban cloud SUA SAU lan xoa cuc bo -> khoi phuc de', async () => {
    const app = buildApp();
    const saved = await request(app).post('/api/archive').send(examBody({ title: 'ban local' }));
    const id = saved.body.exam_id;
    await request(app).delete(`/api/archive/${id}`); // xoa cuc bo -> tombstone
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });

    const later = new Date(Date.now() + 60000).toISOString();
    gistClient.getLibrary.mockResolvedValue(cloudLibrary([
      { exam_id: id, title: 'ban cloud CON SONG', subject: '', duration_minutes: null, school_header: '', blocks: BLOCKS,
        created_at: '2026-01-01T00:00:00Z', updated_at: later, deleted_at: null }
    ]));

    const res = await request(app).post('/api/sync/pull');
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/archive');
    const restored = list.body.exams.find(e => e.exam_id === id);
    expect(restored).toBeDefined();
    expect(restored.title).toBe('ban cloud CON SONG');
  });

  test('TC-SYNC-09b: LWW - ban cloud CU HON lan xoa cuc bo -> de van bi xoa (khong hoi sinh)', async () => {
    const app = buildApp();
    const saved = await request(app).post('/api/archive').send(examBody({ title: 'ban local' }));
    const id = saved.body.exam_id;
    await request(app).delete(`/api/archive/${id}`);
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });

    gistClient.getLibrary.mockResolvedValue(cloudLibrary([
      { exam_id: id, title: 'ban cloud cu', subject: '', duration_minutes: null, school_header: '', blocks: BLOCKS,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null }
    ]));

    const res = await request(app).post('/api/sync/pull');
    expect(res.status).toBe(200);
    const list = await request(app).get('/api/archive');
    expect(list.body.exams.find(e => e.exam_id === id)).toBeUndefined();
  });

  test('TC-SYNC-10: gist chua co file thu vien (getLibrary -> null) van chay, khong nem', async () => {
    const app = buildApp();
    await request(app).post('/api/archive').send(examBody({ title: 'giu lai' }));
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });
    gistClient.getLibrary.mockResolvedValue(null);

    const res = await request(app).post('/api/sync/pull');
    expect(res.status).toBe(200);
    const list = await request(app).get('/api/archive');
    expect(list.body.exams.some(e => e.title === 'giu lai')).toBe(true);
  });
});

describe('dong bo chu de mau (theme) qua body', () => {
  const OLD = '2026-01-01T00:00:00.000Z';
  const NEW = '2026-08-01T00:00:00.000Z';

  test('TC-SYNC-11: push - theme client moi hon -> ghi len Gist + tra ve', async () => {
    const app = buildApp();
    await request(app).post('/api/archive').send(examBody());
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });
    gistClient.getLibrary.mockResolvedValue(cloudLibrary([], { id: 'cold', updated_at: OLD }));
    gistClient.updateGist.mockResolvedValue({ id: 'g1', html_url: 'https://gist.github.com/g1' });

    const res = await request(app).post('/api/sync/push').send({ theme: { id: 'peach', updated_at: NEW } });
    expect(res.status).toBe(200);
    expect(res.body.theme).toEqual({ id: 'peach', updated_at: NEW });
    const content = JSON.parse(gistClient.updateGist.mock.calls[0][2]);
    expect(content.theme).toEqual({ id: 'peach', updated_at: NEW });
  });

  test('TC-SYNC-12: push - theme cloud moi hon -> giu theme cloud, tra ve cho may day', async () => {
    const app = buildApp();
    await request(app).post('/api/archive').send(examBody());
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });
    gistClient.getLibrary.mockResolvedValue(cloudLibrary([], { id: 'midnight', updated_at: NEW }));
    gistClient.updateGist.mockResolvedValue({ id: 'g1', html_url: 'https://gist.github.com/g1' });

    const res = await request(app).post('/api/sync/push').send({ theme: { id: 'cold', updated_at: OLD } });
    expect(res.status).toBe(200);
    expect(res.body.theme).toEqual({ id: 'midnight', updated_at: NEW });
  });

  test('TC-SYNC-13: pull - tra ve theme ben moi hon (cloud)', async () => {
    const app = buildApp();
    await request(app).post('/api/archive').send(examBody());
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });
    gistClient.getLibrary.mockResolvedValue(cloudLibrary([], { id: 'honey', updated_at: NEW }));

    const res = await request(app).post('/api/sync/pull').send({ theme: { id: 'cold', updated_at: OLD } });
    expect(res.status).toBe(200);
    expect(res.body.theme).toEqual({ id: 'honey', updated_at: NEW });
  });

  test('TC-SYNC-14: khong gui theme trong body -> khong nem, theme = theme cloud', async () => {
    const app = buildApp();
    await request(app).post('/api/archive').send(examBody());
    await request(app).post('/api/sync/settings').send({ github_token: 'ghp_token_1234567', gist_id: 'g1' });
    gistClient.getLibrary.mockResolvedValue(cloudLibrary([], { id: 'pine', updated_at: OLD }));

    const res = await request(app).post('/api/sync/pull');
    expect(res.status).toBe(200);
    expect(res.body.theme).toEqual({ id: 'pine', updated_at: OLD });
  });
});
