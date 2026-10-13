process.env.EXAM_DB_PATH = ':memory:';

const express = require('express');
const request = require('supertest');
const { getDb, closeDb } = require('../../backend/database');
const examRoutes = require('../../backend/routes/examRoutes');
const { errorHandler } = require('../../backend/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/exams', examRoutes);
  app.use(errorHandler); // dung chung middleware voi server.js (xem TC-API-13)
  return app;
}

const validMcqBlock = {
  block_type: 'MULTIPLE_CHOICE',
  block_title: 'Phan I. Trac nghiem',
  questions: [
    {
      question_type: 'MCQ',
      content: '2 + 2 = ?',
      difficulty_level: 'NB',
      correct_answer: 'A',
      explanation: 'vi 2+2=4',
      options: [
        { option_key: 'A', option_text: '4', is_correct: true },
        { option_key: 'B', option_text: '3', is_correct: false }
      ]
    }
  ]
};

const validEssayBlock = {
  block_type: 'ESSAY',
  block_title: 'Phan II. Tu luan',
  questions: [
    {
      question_type: 'ESSAY',
      content: 'Giai phuong trinh x^2 - 4 = 0',
      difficulty_level: 'VDC',
      explanation: 'x = 2 hoac x = -2',
      draft_lines_count: 6
    }
  ]
};

function validExamPayload(overrides = {}) {
  return {
    title: 'De kiem tra HK1',
    subject: 'Toan',
    duration_minutes: 45,
    school_header: 'Truong THPT ABC',
    blocks: [validMcqBlock, validEssayBlock],
    ...overrides
  };
}

// SQLite3 se log loi ra console.error khi 1 cau lenh trong transaction that
// bai (du da duoc try/catch bat va ROLLBACK dung). Tat console.error trong
// suot file test nay de output gon gang, khong che giau assertion nao.
let consoleErrorSpy;
beforeAll(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => { consoleErrorSpy.mockRestore(); });

afterEach(async () => { await closeDb(); });

