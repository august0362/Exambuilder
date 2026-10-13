const { selectContext } = require('../../backend/llm/contextRetriever');

const NL = String.fromCharCode(10);
const para = (word, n) => Array.from({ length: n }, () => `${word} ${'x'.repeat(40)}`).join(' ');

test('TC-RAG-01: tai lieu vua ngan sach -> dua nguyen van toan bo, giu thu tu va ten phan', () => {
  const { texts, info } = selectContext([{ title: 'Chuong 1', content: 'Can bac hai' }, { title: 'Chuong 2', content: 'Ham so' }], 'ham so');
  expect(info.mode).toBe('full');
  expect(texts).toEqual(['### Chuong 1' + NL + 'Can bac hai', '### Chuong 2' + NL + 'Ham so']);
});

test('TC-RAG-02: tai lieu qua dai -> chon doan lien quan chu de (khop ca khong dau), trong ngan sach, giu thu tu goc', () => {
  const sections = [
    { title: 'Chương 1 Căn bậc hai', content: [para('căn bậc hai', 20), para('lịch sử toán', 20)].join(NL + NL) },
    { title: 'Chương 2 Hàm số', content: [para('hàm số bậc nhất', 20), para('đồ thị hàm số', 20)].join(NL + NL) }
  ];
  const { texts, info } = selectContext(sections, 'ham so bac nhat', 2500);
  expect(info.mode).toBe('retrieved');
  expect(info.used_chars).toBeLessThanOrEqual(2500);
  const joined = texts.join(NL);
  expect(joined).toContain('hàm số bậc nhất');
  expect(joined).not.toContain('lịch sử toán');
  expect(texts[0].startsWith('### Chương 2 Hàm số')).toBe(true);
});

test('TC-RAG-03: khong co tai lieu -> rong', () => {
  expect(selectContext([], 'x')).toMatchObject({ texts: [], info: { mode: 'none', sections: 0 } });
});
