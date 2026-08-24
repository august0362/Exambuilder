const { formatMathSymbols } = require('../../backend/parser/mathFormat.js');

/**
 * formatMathSymbols doi cac ky hieu toan hoc go tay bang ASCII (>=, <=>,
 * ^2, sqrt(...), m3...) sang ky tu Unicode toan hoc tuong ung, de noi dung
 * de thi hien thi dung chuan thay vi ky hieu lap trinh.
 */
describe('formatMathSymbols', () => {
  test('TC-MF-01: doi cac ky hieu so sanh/suy ra ASCII sang Unicode', () => {
    expect(formatMathSymbols('a >= b')).toBe('a ≥ b');
    expect(formatMathSymbols('a <= b')).toBe('a ≤ b');
    expect(formatMathSymbols('a != b')).toBe('a ≠ b');
    expect(formatMathSymbols('a <=> b')).toBe('a ⇔ b');
    expect(formatMathSymbols('a => b')).toBe('a ⇒ b');
    expect(formatMathSymbols('a -> b')).toBe('a → b');
    expect(formatMathSymbols('a <-> b')).toBe('a ↔ b');
  });

  test('TC-MF-02: uu tien thay the chuoi dai hon truoc (<=> khong bi vo thanh <= va =>)', () => {
    expect(formatMathSymbols('3x - 9 = 0 <=> 3x = 9 <=> x = 3')).toBe('3x - 9 = 0 ⇔ 3x = 9 ⇔ x = 3');
  });

  test('TC-MF-03: doi so mu ^2, ^3 sang chu so tren Unicode', () => {
    expect(formatMathSymbols('x^2 + y^3')).toBe('x² + y³');
    expect(formatMathSymbols('x^10')).toBe('x¹⁰');
  });

  test('TC-MF-04: doi don vi dien tich/the tich (m2, m3, cm3...) sang chu so tren', () => {
    expect(formatMathSymbols('dien tich 45 m2')).toBe('dien tich 45 m²');
    expect(formatMathSymbols('the tich 45 m3 nuoc')).toBe('the tich 45 m³ nuoc');
    expect(formatMathSymbols('10 cm3')).toBe('10 cm³');
  });

  test('TC-MF-05: doi sqrt(...) sang can bac hai Unicode', () => {
    expect(formatMathSymbols('sqrt(16) = 4')).toBe('√(16) = 4');
    expect(formatMathSymbols('SQRT(x)')).toBe('√(x)');
  });

  test('TC-MF-06: doi dau nhan * giua 2 so hang thanh ×, giu nguyen phan so a/b', () => {
    expect(formatMathSymbols('a * b')).toBe('a × b');
    expect(formatMathSymbols('(2x - 1)/3 - (x - 2)/2 >= (x + 1)/6')).toBe('(2x - 1)/3 - (x - 2)/2 ≥ (x + 1)/6');
  });

  test('TC-MF-07: doi +- sang dau cong tru ±', () => {
    expect(formatMathSymbols('x = 2 +- 1')).toBe('x = 2 ± 1');
  });

  test('TC-MF-08: chuoi khong co ky hieu toan hoc thi giu nguyen', () => {
    expect(formatMathSymbols('Trinh bay nguyen nhan bien doi khi hau.')).toBe('Trinh bay nguyen nhan bien doi khi hau.');
  });

  test('TC-MF-09 [Edge]: dau vao khong phai string hoac rong thi tra ve nguyen ban', () => {
    expect(formatMathSymbols('')).toBe('');
    expect(formatMathSymbols(null)).toBe(null);
    expect(formatMathSymbols(undefined)).toBe(undefined);
  });

  test('TC-MF-10: ket qua da doi thi idempotent (chay lai lan 2 khong doi them)', () => {
    const once = formatMathSymbols('1/(1 + a^2) + 1/(1 + b^2) >= 2/(1 + ab).');
    const twice = formatMathSymbols(once);
    expect(twice).toBe(once);
    expect(once).toBe('1/(1 + a²) + 1/(1 + b²) ≥ 2/(1 + ab).');
  });

  test('TC-MF-11: bo dau $ bao quanh cong thuc LaTeX', () => {
    expect(formatMathSymbols('$\\sin \\alpha$')).toBe('sin α');
  });

  test('TC-MF-12: doi \\frac{tu}{mau} sang dang a/b, tu dong bo ngoac khi co +/-', () => {
    expect(formatMathSymbols('\\frac{AC}{BC}')).toBe('AC/BC');
    expect(formatMathSymbols('\\frac{x+1}{2}')).toBe('(x+1)/2');
    expect(formatMathSymbols('\\frac{\\sqrt{3}}{2}')).toBe('√3/2');
  });

  test('TC-MF-13: doi \\sin \\cos \\tan \\cot ... (bo dau \\, giu ten ham)', () => {
    expect(formatMathSymbols('\\tan \\alpha = \\frac{\\sin \\alpha}{\\cos \\alpha}')).toBe('tan α = sin α/cos α');
  });

  test('TC-MF-14: doi chu cai Hy Lap \\alpha, \\beta sang Unicode', () => {
    expect(formatMathSymbols('\\alpha + \\beta = 90^\\circ')).toBe('α + β = 90°');
  });

  test('TC-MF-15: doi do ^\\circ va \\circ don le sang °', () => {
    expect(formatMathSymbols('\\cos 60^\\circ')).toBe('cos 60°');
    expect(formatMathSymbols('60^{\\circ}')).toBe('60°');
  });

  test('TC-MF-16: doi \\widehat{X} sang X co dau mu ket hop', () => {
    expect(formatMathSymbols('\\widehat{B} = \\alpha')).toBe('B̂ = α');
  });

  test('TC-MF-17: doi \\sqrt{...} sang can bac hai Unicode - so nguyen thi khong ngoac', () => {
    expect(formatMathSymbols('\\sqrt{16} = 4')).toBe('√16 = 4');
    expect(formatMathSymbols('\\sqrt{37}')).toBe('√37');
  });

  test('TC-MF-21 [Da sua]: \\sqrt{...} KHONG con dung dau combining overline (U+0305) dinh vao chu so', () => {
    const result = formatMathSymbols('\\sqrt{37}');
    expect(result).toBe('√37');
    expect(result).not.toMatch(/̅/);
  });

  test('TC-MF-22: \\sqrt{...} voi bieu thuc (khong phai so nguyen thuan) thi boc trong ngoac don', () => {
    expect(formatMathSymbols('\\sqrt{x+1}')).toBe('√(x+1)');
    expect(formatMathSymbols('\\sqrt{2x}')).toBe('√(2x)');
  });

  test('TC-MF-23: can bac hai long nhau (\\sqrt trong \\sqrt) duoc giai het, khong con sot \\sqrt{ } tho', () => {
    const result = formatMathSymbols('AC = \\sqrt{(2\\sqrt{3})^2 + 5^2} = \\sqrt{37}');
    expect(result).not.toMatch(/\\sqrt/);
    expect(result).not.toMatch(/[{}]/);
    expect(result).toBe('AC = √((2√3)² + 5²) = √37');
  });

  test('TC-MF-24: chen dau "." khi 2 ky hieu LaTeX dinh lien nhau do bo dau \\ (nhan ngam Hy Lap-ham luong giac)', () => {
    expect(formatMathSymbols('\\sin \\alpha\\cos \\alpha')).toBe('sin α.cos α');
    expect(formatMathSymbols('\\tan \\alpha\\sin \\beta')).toBe('tan α.sin β');
  });

  test('TC-MF-25 [Edge]: khong chen dau "." khi da co khoang trang hoac tu tieng Anh chua "sin/cos" thi khong bi nham', () => {
    expect(formatMathSymbols('sin α cos α')).toBe('sin α cos α');
    expect(formatMathSymbols('The total cost is high, using x.')).toBe('The total cost is high, using x.');
  });

  test('TC-MF-18: doi \\cdot sang dau nhan ×, \\text{...} chi giu noi dung ben trong', () => {
    expect(formatMathSymbols('AC = BC \\cdot \\sin B')).toBe('AC = BC × sin B');
    expect(formatMathSymbols('AB = 3\\text{ cm}')).toBe('AB = 3 cm');
  });

  test('TC-MF-19: cau hoi trac nghiem LaTeX day du (nhu AI sinh ra) duoc lam sach hoan toan', () => {
    const raw = 'Cho tam giác $ABC$ vuông tại $A$ có góc nhọn $\\widehat{B} = \\alpha$. $\\sin \\alpha = \\frac{AC}{BC}$';
    expect(formatMathSymbols(raw)).toBe('Cho tam giác ABC vuông tại A có góc nhọn B̂ = α. sin α = AC/BC');
  });

  test('TC-MF-20: dien tich hinh vuong voi don vi va so mu tu \\text{}^2', () => {
    expect(formatMathSymbols('$18\\text{ cm}^2$')).toBe('18 cm²');
  });
});
