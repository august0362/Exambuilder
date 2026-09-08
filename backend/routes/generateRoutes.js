const express = require('express');
const { getDb } = require('../database');
const { createProvider } = require('../llm/ProviderFactory');
const { buildPrompt, buildRetryPrompt } = require('../llm/promptBuilder');

const router = express.Router();

const MAX_RETRY = 2; // toi da 2 lan thu lai sau lan dau, tong toi da 3 lan goi LLM

router.post('/', async (req, res) => {
  const { model_id, section_ids = [], topic, question_spec = [] } = req.body;
  if (!model_id) {
    return res.status(400).json({ success: false, error: 'Thieu model_id' });
  }

  const db = await getDb();

  const modelRow = await db.get('SELECT * FROM LLM_MODEL WHERE model_id = ?', [model_id]);
  if (!modelRow) {
    return res.status(404).json({ success: false, error: 'Khong tim thay model da chon' });
  }

  let apiKey = null;
  if (modelRow.source_type === 'cloud') {
    const settings = await db.get('SELECT api_key FROM LLM_SETTINGS WHERE provider = ?', [modelRow.provider]);
    if (!settings) {
      return res.status(400).json({ success: false, error: `Chua cau hinh API key cho provider "${modelRow.provider}"` });
    }
    apiKey = settings.api_key;
  }

  let provider;
  try {
    provider = createProvider(modelRow, apiKey);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  let sectionsContent = [];
  if (Array.isArray(section_ids) && section_ids.length > 0) {
    const placeholders = section_ids.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT content FROM RESOURCE_SECTION WHERE section_id IN (${placeholders})`,
      section_ids
    );
    sectionsContent = rows.map(r => r.content);
  }

  let prompt;
  try {
    prompt = buildPrompt({ topic, sectionsContent, questionSpec: question_spec });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Loi tao prompt' });
  }

  const { TextPromptParser } = await import('../parser/TextPromptParser.js');
  const parser = new TextPromptParser();

  let lastParseError = null;
  let currentPrompt = prompt;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    let rawText;
    try {
      rawText = await provider.generate(currentPrompt);
    } catch (err) {
      return res.status(502).json({ success: false, error: err.message });
    }

    try {
      const blocks = parser.parse(rawText);
      return res.json({ success: true, blocks });
    } catch (parseErr) {
      lastParseError = parseErr;
      currentPrompt = buildRetryPrompt(prompt, parseErr.message);
    }
  }

  res.status(422).json({
    success: false,
    error: 'AI sinh sai dinh dang sau nhieu lan thu',
    details: lastParseError ? lastParseError.message : null
  });
});

module.exports = router;
