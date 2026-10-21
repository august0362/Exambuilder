const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DB_PATH = process.env.EXAM_DB_PATH || path.join(__dirname, 'exam.db');
let dbInstance = null;

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS EXAM (
  exam_id           TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  subject           TEXT,
  duration_minutes  INTEGER,
  school_header     TEXT,
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS QUESTION_BLOCK (
  block_id    TEXT PRIMARY KEY,
  exam_id     TEXT NOT NULL REFERENCES EXAM(exam_id) ON DELETE CASCADE,
  block_type  TEXT NOT NULL CHECK (block_type IN ('MULTIPLE_CHOICE','ESSAY')),
  block_title TEXT,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS QUESTION (
  question_id       TEXT PRIMARY KEY,
  block_id          TEXT NOT NULL REFERENCES QUESTION_BLOCK(block_id) ON DELETE CASCADE,
  question_type     TEXT NOT NULL CHECK (question_type IN ('MCQ','FILL_BLANK','TRUE_FALSE','ESSAY')),
  content           TEXT NOT NULL,
  difficulty_level  TEXT CHECK (difficulty_level IN ('NB','TH','VD','VDC')),
  correct_answer    TEXT,
  explanation       TEXT,
  draft_lines_count INTEGER DEFAULT 0,
  sort_order        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS QUESTION_OPTION (
  option_id    TEXT PRIMARY KEY,
  question_id  TEXT NOT NULL REFERENCES QUESTION(question_id) ON DELETE CASCADE,
  option_key   TEXT,
  option_text  TEXT,
  is_correct   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS EXAM_SHARE (
  share_code  TEXT PRIMARY KEY,
  exam_id     TEXT NOT NULL REFERENCES EXAM(exam_id) ON DELETE CASCADE,
  expires_at  TEXT,
  is_active   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS LLM_SETTINGS (
  provider    TEXT PRIMARY KEY CHECK (provider IN ('openai','anthropic','gemini','deepseek')),
  api_key     TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS LLM_MODEL (
  model_id      TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  source_type   TEXT NOT NULL CHECK (source_type IN ('cloud','local_gguf')),
  provider      TEXT CHECK (provider IN ('openai','anthropic','gemini','deepseek')),
  model_name    TEXT,
  file_path     TEXT,
  file_size     INTEGER,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS RESOURCE_DOCUMENT (
  doc_id      TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  subject     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS RESOURCE_SECTION (
  section_id     TEXT PRIMARY KEY,
  doc_id         TEXT NOT NULL REFERENCES RESOURCE_DOCUMENT(doc_id) ON DELETE CASCADE,
  section_title  TEXT NOT NULL,
  content        TEXT NOT NULL,
  sort_order     INTEGER DEFAULT 0
);

-- Lich su thao tac thu vien tai lieu (tao/them phan/tai file/xoa). Khong co
-- khoa ngoai: giu lai dong lich su ca khi tai lieu da bi xoa.
CREATE TABLE IF NOT EXISTS RESOURCE_HISTORY (
  history_id     INTEGER PRIMARY KEY,
  action         TEXT NOT NULL CHECK (action IN ('create_doc','add_section','upload_section','delete_doc')),
  doc_title      TEXT,
  section_title  TEXT,
  detail         TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Kho de (lich su luu tru): moi de la 1 dong, payload_json giu nguyen
-- { title, subject, duration_minutes, school_header, blocks } - dung 1:1
-- voi file exambuilder-library.json tren Gist de dong bo. Xoa de = dat
-- deleted_at (tombstone), giu dong lai de tombstone lan duoc qua Gist.
CREATE TABLE IF NOT EXISTS SAVED_EXAM (
  exam_id          TEXT PRIMARY KEY,
  title            TEXT,
  subject          TEXT,
  duration_minutes INTEGER,
  school_header    TEXT,
  payload_json     TEXT NOT NULL,
  created_at       TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at       TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deleted_at       TEXT
);

-- Cau hinh dong bo Gist - 1 dong duy nhat (id = 1). Token luu plaintext,
-- cung muc voi LLM_SETTINGS.api_key.
CREATE TABLE IF NOT EXISTS SYNC_SETTINGS (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  github_token   TEXT,
  gist_id        TEXT,
  last_synced_at TEXT
);

-- Outbox ben vung: chi cac thao tac sua/xoa cuc bo tang revision.
-- Pull khong danh dau ban cloud thanh thay doi can day nguoc lai.
CREATE TABLE IF NOT EXISTS AUTO_SYNC_STATE (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 0,
  pushed_revision INTEGER NOT NULL DEFAULT 0,
  theme_json TEXT,
  last_error TEXT,
  last_pushed_at TEXT
);
INSERT OR IGNORE INTO AUTO_SYNC_STATE (id, revision)
  SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM SAVED_EXAM) THEN 1 ELSE 0 END;
CREATE TABLE IF NOT EXISTS ARCHIVE_WRITE_VERSION (
  client_id TEXT NOT NULL,
  exam_id TEXT NOT NULL REFERENCES SAVED_EXAM(exam_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  PRIMARY KEY (client_id, exam_id)
);

-- User templates only. Built-in templates live in the versioned code manifest.
CREATE TABLE IF NOT EXISTS TEMPLATE (
  template_id      TEXT PRIMARY KEY,
  current_version  INTEGER NOT NULL CHECK (current_version >= 1),
  deleted_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS TEMPLATE_VERSION (
  template_id       TEXT NOT NULL REFERENCES TEMPLATE(template_id) ON DELETE CASCADE,
  template_version  INTEGER NOT NULL CHECK (template_version >= 1),
  payload_json      TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (template_id, template_version)
);
`;

// DB tao truoc khi co DeepSeek giu CHECK cu (chi 3 hang) - SQLite khong sua
// duoc CHECK nen dung lai bang, chep nguyen du lieu (key/model da luu).
// Idempotent: chi chay khi DDL hien tai chua co 'deepseek'.
async function migrateProviderCheck(db) {
  for (const table of ['LLM_SETTINGS', 'LLM_MODEL']) {
    const row = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
    if (!row || row.sql.includes("'deepseek'")) continue;
    const newSql = row.sql
      .replace("('openai','anthropic','gemini')", "('openai','anthropic','gemini','deepseek')")
      .replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\w+/i, `CREATE TABLE ${table}_NEW`);
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(newSql);
      await db.exec(`INSERT INTO ${table}_NEW SELECT * FROM ${table}`);
      await db.exec(`DROP TABLE ${table}`);
      await db.exec(`ALTER TABLE ${table}_NEW RENAME TO ${table}`);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  }
}

// Giu promise khoi tao (khong phai ket noi tran): cac request den cung luc khi
// server vua mo phai cho schema + migration xong, neu khong transaction cua
// request se chen vao giua transaction migration ("transaction within a transaction").
let dbReady = null;
function getDb() {
  if (!dbReady) {
    dbReady = (async () => {
      const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db.exec(SCHEMA_SQL);
      await migrateProviderCheck(db);
      dbInstance = db;
      return db;
    })().catch(err => { dbReady = null; throw err; });
  }
  return dbReady;
}

async function closeDb() {
  const pending = dbReady;
  dbReady = null;
  dbInstance = null;
  if (pending) {
    const db = await pending.catch(() => null);
    if (db) await db.close();
  }
}

module.exports = { getDb, closeDb };
