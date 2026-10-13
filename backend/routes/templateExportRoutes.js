const express = require('express');
const { analyzeTemplateExport, createTemplateDocx, loadMath } = require('../templateExport');
const router = express.Router();

router.post('/analyze', async (req, res) => {
  try { await loadMath(); res.json({ success: true, ...analyzeTemplateExport(req.body || {}) }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/docx', async (req, res) => {
  try {
    const result = await createTemplateDocx(req.body || {});
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', 'attachment; filename="exam-template.docx"');
    res.set('X-Estimated-Pages', String(result.analysis.estimatedPages));
    res.set('X-Pagination-Overflow', result.analysis.warnings.some(x => x.code === 'MAX_PAGES_ESTIMATE') ? 'true' : 'false');
    res.send(result.buffer);
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
