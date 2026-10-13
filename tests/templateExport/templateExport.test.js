const mammoth = require('mammoth');
const JSZip = require('jszip');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createCanvas } = require('@napi-rs/canvas');
const express = require('express');
const request = require('supertest');
const { createTemplateDocx, analyzeTemplateExport } = require('../../backend/templateExport');
const route = require('../../backend/routes/templateExportRoutes');
const { getSeed, listSeeds } = require('../../backend/templates/seeds');

const template = { template_id: 'custom.export', display_name: 'Đề Toán', defaults: { subject: 'Toán', grade: '6', duration_minutes: 45 }, sections: [{ section_id: 's1', title: 'Trắc nghiệm', slots: [{ slot_id: 'q1', points: '2.00', question_type: 'MCQ', answer_space: { kind: 'lined', lines: 3 } }] }] };
const content = { q1: { content: 'Hai cộng hai bằng mấy?', correct_answer: 'D', explanation: 'Vì 2 + 2 = 4.', options: [{ option_key: 'A', option_text: '1', is_correct: false }, { option_key: 'B', option_text: '2', is_correct: false }, { option_key: 'C', option_text: '3', is_correct: false }, { option_key: 'D', option_text: '4', is_correct: true }] } };

test('student DOCX is editable text and contains no answer or rationale', async () => {
  const { buffer } = await createTemplateDocx({ template, content, mode: 'student', paper: { size: 'A5', orientation: 'landscape' } });
  expect(buffer.subarray(0, 2).toString()).toBe('PK');
  const extracted = (await mammoth.extractRawText({ buffer })).value;
  expect(extracted).toContain('Hai cộng hai bằng mấy?');
  expect(extracted).toContain('Trắc nghiệm');
  expect(extracted).not.toContain('Đáp án:');
  expect(extracted).not.toContain('Vì 2 + 2 = 4.');
});

test('teacher, key and combined modes include full solution', async () => {
  for (const mode of ['teacher', 'answer_key', 'combined']) {
    const { buffer } = await createTemplateDocx({ template, content, mode });
    const extracted = (await mammoth.extractRawText({ buffer })).value;
    expect(extracted).toContain('Đáp án: D');
    expect(extracted).toContain('Vì 2 + 2 = 4.');
    if (mode === 'answer_key') expect(extracted).not.toContain('Hai cộng hai bằng mấy?');
  }
});

test('max pages produces warning without dropping content', async () => {
  const large = structuredClone(template);
  large.sections[0].slots[0].answer_space.lines = 50;
  const analysis = analyzeTemplateExport({ template: large, content, maxPages: 1 });
  expect(analysis.warnings.some(x => x.code === 'MAX_PAGES_ESTIMATE')).toBe(true);
  const { buffer } = await createTemplateDocx({ template: large, content, maxPages: 1 });
  expect((await mammoth.extractRawText({ buffer })).value).toContain('Hai cộng hai bằng mấy?');
});

test('HTTP analyze and DOCX download expose honest pagination estimate', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/template-export', route);
  const analysis = await request(app).post('/api/template-export/analyze').send({ template, content, mode: 'student' }).expect(200);
  expect(analysis.body.success).toBe(true);
  const file = await request(app).post('/api/template-export/docx').send({ template, content, mode: 'student' }).expect(200);
  expect(file.headers['content-type']).toContain('wordprocessingml.document');
  expect(Number(file.headers['x-estimated-pages'])).toBeGreaterThan(0);
});

test('grid, table and drawing answer spaces create bounded Word table cells', async () => {
  for (const kind of ['squared', 'table', 'drawing', 'blank']) {
    const variant = structuredClone(template);
    variant.sections[0].slots[0].answer_space = { kind, lines: 3 };
    const { buffer } = await createTemplateDocx({ template: variant, content, mode: 'student' });
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('<w:tbl>');
    expect((xml.match(/<w:tc>/g) || []).length).toBe(kind === 'squared' ? 24 : kind === 'table' ? 9 : 1);
    expect(xml).not.toContain('[Vùng trả lời:');
  }
});

