const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const multer = require('multer');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const { docxToPdf } = require('../documentConvert/docxToPdf');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const imageExt = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const documentExt = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const backgroundDir = () => process.env.EXAM_BACKGROUNDS_DIR || path.join(__dirname, '..', '..', 'resources', 'backgrounds');
const assetDir = () => process.env.EXAM_TEMPLATE_ASSETS_DIR || path.join(__dirname, '..', '..', 'resources', 'template-assets');

function safeSvg(buffer) {
  if (buffer.length > 256 * 1024) return false;
  const xml = buffer.toString('utf8').trim();
  if (!/^<svg\s/i.test(xml) || !/(?:<\/svg>|\/>\s*)$/i.test(xml)) return false;
  if (/[\x00-\x1f]|<!|<\?|&|\b(?:script|foreignObject|image|use|animate|set|style|filter|pattern|mask|clipPath|iframe|object|embed)\b|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=|url\s*\(|javascript\s*:/i.test(xml)) return false;
  const tags = [...xml.matchAll(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi)];
  const allowedTags = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);
  if (!tags.length || tags.length > 256 || tags.some(t => !allowedTags.has(t[1]))) return false;
  if (xml.replace(/<\/?[a-z][\w:-]*\b[^>]*>/gi, '').trim()) return false;
  const stack = [];
  for (const tag of tags) {
    if (tag[0].startsWith('</')) {
      if (stack.pop() !== tag[1]) return false;
    } else if (!tag[0].endsWith('/>')) {
      if (!stack.length && tag[1] !== 'svg') return false;
      stack.push(tag[1]);
    }
    if (!stack.length && tag !== tags.at(-1)) return false;
  }
  if (stack.length) return false;
  const allowedAttrs = new Set(['xmlns', 'width', 'height', 'viewBox', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'rx', 'ry', 'r', 'd', 'points', 'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform']);
  for (const tag of tags) {
    let tail = tag[2].replace(/\/\s*$/, '').trim();
    while (tail) {
      const m = tail.match(/^([\w:-]+)\s*=\s*(["'])([^"'<>;&]*)\2\s*/);
      if (!m || !allowedAttrs.has(m[1])) return false;
      if (['fill', 'stroke'].includes(m[1]) && !/^(?:none|transparent|#[0-9a-f]{3,8}|[a-z]+)$/i.test(m[3])) return false;
      tail = tail.slice(m[0].length);
    }
  }
  return true;
}

// Check ZIP central directory and inflate every entry under explicit bounds before
// passing a DOCX to mammoth. A small compressed upload can otherwise expand hugely.
function validDocxZip(buffer) {
  const MAX_ENTRIES = 2000, MAX_ENTRY = 20 * 1024 * 1024, MAX_TOTAL = 50 * 1024 * 1024;
  let eocd = -1;
  for (let p = buffer.length - 22; p >= Math.max(0, buffer.length - 65557); p--) {
    if (buffer.readUInt32LE(p) === 0x06054b50 && p + 22 + buffer.readUInt16LE(p + 20) === buffer.length) { eocd = p; break; }
  }
  if (eocd < 0 || buffer.readUInt16LE(eocd + 4) !== 0 || buffer.readUInt16LE(eocd + 6) !== 0) return false;
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  let pos = buffer.readUInt32LE(eocd + 16);
  if (!count || count > MAX_ENTRIES || pos + centralSize > eocd) return false;
  const centralStart = pos;
  const centralEnd = pos + centralSize;
  const names = new Set();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > centralEnd || buffer.readUInt32LE(pos) !== 0x02014b50) return false;
    const flags = buffer.readUInt16LE(pos + 8), method = buffer.readUInt16LE(pos + 10);
    const compressed = buffer.readUInt32LE(pos + 20), expanded = buffer.readUInt32LE(pos + 24);
    const nameLength = buffer.readUInt16LE(pos + 28), extra = buffer.readUInt16LE(pos + 30), comment = buffer.readUInt16LE(pos + 32);
    const local = buffer.readUInt32LE(pos + 42);
    if (flags & 1 || ![0, 8].includes(method) || expanded > MAX_ENTRY || compressed > MAX_ENTRY || (compressed && expanded > compressed * 200)) return false;
    total += expanded;
    if (total > MAX_TOTAL || pos + 46 + nameLength + extra + comment > centralEnd) return false;
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLength);
    if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || names.has(name)) return false;
    names.add(name);
    if (local + 30 > pos || buffer.readUInt32LE(local) !== 0x04034b50) return false;
    const data = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (data + compressed > centralStart) return false;
    try {
      const raw = buffer.subarray(data, data + compressed);
      const actual = method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: expanded + 1 }).length : raw.length;
      if (actual !== expanded) return false;
    } catch { return false; }
    pos += 46 + nameLength + extra + comment;
  }
  return pos === centralEnd && names.has('[Content_Types].xml') && names.has('word/document.xml');
}

