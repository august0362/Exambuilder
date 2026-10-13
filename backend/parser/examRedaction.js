// Ban de gui hoc sinh (link chia se): bo dap an, loi giai, co is_correct va
// snapshot template (chua noi dung + dap an slot). Dung chung cho trinh duyet
// (link ?data=) va server (GET /api/exams/shared/:code) - an bang CSS khong du
// vi hoc sinh co the tat che do hoc sinh hoac doc payload.
export function redactExamForStudent(exam) {
  if (!exam || typeof exam !== 'object') return exam;
  const { template_binding: _binding, ...rest } = exam;
  return {
    ...rest,
    redacted_for_student: true,
    blocks: (Array.isArray(exam.blocks) ? exam.blocks : []).map(block => ({
      ...block,
      questions: (Array.isArray(block?.questions) ? block.questions : []).map(question => {
        const { correct_answer: _answer, explanation: _explanation, ...safe } = question || {};
        return {
          ...safe,
          correct_answer: null,
          explanation: null,
          options: Array.isArray(question?.options)
            ? question.options.map(({ is_correct: _correct, ...option }) => ({ ...option, is_correct: false }))
            : question?.options
        };
      })
    }))
  };
}
