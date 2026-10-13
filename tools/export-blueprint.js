#!/usr/bin/env node
/**
 * Quet file duoc git track va file moi chua stage (ton trong .gitignore)
 * va xuat thanh 1 file documents/PROJECT_BLUEPRINT.md duy nhat: metadata, cay thu muc,
 * noi dung file cau hinh, va toan bo source code.
 *
 * Luon doc truc tiep tu file that tren dia nen khong bao gio bi lech du lieu -
 * chay lai script nay bat cu luc nao can ban snapshot moi, khong can dong bo tay.
 *
 *   node tools/export-blueprint.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'documents', 'PROJECT_BLUEPRINT.md');

// File tu dong sinh, qua lon, khong mang thong tin "source" (tai lap duoc
// bang npm install tu package.json) - khong nhung noi dung, chi ghi chu.
const EXCLUDE_FROM_DUMP = new Set(['package-lock.json']);

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.jar', '.apk', '.keystore', '.jks', '.woff', '.woff2', '.ttf', '.otf']);

const LANG_MAP = {
  '.js': 'javascript', '.cjs': 'javascript', '.mjs': 'javascript',
  '.json': 'json', '.html': 'html', '.css': 'css', '.md': 'markdown',
  '.kt': 'kotlin', '.kts': 'kotlin', '.xml': 'xml', '.properties': 'properties',
  '.txt': 'text', '.bat': 'batch', '.pro': 'text', '.gradle': 'groovy'
};

function getTrackedFiles() {
  const out = execSync('git ls-files --cached --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' });
  return [...new Set(out.split('\n').map(l => l.trim()).filter(Boolean))]
    .filter(f => f !== 'documents/PROJECT_BLUEPRINT.md');
}

function isBinaryFile(f) {
  return BINARY_EXT.has(path.extname(f).toLowerCase());
}

function isConfigFile(f) {
  const base = path.basename(f);
  if (base === 'package.json' || base === '.gitignore' || base === 'babel.config.cjs') return true;
  if (f.startsWith('Exam builder for adr/')) {
    if (base.endsWith('.gradle.kts') || base === 'proguard-rules.pro') return true;
    if (base === 'gradle.properties' || base === 'gradle-wrapper.properties') return true;
    if (base === 'AndroidManifest.xml') return true;
    if (f.includes('/res/values/') || f.includes('/res/xml/') || f.includes('/mipmap-anydpi')) return true;
  }
  return false;
}

function langFor(f) {
  if (path.basename(f) === '.gitignore') return 'text';
  return LANG_MAP[path.extname(f).toLowerCase()] || '';
}

// Fence dai hon so voi run backtick dai nhat co trong content, de khong bi
// "vo tinh dong fence som" khi 1 file source chua san vi du code markdown.
function fenceFor(content) {
  const runs = content.match(/`+/g) || [];
  const maxRun = runs.reduce((m, s) => Math.max(m, s.length), 0);
  return '`'.repeat(Math.max(3, maxRun + 1));
}

function renderFile(f) {
  const abs = path.join(ROOT, f);
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    return `### FILE: ${f}\n\n> Khong doc duoc file: ${err.message}\n\n`;
  }
  const fence = fenceFor(content);
  const lang = langFor(f);
  return `### FILE: ${f}\n\n${fence}${lang}\n${content}\n${fence}\n\n`;
}

function buildTree(files) {
  const root = {};
  for (const f of files) {
    const parts = f.split('/');
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = null; // file = leaf
      } else {
        node[part] = node[part] || {};
        node = node[part];
      }
    });
  }
  const lines = ['.'];
  (function walk(node, prefix) {
    const keys = Object.keys(node).sort((a, b) => {
      const aDir = node[a] !== null, bDir = node[b] !== null;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.localeCompare(b);
    });
    keys.forEach((key, idx) => {
      const isLast = idx === keys.length - 1;
      const isDir = node[key] !== null;
      lines.push(prefix + (isLast ? '└── ' : '├── ') + key + (isDir ? '/' : ''));
      if (isDir) walk(node[key], prefix + (isLast ? '    ' : '│   '));
    });
  })(root, '');
  return lines.join('\n');
}

function buildMetadata(pkg) {
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});
  const scripts = Object.entries(pkg.scripts || {}).map(([k, v]) => `- \`npm run ${k}\` → ${v}`).join('\n');
  return `# METADATA

- **Ten du an**: ${pkg.name}
- **Mo ta**: ${pkg.description || '(khong co)'}
- **Phien ban**: ${pkg.version}
- **Tech stack**: Node.js + Express (backend REST API, SQLite qua \`sqlite\`/\`sqlite3\`) · Frontend HTML/CSS/JS thuan (khong framework) · Android app (Kotlin + Jetpack Compose) trong \`Exam builder for adr/\`
- **Dependencies**: ${deps.join(', ')}
- **Dev dependencies**: ${devDeps.join(', ')}

## Cai dat & chay (web app)

\`\`\`bash
npm install
npm start                # chay server: http://localhost:3000 (mac dinh PORT=3000)
npm test                 # chay toan bo test (Jest)
npm run test:coverage    # test + bao cao coverage cho thu muc backend/
\`\`\`

Cac lenh npm khac dinh nghia trong package.json:
${scripts}

Bien moi truong: \`PORT\` (mac dinh 3000), \`EXAM_DB_PATH\` (mac dinh \`backend/exam.db\`, tu tao khi chay lan dau).

## Android app (\`Exam builder for adr/\`)

Mo bang Android Studio hoac build CLI bang Gradle wrapper trong thu muc do. Can JDK 24 (khong dung JBR Java 25 di kem Android Studio) - xem \`Exam builder for adr/README.md\`.

`;
}

function main() {
  const files = getTrackedFiles();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const configFiles = files.filter(f => isConfigFile(f));
  const binaryFiles = files.filter(f => !isConfigFile(f) && isBinaryFile(f));
  const sourceFiles = files.filter(f => !isConfigFile(f) && !isBinaryFile(f) && !EXCLUDE_FROM_DUMP.has(f));

  let md = '';
  md += buildMetadata(pkg);

  md += `# DIRECTORY TREE\n\n\`\`\`\n${buildTree(files)}\n\`\`\`\n\n`;

  md += `# CONFIG FILES\n\n`;
  for (const f of configFiles) md += renderFile(f);
  if (EXCLUDE_FROM_DUMP.size) {
    md += `> File sau KHONG nhung noi dung (tu dong sinh boi npm, tai lap chinh xac qua \`npm install\` tu package.json, qua lon de nhung ben duoi): ${[...EXCLUDE_FROM_DUMP].join(', ')}\n\n`;
  }

  md += `# SOURCE CODE\n\n`;
  for (const f of sourceFiles) md += renderFile(f);

  if (binaryFiles.length) {
    md += `# BINARY FILES (khong nhung noi dung nhi phan, chi liet ke duong dan)\n\n`;
    for (const f of binaryFiles) md += `- ${f}\n`;
    md += '\n';
  }

  fs.writeFileSync(OUTPUT, md, 'utf8');
  console.log(`Da tao ${path.relative(ROOT, OUTPUT)}`);
  console.log(`  Tong file trong snapshot (track + moi): ${files.length}`);
  console.log(`  File config: ${configFiles.length}, File source nhung noi dung: ${sourceFiles.length}, File nhi phan (chi liet ke): ${binaryFiles.length}`);
  console.log(`  Dung luong: ${(Buffer.byteLength(md, 'utf8') / 1024).toFixed(0)} KB`);
}

main();
