const express = require('express');
const { buildTemplatePrompt, prepareTemplateApply, parseTemplateReviewReport } = require('../templatePrompts');

const router = express.Router();

router.post('/build', (req, res) => {
  try {
    const result = buildTemplatePrompt(req.body || {});
    res.json({ success: true, ...result });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/prepare', async (req, res) => {
  try {
    const result = await prepareTemplateApply(req.body || {});
    res.json({ success: true, draft: result });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/review-report', (req, res) => {
  try {
    const report = parseTemplateReviewReport(req.body?.rawText, req.body?.selectedSlotIds || []);
    res.json({ success: true, report });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
