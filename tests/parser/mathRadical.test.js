const { segmentRadicals } = require('../../backend/parser/mathRadical.js');

/**
 * segmentRadicals tach van ban thanh doan text thuong / can thuc de
 * script.js dung ve dau can that (moc "√" noi lien net gach ngang tren
 * toan hang) thay vi chi hien ky tu Unicode "√" roi ngoac don nhu van ban
 * thuong (thieu net gach ngang, doc de nham voi "can(...)" thay vi mot khoi
 * duoi dau can).
 */
describe('segmentRadicals', () => {
  test('TC-RD-01: can bac hai so nguyen thuan (khong ngoac)', () => {
    expect(segmentRadicals('√16')).toEqual([{ type: 'sqrt', symbol: '√', content: '16' }]);
  });

  test('TC-RD-02: can bac hai bieu thuc trong ngoac don', () => {
    expect(segmentRadicals('√(x + 1)')).toEqual([{ type: 'sqrt', symbol: '√', content: 'x + 1' }]);
  });

  test('TC-RD-03: can long nhau (ngoac long nhau nhieu lop) van tim dung dau ")" khop', () => {
    expect(segmentRadicals('√((√3+1)²)')).toEqual([{ type: 'sqrt', symbol: '√', content: '(√3+1)²' }]);
  });

  test('TC-RD-04: can bac ba (∛) va can bac bon (∜) Unicode', () => {
    expect(segmentRadicals('∛(-8)')).toEqual([{ type: 'sqrt', symbol: '∛', content: '-8' }]);
    expect(segmentRadicals('∜16')).toEqual([{ type: 'sqrt', symbol: '∜', content: '16' }]);
  });

  test('TC-RD-05: can bac cao hon (chu so tren ghep truoc dau √, vd can bac 5)', () => {
    expect(segmentRadicals('⁵√32')).toEqual([{ type: 'sqrt', symbol: '⁵√', content: '32' }]);
  });

  test('TC-RD-06: giu nguyen van ban truoc/sau can thuc thanh doan text rieng', () => {
    expect(segmentRadicals('Giá trị √49 bằng bao nhiêu?')).toEqual([
      { type: 'text', value: 'Giá trị ' },
      { type: 'sqrt', symbol: '√', content: '49' },
      { type: 'text', value: ' bằng bao nhiêu?' }
    ]);
  });

  test('TC-RD-07: nhieu can thuc trong cung 1 chuoi', () => {
    expect(segmentRadicals('AC = √((2√3)² + 5²) = √37')).toEqual([
      { type: 'text', value: 'AC = ' },
      { type: 'sqrt', symbol: '√', content: '(2√3)² + 5²' },
      { type: 'text', value: ' = ' },
      { type: 'sqrt', symbol: '√', content: '37' }
    ]);
  });

  test('TC-RD-08: van ban khong co can thuc thi tra ve 1 doan text nguyen ven', () => {
    expect(segmentRadicals('Trình bày nguyên nhân biến đổi khí hậu.')).toEqual([
      { type: 'text', value: 'Trình bày nguyên nhân biến đổi khí hậu.' }
    ]);
  });

  test('TC-RD-09 [Edge]: chuoi rong hoac khong phai string', () => {
    expect(segmentRadicals('')).toEqual([{ type: 'text', value: '' }]);
    expect(segmentRadicals(null)).toEqual([{ type: 'text', value: '' }]);
  });

  test('TC-RD-10 [Edge]: dau "√" don le go tay khong co toan hang phia sau duoc giu nguyen la text', () => {
    expect(segmentRadicals('ký hiệu √ là căn bậc hai')).toEqual([
      { type: 'text', value: 'ký hiệu √ là căn bậc hai' }
    ]);
  });

  test('TC-RD-11 [Edge]: ngoac khong khop (thieu dau ")") duoc giu nguyen la text', () => {
    expect(segmentRadicals('√(x + 1')).toEqual([{ type: 'text', value: '√(x + 1' }]);
  });

  test('TC-RD-12: can thuc dung ngay sau dau "=" khong bi dinh lien voi text truoc', () => {
    expect(segmentRadicals('AH = √(AB × AC)')).toEqual([
      { type: 'text', value: 'AH = ' },
      { type: 'sqrt', symbol: '√', content: 'AB × AC' }
    ]);
  });
});
