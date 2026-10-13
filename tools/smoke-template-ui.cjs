#!/usr/bin/env node
// Optional browser smoke test. Start the app and a Chrome CDP session first:
// chrome --headless=new --remote-debugging-port=9222 http://localhost:3000
const base = process.env.EXAM_SMOKE_URL || 'http://localhost:3000';
const cdp = process.env.EXAM_CDP_URL || 'http://localhost:9222';
const { PDFParse } = require('pdf-parse');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const before = new Set((await (await fetch(`${base}/api/templates`)).json()).templates.map(t => t.template_id));
  const targets = await (await fetch(`${cdp}/json`)).json();
  const tab = targets.find(t => t.type === 'page' && t.url.startsWith(base));
  if (!tab) throw new Error('Không tìm thấy tab ExamBuilder trong Chrome CDP.');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id); pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message)); else resolve(data.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await sleep(100); }
    throw new Error(`Hết thời gian chờ UI: ${expression}`);
  };
  let createdId;
  try {
    await send('Page.reload', { ignoreCache: true });
    await sleep(500);
    await until("!!document.querySelector('#templateSystemBtn')");
    await evaluate("document.querySelector('#templateSystemBtn').click()");
    await until("document.querySelectorAll('.template-card').length >= 10");
    await evaluate("document.querySelector('.template-card button').click()");
    await until("!!document.querySelector('.template-editor-header h3')");
    await until("!!document.querySelector('.template-prompts textarea[readonly]')?.value.includes('Ma_Khung')");
    await evaluate("[...document.querySelectorAll('.template-editor-header button')].find(b => b.textContent.includes('Tạo bản sao')).click()");
    await until("!![...document.querySelectorAll('.template-editor-header button')].find(b => b.textContent === 'Lưu')");
    await until("!!document.querySelector('.template-inspector input[type=number]')");
    const after = (await (await fetch(`${base}/api/templates`)).json()).templates;
    createdId = after.find(t => !before.has(t.template_id))?.template_id;
    if (!createdId) throw new Error('Clone không được lưu qua API.');
    const scoreInput = "[...document.querySelectorAll('.template-inspector input')].find(x => x.type === 'number')";
    await evaluate(`${scoreInput}.value='0.75'; ${scoreInput}.dispatchEvent(new Event('change',{bubbles:true}))`);
    await until("document.querySelector('.template-editor-header span')?.textContent.includes('10.25 / 10.00')");
    await evaluate("(() => { const input = [...document.querySelectorAll('.template-settings .template-field')].find(x => x.firstChild?.textContent === 'Thang điểm đề').querySelector('input'); input.value='10.25'; input.dispatchEvent(new Event('change',{bubbles:true})); })()");
    await evaluate("[...document.querySelectorAll('.template-editor-header button')].find(b => b.textContent === 'Lưu').click()");
    await sleep(300);
    const saved = (await (await fetch(`${base}/api/templates/${encodeURIComponent(createdId)}`)).json()).template;
    if (saved.sections[0].slots[0].points !== '0.75') throw new Error('Editor không lưu điểm mới.');
    const slot = saved.sections[0].slots[0];
    const raw = `=PHAN_1=\n[CAU_HOI]\nMa_Khung: ${slot.slot_id}\nMa_Phan: ${saved.sections[0].section_id}\nDiem: 0.75\nLoai: TN\nMuc_Do: Nhan_Biet\nDe_Bai: Câu thử từ AI?\nA. Một\nB. Hai\nC. Ba\nD. Bốn\nDap_An: A\nLoi_Giai: Vì đây là đáp án A.\nSo_Dong_Nhap: 0`;
    await evaluate("(() => { const el = document.querySelector('.template-prompts .template-field select'); el.value='SELECTED_SLOTS'; el.dispatchEvent(new Event('change',{bubbles:true})); })()");
    await evaluate(`(() => { const el = document.querySelector('.template-prompts > textarea:not([readonly])'); el.value=${JSON.stringify(raw)}; el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await evaluate("[...document.querySelectorAll('.template-prompts button')].find(b => b.textContent.includes('Kiểm tra và xem thay đổi')).click()");
    await until("document.querySelector('.template-prompts .template-report')?.textContent.includes('Câu thử từ AI?')");
    await evaluate("window.confirm = () => true");
    await evaluate("[...document.querySelectorAll('.template-prompts button')].find(b => b.textContent === 'Áp dụng bản nháp').click()");
    await until("!![...document.querySelectorAll('.template-inspector textarea')].find(x => x.value.includes('Câu thử từ AI?'))");
    for (let i = 0; i < 6; i++) {
      await evaluate(`[...document.querySelectorAll('.template-list button')].filter(b => b.textContent.includes('điểm'))[${i}].click()`);
      await evaluate(`(() => {
        const fields = [...document.querySelectorAll('.template-inspector .template-field')];
        const set = (label, value) => { const el = fields.find(f => f.firstChild?.textContent === label)?.querySelector('textarea'); if (!el) throw Error(label); el.value = value; el.dispatchEvent(new Event('change', {bubbles:true})); };
        set('Đề bài', 'NOI_DUNG_CAU_${i + 1}');
        ${i < 4 ? "set('Lựa chọn A–D (mỗi dòng một lựa chọn)', 'Một\\nHai\\nBa\\nBốn');" : ''}
        set('Đáp án', 'A'); set('Lời giải', 'SECRET_SOLUTION_${i + 1}');
      })()`);
    }
    await evaluate("document.querySelector('.template-preview-controls select').value='student'; document.querySelector('.template-preview-controls select').dispatchEvent(new Event('change',{bubbles:true}))");
    let screenshotPath = '';
    if (process.env.EXAM_SMOKE_SCREENSHOT === '1') {
      await evaluate("document.querySelector('.template-paper').scrollIntoView({block:'start'})");
      await sleep(150);
      const screenshot = await Promise.race([
        send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }),
        sleep(5000).then(() => { throw new Error('Chrome screenshot timeout'); })
      ]);
      screenshotPath = path.join(os.tmpdir(), 'exam-builder-template-ui-smoke.png');
      await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    }
    const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
    const parser = new PDFParse({ data: Buffer.from(pdf.data, 'base64') });
    let parsed;
    try { parsed = await parser.getText(); } finally { await parser.destroy(); }
    if (!parsed.text.includes('NOI_DUNG_CAU_1') || parsed.text.includes('SECRET_SOLUTION')) throw new Error('PDF bản học sinh mất câu hoặc lộ lời giải.');
    process.stdout.write(`UI smoke passed: gallery=10, prompt generated, clone saved ${createdId}, score=0.75, student PDF has content without answer${screenshotPath ? `. Screenshot: ${screenshotPath}` : ''}\n`);
  } finally {
    ws.close();
    if (createdId) await fetch(`${base}/api/templates/${encodeURIComponent(createdId)}`, { method: 'DELETE' });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
