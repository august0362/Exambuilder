const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { withLock } = require('../backend/mutex');

// DB tao truoc khi co DeepSeek: CHECK chi cho 3 hang. getDb() phai dung lai
// bang ma giu nguyen key/model da luu, va chay lai khong loi (idempotent).
test('TC-DB-MIG-01: nang CHECK provider them deepseek, giu du lieu cu', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exam-mig-')), 'old.db');
  const old = await open({ filename: file, driver: sqlite3.Database });
  await old.exec(`CREATE TABLE LLM_SETTINGS (provider TEXT PRIMARY KEY CHECK (provider IN ('openai','anthropic','gemini')), api_key TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE LLM_MODEL (model_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, source_type TEXT NOT NULL CHECK (source_type IN ('cloud','local_gguf')), provider TEXT CHECK (provider IN ('openai','anthropic','gemini')), model_name TEXT, file_path TEXT, file_size INTEGER, created_at TEXT DEFAULT (datetime('now')));
    INSERT INTO LLM_SETTINGS(provider, api_key) VALUES ('anthropic', 'sk-ant-old');
    INSERT INTO LLM_MODEL(model_id, display_name, source_type, provider, model_name) VALUES ('m1', 'Claude', 'cloud', 'anthropic', 'claude-x');`);
  await old.close();
  process.env.EXAM_DB_PATH = file;
  let database;
  jest.isolateModules(() => { database = require('../backend/database'); });
  const db = await database.getDb();
  expect(await db.get("SELECT api_key FROM LLM_SETTINGS WHERE provider = 'anthropic'")).toEqual({ api_key: 'sk-ant-old' });
  expect((await db.get("SELECT model_name FROM LLM_MODEL WHERE model_id = 'm1'")).model_name).toBe('claude-x');
  await db.run("INSERT INTO LLM_SETTINGS(provider, api_key) VALUES ('deepseek', 'sk-ds')");
  await db.run("INSERT INTO LLM_MODEL(model_id, display_name, source_type, provider, model_name) VALUES ('m2', 'DS', 'cloud', 'deepseek', 'deepseek-chat')");
  await expect(db.run("INSERT INTO LLM_SETTINGS(provider, api_key) VALUES ('khac', 'x')")).rejects.toThrow(/CHECK/);
  await database.closeDb();
  let again;
  jest.isolateModules(() => { again = require('../backend/database'); });
  const db2 = await again.getDb();
  expect((await db2.all('SELECT provider FROM LLM_SETTINGS ORDER BY provider')).map(r => r.provider)).toEqual(['anthropic', 'deepseek']);
  await again.closeDb();
});

test('TC-DB-MIG-02: request dong thoi khi server vua mo khong chen transaction vao migration', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exam-mig-')), 'old.db');
  const old = await open({ filename: file, driver: sqlite3.Database });
  await old.exec(`CREATE TABLE LLM_SETTINGS (provider TEXT PRIMARY KEY CHECK (provider IN ('openai','anthropic','gemini')), api_key TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
    INSERT INTO LLM_SETTINGS(provider, api_key) VALUES ('gemini', 'AIza-old');`);
  await old.close();
  process.env.EXAM_DB_PATH = file;
  let database;
  jest.isolateModules(() => { database = require('../backend/database'); });
  // Giong luc trinh duyet vua mo: nhieu route cung goi getDb() va mo transaction.
  const results = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
    // Route that lay ket noi roi ghi trong withLock (backend/mutex.js).
    const db = await database.getDb();
    await withLock(async () => {
      await db.exec('BEGIN IMMEDIATE');
      await db.run('INSERT INTO SAVED_EXAM(exam_id, payload_json) VALUES (?, ?)', [`e${i}`, '{}']);
      await db.exec('COMMIT');
    });
    return true;
  }).map(p => p.catch(e => e.message)));
  expect(results.every(r => r === true)).toBe(true);
  const db = await database.getDb();
  expect((await db.get('SELECT COUNT(*) n FROM SAVED_EXAM')).n).toBe(8);
  expect((await db.get("SELECT api_key FROM LLM_SETTINGS WHERE provider = 'gemini'")).api_key).toBe('AIza-old');
  await database.closeDb();
});
