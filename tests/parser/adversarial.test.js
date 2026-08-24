const { TextPromptParser } = require('../../backend/parser/TextPromptParser.js');
const { FileUploadParser } = require('../../backend/parser/FileUploadParser.js');

/**
 * Fuzz / adversarial test cho tang parser: khong chi "sai dinh dang" thong
 * thuong ma con la du lieu co CHU DICH gay nham lan hoac tan cong (prototype
 * pollution, ky tu phan cach bi nhung trong noi dung, du lieu cuc lon,
 * unicode bien).
 */
describe('Adversarial: TextPromptParser', () => {
  let parser;
  beforeEach(() => { parser = new TextPromptParser(); });

  test('TC-ADV-P01 [Hieu nang]: 1000 cau hoi trong 1 lan parse hoan tat nhanh va dung so luong', () => {
    let raw = '===PHAN_1===\n';
    for (let i = 0; i < 1000; i++) {
      raw += `[CAU_HOI]\nLoai: TN\nMuc_Do: Nhan_Biet\nDe_Bai: Cau hoi so ${i}?\nA. Dung\nB. Sai\nDap_An: A\n\n`;
    }
    const start = Date.now();
    const [block] = parser.parse(raw);
    const elapsed = Date.now() - start;

    expect(block.questions).toHaveLength(1000);
    expect(elapsed).toBeLessThan(3000);
  });

  test('TC-ADV-P02 [Ghi nhan hanh vi - ambiguity]: neu De_Bai chua mot dong dung dinh dang "=...=", dong do bi hieu nham thanh header section moi va lam hong viec parse', () => {
    // Day la mot han che thuc te cua thuat toan tach section (dua tren dong
    // khop ^=+\s*(.+?)\s*=+$, tuc it nhat 1 dau "=" o dau va cuoi - xem
    // TextPromptParser.js). Dong "===VI_DU===" nam giua noi dung cau hoi bi
    // hieu nham thanh mot section MOI bat dau, cat dut cau hoi dang do; phan
    // con lai ("Do la mot vi du ve markdown.") khong co [CAU_HOI]/Loai hop le
    // nen parser bao loi thay vi tra ve 1 cau hoi duy nhat nhu nguoi dung
    // mong doi. Ghi lai de biet ranh gioi: giao vien khong nen de dong noi
    // dung trung khop dinh dang nay trong De_Bai.
    const raw = `===PHAN_1===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: Hay giai thich ky hieu sau:
===VI_DU===
Do la mot vi du ve markdown.
`;
    expect(() => parser.parse(raw)).toThrow(/Loai/);
  });

  test('TC-ADV-P02b [Ghi nhan hanh vi - ambiguity]: sau khi noi long dinh dang, mot dong CHI mot dau "=" o dau/cuoi (vd "=VI_DU=") cung bi hieu nham thanh header, rong hon truoc day (truoc chi "===" moi bi)', () => {
    const raw = `===PHAN_1===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: Hay giai thich ky hieu sau:
=VI_DU=
Do la mot vi du ve markdown.
`;
    expect(() => parser.parse(raw)).toThrow(/Loai/);
  });

  test('TC-ADV-P03 [Unicode bien]: noi dung chi gom khoang trang khong-chuan (zero-width space U+200B) khong bi .trim() nhan dien la rong', () => {
    // Ghi nhan hanh vi: String.prototype.trim() cua JS KHONG coi U+200B la
    // whitespace, nen mot De_Bai "chi co" U+200B se duoc coi la co noi dung
    // hop le (khac voi khoang trang thuong " " se bi tu choi). Day la mot
    // gap tiem an (noi dung "trong rong ve mat thi giac" van duoc chap
    // nhan), khong phai loi crash.
    const raw = `===P===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: ​
`;
    const [block] = parser.parse(raw);
    expect(block.questions[0].content).toBe('​');
  });

  test('TC-ADV-P04: noi dung chua ky hieu cong thuc injection (=cmd|, +HYPERLINK, @SUM) duoc giu nguyen van, khong bi dien giai/thuc thi', () => {
    const raw = `===P===
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: =cmd|'/c calc.exe'!A1 va @SUM(1,2) va +HYPERLINK("http://evil.com")
`;
    const [block] = parser.parse(raw);
    expect(block.questions[0].content).toBe("=cmd|'/c calc.exe'!A1 va @SUM(1,2) va +HYPERLINK(\"http://evil.com\")");
  });

  test('TC-ADV-P05: mot De_Bai cuc dai (50,000 ky tu) van duoc parse day du, khong bi cat bot', () => {
    const hugeLine = 'X'.repeat(50000);
    const raw = `===P===\n[CAU_HOI]\nLoai: TU_LUAN\nMuc_Do: Van_Dung\nDe_Bai: ${hugeLine}\n`;
    const [block] = parser.parse(raw);
    expect(block.questions[0].content).toHaveLength(50000);
  });
});

