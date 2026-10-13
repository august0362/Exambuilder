const TYPES = new Set(['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'ESSAY']);
const SPACES = new Set(['none', 'lined', 'blank', 'squared', 'table', 'drawing']);
const LEVELS = new Set(['NB', 'TH', 'VD', 'VDC']);
const POINTS = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

function toCents(value) {
  if (typeof value !== 'string' || !POINTS.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function validateTemplate(template) {
  const errors = [];
  const error = (path, message) => errors.push({ path, message });
  if (!template || typeof template !== 'object' || Array.isArray(template)) return [{ path: '', message: 'Template phải là đối tượng' }];
  if (template.schema_version !== 1) error('schema_version', 'Phiên bản schema không được hỗ trợ');
  if (typeof template.template_id !== 'string' || !/^[a-z0-9][a-z0-9.-]{2,100}$/.test(template.template_id)) error('template_id', 'Mã template không hợp lệ');
  if (typeof template.display_name !== 'string' || !template.display_name.trim() || template.display_name.length > 120) error('display_name', 'Tên mẫu không hợp lệ');
  if (template.origin !== 'builtin' && template.origin !== 'user') error('origin', 'Nguồn mẫu không hợp lệ');
  if (!Number.isSafeInteger(template.template_version) || template.template_version < 1) error('template_version', 'Phiên bản mẫu không hợp lệ');
  const defaults = template.defaults || {};
  const total = toCents(defaults.total_points);
  if (total === null || total <= 0) error('defaults.total_points', 'Tổng điểm không hợp lệ');
  if (!Array.isArray(template.sections) || template.sections.length < 1 || template.sections.length > 30) {
    error('sections', 'Mẫu cần từ 1 đến 30 phần');
    return errors;
  }
  const ids = new Set();
  let examTotal = 0;
  let slotCount = 0;
  template.sections.forEach((section, si) => {
    const path = `sections.${si}`;
    if (!section || typeof section !== 'object') { error(path, 'Phần không hợp lệ'); return; }
    if (typeof section.section_id !== 'string' || !section.section_id || ids.has(section.section_id)) error(`${path}.section_id`, 'Mã phần thiếu hoặc trùng');
    ids.add(section.section_id);
    if (typeof section.title !== 'string' || !section.title.trim() || section.title.length > 160) error(`${path}.title`, 'Tên phần không hợp lệ');
    if (section.stimulus != null && (typeof section.stimulus !== 'string' || section.stimulus.length > 50000)) error(`${path}.stimulus`, 'Đoạn đọc không hợp lệ');
    if (!Array.isArray(section.slots) || section.slots.length < 1 || section.slots.length > 100) { error(`${path}.slots`, 'Phần cần từ 1 đến 100 câu'); return; }
    let sectionTotal = 0;
    section.slots.forEach((slot, qi) => {
      const sp = `${path}.slots.${qi}`;
      if (!slot || typeof slot !== 'object') { error(sp, 'Slot không hợp lệ'); return; }
      slotCount++;
      if (typeof slot.slot_id !== 'string' || !slot.slot_id || ids.has(slot.slot_id)) error(`${sp}.slot_id`, 'Mã slot thiếu hoặc trùng');
      ids.add(slot.slot_id);
      if (!TYPES.has(slot.question_type)) error(`${sp}.question_type`, 'Loại câu không hợp lệ');
      if (slot.difficulty_level != null && !LEVELS.has(slot.difficulty_level)) error(`${sp}.difficulty_level`, 'Mức độ không hợp lệ');
      if (slot.position !== qi) error(`${sp}.position`, 'Thứ tự slot không liên tục');
      const points = toCents(slot.points);
      if (points === null || points <= 0) error(`${sp}.points`, 'Điểm câu không hợp lệ');
      else sectionTotal += points;
      const space = slot.answer_space;
      if (!space || !SPACES.has(space.kind)) error(`${sp}.answer_space.kind`, 'Loại vùng trả lời không hợp lệ');
      else if (![space.lines, space.min_lines, space.max_lines].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 100) || space.min_lines > space.max_lines || space.lines < space.min_lines || space.lines > space.max_lines) error(`${sp}.answer_space`, 'Số dòng trả lời không hợp lệ');
      if (slot.assets != null && !Array.isArray(slot.assets)) error(`${sp}.assets`, 'Danh sách ảnh không hợp lệ');
    });
    const declared = toCents(section.declared_points);
    if (declared === null || declared !== sectionTotal) error(`${path}.declared_points`, 'Điểm phần khác tổng điểm câu');
    examTotal += sectionTotal;
  });
  if (slotCount > 200) error('sections', 'Mẫu vượt giới hạn 200 câu');
  if (total !== null && total !== examTotal) error('defaults.total_points', 'Tổng điểm đề khác tổng điểm phần');
  const pagination = template.pagination || {};
  if (!['auto', 'max_pages'].includes(pagination.mode)) error('pagination.mode', 'Chế độ phân trang không hợp lệ');
  if (pagination.mode === 'max_pages' && (!Number.isSafeInteger(pagination.max_pages) || pagination.max_pages < 1 || pagination.max_pages > 100)) error('pagination.max_pages', 'Giới hạn trang không hợp lệ');
  return errors;
}

module.exports = { validateTemplate, toCents };
