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
  provider    TEXT PRIMARY KEY CHECK (provider IN ('openai','anthropic','gemini')),
  api_key     TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS LLM_MODEL (
  model_id      TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  source_type   TEXT NOT NULL CHECK (source_type IN ('cloud','local_gguf')),
  provider      TEXT CHECK (provider IN ('openai','anthropic','gemini')),
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
`;

async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await dbInstance.exec(SCHEMA_SQL);
  return dbInstance;
}

async function closeDb() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

module.exports = { getDb, closeDb };
