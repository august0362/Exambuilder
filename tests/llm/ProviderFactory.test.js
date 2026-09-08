const { createProvider } = require('../../backend/llm/ProviderFactory');
const { OpenAIProvider } = require('../../backend/llm/OpenAIProvider');
const { AnthropicProvider } = require('../../backend/llm/AnthropicProvider');
const { GeminiProvider } = require('../../backend/llm/GeminiProvider');
const { LocalGgufProvider } = require('../../backend/llm/LocalGgufProvider');

describe('ProviderFactory.createProvider', () => {
  describe('Happy Path', () => {
    test('TC-PF-01: source_type cloud + provider openai -> OpenAIProvider', () => {
      const provider = createProvider({ source_type: 'cloud', provider: 'openai', model_name: 'gpt-4o-mini' }, 'sk-test');
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    test('TC-PF-02: source_type cloud + provider anthropic -> AnthropicProvider', () => {
      const provider = createProvider({ source_type: 'cloud', provider: 'anthropic', model_name: 'claude-x' }, 'sk-ant-test');
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    test('TC-PF-03: source_type cloud + provider gemini -> GeminiProvider', () => {
      const provider = createProvider({ source_type: 'cloud', provider: 'gemini', model_name: 'gemini-x' }, 'AIza-test');
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    test('TC-PF-04: source_type local_gguf -> LocalGgufProvider, khong can apiKey', () => {
      const provider = createProvider({ source_type: 'local_gguf', file_path: '/tmp/model.gguf' });
      expect(provider).toBeInstanceOf(LocalGgufProvider);
      expect(provider.filePath).toBe('/tmp/model.gguf');
    });
  });

  describe('Negative Cases', () => {
    test('TC-PF-05: modelRow null nem loi ro rang', () => {
      expect(() => createProvider(null, 'key')).toThrow(/Khong tim thay model/);
    });

    test('TC-PF-06: source_type cloud thieu apiKey nem loi', () => {
      expect(() => createProvider({ source_type: 'cloud', provider: 'openai', model_name: 'gpt-4o-mini' }, null))
        .toThrow(/Chua cau hinh API key/);
    });

    test('TC-PF-07: provider cloud khong hop le nem loi', () => {
      expect(() => createProvider({ source_type: 'cloud', provider: 'unknown-corp', model_name: 'x' }, 'key'))
        .toThrow(/Provider cloud khong hop le/);
    });

    test('TC-PF-08: source_type local_gguf thieu file_path nem loi', () => {
      expect(() => createProvider({ source_type: 'local_gguf', display_name: 'My Model' }))
        .toThrow(/thieu file_path/);
    });

    test('TC-PF-09: source_type khong hop le nem loi', () => {
      expect(() => createProvider({ source_type: 'ftp' }, 'key')).toThrow(/source_type khong hop le/);
    });
  });
});
