const { formatMathSymbols, latexToPlainText } = require('../../backend/parser/mathFormat.js');

/**
 * formatMathSymbols doi cac ky hieu toan hoc go tay bang ASCII (>=, <=>,
 * ^2, sqrt(...), m3...) NAM NGOAI dau $...$ sang Unicode; phan LaTeX BEN
 * TRONG $...$ duoc GIU NGUYEN VEN (ke ca dau $) de tang hien thi dung KaTeX
 * ve that thay vi tu "lam phang" bang regex (xem renderMathInline trong
 * script.js). latexToPlainText() la ham lam phang toan bo (ke ca $...$)
 * dung cho noi dung khong the render KaTeX (vd xuat file Word).
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

  test('TC-MF-11 [Da sua - chuyen sang KaTeX]: giu nguyen ven ca dau $ cua cong thuc LaTeX de KaTeX ve o tang hien thi', () => {
    expect(formatMathSymbols('$\\sin \\alpha$')).toBe('$\\sin \\alpha$');
  });

  test('TC-MF-11b: latexToPlainText van bo dau $ va doi LaTeX sang Unicode nhu truoc (dung cho xuat Word)', () => {
    expect(latexToPlainText('$\\sin \\alpha$')).toBe('sin α');
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

  test('TC-MF-19 [Da sua - chuyen sang KaTeX]: cau hoi trac nghiem LaTeX day du (nhu AI sinh ra) chi doi phan van ban tieng Viet, giu nguyen tung cum $...$', () => {
    const raw = 'Cho tam giác $ABC$ vuông tại $A$ có góc nhọn $\\widehat{B} = \\alpha$. $\\sin \\alpha = \\frac{AC}{BC}$';
    expect(formatMathSymbols(raw)).toBe(raw);
  });

  test('TC-MF-19b: latexToPlainText lam sach hoan toan ca $...$ (dung cho xuat Word)', () => {
    const raw = 'Cho tam giác $ABC$ vuông tại $A$ có góc nhọn $\\widehat{B} = \\alpha$. $\\sin \\alpha = \\frac{AC}{BC}$';
    expect(latexToPlainText(raw)).toBe('Cho tam giác ABC vuông tại A có góc nhọn B̂ = α. sin α = AC/BC');
  });

  test('TC-MF-20 [Da sua - chuyen sang KaTeX]: dien tich hinh vuong voi don vi va so mu tu \\text{}^2, giu nguyen $...$', () => {
    expect(formatMathSymbols('$18\\text{ cm}^2$')).toBe('$18\\text{ cm}^2$');
  });

  test('TC-MF-20b: latexToPlainText van doi \\text{}^2 sang Unicode nhu truoc', () => {
    expect(latexToPlainText('$18\\text{ cm}^2$')).toBe('18 cm²');
  });

  test('TC-MF-26: doi \\sqrt[3]{...} sang can bac ba Unicode (∛), \\sqrt[4]{...} sang ∜', () => {
    expect(formatMathSymbols('\\sqrt[3]{27} = 3')).toBe('∛27 = 3');
    expect(formatMathSymbols('\\sqrt[3]{-8} = -2')).toBe('∛(-8) = -2');
    expect(formatMathSymbols('\\sqrt[3]{a}')).toBe('∛(a)');
    expect(formatMathSymbols('\\sqrt[4]{16} = 2')).toBe('∜16 = 2');
  });

  test('TC-MF-27: \\sqrt[n]{...} voi bac lon hon 4 dung chu so tren ghep truoc dau can', () => {
    expect(formatMathSymbols('\\sqrt[5]{32} = 2')).toBe('⁵√32 = 2');
  });

  test('TC-MF-28 [Da sua - chuyen sang KaTeX]: (\\sqrt[3]{...})^3 = a giu nguyen $...$ de KaTeX ve, chi doi phan van ban tieng Viet ben ngoai', () => {
    const result = formatMathSymbols('$(\\sqrt[3]{a})^3 = a$ đúng với mọi số thực $a$.');
    expect(result).toBe('$(\\sqrt[3]{a})^3 = a$ đúng với mọi số thực $a$.');
  });

  test('TC-MF-28b: latexToPlainText van lam sach hoan toan (khong con \\sqrt[ hay dau ngoac nhon)', () => {
    const result = latexToPlainText('$(\\sqrt[3]{a})^3 = a$ đúng với mọi số thực $a$.');
    expect(result).toBe('(∛(a))³ = a đúng với mọi số thực a.');
    expect(result).not.toMatch(/\\sqrt|[{}]/);
  });

  test('TC-MF-29: doi \\ge \\le \\ne \\pm \\mp sang ky hieu Unicode (dang lenh LaTeX, khac ASCII >= <= !=)', () => {
    expect(formatMathSymbols('a \\ge 0')).toBe('a ≥ 0');
    expect(formatMathSymbols('a \\le 0')).toBe('a ≤ 0');
    expect(formatMathSymbols('a \\ne 0')).toBe('a ≠ 0');
    expect(formatMathSymbols('x = 2 \\pm 1')).toBe('x = 2 ± 1');
    expect(formatMathSymbols('x = 2 \\mp 1')).toBe('x = 2 ∓ 1');
  });

  test('TC-MF-30: doi \\Rightarrow \\Leftrightarrow \\Leftarrow \\to sang mui ten Unicode', () => {
    expect(formatMathSymbols('x \\Rightarrow y')).toBe('x ⇒ y');
    expect(formatMathSymbols('x \\Leftrightarrow y')).toBe('x ⇔ y');
    expect(formatMathSymbols('x \\Leftarrow y')).toBe('x ⇐ y');
    expect(formatMathSymbols('x \\to y')).toBe('x → y');
  });

  test('TC-MF-31: doi \\in \\notin sang ∈/∉, \\mathbb{R|N|Z|Q|C} sang chu dam bang Unicode', () => {
    expect(formatMathSymbols('x \\in \\mathbb{R}')).toBe('x ∈ ℝ');
    expect(formatMathSymbols('x \\notin \\mathbb{N}')).toBe('x ∉ ℕ');
    expect(formatMathSymbols('\\mathbb{Z}, \\mathbb{Q}, \\mathbb{C}')).toBe('ℤ, ℚ, ℂ');
  });

  test('TC-MF-32 [Da sua - chuyen sang KaTeX]: cau Dung/Sai LaTeX day du chua \\in \\mathbb{R} giu nguyen tung cum $...$, chi doi van ban tieng Viet xen giua', () => {
    const raw = 'Căn thức $\\sqrt{x}$ xác định với mọi giá trị của $x \\in \\mathbb{R}$.';
    expect(formatMathSymbols(raw)).toBe(raw);
  });

  test('TC-MF-32b: latexToPlainText van lam sach hoan toan (dung cho xuat Word)', () => {
    const result = latexToPlainText('Căn thức $\\sqrt{x}$ xác định với mọi giá trị của $x \\in \\mathbb{R}$.');
    expect(result).toBe('Căn thức √(x) xác định với mọi giá trị của x ∈ ℝ.');
    expect(result).not.toMatch(/\\in|\\mathbb|[{}]/);
  });

  test('TC-MF-33 [Edge]: dau "$" le loi (khong co dau dong cap) o ben ngoai van bi xoa nhu truoc (khong doi hanh vi cu)', () => {
    expect(formatMathSymbols('Giá 5$ vẫn còn đó')).toBe('Giá 5 vẫn còn đó');
  });

  test('TC-MF-34: nhieu cum $...$ xen ke van ban thuong - cum $...$ giu nguyen, van ban ASCII ben ngoai (vd sqrt(16) go tay khong dung LaTeX) van duoc doi Unicode nhu truoc', () => {
    const raw = 'Cho $a \\ge 0$, ta có $\\sqrt{a}$, và sqrt(16) = 4.';
    expect(formatMathSymbols(raw)).toBe('Cho $a \\ge 0$, ta có $\\sqrt{a}$, và √(16) = 4.');
  });
});
