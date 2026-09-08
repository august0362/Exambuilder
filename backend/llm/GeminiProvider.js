const { ILLMProvider } = require('./ILLMProvider');

const DEFAULT_TIMEOUT_MS = 120000;

class GeminiProvider extends ILLMProvider {
  constructor(apiKey, modelName) {
    super();
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async generate(prompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        }),
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Gemini: het thoi gian cho phan hoi (timeout)');
      }
      throw new Error(`Gemini: khong the ket noi (${err.message})`);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini: loi API (HTTP ${res.status}) - ${body}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    if (!text) {
      throw new Error('Gemini: phan hoi khong chua noi dung');
    }
    return text;
  }
}

module.exports = { GeminiProvider };
