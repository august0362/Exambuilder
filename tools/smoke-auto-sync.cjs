// Optional real-browser check: node tools/smoke-auto-sync.cjs
// Uses a temporary database/profile and fake GitHub only. Set CHROME_PATH if needed.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { fork, spawn } = require('node:child_process');
const { DEFAULT_GIST_ID, SHARED_GIST_OWNER } = require('../backend/sync/sharedLibrary');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, message) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await sleep(50);
  }
  throw new Error(message);
}
async function connect(url, errors = []) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
    if (!pending.has(event.id)) return;
    const { resolve, reject, timer } = pending.get(event.id);
    pending.delete(event.id); clearTimeout(timer);
    if (event.error) reject(new Error(event.error.message)); else resolve(event.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  return { send, evaluate, close: () => socket.close() };
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eb-web-close-'));
  let github, server, chrome, browser, tab;
  let library = { schema: 'exambuilder/library@1', updated_at: new Date().toISOString(), exams: [] };
  let serverOutput = '';
  const errors = [];
  try {
    github = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const reply = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        if (req.url === '/user') return reply({ login: SHARED_GIST_OWNER });
        if (req.url === '/gists/' + DEFAULT_GIST_ID) {
          if (req.method === 'PATCH') library = JSON.parse(JSON.parse(body).files['exambuilder-library.json'].content);
          return reply({ id: DEFAULT_GIST_ID, html_url: 'https://gist.github.com/test',
            files: { 'exambuilder-library.json': { content: JSON.stringify(library) } } });
        }
        res.statusCode = 404; reply({});
      });
    });
    await new Promise(resolve => github.listen(0, '127.0.0.1', resolve));
    // Reserve a free port without depending on the user's running application.
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const base = `http://localhost:${port}`;
    server = fork(path.join(__dirname, '..', 'backend/server.js'), [], {
      env: { ...process.env, PORT: String(port), EXAM_DB_PATH: path.join(directory, 'exam.db'),
        GITHUB_API_BASE: `http://127.0.0.1:${github.address().port}` },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput += chunk; });
    await until(() => fetch(base + '/api/sync/settings').then(r => r.ok).catch(() => false), 'Server did not start');
    await fetch(base + '/api/sync/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_token: 'fake-owner-token' }) });
    const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', '--user-data-dir=' + path.join(directory, 'chrome'), 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
    chrome.on('error', error => errors.push(error.message));
    const devtoolsPort = await until(async () => {
      try { return (await fs.readFile(path.join(directory, 'chrome/DevToolsActivePort'), 'utf8')).split('\n')[0]; }
      catch { return null; }
    }, 'Chrome did not start. Set CHROME_PATH to its executable.');
    const cdpBase = `http://127.0.0.1:${devtoolsPort}`;
    const version = await (await fetch(cdpBase + '/json/version')).json();
    browser = await connect(version.webSocketDebuggerUrl);
    const targets = await (await fetch(cdpBase + '/json')).json();
    const target = targets.find(item => item.type === 'page');
    tab = await connect(target.webSocketDebuggerUrl, errors);
    await tab.send('Runtime.enable');
    await tab.send('Page.navigate', { url: base });
    await until(() => tab.evaluate(`document.querySelector('#gistStateLabel')?.textContent.includes('${DEFAULT_GIST_ID}')`), 'Web scripts did not initialize');
    const raw = '[CAU_HOI]\nLoai: TN\nMuc_Do: Nhan_Biet\nDe_Bai: Hai cộng hai?\nA. Bốn\nB. Năm\nC. Sáu\nD. Bảy\nDap_An: A\nLoi_Giai: 2+2=4';
    await tab.evaluate(`document.querySelector('#examTitleInput').value='Before close';
      document.querySelector('#rawTextInput').value=${JSON.stringify(raw)};
      document.querySelector('#generateBtn').click();`);
    await until(async () => (await (await fetch(base + '/api/archive')).json()).exams?.length === 1, 'Generated exam not saved');
    // Close before the 1.5 second autosave debounce: exercise the final beacon.
    await tab.evaluate(`document.querySelector('#examTitleInput').value='Last edit at close';
      document.querySelector('#examTitleInput').dispatchEvent(new Event('input', { bubbles: true }));`);
    await browser.send('Target.closeTarget', { targetId: target.id });
    tab.close(); tab = null;
    await until(() => library.exams.find(exam => exam.title === 'Last edit at close'), 'Last edit was not uploaded after tab close');
    await browser.send('Target.createTarget', { url: base });
    await until(async () => !(await (await fetch(base + '/api/sync/settings')).json()).auto_push.pending, 'Draft recovery did not settle');
    const exams = (await (await fetch(base + '/api/archive')).json()).exams;
    if (exams.length !== 1 || exams[0].title !== 'Last edit at close') throw new Error('Duplicate or stale exam after reopening');
    if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
    console.log('PASS: real Chrome closed before autosave; final edit reached fake GitHub; reopening kept exactly one exam.');
  } catch (error) {
    throw new Error(error.message + '\nServer output:\n' + serverOutput);
  } finally {
    tab?.close();
    if (browser) { await browser.send('Browser.close').catch(() => {}); browser.close(); }
    if (chrome && chrome.exitCode === null) chrome.kill();
    if (server && server.exitCode === null) {
      server.send('shutdown');
      await new Promise(resolve => server.once('exit', resolve));
    }
    if (github) await new Promise(resolve => github.close(resolve));
    // Browser profile may be locked briefly; keep this isolated temp directory
    // for troubleshooting rather than deleting paths outside the workspace.
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
