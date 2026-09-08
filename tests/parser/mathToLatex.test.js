const { promoteStructuralMath } = require('../../backend/parser/mathToLatex.js');

/**
 * promoteStructuralMath: boc moi cau truc toan 2 chieu (can, phan so, can
 * bac n, luy thua chong...) nam NGOAI $...$ thanh cong thuc LaTeX $...$
 * chuan, de KaTeX (web) / JLaTeXMath (Android) ve THAT. Ky hieu 1 hang
 * (x^2, <=, ×...) giu nguyen. Idempotent.
 */
describe('promoteStructuralMath', () => {
  test('TC-ML-01: \\sqrt{...} tho (loi AI hay gap) chi duoc them dau $, khong bien doi', () => {
    expect(promoteStructuralMath('\\sqrt{80}')).toBe('$\\sqrt{80}$');
    expect(promoteStructuralMath('Ket qua \\sqrt{16} = 4')).toBe('Ket qua $\\sqrt{16}$ = 4');
  });

  test('TC-ML-02: \\sqrt[n]{...} va \\frac{...}{...} tho -> $...$', () => {
    expect(promoteStructuralMath('\\sqrt[3]{27}')).toBe('$\\sqrt[3]{27}$');
    expect(promoteStructuralMath('\\frac{a}{b}')).toBe('$\\frac{a}{b}$');
    expect(promoteStructuralMath('\\frac{\\sqrt{3}}{2}')).toBe('$\\frac{\\sqrt{3}}{2}$');
  });

  test('TC-ML-03: sqrt(...) ASCII -> $\\sqrt{...}$', () => {
    expect(promoteStructuralMath('sqrt(16) = 4')).toBe('$\\sqrt{16}$ = 4');
    expect(promoteStructuralMath('sqrt(x + 1)')).toBe('$\\sqrt{x + 1}$');
  });

  test('TC-ML-04: can Unicode √ (du lieu cu da bi lam phang) -> $\\sqrt{...}$', () => {
    expect(promoteStructuralMath('√16')).toBe('$\\sqrt{16}$');
    expect(promoteStructuralMath('√(x + 1)')).toBe('$\\sqrt{x + 1}$');
    expect(promoteStructuralMath('∛27')).toBe('$\\sqrt[3]{27}$');
    expect(promoteStructuralMath('∜16')).toBe('$\\sqrt[4]{16}$');
    expect(promoteStructuralMath('⁵√32')).toBe('$\\sqrt[5]{32}$');
  });

  test('TC-ML-05: can long nhau √((√3+1)²) chuyen het, khong con ky tu Unicode', () => {
    const r = promoteStructuralMath('√((√3+1)²)');
    expect(r).toBe('$\\sqrt{(\\sqrt{3}+1)^{2}}$');
    expect(r).not.toMatch(/[√²]/);
  });

  test('TC-ML-06: "√80 / √5" -> phan so xep chong (ca 2 ve deu la can -> tin hieu manh)', () => {
    expect(promoteStructuralMath('phép tính √80 / √5 là'))
      .toBe('phép tính $\\frac{\\sqrt{80}}{\\sqrt{5}}$ là');
  });

  test('TC-ML-07: "2 / √3" -> $\\frac{2}{\\sqrt{3}}$', () => {
    expect(promoteStructuralMath('2 / √3')).toBe('$\\frac{2}{\\sqrt{3}}$');
  });

  test('TC-ML-08: phan so so thuan 3/4 (khong khoang trang) -> $\\frac{3}{4}$', () => {
    expect(promoteStructuralMath('3/4')).toBe('$\\frac{3}{4}$');
    expect(promoteStructuralMath('AH/AB')).toBe('$\\frac{AH}{AB}$');
  });

  test('TC-ML-09: khong nham tu noi / don vi / tu xuoi thanh phan so', () => {
    expect(promoteStructuralMath('Đáp án đúng và/hoặc gần đúng.')).toBe('Đáp án đúng và/hoặc gần đúng.');
    expect(promoteStructuralMath('vận tốc 15 km/h')).toBe('vận tốc 15 km/h');
    expect(promoteStructuralMath('câu hỏi/trả lời')).toBe('câu hỏi/trả lời');
  });

  test('TC-ML-10: bien "chu cai co dau" chan cat tu xuoi lam ve phan so', () => {
    // "$\\sqrt{2}$ / phương án" khong duoc thanh \\frac{\\sqrt{2}}{ph}
    expect(promoteStructuralMath('kết quả √2 / phương án B'))
      .toBe('kết quả $\\sqrt{2}$ / phương án B');
  });

  test('TC-ML-11: he so + ngoac om sat cum can -> nuot vao $...$', () => {
    expect(promoteStructuralMath('(2√3)')).toBe('$(2\\sqrt{3})$');
    expect(promoteStructuralMath('(2 * √3) / (√3 * √3)'))
      .toBe('$\\frac{(2 \\times \\sqrt{3})}{(\\sqrt{3} \\times \\sqrt{3})}$');
  });

  test('TC-ML-12: gop cum $...$ ke nhau qua toan tu thanh 1 cong thuc', () => {
    expect(promoteStructuralMath('√80 + √5')).toBe('$\\sqrt{80} + \\sqrt{5}$');
    expect(promoteStructuralMath('√16 = 4')).toBe('$\\sqrt{16} = 4$');
  });

  test('TC-ML-13: KHONG dung vao noi dung da nam trong $...$', () => {
    const raw = 'Cho $a \\ge 0$ va $\\sqrt{a}$, tính $\\frac{a}{2}$.';
    expect(promoteStructuralMath(raw)).toBe(raw);
  });

  test('TC-ML-14: van xuoi thuan (khong co toan) giu nguyen', () => {
    expect(promoteStructuralMath('Trình bày nguyên nhân biến đổi khí hậu.'))
      .toBe('Trình bày nguyên nhân biến đổi khí hậu.');
  });

  test('TC-ML-15: ky hieu 1 hang KHONG bi boc (de formatMathSymbols lo)', () => {
    expect(promoteStructuralMath('x^2 + y^2 <= 4')).toBe('x^2 + y^2 <= 4');
    expect(promoteStructuralMath('a * b = c')).toBe('a * b = c');
  });

  test('TC-ML-16 [Edge]: dau vao rong / khong phai string', () => {
    expect(promoteStructuralMath('')).toBe('');
    expect(promoteStructuralMath(null)).toBe(null);
    expect(promoteStructuralMath(undefined)).toBe(undefined);
  });

  test('TC-ML-17: IDEMPOTENT - chay lai lan 2, 3 khong doi them', () => {
    const cases = [
      'Ket qua \\sqrt{16} = 4',
      'phép tính √80 / √5 là',
      '2 / √3',
      '(2 * √3) / (√3 * √3)',
      '√((√3+1)²)',
      'Cho $a \\ge 0$ va \\sqrt{a}.',
      'x^2 + y^2 <= 4'
    ];
    for (const c of cases) {
      const once = promoteStructuralMath(c);
      const twice = promoteStructuralMath(once);
      const thrice = promoteStructuralMath(twice);
      expect(twice).toBe(once);
      expect(thrice).toBe(once);
    }
  });

  test('TC-ML-18: ngoac khong khop -> giu nguyen la text, khong treo', () => {
    expect(promoteStructuralMath('√(x + 1')).toBe('√(x + 1');
    expect(promoteStructuralMath('sqrt(16')).toBe('sqrt(16');
    expect(promoteStructuralMath('\\sqrt{16')).toBe('\\sqrt{16');
  });
});
