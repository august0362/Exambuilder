const { Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, AlignmentType, HeadingLevel, Table, TableRow, TableCell, WidthType, HeightRule, BorderStyle, ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType } = require('docx');
const { flatten } = require('../templatePrompts');
const { readImageAsset, loadImageAsset, decodeImage } = require('./assets');
const path = require('path');
const { pathToFileURL } = require('url');
const { createCanvas } = require('@napi-rs/canvas');

// Word la text tinh: dung chung latexToPlainText voi exporter DOCX cu de
// "$\sqrt{16}$" khong hien tho trong file. Module ESM nen nap dong mot lan.
let latexToPlainText = text => text;
let mathReady;
function loadMath() {
  mathReady ||= import(pathToFileURL(path.join(__dirname, '..', 'parser', 'mathFormat.js')).href)
    .then(mod => { latexToPlainText = mod.latexToPlainText; });
  return mathReady;
}
function plain(value, limit) { return latexToPlainText(safeString(value, limit)); }
// Loai cau lay tu slot: noi dung nhap tay trong inspector khong co question_type.
function answerText(q, slot) { return (slot?.question_type || q?.question_type) === 'TRUE_FALSE' ? (q?.correct_answer === 'Dung' ? 'Đúng' : q?.correct_answer === 'Sai' ? 'Sai' : plain(q?.correct_answer)) : plain(q?.correct_answer); }

