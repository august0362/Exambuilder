const { extractFormatInstructions } = require('../../backend/llm/promptBuilder');
const { AI_PROMPT_VARIANTS } = require('../../frontend/promptVariants.js');
const { TextPromptParser } = require('../../backend/parser/TextPromptParser.js');

const EXPECTED_IDS = ['gemini', 'gemini_pro', 'chatgpt', 'deepseek', 'claude', 'grok'];

describe('frontend/promptVariants.js <-> AI_Prompts_Variants.txt (dong bo)', () => {
  test('TC-PV-01: dung du 5 bien the, dung thu tu, khong trung id', () => {
    expect(AI_PROMPT_VARIANTS.map(v => v.id)).toEqual(EXPECTED_IDS);
  });

  test('TC-PV-02: moi bien the co label/hint/exampleTopic khong rong', () => {
    for (const v of AI_PROMPT_VARIANTS) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.hint.length).toBeGreaterThan(0);
      expect(v.exampleTopic.length).toBeGreaterThan(0);
    }
  });

  test('TC-PV-03: template cua moi bien the chua nguyen van quy tac dinh dang dung chung', () => {
    const shared = extractFormatInstructions();
    for (const v of AI_PROMPT_VARIANTS) {
      expect(v.template).toContain(shared);
      expect(v.template).toContain('[NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY]');
    }
  });

  test('TC-PV-04: template co doan luu y rieng, khac nhau giua cac bien the', () => {
    const tails = AI_PROMPT_VARIANTS.map(v => v.template.split('LƯU Ý DÀNH RIÊNG CHO')[1]);
    for (const tail of tails) expect(tail).toBeDefined();
    expect(new Set(tails).size).toBe(AI_PROMPT_VARIANTS.length);
  });

  test('TC-PV-05: khong bien the nao lam hong dau "\\" cua LaTeX (template literal an mat)', () => {
    for (const v of AI_PROMPT_VARIANTS) {
      expect(v.template).toContain('\\sqrt{');
      expect(v.template).not.toContain('\f');
      expect(v.example).not.toContain('\f');
    }
  });
});

describe('Vi du mau cua tung bien the parse duoc (dan thang vao tab "Dan van ban")', () => {
  test.each(AI_PROMPT_VARIANTS.map(v => [v.id, v]))(
    'TC-PV-06 [%s]: parse thanh 2 khoi, du ca 4 loai cau, dap an dung',
    (_id, variant) => {
      const blocks = new TextPromptParser().parse(variant.example);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].block_type).toBe('MULTIPLE_CHOICE');
      expect(blocks[1].block_type).toBe('ESSAY');

      const types = blocks.flatMap(b => b.questions.map(q => q.question_type));
      expect(new Set(types)).toEqual(new Set(['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'ESSAY']));

      const mcqs = blocks[0].questions.filter(q => q.question_type === 'MCQ');
      for (const mcq of mcqs) {
        expect(mcq.options).toHaveLength(4);
        expect(mcq.options.filter(o => o.is_correct)).toHaveLength(1);
      }

      const tf = blocks[0].questions.find(q => q.question_type === 'TRUE_FALSE');
      expect(['Dung', 'Sai']).toContain(tf.correct_answer);

      const essay = blocks[1].questions[0];
      expect(essay.draft_lines_count).toBeGreaterThan(0);
    }
  );
});
