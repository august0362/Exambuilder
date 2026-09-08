process.env.EXAM_DB_PATH = ':memory:';

const mockGenerate = jest.fn();
const mockCreateProvider = jest.fn(() => ({ generate: mockGenerate }));
jest.mock('../../backend/llm/ProviderFactory', () => ({
  createProvider: (...args) => mockCreateProvider(...args)
}));

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { getDb, closeDb } = require('../../backend/database');
const generateRoutes = require('../../backend/routes/generateRoutes');
const { errorHandler } = require('../../backend/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/generate', generateRoutes);
  app.use(errorHandler);
  return app;
}

const VALID_RAW_TEXT = `=PHAN_1=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: 2 + 2 bang bao nhieu?
A. 3
B. 4
Dap_An: B
Loi_Giai: vi 2+2=4
`;

async function insertCloudModel({ provider = 'openai', modelName = 'gpt-4o-mini' } = {}) {
  const db = await getDb();
  const modelId = crypto.randomUUID();
  await db.run(
    `INSERT INTO LLM_MODEL (model_id, display_name, source_type, provider, model_name) VALUES (?, 'Test Model', 'cloud', ?, ?)`,
    [modelId, provider, modelName]
  );
  return modelId;
}

async function insertLocalModel() {
  const db = await getDb();
  const modelId = crypto.randomUUID();
  await db.run(
    `INSERT INTO LLM_MODEL (model_id, display_name, source_type, file_path) VALUES (?, 'Local Test Model', 'local_gguf', '/fake/model.gguf')`,
    [modelId]
  );
  return modelId;
}

async function insertApiKey(provider = 'openai', apiKey = 'sk-test') {
  const db = await getDb();
  await db.run(`INSERT INTO LLM_SETTINGS (provider, api_key) VALUES (?, ?)`, [provider, apiKey]);
}

async function insertSection(content) {
  const db = await getDb();
  const docId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();
  await db.run(`INSERT INTO RESOURCE_DOCUMENT (doc_id, title) VALUES (?, 'Doc')`, [docId]);
  await db.run(
    `INSERT INTO RESOURCE_SECTION (section_id, doc_id, section_title, content) VALUES (?, ?, 'Section', ?)`,
    [sectionId, docId, content]
  );
  return sectionId;
}

let consoleErrorSpy;
beforeAll(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => { consoleErrorSpy.mockRestore(); });

beforeEach(() => {
  mockGenerate.mockReset();
  mockCreateProvider.mockClear();
  mockCreateProvider.mockImplementation(() => ({ generate: mockGenerate }));
});
afterEach(async () => { await closeDb(); });

describe('POST /api/generate', () => {
  describe('Happy Path', () => {
    test('TC-GEN-01: model cloud voi key hop le, LLM tra dung dinh dang -> 200 kem blocks da parse', async () => {
      const modelId = await insertCloudModel();
      await insertApiKey('openai', 'sk-real-key');
      mockGenerate.mockResolvedValue(VALID_RAW_TEXT);

      const res = await request(buildApp()).post('/api/generate').send({
        model_id: modelId, question_spec: [{ loai: 'TN', muc_do: 'Nhan_Biet', so_luong: 1 }]
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.blocks).toHaveLength(1);
      expect(res.body.blocks[0].questions[0].content).toContain('2 + 2');
      expect(mockCreateProvider).toHaveBeenCalledWith(expect.objectContaining({ model_id: modelId }), 'sk-real-key');
    });

    test('TC-GEN-02: model local_gguf khong can API key -> 200', async () => {
      const modelId = await insertLocalModel();
      mockGenerate.mockResolvedValue(VALID_RAW_TEXT);

      const res = await request(buildApp()).post('/api/generate').send({ model_id: modelId });
      expect(res.status).toBe(200);
      expect(mockCreateProvider).toHaveBeenCalledWith(expect.objectContaining({ model_id: modelId }), null);
    });

    test('TC-GEN-03: LLM tra sai dinh dang lan dau, dung o lan thu lai thu 2 -> 200, generate duoc goi 2 lan', async () => {
      const modelId = await insertCloudModel();
      await insertApiKey();
      mockGenerate
        .mockResolvedValueOnce('noi dung khong dung dinh dang gi ca')
        .mockResolvedValueOnce(VALID_RAW_TEXT);

      const res = await request(buildApp()).post('/api/generate').send({ model_id: modelId });
      expect(res.status).toBe(200);
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      // Lan goi thu 2 phai kem thong bao loi cua lan truoc de LLM tu sua.
      expect(mockGenerate.mock.calls[1][0]).toMatch(/SAI ĐỊNH DẠNG/);
    });

    test('TC-GEN-04: section_ids duoc chon se dua noi dung section vao prompt gui cho LLM', async () => {
      const modelId = await insertCloudModel();
      await insertApiKey();
      const sectionId = await insertSection('Noi dung chuong 1 ve so nguyen');
      mockGenerate.mockResolvedValue(VALID_RAW_TEXT);

      await request(buildApp()).post('/api/generate').send({ model_id: modelId, section_ids: [sectionId] });
      expect(mockGenerate.mock.calls[0][0]).toContain('Noi dung chuong 1 ve so nguyen');
    });
  });

  describe('Negative Cases', () => {
    test('TC-GEN-05: thieu model_id tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/generate').send({});
      expect(res.status).toBe(400);
    });

    test('TC-GEN-06: model_id khong ton tai tra ve 404', async () => {
      const res = await request(buildApp()).post('/api/generate').send({ model_id: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });

    test('TC-GEN-07: model cloud nhung chua cau hinh API key cho provider do -> 400', async () => {
      const modelId = await insertCloudModel({ provider: 'anthropic' });
      const res = await request(buildApp()).post('/api/generate').send({ model_id: modelId });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/API key/);
    });

    test('TC-GEN-08: provider.generate nem loi (vd loi mang) -> 502', async () => {
      const modelId = await insertCloudModel();
      await insertApiKey();
      mockGenerate.mockRejectedValue(new Error('OpenAI: khong the ket noi'));

      const res = await request(buildApp()).post('/api/generate').send({ model_id: modelId });
      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/khong the ket noi/);
    });

    test('TC-GEN-09: LLM lien tuc tra sai dinh dang het so lan thu lai -> 422 kem chi tiet loi parse', async () => {
      const modelId = await insertCloudModel();
      await insertApiKey();
      mockGenerate.mockResolvedValue('van luon sai dinh dang');

      const res = await request(buildApp()).post('/api/generate').send({ model_id: modelId });
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.details).toBeTruthy();
      // Toi da 2 lan thu lai => tong 3 lan goi (1 lan dau + 2 lan retry).
      expect(mockGenerate).toHaveBeenCalledTimes(3);
    });
  });
});