// DOCX khong bao dam opacity cua anh: tron san anh nen voi nen trang theo do mo.
async function fadeImage(image, opacity) {
  if (!image || typeof opacity !== 'number' || !(opacity > 0 && opacity < 1)) return image;
  try {
    const source = await decodeImage(image.data);
    const canvas = createCanvas(source.width, source.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = opacity;
    ctx.drawImage(source, 0, 0);
    return { ...image, data: canvas.toBuffer('image/png'), type: 'png' };
  } catch { return image; }
}

const MM = 56.692913;
const PAPER = { A4: [210, 297], A5: [148, 210] };
const MODES = new Set(['student', 'teacher', 'answer_key', 'combined']);

function safeString(value, limit = 100000) {
  const text = String(value ?? '');
  if (text.length > limit) throw new Error('Một trường nội dung quá dài để xuất an toàn.');
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
function twips(mm) { return Math.round(mm * MM); }

function normalizeOptions(input = {}) {
  const paper = input.paper || {};
  const size = paper.size || 'A4';
  const orientation = paper.orientation || 'portrait';
  const margins = { top: 20, right: 18, bottom: 20, left: 18, ...(paper.margins || {}) };
  if (!PAPER[size] || !['portrait', 'landscape'].includes(orientation)) throw new Error('Khổ giấy hoặc chiều giấy không hợp lệ.');
  if (Object.values(margins).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 5 || value > 40)) throw new Error('Lề trang phải từ 5 đến 40 mm.');
  const [w, h] = PAPER[size];
  const [width, height] = orientation === 'landscape' ? [h, w] : [w, h];
  const columns = input.columns === 2 ? 2 : 1;
  const mode = input.mode || 'student';
  if (!MODES.has(mode)) throw new Error('Chế độ xuất không hợp lệ.');
  const maxPages = input.maxPages == null ? null : Number(input.maxPages);
  if (maxPages !== null && (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 200)) throw new Error('Giới hạn trang không hợp lệ.');
  return { mode, columns, maxPages, size, orientation, margins, width, height };
}

function backgroundPages(background = {}) {
  const pages = Array.isArray(background.pages) ? background.pages.filter(page => Number.isInteger(Number(page.page_number)) && Number(page.page_number) > 0 && page.asset_id) : [];
  if (pages.length) return [...pages].sort((a, b) => Number(a.page_number) - Number(b.page_number));
  return background.asset_id ? [{ page_number: 1, asset_id: background.asset_id }] : [];
}

function validRegion(region) {
  if (!region || !Number.isInteger(Number(region.page_number)) || Number(region.page_number) < 1) return false;
  return ['x_pct', 'y_pct', 'width_pct', 'height_pct'].every(key => Number.isFinite(Number(region[key])) && Number(region[key]) >= 0 && Number(region[key]) <= 100) && Number(region.width_pct) > 0 && Number(region.height_pct) > 0 && Number(region.x_pct) + Number(region.width_pct) <= 100 && Number(region.y_pct) + Number(region.height_pct) <= 100;
}

function analyzeTemplateExport(input) {
  const { template, content = {}, metadata = {} } = input;
  const slots = flatten(template);
  if (slots.length > 500) throw new Error('DOCX hỗ trợ tối đa 500 slot mỗi lần xuất.');
  const options = normalizeOptions(input);
  const warnings = [];
  let imageBytes = 0;
  const usableHeight = options.height - options.margins.top - options.margins.bottom;
  const usableWidth = (options.width - options.margins.left - options.margins.right) / options.columns;
  let estimatedMm = 34;
  const bgPages = backgroundPages(template.appearance?.background);
  const availablePageNumbers = new Set();
  slots.forEach(({ section, slot, sectionIndex, slotIndex }) => {
    const q = content[slot.slot_id] || slot.content;
    const location = `Phần ${sectionIndex + 1} – Câu ${slotIndex + 1}`;
    if (!q) warnings.push({ code: 'EMPTY_SLOT', section_id: section.section_id, slot_id: slot.slot_id, message: `${location}: chưa có nội dung.` });
    const textLength = safeString(q?.content).length + (q?.options || []).reduce((n, o) => n + safeString(o.option_text).length, 0);
    estimatedMm += 7 + Math.ceil(textLength / Math.max(24, Math.floor(usableWidth / 2.8))) * 5;
    if (options.mode === 'student' || options.mode === 'combined') estimatedMm += Math.min(Number(slot.answer_space?.lines || 0), 50) * 6;
    if (options.mode === 'teacher' || options.mode === 'combined' || options.mode === 'answer_key') estimatedMm += Math.ceil((safeString(q?.correct_answer).length + safeString(q?.explanation).length) / Math.max(24, Math.floor(usableWidth / 2.8))) * 5 + 8;
    if (Array.isArray(slot.assets)) for (const asset of slot.assets) {
      try { imageBytes += readImageAsset(typeof asset === 'string' ? asset : asset?.asset_id).data.length; }
      catch { warnings.push({ code: 'ASSET_NOT_EMBEDDED', section_id: section.section_id, slot_id: slot.slot_id, message: `${location}: ảnh đính kèm thiếu, sai checksum hoặc định dạng không hỗ trợ trong DOCX.` }); }
    }
  });
  const background = template.appearance?.background;
  for (const page of bgPages) {
    try { imageBytes += readImageAsset(page.asset_id).data.length; availablePageNumbers.add(Number(page.page_number)); }
    catch { warnings.push({ code: 'BACKGROUND_NOT_EMBEDDED', page_number: Number(page.page_number), message: `Ảnh nền trang ${Number(page.page_number)} thiếu, sai checksum hoặc định dạng không hỗ trợ; nội dung đề vẫn đầy đủ.` }); }
  }
  slots.forEach(({ section, slot, sectionIndex, slotIndex }) => {
    if (slot.manual_region && (!validRegion(slot.manual_region) || !availablePageNumbers.has(Number(slot.manual_region.page_number)))) warnings.push({ code: 'MANUAL_REGION_NOT_APPLIED', section_id: section.section_id, slot_id: slot.slot_id, message: `Phần ${sectionIndex + 1} – Câu ${slotIndex + 1}: vùng tọa độ tay không hợp lệ hoặc thiếu ảnh trang tương ứng; câu vẫn được xuất theo luồng nội dung.` });
  });
  if (background?.asset_id || bgPages.length) {
    if (['middle', 'last'].includes(background.apply_to) && !Array.isArray(background.pages)) warnings.push({ code: 'BACKGROUND_SCOPE_LIMIT', message: 'Nền giữa/cuối cần manifest ảnh cho từng trang hoặc gặp giới hạn định dạng Word; template chỉ có một ảnh nên DOCX dùng ảnh đó chung.' });
    if (typeof background.opacity === 'number' && background.opacity < 1) warnings.push({ code: 'BACKGROUND_OPACITY_BAKED', message: `Ảnh nền được làm nhạt sẵn theo độ đậm ${background.opacity} khi nhúng DOCX; hãy kiểm tra độ tương phản chữ trong Word.` });
  }
  const placed = slots.filter(({ slot }) => validRegion(slot.manual_region) && availablePageNumbers.has(Number(slot.manual_region.page_number)));
  if (bgPages.length && placed.length !== slots.length) warnings.push({ code: 'UNPOSITIONED_CONTENT', message: `${slots.length - placed.length} slot không gắn vùng tọa độ sẽ xuất thành nội dung theo dòng sau các trang nền.` });
  if (placed.length) warnings.push({ code: 'MANUAL_REGION_RASTERIZED', message: `${placed.length} slot gắn vùng tọa độ được render thành ảnh trong DOCX để giữ vị trí trên nền; nội dung vẫn có mô tả thay thế, còn slot không gắn vùng giữ văn bản Word chỉnh sửa được.` });
  placed.forEach(item => {
    const index = slots.findIndex(entry => entry.slot.slot_id === item.slot.slot_id);
    try {
      if (manualRegionTextbox({ ...item, slotIndex: index }, content, options.mode, options).overflow) warnings.push({ code: 'MANUAL_REGION_OVERFLOW', section_id: item.section.section_id, slot_id: item.slot.slot_id, message: `Câu ${index + 1}: nội dung vượt vùng tọa độ; DOCX sẽ giữ câu ở phần nội dung theo dòng thay vì cắt chữ.` });
    } catch { /* asset and coordinates are validated separately; preserve document export */ }
  });
  if (imageBytes > 20 * 1024 * 1024) warnings.push({ code: 'ASSET_BUDGET', message: 'Tổng ảnh vượt 20 MiB; một số ảnh sẽ bị bỏ qua trong DOCX để giữ tệp ổn định.' });
  if (options.mode === 'combined') estimatedMm += 20;
  const estimatedPages = Math.max(1, bgPages.length, Math.ceil(estimatedMm / usableHeight / options.columns));
  if (options.maxPages && estimatedPages > options.maxPages) warnings.push({ code: 'MAX_PAGES_ESTIMATE', message: `Ước lượng ${estimatedPages} trang, vượt giới hạn ${options.maxPages}. DOCX vẫn giữ toàn bộ nội dung; hãy kiểm tra trong Word.` });
  return { options, estimatedPages, warnings, slotCount: slots.length, metadata };
}

// "\n" trong noi dung (cac y a) b) c)) -> ngat dong that trong cung doan.
function p(text, options = {}) {
  const children = safeString(text).split(/\r?\n/).map((line, i) => new TextRun({ text: line, bold: Boolean(options.bold), break: i > 0 ? 1 : undefined }));
  return new Paragraph({ children, spacing: { after: options.after ?? 120 }, heading: options.heading });
}
function label(slot, number) { return `Câu ${number} (${safeString(slot.points, 20)} điểm).`; }

function answerSpaceChildren(space = {}) {
  const count = Math.min(Math.max(Number(space.lines || 0), 0), 50);
  if (!count || space.kind === 'none') return [];
  if (space.kind === 'lined') return Array.from({ length: count }, () => p('________________________________________________________________________________', { after: 80 }));
  const kind = space.kind || 'blank';
  const rows = kind === 'drawing' || kind === 'blank' ? 1 : count;
  const columns = kind === 'squared' ? 8 : kind === 'table' ? 3 : 1;
  const border = { style: BorderStyle.SINGLE, size: 4, color: '888888' };
  const tableRows = Array.from({ length: rows }, () => new TableRow({
    cantSplit: true,
    height: { value: kind === 'drawing' || kind === 'blank' ? Math.max(400, count * 180) : 280, rule: HeightRule.ATLEAST },
    children: Array.from({ length: columns }, () => new TableCell({ children: [p('', { after: 0 })], borders: { top: border, bottom: border, left: border, right: border } }))
  }));
  return [new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border } })];
}

