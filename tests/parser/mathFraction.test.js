const { segmentFractions } = require('../../backend/parser/mathFraction.js');

/**
 * segmentFractions tach van ban thanh doan text thuong / phan so de
 * script.js dung ve phan so xep chong that (tu tren, mau duoi, co gach
 * ngang) thay vi chi hien "a/b" nam ngang.
 */
describe('segmentFractions', () => {
  test('TC-FR-01: nhan dien phan so ten bien hinh hoc dang HOA (AH/AB)', () => {
    expect(segmentFractions('AH/AB')).toEqual([{ type: 'frac', num: 'AH', den: 'AB' }]);
  });

  test('TC-FR-02: nhan dien phan so ham luong giac co khoang trang (sin α/cos α)', () => {
    expect(segmentFractions('sin α/cos α')).toEqual([{ type: 'frac', num: 'sin α', den: 'cos α' }]);
  });

  test('TC-FR-03: nhan dien phan so co ngoac o tu hoac mau (√(37), (2x - 1)/3)', () => {
    expect(segmentFractions('(2x - 1)/3')).toEqual([{ type: 'frac', num: '(2x - 1)', den: '3' }]);
    expect(segmentFractions('1/(1 + a²)')).toEqual([{ type: 'frac', num: '1', den: '(1 + a²)' }]);
  });

  test('TC-FR-04: giu nguyen van ban truoc/sau phan so thanh doan text rieng', () => {
    expect(segmentFractions('Giá trị AC/BC bằng bao nhiêu?')).toEqual([
      { type: 'text', value: 'Giá trị ' },
      { type: 'frac', num: 'AC', den: 'BC' },
      { type: 'text', value: ' bằng bao nhiêu?' }
    ]);
  });

  test('TC-FR-05: nhieu phan so trong cung 1 chuoi', () => {
    expect(segmentFractions('1/(1 + a²) + 1/(1 + b²) ≥ 2/(1 + ab).')).toEqual([
      { type: 'frac', num: '1', den: '(1 + a²)' },
      { type: 'text', value: ' + ' },
      { type: 'frac', num: '1', den: '(1 + b²)' },
      { type: 'text', value: ' ≥ ' },
      { type: 'frac', num: '2', den: '(1 + ab)' },
      { type: 'text', value: '.' }
    ]);
  });

  test('TC-FR-06 [Da sua]: khong nham cac tu noi tieng Viet dang "chu/chu" thanh phan so (va/hoac)', () => {
    expect(segmentFractions('Đáp án đúng và/hoặc gần đúng.')).toEqual([
      { type: 'text', value: 'Đáp án đúng và/hoặc gần đúng.' }
    ]);
  });

  test('TC-FR-07: khong nham tu tieng Viet thuong dai (khong phai bien hinh hoc)', () => {
    expect(segmentFractions('câu hỏi/trả lời')).toEqual([{ type: 'text', value: 'câu hỏi/trả lời' }]);
  });

  test('TC-FR-08: van ban khong co phan so thi tra ve 1 doan text nguyen ven', () => {
    expect(segmentFractions('Trình bày nguyên nhân biến đổi khí hậu.')).toEqual([
      { type: 'text', value: 'Trình bày nguyên nhân biến đổi khí hậu.' }
    ]);
  });

  test('TC-FR-09 [Edge]: chuoi rong hoac khong phai string', () => {
    expect(segmentFractions('')).toEqual([{ type: 'text', value: '' }]);
    expect(segmentFractions(null)).toEqual([{ type: 'text', value: '' }]);
  });

  test('TC-FR-10: nhan dien can bac hai lam tu/mau phan so (√3/2, dang can chuan khong dung combining overline)', () => {
    expect(segmentFractions('√3/2')).toEqual([{ type: 'frac', num: '√3', den: '2' }]);
  });

  test('TC-FR-11 [Da sua - loi phep chia]: phan so ten bien HOA ngay sau dau "=" van duoc nhan dien (khong bi hien thi dinh lien "ACBC")', () => {
    expect(segmentFractions('sin α = AC/BC')).toEqual([
      { type: 'text', value: 'sin α = ' },
      { type: 'frac', num: 'AC', den: 'BC' }
    ]);
  });

  test('TC-FR-12: phan so so thuan tuy (3/4) van duoc nhan dien va xep chong', () => {
    expect(segmentFractions('3/4')).toEqual([{ type: 'frac', num: '3', den: '4' }]);
  });

  // Bug 3 [Da sua]: don vi vat ly (km/h, m/s, kg/m3...) co dang "chu/chu"
  // giong het cu phap phan so nen truoc day bi nham thanh phan so va bi ve
  // xep chong (km tren h). Phai giu nguyen dang chuoi "km/h" nam ngang.
  test('TC-FR-13 [Da sua - Bug 3]: don vi km/h khong bi nham thanh phan so', () => {
    expect(segmentFractions('vận tốc 15 km/h')).toEqual([
      { type: 'text', value: 'vận tốc 15 km/h' }
    ]);
  });

  test('TC-FR-14 [Da sua - Bug 3]: don vi m/s khong bi nham thanh phan so', () => {
    expect(segmentFractions('gia toc 9.8 m/s')).toEqual([
      { type: 'text', value: 'gia toc 9.8 m/s' }
    ]);
  });

  test('TC-FR-15 [Da sua - Bug 3]: don vi khoi luong rieng kg/m3 khong bi nham thanh phan so', () => {
    expect(segmentFractions('khối lượng riêng 1000 kg/m3')).toEqual([
      { type: 'text', value: 'khối lượng riêng 1000 kg/m3' }
    ]);
  });

  test('TC-FR-16: phan so bien toan hoc dang "chu/chu" ngan nhu don vi (m/n) van duoc nhan dien binh thuong', () => {
    expect(segmentFractions('phân số m/n tối giản')).toEqual([
      { type: 'text', value: 'phân số ' },
      { type: 'frac', num: 'm', den: 'n' },
      { type: 'text', value: ' tối giản' }
    ]);
  });
});
