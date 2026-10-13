const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const { getDb } = require('../database');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Ghi lich su thao tac; giu toi da HISTORY_LIMIT dong moi nhat. Loi ghi lich
// su khong duoc lam hong thao tac chinh nen chi log.
const HISTORY_LIMIT = 200;
async function logHistory(db, action, docTitle, sectionTitle = null, detail = null) {
  try {
    await db.run('INSERT INTO RESOURCE_HISTORY (action, doc_title, section_title, detail) VALUES (?, ?, ?, ?)', [action, docTitle, sectionTitle, detail]);
    await db.run('DELETE FROM RESOURCE_HISTORY WHERE history_id NOT IN (SELECT history_id FROM RESOURCE_HISTORY ORDER BY history_id DESC LIMIT ?)', [HISTORY_LIMIT]);
  } catch (err) {
    console.error('Khong ghi duoc lich su tai lieu:', err.message);
  }
}

async function insertSection(db, docId, sectionTitle, content) {
  const countRow = await db.get('SELECT COUNT(*) AS n FROM RESOURCE_SECTION WHERE doc_id = ?', [docId]);
  const sectionId = crypto.randomUUID();
  await db.run(
    'INSERT INTO RESOURCE_SECTION (section_id, doc_id, section_title, content, sort_order) VALUES (?, ?, ?, ?, ?)',
    [sectionId, docId, sectionTitle, content, countRow.n]
  );
  return sectionId;
}

router.get('/history', async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), HISTORY_LIMIT);
    const history = await db.all('SELECT history_id, action, doc_title, section_title, detail, created_at FROM RESOURCE_HISTORY ORDER BY history_id DESC LIMIT ?', [limit]);
    res.json({ success: true, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc lich su tai lieu' });
  }
});

router.get('/', async (req, res) => {
  const db = await getDb();
  try {
    const docs = await db.all('SELECT doc_id, title, subject, created_at FROM RESOURCE_DOCUMENT ORDER BY created_at DESC');
    for (const doc of docs) {
      doc.sections = await db.all(
        'SELECT section_id, section_title, sort_order FROM RESOURCE_SECTION WHERE doc_id = ? ORDER BY sort_order ASC',
        [doc.doc_id]
      );
    }
    res.json({ success: true, documents: docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc thu vien tai lieu' });
  }
});

router.post('/', async (req, res) => {
  const { title, subject } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu title' });
  }

  const db = await getDb();
  const docId = crypto.randomUUID();
  try {
    await db.run(
      'INSERT INTO RESOURCE_DOCUMENT (doc_id, title, subject) VALUES (?, ?, ?)',
      [docId, title.trim(), subject || null]
    );
    await logHistory(db, 'create_doc', title.trim(), null, subject || null);
    res.json({ success: true, doc_id: docId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi tao tai lieu' });
  }
});

router.post('/:doc_id/sections', async (req, res) => {
  const { section_title, content } = req.body;
  if (!section_title || !String(section_title).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu section_title' });
  }
  if (!content || !String(content).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu content' });
  }

  const db = await getDb();
  try {
    const doc = await db.get('SELECT doc_id, title FROM RESOURCE_DOCUMENT WHERE doc_id = ?', [req.params.doc_id]);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Khong tim thay tai lieu' });
    }

    const sectionId = await insertSection(db, req.params.doc_id, section_title.trim(), content);
    await logHistory(db, 'add_section', doc.title, section_title.trim(), `${content.length} ky tu`);
    res.json({ success: true, section_id: sectionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi them phan tai lieu' });
  }
});

// Trich lop chu cua PDF cho tab "Tai file" (khong luu gi). PDF scan khong co
// lop chu -> bao scanned=true; khong co OCR theo quyet dinh cau 34.
router.post('/extract-pdf-text', (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ success: false, error: uploadErr.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'Thieu file' });
    const buffer = req.file.buffer;
    if (buffer.length < 5 || buffer.toString('latin1', 0, 5) !== '%PDF-') {
      return res.status(400).json({ success: false, error: 'Tep khong phai PDF hop le' });
    }
    let parser;
    try {
      parser = new PDFParse({ data: buffer });
      const info = await parser.getInfo();
      const result = await parser.getText();
      // pdf-parse chen dau "-- 1 of N --" giua cac trang: bo di truoc khi dem chu.
      const text = String(result.text || '').replace(/^\s*-- \d+ of \d+ --\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length > 1024 * 1024) return res.status(400).json({ success: false, error: 'Noi dung PDF vuot 1 MB van ban' });
      const pages = Number(info?.total) || null;
      res.json({ success: true, text, pages, scanned: text.replace(/\s/g, '').length < Math.max(20, (pages || 1) * 5) });
    } catch (err) {
      res.status(400).json({ success: false, error: `Khong the doc noi dung tep PDF: ${err.message}` });
    } finally {
      if (parser) await parser.destroy().catch(() => {});
    }
  });
});

router.post('/:doc_id/sections/upload', (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ success: false, error: uploadErr.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Thieu file' });
    }

    const db = await getDb();
    try {
      const doc = await db.get('SELECT doc_id, title FROM RESOURCE_DOCUMENT WHERE doc_id = ?', [req.params.doc_id]);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Khong tim thay tai lieu' });
      }

      const originalName = req.file.originalname || '';
      const ext = originalName.split('.').pop().toLowerCase();

      let content;
      if (ext === 'txt') {
        content = req.file.buffer.toString('utf8');
      } else if (ext === 'docx') {
        try {
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          content = result.value;
        } catch (err) {
          return res.status(400).json({ success: false, error: `Khong the doc noi dung tep Word: ${err.message}` });
        }
      } else if (ext === 'pdf') {
        let parser;
        try {
          parser = new PDFParse({ data: req.file.buffer });
          const result = await parser.getText();
          content = result.text;
        } catch (err) {
          return res.status(400).json({ success: false, error: `Khong the doc noi dung tep PDF: ${err.message}` });
        } finally {
          if (parser) await parser.destroy();
        }
      } else {
        return res.status(400).json({ success: false, error: `Dinh dang tep khong duoc ho tro: ".${ext}". Chi nhan .txt, .docx, .pdf` });
      }

      if (ext === 'pdf') content = content.replace(/^\s*-- \d+ of \d+ --\s*$/gm, '').trim();
      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, error: ext === 'pdf' ? 'PDF nay la ban scan (anh), khong co lop chu de doc; phien ban nay khong co OCR' : 'Tep khong co noi dung van ban' });
      }

      const sectionTitle = (req.body.section_title && req.body.section_title.trim())
        || originalName.replace(/\.[^.]+$/, '')
        || 'Phan moi';

      const sectionId = await insertSection(db, req.params.doc_id, sectionTitle, content);
      await logHistory(db, 'upload_section', doc.title, sectionTitle, originalName);
      res.json({ success: true, section_id: sectionId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Loi tai file len' });
    }
  });
});

router.delete('/:doc_id', async (req, res) => {
  const db = await getDb();
  try {
    const doc = await db.get('SELECT title FROM RESOURCE_DOCUMENT WHERE doc_id = ?', [req.params.doc_id]);
    const result = await db.run('DELETE FROM RESOURCE_DOCUMENT WHERE doc_id = ?', [req.params.doc_id]);
    if (!result.changes) {
      return res.status(404).json({ success: false, error: 'Khong tim thay tai lieu' });
    }
    await logHistory(db, 'delete_doc', doc?.title || null);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi xoa tai lieu' });
  }
});

module.exports = router;
