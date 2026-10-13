const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../database');
const { validateExamPayload } = require('../examValidation');
const { buildAssetManifest } = require('../templates/assetManifest');

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
        template_binding: payload.template_binding || null,
        background: payload.background || null,
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc de trong kho' });
  }
});

// Nen gan vao de: chi ten file trong resources/backgrounds (khong duong dan),
// do mo 0,05-1 va cach dat anh. Sai dinh dang -> null.
function normalizeBackground(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const file = typeof value.file === 'string' ? value.file : '';
  if (!/^[\w.-]{1,200}$/.test(file) || file.startsWith('.')) return null;
  const opacity = Number(value.opacity);
  if (!Number.isFinite(opacity) || opacity < 0.05 || opacity > 1) return null;
  return { file, opacity, fit: value.fit === 'contain' ? 'contain' : 'cover' };
}

router.post('/', async (req, res) => {
  const db = await getDb();
  const { exam_id, title, subject, duration_minutes, school_header, blocks, template_binding } = req.body;
  const hasBackground = Object.prototype.hasOwnProperty.call(req.body, 'background');
  let background = null;
  if (hasBackground && req.body.background != null) {
    background = normalizeBackground(req.body.background);
    if (!background) return res.status(400).json({ success: false, error: 'background không hợp lệ' });
  }

  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu title' });
  }
  if (!Array.isArray(blocks)) {
    return res.status(400).json({ success: false, error: 'blocks khong hop le' });
  }
  if (template_binding != null && (typeof template_binding !== 'object' || Array.isArray(template_binding) ||
      Buffer.byteLength(JSON.stringify(template_binding), 'utf8') > 1024 * 1024)) {
    return res.status(400).json({ success: false, error: 'template_binding không hợp lệ hoặc quá lớn' });
  }
  const validationErrors = validateExamPayload(blocks);
  if (validationErrors.length > 0) {
    return res.status(400).json({ success: false, error: 'Du lieu de thi khong hop le', details: validationErrors });
  }

  const payload = {
    title: String(title).trim(),
    subject: subject || '',
    duration_minutes: duration_minutes != null ? duration_minutes : null,
    school_header: school_header || '',
    blocks
  };
  if (Object.prototype.hasOwnProperty.call(req.body, 'template_binding') && template_binding != null) {
    payload.template_binding = template_binding;
  }
  if (background) payload.background = background;

  try {
    let examId = exam_id;
    let existing = null;
    if (examId) {
      existing = await db.get('SELECT exam_id, payload_json FROM SAVED_EXAM WHERE exam_id = ?', [examId]);
    }

    // Older clients omit the new field. Preserve the existing snapshot in that
    // case; explicit null is the only request that clears the association.
    if (existing && !Object.prototype.hasOwnProperty.call(req.body, 'template_binding')) {
      try {
        const previous = JSON.parse(existing.payload_json || '{}');
        if (previous.template_binding) payload.template_binding = previous.template_binding;
      } catch { /* legacy payload is malformed; exam fields still save */ }
    }
    // Tuong tu: client cu khong gui "background" -> giu nen da gan cho de.
    if (existing && !hasBackground) {
      try {
        const previous = JSON.parse(existing.payload_json || '{}');
        const kept = normalizeBackground(previous.background);
        if (kept) payload.background = kept;
      } catch { /* legacy payload is malformed; exam fields still save */ }
    }
    if (payload.template_binding?.template_snapshot) {
      payload.template_binding = {
        ...payload.template_binding,
        asset_manifest: buildAssetManifest(payload.template_binding.template_snapshot, payload.template_binding.asset_manifest)
      };
    }
    const payloadJson = JSON.stringify(payload);

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
