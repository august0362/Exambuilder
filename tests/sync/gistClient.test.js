const http = require('http');

// Mock GitHub Gist API cuc bo — kiem tra wiring HTTP that (URL, header, parse
// JSON), khong chi mock module. GITHUB_API_BASE tro gistClient toi server nay.
let server;
let baseUrl;
let lastRequest;
let gistStore;

beforeAll(done => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      lastRequest = { method: req.method, url: req.url, headers: req.headers, body };
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };

      if (req.method === 'POST' && req.url === '/gists') {
        const parsed = JSON.parse(body);
        gistStore = { id: 'gist-xyz', html_url: 'https://gist.github.com/u/gist-xyz', files: parsed.files };
        return send(201, gistStore);
      }
      if (req.method === 'GET' && req.url === '/gists/gist-xyz') {
        return send(200, gistStore);
      }
      if (req.method === 'PATCH' && req.url === '/gists/gist-xyz') {
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
