const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');
const { getDb } = require('../database');
const { withLock } = require('../mutex');
const { validateExamPayload } = require('../examValidation');

const router = express.Router();

/**
 * Sample POST /api/exams/save payload:
 * {
 *   "title": "De kiem tra HK1 - Toan 10",
 *   "subject": "Toan",
 *   "duration_minutes": 45,
 *   "school_header": "Truong THPT ABC",
 *   "blocks": [
 *     {
 *       "block_type": "MULTIPLE_CHOICE",
 *       "block_title": "Phan I. Trac nghiem",
 *       "questions": [
 *         {
 *           "question_type": "MCQ",
 *           "content": "2 + 2 = ?",
 *           "difficulty_level": "NB",
 *           "correct_answer": "A",
 *           "explanation": "2+2=4",
 *           "options": [
 *             { "option_key": "A", "option_text": "4", "is_correct": true },
 *             { "option_key": "B", "option_text": "3", "is_correct": false }
 *           ]
 *         }
 *       ]
 *     },
 *     {
 *       "block_type": "ESSAY",
 *       "block_title": "Phan II. Tu luan",
 *       "questions": [
 *         {
 *           "question_type": "ESSAY",
 *           "content": "Giai phuong trinh...",
 *           "difficulty_level": "VDC",
 *           "explanation": "Huong dan giai...",
 *           "draft_lines_count": 8
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
router.post('/save', async (req, res) => {
  const db = await getDb();
  const { title, subject, duration_minutes, school_header, blocks = [] } = req.body;
  if (!title || !Array.isArray(blocks)) {
    return res.status(400).json({ success: false, error: 'Thieu title hoac blocks khong hop le' });
  }

  const validationErrors = validateExamPayload(blocks);
  if (validationErrors.length > 0) {
    return res.status(400).json({ success: false, error: 'Du lieu de thi khong hop le', details: validationErrors });
  }

  const examId = crypto.randomUUID();

  try {
    // Ung dung dung 1 ket noi SQLite dung chung cho moi request. Neu khong
    // xep hang, 2 request /save chay dong thoi co the goi BEGIN TRANSACTION
    // xen ke nhau tren cung 1 ket noi -> SQLite nem "cannot start a
    // transaction within a transaction", va neu ROLLBACK theo sau cung that
    // bai (khong co transaction nao dang mo cho RIENG request nay) thi loi
    // do se thoat khoi try/catch, tro thanh unhandled rejection va LAM SAP
    // TOAN BO SERVER. withLock() dam bao chi 1 giao dich chay tai 1 thoi
    // diem tren ket noi nay.
    await withLock(async () => {
      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `INSERT INTO EXAM (exam_id, title, subject, duration_minutes, school_header) VALUES (?, ?, ?, ?, ?)`,
          [examId, title, subject || null, duration_minutes || null, school_header || null]
        );

        for (let bi = 0; bi < blocks.length; bi++) {
          const block = blocks[bi];
          const blockId = crypto.randomUUID();
          await db.run(
            `INSERT INTO QUESTION_BLOCK (block_id, exam_id, block_type, block_title, sort_order) VALUES (?, ?, ?, ?, ?)`,
            [blockId, examId, block.block_type, block.block_title || null, bi]
          );

          const questions = block.questions || [];
          for (let qi = 0; qi < questions.length; qi++) {
            const q = questions[qi];
            const questionId = crypto.randomUUID();
            await db.run(
              `INSERT INTO QUESTION (question_id, block_id, question_type, content, difficulty_level, correct_answer, explanation, draft_lines_count, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                questionId,
                blockId,
                q.question_type,
                q.content,
                q.difficulty_level || null,
                q.correct_answer || null,
                q.explanation || null,
                q.draft_lines_count || 0,
                qi
              ]
            );

            const options = q.options || [];
            for (const opt of options) {
              await db.run(
                `INSERT INTO QUESTION_OPTION (option_id, question_id, option_key, option_text, is_correct) VALUES (?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), questionId, opt.option_key, opt.option_text, opt.is_correct ? 1 : 0]
              );
            }
          }
        }

        await db.exec('COMMIT');
      } catch (err) {
        try {
          await db.exec('ROLLBACK');
        } catch (rollbackErr) {
          console.error('ROLLBACK that bai:', rollbackErr);
        }
        throw err;
      }
    });

    res.json({ success: true, exam_id: examId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi luu de thi' });
  }
});

async function fetchFullExam(db, examId) {
  const exam = await db.get(`SELECT * FROM EXAM WHERE exam_id = ?`, [examId]);
  if (!exam) return null;

  const blocks = await db.all(
    `SELECT * FROM QUESTION_BLOCK WHERE exam_id = ? ORDER BY sort_order ASC`,
    [examId]
  );

  for (const block of blocks) {
    const questions = await db.all(
      `SELECT * FROM QUESTION WHERE block_id = ? ORDER BY sort_order ASC`,
      [block.block_id]
    );
    for (const q of questions) {
      q.options = await db.all(
        `SELECT option_key, option_text, is_correct FROM QUESTION_OPTION WHERE question_id = ?`,
        [q.question_id]
      );
    }
    block.questions = questions;
  }
  exam.blocks = blocks;
  return exam;
}

router.get('/:exam_id', async (req, res) => {
  const db = await getDb();
  try {
    const exam = await fetchFullExam(db, req.params.exam_id);
    if (!exam) return res.status(404).json({ success: false, error: 'Khong tim thay de thi' });
    res.json({ success: true, exam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi lay du lieu de thi' });
  }
});

router.post('/share', async (req, res) => {
  const db = await getDb();
  try {
    const { exam_id, expires_in_days } = req.body;
    if (expires_in_days !== undefined && expires_in_days !== null &&
        (!Number.isFinite(expires_in_days) || expires_in_days < 0 || expires_in_days > 3650)) {
      return res.status(400).json({ success: false, error: 'expires_in_days khong hop le' });
    }
    const exam = await db.get(`SELECT exam_id FROM EXAM WHERE exam_id = ?`, [exam_id]);
    if (!exam) return res.status(404).json({ success: false, error: 'De thi khong ton tai' });

    const shareCode = crypto.randomBytes(4).toString('hex');
    const expiresAt = (expires_in_days !== undefined && expires_in_days !== null)
      ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
      : null;

    await db.run(
      `INSERT INTO EXAM_SHARE (share_code, exam_id, expires_at, is_active) VALUES (?, ?, ?, 1)`,
      [shareCode, exam_id, expiresAt]
    );

    res.json({ success: true, share_code: shareCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi tao link chia se' });
  }
});

router.delete('/share/:share_code', async (req, res) => {
  const db = await getDb();
  try {
    const result = await db.run(
      `UPDATE EXAM_SHARE SET is_active = 0 WHERE share_code = ?`,
      [req.params.share_code]
    );
    if (!result.changes) {
      return res.status(404).json({ success: false, error: 'Khong tim thay link chia se' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi thu hoi link chia se' });
  }
});

router.get('/shared/:share_code', async (req, res) => {
  const db = await getDb();
  try {
    const share = await db.get(
      `SELECT * FROM EXAM_SHARE WHERE share_code = ? AND is_active = 1`,
      [req.params.share_code]
    );
    if (!share) return res.status(404).json({ success: false, error: 'Link chia se khong hop le' });
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'Link chia se da het han' });
    }

    const exam = await fetchFullExam(db, share.exam_id);
    if (!exam) return res.status(404).json({ success: false, error: 'Khong tim thay de thi' });
    // Link chia se danh cho hoc sinh: khong tra dap an/loi giai qua API.
    const { redactExamForStudent } = await import(pathToFileURL(path.join(__dirname, '..', 'parser', 'examRedaction.js')).href);
    res.json({ success: true, exam: redactExamForStudent(exam) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi lay du lieu de thi chia se' });
  }
});

module.exports = router;
