const { OpenAIProvider } = require('./OpenAIProvider');

// DeepSeek dung API tuong thich OpenAI (https://api-docs.deepseek.com).
// Model suy luan (deepseek-reasoner va cac model moi co "thinking") tra suy
// luan trong reasoning_content rieng, content chi la ket qua cuoi nen parser
// khong dinh <think>. max_tokens cua model suy luan TINH CA phan suy luan ->
// dung muc toi da 65536; chi deepseek-chat (toi da 8192) giu 8192.
const CHAT_MODEL = 'deepseek-chat';
const CHAT_MAX_TOKENS = 8192;
const REASONING_MAX_TOKENS = 65536;

class DeepSeekProvider extends OpenAIProvider {
  constructor(apiKey, modelName) {
    super(apiKey, modelName);
    this.baseUrl = 'https://api.deepseek.com';
    this.label = 'DeepSeek';
    const isChat = String(modelName || '').toLowerCase() === CHAT_MODEL;
    this.extraBody = { max_tokens: isChat ? CHAT_MAX_TOKENS : REASONING_MAX_TOKENS };
    // Model suy luan nghi lau truoc khi tra de day du.
    this.timeoutMs = 300000;
  }

  // Model suy luan dung het max_tokens cho phan suy nghi (content rong) ->
  // tu thu lai 1 lan bang deepseek-chat (cung model, che do khong suy luan)
  // thay vi bat giao vien tu doi model roi sinh lai.
  async generate(prompt, options = {}) {
    try {
      return await super.generate(prompt, options);
    } catch (err) {
      if (err.code !== 'REASONING_EXHAUSTED' || this.modelName === CHAT_MODEL || options.signal?.aborted) throw err;
      console.warn(`[DeepSeek] ${this.modelName} het max_tokens cho suy luan -> thu lai bang ${CHAT_MODEL}`);
      const fallback = new DeepSeekProvider(this.apiKey, CHAT_MODEL);
      fallback.baseUrl = this.baseUrl;
      return fallback.generate(prompt, options);
    }
  }
}

module.exports = { DeepSeekProvider };
