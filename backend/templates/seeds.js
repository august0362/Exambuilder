// Counts and point allocations below are engineering defaults, not mandated exam standards.
const SPECS = [
  ['t01', 'Đề kiểm tra 15 phút', 'short', 15, 1, [['Trắc nghiệm', 'MCQ', 4, '0.50'], ['Tự luận ngắn', 'ESSAY', 2, '4.00']]],
  ['t02', 'Đề kiểm tra 45 phút', 'period', 45, 1, [['Trắc nghiệm', 'MCQ', 8, '0.50'], ['Tự luận', 'ESSAY', 3, '2.00']]],
  ['t03', 'Đề giữa học kỳ', 'exam-period', 60, 1, [['Trắc nghiệm', 'MCQ', 12, '0.25'], ['Tự luận', 'ESSAY', 2, '3.50']]],
  ['t04', 'Đề cuối học kỳ', 'exam-period', 90, 1, [['Trắc nghiệm', 'MCQ', 16, '0.25'], ['Tự luận', 'ESSAY', 3, '2.00']]],
  ['t05', 'Đề 100% trắc nghiệm', 'objective', 45, 1, [['Trắc nghiệm', 'MCQ', 20, '0.50']]],
  ['t06', 'Đề 100% tự luận', 'written', 60, 1, [['Tự luận', 'ESSAY', 5, '2.00']]],
  ['t07', 'Đề kết hợp nhiều dạng câu', 'mixed', 60, 1, [['Trắc nghiệm', 'MCQ', 4, '0.50'], ['Đúng sai', 'TRUE_FALSE', 2, '0.50'], ['Điền khuyết', 'FILL_BLANK', 2, '0.50'], ['Tự luận', 'ESSAY', 2, '3.00']]],
  ['t08', 'Đề Toán có nhiều vùng trình bày lời giải', 'math', 60, 1, [['Lời giải', 'ESSAY', 4, '2.50']]],
  ['t09', 'Đề hai cột, tiết kiệm giấy', 'compact', 45, 2, [['Trắc nghiệm', 'MCQ', 10, '0.50'], ['Tự luận', 'ESSAY', 2, '2.50']]],
  ['t10', 'Đề Ngoại ngữ có phần đọc hiểu', 'language', 60, 1, [['Đọc hiểu', 'MCQ', 4, '0.50'], ['Từ vựng và ngữ pháp', 'MCQ', 4, '0.50'], ['Điền từ', 'FILL_BLANK', 2, '0.50'], ['Viết', 'ESSAY', 1, '5.00']]]
];

function cents(points) { return Math.round(Number(points) * 100); }
function money(value) { return (value / 100).toFixed(2); }
function makeSeed(spec, index) {
  const [code, display_name, category, duration_minutes, columns, groups] = spec;
  const sections = groups.map(([title, question_type, count, points], sectionIndex) => {
    const section_id = `builtin.${code}.s${String(sectionIndex + 1).padStart(2, '0')}`;
    const isEssay = question_type === 'ESSAY';
    const kind = isEssay ? 'ESSAY' : 'MULTIPLE_CHOICE';
    const lines = isEssay ? (code === 't08' ? 12 : 6) : question_type === 'FILL_BLANK' ? 2 : 0;
    return {
      section_id, title: `Phần ${sectionIndex + 1}. ${title}`, kind,
      declared_points: money(count * cents(points)),
      stimulus: code === 't10' && sectionIndex === 0 ? '' : null,
      layout: { columns: code === 't09' && !isEssay ? 2 : 1, keep_heading_with_next: true },
      slots: Array.from({ length: count }, (_, position) => ({
        slot_id: `${section_id}.q${String(position + 1).padStart(3, '0')}`,
        position, question_type, difficulty_level: position % 4 === 3 ? 'VD' : 'NB',
        points, required: true,
        answer_space: { kind: isEssay ? (code === 't08' && position === 3 ? 'drawing' : code === 't08' ? 'squared' : 'lined') : lines ? 'blank' : 'none', lines, min_lines: lines, max_lines: isEssay ? Math.max(lines, 24) : lines, auto_expand: isEssay },
        content: null, assets: []
      }))
    };
  });
  return {
    schema_version: 1, template_id: `builtin.${code}`, template_version: 1,
    display_name, origin: 'builtin', is_builtin: true, category,
    description: `${sections.reduce((sum, s) => sum + s.slots.length, 0)} câu, ${groups.length} phần; cấu trúc mẫu gốc cố định.`,
    subject_hint: null, tags: [category],
    defaults: { subject: '', grade: '', duration_minutes, total_points: '10.00', school_header: '', topic: '', school_year: '', semester: '' },
    appearance: {
      paper: 'A4', orientation: 'portrait', margins_mm: { top: 18, bottom: 18, left: 18, right: 18 },
      font_family: 'Arial', body_font_pt: 12, line_spacing: 1.25, columns,
      header: { enabled: true, fields: ['school', 'exam_title'] },
      footer: { enabled: index >= 2, fields: ['page_number'] },
      background: { asset_id: null, opacity: 0.12, fit: 'contain', apply_to: 'all' }
    },
    pagination: { mode: 'auto', max_pages: null }, sections,
    prompt_settings: { ruleset_version: 'current', extra_instructions: '', user_preset_id: null }
  };
}

const seeds = SPECS.map(makeSeed);
function getSeed(id) {
  const seed = seeds.find(item => item.template_id === id);
  return seed ? structuredClone(seed) : null;
}
function listSeeds() { return structuredClone(seeds); }
module.exports = { getSeed, listSeeds };
