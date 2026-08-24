process.env.EXAM_DB_PATH = ':memory:';
const { getDb, closeDb } = require('../backend/database');

/**
 * Test truc tiep lop du lieu (schema, rang buoc toan ven) tren SQLite
 * in-memory de khong dung cham file exam.db that va co the chay song song,
 * lap lai (idempotent) trong moi lan CI.
 */
describe('database.js (SQLite schema)', () => {
  afterEach(async () => { await closeDb(); });

  test('TC-DB-01: getDb() tao du 5 bang theo dung ERD', async () => {
    const db = await getDb();
    const rows = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tableNames = rows.map(r => r.name).sort();
    expect(tableNames).toEqual(['EXAM', 'EXAM_SHARE', 'QUESTION', 'QUESTION_BLOCK', 'QUESTION_OPTION']);
  });

  test('TC-DB-02: getDb() goi nhieu lan tra ve cung 1 instance (singleton)', async () => {
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
  });

  test('TC-DB-03 [Negative]: khoa ngoai (foreign key) duoc thuc thi - block tro toi exam_id khong ton tai bi tu choi', async () => {
    const db = await getDb();
    await expect(
      db.run(
        `INSERT INTO QUESTION_BLOCK (block_id, exam_id, block_type, sort_order) VALUES (?, ?, ?, ?)`,
        ['b1', 'exam-khong-ton-tai', 'MULTIPLE_CHOICE', 0]
      )
    ).rejects.toThrow();
  });

  test('TC-DB-04 [Negative]: rang buoc CHECK tu choi block_type nam ngoai enum cho phep', async () => {
    const db = await getDb();
    await db.run(`INSERT INTO EXAM (exam_id, title) VALUES (?, ?)`, ['exam-1', 'De thi test']);
    await expect(
      db.run(
        `INSERT INTO QUESTION_BLOCK (block_id, exam_id, block_type, sort_order) VALUES (?, ?, ?, ?)`,
        ['b1', 'exam-1', 'LOAI_KHONG_HOP_LE', 0]
      )
    ).rejects.toThrow();
  });

  test('TC-DB-04b [Negative]: rang buoc CHECK tu choi difficulty_level nam ngoai enum (NB/TH/VD/VDC)', async () => {
    const db = await getDb();
    await db.run(`INSERT INTO EXAM (exam_id, title) VALUES (?, ?)`, ['exam-1', 'De thi test']);
    await db.run(
      `INSERT INTO QUESTION_BLOCK (block_id, exam_id, block_type, sort_order) VALUES (?, ?, ?, ?)`,
      ['b1', 'exam-1', 'MULTIPLE_CHOICE', 0]
    );
    await expect(
      db.run(
        `INSERT INTO QUESTION (question_id, block_id, question_type, content, difficulty_level, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['q1', 'b1', 'MCQ', 'noi dung', 'SIEU_KHO', 0]
      )
    ).rejects.toThrow();
  });

  test('TC-DB-05: closeDb() dong ket noi, lan getDb() ke tiep tao instance moi va DB rong tro lai', async () => {
    const db = await getDb();
    await db.run(`INSERT INTO EXAM (exam_id, title) VALUES (?, ?)`, ['exam-1', 'De thi test']);

    await closeDb();

    const freshDb = await getDb();
    expect(freshDb).not.toBe(db);
    const rows = await freshDb.all('SELECT * FROM EXAM');
    expect(rows).toHaveLength(0); // ':memory:' moi -> du lieu cu khong con
  });
});
