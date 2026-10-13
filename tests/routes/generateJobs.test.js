process.env.EXAM_DB_PATH = ':memory:';

const mockGenerate = jest.fn();
jest.mock('../../backend/llm/ProviderFactory', () => ({
  createProvider: () => ({ generate: (...args) => mockGenerate(...args) })
}));

const express = require('express');
const request = require('supertest');
const { getDb, closeDb } = require('../../backend/database');
const generateRoutes = require('../../backend/routes/generateRoutes');

const NL = String.fromCharCode(10);
const ONE_TN = ['=PHAN_1=', '[CAU_HOI]', 'Loai: TN', 'Muc_Do: Nhan_Biet', 'De_Bai: 2 + 2 = ?', 'A. 3', 'B. 4', 'Dap_An: B', 'Loi_Giai: vi 2+2=4', ''].join(NL);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/generate', generateRoutes);
  return app;
}
async function withKey() {
  const db = await getDb();
  await db.run("INSERT OR REPLACE INTO LLM_SETTINGS (provider, api_key) VALUES ('openai', 'sk-x')");
}
async function waitJob(app, id) {
  for (let i = 0; i < 100; i++) {
    const res = await request(app).get(`/api/generate/jobs/${id}`);
    if (res.body.job.state === 'done') return res.body.job;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('job khong xong');
}

beforeEach(() => mockGenerate.mockReset());
afterEach(async () => { await closeDb(); });

test('TC-JOB-01: job bao tien do khi dang cho AI, xong tra blocks', async () => {
  await withKey();
  let release;
  mockGenerate.mockImplementation(() => new Promise(r => { release = () => r(ONE_TN); }));
  const app = buildApp();
  const start = await request(app).post('/api/generate/jobs').send({ provider: 'openai', model_name: 'gpt-x' });
  expect(start.status).toBe(202);
  let job;
  for (let i = 0; i < 100 && !release; i++) await new Promise(r => setTimeout(r, 10));
  job = (await request(app).get(`/api/generate/jobs/${start.body.job_id}`)).body.job;
  expect(job).toMatchObject({ state: 'running', stage: 'calling', attempt: 1, max_attempts: 3 });
  expect(job.message).toContain('Đang chờ AI');
  release();
  job = await waitJob(app, start.body.job_id);
  expect(job.status).toBe(200);
  expect(job.result.blocks[0].questions).toHaveLength(1);
});

test('TC-JOB-02: loi dau vao tra trong ket qua job voi ma loi, job khong ton tai -> 404', async () => {
  const app = buildApp();
  const start = await request(app).post('/api/generate/jobs').send({});
  const job = await waitJob(app, start.body.job_id);
  expect(job.status).toBe(400);
  expect(job.result.success).toBe(false);
  expect((await request(app).get('/api/generate/jobs/khong-co')).status).toBe(404);
});

test('TC-ASK-01: AI hoi lai -> needs_input kem cau hoi, khong coi la sai dinh dang', async () => {
  await withKey();
  mockGenerate.mockResolvedValue(['[HOI_NGUOI_DUNG]', '1. Đề cho lớp mấy?', '[/HOI_NGUOI_DUNG]'].join(NL));
  const res = await request(buildApp()).post('/api/generate').send({ provider: 'openai', model_name: 'gpt-x', allow_questions: true });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ success: true, needs_input: true, round: 1 });
  expect(res.body.questions).toContain('lớp mấy');
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  expect(mockGenerate.mock.calls[0][0]).toContain('[HOI_NGUOI_DUNG]');
});

test('TC-ASK-02: gui kem cau tra loi -> prompt chua trao doi; het luot hoi thi cam hoi them', async () => {
  await withKey();
  mockGenerate.mockResolvedValue(ONE_TN);
  const clarifications = [{ question: '1. Lớp mấy?', answer: 'Lớp 9' }, { question: '1. Chương nào?', answer: 'Căn bậc hai' }];
  const res = await request(buildApp()).post('/api/generate').send({ provider: 'openai', model_name: 'gpt-x', allow_questions: true, clarifications });
  expect(res.body.blocks).toBeDefined();
  const prompt = mockGenerate.mock.calls[0][0];
  expect(prompt).toContain('Trả lời của người dùng:' + NL + 'Lớp 9');
  expect(prompt).toContain('Căn bậc hai');
  expect(prompt).toContain('KHÔNG hỏi thêm');
  expect(prompt).not.toContain('ĐƯỢC PHÉP HỎI LẠI');
});

test('TC-ASK-03: tat cho phep hoi -> khoi hoi bi coi la sai dinh dang (giu hanh vi cu)', async () => {
  await withKey();
  mockGenerate.mockResolvedValue(['[HOI_NGUOI_DUNG]', '1. Lớp mấy?', '[/HOI_NGUOI_DUNG]'].join(NL));
  const res = await request(buildApp()).post('/api/generate').send({ provider: 'openai', model_name: 'gpt-x' });
  expect(res.status).toBe(422);
  expect(mockGenerate.mock.calls[0][0]).not.toContain('ĐƯỢC PHÉP HỎI LẠI');
});

