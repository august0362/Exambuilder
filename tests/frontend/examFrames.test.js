const { getSeed } = require('../../backend/templates/seeds');
const { describeTemplate, templateToBlocks, fillTemplateFromBlocks, templateBinding, templateExportInput, syncCorrectOption } = require('../../frontend/examFrames.js');

function filledContent(slot, i) {
  const base = { content: `Câu ${i}\na) ý một\nb) ý hai`, correct_answer: 'C', explanation: `Lời giải ${i}`, difficulty_level: 'TH' };
  if (slot.question_type === 'MCQ') base.options = ['A', 'B', 'C', 'D'].map(k => ({ option_key: k, option_text: `PA ${k}`, is_correct: false }));
  return base;
}

describe('examFrames (khung de dung chung)', () => {
  test('TC-EF-01: describeTemplate tom tat so cau theo loai, diem, thoi gian', () => {
    expect(describeTemplate(getSeed('builtin.t02'))).toBe('8 TN + 3 TL · 10.00 điểm · 45 phút');
  });

  test('TC-EF-02: templateToBlocks giu template_slot_id, diem, so dong; is_correct suy tu correct_answer', () => {
    const t = getSeed('builtin.t01');
    let i = 0;
    const blocks = templateToBlocks(t, slot => filledContent(slot, ++i));
    expect(blocks.map(b => b.block_type)).toEqual(['MULTIPLE_CHOICE', 'ESSAY']);
    const mcq = blocks[0].questions[0];
    expect(mcq.template_slot_id).toBe('builtin.t01.s01.q001');
    expect(mcq.points).toBe('0.50');
    expect(mcq.options.find(o => o.is_correct).option_key).toBe('C');
    expect(blocks[1].questions[0].draft_lines_count).toBe(6);
    expect(mcq.content.split('\n')).toHaveLength(3);
  });

  test('TC-EF-03: slot chua co noi dung -> cau rong (khong crash)', () => {
    const blocks = templateToBlocks(getSeed('builtin.t01'), () => null);
    expect(blocks[0].questions[0]).toMatchObject({ content: '', options: [], correct_answer: '' });
  });

  test('TC-EF-04: fillTemplateFromBlocks ghep lai dung slot sau khi giao vien sua tren A4', () => {
    const t = getSeed('builtin.t01');
    let i = 0;
    const blocks = templateToBlocks(t, slot => filledContent(slot, ++i));
    blocks[0].questions[0].content = 'Đã sửa trên A4';
    blocks[0].questions[0].correct_answer = 'A';
    const { template, ok, missing, unmatched } = fillTemplateFromBlocks(t, blocks);
    expect({ ok, missing, unmatched }).toEqual({ ok: true, missing: 0, unmatched: 0 });
    const slot = template.sections[0].slots[0];
    expect(slot.content.content).toBe('Đã sửa trên A4');
    expect(slot.content.options.find(o => o.is_correct).option_key).toBe('A');
    expect(t.sections[0].slots[0].content).toBeNull(); // khong sua mau goc
  });

  test('TC-EF-05: de da them/bot cau so voi mau -> ok=false (khong xuat theo mau)', () => {
    const t = getSeed('builtin.t01');
    const blocks = templateToBlocks(t, slot => filledContent(slot, 1));
    blocks[0].questions.pop();
    blocks[1].questions.push({ question_type: 'ESSAY', content: 'Câu thêm', options: [] });
    expect(fillTemplateFromBlocks(t, blocks)).toMatchObject({ ok: false, missing: 1, unmatched: 1 });
  });

  test('TC-EF-06: templateBinding + templateExportInput (metadata rong khong de gia tri mau)', () => {
    const t = getSeed('builtin.t02');
    const binding = templateBinding(t);
    expect(binding).toMatchObject({ schema_version: 1, template_id: 'builtin.t02', template_version: 1, asset_manifest: [] });
    const input = templateExportInput(t, 'teacher', { exam_title: 'Đề Toán', subject: '', duration_minutes: null });
    expect(input.mode).toBe('teacher');
    expect(input.metadata).toMatchObject({ exam_title: 'Đề Toán', duration_minutes: 45 });
    expect(input.paper.size).toBe('A4');
  });

  test('TC-EF-07: syncCorrectOption chiu duoc noi dung khong co lua chon', () => {
    expect(syncCorrectOption(null)).toBeNull();
    expect(syncCorrectOption({ correct_answer: 'Dung' })).toEqual({ correct_answer: 'Dung' });
  });
});
