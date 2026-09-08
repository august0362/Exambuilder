const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../database');

const router = express.Router();

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
    const doc = await db.get('SELECT doc_id FROM RESOURCE_DOCUMENT WHERE doc_id = ?', [req.params.doc_id]);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Khong tim thay tai lieu' });
    }

    const countRow = await db.get('SELECT COUNT(*) AS n FROM RESOURCE_SECTION WHERE doc_id = ?', [req.params.doc_id]);
    const sectionId = crypto.randomUUID();
    await db.run(
      'INSERT INTO RESOURCE_SECTION (section_id, doc_id, section_title, content, sort_order) VALUES (?, ?, ?, ?, ?)',
      [sectionId, req.params.doc_id, section_title.trim(), content, countRow.n]
    );
    res.json({ success: true, section_id: sectionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi them phan tai lieu' });
  }
});

router.delete('/:doc_id', async (req, res) => {
  const db = await getDb();
  try {
    const result = await db.run('DELETE FROM RESOURCE_DOCUMENT WHERE doc_id = ?', [req.params.doc_id]);
    if (!result.changes) {
      return res.status(404).json({ success: false, error: 'Khong tim thay tai lieu' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi xoa tai lieu' });
  }
});

module.exports = router;
