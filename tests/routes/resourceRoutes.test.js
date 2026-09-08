process.env.EXAM_DB_PATH = ':memory:';

const express = require('express');
const request = require('supertest');
const { closeDb } = require('../../backend/database');
const resourceRoutes = require('../../backend/routes/resourceRoutes');
const { errorHandler } = require('../../backend/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/resources', resourceRoutes);
  app.use(errorHandler);
  return app;
}

afterEach(async () => { await closeDb(); });

describe('POST /api/resources', () => {
  describe('Happy Path', () => {
    test('TC-RES-01: tao tai lieu hop le tra ve doc_id', async () => {
      const res = await request(buildApp()).post('/api/resources').send({ title: 'SGK Toan 10', subject: 'Toan' });
      expect(res.status).toBe(200);
      expect(res.body.doc_id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Negative Cases', () => {
    test('TC-RES-02: thieu title tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/resources').send({ subject: 'Toan' });
      expect(res.status).toBe(400);
    });
  });
});

describe('GET /api/resources', () => {
  test('TC-RES-03: liet ke tai lieu kem danh sach section long ben trong, dung thu tu sort_order', async () => {
    const app = buildApp();
    const docRes = await request(app).post('/api/resources').send({ title: 'SGK Toan 10' });
    const docId = docRes.body.doc_id;

    await request(app).post(`/api/resources/${docId}/sections`).send({ section_title: 'Chuong 1', content: 'Noi dung 1' });
    await request(app).post(`/api/resources/${docId}/sections`).send({ section_title: 'Chuong 2', content: 'Noi dung 2' });

    const res = await request(app).get('/api/resources');
    expect(res.status).toBe(200);
    const doc = res.body.documents.find(d => d.doc_id === docId);
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections.map(s => s.section_title)).toEqual(['Chuong 1', 'Chuong 2']);
  });
});

describe('POST /api/resources/:doc_id/sections', () => {
  describe('Happy Path', () => {
    test('TC-RES-04: them phan hop le tra ve section_id', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const res = await request(app)
        .post(`/api/resources/${docRes.body.doc_id}/sections`)
        .send({ section_title: 'Phan 1', content: 'Noi dung' });
      expect(res.status).toBe(200);
      expect(res.body.section_id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Negative Cases', () => {
    test('TC-RES-05: doc_id khong ton tai tra ve 404', async () => {
      const res = await request(buildApp())
        .post('/api/resources/00000000-0000-0000-0000-000000000000/sections')
        .send({ section_title: 'X', content: 'Y' });
      expect(res.status).toBe(404);
    });

    test('TC-RES-06: thieu content tra ve 400', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const res = await request(app)
        .post(`/api/resources/${docRes.body.doc_id}/sections`)
        .send({ section_title: 'Phan 1' });
      expect(res.status).toBe(400);
    });
  });
});

describe('DELETE /api/resources/:doc_id', () => {
  test('TC-RES-07: xoa tai lieu se CASCADE xoa het section ben trong', async () => {
    const app = buildApp();
    const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
    const docId = docRes.body.doc_id;
    await request(app).post(`/api/resources/${docId}/sections`).send({ section_title: 'Phan 1', content: 'X' });

    const delRes = await request(app).delete(`/api/resources/${docId}`);
    expect(delRes.status).toBe(200);

    const listRes = await request(app).get('/api/resources');
    expect(listRes.body.documents.find(d => d.doc_id === docId)).toBeUndefined();
  });

  test('TC-RES-08: xoa tai lieu khong ton tai tra ve 404', async () => {
    const res = await request(buildApp()).delete('/api/resources/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
