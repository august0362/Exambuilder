// Tim vi tri dau ")" khop voi dau "(" tai openIndex, co tinh long nhau
// (vi du can cua mot binh phuong nhu "√((√3+1)²)" co 2 lop ngoac). Dung boi
// mathToLatex.js khi boc "sqrt(...)" / "√(...)" thanh $...$ LaTeX.
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
