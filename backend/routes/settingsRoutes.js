const express = require('express');
const { getDb } = require('../database');
const { createProvider, listModelsFor } = require('../llm/ProviderFactory');
const { CLOUD_PROVIDER_IDS } = require('../llm/providerIds');
const { withErrorHint } = require('../llm/errorHint');

const router = express.Router();

const VALID_PROVIDERS = CLOUD_PROVIDER_IDS;

function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

router.get('/llm', async (req, res) => {
  const db = await getDb();
  try {
    const rows = await db.all('SELECT provider, api_key, updated_at FROM LLM_SETTINGS');
    res.json({
      success: true,
      providers: rows.map(r => ({
        provider: r.provider,
        has_key: true,
        masked_key: maskKey(r.api_key),
        updated_at: r.updated_at
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi doc cau hinh LLM' });
  }
});

router.post('/llm', async (req, res) => {
  const { provider, api_key } = req.body;
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ success: false, error: `provider khong hop le: "${provider}"` });
  }
  if (!api_key || !String(api_key).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu api_key' });
  }

  const db = await getDb();
  try {
    await db.run(
      `INSERT INTO LLM_SETTINGS (provider, api_key, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_at = datetime('now')`,
      [provider, api_key.trim()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi luu cau hinh LLM' });
  }
});

router.post('/llm/test', async (req, res) => {
  const { provider, api_key, model_name } = req.body;
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ success: false, error: `provider khong hop le: "${provider}"` });
  }
  if (!model_name || !String(model_name).trim()) {
    return res.status(400).json({ success: false, error: 'Thieu model_name de kiem tra' });
  }

  const db = await getDb();
  try {
    let keyToUse = api_key && String(api_key).trim();
    if (!keyToUse) {
      const saved = await db.get('SELECT api_key FROM LLM_SETTINGS WHERE provider = ?', [provider]);
      keyToUse = saved?.api_key;
    }
    if (!keyToUse) {
      return res.status(400).json({ success: false, error: 'Chua co api_key de kiem tra (chua nhap hoac chua luu)' });
    }

    const providerInstance = createProvider(
      { source_type: 'cloud', provider, model_name: model_name.trim() },
      keyToUse
    );
    await providerInstance.generate('Tra loi ngan gon: OK');
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ success: false, error: withErrorHint(err.message) });
  }
});

router.post('/llm/models', async (req, res) => {
  const { provider, api_key } = req.body;
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ success: false, error: `provider khong hop le: "${provider}"` });
  }

  const db = await getDb();
  try {
    let keyToUse = api_key && String(api_key).trim();
    if (!keyToUse) {
      const saved = await db.get('SELECT api_key FROM LLM_SETTINGS WHERE provider = ?', [provider]);
      keyToUse = saved?.api_key;
    }
    if (!keyToUse) {
      return res.status(400).json({ success: false, error: 'Chua co api_key de lay danh sach model (chua nhap hoac chua luu)' });
    }

    const models = await listModelsFor(provider, keyToUse);
    res.json({ success: true, models });
  } catch (err) {
    res.status(502).json({ success: false, error: withErrorHint(err.message) });
  }
});

module.exports = router;
