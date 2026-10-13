const { redactExamForStudent } = require('../../backend/parser/examRedaction');

const exam = {
  title: 'De', subject: 'Toan',
  template_binding: { template_snapshot: { sections: [{ slots: [{ content: { correct_answer: 'B', explanation: 'bi mat' } }] }] } },
  blocks: [{
    block_type: 'MULTIPLE_CHOICE', block_title: 'Phan 1',
    questions: [
      { id: 'q1', question_type: 'MCQ', content: '2 + 3 = ?', correct_answer: 'B', explanation: 'Vi 2 + 3 = 5.',
        options: [{ option_key: 'A', option_text: '4', is_correct: false }, { option_key: 'B', option_text: '5', is_correct: true }] },
      { id: 'q2', question_type: 'ESSAY', content: 'Giai x + 1 = 3', correct_answer: 'x = 2', explanation: 'Tru 1 hai ve', draft_lines_count: 4 }
    ]
  }]
};

test('TC-RED-01: ban hoc sinh khong con dap an, loi giai, is_correct hay snapshot template', () => {
  const safe = redactExamForStudent(exam);
  const json = JSON.stringify(safe);
  expect(json).not.toContain('Vi 2 + 3 = 5.');
  expect(json).not.toContain('bi mat');
  expect(json).not.toContain('x = 2');
  expect(safe.template_binding).toBeUndefined();
  expect(safe.blocks[0].questions[0].options.every(o => o.is_correct === false)).toBe(true);
  expect(safe.blocks[0].questions[0].correct_answer).toBeNull();
  expect(safe.redacted_for_student).toBe(true);
});

test('TC-RED-02: giu nguyen de bai, lua chon, so dong nhap va khong sua doi ban goc', () => {
  const safe = redactExamForStudent(exam);
  expect(safe.blocks[0].questions[0].content).toBe('2 + 3 = ?');
  expect(safe.blocks[0].questions[0].options.map(o => o.option_text)).toEqual(['4', '5']);
  expect(safe.blocks[0].questions[1].draft_lines_count).toBe(4);
  expect(exam.blocks[0].questions[0].correct_answer).toBe('B');
  expect(exam.blocks[0].questions[0].options[1].is_correct).toBe(true);
});

test('TC-RED-03: du lieu thieu blocks/questions khong lam vo ham', () => {
  expect(redactExamForStudent(null)).toBeNull();
  expect(redactExamForStudent({ title: 'x' }).blocks).toEqual([]);
  expect(redactExamForStudent({ blocks: [{ block_title: 'a' }] }).blocks[0].questions).toEqual([]);
});
