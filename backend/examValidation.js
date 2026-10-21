const VALID_BLOCK_TYPES = ['MULTIPLE_CHOICE', 'ESSAY'];
const VALID_QUESTION_TYPES = ['MCQ', 'FILL_BLANK', 'TRUE_FALSE', 'ESSAY'];
const VALID_DIFFICULTY_LEVELS = ['NB', 'TH', 'VD', 'VDC'];

/**
 * Doi chieu lai cac quy tac nghiep vu ma tang parser o frontend da dam bao
 * (xem backend/parser/TextPromptParser.js) truoc khi ghi CSDL, vi mot client
 * goi thang API co the bo qua tang parser do. Dung chung cho ca
 * POST /api/exams/save (link chia se) lan POST /api/archive (kho de).
 */
function validateExamPayload(blocks) {
  const errors = [];
  if (!Array.isArray(blocks)) {
    return ['blocks phai la mot mang'];
  }
  blocks.forEach((block, bi) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      errors.push(`Khoi ${bi + 1}: du lieu khoi khong hop le`);
      return;
    }
    if (!VALID_BLOCK_TYPES.includes(block.block_type)) {
      errors.push(`Khoi ${bi + 1}: block_type khong hop le ("${block.block_type}")`);
    }
    const questions = block.questions || [];
    if (!Array.isArray(questions)) {
      errors.push(`Khoi ${bi + 1}: questions phai la mot mang`);
      return;
    }
    questions.forEach((q, qi) => {
      const loc = `Khoi ${bi + 1} - Cau ${qi + 1}`;
      if (!q || typeof q !== 'object' || Array.isArray(q)) {
        errors.push(`${loc}: du lieu cau hoi khong hop le`);
        return;
      }
      if (!VALID_QUESTION_TYPES.includes(q.question_type)) {
        errors.push(`${loc}: question_type khong hop le ("${q.question_type}")`);
      }
      if (!q.content || !String(q.content).trim()) {
        errors.push(`${loc}: thieu noi dung cau hoi`);
      }
      if (q.difficulty_level && !VALID_DIFFICULTY_LEVELS.includes(q.difficulty_level)) {
        errors.push(`${loc}: difficulty_level khong hop le ("${q.difficulty_level}")`);
      }
      if (q.question_type === 'MCQ') {
        const options = q.options || [];
        if (!Array.isArray(options)) {
          errors.push(`${loc}: options phai la mot mang`);
          return;
        }
        options.forEach((option, oi) => {
          if (!option || typeof option !== 'object' || Array.isArray(option)) {
            errors.push(`${loc}: lua chon ${oi + 1} khong hop le`);
          }
        });
        if (options.some(o => !o || typeof o !== 'object' || Array.isArray(o))) return;
        if (options.length < 2) {
          errors.push(`${loc}: cau trac nghiem can it nhat 2 lua chon`);
        } else if (q.correct_answer && !options.some(o => o.option_key === q.correct_answer)) {
          errors.push(`${loc}: correct_answer khong khop voi bat ky lua chon nao`);
        }
        const keys = options.map(o => o.option_key);
        if (new Set(keys).size !== keys.length) {
          errors.push(`${loc}: co lua chon bi trung option_key`);
        }
      }
      if (q.question_type === 'TRUE_FALSE' && q.correct_answer && !['Dung', 'Sai'].includes(q.correct_answer)) {
        errors.push(`${loc}: correct_answer phai la "Dung" hoac "Sai"`);
      }
    });
  });
  return errors;
}

module.exports = {
  VALID_BLOCK_TYPES,
  VALID_QUESTION_TYPES,
  VALID_DIFFICULTY_LEVELS,
  validateExamPayload
};
