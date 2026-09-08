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

    test('TC-PB-08: buildRetryPrompt noi tiep prompt goc va nhung thong bao loi cu the', () => {
      const original = 'PROMPT GOC';
      const retry = buildRetryPrompt(original, 'Thieu truong De_Bai');
      expect(retry).toContain('PROMPT GOC');
      expect(retry).toContain('Thieu truong De_Bai');
      expect(retry).toContain('SAI ĐỊNH DẠNG');
    });
  });
});
