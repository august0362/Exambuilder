'use strict';
/**
 * Sinh lai frontend/promptTemplate.js tu Gemini_Prompt_Unified.txt (nguon
 * duy nhat cua prompt). Chay sau khi sua prompt trong file .txt:
 *
 *   node tools/gen-prompt-module.js        (hoac: npm run gen:prompt)
 *
 * - EXAM_PROMPT_TEMPLATE = PHAN 2 (doan promptBuilder.js trich ra, giua 2 moc "===")
 * - EXAM_PROMPT_EXAMPLE  = PHAN 3 (vi du ket qua mau - dong "=PHAN_1..." cuoi cung tro di)
 * Escape "\" -> "\\" de LaTeX ($\frac...$) khong bi template literal an mat dau "\".
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { extractFormatInstructions } = require(path.join(ROOT, 'backend/llm/promptBuilder'));

const txt = fs.readFileSync(path.join(ROOT, 'Gemini_Prompt_Unified.txt'), 'utf8');
const template = extractFormatInstructions();
const example = txt.slice(txt.lastIndexOf('=PHAN_1_TRAC_NGHIEM=')).trim();

if (!template.includes('[CAU_HOI]') || !example.includes('[CAU_HOI]')) {
  console.error('Khong tach duoc PHAN 2 / PHAN 3 - kiem tra lai moc "===" va "(ket thuc PROMPT)" trong .txt');
  process.exit(1);
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const out =
`// TU DONG SINH tu Gemini_Prompt_Unified.txt bang tools/gen-prompt-module.js -- DUNG SUA TAY.
// Nguon duy nhat cua prompt la file .txt o goc du an; sua o do roi chay: npm run gen:prompt
// Tach thanh module de khu "Prompt mau cho AI" trong UI copy 1-click ma khong goi server.
export const EXAM_PROMPT_TEMPLATE = \`${esc(template)}\`;

export const EXAM_PROMPT_EXAMPLE = \`${esc(example)}\`;
`;

fs.writeFileSync(path.join(ROOT, 'frontend/promptTemplate.js'), out);
console.log(`OK -> frontend/promptTemplate.js  (template ${template.length} ky tu, example ${example.length} ky tu)`);
