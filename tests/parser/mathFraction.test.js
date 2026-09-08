const { isLikelyFraction } = require('../../backend/parser/mathFraction.js');

/**
 * isLikelyFraction(num, den): heuristic phan biet "toan hang phan so" voi
 * van xuoi / don vi do luong. mathToLatex.js dung khi quyet dinh co boc
 * "a/b" thanh $\frac{a}{b}$ hay khong.
 */
describe('isLikelyFraction', () => {
  test('TC-FR-01: cap toan hang hop le', () => {
    expect(isLikelyFraction('3', '4')).toBe(true);
    expect(isLikelyFraction('AH', 'AB')).toBe(true);
    expect(isLikelyFraction('m', 'n')).toBe(true);          // phan so bien ngan
    expect(isLikelyFraction('sin α', 'cos α')).toBe(true);
    expect(isLikelyFraction('(2x - 1)', '3')).toBe(true);
  });

  test('TC-FR-02: tu noi tieng Viet ("va/hoac") bi chan', () => {
    expect(isLikelyFraction('và', 'hoặc')).toBe(false);
    expect(isLikelyFraction('hay', 'không')).toBe(false);
  });

  test('TC-FR-03: cap don vi do luong bi chan', () => {
    expect(isLikelyFraction('km', 'h')).toBe(false);
    expect(isLikelyFraction('m', 's')).toBe(false);
    expect(isLikelyFraction('kg', 'm3')).toBe(false);
  });

  test('TC-FR-04: tu xuoi thuong dai (>= 3 ky tu, chu thuong) bi chan', () => {
    expect(isLikelyFraction('hỏi', 'trả')).toBe(false);
    expect(isLikelyFraction('của', 'một')).toBe(false);
  });

  test('TC-FR-05 [Edge]: ve rong -> false', () => {
    expect(isLikelyFraction('', '4')).toBe(false);
    expect(isLikelyFraction('3', '  ')).toBe(false);
  });
});
