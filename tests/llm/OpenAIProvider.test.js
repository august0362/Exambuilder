const { OpenAIProvider } = require('../../backend/llm/OpenAIProvider');

// Hop dong request voi OpenAI, chay bang fetch gia - khong goi mang that.
describe('OpenAIProvider.generate', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test('TC-OAI-01: khong gui temperature (model reasoning chi nhan gia tri mac dinh)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) });
    await expect(new OpenAIProvider('sk-test', 'gpt-5').generate('xin chao')).resolves.toBe('OK');
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body).toEqual({ model: 'gpt-5', messages: [{ role: 'user', content: 'xin chao' }] });
    expect(body).not.toHaveProperty('temperature');
  });

  test('TC-OAI-02: HTTP 400 tra loi co ma trang thai, khong chua API key', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '{"error":{"message":"Unsupported value"}}' });
    const error = await new OpenAIProvider('sk-secret-123', 'o3').generate('x').catch(e => e);
    expect(error.message).toContain('HTTP 400');
    expect(error.message).not.toContain('sk-secret-123');
  });

  test('TC-OAI-03: phan hoi rong bao loi ro rang', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
    await expect(new OpenAIProvider('k', 'gpt-4o').generate('x')).rejects.toThrow('phan hoi khong chua noi dung');
  });
});
