const http = require('http');
const { DEFAULT_GIST_ID, SHARED_GIST_OWNER } = require('../../backend/sync/sharedLibrary');

// Mock GitHub Gist API cuc bo — kiem tra wiring HTTP that (URL, header, parse
// JSON), khong chi mock module. GITHUB_API_BASE tro gistClient toi server nay.
let server;
let baseUrl;
let lastRequest;
let gistStore;
let requestHistory;

beforeAll(done => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      lastRequest = { method: req.method, url: req.url, headers: req.headers, body };
      requestHistory.push(lastRequest);
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };

      if (req.method === 'POST' && req.url === '/gists') {
        const parsed = JSON.parse(body);
        gistStore = { id: 'gist-xyz', html_url: 'https://gist.github.com/u/gist-xyz', files: parsed.files };
        return send(201, gistStore);
      }
      if (req.method === 'GET' && (req.url === '/gists/gist-xyz' || req.url === `/gists/${DEFAULT_GIST_ID}`)) {
        return send(200, gistStore);
      }
      if (req.method === 'GET' && req.url === '/user') {
        return send(200, { login: req.headers.authorization === 'Bearer owner-token' ? SHARED_GIST_OWNER : 'other-person' });
      }
      if (req.method === 'PATCH' && (req.url === '/gists/gist-xyz' || req.url === `/gists/${DEFAULT_GIST_ID}`)) {
        const parsed = JSON.parse(body);
        gistStore.files = { ...gistStore.files, ...parsed.files };
        return send(200, gistStore);
      }
      if (req.method === 'GET' && req.url === '/gists/missing') {
        return send(404, { message: 'Not Found' });
      }
      if (req.method === 'GET' && req.url === '/gists/badtoken') {
        return send(401, { message: 'Bad credentials' });
      }
      send(400, { message: 'unexpected' });
    });
  });
  server.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    process.env.GITHUB_API_BASE = baseUrl;
    done();
  });
});

afterAll(done => {
  delete process.env.GITHUB_API_BASE;
  server.close(done);
});

beforeEach(() => {
  gistStore = undefined;
  lastRequest = undefined;
  requestHistory = [];
  jest.resetModules();
});

function freshClient() {
  return require('../../backend/sync/gistClient');
}

test('TC-GC-01: createGist gui public:false + file thu vien, dinh kem header Bearer', async () => {
  const client = freshClient();
  const ref = await client.createGist('tok_123', '{"exams":[]}');
  expect(ref).toEqual({ id: 'gist-xyz', html_url: 'https://gist.github.com/u/gist-xyz' });
  expect(lastRequest.headers.authorization).toBe('Bearer tok_123');
  expect(lastRequest.headers.accept).toBe('application/vnd.github+json');
  const sent = JSON.parse(lastRequest.body);
  expect(sent.public).toBe(false);
  expect(sent.files['exambuilder-library.json'].content).toBe('{"exams":[]}');
});

test('TC-GC-02: getLibrary tra ve content cua file thu vien', async () => {
  const client = freshClient();
  await client.createGist('tok', '{"exams":[{"exam_id":"a"}]}');
  const content = await client.getLibrary('tok', 'gist-xyz');
  expect(JSON.parse(content).exams[0].exam_id).toBe('a');
});

test('TC-GC-03: updateGist ghi de content, getLibrary doc lai thay ban moi', async () => {
  const client = freshClient();
  await client.createGist('tok', '{"v":1}');
  await client.updateGist('tok', 'gist-xyz', '{"v":2}');
  expect(await client.getLibrary('tok', 'gist-xyz')).toBe('{"v":2}');
});

test('TC-GC-04: getLibrary tren gist khong co file thu vien -> null', async () => {
  const client = freshClient();
  // tao gist voi file khac ten
  gistStore = { id: 'gist-xyz', files: { 'other.txt': { content: 'x' } } };
  expect(await client.getLibrary('tok', 'gist-xyz')).toBeNull();
});

test('TC-GC-05: 404 -> loi "Khong tim thay Gist"', async () => {
  const client = freshClient();
  await expect(client.getLibrary('tok', 'missing')).rejects.toThrow(/404/);
});

test('TC-GC-06: 401 -> loi "GitHub tu choi token"', async () => {
  const client = freshClient();
  await expect(client.getLibrary('tok', 'badtoken')).rejects.toThrow(/401/);
});

test('kho chung doc an danh ngay ca khi co token sai/het han', async () => {
  const client = freshClient();
  gistStore = { id: DEFAULT_GIST_ID, files: { 'exambuilder-library.json': { content: '{"exams":[]}' } } };
  expect(await client.getLibrary('', DEFAULT_GIST_ID)).toBe('{"exams":[]}');
  expect(lastRequest.headers.authorization).toBeUndefined();
  await client.getLibrary('expired-token', DEFAULT_GIST_ID);
  expect(lastRequest.headers.authorization).toBeUndefined();
});

test('chu kho duoc day len Gist chung sau khi xac minh tai khoan', async () => {
  const client = freshClient();
  gistStore = { id: DEFAULT_GIST_ID, files: {} };
  await client.updateGist('owner-token', DEFAULT_GIST_ID, '{"exams":[]}');
  expect(requestHistory.map(r => [r.method, r.url])).toEqual([
    ['GET', '/user'], ['PATCH', `/gists/${DEFAULT_GIST_ID}`]
  ]);
  expect(lastRequest.headers.authorization).toBe('Bearer owner-token');
});

test('tai khoan khac bi tu choi truoc khi PATCH, khong thay noi dung Gist', async () => {
  const client = freshClient();
  const existing = { id: DEFAULT_GIST_ID, files: { 'exambuilder-library.json': { content: 'original' } } };
  gistStore = existing;
  await expect(client.updateGist('someone-token', DEFAULT_GIST_ID, 'changed')).rejects.toMatchObject({ status: 403 });
  expect(requestHistory.some(r => r.method === 'PATCH')).toBe(false);
  expect(gistStore).toBe(existing);
});

test('khong gui token hay tai raw_url ngoai Gist GitHub', async () => {
  const client = freshClient();
  gistStore = { id: DEFAULT_GIST_ID, files: { 'exambuilder-library.json': {
    truncated: true, raw_url: 'https://untrusted.example/collect'
  } } };
  await expect(client.getLibrary('owner-token', DEFAULT_GIST_ID)).rejects.toThrow(/Duong dan/);
  expect(requestHistory).toHaveLength(1);
  expect(lastRequest.headers.authorization).toBeUndefined();
});
