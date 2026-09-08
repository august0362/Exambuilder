const { findMatchingParen } = require('../../backend/parser/mathRadical.js');

/**
 * findMatchingParen: tim dau ")" khop voi "(" tai openIndex, co tinh long
 * nhau. Dung khi mathToLatex.js boc "sqrt(...)" / "√(...)" thanh $...$ LaTeX.
 */
describe('findMatchingParen', () => {
  test('TC-RD-01: ngoac don gian', () => {
    expect(findMatchingParen('(x + 1)', 0)).toBe(6);
  });

  test('TC-RD-02: ngoac long nhau -> khop dung lop ngoai', () => {
    expect(findMatchingParen('((√3+1)²)', 0)).toBe(8);
    expect(findMatchingParen('√((√3+1)²) + 1', 1)).toBe(9);
  });

  test('TC-RD-03: ngoac trong noi dung dai hon', () => {
    const s = 'AH = √(AB × AC) roi';
    const open = s.indexOf('(');
    expect(findMatchingParen(s, open)).toBe(s.indexOf(')'));
  });

  test('TC-RD-04 [Edge]: ngoac khong khop -> -1', () => {
    expect(findMatchingParen('√(x + 1', 1)).toBe(-1);
    expect(findMatchingParen('(((', 0)).toBe(-1);
  });
});
