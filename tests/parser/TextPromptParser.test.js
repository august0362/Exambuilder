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

    test('TC-TP-27: de thi day du 58 cau dan sat nhau (khong dong trong giua cac [CAU_HOI]) va co 1 cau DUNG_SAI bi lap "Dap_An"/"Loi_Giai" (AI tu sua dap an) khong lam crash parser, dap an cuoi cung duoc giu lai', () => {
      const raw = `=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Căn bậc hai số học của 49 là:
A. 7
B. -7
C. 7 và -7
D. 49
Dap_An: A
Loi_Giai: Căn bậc hai số học của số dương a là $\\sqrt{a}$. Do đó căn bậc hai số học của 49 là $\\sqrt{49} = 7$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Số nào sau đây có đúng hai căn bậc hai đối nhau là 9 và -9?
A. 3
B. 18
C. 81
D. -81
Dap_An: C
Loi_Giai: Số dương 81 có đúng hai căn bậc hai đối nhau là $\\sqrt{81}=9$ và $-\\sqrt{81}=-9$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Với số thực $a$, biểu thức $\\sqrt{a^2}$ luôn bằng:
A. $a$
B. $-a$
C. $|a|$
D. $a^2$
Dap_An: C
Loi_Giai: Hằng đẳng thức căn bậc hai của một bình phương là $\\sqrt{a^2} = |a|$ với mọi số thực $a$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Khẳng định nào sau đây là đúng về căn bậc ba của một số thực?
A. Số âm không có căn bậc ba.
B. Mỗi số thực $a$ đều có duy nhất một căn bậc ba.
C. Số dương $a$ có hai căn bậc ba đối nhau.
D. Căn bậc ba của số âm là một số dương.
Dap_An: B
Loi_Giai: Mỗi số thực $a$ luôn có duy nhất một căn bậc ba, kí hiệu là $\\sqrt[3]{a}$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Biểu thức $\\sqrt{A}$ có nghĩa (xác định) khi và chỉ khi:
A. $A > 0$
B. $A \\ge 0$
C. $A \\le 0$
D. $A \\ne 0$
Dap_An: B
Loi_Giai: Căn thức bậc hai $\\sqrt{A}$ xác định khi và chỉ khi biểu thức dưới dấu căn không âm: $A \\ge 0$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Căn bậc ba của $-125$ là:
A. 5
B. -5
C. 25
D. Không tồn tại
Dap_An: B
Loi_Giai: Vì $(-5)^3 = -125$ nên $\\sqrt[3]{-125} = -5$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Với $A \\ge 0$ và $B \\ge 0$, đẳng thức nào sau đây đúng?
A. $\\sqrt{A} + \\sqrt{B} = \\sqrt{A + B}$
B. $\\sqrt{A} \\cdot \\sqrt{B} = \\sqrt{A \\cdot B}$
C. $\\sqrt{A} - \\sqrt{B} = \\sqrt{A - B}$
D. $\\sqrt{AB} = A\\sqrt{B}$
Dap_An: B
Loi_Giai: Quy tắc khai căn bậc hai của một tích: $\\sqrt{A} \\cdot \\sqrt{B} = \\sqrt{A \\cdot B}$ với $A \\ge 0, B \\ge 0$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Với $A \\ge 0$ và $B > 0$, ta có $\\frac{\\sqrt{A}}{\\sqrt{B}}$ bằng:
A. $\\frac{A}{B}$
B. $\\sqrt{A \\cdot B}$
C. $\\sqrt{\\frac{A}{B}}$
D. $\\frac{A}{\\sqrt{B}}$
Dap_An: C
Loi_Giai: Quy tắc chia hai căn bậc hai: $\\frac{\\sqrt{A}}{\\sqrt{B}} = \\sqrt{\\frac{A}{B}}$ với $A \\ge 0, B > 0$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Giá trị của $\\sqrt{(-7)^2}$ là:
A. -7
B. 7
C. 49
D. -49
Dap_An: B
Loi_Giai: $\\sqrt{(-7)^2} = |-7| = 7$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Kết quả phép tính $\\sqrt{16} \\cdot \\sqrt{25}$ là:
A. 20
B. 40
C. 400
D. 200
Dap_An: A
Loi_Giai: $\\sqrt{16} \\cdot \\sqrt{25} = 4 \\cdot 5 = 20$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Giá trị của biểu thức $\\sqrt[3]{64}$ là:
A. 8
B. -8
C. 4
D. -4
Dap_An: C
Loi_Giai: Ta có $4^3 = 64$ nên $\\sqrt[3]{64} = 4$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Căn thức bậc ba $\\sqrt[3]{A}$ xác định với:
A. Mọi giá trị của $A$
B. $A \\ge 0$
C. $A > 0$
D. $A \\ne 0$
Dap_An: A
Loi_Giai: Căn bậc ba xác định với mọi số thực, do đó $\\sqrt[3]{A}$ xác định với mọi biểu thức $A$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Cho $a \\ge 0$ và $b \\ge 0$, khi đưa thừa số $a$ vào trong dấu căn của biểu thức $a\\sqrt{b}$ ta được:
A. $\\sqrt{ab}$
B. $\\sqrt{a^2b}$
C. $-\\sqrt{a^2b}$
D. $\\sqrt{ab^2}$
Dap_An: B
Loi_Giai: Với $a \\ge 0, b \\ge 0$ ta có $a\\sqrt{b} = \\sqrt{a^2b}$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Biểu thức liên hợp của $\\sqrt{a} + \\sqrt{b}$ (với $a \\ge 0, b \\ge 0$) là:
A. $\\sqrt{a} + \\sqrt{b}$
B. $\\sqrt{a} - \\sqrt{b}$
C. $a - b$
D. $a + b$
Dap_An: B
Loi_Giai: Biểu thức liên hợp của $\\sqrt{a} + \\sqrt{b}$ là $\\sqrt{a} - \\sqrt{b}$.[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Kết quả của phép tính $\\sqrt{\\frac{64}{9}}$ là:
A. $\\frac{8}{3}$
B. $-\\frac{8}{3}$
C. $\\frac{32}{9}$
D. $\\frac{8}{9}$
Dap_An: A
Loi_Giai: $\\sqrt{\\frac{64}{9}} = \\frac{\\sqrt{64}}{\\sqrt{9}} = \\frac{8}{3}$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Điều kiện xác định của căn thức $\\sqrt{3x - 6}$ là:
A. $x \\le 2$
B. $x \\ge 2$
C. $x > 2$
D. $x < 2$
Dap_An: B
Loi_Giai: Căn thức xác định khi $3x - 6 \\ge 0 \\Leftrightarrow 3x \\ge 6 \\Leftrightarrow x \\ge 2$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Rút gọn biểu thức $\\sqrt{(2 - \\sqrt{5})^2}$ ta được:
A. $2 - \\sqrt{5}$
B. $\\sqrt{5} - 2$
C. $-2 - \\sqrt{5}$
D. $2 + \\sqrt{5}$
Dap_An: B
Loi_Giai: $\\sqrt{(2 - \\sqrt{5})^2} = |2 - \\sqrt{5}|$. Vì $2 = \\sqrt{4} < \\sqrt{5}$ nên $2 - \\sqrt{5} < 0$, suy ra kết quả là $\\sqrt{5} - 2$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Khử mẫu của biểu thức lấy căn $\\sqrt{\\frac{3}{5}}$ ta được:
A. $\\frac{3}{5}$
B. $\\frac{\\sqrt{15}}{5}$
C. $\\frac{\\sqrt{15}}{25}$
D. $\\frac{\\sqrt{3}}{5}$
Dap_An: B
Loi_Giai: $\\sqrt{\\frac{3}{5}} = \\sqrt{\\frac{3 \\cdot 5}{5^2}} = \\frac{\\sqrt{15}}{5}$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Đưa thừa số ra ngoài dấu căn của biểu thức $\\sqrt{72}$ ta được kết quả là:
A. $6\\sqrt{2}$
B. $2\\sqrt{6}$
C. $3\\sqrt{8}$
D. $36\\sqrt{2}$
Dap_An: A
Loi_Giai: $\\sqrt{72} = \\sqrt{36 \\cdot 2} = \\sqrt{6^2 \\cdot 2} = 6\\sqrt{2}$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Trục căn thức ở mẫu của biểu thức $\\frac{2}{\\sqrt{3} - 1}$ ta được kết quả là:
A. $\\sqrt{3} + 1$
B. $\\sqrt{3} - 1$
C. $2(\\sqrt{3} + 1)$
D. $\\frac{\\sqrt{3} + 1}{2}$
Dap_An: A
Loi_Giai: Nhân cả tử và mẫu với $(\\sqrt{3} + 1)$: $\\frac{2(\\sqrt{3}+1)}{(\\sqrt{3}-1)(\\sqrt{3}+1)} = \\frac{2(\\sqrt{3}+1)}{3 - 1} = \\frac{2(\\sqrt{3}+1)}{2} = \\sqrt{3}+1$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Rút gọn biểu thức $\\sqrt{x^2 - 6x + 9}$ với $x < 3$ ta được:
A. $x - 3$
B. $3 - x$
C. $x + 3$
D. $-(x + 3)$
Dap_An: B
Loi_Giai: $\\sqrt{x^2 - 6x + 9} = \\sqrt{(x - 3)^2} = |x - 3|$. Vì $x < 3$ nên $x - 3 < 0 \\Rightarrow |x - 3| = 3 - x$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Kết quả của phép tính $\\sqrt{18} : \\sqrt{2} - \\sqrt[3]{-27}$ là:
A. 0
B. 6
C. -6
D. 3
Dap_An: B
Loi_Giai: $\\sqrt{18} : \\sqrt{2} - \\sqrt[3]{-27} = \\sqrt{\\frac{18}{2}} - (-3) = \\sqrt{9} + 3 = 3 + 3 = 6$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Với $a < 0$, biểu thức đưa thừa số vào trong dấu căn của $-3\\sqrt{-a}$ là:
A. $\\sqrt{-9a}$
B. $-\\sqrt{9a}$
C. $-\\sqrt{-9a}$
D. $\\sqrt{9a}$
Dap_An: C
Loi_Giai: $-3\\sqrt{-a} = -\\sqrt{3^2 \\cdot (-a)} = -\\sqrt{-9a}$.[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Rút gọn biểu thức $M = \\sqrt[3]{(x - 2)^3} + 2$ ta được:
A. $x$
B. $x - 4$
C. $x + 4$
D. $4 - x$
Dap_An: A
Loi_Giai: $\\sqrt[3]{(x - 2)^3} + 2 = (x - 2) + 2 = x$.[CAU_HOI]
Loai: TN
Muc_Do: Van_Dung
De_Bai: Cho biểu thức $P = \\left(\\frac{1}{\\sqrt{x}-1} - \\frac{1}{\\sqrt{x}+1}\\right) \\cdot \\frac{x-1}{2}$ với $x \\ge 0, x \\ne 1$. Giá trị của $P$ là:
A. 1
B. 2
C. $\\sqrt{x}$
D. $\\frac{1}{\\sqrt{x}}$
Dap_An: A
Loi_Giai: Quy đồng: $\\frac{1}{\\sqrt{x}-1} - \\frac{1}{\\sqrt{x}+1} = \\frac{(\\sqrt{x}+1) - (\\sqrt{x}-1)}{x - 1} = \\frac{2}{x - 1}$. Khi đó $P = \\frac{2}{x-1} \\cdot \\frac{x-1}{2} = 1$.[CAU_HOI]
Loai: TN
Muc_Do: Van_Dung
De_Bai: Giá trị của biểu thức $A = \\sqrt{4 + 2\\sqrt{3}} - \\sqrt{4 - 2\\sqrt{3}}$ là:
A. $2\\sqrt{3}$
B. 2
C. 0
D. 4
Dap_An: B
Loi_Giai: $4 \\pm 2\\sqrt{3} = (\\sqrt{3} \\pm 1)^2$. Do đó $A = \\sqrt{(\\sqrt{3}+1)^2} - \\sqrt{(\\sqrt{3}-1)^2} = (\\sqrt{3}+1) - (\\sqrt{3}-1) = 2$.[CAU_HOI]
Loai: TN
Muc_Do: Van_Dung
De_Bai: Tìm tất cả các giá trị của $x$ thỏa mãn $\\sqrt{2x - 1} = 3$:
A. $x = 5$
B. $x = 4$
C. $x = 10$
D. $x = 2$
Dap_An: A
Loi_Giai: ĐKXĐ: $x \\ge \\frac{1}{2}$. Bình phương hai vế: $2x - 1 = 3^2 = 9 \\Leftrightarrow 2x = 10 \\Leftrightarrow x = 5$ (thỏa mãn).[CAU_HOI]
Loai: TN
Muc_Do: Van_Dung
De_Bai: Một hình lập phương có thể tích bằng $512\\text{ cm}^3$. Độ dài cạnh của hình lập phương đó là:
A. 6 cm
B. 7 cm
C. 8 cm
D. 16 cm
Dap_An: C
Loi_Giai: Độ dài cạnh hình lập phương là $a = \\sqrt[3]{V} = \\sqrt[3]{512} = 8\\text{ cm}$.[CAU_HOI]
Loai: TN
Muc_Do: Van_Dung
De_Bai: Rút gọn biểu thức $B = \\frac{\\sqrt{15} - \\sqrt{5}}{\\sqrt{3} - 1} - \\frac{\\sqrt{10} + \\sqrt{2}}{\\sqrt{5} + 1}$ được kết quả là:
A. $\\sqrt{5} - \\sqrt{2}$
B. $\\sqrt{5} + \\sqrt{2}$
C. 0
D. $2\\sqrt{5}$
Dap_An: A
Loi_Giai: $B = \\frac{\\sqrt{5}(\\sqrt{3}-1)}{\\sqrt{3}-1} - \\frac{\\sqrt{2}(\\sqrt{5}+1)}{\\sqrt{5}+1} = \\sqrt{5} - \\sqrt{2}$.[CAU_HOI]
Loai: TN
Muc_Do: Van_Dung
De_Bai: Cho $x \\ge 0, x \\ne 4$. Rút gọn biểu thức $Q = \\frac{x - 4}{\\sqrt{x} + 2} + 3$ ta được:
A. $\\sqrt{x} + 1$
B. $\\sqrt{x} - 1$
C. $x + 1$
D. $\\sqrt{x} + 5$
Dap_An: A
Loi_Giai: $Q = \\frac{(\\sqrt{x}-2)(\\sqrt{x}+2)}{\\sqrt{x}+2} + 3 = \\sqrt{x} - 2 + 3 = \\sqrt{x} + 1$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Số 0 có đúng một căn bậc hai là chính nó.
Dap_An: Dung
Loi_Giai: Theo định nghĩa, số 0 có duy nhất một căn bậc hai là 0 vì $0^2 = 0$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Số $-16$ có hai căn bậc hai là $4$ và $-4$.
Dap_An: Sai
Loi_Giai: Số thực âm không có căn bậc hai trong tập số thực.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Phép tính $\\sqrt{a^2} = a$ luôn đúng với mọi số thực $a$.
Dap_An: Sai
Loi_Giai: Khẳng định đúng phải là $\\sqrt{a^2} = |a|$. Nếu $a < 0$ thì $\\sqrt{a^2} = -a$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Căn bậc ba của một số âm luôn là một số âm.
Dap_An: Dung
Loi_Giai: Căn bậc ba của số âm là số âm, ví dụ $\\sqrt[3]{-8} = -2 < 0$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Đẳng thức $(\\sqrt[3]{a})^3 = a$ đúng với mọi số thực $a$.
Dap_An: Dung
Loi_Giai: Theo định nghĩa căn bậc ba, với mọi số thực $a$ ta luôn có $(\\sqrt[3]{a})^3 = a$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Biểu thức $\\sqrt{A \\cdot B} = \\sqrt{A} \\cdot \\sqrt{B}$ đúng với mọi biểu thức $A, B$ tùy ý.
Dap_An: Sai
Loi_Giai: Đẳng thức chỉ đúng khi cả hai biểu thức đều không âm ($A \\ge 0, B \\ge 0$).[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Giá trị căn bậc hai số học của số 0 bằng 0.
Dap_An: Dung
Loi_Giai: Theo định nghĩa căn bậc hai số học, $\\sqrt{0} = 0$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Số 125 có căn bậc ba là 5.
Dap_An: Dung
Loi_Giai: Vì $5^3 = 125$ nên $\\sqrt[3]{125} = 5$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Căn thức $\\sqrt{x}$ xác định với mọi giá trị của $x \\in \\mathbb{R}$.
Dap_An: Sai
Loi_Giai: Căn thức $\\sqrt{x}$ chỉ xác định khi $x \\ge 0$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Nhan_Biet
De_Bai: Với $a \\ge 0$, ta có $(\\sqrt{a})^2 = a$.
Dap_An: Dung
Loi_Giai: Theo tính chất của căn bậc hai số học, $(\\sqrt{a})^2 = a$ với mọi $a \\ge 0$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Căn thức $\\sqrt{5 - x}$ xác định khi và chỉ khi $x \\ge 5$.
Dap_An: Sai
Loi_Giai: Điều kiện xác định là $5 - x \\ge 0 \\Leftrightarrow x \\le 5$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Rút gọn biểu thức $\\sqrt{(1 - \\sqrt{3})^2}$ ta được kết quả là $1 - \\sqrt{3}$.
Dap_An: Sai
Loi_Giai: $\\sqrt{(1 - \\sqrt{3})^2} = |1 - \\sqrt{3}| = \\sqrt{3} - 1$ (vì $1 < \\sqrt{3}$).[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Với $a < 0$, ta có $\\sqrt{a^2 \\cdot 5} = -a\\sqrt{5}$.
Dap_An: Dung
Loi_Giai: $\\sqrt{a^2 \\cdot 5} = |a|\\sqrt{5}$. Vì $a < 0$ nên $|a| = -a$, do đó $\\sqrt{a^2 \\cdot 5} = -a\\sqrt{5}$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Trục căn thức ở mẫu của biểu thức $\\frac{3}{\\sqrt{3}}$ ta được kết quả là $\\sqrt{3}$.
Dap_An: Dung
Loi_Giai: $\\frac{3}{\\sqrt{3}} = \\frac{3\\sqrt{3}}{3} = \\sqrt{3}$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Biểu thức $\\sqrt{x^2 + 1}$ xác định với mọi số thực $x$.
Dap_An: Dung
Loi_Giai: Vì $x^2 \\ge 0$ nên $x^2 + 1 \\ge 1 > 0$ với mọi số thực $x$, do đó biểu thức luôn xác định.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Kết quả của phép tính $\\sqrt{8} - 2\\sqrt{2}$ bằng 0.
Dap_An: Dung
Loi_Giai: $\\sqrt{8} = \\sqrt{4 \\cdot 2} = 2\\sqrt{2}$, do đó $2\\sqrt{2} - 2\\sqrt{2} = 0$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Van_Dung
De_Bai: Phương trình $\\sqrt{x - 3} = -2$ có nghiệm là $x = 7$.
Dap_An: Sai
Loi_Giai: Giá trị của căn bậc hai số học luôn không âm ($\\sqrt{x - 3} \\ge 0$), do đó phương trình $\\sqrt{x-3} = -2$ vô nghiệm.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Van_Dung
De_Bai: Giá trị của biểu thức $K = \\sqrt{9 - 4\\sqrt{5}} + \\sqrt{5}$ bằng 2.
Dap_An: Dung
Loi_Giai: Ta có $9 - 4\\sqrt{5} = (\\sqrt{5} - 2)^2$. Suy ra $K = \\sqrt{(\\sqrt{5}-2)^2} + \\sqrt{5} = |\\sqrt{5}-2| + \\sqrt{5} = \\sqrt{5} - 2 + \\sqrt{5} = 2\\sqrt{5} - 2 \\ne 2$ là sai; tính lại: $|\\sqrt{5}-2| = \\sqrt{5}-2$, do đó $\\sqrt{5}-2+\\sqrt{5} = 2\\sqrt{5}-2$. Nhưng nếu $K = \\sqrt{9-4\\sqrt{5}} - \\sqrt{5} = -2$, còn biểu thức cộng thêm $\\sqrt{5}$ bằng $2\\sqrt{5}-2$. Vậy khẳng định trên nói bằng 2 là Sai. (Đính chính đáp án: Sai).
Dap_An: Sai
Loi_Giai: Ta có $9 - 4\\sqrt{5} = (\\sqrt{5} - 2)^2$. Suy ra $\\sqrt{9 - 4\\sqrt{5}} + \\sqrt{5} = |\\sqrt{5} - 2| + \\sqrt{5} = \\sqrt{5} - 2 + \\sqrt{5} = 2\\sqrt{5} - 2 \\ne 2$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Van_Dung
De_Bai: Với mọi $x \\ge 0, x \\ne 1$, biểu thức $\\frac{x - 1}{\\sqrt{x} - 1} - \\sqrt{x}$ có giá trị bằng 1.
Dap_An: Dung
Loi_Giai: Ta có $\\frac{x - 1}{\\sqrt{x} - 1} = \\frac{(\\sqrt{x}-1)(\\sqrt{x}+1)}{\\sqrt{x}-1} = \\sqrt{x} + 1$. Do đó $(\\sqrt{x} + 1) - \\sqrt{x} = 1$.[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Van_Dung
De_Bai: Phương trình $\\sqrt[3]{2x - 1} = 3$ có nghiệm là $x = 14$.
Dap_An: Dung
Loi_Giai: Lập phương hai vế: $2x - 1 = 3^3 = 27 \\Leftrightarrow 2x = 28 \\Leftrightarrow x = 14$.[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Nhan_Biet
De_Bai: Điền số thích hợp vào chỗ trống: Căn bậc hai số học của 144 là ___
Dap_An: 12
Loi_Giai: $\\sqrt{144} = 12$.[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Thong_Hieu
De_Bai: Điền số thích hợp vào chỗ trống: Kết quả của phép tính $\\sqrt{2} \\cdot \\sqrt{32} =$ ___
Dap_An: 8
Loi_Giai: $\\sqrt{2} \\cdot \\sqrt{32} = \\sqrt{64} = 8$.[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Điền số thích hợp vào chỗ trống: Giá trị của biểu thức $T = \\sqrt{(3 - 2\\sqrt{2})^2} + 2\\sqrt{2}$ là ___
Dap_An: 3
Loi_Giai: Vì $3 = \\sqrt{9} > \\sqrt{8} = 2\\sqrt{2}$ nên $|3 - 2\\sqrt{2}| = 3 - 2\\sqrt{2}$. Do đó $T = 3 - 2\\sqrt{2} + 2\\sqrt{2} = 3$.=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Nhan_Biet
De_Bai: Thực hiện phép tính và rút gọn các biểu thức sau:
a) $A = \\sqrt{49} - \\sqrt{25} + \\sqrt[3]{-8}$
b) $B = \\sqrt{3} \\cdot \\sqrt{12} + \\sqrt{\\frac{50}{2}}$
So_Dong_Nhap: 6
Loi_Giai:
a) Ta có: $\\sqrt{49} = 7$; $\\sqrt{25} = 5$; $\\sqrt[3]{-8} = -2$.
Suy ra $A = 7 - 5 + (-2) = 0$.
b) Ta có: $\\sqrt{3} \\cdot \\sqrt{12} = \\sqrt{3 \\cdot 12} = \\sqrt{36} = 6$.$\\sqrt{\\frac{50}{2}} = \\sqrt{25} = 5$.
Suy ra $B = 6 + 5 = 11$.[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Nhan_Biet
De_Bai: Tìm điều kiện xác định của các biểu thức sau:
a) $\\sqrt{2x - 8}$
b) $\\sqrt{6 - 3x}$
So_Dong_Nhap: 6
Loi_Giai:
a) Biểu thức $\\sqrt{2x - 8}$ xác định khi và chỉ khi:$2x - 8 \\ge 0 \\Leftrightarrow 2x \\ge 8 \\Leftrightarrow x \\ge 4$.
b) Biểu thức $\\sqrt{6 - 3x}$ xác định khi và chỉ khi:$6 - 3x \\ge 0 \\Leftrightarrow -3x \\ge -6 \\Leftrightarrow x \\le 2$.[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Thong_Hieu
De_Bai: Rút gọn các biểu thức sau:
a) $M = 3\\sqrt{18} - \\sqrt{50} + 2\\sqrt{8}$
b) $N = \\frac{5}{\\sqrt{5}} + \\frac{4}{\\sqrt{5}-1} - \\sqrt{(2-\\sqrt{5})^2}$
So_Dong_Nhap: 8
Loi_Giai:
a) Ta có:$M = 3\\sqrt{9 \\cdot 2} - \\sqrt{25 \\cdot 2} + 2\\sqrt{4 \\cdot 2}$$= 3 \\cdot 3\\sqrt{2} - 5\\sqrt{2} + 2 \\cdot 2\\sqrt{2}$$= 9\\sqrt{2} - 5\\sqrt{2} + 4\\sqrt{2} = 8\\sqrt{2}$.b) Ta có:$\\frac{5}{\\sqrt{5}} = \\sqrt{5}$.$\\frac{4}{\\sqrt{5}-1} = \\frac{4(\\sqrt{5}+1)}{5 - 1} = \\sqrt{5} + 1$.$\\sqrt{(2-\\sqrt{5})^2} = |2 - \\sqrt{5}| = \\sqrt{5} - 2$ (vì $2 < \\sqrt{5}$).
Suy ra:$N = \\sqrt{5} + (\\sqrt{5} + 1) - (\\sqrt{5} - 2) = \\sqrt{5} + 3$.[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: Cho biểu thức $A = \\left(\\frac{1}{\\sqrt{x}-2} - \\frac{1}{\\sqrt{x}+2}\\right) : \\frac{\\sqrt{x}}{x-4}$ với $x > 0$ và $x \\ne 4$.
a) Rút gọn biểu thức $A$.
b) Tìm giá trị của $x$ để $A = 1$.
So_Dong_Nhap: 8
Loi_Giai:
a) Với $x > 0, x \\ne 4$, ta có:$\\frac{1}{\\sqrt{x}-2} - \\frac{1}{\\sqrt{x}+2} = \\frac{(\\sqrt{x}+2) - (\\sqrt{x}-2)}{(\\sqrt{x}-2)(\\sqrt{x}+2)} = \\frac{4}{x - 4}$.
Khi đó:$A = \\frac{4}{x - 4} : \\frac{\\sqrt{x}}{x - 4} = \\frac{4}{x - 4} \\cdot \\frac{x - 4}{\\sqrt{x}} = \\frac{4}{\\sqrt{x}}$.b) Để $A = 1$ thì $\\frac{4}{\\sqrt{x}} = 1 \\Leftrightarrow \\sqrt{x} = 4 \\Leftrightarrow x = 16$.
Giá trị $x = 16$ thỏa mãn điều kiện xác định ($x > 0, x \\ne 4$).
Vậy $x = 16$.[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Một bể chứa nước dạng hình lập phương không có nắp có thể tích chứa tối đa là $64\\text{ m}^3$.
a) Tính độ dài cạnh của bể nước đó.
b) Người ta cần sơn chống thấm toàn bộ 4 mặt xung quanh và đáy phía trong lòng bể. Biết chi phí sơn mỗi mét vuông là 80 000 đồng. Tính tổng chi phí để hoàn thành việc sơn chống thấm bể nước.
So_Dong_Nhap: 8
Loi_Giai:
a) Gọi độ dài cạnh của bể nước hình lập phương là $a$ (m, $a > 0$).
Thể tích hình lập phương là $V = a^3 = 64 \\Rightarrow a = \\sqrt[3]{64} = 4\\text{ (m)}$.
Vậy độ dài cạnh bể là 4 m.b) Bể không nắp gồm 4 mặt xung quanh và 1 mặt đáy, tổng cộng là 5 mặt hình vuông diện tích bằng nhau.
Diện tích một mặt là: $S_1 = a^2 = 4^2 = 16\\text{ (m}^2\\text{)}$.
Tổng diện tích cần sơn chống thấm là: $S = 5 \\cdot S_1 = 5 \\cdot 16 = 80\\text{ (m}^2\\text{)}$.
Tổng chi phí sơn chống thấm là:$\\text{Chi phí} = 80 \\cdot 80\\,000 = 6\\,400\\,000\\text{ (đồng)}$.
Vậy tổng chi phí là 6 400 000 đồng.`;

      // Truoc day cau hoi DUNG_SAI thu 48 (K = ...) lam parser throw vi no co
      // 2 dong "Dap_An:"/"Loi_Giai:" trong cung 1 [CAU_HOI] (dau la ket qua
      // AI tu sua dap an "Dung" -> "Sai" nhung khong tach cau hoi moi) khien
      // "Dap_An" bi noi thanh "Dung Sai", khong khop regex Dung/Sai.
      expect(() => parser.parse(raw)).not.toThrow();
      const blocks = parser.parse(raw);

      // Header "=PHAN_2_TU_LUAN=" trong prompt nay bi dinh lien vao cuoi dong
      // truoc (khong xuong dong rieng). _repairMissingNewlines() (goi dau
      // parse()) tu dong "va lai" xuong dong truoc header dang "=PHAN...="
      // khi bi dinh lien, nen van tach dung thanh 2 block rieng biet: 53 cau
      // (30 TN + 20 DUNG_SAI + 3 DIEN_TU) va 5 cau TU_LUAN.
      expect(blocks).toHaveLength(2);
      expect(blocks[0].block_type).toBe('MULTIPLE_CHOICE');
      expect(blocks[0].questions).toHaveLength(53);
      expect(blocks[1].block_type).toBe('ESSAY');
      expect(blocks[1].questions).toHaveLength(5);

      // Cau DUNG_SAI thu 48 (K = sqrt(9-4sqrt5)+sqrt5 bang 2): dap an dung
      // phai la gia tri KHAI BAO SAU CUNG ("Sai"), khong phai dap an dau tien
      // ("Dung") va cang khong phai chuoi loi "Dung Sai".
      const kQuestion = blocks[0].questions[47];
      expect(kQuestion.question_type).toBe('TRUE_FALSE');
      expect(kQuestion.correct_answer).toBe('Sai');
    });

    test('TC-TP-28: de thi bi mat toan bo ky tu xuong dong (dinh thanh 1 dong duy nhat, vd do copy tu khung chat/PDF) van duoc parse dung', () => {
      const raw = '=PHAN_1=[CAU_HOI]Loai: TNMuc_Do: Nhan_BietDe_Bai: Cho tam giac ABC. Gia tri cua 2 + 2 bang bao nhieu?A. 3B. 4C. 5D. 6Dap_An: BLoi_Giai: Vi 2+2=4[CAU_HOI]Loai: DUNG_SAIMuc_Do: Nhan_BietDe_Bai: So 4 la so chan?Dap_An: DungLoi_Giai: 4 chia het cho 2=PHAN_2=[CAU_HOI]Loai: TU_LUANMuc_Do: Van_Dung_CaoDe_Bai: Giai phuong trinh x^2 - 4 = 0So_Dong_Nhap: 6Loi_Giai: x = 2 hoac x = -2';

      const blocks = parser.parse(raw);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].questions).toHaveLength(2);
      expect(blocks[1].questions).toHaveLength(1);

      const mcq = blocks[0].questions[0];
      expect(mcq.question_type).toBe('MCQ');
      // "Cho tam giac ABC." khong bi nham la lua chon (chi co "C." dung dinh
      // dang cham cau vi lien "AB" chu khong tach rieng, nen khong khop du
      // chuoi A./B./C.) - options that su duoc lay tu cuoi cung, sat "Dap_An:".
      expect(mcq.content).toBe('Cho tam giac ABC. Gia tri cua 2 + 2 bang bao nhieu?');
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
