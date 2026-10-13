const { ILLMProvider } = require('./ILLMProvider');
const { userAbortError } = require('./abort');

const DEFAULT_TIMEOUT_MS = 120000;

// Dung chung cho moi API tuong thich OpenAI (DeepSeek...): lop con chi doi
// baseUrl, ten hang trong thong bao loi va tham so bo sung.
class OpenAIProvider extends ILLMProvider {
  constructor(apiKey, modelName) {
    super();
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.baseUrl = 'https://api.openai.com/v1';
    this.label = 'OpenAI';
    this.extraBody = {};
    this.timeoutMs = DEFAULT_TIMEOUT_MS;
  }

  async generate(prompt, options = {}) {
    const controller = new AbortController();
    // Nguoi dung bam Dung/Huy: huy request dang cho (tach biet voi timeout).
    const stopByUser = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', stopByUser, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let res;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          // Khong gui temperature: model reasoning (o-series, gpt-5...) chi
          // chap nhan gia tri mac dinh va tra HTTP 400 neu gui 0.7.
          messages: [{ role: 'user', content: prompt }],
          ...this.extraBody
        }),
        signal: controller.signal
      });
    } catch (err) {
      if (options.signal?.aborted) throw userAbortError(this.label);
      if (err.name === 'AbortError') {
        throw new Error(`${this.label}: het thoi gian cho phan hoi (timeout)`);
      }
      throw new Error(`${this.label}: khong the ket noi (${err.message})`);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', stopByUser);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${this.label}: loi API (HTTP ${res.status}) - ${body}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const text = choice?.message?.content;
    if (!text) {
      if (choice?.finish_reason === 'length') {
        const reasoning = Boolean(choice?.message?.reasoning_content);
        const thinking = reasoning ? ' (model dung het gioi han cho phan suy luan truoc khi kip viet de)' : '';
        const err = new Error(`${this.label}: phan hoi bi cat vi vuot gioi han do dai max_tokens${thinking}. Hay giam so cau hoac chon model khong suy luan (vd deepseek-chat)`);
        if (reasoning) err.code = 'REASONING_EXHAUSTED';
        throw err;
      }
      throw new Error(`${this.label}: phan hoi khong chua noi dung`);
    }
    return text;
  }

  async listModels() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`${this.label}: het thoi gian cho phan hoi (timeout)`);
      }
      throw new Error(`${this.label}: khong the ket noi (${err.message})`);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${this.label}: loi API (HTTP ${res.status}) - ${body}`);
    }

    const data = await res.json();
    const NON_CHAT = /embedding|whisper|tts|dall-e|moderation|audio|realtime|transcribe|image/i;
    return (data?.data || [])
      .filter(m => m?.id && !NON_CHAT.test(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .map(m => ({ id: m.id, display_name: m.id }));
  }
}

module.exports = { OpenAIProvider };