test('TC-JOB-STOP: dung/huy cat request AI dang cho, job ket thuc stopped/cancelled', async () => {
  await withKey();
  for (const mode of ['stop', 'cancel']) {
    let seenSignal;
    mockGenerate.mockReset();
    mockGenerate.mockImplementation((prompt, opts) => new Promise((resolve, reject) => {
      seenSignal = opts && opts.signal;
      seenSignal.addEventListener('abort', () => { const e = new Error('da dung'); e.code = 'USER_ABORT'; reject(e); });
    }));
    const app = buildApp();
    const start = await request(app).post('/api/generate/jobs').send({ provider: 'openai', model_name: 'gpt-x' });
    for (let i = 0; i < 100 && !seenSignal; i++) await new Promise(r => setTimeout(r, 10));
    const cancel = await request(app).post(`/api/generate/jobs/${start.body.job_id}/cancel`).send({ mode });
    expect(cancel.body).toMatchObject({ success: true, mode });
    const job = await waitJob(app, start.body.job_id);
    expect(seenSignal.aborted).toBe(true);
    expect(job.stage).toBe(mode === 'stop' ? 'stopped' : 'cancelled');
    expect(job.result).toMatchObject({ success: false, cancelled: true, mode });
  }
});

test('TC-RAG-ROUTE: chi chon tai lieu (khong tick phan) -> AI doc toan bo cac phan', async () => {
  await withKey();
  const db = await getDb();
  await db.run("INSERT INTO RESOURCE_DOCUMENT (doc_id, title) VALUES ('d1', 'SGK')");
  await db.run("INSERT INTO RESOURCE_SECTION (section_id, doc_id, section_title, content, sort_order) VALUES ('s1', 'd1', 'Chuong 1', 'NOI_DUNG_MOT', 0), ('s2', 'd1', 'Chuong 2', 'NOI_DUNG_HAI', 1)");
  mockGenerate.mockResolvedValue(ONE_TN);
  const res = await request(buildApp()).post('/api/generate').send({ provider: 'openai', model_name: 'gpt-x', doc_id: 'd1' });
  const prompt = mockGenerate.mock.calls[0][0];
  expect(prompt).toContain('NOI_DUNG_MOT');
  expect(prompt).toContain('NOI_DUNG_HAI');
  expect(prompt.indexOf('NOI_DUNG_MOT')).toBeLessThan(prompt.indexOf('NOI_DUNG_HAI'));
  expect(res.body.context_info).toMatchObject({ mode: 'full', sections: 2 });
});

test('TC-BUSY-01: Gemini 503 qua tai -> tu thu lai roi thanh cong', async () => {
  await withKey();
  mockGenerate.mockReset();
  mockGenerate
    .mockRejectedValueOnce(new Error('Gemini: loi API (HTTP 503) - {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'))
    .mockResolvedValueOnce(ONE_TN);
  const res = await request(buildApp()).post('/api/generate').send({ provider: 'openai', model_name: 'gpt-x' });
  expect(res.status).toBe(200);
  expect(mockGenerate).toHaveBeenCalledTimes(2);
});

test('TC-BUSY-02: qua tai mai -> 502 kem goi y tieng Viet va thong bao gon, khong JSON tho; het credit khong thu lai', async () => {
  await withKey();
  mockGenerate.mockReset();
  mockGenerate.mockRejectedValue(new Error('Gemini: loi API (HTTP 503) - {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'));
  const res = await request(buildApp()).post('/api/generate').send({ provider: 'openai', model_name: 'gpt-x' });
  expect(res.status).toBe(502);
  expect(res.body.transient).toBe(true);
  expect(mockGenerate).toHaveBeenCalledTimes(3);
  expect(res.body.error).toContain('quá tải');
  expect(res.body.error).toContain('(HTTP 503) - This model is currently experiencing high demand.');
  expect(res.body.error).not.toContain('{"error"');
  mockGenerate.mockReset();
  mockGenerate.mockRejectedValue(new Error('Anthropic: loi API (HTTP 400) - {"error":{"message":"Your credit balance is too low"}}'));
  const credit = await request(buildApp()).post('/api/generate').send({ provider: 'openai', model_name: 'gpt-x' });
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  expect(credit.body.error).toContain('hết tiền/credit');
});

test('TC-RAW-01: raw_prompt (thu vien mau) -> gui nguyen prompt, tra van ban tho khong parse', async () => {
  await withKey();
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue('=PHAN_1=' + NL + '[CAU_HOI]' + NL + 'Ma_Khung: builtin.t01.s01.q001');
  const res = await request(buildApp()).post('/api/generate').send({ provider: 'openai', model_name: 'gpt-x', raw_prompt: 'PROMPT_P1_CUA_MAU', allow_questions: true });
  expect(res.status).toBe(200);
  expect(res.body.raw_text).toContain('Ma_Khung: builtin.t01.s01.q001');
  expect(res.body.blocks).toBeUndefined();
  const sent = mockGenerate.mock.calls[0][0];
  expect(sent.startsWith('PROMPT_P1_CUA_MAU')).toBe(true);
  expect(sent).toContain('ĐƯỢC PHÉP HỎI LẠI');
  expect(sent).not.toContain('NGỮ CẢNH THAM KHẢO');
});
