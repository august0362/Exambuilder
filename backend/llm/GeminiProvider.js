const { ILLMProvider } = require('./ILLMProvider');
const { userAbortError } = require('./abort');

const DEFAULT_TIMEOUT_MS = 120000;

class GeminiProvider extends ILLMProvider {
  constructor(apiKey, modelName) {
    super();
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async generate(prompt, options = {}) {
    const controller = new AbortController();
    // Nguoi dung bam Dung/Huy: huy request dang cho (tach biet voi timeout).
    const stopByUser = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', stopByUser, { once: true });
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
      if (options.signal?.aborted) throw userAbortError('Gemini');
      if (err.name === 'AbortError') {
        throw new Error('Gemini: het thoi gian cho phan hoi (timeout)');
      }
      throw new Error(`Gemini: khong the ket noi (${err.message})`);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', stopByUser);
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

  async listModels() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.apiKey)}&pageSize=1000`;

    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
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
    return (data?.models || [])
      .filter(m => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => {
        const id = (m.name || '').replace(/^models\//, '');
        return { id, display_name: m.displayName || id };
      })
      .filter(m => m.id);
  }
}

module.exports = { GeminiProvider };