function validBuffer(buffer, ext) {
  if (!buffer || buffer.length < 8) return false;
  if (ext === '.png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (ext === '.jpg' || ext === '.jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer.at(-2) === 255 && buffer.at(-1) === 217;
  if (ext === '.webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (ext === '.svg') return safeSvg(buffer);
  if (ext === '.pdf') return buffer.toString('ascii', 0, 5) === '%PDF-' && buffer.toString('latin1', Math.max(0, buffer.length - 1024)).includes('%%EOF');
  if (ext === '.docx') return buffer.toString('ascii', 0, 2) === 'PK' && validDocxZip(buffer);
  return false;
}

async function saveAsset(file, ext, mime, dir, kind) {
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const asset_id = `${kind}-${sha256}`;
  const filename = `${asset_id}${ext === '.jpeg' ? '.jpg' : ext}`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), file.buffer, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  const asset = { asset_id, filename, mime, size: file.buffer.length, sha256, original_name: path.basename(file.originalname || filename) };
  await fs.writeFile(path.join(dir, `${asset_id}.json`), JSON.stringify(asset), { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  return asset;
}

function multipart(req, res, next) {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ success: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'File vuot gioi han 20 MB' : err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'Thieu file' });
    next();
  });
}

// Legacy response remains a filename array for the existing dropdown.
router.get('/', async (req, res) => {
  try { res.json((await fs.readdir(backgroundDir())).filter(f => imageExt[path.extname(f).toLowerCase()])); }
  catch (e) { if (e.code === 'ENOENT') return res.json([]); res.status(500).json({ error: 'Khong doc duoc thu muc anh nen.' }); }
});

router.get('/assets', async (req, res) => {
  const assets = [];
  for (const dir of [backgroundDir(), assetDir()]) {
    try {
      for (const name of await fs.readdir(dir)) {
        if (!/^(image|document)-[0-9a-f]{64}\.json$/.test(name)) continue;
        const a = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
        assets.push({ ...a, url: a.asset_id.startsWith('image-') ? `/backgrounds/${a.filename}` : `/api/backgrounds/assets/${a.asset_id}/file` });
      }
    } catch (e) { if (e.code !== 'ENOENT') return res.status(500).json({ success: false, error: 'Khong doc duoc thu vien asset' }); }
  }
  res.json({ success: true, assets });
});

