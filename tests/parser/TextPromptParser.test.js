const { TextPromptParser } = require('../../backend/parser/TextPromptParser.js');

/**
 * TextPromptParser bóc tách văn bản thô (định dạng chuẩn cho prompt Gemini,
 * xem Gemini_Prompt_Unified.txt) thành mảng "blocks" gồm block_type,
 * block_title và danh sách questions.
 */
describe('TextPromptParser', () => {
  let parser;
  beforeEach(() => { parser = new TextPromptParser(); });

  // ---------------------------------------------------------------------
  // 1. HAPPY PATH
  // ---------------------------------------------------------------------
  describe('Happy Path', () => {
    test('TC-TP-01: parse day du 1 de gom MCQ + DUNG_SAI (block trac nghiem) va 1 TU_LUAN (block tu luan)', () => {
      const raw = `===PHAN_1_TRAC_NGHIEM===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: 2 + 2 bang bao nhieu?
A. 3
B. 4
C. 5
D. 6
Dap_An: B
Loi_Giai: Vi 2+2=4

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: So 4 la so chan?
Dap_An: Dung
Loi_Giai: 4 chia het cho 2

===PHAN_2_TU_LUAN===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Giai phuong trinh x^2 - 4 = 0
So_Dong_Nhap: 6
Loi_Giai: x = 2 hoac x = -2
`;
      const blocks = parser.parse(raw);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].block_type).toBe('MULTIPLE_CHOICE');
      expect(blocks[0].questions).toHaveLength(2);
      expect(blocks[1].block_type).toBe('ESSAY');
      expect(blocks[1].questions).toHaveLength(1);

      const mcq = blocks[0].questions[0];
      expect(mcq.question_type).toBe('MCQ');
      expect(mcq.difficulty_level).toBe('NB');
      expect(mcq.correct_answer).toBe('B');
      expect(mcq.options).toEqual([
        { option_key: 'A', option_text: '3', is_correct: false },
        { option_key: 'B', option_text: '4', is_correct: true },
        { option_key: 'C', option_text: '5', is_correct: false },
        { option_key: 'D', option_text: '6', is_correct: false }
      ]);

      const tf = blocks[0].questions[1];
      expect(tf.question_type).toBe('TRUE_FALSE');
      expect(tf.correct_answer).toBe('Dung');

      const essay = blocks[1].questions[0];
      expect(essay.question_type).toBe('ESSAY');
      expect(essay.draft_lines_count).toBe(6);
    });

    test('TC-TP-02: cau DIEN_TU duoc parse thanh FILL_BLANK voi correct_answer tuong ung', () => {
      const raw = `===PHAN_1===
[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Thu do cua Viet Nam la ___.
Dap_An: Ha Noi
Loi_Giai: Ha Noi la thu do.
`;
      const [block] = parser.parse(raw);
      expect(block.questions[0].question_type).toBe('FILL_BLANK');
      expect(block.questions[0].correct_answer).toBe('Ha Noi');
    });

    test('TC-TP-03: noi dung De_Bai / Loi_Giai trai dai nhieu dong duoc noi lai bang khoang trang', () => {
      const raw = `===PHAN_1===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: Trinh bay nguyen nhan
va he qua cua bien doi khi hau
toan cau.
Loi_Giai: Can neu it nhat
3 nguyen nhan chinh.
`;
      const [block] = parser.parse(raw);
      expect(block.questions[0].content).toBe('Trinh bay nguyen nhan va he qua cua bien doi khi hau toan cau.');
      expect(block.questions[0].explanation).toBe('Can neu it nhat 3 nguyen nhan chinh.');
    });

    test('TC-TP-04: tieu de block duoc dinh dang tu ten section (bo tien to PHAN_x_, thay _ bang khoang trang)', () => {
      const raw = `===PHAN_1_TRAC_NGHIEM===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: A hay B?
A. A
B. B
Dap_An: A
`;
      const [block] = parser.parse(raw);
      expect(block.block_title).toBe('Trắc nghiệm');
    });

    test('TC-TP-05: nhieu loai cau (TN, DUNG_SAI, DIEN_TU) trong cung 1 section duoc gom vao 1 block MULTIPLE_CHOICE', () => {
      const raw = `===PHAN_1===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Cau 1?
A. X
B. Y
Dap_An: A

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Cau 2?
Dap_An: Sai

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Nhan_Biet
De_Bai: Cau 3?
Dap_An: abc
`;
      const [block] = parser.parse(raw);
      expect(block.block_type).toBe('MULTIPLE_CHOICE');
      expect(block.questions.map(q => q.question_type)).toEqual(['MCQ', 'TRUE_FALSE', 'FILL_BLANK']);
    });
  });

  // ---------------------------------------------------------------------
  // 2. EDGE CASES
  // ---------------------------------------------------------------------
  describe('Edge Cases', () => {
    test('TC-TP-06: MCQ voi dung 2 lua chon (bien duoi cua so luong dap an) van hop le', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Dung hay sai kieu TN 2 dap an?
A. Dung
B. Sai
Dap_An: A
`;
      const [block] = parser.parse(raw);
      expect(block.questions[0].options).toHaveLength(2);
    });

    test('TC-TP-07: MCQ voi 3 lua chon (khong co D) van hop le', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Chon 1 trong 3?
A. Mot
B. Hai
C. Ba
Dap_An: C
`;
      const [block] = parser.parse(raw);
      expect(block.questions[0].options).toHaveLength(3);
      expect(block.questions[0].correct_answer).toBe('C');
    });

    test('TC-TP-08: TU_LUAN khong khai bao So_Dong_Nhap se mac dinh 5 dong', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: Trinh bay...
`;
      const [block] = parser.parse(raw);
      expect(block.questions[0].draft_lines_count).toBe(5);
    });

    test.each([['0'], ['-3'], ['abc']])(
      'TC-TP-09: TU_LUAN voi So_Dong_Nhap khong hop le (%s) se fallback ve 5 dong',
      (value) => {
        const raw = `===P===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: Trinh bay...
So_Dong_Nhap: ${value}
`;
        const [block] = parser.parse(raw);
        expect(block.questions[0].draft_lines_count).toBe(5);
      }
    );

    test('TC-TP-10: dong trong giua cac truong khong lam hong ket qua parse', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet

De_Bai: Cau hoi co dong trong?

A. Co
B. Khong

Dap_An: A
`;
      const [block] = parser.parse(raw);
      expect(block.questions[0].content).toBe('Cau hoi co dong trong?');
      expect(block.questions[0].correct_answer).toBe('A');
    });

    test('TC-TP-11: van ban khong co header =...= van duoc parse voi block mac dinh', () => {
      const raw = `[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Khong co section header?
A. Co
B. Khong
Dap_An: A
`;
      const blocks = parser.parse(raw);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].questions).toHaveLength(1);
    });

    // Da sua: header section chi can it nhat 1 dau "=" o dau va cuoi dong
    // (^=+\s*(.+?)\s*=+$), khong bat buoc dung 3 dau "===" nhu truoc.
    test.each(['=P=', '==P==', '===P===', '====P===='])(
      'TC-TP-25: header "%s" (so luong dau = bat ky >= 1, doi xung hay khong deu duoc) duoc nhan dien dung',
      (header) => {
        const raw = `${header}
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: A hay B?
A. A
B. B
Dap_An: A
`;
        const [block] = parser.parse(raw);
        expect(block.block_title).toBe('P');
        expect(block.questions).toHaveLength(1);
      }
    );

    test('TC-TP-26: header voi so dau = khong doi xung o hai dau (vd "=P===") van duoc nhan dien', () => {
      const raw = `=P===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: A hay B?
A. A
B. B
Dap_An: A
`;
      const [block] = parser.parse(raw);
      expect(block.block_title).toBe('P');
    });

    // Da sua gap: DIFFICULTY_MAP duoc tra cuu khong phan biet hoa/thuong
    // (rawDifficulty.toLowerCase()), nen "nhan_biet", "NHAN_BIET",
    // "Nhan_Biet" deu duoc chuan hoa dung ve 'NB'.
    test.each(['Nhan_Biet', 'nhan_biet', 'NHAN_BIET', 'nHaN_bIeT'])(
      'TC-TP-12: Muc_Do khong phan biet hoa/thuong ("%s") van duoc chuan hoa dung',
      (value) => {
        const raw = `===P===
[CAU_HOI]
Loai: TN
Muc_Do: ${value}
De_Bai: Case khong con nhay cam?
A. Co
B. Khong
Dap_An: A
`;
        const [block] = parser.parse(raw);
        expect(block.questions[0].difficulty_level).toBe('NB');
      }
    );
  });

  // ---------------------------------------------------------------------
  // 3. NEGATIVE CASES
  // ---------------------------------------------------------------------
  describe('Negative Cases', () => {
    test('TC-TP-13: chuoi rong hoac chi co khoang trang bi tu choi', () => {
      expect(() => parser.parse('')).toThrow('Noi dung dan vao dang rong.');
      expect(() => parser.parse('   \n  \n')).toThrow('Noi dung dan vao dang rong.');
    });

    test('TC-TP-14: Loai khong hop le nem loi kem vi tri (phan/cau)', () => {
      const raw = `===P===
[CAU_HOI]
Loai: KHONG_TON_TAI
Muc_Do: Nhan_Biet
De_Bai: abc
`;
      expect(() => parser.parse(raw)).toThrow(/Phan 1 - Cau hoi 1.*Loai/);
    });

    test('TC-TP-15: Muc_Do bi thieu nem loi', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TN
De_Bai: abc
A. 1
B. 2
Dap_An: A
`;
      expect(() => parser.parse(raw)).toThrow(/Muc_Do/);
    });

    test('TC-TP-16: thieu De_Bai (noi dung rong) nem loi', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
`;
      expect(() => parser.parse(raw)).toThrow(/De_Bai/);
    });

    test('TC-TP-17: MCQ chi co 1 lua chon nem loi "it nhat 2 lua chon"', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: abc
A. Chi 1 lua chon
Dap_An: A
`;
      expect(() => parser.parse(raw)).toThrow(/it nhat 2 lua chon/);
    });

    test('TC-TP-18: Dap_An khong khop voi bat ky lua chon nao nem loi', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: abc
A. 1
B. 2
Dap_An: E
`;
      expect(() => parser.parse(raw)).toThrow(/khong khop/);
    });

    test('TC-TP-19: DUNG_SAI voi Dap_An khac "Dung"/"Sai" nem loi', () => {
      const raw = `===P===
[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: abc
Dap_An: Yes
`;
      expect(() => parser.parse(raw)).toThrow(/Dung.*Sai|Dap_An/);
    });

    test('TC-TP-20: DIEN_TU thieu Dap_An nem loi', () => {
      const raw = `===P===
[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Nhan_Biet
De_Bai: abc
`;
      expect(() => parser.parse(raw)).toThrow(/thieu "Dap_An"/);
    });

    test('TC-TP-21: cac section deu rong (khong co noi dung cau hoi nao) nem loi "khong tim thay khoi cau hoi"', () => {
      // Ca hai section deu khong co than bai (body rong) vi header noi tiep
      // nhau ngay lap tuc -> khong section nao sinh ra chunk cau hoi nao.
      const raw = `===PHAN_1===
===PHAN_2===
`;
      expect(() => parser.parse(raw)).toThrow(/Khong tim thay khoi cau hoi/);
    });

    test('TC-TP-22 [Injection]: noi dung chua the HTML/script duoc giu nguyen dang chuoi, khong bi thuc thi', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: <script>alert('xss')</script> va '; DROP TABLE EXAM;--
A. 1
B. 2
Dap_An: A
`;
      const [block] = parser.parse(raw);
      expect(block.questions[0].content).toContain("<script>alert('xss')</script>");
      expect(block.questions[0].content).toContain("DROP TABLE EXAM");
      // Parser chi la string-processing thuan tuy (khong eval/exec), nen day la
      // du lieu an toan o tang parser. Trach nhiem escape HTML khi hien thi
      // thuoc ve tang frontend (script.js dung textContent, xem README).
    });
  });

  // ---------------------------------------------------------------------
  // 4. EXCEPTION / ERROR HANDLING
  // ---------------------------------------------------------------------
  describe('Exception Handling', () => {
    test('TC-TP-23: null/undefined duoc bao loi than thien (khong crash)', () => {
      expect(() => parser.parse(null)).toThrow('Noi dung dan vao dang rong.');
      expect(() => parser.parse(undefined)).toThrow('Noi dung dan vao dang rong.');
    });

    // Da sua gap: parse() kiem tra `typeof rawContent !== 'string'` truoc
    // khi goi .trim(), nen cac gia tri "truthy" nhung khong phai string
    // (number, object, array...) deu nhan loi nghiep vu than thien thay vi
    // crash bang TypeError.
    test.each([123, {}, [], true])(
      'TC-TP-24: input khong phai string (%p) nhan loi nghiep vu than thien, khong crash',
      (value) => {
        expect(() => parser.parse(value)).toThrow('Noi dung dan vao dang rong.');
      }
    );
  });
});
