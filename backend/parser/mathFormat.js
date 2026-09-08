import { promoteStructuralMath } from './mathToLatex.js';

const SUPERSCRIPT_DIGITS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const GREEK_LETTERS = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', pi: 'π', phi: 'φ', lambda: 'λ', mu: 'μ', omega: 'ω' };
const GREEK_CHARS = Object.values(GREEK_LETTERS).join('');
const TRIG_NAMES = 'arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln';
const toSuperscript = digits => digits.split('').map(d => SUPERSCRIPT_DIGITS[d]).join('');
const wrapIfExpression = s => (/[+-]/.test(s) ? `(${s})` : s);
// Noi dung duoi dau can: so nguyen thuan tuy (vi du "16", "37") khong can
// ngoac vi khong co gi gay nham lan khi doc lien "√16". Bieu thuc phuc tap
// hon (co chu, phep toan, can long nhau...) thi bat buoc boc trong ngoac
// don "√(...)" - dung form chuan toan hoc, khong dung dau combining overline
// (U+0305) ghep tung ky tu vi ky tu do hien thi be, dinh lien vao chu so o
// nhieu font/trinh duyet, gay loi "gach ngang dinh vao so".
const wrapSqrtContent = s => (/^[0-9]+$/.test(s) ? s : `(${s})`);
// Can bac n (\sqrt[3]{x}, \sqrt[4]{x}...): dung ky tu Unicode dung san cho
// bac 3/4 (∛/∜ - khong phai combining nen an toan nhu √), con bac khac thi
// ghep chu so tren truoc dau √ (vd "⁵√") theo quy uoc toan hoc pho bien.
const ROOT_INDEX_SYMBOLS = { 2: '√', 3: '∛', 4: '∜' };
const rootSymbolFor = n => ROOT_INDEX_SYMBOLS[n] || toSuperscript(n) + '√';

