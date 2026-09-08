const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../database');
const { validateExamPayload } = require('../examValidation');

const router = express.Router();

/**
 * Kho de (lich su luu tru). Moi de la 1 dong SAVED_EXAM voi payload_json giu
 * nguyen { title, subject, duration_minutes, school_header, blocks }. Xoa la
 * "mem" (dat deleted_at) de tombstone con lan duoc qua Gist khi Push.
 */

router.get('/', async (req, res) => {
  const db = await getDb();
  try {
    const rows = await db.all(
      `SELECT exam_id, title, subject, duration_minutes, created_at, updated_at
       FROM SAVED_EXAM WHERE deleted_at IS NULL ORDER BY updated_at DESC`
    );
    res.json({ success: true, exams: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc kho de' });
  }
});

router.get('/:exam_id', async (req, res) => {
  const db = await getDb();
  try {
    const row = await db.get(
      `SELECT * FROM SAVED_EXAM WHERE exam_id = ? AND deleted_at IS NULL`,
      [req.params.exam_id]
    );
    if (!row) return res.status(404).json({ success: false, error: 'Khong tim thay de trong kho' });

    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      return res.status(500).json({ success: false, error: 'Du lieu de trong kho bi hong' });
    }

    res.json({
      success: true,
      exam: {
        exam_id: row.exam_id,
        title: payload.title != null ? payload.title : row.title,
        subject: payload.subject != null ? payload.subject : row.subject,
        duration_minutes: payload.duration_minutes != null ? payload.duration_minutes : row.duration_minutes,
        school_header: payload.school_header != null ? payload.school_header : row.school_header,
        blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc de trong kho' });
  }
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { exam_id, title, subject, duration_minutes, school_header, blocks } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu title' });
  }
  if (!Array.isArray(blocks)) {
    return res.status(400).json({ success: false, error: 'blocks khong hop le' });
  }
  const validationErrors = validateExamPayload(blocks);
  if (validationErrors.length > 0) {
    return res.status(400).json({ success: false, error: 'Du lieu de thi khong hop le', details: validationErrors });
  }

  const payloadJson = JSON.stringify({
    title: String(title).trim(),
    subject: subject || '',
    duration_minutes: duration_minutes != null ? duration_minutes : null,
    school_header: school_header || '',
    blocks
  });

  try {
    let examId = exam_id;
    let existing = null;
    if (examId) {
      existing = await db.get('SELECT exam_id FROM SAVED_EXAM WHERE exam_id = ?', [examId]);
    }

    if (existing) {
      // Khong dung lai deleted_at o day: neu de da bi xoa (tombstone), mot lan
      // autosave nen background KHONG "hoi sinh" no. Muon lay lai de da xoa thi
      // dung "Keo ve" (Pull) - cloud thang khi merge.
      await db.run(
        `UPDATE SAVED_EXAM
         SET title = ?, subject = ?, duration_minutes = ?, school_header = ?,
             payload_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE exam_id = ?`,
        [String(title).trim(), subject || null, duration_minutes || null, school_header || null, payloadJson, examId]
      );
    } else {
      examId = examId || crypto.randomUUID();
      await db.run(
        `INSERT INTO SAVED_EXAM (exam_id, title, subject, duration_minutes, school_header, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [examId, String(title).trim(), subject || null, duration_minutes || null, school_header || null, payloadJson]
      );
    }

    res.json({ success: true, exam_id: examId, updated: !!existing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi luu de vao kho' });
  }
});

router.delete('/:exam_id', async (req, res) => {
  const db = await getDb();
  try {
    const result = await db.run(
      `UPDATE SAVED_EXAM
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE exam_id = ? AND deleted_at IS NULL`,
      [req.params.exam_id]
    );
    if (!result.changes) {
      return res.status(404).json({ success: false, error: 'Khong tim thay de trong kho' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi xoa de khoi kho' });
  }
});

module.exports = router;
