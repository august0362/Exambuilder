const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { Document, Packer, Paragraph } = require('docx');

const mockGetText = jest.fn();
const mockGetInfo = jest.fn().mockResolvedValue({ total: 1 });
const mockGetScreenshot = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockDocxToPdf = jest.fn();
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn().mockImplementation(() => ({ getInfo: mockGetInfo, getText: mockGetText, getScreenshot: mockGetScreenshot, destroy: mockDestroy })) }));
jest.mock('../../backend/documentConvert/docxToPdf', () => ({ docxToPdf: (...args) => mockDocxToPdf(...args) }));
const backgroundRoutes = require('../../backend/routes/backgroundRoutes');

let tmp;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'exam-assets-'));
  process.env.EXAM_BACKGROUNDS_DIR = path.join(tmp, 'backgrounds');
  process.env.EXAM_TEMPLATE_ASSETS_DIR = path.join(tmp, 'assets');
  mockGetText.mockReset();
  mockGetInfo.mockReset();
  mockGetInfo.mockResolvedValue({ total: 1 });
  mockGetScreenshot.mockReset();
  mockDestroy.mockClear();
  mockDocxToPdf.mockReset();
});
afterEach(async () => {
  delete process.env.EXAM_BACKGROUNDS_DIR;
  delete process.env.EXAM_TEMPLATE_ASSETS_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});
function app() { const a = express(); a.use('/api/backgrounds', backgroundRoutes); return a; }
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(12)]);

test('legacy GET list and secure image upload with checksum metadata', async () => {
  const uploaded = await request(app()).post('/api/backgrounds/upload').attach('file', png, 'paper.png');
  expect(uploaded.status).toBe(200);
  expect(uploaded.body.asset.mime).toBe('image/png');
  expect(uploaded.body.asset.sha256).toMatch(/^[0-9a-f]{64}$/);
  const listed = await request(app()).get('/api/backgrounds');
  expect(listed.body).toEqual([uploaded.body.asset.filename]);
  const assets = await request(app()).get('/api/backgrounds/assets');
  expect(assets.body.assets[0].asset_id).toBe(uploaded.body.asset.asset_id);
});

test('reject disguised image and active SVG', async () => {
  expect((await request(app()).post('/api/backgrounds/upload').attach('file', Buffer.from('not png'), 'fake.png')).status).toBe(400);
  const active = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  expect((await request(app()).post('/api/backgrounds/upload').attach('file', active, 'active.svg')).status).toBe(400);
  const safe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="#fff"/></svg>');
  expect((await request(app()).post('/api/backgrounds/upload').attach('file', safe, 'safe.svg')).status).toBe(200);
  const malformed = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="1" height="1"/></svg>');
  expect((await request(app()).post('/api/backgrounds/upload').attach('file', malformed, 'malformed.svg')).status).toBe(400);
  const remote = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://example.com/a)"/></svg>');
  expect((await request(app()).post('/api/backgrounds/upload').attach('file', remote, 'remote.svg')).status).toBe(400);
});

test('DOCX structure mode extracts native text and requires review', async () => {
  const doc = new Document({ sections: [{ children: [new Paragraph('PHAN I'), new Paragraph('Cau 1: Hai cong hai bang may?')] }] });
  const buffer = await Packer.toBuffer(doc);
  const response = await request(app()).post('/api/backgrounds/import').field('mode', 'structure').attach('file', buffer, 'questions.docx');
  expect(response.status).toBe(200);
  expect(response.body.extraction).toBe('native_text');
  expect(response.body.sections[0].questions[0].text).toContain('Cau 1');
  expect(response.body.review_required).toBe(true);
});

test('DOCX background mode rasterizes pages when the optional converter is available', async () => {
  const doc = new Document({ sections: [{ children: [new Paragraph('School exam template')] }] });
  const buffer = await Packer.toBuffer(doc);
  mockDocxToPdf.mockResolvedValue(Buffer.from('%PDF-1.7\nrendered\n%%EOF'));
  mockGetText.mockResolvedValue({ text: 'School exam template' });
  mockGetScreenshot.mockResolvedValue({ pages: [{ pageNumber: 1, width: 960, height: 1200, data: png }] });
  const response = await request(app()).post('/api/backgrounds/import').field('mode', 'background').attach('file', buffer, 'template.docx');
  expect(response.status).toBe(200);
  expect(mockDocxToPdf).toHaveBeenCalledWith(buffer);
  expect(response.body.background_pages).toHaveLength(1);
  expect(response.body.background_pages[0].page_number).toBe(1);
});

test('DOCX background mode preserves the original and explains fallback when conversion fails', async () => {
  const doc = new Document({ sections: [{ children: [new Paragraph('Original template')] }] });
  const buffer = await Packer.toBuffer(doc);
  mockDocxToPdf.mockRejectedValue(new Error('Word unavailable'));
  mockGetText.mockResolvedValue({ text: 'Original template' });
  const response = await request(app()).post('/api/backgrounds/import').field('mode', 'background').attach('file', buffer, 'template.docx');
  expect(response.status).toBe(200);
  expect(response.body.background_pages).toEqual([]);
  expect(response.body.asset.url).toMatch(/\/file$/);
  expect(response.body.warnings.join(' ')).toMatch(/Microsoft Word/);
});

