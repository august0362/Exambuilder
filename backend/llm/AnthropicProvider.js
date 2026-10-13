const { ILLMProvider } = require('./ILLMProvider');
const { userAbortError } = require('./abort');

const DEFAULT_TIMEOUT_MS = 120000;
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 8192;

class AnthropicProvider extends ILLMProvider {
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

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          model: this.modelName,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });
    } catch (err) {
      if (options.signal?.aborted) throw userAbortError('Anthropic');
      if (err.name === 'AbortError') {
        throw new Error('Anthropic: het thoi gian cho phan hoi (timeout)');
      }
      throw new Error(`Anthropic: khong the ket noi (${err.message})`);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', stopByUser);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic: loi API (HTTP ${res.status}) - ${body}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) {
      throw new Error('Anthropic: phan hoi khong chua noi dung');
    }
    return text;
  }

  async listModels() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Anthropic: het thoi gian cho phan hoi (timeout)');
      }
      throw new Error(`Anthropic: khong the ket noi (${err.message})`);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic: loi API (HTTP ${res.status}) - ${body}`);
    }

    const data = await res.json();
    return (data?.data || [])
      .filter(m => m?.id)
      .map(m => ({ id: m.id, display_name: m.display_name || m.id }));
  }
}

module.exports = { AnthropicProvider };
