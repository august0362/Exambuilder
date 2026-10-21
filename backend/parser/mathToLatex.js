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
// Ban port Kotlin: "Exam builder for adr/app/.../math/MathPromote.kt"
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

// Cac ham "tim -> thay -> xu ly phan con lai" duoi day viet bang vong lap, KHONG
// de quy tren phan con lai: 10.000 lan xuat hien "sqrt(" se lam tran stack.

// sqrt(...) ASCII tai vi tri m: { out, rest } - out da xu ly, rest con lai.
function sqrtCallAt(s, m, wrap) {
  const open = s.indexOf('(', m.index);
  const close = findMatchingParen(s, open);
  if (close < 0) {
    const cut = m.index + m[0].length;
    return { out: s.slice(0, cut), rest: s.slice(cut) };
  }
  const inner = bareToLatex(s.slice(open + 1, close));
  return { out: s.slice(0, m.index) + wrap(`\\sqrt{${inner}}`), rest: s.slice(close + 1) };
}

function replaceSqrtCalls(s) {
  let out = '';
  for (let m; (m = /\\?sqrt\s*\(/i.exec(s)); ) {
    const r = sqrtCallAt(s, m, body => body);
    out += r.out;
    s = r.rest;
  }
  return out + s;
}

const RADICAL_RE = /([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([√∛∜])/;

// Dau can Unicode tai vi tri m: { out, rest }. Dau can don le khong co toan
// hang - giu nguyen ky tu, di tiep.
function radicalAt(s, m, wrap) {
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
  if (inner === null) return { out: s.slice(0, after), rest: s.slice(after) };
  const body = `\\sqrt${index ? `[${index}]` : ''}{${inner}}`;
  return { out: s.slice(0, m.index) + wrap(body), rest: s.slice(end) };
}

function replaceUnicodeRadicals(s) {
  let out = '';
  for (let m; (m = RADICAL_RE.exec(s)); ) {
    const r = radicalAt(s, m, body => body);
    out += r.out;
    s = r.rest;
  }
  return out + s;
}

// ² ³ ... -> ^{2} ; ^12 -> ^{12} ; ^x -> ^{x} ; ^{...} giu nguyen.
function liftSuperscripts(s) {
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, run => `^{${[...run].map(c => SUP_TO_DIGIT[c]).join('')}}`);
  s = s.replace(/\^(?!\{)([0-9]+|[A-Za-z])/g, '^{$1}');
  return s;
}

// Can/phan so long nhau goi de quy bareToLatex theo do sau. Qua nguong -> giu
// nguyen phan tho (cong thuc that hiem khi long qua 5 tang) thay vi tran stack.
const MAX_NEST_DEPTH = 50;
let nestDepth = 0;

function bareToLatex(expr, keepOuterParens = false) {
  if (nestDepth >= MAX_NEST_DEPTH) return String(expr).trim();
  nestDepth++;
  try {
    return bareToLatexAt(expr, keepOuterParens);
  } finally {
    nestDepth--;
  }
}

function bareToLatexAt(expr, keepOuterParens) {
  let s = String(expr).trim();
  const dollar = /^\$([\s\S]*)\$$/.exec(s);
  if (dollar) s = dollar[1].trim();
  // Ngoac don giao vien go quanh 1 ve phan so ("(2*√3)/(...)") mang y nghia
  // gom nhom -> giu nguyen trong LaTeX. Chi bo ngoac khi KHONG phai ve phan
  // so (keepOuterParens=false) va ngoac boc tron ca bieu thuc.
  if (!keepOuterParens && s.startsWith('(') && findMatchingParen(s, 0) === s.length - 1) {
    s = s.slice(1, -1).trim();
  }
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
function wrapLatexCommandAt(s, m) {
  const start = m.index;
  const name = /^\\(sqrt|dfrac|tfrac|frac)/.exec(s.slice(start))[1];
  const nArgs = name === 'sqrt' ? 1 : 2;
  const skip = i => ({ out: s.slice(0, i), rest: s.slice(i) });
  let i = start + m[0].length;
  if (name === 'sqrt' && s[i] === '[') {
    const rb = s.indexOf(']', i);
    if (rb < 0) return skip(i);
    i = rb + 1;
  }
  for (let a = 0; a < nArgs; a++) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== '{') return skip(i);
    const rb = matchBrace(s, i);
    if (rb < 0) return skip(i);
    i = rb + 1;
  }
  // Hut them "^{...}" / "^x" / "_{...}" bam ngay sau (vd (\sqrt{a})^2 viet tho).
  const tail = /^(?:\s*[\^_](?:\{[^{}]*\}|[A-Za-z0-9]))+/.exec(s.slice(i));
  if (tail) i += tail[0].length;
  return { out: s.slice(0, start) + '$' + s.slice(start, i).trim() + '$', rest: s.slice(i) };
}

function wrapLatexCommands(s) {
  let out = '';
  for (let m; (m = /\\(?:sqrt|dfrac|tfrac|frac)\b/.exec(s)); ) {
    const r = wrapLatexCommandAt(s, m);
    out += r.out;
    s = r.rest;
  }
  return out + s;
}

const wrapDollar = body => `$${body}$`;

// Buoc 2: sqrt(...) ASCII -> $\sqrt{...}$
function wrapSqrtCalls(s) {
  let out = '';
  for (let m; (m = /\\?sqrt\s*\(/i.exec(s)); ) {
    const r = sqrtCallAt(s, m, wrapDollar);
    out += r.out;
    s = r.rest;
  }
  return out + s;
}

// Buoc 3: √.. / ∛.. / ∜.. / ⁿ√.. (Unicode) -> $\sqrt[n]{...}$
function wrapUnicodeRadicals(s) {
  let out = '';
  for (let m; (m = RADICAL_RE.exec(s)); ) {
    const r = radicalAt(s, m, wrapDollar);
    out += r.out;
    s = r.rest;
  }
  return out + s;
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
// Mot ve co "cau truc toan" (da co $...$, \sqrt, \frac hoac ky tu can) thi
// chac chan la toan hoc -> bat phan so. Neu KHONG co cau truc, chi bat khi
// CA hai ve deu "gon" (khong khoang trang ben trong) - tranh nuot bat dang
// thuc go tay "(2x - 1)/3 - (x - 2)/2 >= (x + 1)/6" thanh phan so xep chong.
const STRUCTURAL_RE = /[$√∛∜]|\\sqrt|\\[dt]?frac/;
// "Cau 12/5", "Bai 3/4 trang 10", "Hinh 2/3", "ngay 12/5"... = so tham chieu
// / ngay thang, KHONG phai phan so. Chan khi ngay TRUOC cum "a/b" co tu dan
// (so sanh khong dau de bat "Câu"/"Bài"/"Hình").
const REF_WORD_RE = /(?:cau|bai|trang|hinh|sgk|sbt|ngay)\s*$/;
function precededByReferenceWord(s, idx) {
  const ctx = s.slice(Math.max(0, idx - 16), idx)
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return REF_WORD_RE.test(ctx);
}
function mergeFractions(s) {
  // Bien "chu cai" o 2 dau (ke ca chu co dau tieng Viet) chan viec cat 1 tu
  // xuoi lam ve phan so (vd "phương án" -> "ph" / "..." ).
  const re = new RegExp(
    `(?<![\\p{L}\\p{M}])(${FRAC_TERM})(\\s{0,2})\\/(\\s{0,2})(${FRAC_TERM})(?![\\p{L}\\p{M}])`,
    'gu'
  );
  const innerOf = t => t.replace(/^\$([\s\S]*)\$$/, '$1');
  const tight = t => !/\s/.test(innerOf(t));
  const hasStruct = t => STRUCTURAL_RE.test(t);
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    const [full, num, , , den] = m;
    const eligible =
      isLikelyFraction(plainOf(num), plainOf(den)) &&
      !precededByReferenceWord(s, m.index) &&
      (hasStruct(num) || hasStruct(den) || (tight(num) && tight(den)));
    if (!eligible) {
      re.lastIndex = m.index + num.length + 1;
      continue;
    }
    out += s.slice(last, m.index) +
      `$\\frac{${bareToLatex(num, true)}}{${bareToLatex(den, true)}}$`;
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

// Buoc 8: nuot toan hang tran ("= 4", "+ 2", "- 3") dung NGAY sau mot cum
// $...$ vao trong cum do -> KaTeX ve ca ve "= 4" lien mach 1 duong nen.
// Chi nuot SO (co the am / thap phan) hoac cum ngoac toan-hoc-thuan; gap
// chu cai (van xuoi tieng Viet) hoac dau cau thi DUNG.
const TRAILING_OPERAND = String.raw`-?\d+(?:[.,]\d+)?|\([-+\d\s*/×÷·.]+\)`;
function absorbTrailingOperand(s) {
  const re = new RegExp(
    `\\$([^$]+)\\$([ \\t]*[-+=*×÷·][ \\t]*)(${TRAILING_OPERAND})(?![\\w²³⁰¹⁴⁵⁶⁷⁸⁹])`,
    'g'
  );
  let prev = null;
  while (prev !== s) {
    prev = s;
    s = s.replace(re, (_, body, op, operand) => `$${body.trim()} ${op.trim()} ${operand.trim()}$`);
  }
  return s;
}

// Buoc 0: \begin{env}...\end{env} (cases, matrix, aligned...) dung tran ngoai
// $...$ -> boc thanh $$...$$ (block) de KaTeX/JLaTeXMath ve. Ton trong vung
// $...$ / $$...$$ da co (splitProtected coi la khoi kin).
const BLOCK_ENVS = new Set([
  'cases', 'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix',
  'array', 'aligned', 'align', 'align*', 'alignedat', 'gathered', 'gather',
  'gather*', 'split', 'equation', 'equation*'
]);
const BEGIN_ENV_RE = /\\begin\{([A-Za-z]+\*?)\}/g;
function wrapBlockEnvironments(text) {
  return splitProtected(text).map(p => {
    if (p.math) return p.value;
    const s = p.value;
    let out = '';
    let cursor = 0;
    BEGIN_ENV_RE.lastIndex = 0;
    let m;
    while ((m = BEGIN_ENV_RE.exec(s)) !== null) {
      if (m.index < cursor) continue;
      if (!BLOCK_ENVS.has(m[1])) continue;
      const endTag = `\\end{${m[1]}}`;
      const endIdx = s.indexOf(endTag, m.index + m[0].length);
      if (endIdx < 0) continue;
      const stop = endIdx + endTag.length;
      out += s.slice(cursor, m.index) + `$$${s.slice(m.index, stop)}$$`;
      cursor = stop;
      BEGIN_ENV_RE.lastIndex = stop;
    }
    return out + s.slice(cursor);
  }).join('');
}

// Chay 1 buoc merge/absorb CHI tren phan van ban NGOAI cac block $$...$$
// (tranh regex phan so cat "a/b" nam trong \begin{cases}...\end{cases}).
function outsideBlocks(s, fn) {
  return s.split(/(\$\$[^$]*\$\$)/).map((seg, i) => (i % 2 === 0 ? fn(seg) : seg)).join('');
}

function onePass(text) {
  let s = wrapBlockEnvironments(text);
  s = splitProtected(s)
    .map(p => {
      if (p.math) return p.value;
      let seg = p.value;
      seg = wrapLatexCommands(seg);
      seg = wrapSqrtCalls(seg);
      seg = wrapUnicodeRadicals(seg);
      return seg;
    })
    .join('');
  s = outsideBlocks(s, absorbLeadingCoefficient);
  s = outsideBlocks(s, absorbHuggingParens);
  s = outsideBlocks(s, mergeFractions);
  s = outsideBlocks(s, mergeAdjacentSpans);
  s = outsideBlocks(s, absorbTrailingOperand);
  return s;
}

// Hard rule 8: dau "$" LE (khong ghep thanh cap $...$) khong duoc lam hong
// buoc sau. Ghep cap tham lam tu trai; "$" con du -> tam thay bang sentinel
// (PUA, khong khop \p{L}/[0-9A-Za-z]/toan tu) roi tra lai o cuoi.
const LONE_DOLLAR_SENTINEL = String.fromCharCode(0xF8FF);
const dollarCount = s => (s.match(/\$/g) || []).length;
// Deeply nested parenthesis input makes each sqrt(...) scan revisit most of
// the remaining string. Leave unusually deep expressions untouched instead
// of spending quadratic time on malformed or machine-generated input.
function hasExcessiveParenDepth(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(' && ++depth > 128) return true;
    if (s[i] === ')' && depth > 0) depth--;
  }
  return false;
}
function guardLoneDollars(text) {
  if (dollarCount(text) % 2 === 0) return { text, restore: s => s };
  // "$" dinh sat chu so (tien te "5$" / "$5") gan nhu chac chan la dau LE.
  let out = text.replace(/(?<=\d)\$|\$(?=\d)/g, LONE_DOLLAR_SENTINEL);
  if (dollarCount(out) % 2 === 1) {
    // Van le -> sentinel dau "$" CUOI cung (ghep cap tham lam tu trai).
    const last = out.lastIndexOf('$');
    out = out.slice(0, last) + LONE_DOLLAR_SENTINEL + out.slice(last + 1);
  }
  return { text: out, restore: s => s.split(LONE_DOLLAR_SENTINEL).join('$') };
}

/**
 * Boc moi cau truc toan 2 chieu ngoai $...$ thanh $...$ LaTeX. Idempotent.
 */
export function promoteStructuralMath(text) {
  if (typeof text !== 'string' || !text) return text;
  if (hasExcessiveParenDepth(text)) return text;
  const guarded = guardLoneDollars(text);
  let result = guarded.text;
  for (let i = 0; i < 6; i++) {
    const next = onePass(result);
    if (next === result) break;
    result = next;
  }
  return guarded.restore(result);
}
