const { FileUploadParser } = require('../../backend/parser/FileUploadParser.js');
const { Document, Packer, Paragraph } = require('docx');

/**
 * Tao mot tep .docx that (dung chinh thu vien `docx` da dung de XUAT Word)
 * de lam fixture kiem thu cho chieu NHAP Word, thay vi commit file nhi phan
 * vao repo. Moi phan tu trong `lines` la 1 doan van rieng - mammoth se noi
 * lai bang '\n' khi trich xuat raw text.
 */
async function buildDocxFile(lines, filename = 'de.docx') {
  const doc = new Document({ sections: [{ children: lines.map(line => new Paragraph({ text: line })) }] });
  const buffer = await Packer.toBuffer(doc);
  return new File([buffer], filename);
}

describe('FileUploadParser', () => {
  let parser;
  beforeEach(() => { parser = new FileUploadParser(); });

  // ---------------------------------------------------------------------
  // 1. HAPPY PATH
  // ---------------------------------------------------------------------
  describe('Happy Path', () => {
    test('TC-FP-01: JSON dang { blocks: [...] } duoc chap nhan nguyen ven', () => {
      const payload = {
        blocks: [{ block_type: 'MULTIPLE_CHOICE', block_title: 'Phan I', questions: [{ question_type: 'MCQ', content: 'X?', options: [] }] }]
      };
      const result = parser.parse(JSON.stringify(payload), 'de.json');
      expect(result).toEqual(payload.blocks);
    });

    test('TC-FP-02: JSON dang mang block thuan (khong boc trong { blocks })', () => {
      const blocks = [{ block_type: 'ESSAY', block_title: 'Phan II', questions: [{ question_type: 'ESSAY', content: 'Y?' }] }];
      const result = parser.parse(JSON.stringify(blocks), 'de.json');
      expect(result).toEqual(blocks);
    });

    test('TC-FP-03: CSV hop le duoc nhom theo cot "section" thanh cac block', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,c,d,dap_an,loi_giai,so_dong_nhap
Phan I,TN,Nhan_Biet,2+2=?,3,4,5,6,B,vi 2+2=4,
Phan II,TU_LUAN,Van_Dung_Cao,Giai phuong trinh...,,,,,,huong dan giai,8
`;
      const blocks = parser.parse(csv, 'de.csv');
      expect(blocks).toHaveLength(2);
      const mcqBlock = blocks.find(b => b.block_title === 'Phan I');
      const essayBlock = blocks.find(b => b.block_title === 'Phan II');
      expect(mcqBlock.block_type).toBe('MULTIPLE_CHOICE');
      expect(mcqBlock.questions[0].correct_answer).toBe('B');
      expect(essayBlock.block_type).toBe('ESSAY');
      expect(essayBlock.questions[0].draft_lines_count).toBe(8);
    });

    test('TC-FP-04b: CSV voi dong DUNG_SAI va DIEN_TU duoc parse dung question_type', () => {
      const csv = `section,loai,muc_do,de_bai,dap_an\nP,DUNG_SAI,Nhan_Biet,So 4 la so chan?,Dung\nP,DIEN_TU,Nhan_Biet,Thu do VN la?,Ha Noi\n`;
      const [block] = parser.parse(csv, 'de.csv');
      expect(block.questions[0].question_type).toBe('TRUE_FALSE');
      expect(block.questions[0].correct_answer).toBe('Dung');
      expect(block.questions[1].question_type).toBe('FILL_BLANK');
      expect(block.questions[1].correct_answer).toBe('Ha Noi');
    });

    test('TC-FP-04: file .txt duoc uy quyen cho TextPromptParser', () => {
      const raw = `===P===
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: 1+1=?
A. 1
B. 2
Dap_An: B
`;
      const blocks = parser.parse(raw, 'de.txt');
      expect(blocks[0].questions[0].correct_answer).toBe('B');
    });
  });

  // ---------------------------------------------------------------------
  // 2. EDGE CASES
  // ---------------------------------------------------------------------
  describe('Edge Cases', () => {
    test('TC-FP-05: CSV MCQ chi co 3 lua chon (khong co cot d) van hop le', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,c,dap_an\nP,TN,Nhan_Biet,abc,1,2,3,C\n`;
      const blocks = parser.parse(csv, 'de.csv');
      expect(blocks[0].questions[0].options).toHaveLength(3);
    });

    test('TC-FP-06: dong CSV thieu gia tri "section" duoc gom vao block mac dinh "Cau hoi"', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,dap_an\n,TN,Nhan_Biet,abc,1,2,A\n`;
      const blocks = parser.parse(csv, 'de.csv');
      expect(blocks[0].block_title).toBe('Cau hoi');
    });

    test('TC-FP-07: truong CSV co dau phay ben trong duoc bao boc bang dau ngoac kep', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,dap_an\nP,TN,Nhan_Biet,"Ha Noi, Viet Nam o dau?",Chau A,Chau Au,A\n`;
      const blocks = parser.parse(csv, 'de.csv');
      expect(blocks[0].questions[0].content).toBe('Ha Noi, Viet Nam o dau?');
    });

    test('TC-FP-08: dau ngoac kep duoc escape ("") ben trong truong duoc giai ma dung', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,dap_an\nP,TN,Nhan_Biet,"No noi ""xin chao""",A,B,A\n`;
      const blocks = parser.parse(csv, 'de.csv');
      expect(blocks[0].questions[0].content).toBe('No noi "xin chao"');
    });

    test('TC-FP-09: phan mo rong tep viet hoa (.CSV) van duoc nhan dien dung', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,dap_an\nP,TN,Nhan_Biet,abc,1,2,A\n`;
      const blocks = parser.parse(csv, 'DATA.CSV');
      expect(blocks).toHaveLength(1);
    });

    test('TC-FP-10: dong trong trong CSV duoc bo qua, khong tao ra block rong', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,dap_an\nP,TN,Nhan_Biet,abc,1,2,A\n\n\n`;
      const blocks = parser.parse(csv, 'de.csv');
      expect(blocks[0].questions).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // 3. NEGATIVE CASES
  // ---------------------------------------------------------------------
  describe('Negative Cases', () => {
    test('TC-FP-11: JSON co loi cu phap nem loi ro rang', () => {
      expect(() => parser.parse('{ invalid json', 'de.json')).toThrow(/Tep JSON khong hop le/);
    });

    test('TC-FP-12: JSON thieu mang "blocks" nem loi', () => {
      expect(() => parser.parse(JSON.stringify({}), 'de.json')).toThrow(/phai chua mang "blocks"/);
      expect(() => parser.parse(JSON.stringify({ blocks: 'not-an-array' }), 'de.json')).toThrow(/phai chua mang "blocks"/);
    });

    test('TC-FP-13: block JSON thieu block_type hoac questions nem loi kem chi so khoi', () => {
      const payload = { blocks: [{ block_title: 'X' }] };
      expect(() => parser.parse(JSON.stringify(payload), 'de.json')).toThrow(/Khoi 1.*block_type/);
    });

    test('TC-FP-14: CSV thieu cot bat buoc (vi du "de_bai") nem loi liet ke cot yeu cau', () => {
      const csv = `section,loai,muc_do,a,b,dap_an\nP,TN,Nhan_Biet,1,2,A\n`;
      expect(() => parser.parse(csv, 'de.csv')).toThrow(/de_bai/);
    });

    test('TC-FP-15: CSV co gia tri "loai" khong hop le nem loi kem so dong', () => {
      const csv = `section,loai,muc_do,de_bai,dap_an\nP,SAI_LOAI,Nhan_Biet,abc,A\n`;
      expect(() => parser.parse(csv, 'de.csv')).toThrow(/Dong 2.*loai/);
    });

    test('TC-FP-16: CSV MCQ co dap_an khong khop lua chon nao nem loi', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,dap_an\nP,TN,Nhan_Biet,abc,1,2,Z\n`;
      expect(() => parser.parse(csv, 'de.csv')).toThrow(/khong khop/);
    });

    test('TC-FP-16b: CSV DUNG_SAI voi dap_an khac "Dung"/"Sai" nem loi', () => {
      const csv = `section,loai,muc_do,de_bai,dap_an\nP,DUNG_SAI,Nhan_Biet,abc,Maybe\n`;
      expect(() => parser.parse(csv, 'de.csv')).toThrow(/Dung.*Sai/);
    });

    test('TC-FP-16c: CSV DIEN_TU thieu dap_an nem loi', () => {
      const csv = `section,loai,muc_do,de_bai,dap_an\nP,DIEN_TU,Nhan_Biet,abc,\n`;
      expect(() => parser.parse(csv, 'de.csv')).toThrow(/thieu "dap_an"/);
    });

    test('TC-FP-17: dinh dang tep khong ho tro (.xlsx, .pdf, .docx) bi tu choi', () => {
      expect(() => parser.parse('data', 'de.xlsx')).toThrow(/khong duoc ho tro/);
      expect(() => parser.parse('data', 'de.pdf')).toThrow(/khong duoc ho tro/);
      expect(() => parser.parse('data', 'de.docx')).toThrow(/khong duoc ho tro/);
    });

    test('TC-FP-18: CSV chi co dong tieu de, khong co du lieu nem loi', () => {
      const csv = `section,loai,muc_do,de_bai,a,b,dap_an\n`;
      expect(() => parser.parse(csv, 'de.csv')).toThrow(/dong tieu de va it nhat 1 dong du lieu/);
    });
  });

  // ---------------------------------------------------------------------
  // 4. EXCEPTION / ERROR HANDLING
  // ---------------------------------------------------------------------
  describe('Exception Handling', () => {
    test('TC-FP-19: ten tep khong co phan mo rong (khong dau cham) khong lam crash, bi tu choi hop le', () => {
      expect(() => parser.parse('noi dung', 'defile')).toThrow(/khong duoc ho tro/);
    });

    test('TC-FP-20: ten tep rong khong lam crash, bi tu choi hop le', () => {
      expect(() => parser.parse('noi dung', '')).toThrow(/khong duoc ho tro/);
    });
  });

  // ---------------------------------------------------------------------
  // 5. HO TRO .DOCX (mammoth) - qua diem vao parseFile()
  // ---------------------------------------------------------------------
  describe('parseFile() va ho tro .docx', () => {
    // Xay dung tep .docx that (nen zip) + goi mammoth de giai nen/doc XML
    // cham hon nhieu so voi cac test parse chuoi thuan tuy o tren, nen tang
    // timeout cho ca nhom test nay.
    jest.setTimeout(20000);

    test('TC-FP-21 [Happy]: tep .docx dung dinh dang chuan duoc trich xuat va parse dung', async () => {
      const file = await buildDocxFile([
        '===PHAN_1===',
        '[CAU_HOI]',
        'Loai: TN',
        'Muc_Do: Nhan_Biet',
        'De_Bai: 2 + 2 bang bao nhieu?',
        'A. 3',
        'B. 4',
        'Dap_An: B',
        'Loi_Giai: vi 2+2=4'
      ]);

      const blocks = await parser.parseFile(file);
      expect(blocks[0].questions[0].question_type).toBe('MCQ');
      expect(blocks[0].questions[0].correct_answer).toBe('B');
    });

    test('TC-FP-22 [Happy]: parseFile() cung dinh tuyen dung cho .json/.csv/.txt (khong chi .docx)', async () => {
      const jsonFile = new File([JSON.stringify({ blocks: [{ block_type: 'ESSAY', questions: [{ question_type: 'ESSAY', content: 'x' }] }] })], 'de.json');
      const blocks = await parser.parseFile(jsonFile);
      expect(blocks[0].block_type).toBe('ESSAY');
    });

    test('TC-FP-23 [Negative]: tep .docx co noi dung nhung SAI dinh dang chuan van bi TextPromptParser tu choi', async () => {
      const file = await buildDocxFile(['Day chi la mot doan van ban thong thuong, khong theo dinh dang cau hoi nao ca.']);
      await expect(parser.parseFile(file)).rejects.toThrow();
    });

    test('TC-FP-24 [Edge]: tep .docx rong (khong co doan van ban nao) bi tu choi voi thong bao ro rang', async () => {
      const file = await buildDocxFile([]);
      await expect(parser.parseFile(file)).rejects.toThrow(/khong co noi dung van ban/);
    });

    test('TC-FP-25 [Exception]: du lieu .docx bi hong (khong phai file zip/docx that) khong lam crash, nem loi ro rang', async () => {
      const corruptFile = new File([Buffer.from('day khong phai la mot tep docx hop le')], 'de.docx');
      await expect(parser.parseFile(corruptFile)).rejects.toThrow(/Khong the doc noi dung tep Word/);
    });
  });
});