describe('Adversarial: FileUploadParser', () => {
  let parser;
  beforeEach(() => { parser = new FileUploadParser(); });

  afterEach(() => {
    // Don dep bat ky o nhiem nao co the sot lai tu cac test truoc, tranh anh
    // huong cheo sang cac test file khac trong cung tien trinh Jest.
    delete Object.prototype.polluted_marker_csv;
    delete Object.prototype.polluted_marker_json;
  });

  test('TC-ADV-P06 [Security]: cot CSV dat ten "__proto__" khong lam o nhiem Object.prototype', () => {
    const csv = `section,loai,muc_do,de_bai,a,b,dap_an,__proto__\nP,TN,Nhan_Biet,abc,1,2,A,{"polluted_marker_csv":true}\n`;
    parser.parse(csv, 'de.csv');
    expect({}.polluted_marker_csv).toBeUndefined();
  });

  test('TC-ADV-P07 [Security]: JSON co khoa "__proto__" o cap cao nhat khong lam o nhiem Object.prototype', () => {
    const raw = '{"blocks":[{"block_type":"ESSAY","questions":[{"question_type":"ESSAY","content":"x"}]}],"__proto__":{"polluted_marker_json":true}}';
    parser.parse(raw, 'de.json');
    expect({}.polluted_marker_json).toBeUndefined();
  });

  test('TC-ADV-P08 [Ghi nhan hanh vi]: dong CSV co SO COT it hon dong tieu de khong lam crash - cac cot con thieu duoc coi la rong', () => {
    const csv = `section,loai,muc_do,de_bai,a,b,dap_an\nP,TN,Nhan_Biet,abc,1\n`;
    expect(() => parser.parse(csv, 'de.csv')).toThrow(); // thieu dap_an vi cot bi cat cut -> loi nghiep vu ro rang, khong phai crash
  });

  test('TC-ADV-P09 [Ghi nhan hanh vi]: dong CSV co SO COT NHIEU hon dong tieu de khong lam crash - cot du bi bo qua', () => {
    const csv = `section,loai,muc_do,de_bai,a,b,dap_an\nP,TN,Nhan_Biet,abc,1,2,A,cot_du_thua,con_du_nua\n`;
    const [block] = parser.parse(csv, 'de.csv');
    expect(block.questions[0].correct_answer).toBe('A');
  });

  test('TC-ADV-P10: gia tri CSV chua ky hieu cong thuc injection duoc giu nguyen van khi doc tu tep', () => {
    const csv = `section,loai,muc_do,de_bai,dap_an\nP,DIEN_TU,Nhan_Biet,"=cmd|'/c calc'!A1","@SUM(1,2)"\n`;
    const [block] = parser.parse(csv, 'de.csv');
    expect(block.questions[0].content).toBe("=cmd|'/c calc'!A1");
    expect(block.questions[0].correct_answer).toBe('@SUM(1,2)');
  });

  test('TC-ADV-P11 [Hieu nang]: tep CSV 1000 dong duoc parse hoan tat nhanh va dung so luong', () => {
    let csv = 'section,loai,muc_do,de_bai,a,b,dap_an\n';
    for (let i = 0; i < 1000; i++) {
      csv += `P,TN,Nhan_Biet,Cau ${i},1,2,A\n`;
    }
    const start = Date.now();
    const [block] = parser.parse(csv, 'de.csv');
    const elapsed = Date.now() - start;

    expect(block.questions).toHaveLength(1000);
    expect(elapsed).toBeLessThan(3000);
  });
});