test('T09 uses two columns and T10 includes reading passage in DOCX', async () => {
  const compact = getSeed('builtin.t09');
  const compactDoc = await createTemplateDocx({ template: compact, mode: 'student', columns: compact.appearance.columns });
  const compactZip = await JSZip.loadAsync(compactDoc.buffer);
  const compactXml = await compactZip.file('word/document.xml').async('string');
  expect(compactXml).toMatch(/<w:cols[^>]*w:num="2"/);

  const reading = getSeed('builtin.t10');
  reading.sections[0].stimulus = 'READING PASSAGE FOR SECTION ONE';
  const readingDoc = await createTemplateDocx({ template: reading, mode: 'student' });
  expect((await mammoth.extractRawText({ buffer: readingDoc.buffer })).value).toContain('READING PASSAGE FOR SECTION ONE');
});

test.each(listSeeds())('all export modes produce readable DOCX for %s', async seed => {
  for (const mode of ['student', 'teacher', 'answer_key', 'combined']) {
    const { buffer } = await createTemplateDocx({ template: seed, mode });
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const text = (await mammoth.extractRawText({ buffer })).value;
    if (mode === 'answer_key') expect(text).toContain('ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM');
    else expect(text).toContain(seed.display_name);
    if (mode === 'student') expect(text).not.toContain('Đáp án:');
  }
}, 30000);

test('header/footer follow appearance config and expose page number', async () => {
  const midterm = getSeed('builtin.t03');
  const doc = await createTemplateDocx({ template: midterm, mode: 'student', metadata: { school: 'THCS Mau' } });
  const zip = await JSZip.loadAsync(doc.buffer);
  const headerName = Object.keys(zip.files).find(x => /^word\/header\d+\.xml$/.test(x));
  const footerName = Object.keys(zip.files).find(x => /^word\/footer\d+\.xml$/.test(x));
  expect(headerName).toBeTruthy();
  expect(footerName).toBeTruthy();
  const headerXml = await zip.file(headerName).async('string');
  expect(headerXml).toContain('THCS Mau');
  expect(headerXml).toContain('Đề giữa học kỳ');
  const footerXml = await zip.file(footerName).async('string');
  expect(footerXml).toMatch(/PAGE/);
});

test('disabled footer omits page number in DOCX', async () => {
  const short = getSeed('builtin.t01');
  expect(short.appearance.footer.enabled).toBe(false);
  const doc = await createTemplateDocx({ template: short, mode: 'student' });
  const zip = await JSZip.loadAsync(doc.buffer);
  expect(Object.keys(zip.files).find(x => /^word\/footer\d+\.xml$/.test(x))).toBeUndefined();
});

test('manual region slots warn they are not applied in DOCX', () => {
  const variant = structuredClone(template);
  variant.sections[0].slots[0].manual_region = { page_number: 2, x_pct: 10, y_pct: 20, width_pct: 80, height_pct: 10 };
  const analysis = analyzeTemplateExport({ template: variant, content });
  expect(analysis.warnings.some(x => x.code === 'MANUAL_REGION_NOT_APPLIED')).toBe(true);
});