test('PDF scan path stores original and flags manual review without OCR', async () => {
  mockGetText.mockResolvedValue({ text: '' });
  mockGetScreenshot.mockResolvedValue({ pages: [{ pageNumber: 1, width: 960, height: 1200, data: png }] });
  const buffer = Buffer.from('%PDF-1.7\nscan\n%%EOF');
  const response = await request(app()).post('/api/backgrounds/import').field('mode', 'background').attach('file', buffer, 'scan.pdf');
  expect(response.status).toBe(200);
  expect(response.body.extraction).toBe('none');
  expect(response.body.background_pages).toHaveLength(1);
  expect(response.body.background_pages[0]).toMatchObject({ page_number: 1, width: 960, height: 1200 });
  expect(response.body.warnings.join(' ')).toMatch(/OCR khong duoc trien khai/);
  const downloaded = await request(app()).get(response.body.asset.url);
  expect(downloaded.status).toBe(200);
  expect(downloaded.headers['content-disposition']).toMatch(/^attachment/);
});

test('PDF background renders pages beyond the former ten page limit', async () => {
  mockGetText.mockResolvedValue({ text: 'some native text' });
  mockGetInfo.mockResolvedValue({ total: 14 });
  mockGetScreenshot.mockImplementation(async ({ partial }) => ({ pages: [{ pageNumber: partial[0], width: 960, height: 1200, data: png }] }));
  const pdf = Buffer.from('%PDF-1.7\ntext\n%%EOF');
  const response = await request(app()).post('/api/backgrounds/import').field('mode', 'background').attach('file', pdf, 'twelve.pdf');
  expect(response.status).toBe(200);
  expect(response.body.background_pages).toHaveLength(14);
  expect(mockGetScreenshot).toHaveBeenCalledTimes(14);
});

test('PDF raster failure retains original and warns without claiming pages', async () => {
  mockGetText.mockResolvedValue({ text: '' });
  mockGetScreenshot.mockRejectedValue(new Error('canvas unavailable'));
  const pdf = Buffer.from('%PDF-1.7\nscan\n%%EOF');
  const response = await request(app()).post('/api/backgrounds/import').field('mode', 'background').attach('file', pdf, 'scan.pdf');
  expect(response.status).toBe(200);
  expect(response.body.background_pages).toEqual([]);
  expect(response.body.asset.url).toMatch(/\/file$/);
  expect(response.body.warnings.join(' ')).toMatch(/Khong chuyen duoc trang 1/);
});

test('import requires explicit mode and valid magic', async () => {
  const pdf = Buffer.from('%PDF-1.7\ntext\n%%EOF');
  expect((await request(app()).post('/api/backgrounds/import').attach('file', pdf, 'x.pdf')).status).toBe(400);
  expect((await request(app()).post('/api/backgrounds/import').field('mode', 'structure').attach('file', Buffer.from('fake pdf'), 'x.pdf')).status).toBe(400);
});

test('reject DOCX central directory claiming oversized expanded entry', async () => {
  const doc = new Document({ sections: [{ children: [new Paragraph('Small content')] }] });
  const buffer = await Packer.toBuffer(doc);
  const modified = Buffer.from(buffer);
  const central = modified.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  expect(central).toBeGreaterThan(0);
  modified.writeUInt32LE(51 * 1024 * 1024, central + 24);
  const response = await request(app()).post('/api/backgrounds/import').field('mode', 'structure').attach('file', modified, 'bomb.docx');
  expect(response.status).toBe(400);
});

test('reject PDF over page or extracted text limits', async () => {
  const pdf = Buffer.from('%PDF-1.7\ntext\n%%EOF');
  mockGetInfo.mockResolvedValueOnce({ total: 101 });
  const tooManyPages = await request(app()).post('/api/backgrounds/import').field('mode', 'structure').attach('file', pdf, 'long.pdf');
  expect(tooManyPages.status).toBe(400);
  mockGetText.mockResolvedValueOnce({ text: 'a'.repeat(1024 * 1024 + 1) });
  const tooMuchText = await request(app()).post('/api/backgrounds/import').field('mode', 'structure').attach('file', pdf, 'text.pdf');
  expect(tooMuchText.status).toBe(400);
});

test('PDF over the raster page limit keeps the source file and declares a manual fallback', async () => {
  const pdf = Buffer.from('%PDF-1.7\nlarge-original\n%%EOF');
  mockGetInfo.mockResolvedValue({ total: 101 });
  const response = await request(app()).post('/api/backgrounds/import').field('mode', 'background').attach('file', pdf, 'very-long.pdf');
  expect(response.status).toBe(200);
  expect(response.body.background_pages).toEqual([]);
  expect(response.body.extraction).toBe('not_processed');
  expect(response.body.warnings.join(' ')).toMatch(/da duoc luu nguyen ven/);
  expect(response.body.asset_manifest[0]).toMatchObject({ role: 'source_document', sha256: expect.any(String), transfer: 'reference_only' });
  const download = await request(app()).get(response.body.asset.url);
  expect(download.status).toBe(200);
  expect(download.body).toEqual(pdf);
});
