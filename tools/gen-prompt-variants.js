'use strict';
/**
 * Sinh lai frontend/promptVariants.js tu AI_Prompts_Variants.txt (nguon rieng
 * cho phan "khac nhau" giua cac nen tang AI: Gemini/Gemini Pro/ChatGPT/DeepSeek/Claude/Grok).
 * Quy tac dinh dang (KHONG lap lai o day) van lay tu Gemini_Prompt_Unified.txt
 * qua backend/llm/promptBuilder.js#extractFormatInstructions -- nguon duy nhat,
 * de moi bien the luon dong bo dinh dang voi TextPromptParser.
 *
 *   node tools/gen-prompt-variants.js        (hoac: npm run gen:prompt)
 *
 * Sua noi dung trong AI_Prompts_Variants.txt roi chay lai lenh tren.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { extractFormatInstructions } = require(path.join(ROOT, 'backend/llm/promptBuilder'));

const SRC_PATH = path.join(ROOT, 'AI_Prompts_Variants.txt');
const OUT_PATH = path.join(ROOT, 'frontend/promptVariants.js');

const txt = fs.readFileSync(SRC_PATH, 'utf8');
const sharedInstructions = extractFormatInstructions();

function lineValue(line, key) {
  if (!line.startsWith(key)) return null;
  return line.slice(key.length).trim();
}

function parseVariant(id, body) {
  const lines = body.split('\n');
  let label = null;
  let hint = null;
  let tipStart = -1;
  let topicIdx = -1;
  let exampleStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (label === null && line.startsWith('LABEL:')) { label = lineValue(line, 'LABEL:'); continue; }
    if (hint === null && line.startsWith('HINT:')) { hint = lineValue(line, 'HINT:'); continue; }
    if (tipStart === -1 && line.trim() === 'TIP:') { tipStart = i + 1; continue; }
    if (topicIdx === -1 && line.startsWith('EXAMPLE_TOPIC:')) { topicIdx = i; continue; }
    if (exampleStart === -1 && line.trim() === 'EXAMPLE:') { exampleStart = i + 1; break; }
  }

  if (label === null || hint === null || tipStart === -1 || topicIdx === -1 || exampleStart === -1) {
    throw new Error(`Khong parse duoc bien the "${id}" trong AI_Prompts_Variants.txt (thieu LABEL/HINT/TIP/EXAMPLE_TOPIC/EXAMPLE)`);
  }

  const tip = lines.slice(tipStart, topicIdx).join('\n').trim();
  const exampleTopic = lineValue(lines[topicIdx], 'EXAMPLE_TOPIC:');
  const example = lines.slice(exampleStart).join('\n').trim();

  const template = `${sharedInstructions}\n\n${tip}`;

  return { id, label, hint, exampleTopic, template, example };
}

const variants = [];
const blockRe = /##### VARIANT: (\w+) #####\r?\n([\s\S]*?)\r?\n##### END #####/g;
let m;
while ((m = blockRe.exec(txt)) !== null) {
  variants.push(parseVariant(m[1], m[2]));
}

if (variants.length === 0) {
  console.error('Khong tim thay bien the nao (kiem tra moc "##### VARIANT: ... #####" / "##### END #####")');
  process.exit(1);
}
for (const v of variants) {
  if (!v.template.includes('[CAU_HOI]') || !v.example.includes('[CAU_HOI]')) {
    console.error(`Bien the "${v.id}": template/example thieu noi dung "[CAU_HOI]" - kiem tra lai`);
    process.exit(1);
  }
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const entries = variants.map(v => `  {
    id: ${JSON.stringify(v.id)},
    label: ${JSON.stringify(v.label)},
    hint: ${JSON.stringify(v.hint)},
    exampleTopic: ${JSON.stringify(v.exampleTopic)},
    template: \`${esc(v.template)}\`,
    example: \`${esc(v.example)}\`,
  }`).join(',\n');

const out =
`// TU DONG SINH tu AI_Prompts_Variants.txt bang tools/gen-prompt-variants.js -- DUNG SUA TAY.
// Nguon rieng (intro/tip/vi du) la AI_Prompts_Variants.txt o goc du an; quy tac dinh dang dung
// chung van lay tu Gemini_Prompt_Unified.txt. Sua o do roi chay: npm run gen:prompt
export const AI_PROMPT_VARIANTS = [
${entries}
];
`;

fs.writeFileSync(OUT_PATH, out);
console.log(`OK -> frontend/promptVariants.js  (${variants.length} bien the: ${variants.map(v => v.id).join(', ')})`);
