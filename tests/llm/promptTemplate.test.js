const fs = require('fs');
const path = require('path');
const { extractFormatInstructions } = require('../../backend/llm/promptBuilder');
const { EXAM_PROMPT_TEMPLATE, EXAM_PROMPT_EXAMPLE } = require('../../frontend/promptTemplate.js');
const { TextPromptParser } = require('../../backend/parser/TextPromptParser.js');

const TXT = fs.readFileSync(path.join(__dirname, '..', '..', 'Gemini_Prompt_Unified.txt'), 'utf8');

describe('frontend/promptTemplate.js <-> Gemini_Prompt_Unified.txt (dong bo)', () => {
  test('TC-PT-01: EXAM_PROMPT_TEMPLATE trung khop PHAN 2 (chay "npm run gen:prompt" neu that bai)', () => {
    expect(EXAM_PROMPT_TEMPLATE).toBe(extractFormatInstructions());
  });

  test('TC-PT-02: EXAM_PROMPT_EXAMPLE trung khop PHAN 3 (vi du) trong file .txt', () => {
    const example = TXT.slice(TXT.lastIndexOf('=PHAN_1_TRAC_NGHIEM=')).trim();
    expect(EXAM_PROMPT_EXAMPLE).toBe(example);
  });

  test('TC-PT-03: meta-prompt giu du cac moc dinh dang cot loi + placeholder chu de', () => {
    for (const token of ['[CAU_HOI]', '=PHAN_1_TRAC_NGHIEM=', '=PHAN_2_TU_LUAN=',
      'Loai:', 'Muc_Do:', 'De_Bai:', 'Dap_An:', 'Loi_Giai:', 'So_Dong_Nhap:',
      'TN', 'DUNG_SAI', 'DIEN_TU', 'TU_LUAN',
      'Nhan_Biet', 'Thong_Hieu', 'Van_Dung', 'Van_Dung_Cao']) {
      expect(EXAM_PROMPT_TEMPLATE).toContain(token);
    }
    expect(EXAM_PROMPT_TEMPLATE).toContain('[NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY]');
  });

  test('TC-PT-04: LaTeX trong template khong bi template literal an mat dau "\\"', () => {
    expect(EXAM_PROMPT_TEMPLATE).toContain('\\frac');
    expect(EXAM_PROMPT_TEMPLATE).toContain('\\sqrt[3]');
    expect(EXAM_PROMPT_EXAMPLE).toContain('\\sqrt{16}');
    expect(EXAM_PROMPT_TEMPLATE).not.toContain('\f'); // form-feed = dau hieu "\f" bi hieu sai
    expect(EXAM_PROMPT_EXAMPLE).not.toContain('\f');
  });
});

describe('EXAM_PROMPT_EXAMPLE parse duoc (dan thang vao tab "Dan van ban")', () => {
  test('TC-PT-05: parse thanh 2 khoi, du ca 4 loai cau, dap an dung', () => {
    const blocks = new TextPromptParser().parse(EXAM_PROMPT_EXAMPLE);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].block_type).toBe('MULTIPLE_CHOICE');
    expect(blocks[1].block_type).toBe('ESSAY');

    const types = blocks.flatMap(b => b.questions.map(q => q.question_type));
    expect(new Set(types)).toEqual(new Set(['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'ESSAY']));

    const mcq = blocks[0].questions.find(q => q.question_type === 'MCQ');
    expect(mcq.options).toHaveLength(4);
    expect(mcq.options.filter(o => o.is_correct)).toHaveLength(1);

    const tf = blocks[0].questions.find(q => q.question_type === 'TRUE_FALSE');
    expect(['Dung', 'Sai']).toContain(tf.correct_answer);

    const essay = blocks[1].questions[0];
    expect(essay.draft_lines_count).toBeGreaterThan(0);
  });
});