function questionChildren(q, slot, number, mode, images = []) {
  const out = [p(`${label(slot, number)} ${q ? plain(q.content) : '[Chưa có nội dung]'} `, { bold: true, after: 80 })];
  if (q?.options) for (const option of q.options) out.push(p(`${safeString(option.option_key, 2)}. ${plain(option.option_text)}`, { after: 30 }));
  if (slot.question_type === 'TRUE_FALSE' && mode !== 'answer_key') out.push(p('☐ Đúng      ☐ Sai', { after: 30 }));
  for (const item of images) {
    out.push(new Paragraph({ children: [new ImageRun({ type: item.image.type, data: item.image.data, transformation: { width: 320, height: 220 }, altText: { name: 'Hình minh họa', title: safeString(item.caption || 'Hình minh họa', 200), description: safeString(item.caption || 'Hình minh họa', 500) } })] }));
    if (item.caption) out.push(p(item.caption));
  }
  if (mode === 'teacher') {
    out.push(p(`Đáp án: ${answerText(q, slot)}`, { bold: true, after: 50 }));
    out.push(p(`Lời giải: ${plain(q?.explanation)}`, { after: 100 }));
  } else if (mode !== 'answer_key') {
    out.push(...answerSpaceChildren(slot.answer_space));
  }
  return out;
}