router.get('/assets/:id/file', async (req, res) => {
  if (!/^document-[0-9a-f]{64}$/.test(req.params.id)) return res.sendStatus(404);
  try {
    const a = JSON.parse(await fs.readFile(path.join(assetDir(), `${req.params.id}.json`), 'utf8'));
    res.set('Content-Type', a.mime);
    res.set('Content-Disposition', `attachment; filename="${a.asset_id}${path.extname(a.filename)}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(assetDir(), a.filename));
  } catch (e) { res.sendStatus(404); }
});

router.post('/upload', multipart, async (req, res) => {
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (!imageExt[ext] || !validBuffer(req.file.buffer, ext)) return res.status(400).json({ success: false, error: 'Anh khong hop le hoac khong an toan' });
  try {
    const a = await saveAsset(req.file, ext, imageExt[ext], backgroundDir(), 'image');
    res.json({ success: true, asset: { ...a, url: `/backgrounds/${a.filename}` } });
  } catch (e) { res.status(500).json({ success: false, error: 'Khong luu duoc anh nen' }); }
});

async function extractText(buffer, ext) {
  if (ext === '.docx') {
    const text = (await mammoth.extractRawText({ buffer })).value || '';
    if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('Text vuot gioi han');
    return text;
  }
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const info = await parser.getInfo({ parsePageInfo: false });
    if (!Number.isSafeInteger(info.total) || info.total < 1 || info.total > 100) throw new Error('PDF vuot gioi han 100 trang');
    const text = (await parser.getText()).text || '';
    if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('Text vuot gioi han');
    return text;
  }
  finally { if (parser) await parser.destroy(); }
}

// sourceName chi dung dat ten hien thi cho anh trang (vd "de.pdf - trang 2.png").
async function rasterPdfPages(buffer, sourceName = 'tai-lieu') {
  const pages = [];
  const warnings = [];
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const info = await parser.getInfo({ parsePageInfo: false });
    const count = Math.min(info.total, 100);
    if (info.total > 100) warnings.push(`PDF co ${info.total} trang; chi nhan toi da 100 trang dau lam nen, file goc giu nguyen.`);
    let storedBytes = 0;
    for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
      let pageBytes = 0;
      try {
        const rendered = await parser.getScreenshot({ partial: [pageNumber], desiredWidth: 960, imageBuffer: true, imageDataUrl: false });
        const shot = rendered.pages?.[0];
        const image = shot?.data && Buffer.from(shot.data);
        pageBytes = image?.length || 0;
        if (!shot || shot.pageNumber !== pageNumber || !Number.isFinite(shot.width) || !Number.isFinite(shot.height) || shot.width > 1200 || shot.height > 2400 || !image || image.length > 2 * 1024 * 1024 || storedBytes + image.length > 12 * 1024 * 1024 || !validBuffer(image, '.png')) {
          throw new Error('Trang PDF vuot gioi han anh nen');
        }
        const a = await saveAsset({ buffer: image, originalname: `${path.basename(String(sourceName)).replace(/\.(pdf|docx)$/i, '')} - trang ${pageNumber}.png` }, '.png', 'image/png', backgroundDir(), 'image');
        pages.push({ page_number: pageNumber, asset_id: a.asset_id, sha256: a.sha256, mime: a.mime, size: a.size, url: `/backgrounds/${a.filename}`, width: shot.width, height: shot.height });
        storedBytes += image.length;
      } catch (e) {
        const reason = storedBytes + pageBytes > 12 * 1024 * 1024 ? 'vuot ngan sach 12 MiB' : 'gap gioi han kich thuoc/loi raster';
        warnings.push(`Khong chuyen duoc trang ${pageNumber} do ${reason}; da raster ${pages.length}/${info.total} trang. File PDF goc van day du de tai ve.`);
        break;
      }
    }
  } catch (e) { warnings.push('Khong chuyen duoc PDF thanh anh nen; file goc van duoc luu de danh dau vung thu cong.'); }
  finally { if (parser) await parser.destroy(); }
  return { pages, warnings };
}

async function rasterDocxPages(buffer) {
  try { return await rasterPdfPages(await docxToPdf(buffer)); }
  catch {
    return { pages: [], warnings: ['DOCX goc da duoc luu; khong chuyen duoc thanh anh trang. Can Microsoft Word tren Windows de raster hoa; co the tai file goc va danh dau vung thu cong.'] };
  }
}

function suggestStructure(text) {
  const sections = [];
  let current = { title: 'Phan 1', questions: [] };
  let questionCount = 0;
  for (const line of text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (sections.length >= 30 || questionCount >= 200) break;
    if (/^(?:PHẦN|PHAN)\s+(?:[IVX]+|\d+)\b/i.test(line)) {
      if (current.questions.length || sections.length) sections.push(current);
      current = { title: line.slice(0, 160), questions: [] };
    } else if (/^(?:Câu|Cau|Question)\s*\d+[.:)]\s*/i.test(line)) {
      current.questions.push({ text: line.slice(0, 4000), confidence: 'low', review_required: true });
      questionCount++;
    } else if (current.questions.length) {
      const q = current.questions.at(-1); q.text = `${q.text}\n${line}`.slice(0, 4000);
    }
  }
  if (current.questions.length || sections.length) sections.push(current);
  return sections;
}

router.post('/import', multipart, async (req, res) => {
  const mode = req.body.mode;
  if (!['background', 'structure'].includes(mode)) return res.status(400).json({ success: false, error: 'mode phai la background hoac structure' });
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (!documentExt[ext] || !validBuffer(req.file.buffer, ext)) return res.status(400).json({ success: false, error: 'Chi nhan DOCX/PDF hop le' });
  try {
    if (ext === '.pdf' && mode === 'background') {
      let parser;
      let info;
      try { parser = new PDFParse({ data: req.file.buffer }); info = await parser.getInfo({ parsePageInfo: false }); }
      finally { if (parser) await parser.destroy(); }
      if (!Number.isSafeInteger(info?.total) || info.total < 1) return res.status(400).json({ success: false, error: 'PDF khong co trang hop le' });
      if (info.total > 100) {
        const asset = await saveAsset(req.file, ext, documentExt[ext], assetDir(), 'document');
        return res.json({
          success: true, mode, asset: { ...asset, url: `/api/backgrounds/assets/${asset.asset_id}/file` },
          warnings: [`PDF co ${info.total} trang, vuot gioi han raster 100 trang. File goc da duoc luu nguyen ven; tai file goc de in/gan vung thu cong. Khong co OCR.`],
          review_required: true, background_pages: [], manual_regions: [], extraction: 'not_processed',
          asset_manifest: [{ asset_id: asset.asset_id, sha256: asset.sha256, mime: asset.mime, size: asset.size, role: 'source_document', transfer: 'reference_only', fallback: 'download_original_document_and_keep_exam_content' }]
        });
      }
    }
    let text = '';
    try { text = await extractText(req.file.buffer, ext); }
    catch (e) { return res.status(400).json({ success: false, error: 'File DOCX/PDF bi hong hoac khong doc duoc text native' }); }
    const a = await saveAsset(req.file, ext, documentExt[ext], assetDir(), 'document');
    const warnings = [];
    if (!text.trim()) warnings.push('Khong co text native; PDF scan/tep anh chi dung lam nen va danh dau vung thu cong. OCR khong duoc trien khai.');
    const result = { success: true, mode, asset: { ...a, url: `/api/backgrounds/assets/${a.asset_id}/file` }, warnings, review_required: true };
    if (mode === 'structure') Object.assign(result, { raw_text: text.slice(0, 250000), sections: suggestStructure(text), extraction: text.trim() ? 'native_text' : 'none' });
    else {
      let raster;
      if (ext === '.pdf') {
        raster = await rasterPdfPages(req.file.buffer, req.file.originalname);
      } else {
        // DOCX: thu chuyen qua docxToPdf (can Word tren Windows)
        try {
          const pdfBuffer = await docxToPdf(req.file.buffer);
          raster = await rasterPdfPages(pdfBuffer, req.file.originalname);
        } catch (e) {
          raster = { pages: [], warnings: ['Khong chuyen duoc DOCX thanh anh nen: can Microsoft Word tren Windows. File goc da duoc luu de danh dau vung thu cong.'] };
        }
      }
      warnings.push(...raster.warnings);
      Object.assign(result, { background_pages: raster.pages, manual_regions: [], extraction: text.trim() ? 'native_text_available' : 'none' });
    }
    res.json(result);
  } catch (e) { res.status(500).json({ success: false, error: 'Khong nhap duoc tai lieu' }); }
});

module.exports = router;
module.exports.validBuffer = validBuffer;
module.exports.suggestStructure = suggestStructure;
