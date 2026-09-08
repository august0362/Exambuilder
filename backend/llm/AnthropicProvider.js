const { ILLMProvider } = require('./ILLMProvider');

const DEFAULT_TIMEOUT_MS = 120000;
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 8192;

class AnthropicProvider extends ILLMProvider {
  constructor(apiKey, modelName) {
    super();
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async generate(prompt) {
    const controller = new AbortController();
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
    const text = data?.content?.[0]?.text;
    if (!text) {
      throw new Error('Anthropic: phan hoi khong chua noi dung');
    }
    return text;
  }
}

module.exports = { AnthropicProvider };