// Header/footer are driven by appearance.header/appearance.footer when present;
// without that config the legacy behavior (metadata.header text, page number footer) is kept.
function resolveHeaderText(metadata = {}, template = {}) {
  const config = template.appearance?.header;
  const enabled = config ? config.enabled !== false : true;
  if (!enabled) return '';
  const explicit = safeString(metadata.header, 500).trim();
  if (explicit) return explicit;
  const fields = Array.isArray(config?.fields) ? config.fields : [];
  const parts = [];
  for (const field of fields) {
    if (field === 'school') parts.push(safeString(metadata.school ?? template.defaults?.school_header ?? '', 300));
    else if (field === 'exam_title') parts.push(safeString(metadata.exam_title ?? template.display_name ?? '', 300));
  }
  const text = parts.filter(Boolean).join('    ');
  return text || (config ? safeString(template.display_name || '', 300) : '');
}

function resolveFooter(template = {}, metadata = {}) {
  const config = template.appearance?.footer;
  const enabled = config ? config.enabled !== false : true;
  if (!enabled) return null;
  const fields = Array.isArray(config?.fields) ? config.fields : ['page_number'];
  const runs = [];
  if (metadata.footer) runs.push(new TextRun(safeString(metadata.footer, 500)));
  if (fields.includes('page_number')) {
    if (runs.length) runs.push(new TextRun('    '));
    runs.push(new TextRun({ children: [PageNumber.CURRENT] }));
  }
  if (!runs.length) return null;
  return new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: runs })] });
}

function answerChildren(slots, content) {
  const out = [p('ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM', { bold: true, heading: HeadingLevel.HEADING_1 })];
  slots.forEach(({ slot }, i) => {
    const q = content[slot.slot_id] || slot.content;
    out.push(p(`${label(slot, i + 1)} Đáp án: ${answerText(q, slot)}`, { bold: true, after: 50 }));
    out.push(p(`Lời giải: ${plain(q?.explanation)}`));
  });
  return out;
}

function manualRegionTextbox({ slot, slotIndex }, content, mode, options) {
  const q = content[slot.slot_id] || slot.content || {};
  const lines = [`${label(slot, slotIndex + 1)} ${plain(q.content || '[Chưa có nội dung]')}`];
  if (Array.isArray(q.options)) q.options.forEach(option => lines.push(`${safeString(option.option_key, 2)}. ${plain(option.option_text)}`));
  if (mode === 'teacher') {
    lines.push(`Đáp án: ${answerText(q, slot)}`, `Lời giải: ${plain(q.explanation)}`);
  } else if (mode !== 'answer_key') {
    const count = Math.min(Math.max(Number(slot.answer_space?.lines || 0), 0), 50);
    if (count && slot.answer_space?.kind !== 'none') lines.push(...Array.from({ length: count }, () => '____________________________________________'));
  }
  const r = slot.manual_region;
  const left = options.width * Number(r.x_pct) / 100;
  const top = options.height * Number(r.y_pct) / 100;
  const width = options.width * Number(r.width_pct) / 100;
  const height = options.height * Number(r.height_pct) / 100;
  const scale = 7.559; // 2x de xuat anh 96 dpi de van doc duoc khi in.
  const canvas = createCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 28px Arial';
  const inset = Math.round(canvas.width * 0.025);
  const lineHeight = 38;
  let y = inset + lineHeight;
  const maxY = canvas.height - inset;
  let overflow = false;
  for (const sourceLine of lines) {
    const words = sourceLine.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > canvas.width - inset * 2) {
        if (y + lineHeight > maxY) { overflow = true; break; }
        ctx.fillText(line, inset, y); y += lineHeight; line = word;
      } else line = candidate;
    }
    if (line && !overflow) {
      if (y + lineHeight > maxY) overflow = true;
      else { ctx.fillText(line, inset, y); y += lineHeight; }
    }
    if (overflow) break;
  }
  const image = canvas.toBuffer('image/png');
  return {
    overflow,
    paragraph: new Paragraph({ children: [new ImageRun({ type: 'png', data: image, transformation: { width: Math.max(1, Math.round(width * 3.7795)), height: Math.max(1, Math.round(height * 3.7795)) }, floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(left * 36000) },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(top * 36000) },
      behindDocument: false, allowOverlap: true, wrap: { type: TextWrappingType.NONE }
    }, altText: { name: `Câu ${slotIndex + 1} tại vùng trả lời`, title: `Câu ${slotIndex + 1}`, description: safeString(lines.join(' ')).slice(0, 500) } })] })
  };
}

