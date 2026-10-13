const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);
const SCRIPT = path.join(__dirname, '..', '..', 'tools', 'docx-to-pdf.ps1');

async function docxToPdf(buffer) {
  if (process.platform !== 'win32') throw new Error('Chuyển DOCX thành PDF cần Microsoft Word trên Windows.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'exam-docx-render-'));
  const input = path.join(directory, 'source.docx');
  const output = path.join(directory, 'rendered.pdf');
  try {
    await fs.writeFile(input, buffer, { flag: 'wx' });
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-InputPath', input, '-OutputPath', output], {
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 1024 * 1024
    });
    const pdf = await fs.readFile(output);
    if (pdf.length < 8 || pdf.toString('ascii', 0, 5) !== '%PDF-') throw new Error('Microsoft Word không tạo PDF hợp lệ.');
    return pdf;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { docxToPdf };
