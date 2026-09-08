process.env.EXAM_DB_PATH = ':memory:';
const { getDb, closeDb } = require('../backend/database');

/**
 * Test truc tiep lop du lieu (schema, rang buoc toan ven) tren SQLite
 * in-memory de khong dung cham file exam.db that va co the chay song song,
 * lap lai (idempotent) trong moi lan CI.
 */
describe('database.js (SQLite schema)', () => {
  afterEach(async () => { await closeDb(); });

  test('TC-DB-01: getDb() tao du 11 bang (5 de thi + 4 module LLM + SAVED_EXAM + SYNC_SETTINGS)', async () => {
    const db = await getDb();
    const rows = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tableNames = rows.map(r => r.name).sort();
    expect(tableNames).toEqual([
      'EXAM', 'EXAM_SHARE', 'LLM_MODEL', 'LLM_SETTINGS', 'QUESTION', 'QUESTION_BLOCK', 'QUESTION_OPTION',
      'RESOURCE_DOCUMENT', 'RESOURCE_SECTION', 'SAVED_EXAM', 'SYNC_SETTINGS'
    ]);
  });

  test('TC-DB-06: SAVED_EXAM co du cot (payload_json NOT NULL, deleted_at nullable, timestamp mac dinh ISO)', async () => {
    const db = await getDb();
    const cols = (await db.all('PRAGMA table_info(SAVED_EXAM)')).reduce((m, c) => (m[c.name] = c, m), {});
    expect(Object.keys(cols).sort()).toEqual([
      'created_at', 'deleted_at', 'duration_minutes', 'exam_id', 'payload_json',
      'school_header', 'subject', 'title', 'updated_at'
    ]);
    expect(cols.payload_json.notnull).toBe(1);

    await db.run(
      `INSERT INTO SAVED_EXAM (exam_id, title, payload_json) VALUES (?, ?, ?)`,
      ['e1', 'De 1', '{"blocks":[]}']
    );
    const row = await db.get('SELECT created_at, updated_at, deleted_at FROM SAVED_EXAM WHERE exam_id = ?', ['e1']);
    expect(row.deleted_at).toBeNull();
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('TC-DB-07: SYNC_SETTINGS chi cho phep 1 dong (id = 1)', async () => {
    const db = await getDb();
    await db.run(`INSERT INTO SYNC_SETTINGS (id, github_token) VALUES (1, 'tok')`);
    await expect(
      db.run(`INSERT INTO SYNC_SETTINGS (id, github_token) VALUES (2, 'tok2')`)
    ).rejects.toThrow();
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
