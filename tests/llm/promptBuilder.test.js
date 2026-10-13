const { buildPrompt, buildRetryPrompt, extractFormatInstructions } = require('../../backend/llm/promptBuilder');

describe('promptBuilder', () => {
  describe('Happy Path', () => {
    test('TC-PB-01: extractFormatInstructions tra ve doan huong dan chua tu khoa dinh dang cot loi', () => {
      const instructions = extractFormatInstructions();
      expect(instructions).toContain('[CAU_HOI]');
      expect(instructions).toContain('Loai:');
      expect(instructions).toContain('Muc_Do:');
      expect(instructions).not.toContain('(kết thúc PROMPT)');
    });

    test('TC-PB-02: buildPrompt thay the placeholder chu de bang topic truyen vao', () => {
      const prompt = buildPrompt({ topic: 'Toan 10 - Ham so' });
      expect(prompt).toContain('Toan 10 - Ham so');
      expect(prompt).not.toContain('[NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY]');
    });

    test('TC-PB-03: buildPrompt chen noi dung cac section duoc chon vao phan ngu canh', () => {
      const prompt = buildPrompt({ topic: 'Toan', sectionsContent: ['Noi dung chuong 1', 'Noi dung chuong 2'] });
      expect(prompt).toContain('NGỮ CẢNH THAM KHẢO');
      expect(prompt).toContain('Noi dung chuong 1');
      expect(prompt).toContain('Noi dung chuong 2');
    });

    test('TC-PB-04: buildPrompt liet ke yeu cau so luong cau hoi theo loai va muc do', () => {
      const prompt = buildPrompt({
        topic: 'Toan',
        questionSpec: [{ loai: 'TN', muc_do: 'Nhan_Biet', so_luong: 5 }]
      });
      expect(prompt).toContain('YÊU CẦU SỐ LƯỢNG CÂU HỎI');
      expect(prompt).toContain('5 câu loại "TN", mức độ "Nhan_Biet"');
    });

    test('TC-PB-09: buildPrompt chen yeu cau bo sung cua nguoi dung vao cuoi prompt', () => {
      const prompt = buildPrompt({
        topic: 'Toan',
        extraInstructions: 'Ra de theo phong cach thi THPT Quoc gia'
      });
      // Khong co bang: yeu cau viet tay duoc quyet ca so luong.
      expect(prompt).toContain('YÊU CẦU TỪ NGƯỜI DÙNG');
      expect(prompt).toContain('Nếu có nêu số câu, loại câu, mức độ thì tuân thủ đúng');
      expect(prompt).toContain('Ra de theo phong cach thi THPT Quoc gia');
    });

    test('TC-PB-11: co bang + yeu cau viet tay -> bang uu tien, dat sau cung, ghi tong so cau', () => {
      const prompt = buildPrompt({
        topic: 'Toan',
        questionSpec: [{ loai: 'TN', muc_do: 'Nhan_Biet', so_luong: 5 }, { loai: 'TU_LUAN', muc_do: 'Van_Dung', so_luong: 2 }],
        extraInstructions: '20 cau trac nghiem, uu tien bai toan thuc te'
      });
      expect(prompt).toContain('YÊU CẦU BỔ SUNG TỪ NGƯỜI DÙNG');
      expect(prompt).toContain('KHÁC với BẢNG số lượng phía dưới thì LÀM THEO BẢNG');
      expect(prompt).toContain('BẢNG — BẮT BUỘC, ƯU TIÊN CAO NHẤT');
      expect(prompt).toContain('Tổng cộng đúng 7 câu');
      expect(prompt.indexOf('20 cau trac nghiem')).toBeLessThan(prompt.indexOf('BẢNG — BẮT BUỘC'));
    });
  });

  describe('Edge Cases', () => {
    test('TC-PB-05: buildPrompt khong co topic van dung placeholder mac dinh, khong nem loi', () => {
      expect(() => buildPrompt({})).not.toThrow();
      expect(buildPrompt({})).toContain('chủ đề chưa được nêu cụ thể');
    });

    test('TC-PB-06: buildPrompt voi sectionsContent rong khong chen khoi ngu canh', () => {
      const prompt = buildPrompt({ topic: 'Toan', sectionsContent: [] });
      expect(prompt).not.toContain('NGỮ CẢNH THAM KHẢO');
    });

    test('TC-PB-07: buildPrompt voi questionSpec rong khong chen khoi yeu cau so luong', () => {
      const prompt = buildPrompt({ topic: 'Toan', questionSpec: [] });
      expect(prompt).not.toContain('YÊU CẦU SỐ LƯỢNG CÂU HỎI');
    });

    test('TC-PB-10: buildPrompt khong co extraInstructions (hoac chi khoang trang) khong chen khoi bo sung', () => {
      expect(buildPrompt({ topic: 'Toan' })).not.toContain('TỪ NGƯỜI DÙNG');
      expect(buildPrompt({ topic: 'Toan', extraInstructions: '   ' })).not.toContain('TỪ NGƯỜI DÙNG');
    });

    test('TC-PB-08: buildRetryPrompt noi tiep prompt goc va nhung thong bao loi cu the', () => {
      const original = 'PROMPT GOC';
      const retry = buildRetryPrompt(original, 'Thieu truong De_Bai');
      expect(retry).toContain('PROMPT GOC');
      expect(retry).toContain('Thieu truong De_Bai');
      expect(retry).toContain('SAI ĐỊNH DẠNG');
    });
  });
});
