const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const BACKGROUNDS_DIR = path.join(__dirname, '..', '..', 'resources', 'backgrounds');
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.svg']);

// GET /api/backgrounds - liet ke cac file anh nen hop le trong
// resources/backgrounds/ de frontend hien thi trong dropdown chon nen PDF.
router.get('/', (req, res) => {
  fs.readdir(BACKGROUNDS_DIR, (err, files) => {
    if (err) {
      if (err.code === 'ENOENT') return res.json([]);
      return res.status(500).json({ error: 'Khong doc duoc thu muc anh nen.' });
    }
    const images = files.filter(f => ALLOWED_EXT.has(path.extname(f).toLowerCase()));
    res.json(images);
  });
});

module.exports = router;
