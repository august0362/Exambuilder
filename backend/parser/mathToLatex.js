// "Nang cap" moi cau truc toan 2 CHIEU (can, phan so, can bac n, luy thua
// chong...) nam NGOAI $...$ thanh cong thuc LaTeX $...$ chuan, de KaTeX
// (web) / JLaTeXMath (Android) ve THAT - moc can co net gach ngang
// (vinculum) keo het toan hang, phan so co gach ngang that. Ky hieu 1 hang
// (x^2, <=, ×, do, chu Hy Lap) GIU NGUYEN dang ASCII/Unicode -
// formatMathSymbols() lo phan lam dep do sau.
//
// Ham chinh: promoteStructuralMath(text) - IDEMPOTENT (chay lai khong doi
// them), coi moi cum $...$ / $$...$$ co san la khoi kin (khong dung vao).
//
// Ban port Kotlin: "Exam builder for adr/app/.../math/MathConvert.kt"
// (MathConvert.promoteStructuralMath) - giu 2 ben dong bo tung buoc.

import { findMatchingParen } from './mathRadical.js';
import { isLikelyFraction } from './mathFraction.js';

const SUP_TO_DIGIT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

// ---------------------------------------------------------------------------
// Tien ich chung
// ---------------------------------------------------------------------------

// Dau "}" khop voi dau "{" tai openIndex (co tinh long nhau).
function matchBrace(s, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Bo dung 1 lop $...$ bao ngoai (neu co) va 1 lop (...) bao tron ngoai.
function unwrap(term) {
  let s = String(term).trim();
  const dollar = /^\$([\s\S]*)\$$/.exec(s);
  if (dollar) s = dollar[1].trim();
  if (s.startsWith('(') && findMatchingParen(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
  return s;
}

// Chuoi "tho" (bo $ va ngoac) de dua vao isLikelyFraction.
function plainOf(term) {
  return unwrap(term);
}

// ---------------------------------------------------------------------------
// bareToLatex: doi 1 bieu thuc toan tho (KHONG con $) sang than LaTeX -
// dung cho noi dung ben trong \sqrt{...} va 2 ve cua \frac{...}{...}.
// ---------------------------------------------------------------------------

function replaceSqrtCalls(s) {
  const m = /\\?sqrt\s*\(/i.exec(s);
  if (!m) return s;
  const open = s.indexOf('(', m.index);
  const close = findMatchingParen(s, open);
  if (close < 0) {
    const cut = m.index + m[0].length;
    return s.slice(0, cut) + replaceSqrtCalls(s.slice(cut));
  }
  const inner = bareToLatex(s.slice(open + 1, close));
  return s.slice(0, m.index) + `\\sqrt{${inner}}` + replaceSqrtCalls(s.slice(close + 1));
}

const RADICAL_RE = /([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([√∛∜])/;

function replaceUnicodeRadicals(s) {
  const m = RADICAL_RE.exec(s);
  if (!m) return s;
  const [full, sup, sym] = m;
  const after = m.index + full.length;
  let index = sym === '∛' ? '3' : sym === '∜' ? '4' : null;
  if (sup) index = [...sup].map(c => SUP_TO_DIGIT[c]).join('');

  let inner = null;
  let end = after;
  if (s[after] === '(') {
    const close = findMatchingParen(s, after);
    if (close >= 0) { inner = bareToLatex(s.slice(after + 1, close)); end = close + 1; }
  } else {
    const dm = /^([0-9]+|[A-Za-z])/.exec(s.slice(after));
    if (dm) { inner = bareToLatex(dm[1]); end = after + dm[1].length; }
  }
  if (inner === null) {
    // Dau can don le khong co toan hang - giu nguyen ky tu, di tiep.
    return s.slice(0, after) + replaceUnicodeRadicals(s.slice(after));
  }
  const body = `\\sqrt${index ? `[${index}]` : ''}{${inner}}`;
  return s.slice(0, m.index) + body + replaceUnicodeRadicals(s.slice(end));
}

// ² ³ ... -> ^{2} ; ^12 -> ^{12} ; ^x -> ^{x} ; ^{...} giu nguyen.
function liftSuperscripts(s) {
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, run => `^{${[...run].map(c => SUP_TO_DIGIT[c]).join('')}}`);
  s = s.replace(/\^(?!\{)([0-9]+|[A-Za-z])/g, '^{$1}');
  return s;
}

function bareToLatex(expr) {
  let s = unwrap(expr);
  if (!s) return '';
  // Ket qua LUON di vao trong 1 cum $...$ -> moi dau $ con sot lai (delimiter
  // cua cac cum con da duoc gop) phai bi bo, neu khong se sinh ra "$$" hong.
  s = s.replace(/\$/g, '');
  if (!s.trim()) return '';
  s = replaceSqrtCalls(s);
  s = replaceUnicodeRadicals(s);
  s = convertInnerFractions(s);
  s = liftSuperscripts(s);
  s = s
    .replace(/\s*\*\s*/g, ' \\times ')
    .replace(/×/g, ' \\times ').replace(/÷/g, ' \\div ').replace(/·/g, ' \\cdot ')
    .replace(/±/g, ' \\pm ').replace(/∓/g, ' \\mp ')
    .replace(/≤/g, ' \\le ').replace(/≥/g, ' \\ge ').replace(/≠/g, ' \\ne ');
  return s.replace(/\s{2,}/g, ' ').trim();
}

// Phan so ben TRONG mot bieu thuc da la LaTeX body (khong boc $, tra ve
// \frac{...}{...}). Chi bat dang "gon / gon" khong khoang trang.
const INNER_TERM = String.raw`\([^()]*\)|\\sqrt(?:\[[0-9]+\])?\{[^{}]*\}|[0-9A-Za-z.^{}]+`;
function convertInnerFractions(s) {
  const re = new RegExp(`(${INNER_TERM})\\/(${INNER_TERM})`);
  let prev = null;
  while (prev !== s) {
    prev = s;
    s = s.replace(re, (full, a, b) => {
      if (!isLikelyFraction(unwrap(a), unwrap(b))) return full;
      return `\\frac{${bareToLatex(a)}}{${bareToLatex(b)}}`;
    });
  }
  return s;
}

// ---------------------------------------------------------------------------
// promoteStructuralMath: boc cau truc thanh $...$
// ---------------------------------------------------------------------------

const DOLLAR_SPAN = /\$\$[^$]*\$\$|\$[^$]+\$/g;

function splitProtected(text) {
  const parts = [];
  let last = 0;
  DOLLAR_SPAN.lastIndex = 0;
  let m;
  while ((m = DOLLAR_SPAN.exec(text)) !== null) {
    if (m.index > last) parts.push({ math: false, value: text.slice(last, m.index) });
    parts.push({ math: true, value: m[0] });
    last = DOLLAR_SPAN.lastIndex;
  }
  if (last < text.length) parts.push({ math: false, value: text.slice(last) });
  return parts;
}

// Buoc 1: \sqrt{...}, \sqrt[n]{...}, \frac{...}{...} (da la LaTeX hop le) ->
// chi them dau $...$, KHONG bien doi noi dung.
function wrapLatexCommands(s) {
  const m = /\\(?:sqrt|dfrac|tfrac|frac)\b/.exec(s);
  if (!m) return s;
  const start = m.index;
  const name = /^\\(sqrt|dfrac|tfrac|frac)/.exec(s.slice(start))[1];
  const nArgs = name === 'sqrt' ? 1 : 2;
  let i = start + m[0].length;
  if (name === 'sqrt' && s[i] === '[') {
    const rb = s.indexOf(']', i);
    if (rb < 0) return s.slice(0, i) + wrapLatexCommands(s.slice(i));
    i = rb + 1;
  }
  for (let a = 0; a < nArgs; a++) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== '{') return s.slice(0, i) + wrapLatexCommands(s.slice(i));
    const rb = matchBrace(s, i);
    if (rb < 0) return s.slice(0, i) + wrapLatexCommands(s.slice(i));
    i = rb + 1;
  }
  // Hut them "^{...}" / "^x" / "_{...}" bam ngay sau (vd (\sqrt{a})^2 viet tho).
  const tail = /^(?:\s*[\^_](?:\{[^{}]*\}|[A-Za-z0-9]))+/.exec(s.slice(i));
  if (tail) i += tail[0].length;
  const wrapped = '$' + s.slice(start, i).trim() + '$';
  return s.slice(0, start) + wrapped + wrapLatexCommands(s.slice(i));
}

// Buoc 2: sqrt(...) ASCII -> $\sqrt{...}$
function wrapSqrtCalls(s) {
  const m = /\\?sqrt\s*\(/i.exec(s);
  if (!m) return s;
  const open = s.indexOf('(', m.index);
  const close = findMatchingParen(s, open);
  if (close < 0) {
    const cut = m.index + m[0].length;
    return s.slice(0, cut) + wrapSqrtCalls(s.slice(cut));
  }
  const inner = bareToLatex(s.slice(open + 1, close));
  return s.slice(0, m.index) + `$\\sqrt{${inner}}$` + wrapSqrtCalls(s.slice(close + 1));
}

// Buoc 3: √.. / ∛.. / ∜.. / ⁿ√.. (Unicode) -> $\sqrt[n]{...}$
function wrapUnicodeRadicals(s) {
  const m = RADICAL_RE.exec(s);
  if (!m) return s;
  const [full, sup, sym] = m;
  const after = m.index + full.length;
  let index = sym === '∛' ? '3' : sym === '∜' ? '4' : null;
  if (sup) index = [...sup].map(c => SUP_TO_DIGIT[c]).join('');

  let inner = null;
  let end = after;
  if (s[after] === '(') {
    const close = findMatchingParen(s, after);
    if (close >= 0) { inner = bareToLatex(s.slice(after + 1, close)); end = close + 1; }
  } else {
    const dm = /^([0-9]+|[A-Za-z])/.exec(s.slice(after));
    if (dm) { inner = bareToLatex(dm[1]); end = after + dm[1].length; }
  }
  if (inner === null) return s.slice(0, after) + wrapUnicodeRadicals(s.slice(after));

  const body = `$\\sqrt${index ? `[${index}]` : ''}{${inner}}$`;
  return s.slice(0, m.index) + body + wrapUnicodeRadicals(s.slice(end));
}

// Buoc 4: he so dung truoc cum $...$ ("2$\sqrt{3}$" -> "$2\sqrt{3}$"). Chi
// hut khi cum $...$ ngay sau la cong thuc (bat dau bang "\") - tranh dinh
// vao dau "$" DONG cua mot cum co san (vd "...\ge 0$ va $\sqrt{a}$").
function absorbLeadingCoefficient(s) {
  return s.replace(
    /(^|[^\\A-Za-z0-9$])([0-9]+)\$(\\[^$]+)\$/g,
    (_, pre, coef, body) => `${pre}$${coef}${body}$`
  );
}

// Buoc 5: ngoac don om sat cum $...$ ("($2\sqrt{3}$)" -> "$(2\sqrt{3})$").
// Chi hut khi phan ngoai cum $...$ (con lai trong ngoac) TOAN so + toan tu -
// khong co chu cai, tranh nuot chu tieng Viet (vd "(cho √x)").
function absorbHuggingParens(s) {
  return s.replace(/\(([-+0-9\s*×÷·]*)\$([^$]+)\$([-+0-9\s*×÷·]*)\)/g, (full, a, body, b) => {
    const left = bareToLatex(a);
    const right = bareToLatex(b);
    return `$(${[left, body, right].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim()})$`;
  });
}

// Buoc 6: phan so bac ngang qua cac cum $...$ ("$\sqrt{80}$ / $\sqrt{5}$"
// -> "$\frac{\sqrt{80}}{\sqrt{5}}$"; "2 / $\sqrt{3}$" -> "$\frac{2}{\sqrt{3}}$").
const FRAC_TERM = String.raw`\$[^$]+\$|\([^()]*\)|[0-9A-Za-z][0-9A-Za-z.]*|[⁰¹²³⁴⁵⁶⁷⁸⁹]+`;
function mergeFractions(s) {
  // Bien "chu cai" o 2 dau (ke ca chu co dau tieng Viet) chan viec cat 1 tu
  // xuoi lam ve phan so (vd "phương án" -> "ph" / "..." ).
  const re = new RegExp(
    `(?<![\\p{L}\\p{M}])(${FRAC_TERM})(\\s{0,2})\\/(\\s{0,2})(${FRAC_TERM})(?![\\p{L}\\p{M}])`,
    'gu'
  );
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    const [full, num, ws1, ws2, den] = m;
    const spaced = (ws1 + ws2).length > 0;
    const strong = /^[$(]/.test(num) || /^[$(]/.test(den);
    const ok = isLikelyFraction(plainOf(num), plainOf(den)) && (!spaced || strong);
    if (!ok) {
      re.lastIndex = m.index + num.length + 1;
      continue;
    }
    out += s.slice(last, m.index) + `$\\frac{${bareToLatex(num)}}{${bareToLatex(den)}}$`;
    last = m.index + full.length;
    re.lastIndex = last;
  }
  return out + s.slice(last);
}

// Buoc 7: gop cac cum $...$ ke nhau chi cach nhau boi toan tu / khoang trang
// (KHONG co chu cai) thanh 1 cum -> KaTeX ve 1 lan, baseline dong nhat.
function mergeAdjacentSpans(s) {
  // Ngan cach chi duoc la khoang trang HOAC dung 1 toan tu toan hoc (khong
  // dau cau "," ";" ":" - nhung dau do thuong la van xuoi tieng Viet).
  const re = /\$([^$]+)\$([ \t]+|[ \t]*[-+=*×÷·][ \t]*)\$([^$]+)\$/;
  let prev = null;
  while (prev !== s) {
    prev = s;
    s = s.replace(re, (_, a, sep, b) => {
      const op = sep.replace(/\*/g, ' \\times ').replace(/×/g, ' \\times ')
        .replace(/÷/g, ' \\div ').replace(/·/g, ' \\cdot ').trim();
      return `$${a.trim()}${op ? ` ${op} ` : ' '}${b.trim()}$`;
    });
  }
  return s;
}

function onePass(text) {
  const promoted = splitProtected(text)
    .map(p => {
      if (p.math) return p.value;
      let s = p.value;
      s = wrapLatexCommands(s);
      s = wrapSqrtCalls(s);
      s = wrapUnicodeRadicals(s);
      return s;
    })
    .join('');
  let s = absorbLeadingCoefficient(promoted);
  s = absorbHuggingParens(s);
  s = mergeFractions(s);
  s = mergeAdjacentSpans(s);
  return s;
}

/**
 * Boc moi cau truc toan 2 chieu ngoai $...$ thanh $...$ LaTeX. Idempotent.
 */
export function promoteStructuralMath(text) {
  if (typeof text !== 'string' || !text) return text;
  let result = text;
  for (let i = 0; i < 6; i++) {
    const next = onePass(result);
    if (next === result) return next;
    result = next;
  }
  return result;
}
