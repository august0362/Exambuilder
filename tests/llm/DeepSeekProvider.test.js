const { DeepSeekProvider } = require('../../backend/llm/DeepSeekProvider');
const { createProvider } = require('../../backend/llm/ProviderFactory');
const { withErrorHint } = require('../../backend/llm/errorHint');

describe('DeepSeekProvider (API tuong thich OpenAI, fetch gia)', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test('TC-DS-01: goi dung endpoint DeepSeek, Bearer key, reasoner max_tokens 65536 (tinh ca suy luan), khong temperature', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'OK', reasoning_content: 'suy luan an' } }] }) });
    const text = await new DeepSeekProvider('sk-ds', 'deepseek-reasoner').generate('xin chao');
    expect(text).toBe('OK');
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-ds');
    expect(JSON.parse(init.body)).toEqual({ model: 'deepseek-reasoner', messages: [{ role: 'user', content: 'xin chao' }], max_tokens: 65536 });
  });

  test('TC-DS-02: listModels doc /models cua DeepSeek; loi mang ghi ten DeepSeek', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }) });
    const models = await new DeepSeekProvider('k', null).listModels();
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.deepseek.com/models');
    expect(models.map(m => m.id).sort()).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 402, text: async () => 'Insufficient Balance' });
    await expect(new DeepSeekProvider('k', 'deepseek-chat').generate('x')).rejects.toThrow('DeepSeek: loi API (HTTP 402)');
  });

  test('TC-DS-03: ProviderFactory tao DeepSeekProvider cho provider deepseek', () => {
    expect(createProvider({ source_type: 'cloud', provider: 'deepseek', model_name: 'deepseek-chat' }, 'k')).toBeInstanceOf(DeepSeekProvider);
  });
});

describe('withErrorHint', () => {
  test('TC-HINT-01: het credit Anthropic -> goi y nap tien, giu chi tiet goc', () => {
    const raw = 'Anthropic: loi API (HTTP 400) - {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';
    const out = withErrorHint(raw);
    expect(out).toContain('hết tiền/credit');
    expect(out).toContain('Anthropic: loi API (HTTP 400) - Your credit balance is too low to access the Anthropic API.');
    expect(out).not.toContain('invalid_request_error');
  });
  test('TC-HINT-02: 401 / 429 / loi khong ro', () => {
    expect(withErrorHint('OpenAI: loi API (HTTP 401) - bad')).toContain('API key sai');
    expect(withErrorHint('Gemini: loi API (HTTP 429) - x')).toContain('giới hạn');
    expect(withErrorHint('loi la')).toBe('loi la');
  });
});

describe('DeepSeek reasoner va phan hoi bi cat', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  test('TC-DS-04: reasoner dung max_tokens 65536; ca 2 lan het do dai -> bao ro nguyen nhan', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'nghi rat lau' } }] }) });
    const err = await new DeepSeekProvider('k', 'deepseek-reasoner').generate('x').catch(e => e);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).max_tokens).toBe(65536);
    expect(err.message).toContain('vuot gioi han do dai max_tokens');
    expect(err.message).toContain('suy luan');
    expect(new DeepSeekProvider('k', 'deepseek-chat').extraBody.max_tokens).toBe(8192);
    expect(new DeepSeekProvider('k', 'deepseek-v4-pro').extraBody.max_tokens).toBe(65536);
  });
  test('TC-DS-06: model suy luan het max_tokens cho phan nghi -> tu thu lai bang deepseek-chat', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'nghi rat lau' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '=PHAN_1=' } }] }) });
    await expect(new DeepSeekProvider('k', 'deepseek-reasoner').generate('x')).resolves.toBe('=PHAN_1=');
    const second = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(second).toMatchObject({ model: 'deepseek-chat', max_tokens: 8192 });
  });
  test('TC-DS-07: deepseek-chat bi cat do dai -> khong thu lai', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '' } }] }) });
    await expect(new DeepSeekProvider('k', 'deepseek-chat').generate('x')).rejects.toThrow('max_tokens');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('TC-DS-05: signal huy -> loi USER_ABORT', async () => {
    global.fetch = jest.fn((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    const controller = new AbortController();
    const p = new DeepSeekProvider('k', 'deepseek-chat').generate('x', { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ code: 'USER_ABORT' });
  });
});