describe('POST /api/exams/save', () => {
  describe('Happy Path', () => {
    test('TC-API-01: luu de day du (MCQ + ESSAY) tra ve 200 va exam_id dang UUID', async () => {
      const res = await request(buildApp()).post('/api/exams/save').send(validExamPayload());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exam_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('TC-API-02: luu de chi co block MULTIPLE_CHOICE (khong co tu luan) thanh cong', async () => {
      const res = await request(buildApp())
        .post('/api/exams/save')
        .send(validExamPayload({ blocks: [validMcqBlock] }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('TC-API-03 [Edge]: blocks = [] (mang rong) hien dang duoc CHAP NHAN, tao ra de khong co cau hoi nao', async () => {
      // Ghi chu: day la hanh vi hien tai (co the khong phai chu y ban dau).
      // API chi kiem tra Array.isArray(blocks), khong kiem tra blocks.length > 0.
      const res = await request(buildApp()).post('/api/exams/save').send(validExamPayload({ blocks: [] }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('TC-API-04: cac truong tuy chon (subject, duration_minutes, school_header) co the bo trong', async () => {
      const res = await request(buildApp())
        .post('/api/exams/save')
        .send({ title: 'De toi gian', blocks: [validMcqBlock] });
      expect(res.status).toBe(200);

      const getRes = await request(buildApp()).get(`/api/exams/${res.body.exam_id}`);
      expect(getRes.body.exam.subject).toBeNull();
      expect(getRes.body.exam.duration_minutes).toBeNull();
      expect(getRes.body.exam.school_header).toBeNull();
    });

    test('TC-API-05: tieu de rat dai (5000 ky tu) van luu thanh cong (TEXT khong gioi han do dai)', async () => {
      const longTitle = 'A'.repeat(5000);
      const res = await request(buildApp())
        .post('/api/exams/save')
        .send(validExamPayload({ title: longTitle }));
      expect(res.status).toBe(200);
      const getRes = await request(buildApp()).get(`/api/exams/${res.body.exam_id}`);
      expect(getRes.body.exam.title).toHaveLength(5000);
    });

    test('TC-API-09 [Edge]: "blocks" bi thieu hoan toan (undefined) mac dinh thanh mang rong va van duoc chap nhan (200)', async () => {
      // Ghi chu: destructuring `blocks = []` khien request khong co "blocks"
      // duoc coi la de hop le voi 0 block, thay vi bi tu choi 400. Neu day
      // khong phai hanh vi mong muon, nen validate blocks.length > 0.
      const res = await request(buildApp()).post('/api/exams/save').send({ title: 'De khong co blocks' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Negative Cases', () => {
    test('TC-API-07: thieu truong "title" bat buoc tra ve 400', async () => {
      const res = await request(buildApp())
        .post('/api/exams/save')
        .send({ blocks: [validMcqBlock] });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('TC-API-08: "blocks" khong phai mang (la chuoi) tra ve 400', async () => {
      const res = await request(buildApp())
        .post('/api/exams/save')
        .send({ title: 'De loi', blocks: 'khong-phai-mang' });
      expect(res.status).toBe(400);
    });

    test('TC-API-10 [Da sua]: question_type ngoai enum bi validateExamPayload() chan tu tang API (400), khong cham toi CSDL', async () => {
      // Truoc khi sua gap #3: gia tri nay lot qua toi tan CSDL va bi CHECK
      // constraint tu choi giua chung giao dich (500 + ROLLBACK). Sau khi
      // sua, request bi tu choi som hon (400) truoc khi mo transaction.
      const badPayload = validExamPayload({
        blocks: [{ block_type: 'MULTIPLE_CHOICE', questions: [{ question_type: 'LOAI_LA', content: 'x' }] }]
      });
      const res = await request(buildApp()).post('/api/exams/save').send(badPayload);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.details[0]).toMatch(/question_type khong hop le/);

      const db = await getDb();
      const rows = await db.all('SELECT * FROM EXAM');
      expect(rows).toHaveLength(0);
    });

    test('TC-API-10b [Da sua]: MCQ voi it hon 2 lua chon bi tu choi o tang API (400)', async () => {
      const badPayload = validExamPayload({
        blocks: [{ block_type: 'MULTIPLE_CHOICE', questions: [{ question_type: 'MCQ', content: 'x', options: [{ option_key: 'A', option_text: '1' }] }] }]
      });
      const res = await request(buildApp()).post('/api/exams/save').send(badPayload);
      expect(res.status).toBe(400);
      expect(res.body.details[0]).toMatch(/it nhat 2 lua chon/);
    });

    test('TC-API-10c [Da sua]: MCQ voi correct_answer khong khop lua chon nao bi tu choi o tang API (400)', async () => {
      const badPayload = validExamPayload({
        blocks: [{
          block_type: 'MULTIPLE_CHOICE',
          questions: [{
            question_type: 'MCQ',
            content: 'x',
            correct_answer: 'Z',
            options: [{ option_key: 'A', option_text: '1' }, { option_key: 'B', option_text: '2' }]
          }]
        }]
      });
      const res = await request(buildApp()).post('/api/exams/save').send(badPayload);
      expect(res.status).toBe(400);
      expect(res.body.details[0]).toMatch(/correct_answer khong khop/);
    });

    test('TC-API-10d [Da sua]: difficulty_level ngoai enum (NB/TH/VD/VDC) bi tu choi o tang API (400)', async () => {
      const badPayload = validExamPayload({
        blocks: [{ block_type: 'ESSAY', questions: [{ question_type: 'ESSAY', content: 'x', difficulty_level: 'SIEU_KHO' }] }]
      });
      const res = await request(buildApp()).post('/api/exams/save').send(badPayload);
      expect(res.status).toBe(400);
      expect(res.body.details[0]).toMatch(/difficulty_level khong hop le/);
    });

    test('TC-API-11 [Security] SQL Injection: chuoi gia SQLi trong title duoc luu/doc lai nguyen van, khong thuc thi', async () => {
      const maliciousTitle = "Robert'); DROP TABLE EXAM;--";
      const res = await request(buildApp())
        .post('/api/exams/save')
        .send(validExamPayload({ title: maliciousTitle }));
      expect(res.status).toBe(200);

      const getRes = await request(buildApp()).get(`/api/exams/${res.body.exam_id}`);
      expect(getRes.body.exam.title).toBe(maliciousTitle); // luu nguyen van, khong bi thuc thi nhu lenh SQL

      const db = await getDb();
      const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
      expect(tables.map(t => t.name)).toContain('EXAM'); // bang EXAM van con nguyen
    });

    test('TC-API-12 [Security] XSS payload: noi dung duoc luu/tra ve nguyen van (escape la trach nhiem cua frontend)', async () => {
      const xssContent = '<img src=x onerror=alert(1)>';
      const payload = validExamPayload({
        blocks: [{
          block_type: 'MULTIPLE_CHOICE',
          questions: [{
            question_type: 'MCQ',
            content: xssContent,
            options: [{ option_key: 'A', option_text: '1' }, { option_key: 'B', option_text: '2' }]
          }]
        }]
      });
      const res = await request(buildApp()).post('/api/exams/save').send(payload);
      const getRes = await request(buildApp()).get(`/api/exams/${res.body.exam_id}`);
      expect(getRes.body.exam.blocks[0].questions[0].content).toBe(xssContent);
      // Ghi chu: dung nhu thiet ke - API la tang luu tru du lieu thuan tuy,
      // khong sanitize HTML. frontend/script.js hien thi noi dung cau hoi
      // bang `element.textContent` (khong dung innerHTML) nen an toan XSS
      // o tang render; day chi la test xac nhan tang API khong lam sai lech
      // du lieu goc.
    });
  });

  describe('Exception Handling', () => {
    test('TC-API-13 [Da sua]: JSON body loi cu phap duoc tra ve 400 dung dinh dang JSON {success:false,error} dong nhat voi cac loi khac', async () => {
      // Truoc khi sua gap #6: loi nay den tu body-parser cua Express (nem
      // SyntaxError truoc khi vao duoc route handler), khong di qua khoi
      // try/catch cua route nen tra ve trang loi HTML mac dinh thay vi JSON.
      // Sau khi them backend/errorHandler.js lam middleware loi toan cuc,
      // response nay gio dong nhat voi moi loi nghiep vu khac.
      const res = await request(buildApp())
        .post('/api/exams/save')
        .set('Content-Type', 'application/json')
        .send('{ "title": bad json ');
      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toEqual({ success: false, error: expect.any(String) });
    });

    test('TC-API-14: loi CSDL giua giao dich (mock db.run reject) duoc bat, tra ve 500 va ROLLBACK, khong lam sap server', async () => {
      const db = await getDb();
      const originalRun = db.run.bind(db);
      let callCount = 0;
      const runSpy = jest.spyOn(db, 'run').mockImplementation((...args) => {
        callCount += 1;
        // Thu tu db.run() thuc te trong route: (1) INSERT EXAM, (2) INSERT
        // QUESTION_BLOCK, (3) INSERT QUESTION, (4) INSERT QUESTION_OPTION dau
        // tien. Cho 3 lenh dau thanh cong, that bai ngay o lenh thu 4 de mo
        // phong loi CSDL xay ra giua chung giao dich.
        if (callCount === 4) return Promise.reject(new Error('SIMULATED_DB_FAILURE'));
        return originalRun(...args);
      });

      const res = await request(buildApp()).post('/api/exams/save').send(validExamPayload());
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);

      runSpy.mockRestore();
      const rows = await db.all('SELECT * FROM EXAM');
      expect(rows).toHaveLength(0); // ROLLBACK don sach du lieu mo cuc
    });
  });
});

describe('GET /api/exams/:exam_id', () => {
  test('TC-API-15 [Happy]: lay lai de da luu, cau truc long nhau blocks/questions/options day du va dung thu tu', async () => {
    const saveRes = await request(buildApp()).post('/api/exams/save').send(validExamPayload());
    const getRes = await request(buildApp()).get(`/api/exams/${saveRes.body.exam_id}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.exam.blocks).toHaveLength(2);
    expect(getRes.body.exam.blocks[0].block_type).toBe('MULTIPLE_CHOICE');
    expect(getRes.body.exam.blocks[0].questions[0].options).toHaveLength(2);
    expect(getRes.body.exam.blocks[1].block_type).toBe('ESSAY');
  });

  test('TC-API-16 [Edge]: cau hoi tu luan (khong co options) tra ve options la mang rong, khong phai null/undefined', async () => {
    const saveRes = await request(buildApp())
      .post('/api/exams/save')
      .send(validExamPayload({ blocks: [validEssayBlock] }));
    const getRes = await request(buildApp()).get(`/api/exams/${saveRes.body.exam_id}`);
    expect(getRes.body.exam.blocks[0].questions[0].options).toEqual([]);
  });

  test('TC-API-17 [Negative]: exam_id dung dinh dang nhung khong ton tai tra ve 404', async () => {
    const res = await request(buildApp()).get('/api/exams/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('TC-API-18 [Security] exam_id chua ky tu la (path traversal / SQLi) khong gay crash, tra ve 404 an toan', async () => {
    const res = await request(buildApp()).get('/api/exams/' + encodeURIComponent("1' OR '1'='1"));
    expect(res.status).toBe(404);
  });

  test('TC-API-19 [Exception]: loi doc CSDL (mock db.get reject) tra ve 500, khong lam sap server', async () => {
    const db = await getDb();
    const getSpy = jest.spyOn(db, 'get').mockRejectedValue(new Error('SIMULATED_DB_READ_FAILURE'));
    const res = await request(buildApp()).get('/api/exams/any-id');
    expect(res.status).toBe(500);
    getSpy.mockRestore();
  });
});

describe('POST /api/exams/share', () => {
  async function saveSampleExam() {
    const res = await request(buildApp()).post('/api/exams/save').send(validExamPayload());
    return res.body.exam_id;
  }

  test('TC-API-20 [Happy]: tao link chia se khong co han (expires_in_days khong truyen) -> is_active=1, expires_at=null', async () => {
    const examId = await saveSampleExam();
    const res = await request(buildApp()).post('/api/exams/share').send({ exam_id: examId });
    expect(res.status).toBe(200);
    expect(res.body.share_code).toMatch(/^[0-9a-f]{8}$/);

    const db = await getDb();
    const row = await db.get('SELECT * FROM EXAM_SHARE WHERE share_code = ?', [res.body.share_code]);
    expect(row.is_active).toBe(1);
    expect(row.expires_at).toBeNull();
  });

  test('TC-API-21 [Happy]: tao link chia se co han 7 ngay -> expires_at ~ 7 ngay sau', async () => {
    const examId = await saveSampleExam();
    const res = await request(buildApp()).post('/api/exams/share').send({ exam_id: examId, expires_in_days: 7 });
    const db = await getDb();
    const row = await db.get('SELECT * FROM EXAM_SHARE WHERE share_code = ?', [res.body.share_code]);
    const diffDays = (new Date(row.expires_at).getTime() - Date.now()) / 86400000;
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  test('TC-API-22 [Da sua][Edge]: expires_in_days = 0 duoc hieu la "het han ngay lap tuc", khong con bi coi la khong gioi han', async () => {
    // Truoc khi sua gap #4: `expires_in_days ? ... : null` dung kiem tra
    // truthy nen expires_in_days = 0 bi hieu nham thanh "khong truyen" (het
    // han = null). Sau khi doi sang so sanh voi undefined/null, gia tri 0
    // duoc tinh thanh mot moc thoi gian that (xap xi hien tai).
    const examId = await saveSampleExam();
    const res = await request(buildApp()).post('/api/exams/share').send({ exam_id: examId, expires_in_days: 0 });
    const db = await getDb();
    const row = await db.get('SELECT * FROM EXAM_SHARE WHERE share_code = ?', [res.body.share_code]);
    expect(row.expires_at).not.toBeNull();
    expect(Math.abs(new Date(row.expires_at).getTime() - Date.now())).toBeLessThan(5000);
  });

  test('TC-API-23 [Negative]: chia se voi exam_id khong ton tai tra ve 404', async () => {
    const res = await request(buildApp()).post('/api/exams/share').send({ exam_id: 'khong-ton-tai' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('TC-API-24 [Negative]: thieu exam_id trong body khong lam crash, tra ve 404 an toan', async () => {
    const res = await request(buildApp()).post('/api/exams/share').send({});
    expect(res.status).toBe(404);
  });

  test('TC-API-25 [Exception]: loi CSDL khi tao share (mock db.run reject) tra ve 500', async () => {
    const examId = await saveSampleExam();
    const db = await getDb();
    const runSpy = jest.spyOn(db, 'run').mockRejectedValue(new Error('SIMULATED_DB_FAILURE'));
    const res = await request(buildApp()).post('/api/exams/share').send({ exam_id: examId });
    expect(res.status).toBe(500);
    runSpy.mockRestore();
  });
});

describe('DELETE /api/exams/share/:share_code', () => {
  // Endpoint them de sua gap #5: truoc day EXAM_SHARE.is_active ton tai
  // trong schema nhung khong co API nao dat lai ve 0, nen 1 link da tao la
  // vinh vien (tru khi co expires_in_days). Endpoint nay cho phep giao vien
  // thu hoi (vo hieu hoa) mot link da chia se.
  async function saveAndShare() {
    const saveRes = await request(buildApp()).post('/api/exams/save').send(validExamPayload());
    const shareRes = await request(buildApp()).post('/api/exams/share').send({ exam_id: saveRes.body.exam_id });
    return shareRes.body.share_code;
  }

  test('TC-API-31 [Happy]: thu hoi link hop le tra ve 200, va link do khong con mo duoc nua', async () => {
    const shareCode = await saveAndShare();

    const delRes = await request(buildApp()).delete(`/api/exams/share/${shareCode}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const getRes = await request(buildApp()).get(`/api/exams/shared/${shareCode}`);
    expect(getRes.status).toBe(404);
  });

  test('TC-API-32 [Negative]: thu hoi share_code khong ton tai tra ve 404', async () => {
    const res = await request(buildApp()).delete('/api/exams/share/deadbeef');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('TC-API-33 [Exception]: loi CSDL khi thu hoi link (mock db.run reject) tra ve 500', async () => {
    const shareCode = await saveAndShare();
    const db = await getDb();
    const runSpy = jest.spyOn(db, 'run').mockRejectedValue(new Error('SIMULATED_DB_FAILURE'));
    const res = await request(buildApp()).delete(`/api/exams/share/${shareCode}`);
    expect(res.status).toBe(500);
    runSpy.mockRestore();
  });
});

describe('GET /api/exams/shared/:share_code', () => {
  async function saveAndShare(expiresInDays) {
    const saveRes = await request(buildApp()).post('/api/exams/save').send(validExamPayload());
    const shareRes = await request(buildApp())
      .post('/api/exams/share')
      .send({ exam_id: saveRes.body.exam_id, expires_in_days: expiresInDays });
    return shareRes.body.share_code;
  }

  test('TC-API-26 [Happy]: link chia se hop le, chua het han -> tra ve du lieu de thi', async () => {
    const shareCode = await saveAndShare();
    const res = await request(buildApp()).get(`/api/exams/shared/${shareCode}`);
    expect(res.status).toBe(200);
    expect(res.body.exam.blocks).toHaveLength(2);
  });

  test('TC-API-26b [Security]: link chia se hoc sinh khong tra dap an, loi giai hay is_correct', async () => {
    const shareCode = await saveAndShare();
    const res = await request(buildApp()).get(`/api/exams/shared/${shareCode}`);
    expect(res.status).toBe(200);
    expect(res.body.exam.redacted_for_student).toBe(true);
    for (const block of res.body.exam.blocks) for (const q of block.questions) {
      expect(q.correct_answer).toBeNull();
      expect(q.explanation).toBeNull();
      for (const option of q.options || []) expect(option.is_correct).toBe(false);
    }
  });

  test('TC-API-27 [Edge]: link bi vo hieu hoa (is_active=0) bi GET /shared/:code tu choi (404)', async () => {
    const shareCode = await saveAndShare();
    const db = await getDb();
    await db.run('UPDATE EXAM_SHARE SET is_active = 0 WHERE share_code = ?', [shareCode]);

    const res = await request(buildApp()).get(`/api/exams/shared/${shareCode}`);
    expect(res.status).toBe(404);
  });

  test('TC-API-28 [Negative]: share_code khong ton tai tra ve 404', async () => {
    const res = await request(buildApp()).get('/api/exams/shared/deadbeef');
    expect(res.status).toBe(404);
  });

  test('TC-API-29 [Negative]: link chia se da het han tra ve 410 Gone', async () => {
    const shareCode = await saveAndShare();
    const db = await getDb();
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    await db.run('UPDATE EXAM_SHARE SET expires_at = ? WHERE share_code = ?', [pastDate, shareCode]);

    const res = await request(buildApp()).get(`/api/exams/shared/${shareCode}`);
    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
  });

  test('TC-API-30 [Exception]: loi CSDL khi doc link chia se (mock db.get reject) tra ve 500', async () => {
    const shareCode = await saveAndShare();
    const db = await getDb();
    const getSpy = jest.spyOn(db, 'get').mockRejectedValue(new Error('SIMULATED_DB_FAILURE'));
    const res = await request(buildApp()).get(`/api/exams/shared/${shareCode}`);
    expect(res.status).toBe(500);
    getSpy.mockRestore();
  });
});
