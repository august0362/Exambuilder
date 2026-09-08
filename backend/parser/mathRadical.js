// Ky hieu can (dau moc "√"/"∛"/"∜" hoac chu so tren ghep truoc "√" cho bac
// cao hon, xem mathFormat.js) di kem mot chu so tren tuy chon o dau (bac
// can) roi den toan hang: hoac so nguyen thuan ("√16") hoac cum trong ngoac
// don ("√(x + 1)", co the long nhau nhieu lop nhu "√((√3+1)²)").
const RADICAL_SYMBOL_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]*[√∛∜]/g;

// Tim vi tri dau ")" khop voi dau "(" tai openIndex, co tinh long nhau
// (vi du can cua mot binh phuong nhu "√((√3+1)²)" co 2 lop ngoac). Export de
// mathToLatex.js dung lai khi boc "sqrt(...)" / "√(...)" thanh $...$.
export function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Tach mot chuoi thanh mang cac doan { type: 'text', value } (van ban
 * thuong) hoac { type: 'sqrt', symbol, content } (can thuc) de phia hien
 * thi (script.js) dung lam co so ve dau can voi net gach ngang that noi
 * lien voi moc can, thay vi chi hien ky tu Unicode "√" roi ngoac don nhu
 * van ban thuong (khong the doc ro toan hang nam duoi dau can). "content"
 * la chuoi tho ben trong (chua qua xu ly de quy phan so/can long nhau -
 * viec do do noi goi renderMathInline dam nhiem). Khong sua doi chuoi goc -
 * chi phuc vu hien thi, du lieu luu tru van la text thuong "√(...)".
 */
export function segmentRadicals(text) {
  if (typeof text !== 'string' || !text) return [{ type: 'text', value: text || '' }];

  const segments = [];
  let lastIndex = 0;
  RADICAL_SYMBOL_RE.lastIndex = 0;
  let match;
  while ((match = RADICAL_SYMBOL_RE.exec(text)) !== null) {
    const symbol = match[0];
    const afterSymbolIdx = match.index + symbol.length;

    let content = null;
    let endIdx = -1;
    if (text[afterSymbolIdx] === '(') {
      const closeIdx = findMatchingParen(text, afterSymbolIdx);
      if (closeIdx !== -1) {
        content = text.slice(afterSymbolIdx + 1, closeIdx);
        endIdx = closeIdx + 1;
      }
    } else {
      const digitMatch = /^[0-9]+/.exec(text.slice(afterSymbolIdx));
      if (digitMatch) {
        content = digitMatch[0];
        endIdx = afterSymbolIdx + digitMatch[0].length;
      }
    }

    if (content === null) {
      // Khong xac dinh duoc toan hang phia sau (vi du go tay dau "√" don
      // le) - giu nguyen phan nay la van ban thuong, khong che thanh can.
      RADICAL_SYMBOL_RE.lastIndex = afterSymbolIdx;
      continue;
    }

    if (match.index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    segments.push({ type: 'sqrt', symbol, content });
    lastIndex = endIdx;
    RADICAL_SYMBOL_RE.lastIndex = endIdx;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  if (segments.length === 0) segments.push({ type: 'text', value: text });
  return segments;
}
