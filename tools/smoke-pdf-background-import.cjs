const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { Document, Packer, Paragraph } = require('docx');
const { docxToPdf } = require('../backend/documentConvert/docxToPdf');
const backgroundRoutes = require('../backend/routes/backgroundRoutes');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-background-smoke-'));
  process.env.EXAM_BACKGROUNDS_DIR = path.join(root, 'images');
  process.env.EXAM_TEMPLATE_ASSETS_DIR = path.join(root, 'documents');
  try {
    const children = [];
    for (let page = 1; page <= 14; page++) children.push(new Paragraph({ text: `PDF BACKGROUND PAGE ${page}`, pageBreakBefore: page > 1 }));
    const docx = await Packer.toBuffer(new Document({ sections: [{ children }] }));
    const pdf = await docxToPdf(docx);
    const app = express(); app.use('/api/backgrounds', backgroundRoutes);
    const response = await request(app).post('/api/backgrounds/import').field('mode', 'background').attach('file', pdf, 'fourteen-pages.pdf');
    if (response.status !== 200) throw new Error(JSON.stringify(response.body));
    if (response.body.background_pages.length !== 14) throw new Error(`Expected 14 rendered pages, got ${response.body.background_pages.length}`);
    const totalBytes = response.body.background_pages.reduce((sum, page) => sum + page.size, 0);
    console.log(JSON.stringify({ pdfBytes: pdf.length, pageCount: response.body.background_pages.length, rasterBytes: totalBytes, firstPage: response.body.background_pages[0], lastPage: response.body.background_pages.at(-1), warnings: response.body.warnings }));
  } finally {
    delete process.env.EXAM_BACKGROUNDS_DIR; delete process.env.EXAM_TEMPLATE_ASSETS_DIR;
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
