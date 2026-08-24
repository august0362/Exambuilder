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
