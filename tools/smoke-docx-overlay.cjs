const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Document, Packer, Paragraph } = require('docx');
const { createCanvas } = require('@napi-rs/canvas');
const { docxToPdf } = require('../backend/documentConvert/docxToPdf');
const { PDFParse } = require('pdf-parse');
const { createTemplateDocx } = require('../backend/templateExport');

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'template-docx-overlay-'));
  const previous = process.env.EXAM_BACKGROUNDS_DIR;
  process.env.EXAM_BACKGROUNDS_DIR = temp;
  try {
    const pages = ['#e8f1ff', '#fff2df'].map((color, i) => {
      const canvas = createCanvas(794, 1123);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 794, 1123);
      ctx.fillStyle = '#333'; ctx.font = '28px Arial'; ctx.fillText(`BACKGROUND PAGE ${i + 1}`, 70, 100);
      ctx.strokeStyle = '#aa0000'; ctx.strokeRect(70, i ? 450 : 180, 500, 170);
      const data = canvas.toBuffer('image/png');
      const sha256 = crypto.createHash('sha256').update(data).digest('hex');
      const asset_id = `image-${sha256}`;
      const filename = `${asset_id}.png`;
      return fs.writeFile(path.join(temp, filename), data).then(() => fs.writeFile(path.join(temp, `${asset_id}.json`), JSON.stringify({ asset_id, filename, mime: 'image/png', size: data.length, sha256 }))).then(() => ({ page_number: i + 1, asset_id }));
    });
    const pageAssets = await Promise.all(pages);
    const template = { template_id: 'smoke.overlay', display_name: 'Overlay smoke', defaults: {}, sections: [{ section_id: 's1', title: 'Câu hỏi', slots: [
      { slot_id: 'q1', points: '1.00', question_type: 'ESSAY', answer_space: { kind: 'blank', lines: 2 }, manual_region: { page_number: 1, x_pct: 10, y_pct: 15, width_pct: 65, height_pct: 20 } },
      { slot_id: 'q2', points: '1.00', question_type: 'ESSAY', answer_space: { kind: 'blank', lines: 2 }, manual_region: { page_number: 2, x_pct: 10, y_pct: 40, width_pct: 65, height_pct: 20 } }
    ] }], appearance: { background: { asset_id: pageAssets[0].asset_id, pages: pageAssets } } };
    const docx = await createTemplateDocx({ template, content: { q1: { content: 'QUESTION ONE IN POSITION' }, q2: { content: 'QUESTION TWO IN POSITION' } }, mode: 'student', maxPages: 1 });
    await fs.writeFile(path.join(temp, 'render-input.docx'), docx.buffer);
    console.log(`DOCX smoke file: ${path.join(temp, 'render-input.docx')}`);
    const pdf = await docxToPdf(docx.buffer);
    const parser = new PDFParse({ data: pdf });
    try {
      const info = await parser.getInfo({ parsePageInfo: false });
      const images = await parser.getScreenshot({ partial: [1, 2], desiredWidth: 960, imageBuffer: true, imageDataUrl: false });
      await fs.writeFile(path.join(temp, 'page-1.png'), images.pages[0].data);
      await fs.writeFile(path.join(temp, 'page-2.png'), images.pages[1].data);
      const maxPageWarning = docx.analysis.warnings.some(warning => warning.code === 'MAX_PAGES_ESTIMATE');
      if (info.total !== 2 || !maxPageWarning || !images.pages[0].data.length || !images.pages[1].data.length) throw new Error('Word PDF render did not preserve both pages or the max-page warning.');
      console.log(JSON.stringify({ pageCount: info.total, maxPageWarning, rasterizedBytes: images.pages.reduce((sum, page) => sum + page.data.length, 0), previews: [path.join(temp, 'page-1.png'), path.join(temp, 'page-2.png')] }));
    } finally { await parser.destroy(); }
  } finally {
    if (previous === undefined) delete process.env.EXAM_BACKGROUNDS_DIR;
    else process.env.EXAM_BACKGROUNDS_DIR = previous;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