test('manual regions overlay text at page coordinates and use each page background', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-docx-pages-'));
  const previous = process.env.EXAM_BACKGROUNDS_DIR;
  try {
    process.env.EXAM_BACKGROUNDS_DIR = directory;
    const { createCanvas } = require('@napi-rs/canvas');
    const pageAssets = [0, 1].map(index => {
      const canvas = createCanvas(12, 12);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = index ? '#ff0000' : '#0000ff'; ctx.fillRect(0, 0, 12, 12);
      const data = canvas.toBuffer('image/png');
      const sha256 = crypto.createHash('sha256').update(data).digest('hex');
      const asset_id = `image-${sha256}`;
      const filename = `${asset_id}.png`;
      fs.writeFileSync(path.join(directory, filename), data);
      fs.writeFileSync(path.join(directory, `${asset_id}.json`), JSON.stringify({ asset_id, filename, mime: 'image/png', size: data.length, sha256 }));
      return { page_number: index + 1, asset_id };
    });
    const variant = structuredClone(template);
    variant.sections[0].slots.push({ slot_id: 'q2', points: '1.00', question_type: 'ESSAY', answer_space: { kind: 'blank', lines: 2 } });
    variant.appearance = { background: { asset_id: pageAssets[0].asset_id, pages: pageAssets } };
    variant.sections[0].slots[0].manual_region = { page_number: 1, x_pct: 10, y_pct: 15, width_pct: 75, height_pct: 20 };
    variant.sections[0].slots[1].manual_region = { page_number: 2, x_pct: 12, y_pct: 40, width_pct: 70, height_pct: 25 };
    const analysis = analyzeTemplateExport({ template: variant, content: { ...content, q2: { content: 'Câu tự luận trên trang hai' } } });
    expect(analysis.warnings.some(x => x.code === 'MANUAL_REGION_NOT_APPLIED')).toBe(false);
    expect(analysis.warnings.some(x => x.code === 'MANUAL_REGION_RASTERIZED')).toBe(true);
    const doc = await createTemplateDocx({ template: variant, content: { ...content, q2: { content: 'Câu tự luận trên trang hai' } }, mode: 'student' });
    const zip = await JSZip.loadAsync(doc.buffer);
    const documentXml = await zip.file('word/document.xml').async('string');
    expect((documentXml.match(/<wp:anchor/g) || []).length).toBe(2);
    expect(documentXml).toContain('Câu tự luận trên trang hai');
    expect(documentXml).toContain('<wp:posOffset>756000</wp:posOffset>');
    expect(documentXml).toContain('<wp:posOffset>1603800</wp:posOffset>');
    const headers = Object.keys(zip.files).filter(name => /^word\/header\d+\.xml$/.test(name));
    expect(headers.length).toBeGreaterThanOrEqual(2);
    const headerXml = await Promise.all(headers.map(name => zip.file(name).async('string')));
    expect(headerXml.some(xml => xml.includes('r:embed'))).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.EXAM_BACKGROUNDS_DIR;
    else process.env.EXAM_BACKGROUNDS_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('manual region that cannot fit stays as editable flow text and is never clipped silently', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-docx-overflow-'));
  const previous = process.env.EXAM_BACKGROUNDS_DIR;
  try {
    const data = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64');
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const asset_id = `image-${sha256}`; const filename = `${asset_id}.png`;
    fs.writeFileSync(path.join(directory, filename), data);
    fs.writeFileSync(path.join(directory, `${asset_id}.json`), JSON.stringify({ asset_id, filename, mime: 'image/png', size: data.length, sha256 }));
    process.env.EXAM_BACKGROUNDS_DIR = directory;
    const variant = structuredClone(template);
    variant.appearance = { background: { pages: [{ page_number: 1, asset_id }] } };
    variant.sections[0].slots[0].manual_region = { page_number: 1, x_pct: 1, y_pct: 1, width_pct: 2, height_pct: 2 };
    const longContent = 'Nội dung câu dài cần được giữ lại khi vùng tọa độ quá nhỏ '.repeat(20);
    const result = await createTemplateDocx({ template: variant, content: { q1: { content: longContent } }, mode: 'student' });
    expect(result.analysis.warnings.some(w => w.code === 'MANUAL_REGION_OVERFLOW')).toBe(true);
    expect((await mammoth.extractRawText({ buffer: result.buffer })).value).toContain(longContent);
  } finally {
    if (previous === undefined) delete process.env.EXAM_BACKGROUNDS_DIR;
    else process.env.EXAM_BACKGROUNDS_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('background warning uses current appearance schema', () => {
  const variant = structuredClone(template);
  variant.appearance = { background: { asset_id: 'asset-1' } };
  expect(analyzeTemplateExport({ template: variant, content }).warnings.some(x => x.code === 'BACKGROUND_NOT_EMBEDDED')).toBe(true);
});

test('managed PNG background and slot illustration are embedded with checksum', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-docx-asset-'));
  const previous = process.env.EXAM_BACKGROUNDS_DIR;
  try {
    const data = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64');
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const asset_id = `image-${sha256}`;
    const filename = `${asset_id}.png`;
    fs.writeFileSync(path.join(directory, filename), data);
    fs.writeFileSync(path.join(directory, `${asset_id}.json`), JSON.stringify({ asset_id, filename, mime: 'image/png', size: data.length, sha256 }));
    process.env.EXAM_BACKGROUNDS_DIR = directory;
    const variant = structuredClone(template);
    variant.appearance = { background: { asset_id, apply_to: 'all' } };
    variant.sections[0].slots[0].assets = [{ asset_id, caption: 'Hình minh họa' }];
    const analysis = analyzeTemplateExport({ template: variant, content });
    expect(analysis.warnings.some(x => x.code === 'BACKGROUND_NOT_EMBEDDED' || x.code === 'ASSET_NOT_EMBEDDED')).toBe(false);
    const { buffer } = await createTemplateDocx({ template: variant, content, mode: 'student' });
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files).filter(x => x.startsWith('word/media/')).length).toBeGreaterThanOrEqual(1);
    const documentXml = await zip.file('word/document.xml').async('string');
    const header = Object.keys(zip.files).find(x => /^word\/header\d+\.xml$/.test(x));
    expect(header).toBeTruthy();
    expect(documentXml).toContain('Hình minh họa');
    expect(await zip.file(header).async('string')).toContain('behindDoc="1"');
    variant.appearance.background.apply_to = 'first';
    const firstOnly = await createTemplateDocx({ template: variant, content, mode: 'student' });
    const firstZip = await JSZip.loadAsync(firstOnly.buffer);
    const firstXml = await firstZip.file('word/document.xml').async('string');
    expect(firstXml).toContain('<w:titlePg');
    expect(firstXml).toMatch(/<w:footerReference[^>]*w:type="first"/);
    // Do mo duoc tron san vao anh nen (Word khong giu opacity cua CSS).
    const red = createCanvas(4, 4); const rctx = red.getContext('2d'); rctx.fillStyle = '#ff0000'; rctx.fillRect(0, 0, 4, 4);
    const redData = red.toBuffer('image/png');
    const redSha = crypto.createHash('sha256').update(redData).digest('hex');
    const redId = `image-${redSha}`;
    fs.writeFileSync(path.join(directory, `${redId}.png`), redData);
    fs.writeFileSync(path.join(directory, `${redId}.json`), JSON.stringify({ asset_id: redId, filename: `${redId}.png`, mime: 'image/png', size: redData.length, sha256: redSha }));
    const faded = structuredClone(template);
    faded.appearance = { background: { asset_id: redId, apply_to: 'all', opacity: 0.2 } };
    expect(analyzeTemplateExport({ template: faded, content }).warnings.map(x => x.code)).toContain('BACKGROUND_OPACITY_BAKED');
    const fadedZip = await JSZip.loadAsync((await createTemplateDocx({ template: faded, content, mode: 'student' })).buffer);
    const media = Object.keys(fadedZip.files).filter(x => x.startsWith('word/media/') && !fadedZip.files[x].dir);
    const { Image } = require('@napi-rs/canvas');
    const img = new Image(); img.src = await fadedZip.file(media[0]).async('nodebuffer'); await img.decode();
    const probe = createCanvas(4, 4); const pctx = probe.getContext('2d'); pctx.drawImage(img, 0, 0);
    const [r, g, b] = pctx.getImageData(1, 1, 1, 1).data;
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(190); // trang 80% + do 20% ~ (255, 204, 204)
    expect(b).toBeGreaterThan(190);
    fs.writeFileSync(path.join(directory, filename), Buffer.from('tampered'));
    expect(analyzeTemplateExport({ template: variant, content }).warnings.some(x => x.code === 'BACKGROUND_NOT_EMBEDDED')).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.EXAM_BACKGROUNDS_DIR;
    else process.env.EXAM_BACKGROUNDS_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('managed WebP and safe SVG assets rasterize to PNG inside DOCX', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-docx-vector-'));
  const previous = process.env.EXAM_BACKGROUNDS_DIR;
  try {
    const canvas = createCanvas(8, 8);
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    const assets = [
      { ext: 'webp', mime: 'image/webp', data: canvas.toBuffer('image/webp') },
      { ext: 'svg', mime: 'image/svg+xml', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><rect width="8" height="8" fill="#0080ff"/></svg>') }
    ];
    process.env.EXAM_BACKGROUNDS_DIR = directory;
    const ids = assets.map(({ ext, mime, data }) => {
      const sha256 = crypto.createHash('sha256').update(data).digest('hex');
      const asset_id = `image-${sha256}`;
      const filename = `${asset_id}.${ext}`;
      fs.writeFileSync(path.join(directory, filename), data);
      fs.writeFileSync(path.join(directory, `${asset_id}.json`), JSON.stringify({ asset_id, filename, mime, size: data.length, sha256 }));
      return asset_id;
    });
    for (const asset_id of ids) {
      const variant = structuredClone(template);
      variant.appearance = { background: { asset_id, apply_to: 'all' } };
      const { buffer } = await createTemplateDocx({ template: variant, content, mode: 'student' });
      const zip = await JSZip.loadAsync(buffer);
      const media = Object.keys(zip.files).filter(name => name.startsWith('word/media/') && !zip.files[name].dir);
      expect(media).toHaveLength(1);
      const embedded = await zip.file(media[0]).async('nodebuffer');
      expect(embedded.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      // Pixel phai co mau that: truoc day WebP bi ve truoc khi giai ma xong -> PNG trong suot.
      const { Image } = require('@napi-rs/canvas');
      const img = new Image(); img.src = embedded; await img.decode();
      const probe = createCanvas(8, 8).getContext('2d'); probe.drawImage(img, 0, 0);
      expect(probe.getImageData(4, 4, 1, 1).data[3]).toBe(255);
    }
  } finally {
    if (previous === undefined) delete process.env.EXAM_BACKGROUNDS_DIR;
    else process.env.EXAM_BACKGROUNDS_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('middle and last background scope without per-page assets warn and use the single image', () => {
  for (const apply_to of ['middle', 'last']) {
    const variant = structuredClone(template);
    variant.appearance = { background: { asset_id: 'image-' + 'a'.repeat(64), apply_to } };
    const analysis = analyzeTemplateExport({ template: variant, content });
    const w = analysis.warnings.find(x => x.code === 'BACKGROUND_SCOPE_LIMIT');
    expect(w).toBeTruthy();
    expect(w.message).toMatch(/manifest ảnh cho từng trang/);
  }
});

test('TC-EXP-MATH: DOCX lam phang LaTeX, co o Dung/Sai, diem phan va dap an Dung/Sai tieng Viet', async () => {
  const tpl = { template_id: 'custom.math', display_name: 'Toán', defaults: {}, sections: [{ section_id: 's1', title: 'Phần 1', declared_points: '3.00', slots: [
    { slot_id: 'm1', points: '2.00', question_type: 'ESSAY', answer_space: { kind: 'lined', lines: 1 } },
    { slot_id: 't1', points: '1.00', question_type: 'TRUE_FALSE', answer_space: { kind: 'none', lines: 0 } }
  ] }] };
  const data = {
    m1: { content: String.raw`Tính $\sqrt{16}$`, correct_answer: '$4$', explanation: 'Vì $4^2 = 16$' },
    t1: { content: 'Số 2 là số nguyên tố.', correct_answer: 'Dung', explanation: 'Chỉ có hai ước.' }
  };
  const student = (await mammoth.extractRawText({ buffer: (await createTemplateDocx({ template: tpl, content: data, mode: 'student' })).buffer })).value;
  expect(student).not.toContain('$');
  expect(student).not.toContain(String.raw`\sqrt`);
  expect(student).toContain('√');
  expect(student).toContain('☐ Đúng');
  expect(student).toContain('Phần 1 (3.00 điểm)');
  const teacher = (await mammoth.extractRawText({ buffer: (await createTemplateDocx({ template: tpl, content: data, mode: 'teacher' })).buffer })).value;
  expect(teacher).toContain('Đáp án: Đúng');
  expect(teacher).not.toContain('$');
});
