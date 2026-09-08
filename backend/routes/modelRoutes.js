const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { getDb } = require('../database');

const router = express.Router();

// Cho phep tro toi 1 thu muc tam khi test (giong EXAM_DB_PATH trong
// backend/database.js), tranh ghi file that vao resources/models/ that.
const MODELS_DIR = process.env.LLM_MODELS_DIR || path.join(__dirname, '..', '..', 'resources', 'models');
const VALID_CLOUD_PROVIDERS = ['openai', 'anthropic', 'gemini'];
const MAX_MODEL_FILE_BYTES = 8 * 1024 * 1024 * 1024; // 8GB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    cb(null, MODELS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.gguf`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MODEL_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.gguf') {
      return cb(new Error('Chi chap nhan file .gguf'));
    }
    cb(null, true);
  }
});

router.get('/', async (req, res) => {
  const db = await getDb();
  try {
    const rows = await db.all(
      `SELECT model_id, display_name, source_type, provider, model_name, file_size, created_at
       FROM LLM_MODEL ORDER BY created_at DESC`
    );
    res.json({ success: true, models: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc danh sach model' });
  }
});

router.post('/cloud', async (req, res) => {
  const { display_name, provider, model_name } = req.body;
  if (!display_name || !String(display_name).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu display_name' });
  }
  if (!VALID_CLOUD_PROVIDERS.includes(provider)) {
    return res.status(400).json({ success: false, error: `provider khong hop le: "${provider}"` });
  }
  if (!model_name || !String(model_name).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu model_name' });
  }

  const db = await getDb();
  const modelId = crypto.randomUUID();
  try {
    await db.run(
      `INSERT INTO LLM_MODEL (model_id, display_name, source_type, provider, model_name) VALUES (?, ?, 'cloud', ?, ?)`,
      [modelId, display_name.trim(), provider, model_name.trim()]
    );
    res.json({ success: true, model_id: modelId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi them model cloud' });
  }
});

router.post('/local', (req, res) => {
  upload.single('model_file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ success: false, error: uploadErr.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Thieu file model' });
    }

    const displayName = (req.body.display_name || req.file.originalname).trim();
    const db = await getDb();
    const modelId = crypto.randomUUID();
    try {
      await db.run(
        `INSERT INTO LLM_MODEL (model_id, display_name, source_type, file_path, file_size) VALUES (?, ?, 'local_gguf', ?, ?)`,
        [modelId, displayName, req.file.path, req.file.size]
      );
      res.json({ success: true, model_id: modelId });
    } catch (err) {
      console.error(err);
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ success: false, error: 'Loi luu model local' });
    }
  });
});

router.delete('/:model_id', async (req, res) => {
  const db = await getDb();
  try {
    const model = await db.get('SELECT file_path FROM LLM_MODEL WHERE model_id = ?', [req.params.model_id]);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Khong tim thay model' });
    }
    await db.run('DELETE FROM LLM_MODEL WHERE model_id = ?', [req.params.model_id]);
    if (model.file_path) {
      fs.unlink(model.file_path, () => {});
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi xoa model' });
  }
});

module.exports = router;
