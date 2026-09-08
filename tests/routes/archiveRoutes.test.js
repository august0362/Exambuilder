process.env.EXAM_DB_PATH = ':memory:';

const express = require('express');
const request = require('supertest');
const { closeDb, getDb } = require('../../backend/database');
const archiveRoutes = require('../../backend/routes/archiveRoutes');
const { errorHandler } = require('../../backend/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/archive', archiveRoutes);
  app.use(errorHandler);
  return app;
}

afterEach(async () => {
  jest.restoreAllMocks();
  await closeDb();
});

const BLOCKS = [
  {
    block_type: 'MULTIPLE_CHOICE',
    block_title: 'Phan I',
    questions: [
      {
        question_type: 'MCQ', content: '2 + 2 = ?', difficulty_level: 'NB', correct_answer: 'B',
        options: [
          { option_key: 'A', option_text: '3', is_correct: false },
          { option_key: 'B', option_text: '4', is_correct: true }
        ]
      }
    ]
  }
];

function examBody(over = {}) {
  return { title: 'De HK1', subject: 'Toan', duration_minutes: 45, school_header: 'THPT X', blocks: BLOCKS, ...over };
}

describe('POST /api/archive', () => {
  describe('Happy Path', () => {
    test('TC-ARC-01: luu de moi tra ve exam_id, xuat hien trong danh sach', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/archive').send(examBody());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exam_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.updated).toBe(false);

      const list = await request(app).get('/api/archive');
      expect(list.body.exams).toHaveLength(1);
      expect(list.body.exams[0].title).toBe('De HK1');
    });

    test('TC-ARC-02: gui lai kem exam_id -> cap nhat tai cho, khong tao dong moi', async () => {
      const app = buildApp();
      const first = await request(app).post('/api/archive').send(examBody({ title: 'Ban 1' }));
      const id = first.body.exam_id;

      const second = await request(app).post('/api/archive').send(examBody({ exam_id: id, title: 'Ban 2 da sua' }));
      expect(second.body.exam_id).toBe(id);
      expect(second.body.updated).toBe(true);

      const list = await request(app).get('/api/archive');
      expect(list.body.exams).toHaveLength(1);
      expect(list.body.exams[0].title).toBe('Ban 2 da sua');
    });

    test('TC-ARC-03: GET /:id tra ve payload day du (blocks)', async () => {
      const app = buildApp();
      const saved = await request(app).post('/api/archive').send(examBody());
      const res = await request(app).get(`/api/archive/${saved.body.exam_id}`);
      expect(res.status).toBe(200);
      expect(res.body.exam.blocks).toEqual(BLOCKS);
      expect(res.body.exam.subject).toBe('Toan');
    });
  });

  describe('Negative Cases', () => {
    test('TC-ARC-04: thieu title -> 400', async () => {
      const res = await request(buildApp()).post('/api/archive').send(examBody({ title: '' }));
      expect(res.status).toBe(400);
    });

    test('TC-ARC-05: blocks khong phai mang -> 400', async () => {
      const res = await request(buildApp()).post('/api/archive').send(examBody({ blocks: 'oops' }));
      expect(res.status).toBe(400);
    });

    test('TC-ARC-06: block_type sai -> 400 kem details', async () => {
      const bad = [{ block_type: 'KHONG_CO', questions: [] }];
      const res = await request(buildApp()).post('/api/archive').send(examBody({ blocks: bad }));
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    test('TC-ARC-07: MCQ trung option_key -> 400', async () => {
      const bad = [{
        block_type: 'MULTIPLE_CHOICE', questions: [{
          question_type: 'MCQ', content: 'x', difficulty_level: 'NB',
          options: [
            { option_key: 'A', option_text: '1', is_correct: false },
            { option_key: 'A', option_text: '2', is_correct: true }
          ]
        }]
      }];
      const res = await request(buildApp()).post('/api/archive').send(examBody({ blocks: bad }));
      expect(res.status).toBe(400);
    });
  });

  describe('Exception Handling', () => {
    test('TC-ARC-08: loi CSDL khi ghi -> 500', async () => {
      const db = await getDb();
      jest.spyOn(db, 'run').mockRejectedValueOnce(new Error('disk full'));
      const res = await request(buildApp()).post('/api/archive').send(examBody());
      expect(res.status).toBe(500);
    });
  });
});

describe('DELETE /api/archive/:id (xoa mem)', () => {
  test('TC-ARC-09: xoa an de khoi danh sach nhung van con dong tombstone', async () => {
    const app = buildApp();
    const saved = await request(app).post('/api/archive').send(examBody());
    const id = saved.body.exam_id;

    const del = await request(app).delete(`/api/archive/${id}`);
    expect(del.status).toBe(200);

    const list = await request(app).get('/api/archive');
    expect(list.body.exams).toHaveLength(0);

    const get = await request(app).get(`/api/archive/${id}`);
    expect(get.status).toBe(404);

    const db = await getDb();
    const row = await db.get('SELECT deleted_at FROM SAVED_EXAM WHERE exam_id = ?', [id]);
    expect(row.deleted_at).not.toBeNull();
  });

  test('TC-ARC-10: xoa de khong ton tai -> 404', async () => {
    const res = await request(buildApp()).delete('/api/archive/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  test('TC-ARC-11: autosave (POST kem exam_id) KHONG hoi sinh de da xoa', async () => {
    const app = buildApp();
    const saved = await request(app).post('/api/archive').send(examBody());
    const id = saved.body.exam_id;
    await request(app).delete(`/api/archive/${id}`);

    await request(app).post('/api/archive').send(examBody({ exam_id: id, title: 'sua tiep' }));

    const list = await request(app).get('/api/archive');
    expect(list.body.exams.find(e => e.exam_id === id)).toBeUndefined();
  });
});
