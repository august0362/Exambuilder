const { OpenAIProvider } = require('./OpenAIProvider');
const { AnthropicProvider } = require('./AnthropicProvider');
const { GeminiProvider } = require('./GeminiProvider');
const { LocalGgufProvider } = require('./LocalGgufProvider');

const CLOUD_PROVIDERS = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  gemini: GeminiProvider
};

/**
 * modelRow: 1 dong tu bang LLM_MODEL.
 * apiKey: chi can thiet khi modelRow.source_type === 'cloud' (lay tu bang
 * LLM_SETTINGS theo modelRow.provider truoc khi goi ham nay).
 */
function createProvider(modelRow, apiKey) {
  if (!modelRow) {
    throw new Error('Khong tim thay model da chon');
  }

  if (modelRow.source_type === 'local_gguf') {
    if (!modelRow.file_path) {
      throw new Error(`Model local "${modelRow.display_name}" thieu file_path`);
    }
    return new LocalGgufProvider(modelRow.file_path);
  }

  if (modelRow.source_type === 'cloud') {
    const ProviderClass = CLOUD_PROVIDERS[modelRow.provider];
    if (!ProviderClass) {
      throw new Error(`Provider cloud khong hop le: "${modelRow.provider}"`);
    }
    if (!apiKey) {
      throw new Error(`Chua cau hinh API key cho provider "${modelRow.provider}"`);
    }
    return new ProviderClass(apiKey, modelRow.model_name);
  }

  throw new Error(`source_type khong hop le: "${modelRow.source_type}"`);
}

module.exports = { createProvider };