// Cac cap thay the theo dung thu tu: chuoi dai/dac hieu hon (hoac phu thuoc
// vao ket qua cua buoc truoc) phai duoc xu ly truoc. Cac lenh LaTeX
// (\frac, \sqrt, \widehat...) duoc go trước de khi \frac{...}{...} bat noi
// dung ben trong dau ngoac nhon thi noi dung do da la Unicode sach (vi du
// \frac{\sin \alpha}{\cos \alpha} can \sin/\alpha duoc doi truoc).
const SYMBOL_REPLACEMENTS = [
  // --- LaTeX: cac lenh khong can noi dung (bo qua) ---
  [/\\left/g, ''],
  [/\\right/g, ''],

  // --- LaTeX: chu cai Hy Lap ---
  [/\\(alpha|beta|gamma|delta|theta|pi|phi|lambda|mu|omega)\b/g, (_, w) => GREEK_LETTERS[w]],

  // --- LaTeX: ham luong giac / log (bo dau \, giu ten ham) ---
  [/\\(arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln|lim|min|max|exp)\b/g, '$1'],

  // --- Nhan ngam (implicit multiplication): trong LaTeX "\alpha\cos" hop le
  // vi dau \ phan tach 2 lenh, nhung sau khi bo dau \ o tren thi 2 token bi
  // dinh lien thanh "αcos" khong con ranh gioi. Chen dau "." (chuan sach
  // giao khoa VN, vi du "AH = AB.sin B") vao giua 1 ky tu Hy Lap/chu so/
  // dau ")" va ten ham luong giac/log ngay sau no de de doc hon. ---
  [new RegExp(`([${GREEK_CHARS}0-9)])(${TRIG_NAMES})\\b`, 'g'), '$1.$2'],

  // --- LaTeX: phep nhan/chia ---
  [/\\cdot\b/g, '×'],
  [/\\times\b/g, '×'],
  [/\\div\b/g, '÷'],
  [/\\pm\b/g, '±'],
  [/\\mp\b/g, '∓'],

  // --- LaTeX: quan he so sanh / suy ra / tap hop (dang lenh, ung voi cac
  // dang ASCII => <= >= != da co san ben duoi) ---
  [/\\ge\b/g, '≥'],
  [/\\le\b/g, '≤'],
  [/\\ne\b/g, '≠'],
  [/\\Leftrightarrow\b/g, '⇔'],
  [/\\Rightarrow\b/g, '⇒'],
  [/\\Leftarrow\b/g, '⇐'],
  [/\\to\b/g, '→'],
  [/\\in\b/g, '∈'],
  [/\\notin\b/g, '∉'],

  // --- LaTeX: \mathbb{X} -> chu Unicode "chu dam bang" cho cac tap so quen
  // thuoc (R, N, Z, Q, C); chu khac thi giu nguyen chu ben trong (nhu \text{}) ---
  [/\\mathbb\{([^{}]*)\}/g, (_, x) => ({ R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' }[x] || x)],

  // --- LaTeX: do (^\circ hoac ^{\circ} hoac \circ don le) ---
  [/\^\{?\\circ\}?/g, '°'],
  [/\\circ\b/g, '°'],

  // --- LaTeX: \text{...} chi giu lai noi dung ben trong ---
  [/\\text\{([^{}]*)\}/g, '$1'],

  // --- LaTeX: \widehat{X} -> X voi dau mu ket hop (vi du "B" -> "B̂") ---
  [/\\widehat\{([^{}]*)\}/g, (_, x) => x + '̂'],

  // --- LaTeX: can bac n (\sqrt[3]{x}, \sqrt[5]{x}...) - phai xu ly truoc
  // \sqrt{...} thuong vi cung bat dau bang "\sqrt" ---
  [/\\sqrt\[([0-9]+)\]\{([^{}]*)\}/g, (_, n, x) => rootSymbolFor(n) + wrapSqrtContent(x)],

  // --- LaTeX: can bac hai (√ + so nguyen thuan, hoac √(...) neu la bieu thuc) ---
  [/\\sqrt\{([^{}]*)\}/g, (_, x) => '√' + wrapSqrtContent(x)],

  // --- LaTeX: phan so \frac{tu}{mau} -> tu/mau (ngoac lai neu co +/-) ---
  [/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, num, den) => `${wrapIfExpression(num)}/${wrapIfExpression(den)}`],

  // --- LaTeX: bo dau $ bao quanh cong thuc (khong render LaTeX that) ---
  [/\$/g, ''],

  // --- ASCII go tay: chuoi dai truoc chuoi ngan (<=> truoc <= va =>) ---
  [/<=>/g, '⇔'],
  [/<->/g, '↔'],
  [/=>/g, '⇒'],
  [/->/g, '→'],
  [/<=/g, '≤'],
  [/>=/g, '≥'],
  [/!=/g, '≠'],
  [/\+-/g, '±'],
  [/sqrt\(/gi, '√('],
  [/\b(mm|cm|dm|km|m)([0-9])\b/gi, (_, unit, digit) => unit + SUPERSCRIPT_DIGITS[digit]],
  [/\^([0-9]+)/g, (_, digits) => toSuperscript(digits)],
  [/([a-zA-Z0-9)])\s*\*\s*([a-zA-Z0-9(])/g, '$1 × $2']
];

function applyReplacements(text) {
  // Chay lap den khi ket qua khong doi them (fixed point): can bac hai long
  // nhau (\sqrt{...\sqrt{...}...}) can nhieu luot vi 1 luot chi giai duoc
  // lop can trong cung, lop can ngoai chi "sach" (het dau ngoac nhon) sau
  // khi lop trong da duoc thay the o luot truoc do.
  let result = text;
  for (let i = 0; i < 5; i++) {
    const next = SYMBOL_REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), result);
    if (next === result) return next;
    result = next;
  }
  return result;
}

/**
 * Doi TOAN BO ky hieu toan hoc (ke ca ben trong $...$) sang ky tu Unicode
 * phang, dung cho noi dung KHONG the render LaTeX that (vd file Word xuat
 * ra bang thu vien "docx" - chi la text tinh, khong co KaTeX). Day chinh la
 * hanh vi day du cua formatMathSymbols() truoc khi co KaTeX; gach ngang cua
 * can/phan so o day chi la ky tu/dau ngoac, khong phai net ve that.
 */
export function latexToPlainText(text) {
  if (typeof text !== 'string' || !text) return text;
  return applyReplacements(text);
}

const MATH_SPAN_RE = /\$[^$]*\$/g;

/**
 * Doi cac ky hieu toan hoc go tay bang ASCII (>=, <=>, ^2, sqrt(...), m3...)
 * ben NGOAI dau $...$ sang Unicode, con phan LaTeX BEN TRONG $...$ thi GIU
 * NGUYEN VEN (ke ca dau $) de tang hien thi (renderMathInline trong
 * script.js) dua vao KaTeX ve that - KaTeX can cu phap LaTeX goc (\sqrt,
 * \frac long nhau tuy y...) chu khong phai chuoi Unicode da bi "lam phang"
 * mat het cau truc long nhau (day chinh la nguyen nhan cac loi can/phan so
 * ghep sai truoc day: 2 buoc doan mau bang regex giam chan nhau tren cung 1
 * chuoi phang). Neu can ban Unicode/plain-text day du (vd xuat file Word),
 * dung latexToPlainText() thay vi ham nay.
 */
export function formatMathSymbols(text) {
  if (typeof text !== 'string' || !text) return text;

  // Buoc 1: boc moi cau truc toan 2 chieu (can, phan so, can bac n...) nam
  // ngoai $...$ thanh $...$ LaTeX chuan (xem mathToLatex.js). Sau buoc nay
  // ky hieu can/phan so KHONG con o dang Unicode "lam phang" o vung van xuoi
  // - chung da la LaTeX trong $...$ de KaTeX/JLaTeXMath ve that.
  const promoted = promoteStructuralMath(text);

  // Buoc 2: lam dep cac ky hieu 1 HANG con lai (^2 -> ², <= -> ≤, a*b ->
  // a×b, \alpha -> α...) - CHI o vung ngoai $...$; phan trong $...$ giu
  // nguyen ven cho KaTeX.
  let result = '';
  let lastIndex = 0;
  let match;
  MATH_SPAN_RE.lastIndex = 0;
  while ((match = MATH_SPAN_RE.exec(promoted)) !== null) {
    if (match.index > lastIndex) result += applyReplacements(promoted.slice(lastIndex, match.index));
    result += match[0];
    lastIndex = MATH_SPAN_RE.lastIndex;
  }
  result += applyReplacements(promoted.slice(lastIndex));
  return result;
}
