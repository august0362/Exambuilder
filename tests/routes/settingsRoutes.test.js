process.env.EXAM_DB_PATH = ':memory:';

const mockGenerate = jest.fn();
jest.mock('../../backend/llm/ProviderFactory', () => ({
  createProvider: jest.fn(() => ({ generate: mockGenerate }))
}));

const express = require('express');
const request = require('supertest');
const { closeDb } = require('../../backend/database');
const settingsRoutes = require('../../backend/routes/settingsRoutes');
const { errorHandler } = require('../../backend/errorHandler');
const { createProvider } = require('../../backend/llm/ProviderFactory');

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/settings', settingsRoutes);
  app.use(errorHandler);
  return app;
}

afterEach(async () => {
  jest.clearAllMocks();
  await closeDb();
});

describe('GET/POST /api/settings/llm', () => {
  describe('Happy Path', () => {
    test('TC-SET-01: chua cau hinh provider nao tra ve mang rong', async () => {
      const res = await request(buildApp()).get('/api/settings/llm');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.providers).toEqual([]);
    });

    test('TC-SET-02: luu key roi doc lai chi thay key da che, khong bao gio tra full key', async () => {
      const app = buildApp();
      const saveRes = await request(app).post('/api/settings/llm').send({ provider: 'openai', api_key: 'sk-abcdefgh1234' });
      expect(saveRes.status).toBe(200);
      expect(saveRes.body.success).toBe(true);

      const getRes = await request(app).get('/api/settings/llm');
      expect(getRes.body.providers).toHaveLength(1);
      const row = getRes.body.providers[0];
      expect(row.provider).toBe('openai');
      expect(row.has_key).toBe(true);
      expect(row.masked_key).not.toBe('sk-abcdefgh1234');
      expect(row.masked_key).toContain('...');
      expect(JSON.stringify(getRes.body)).not.toContain('sk-abcdefgh1234');
    });

    test('TC-SET-03: luu lai key cho provider da ton tai se ghi de (upsert), khong tao dong moi', async () => {
      const app = buildApp();
      await request(app).post('/api/settings/llm').send({ provider: 'gemini', api_key: 'AIza-old' });
      await request(app).post('/api/settings/llm').send({ provider: 'gemini', api_key: 'AIza-new' });

      const res = await request(app).get('/api/settings/llm');
      expect(res.body.providers.filter(p => p.provider === 'gemini')).toHaveLength(1);
    });
  });

  describe('Negative Cases', () => {
    test('TC-SET-04: provider khong hop le tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/settings/llm').send({ provider: 'unknown', api_key: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('TC-SET-05: thieu api_key tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/settings/llm').send({ provider: 'openai' });
      expect(res.status).toBe(400);
    });

    test('TC-SET-06: api_key chi toan khoang trang tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/settings/llm').send({ provider: 'openai', api_key: '   ' });
      expect(res.status).toBe(400);
    });
  });
});

describe('POST /api/settings/llm/test', () => {
  describe('Happy Path', () => {
    test('TC-SET-07: goi thanh cong tra ve success true', async () => {
      mockGenerate.mockResolvedValue('OK');
      const res = await request(buildApp()).post('/api/settings/llm/test').send({
        provider: 'openai', api_key: 'sk-test', model_name: 'gpt-4o-mini'
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGenerate).toHaveBeenCalledTimes(1);
    });

    test('TC-SET-08: khong truyen api_key thi dung key da luu truoc do', async () => {
      const app = buildApp();
      await request(app).post('/api/settings/llm').send({ provider: 'openai', api_key: 'sk-saved' });
      mockGenerate.mockResolvedValue('OK');

      const res = await request(app).post('/api/settings/llm/test').send({ provider: 'openai', model_name: 'gpt-4o-mini' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(createProvider).toHaveBeenCalledWith(expect.any(Object), 'sk-saved');
    });
  });

  describe('Negative Cases', () => {
    test('TC-SET-09: provider goi loi tra ve 502 kem thong bao loi', async () => {
      mockGenerate.mockRejectedValue(new Error('OpenAI: loi API (HTTP 401)'));
      const res = await request(buildApp()).post('/api/settings/llm/test').send({
        provider: 'openai', api_key: 'sk-bad', model_name: 'gpt-4o-mini'
      });
      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/HTTP 401/);
    });

    test('TC-SET-10: khong co api_key nao (chua nhap, chua luu) tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/settings/llm/test').send({
        provider: 'anthropic', model_name: 'claude-x'
      });
      expect(res.status).toBe(400);
    });

    test('TC-SET-11: thieu model_name tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/settings/llm/test').send({
        provider: 'openai', api_key: 'sk-test'
      });
      expect(res.status).toBe(400);
    });
  });
});