async function createTemplateDocx(input) {
  await loadMath();
  const analysis = analyzeTemplateExport(input);
  const { template, content = {}, metadata = {} } = input;
  const { options } = analysis;
  const slots = flatten(template);
  let embeddedBytes = 0;
  async function embedded(assetId) {
    try {
      const image = await loadImageAsset(assetId);
      if (embeddedBytes + image.data.length > 20 * 1024 * 1024) return null;
      embeddedBytes += image.data.length;
      return image;
    } catch { return null; }
  }
  const backgroundConfig = template.appearance?.background;
  const hasPageBackgrounds = options.mode !== 'answer_key' && Array.isArray(backgroundConfig?.pages) && backgroundConfig.pages.length > 0;
  const pageSpecs = backgroundPages(backgroundConfig);
  // Nen trang nhap tu PDF/DOCX la ban goc can doc ro: chi lam nhat anh nen don.
  const pageImages = new Map();
  for (const page of pageSpecs) pageImages.set(Number(page.page_number), await embedded(page.asset_id));
  const backgroundImage = !hasPageBackgrounds && backgroundConfig?.asset_id ? await fadeImage(await embedded(backgroundConfig.asset_id), backgroundConfig.opacity) : null;
  const slotImages = new Map();
  for (const { slot } of slots) {
    if (!Array.isArray(slot.assets)) continue;
    const images = [];
    for (const asset of slot.assets) {
      const image = await embedded(typeof asset === 'string' ? asset : asset?.asset_id);
      if (image) images.push({ image, caption: typeof asset === 'object' ? asset?.caption : '' });
    }
    slotImages.set(slot.slot_id, images);
  }
  const placedSlotIds = new Set(slots.filter(({ slot }) => hasPageBackgrounds && validRegion(slot.manual_region) && pageImages.has(Number(slot.manual_region.page_number)) && pageImages.get(Number(slot.manual_region.page_number))).map(({ slot }) => slot.slot_id));
  const overlayParagraphs = new Map();
  if (hasPageBackgrounds) slots.forEach((item, index) => {
    if (!placedSlotIds.has(item.slot.slot_id)) return;
    const rendered = manualRegionTextbox({ ...item, slotIndex: index }, content, options.mode, options);
    if (rendered.overflow) {
      placedSlotIds.delete(item.slot.slot_id);
    } else {
      const pageNumber = Number(item.slot.manual_region.page_number);
      if (!overlayParagraphs.has(pageNumber)) overlayParagraphs.set(pageNumber, []);
      overlayParagraphs.get(pageNumber).push(rendered.paragraph);
    }
  });
  const children = [];
  if (options.mode !== 'answer_key') {
    if (!hasPageBackgrounds) {
      children.push(p(safeString(metadata.school || ''), { bold: true, after: 60 }));
      children.push(p(safeString(metadata.exam_title || template.display_name || 'Đề kiểm tra'), { bold: true, heading: HeadingLevel.TITLE }));
      children.push(p(`Môn: ${safeString(metadata.subject || template.defaults?.subject)}    Lớp: ${safeString(metadata.grade || template.defaults?.grade)}    Thời gian: ${safeString(metadata.duration_minutes || template.defaults?.duration_minutes)} phút`));
    }
    let previousSection;
    slots.forEach(({ section, slot }, i) => {
      if (placedSlotIds.has(slot.slot_id)) return;
      if (previousSection !== section.section_id) {
        children.push(p(`${safeString(section.title)}${section.declared_points ? ` (${safeString(section.declared_points, 20)} điểm)` : ''}`, { bold: true, heading: HeadingLevel.HEADING_2 }));
        if (section.stimulus) children.push(p(plain(section.stimulus)));
        previousSection = section.section_id;
      }
      const images = slotImages.get(slot.slot_id) || [];
      children.push(...questionChildren(content[slot.slot_id] || slot.content, slot, i + 1, options.mode, images));
    });
  }
  if (options.mode === 'combined' || options.mode === 'answer_key') {
    if (options.mode === 'combined') children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    children.push(...answerChildren(slots, content));
  }
  const headerText = resolveHeaderText(metadata, template);
  const buildHeader = withBackground => {
    const children = [];
    if (withBackground && backgroundImage) children.push(new Paragraph({ children: [new ImageRun({ type: backgroundImage.type, data: backgroundImage.data, transformation: { width: Math.round(options.width * 3.7795), height: Math.round(options.height * 3.7795) }, floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 }, behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE } }, altText: { name: 'Nền đề kiểm tra', title: 'Nền đề kiểm tra', description: 'Nền do người dùng tải lên' } })] }));
    if (headerText) children.push(new Paragraph({ children: [new TextRun(headerText)] }));
    return children.length ? new Header({ children }) : null;
  };
  let headers;
  if (backgroundImage) {
    if (backgroundConfig.apply_to === 'first') {
      headers = { first: buildHeader(true) || new Header({ children: [p('')] }), default: buildHeader(false) || new Header({ children: [p('')] }) };
    } else {
      headers = { default: buildHeader(true) };
    }
  } else {
    const only = buildHeader(false);
    if (only) headers = { default: only };
  }
  const footer = resolveFooter(template, metadata);
  const pageSections = hasPageBackgrounds ? pageSpecs.map(page => {
    const image = pageImages.get(Number(page.page_number));
    const overlays = overlayParagraphs.get(Number(page.page_number)) || [];
    const pageHeaderChildren = [];
    if (image) pageHeaderChildren.push(new Paragraph({ children: [new ImageRun({ type: image.type, data: image.data, transformation: { width: Math.round(options.width * 3.7795), height: Math.round(options.height * 3.7795) }, floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 }, behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE } }, altText: { name: `Nền trang ${page.page_number}`, title: `Nền trang ${page.page_number}`, description: 'Nền nhập từ tài liệu gốc' } })] }));
    if (headerText) pageHeaderChildren.push(new Paragraph({ children: [new TextRun(headerText)] }));
    const pageChildren = [];
    if (Number(page.page_number) === Number(pageSpecs[0]?.page_number) && options.mode !== 'answer_key') {
      pageChildren.push(p(safeString(metadata.school || ''), { bold: true, after: 60 }));
      pageChildren.push(p(safeString(metadata.exam_title || template.display_name || 'Đề kiểm tra'), { bold: true, heading: HeadingLevel.TITLE }));
      pageChildren.push(p(`Môn: ${safeString(metadata.subject || template.defaults?.subject)}    Lớp: ${safeString(metadata.grade || template.defaults?.grade)}    Thời gian: ${safeString(metadata.duration_minutes || template.defaults?.duration_minutes)} phút`));
    }
    pageChildren.push(...(overlays.length ? overlays : [p('')]));
    return {
      properties: { page: { size: { width: twips(options.width), height: twips(options.height) }, margin: Object.fromEntries(Object.entries(options.margins).map(([k, v]) => [k, twips(v)])) }, column: { count: 1, space: twips(7) } },
      headers: pageHeaderChildren.length ? { default: new Header({ children: pageHeaderChildren }) } : undefined,
      footers: footer ? { default: footer } : undefined,
      children: pageChildren
    };
  }) : [];
  const hasMainContent = !hasPageBackgrounds || slots.some(({ slot }) => !placedSlotIds.has(slot.slot_id)) || options.mode === 'answer_key' || options.mode === 'combined';
  const mainSection = {
    properties: { page: { size: { width: twips(options.width), height: twips(options.height) }, margin: Object.fromEntries(Object.entries(options.margins).map(([k, v]) => [k, twips(v)])) }, column: { count: options.columns, space: twips(7) }, titlePage: Boolean(backgroundImage && backgroundConfig.apply_to === 'first') },
    headers,
    // titlePage dung footer rieng cho trang dau: phai gan lai de khong mat so trang.
    footers: footer ? { default: footer, ...(backgroundImage && backgroundConfig.apply_to === 'first' ? { first: resolveFooter(template, metadata) } : {}) } : undefined,
    children
  };
  const document = new Document({ sections: [...pageSections, ...(hasMainContent ? [mainSection] : [])] });
  return { buffer: await Packer.toBuffer(document), analysis };
}

module.exports = { analyzeTemplateExport, createTemplateDocx, normalizeOptions, loadMath };
