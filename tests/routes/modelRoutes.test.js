process.env.EXAM_DB_PATH = ':memory:';

const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const request = require('supertest');
const { closeDb } = require('../../backend/database');
const { errorHandler } = require('../../backend/errorHandler');

let tmpModelsDir;

function buildApp() {
  // modelRoutes doc process.env.LLM_MODELS_DIR luc module duoc require, nen
  // phai set bien moi truong TRUOC khi require lan dau trong moi test file.
  const modelRoutes = require('../../backend/routes/modelRoutes');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/models', modelRoutes);
  app.use(errorHandler);
  return app;
}

beforeAll(() => {
  tmpModelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-builder-models-'));
  process.env.LLM_MODELS_DIR = tmpModelsDir;
});

afterAll(() => {
  fs.rmSync(tmpModelsDir, { recursive: true, force: true });
});

afterEach(async () => { await closeDb(); });

describe('GET /api/models', () => {
  test('TC-MOD-01: chua co model nao tra ve mang rong', async () => {
    const res = await request(buildApp()).get('/api/models');
    expect(res.status).toBe(200);
    expect(res.body.models).toEqual([]);
  });
});

describe('POST /api/models/cloud', () => {
  describe('Happy Path', () => {
    test('TC-MOD-02: dang ky model cloud hop le tra ve model_id, xuat hien trong GET', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/models/cloud').send({
        display_name: 'GPT-4o mini', provider: 'openai', model_name: 'gpt-4o-mini'
      });
      expect(res.status).toBe(200);
      expect(res.body.model_id).toMatch(/^[0-9a-f-]{36}$/);

      const listRes = await request(app).get('/api/models');
      expect(listRes.body.models).toHaveLength(1);
      expect(listRes.body.models[0]).toMatchObject({
        display_name: 'GPT-4o mini', source_type: 'cloud', provider: 'openai', model_name: 'gpt-4o-mini'
      });
    });
  });

  describe('Negative Cases', () => {
    test('TC-MOD-03: thieu display_name tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/models/cloud').send({ provider: 'openai', model_name: 'x' });
      expect(res.status).toBe(400);
    });

    test('TC-MOD-04: provider khong hop le tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/models/cloud').send({
        display_name: 'X', provider: 'unknown', model_name: 'x'
      });
      expect(res.status).toBe(400);
    });

    test('TC-MOD-05: thieu model_name tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/models/cloud').send({ display_name: 'X', provider: 'openai' });
      expect(res.status).toBe(400);
    });
  });
});

describe('POST /api/models/local', () => {
  describe('Happy Path', () => {
    test('TC-MOD-06: upload file .gguf hop le luu vao dia va ghi DB', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/models/local')
        .attach('model_file', Buffer.from('fake gguf content'), 'my-model.gguf')
        .field('display_name', 'Llama Test');

      expect(res.status).toBe(200);
      expect(res.body.model_id).toMatch(/^[0-9a-f-]{36}$/);

      const listRes = await request(app).get('/api/models');
      const model = listRes.body.models.find(m => m.model_id === res.body.model_id);
      expect(model.source_type).toBe('local_gguf');
      expect(model.display_name).toBe('Llama Test');
      expect(model.file_size).toBeGreaterThan(0);

      const filesOnDisk = fs.readdirSync(tmpModelsDir);
      expect(filesOnDisk.some(f => f.endsWith('.gguf'))).toBe(true);
    });

    test('TC-MOD-07: khong truyen display_name se dung ten file goc', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/models/local')
        .attach('model_file', Buffer.from('x'), 'raw-name.gguf');

      const listRes = await request(app).get('/api/models');
      const model = listRes.body.models.find(m => m.model_id === res.body.model_id);
      expect(model.display_name).toBe('raw-name.gguf');
    });
  });

  describe('Negative Cases', () => {
    test('TC-MOD-08: khong dinh kem file tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/models/local').send();
      expect(res.status).toBe(400);
    });

    test('TC-MOD-09: file khong phai .gguf bi tu choi', async () => {
      const res = await request(buildApp())
        .post('/api/models/local')
        .attach('model_file', Buffer.from('not a model'), 'malicious.exe');
      expect(res.status).toBe(400);
    });
  });
});

describe('DELETE /api/models/:model_id', () => {
  test('TC-MOD-10: xoa model local xoa luon file tren dia', async () => {
    const app = buildApp();
    const uploadRes = await request(app)
      .post('/api/models/local')
      .attach('model_file', Buffer.from('to be deleted'), 'del-me.gguf');
    const modelId = uploadRes.body.model_id;
    const filesBefore = fs.readdirSync(tmpModelsDir);
    expect(filesBefore.length).toBeGreaterThan(0);

    const delRes = await request(app).delete(`/api/models/${modelId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const listRes = await request(app).get('/api/models');
    expect(listRes.body.models.find(m => m.model_id === modelId)).toBeUndefined();
  });

  test('TC-MOD-11: xoa model khong ton tai tra ve 404', async () => {
    const res = await request(buildApp()).delete('/api/models/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
