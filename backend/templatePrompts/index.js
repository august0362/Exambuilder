const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');
const { RULESET_VERSION, GROUPS, VARIANTS, TYPE_TO_LEGACY, DIFFICULTY_TO_LEGACY, REPAIR_INTENTS, LEVEL_ORDER, getMathRules } = require('./rules');

const MAX_INPUT = 512 * 1024;
const LEGACY_TYPE = Object.fromEntries(Object.entries(TYPE_TO_LEGACY).map(([k, v]) => [v, k]));

function flatten(template) {
  if (!template || !Array.isArray(template.sections)) throw new Error('Template thiếu danh sách phần.');
  const slots = [];
  const seen = new Set();
  template.sections.forEach((section, sectionIndex) => {
    if (!section.section_id || !Array.isArray(section.slots)) throw new Error('Phần thiếu section_id hoặc slots.');
    section.slots.forEach((slot, slotIndex) => {
      if (!slot.slot_id || seen.has(slot.slot_id) || !TYPE_TO_LEGACY[slot.question_type]) throw new Error('Slot ID trùng/thiếu hoặc loại câu không hợp lệ.');
      seen.add(slot.slot_id);
      slots.push({ section, slot, sectionIndex, slotIndex });
    });
  });
  return slots;
}

function points(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

function selection(template, group, selectedSlotIds) {
  const all = flatten(template);
  if (!GROUPS.includes(group)) throw new Error('Nhóm prompt không hợp lệ.');
  if (group === 'FULL_EXAM') return all;
  if (!Array.isArray(selectedSlotIds) || !selectedSlotIds.length) throw new Error('Phải chọn ít nhất một slot.');
  const ids = new Set(selectedSlotIds);
  if (ids.size !== selectedSlotIds.length || selectedSlotIds.some(id => !all.some(item => item.slot.slot_id === id))) throw new Error('Danh sách slot chọn có ID trùng hoặc không tồn tại.');
  return all.filter(item => ids.has(item.slot.slot_id));
}

// Muc do AI phai tra ve cho slot: chi P3 tang/giam do kho moi lech muc cua slot.
function expectedDifficulty(slot, promptGroup, repairIntent) {
  const level = slot.difficulty_level;
  if (promptGroup !== 'REVIEW_REPAIR' || !LEVEL_ORDER.includes(level)) return level;
  const index = LEVEL_ORDER.indexOf(level);
  if (repairIntent === 'increase-difficulty') return LEVEL_ORDER[Math.min(index + 1, LEVEL_ORDER.length - 1)];
  if (repairIntent === 'decrease-difficulty') return LEVEL_ORDER[Math.max(index - 1, 0)];
  return level;
}
function checkRepairIntent(promptGroup, repairIntent) {
  if (promptGroup === 'REVIEW_REPAIR' && !Object.hasOwn(REPAIR_INTENTS, repairIntent)) throw new Error('Hành động kiểm tra/sửa không hợp lệ.');
}

function safeText(value) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim(); }

function buildTemplatePrompt(input) {
  if (Buffer.byteLength(JSON.stringify(input || {}), 'utf8') > MAX_INPUT) throw new Error('Dữ liệu tạo prompt vượt giới hạn 512 KiB.');
  const { template, promptGroup = 'FULL_EXAM', aiVariant = 'ChatGPT', selectedSlotIds = [], examMetadata = {}, topic, referenceSections = [], teacherExtraInstructions = '', repairIntent = 'rewrite-one', currentContent = {} } = input;
  if (!Object.hasOwn(VARIANTS, aiVariant)) throw new Error('Đích AI không hợp lệ.');
  checkRepairIntent(promptGroup, repairIntent);
  const targets = selection(template, promptGroup, selectedSlotIds);
  const meta = { ...(template.defaults || {}), ...examMetadata };
  const parts = [
    `EXAMBUILDER ${RULESET_VERSION} — ${promptGroup} — ${aiVariant}`,
    'Bạn là trợ lý tạo nội dung câu hỏi kiểm tra. Chỉ xuất VĂN BẢN THUẦN gồm câu hỏi, đáp án và lời giải. Không tạo ảnh, nền, DOCX, PDF hoặc thiết kế trang.',
    VARIANTS[aiVariant],
    `Template: ${safeText(template.template_id)}; phiên bản ${safeText(template.template_version)}; tên ${safeText(template.display_name)}.`,
    `Thông tin đề: tên ${safeText(meta.exam_title || template.display_name)}; môn ${safeText(meta.subject)}; lớp ${safeText(meta.grade)}; chủ đề ${safeText(topic ?? meta.topic)}; thời gian ${safeText(meta.duration_minutes)} phút.`,
    `CÚ PHÁP BẮT BUỘC (TUÂN THỦ TUYỆT ĐỐI ĐỂ PARSER ĐỌC ĐƯỢC):
1. Mỗi phần bắt đầu bằng đúng dòng: =PHAN_1=, =PHAN_2=... (không thêm bớt ký tự, không viết hoa thường khác, không viết hoa =Phan 1=).
2. Mỗi câu hỏi bắt đầu bằng đúng dòng: [CAU_HOI] trên một dòng riêng.
3. Thứ tự các trường trong mỗi câu PHẢI ĐÚNG và ĐẦY ĐỦ:
   Ma_Khung: <chép chính xác Ma_Khung được chỉ định bên dưới>
   Ma_Phan: <chép chính xác Ma_Phan được chỉ định bên dưới>
   Diem: <chép chính xác Diem được chỉ định bên dưới, ví dụ 0.50>
   Loai: <TN | DUNG_SAI | DIEN_TU | TU_LUAN>
   Muc_Do: <Nhan_Biet | Thong_Hieu | Van_Dung | Van_Dung_Cao>
   De_Bai: <Nội dung câu hỏi, công thức toán dùng $...$ hoặc $$...$$>
   (Nếu là TN thì BẮT BUỘC có 4 dòng lựa chọn):
   A. <Nội dung đáp án A>
   B. <Nội dung đáp án B>
   C. <Nội dung đáp án C>
   D. <Nội dung đáp án D>
   Dap_An: <Chữ cái A, B, C hoặc D nếu TN; Dung hoặc Sai nếu DUNG_SAI; từ/cụm từ điền nếu DIEN_TU; đáp án ngắn nếu TU_LUAN>
   Loi_Giai: <Lời giải chi tiết từng bước, cách tính toán hoặc giải thích rõ ràng>
   So_Dong_Nhap: <chép chính xác số dòng được chỉ định>
   Câu có nhiều ý nhỏ: dòng De_Bai chỉ ghi phần dẫn chung, rồi MỖI Ý MỘT DÒNG RIÊNG ngay bên dưới, bắt đầu bằng "a) ", "b) ", "c) "… (không dồn nhiều ý vào một dòng, không dùng "1)" hay "a."). Loi_Giai trình bày tương tự: lời giải mỗi ý một dòng bắt đầu bằng "a) ", "b) "….
4. QUY TẮC AN TOÀN CHỐNG LỖI CỦA AI:
   - KHÔNG bọc văn bản trong dấu code block markdown.
   - KHÔNG thêm lời chào, lời dẫn (ví dụ: "Dưới đây là đề thi...", "Hy vọng đề thi giúp ích..."), KHÔNG có lời kết.
   - KHÔNG được tự ý tạo thêm câu ngoài danh sách Ma_Khung bên dưới, KHÔNG được bỏ sót câu nào.
   - KHÔNG được đổi giá trị Diem hoặc So_Dong_Nhap.
   - Với trắc nghiệm (TN), Dap_An chỉ là MỘT chữ cái duy nhất (ví dụ: "Dap_An: B", không ghi "Dap_An: B. 5").
   - Lời giải (Loi_Giai) PHẢI chi tiết, không được để trống hoặc chỉ ghi lặp lại đáp án.`,
    'Loai: TN | DUNG_SAI | DIEN_TU | TU_LUAN. Muc_Do: Nhan_Biet | Thong_Hieu | Van_Dung | Van_Dung_Cao. TN cần bốn lựa chọn, Dap_An là một chữ A/B/C/D. DUNG_SAI dùng Dung/Sai. DIEN_TU có ___ trong De_Bai. TU_LUAN cần Dap_An và Loi_Giai đầy đủ.',
    getMathRules(),
    `CHỈ SINH ${targets.length} SLOT SAU:`
  ];
  let previousSection;
  targets.forEach(({ section, slot, sectionIndex, slotIndex }) => {
    if (section.section_id !== previousSection) {
      parts.push(`Phần ${sectionIndex + 1}: ${safeText(section.title)}; header đầu phần phải là dòng CHÍNH XÁC =PHAN_${sectionIndex + 1}=; Ma_Phan: ${safeText(section.section_id)}${section.stimulus ? `; ngữ liệu chung: ${safeText(section.stimulus)}` : ''}`);
      previousSection = section.section_id;
    }
    const lines = slot.answer_space?.lines ?? 0;
    parts.push(`${slotIndex + 1}. Ma_Khung: ${safeText(slot.slot_id)}; Ma_Phan: ${safeText(section.section_id)}; Diem: ${safeText(slot.points)}; Loai: ${TYPE_TO_LEGACY[slot.question_type]}; Muc_Do: ${DIFFICULTY_TO_LEGACY[expectedDifficulty(slot, promptGroup, repairIntent)] || safeText(slot.difficulty_level)}; So_Dong_Nhap: ${lines}; loại vùng trả lời: ${safeText(slot.answer_space?.kind)}.`);
  });
  if (promptGroup !== 'FULL_EXAM') parts.push('Mọi slot không liệt kê ở trên phải giữ nguyên. Không xuất lại nội dung của chúng.');
  if (promptGroup === 'REVIEW_REPAIR') {
    if (repairIntent === 'validate-only') parts.push('CHẾ ĐỘ CHỈ KIỂM TRA: chỉ xuất một đối tượng JSON văn bản {"rulesetVersion":"template-text-v1","issues":[{"slot_id":"...","severity":"warning|error","message":"...","suggested_fix":"..."}]}. Không xuất [CAU_HOI], không viết lại câu, không có Markdown. Đánh giá kiến thức chỉ là gợi ý để giáo viên xác nhận.');
    else parts.push(`Yêu cầu sửa (${repairIntent}): ${REPAIR_INTENTS[repairIntent]} Kiểm tra đáp án, lời giải, loại câu và điểm. Chỉ xuất bản sửa của các slot chọn; giáo viên sẽ duyệt diff trước khi áp dụng.`);
    for (const { slot } of targets) if (currentContent[slot.slot_id]) parts.push(`Nội dung hiện có của ${slot.slot_id}: ${safeText(JSON.stringify(currentContent[slot.slot_id]))}`);
  }
  if (referenceSections.length) parts.push(`NGỮ CẢNH THAM KHẢO:\n${referenceSections.map(safeText).join('\n---\n')}`);
  if (teacherExtraInstructions) parts.push(`YÊU CẦU THÊM CỦA GIÁO VIÊN (không được thay đổi cú pháp, phạm vi, điểm): ${safeText(teacherExtraInstructions)}`);
  if (!(promptGroup === 'REVIEW_REPAIR' && repairIntent === 'validate-only')) parts.push('CHỈ XUẤT các phần và khối [CAU_HOI] được yêu cầu, không lời mở đầu/kết, không Markdown. Ma_Khung, Ma_Phan, Diem là metadata cho adapter template.');
  const prompt = parts.join('\n\n');
  return { prompt, rulesetVersion: RULESET_VERSION, outputKind: promptGroup === 'REVIEW_REPAIR' && repairIntent === 'validate-only' ? 'review-report-v1' : 'question-blocks-v1', targetSlotIds: targets.map(x => x.slot.slot_id), sha256: crypto.createHash('sha256').update(prompt).digest('hex') };
}

function parseTemplateReviewReport(raw, selectedSlotIds) {
  const text = normalizeRaw(raw);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Báo cáo kiểm tra phải là JSON hợp lệ.'); }
  if (!data || data.rulesetVersion !== RULESET_VERSION || !Array.isArray(data.issues)) throw new Error('Báo cáo kiểm tra sai schema hoặc phiên bản.');
  const ids = new Set(selectedSlotIds);
  if (data.issues.length > 100) throw new Error('Báo cáo kiểm tra có quá nhiều nhận xét.');
  const issues = data.issues.map((value, index) => {
    if (!value || !ids.has(value.slot_id) || !['warning', 'error'].includes(value.severity) || typeof value.message !== 'string' || value.message.length > 2000) throw new Error(`Nhận xét ${index + 1} không hợp lệ hoặc ngoài phạm vi.`);
    return { slot_id: value.slot_id, severity: value.severity, human_readable_message: value.message, suggested_fix: typeof value.suggested_fix === 'string' ? value.suggested_fix.slice(0, 2000) : '' };
  });
  return { rulesetVersion: RULESET_VERSION, issues, canApply: false };
}

function issue(code, severity, message, item = {}, field, expected, actual) {
  return { code, severity, section_id: item.section?.section_id ?? null, slot_id: item.slot?.slot_id ?? null, question_index: item.slotIndex == null ? null : item.slotIndex + 1, field: field ?? null, expected: expected ?? null, actual: actual ?? null, human_readable_message: message, suggested_fix: severity === 'error' ? 'Sửa dữ liệu AI rồi kiểm tra lại.' : 'Giáo viên xem và xác nhận trước khi áp dụng.' };
}

function normalizeRaw(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Nội dung AI trống.');
  if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT) throw new Error('Nội dung AI vượt giới hạn 512 KiB.');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(raw)) throw new Error('Nội dung AI chứa ký tự điều khiển không hợp lệ.');
  let text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const fence = text.match(/^```(?:text|plaintext)?\s*\n([\s\S]*?)\n```$/i);
  if (fence) text = fence[1].trim();
  return text;
}

// Van ban AI copy tu khung chat co the mat het xuong dong ("=PHAN_1=[CAU_HOI]Ma_Khung: ...Ma_Phan: ...Diem: 0.50Loai: TN...").
// Khi do ca cau dinh vao dong "Ma_Khung:" va bi coi la metadata -> body rong.
// Chen lai xuong dong truoc cac moc cau truc (chi chen, khong xoa noi dung);
// cac truong Loai/De_Bai/... do TextPromptParser tu va.
function repairCollapsedLines(text) {
  return text
    .replace(/\[CAU_HOI\]/gi, '\n[CAU_HOI]\n')
    .replace(/(?<=[^=\n])(=+\s*PHAN_?\d+[A-Za-z0-9_]*\s*=+)/gi, '\n$1')
    .replace(/(=+\s*PHAN_?\d+[A-Za-z0-9_]*\s*=+)(?=[^=\n])/gi, '$1\n')
    .replace(/(?<=[^\n])(Ma_Khung|Ma_Phan|Diem)(\s*:)/g, '\n$1$2')
    .replace(/(?<=[^\n])(Loai|Muc_Do|De_Bai|Dap_An|Loi_Giai|So_Dong_Nhap)(\s*:)/g, '\n$1$2');
}

async function parseTemplateResponse(raw) {
  const text = repairCollapsedLines(normalizeRaw(raw));
  const { TextPromptParser } = await import(pathToFileURL(path.join(__dirname, '..', 'parser', 'TextPromptParser.js')).href);
  const parser = new TextPromptParser();
  const chunks = text.split(/\[CAU_HOI\]/i);
  if (chunks.length < 2) throw new Error('Không tìm thấy [CAU_HOI].');
  const parsed = [];
  let sectionNumber = 0;
  for (let i = 1; i < chunks.length; i++) {
    const before = chunks[i - 1];
    const headers = [...before.matchAll(/(?:^|\n)\s*=+\s*PHAN_?(\d+)[^\n]*=+\s*(?:\n|$)/gi)];
    if (headers.length) sectionNumber = Number(headers.at(-1)[1]);
    const lines = chunks[i].split('\n');
    const body = [];
    const metadata = {};
    const counts = {};
    const fieldCounts = {};
    const fieldValues = {};
    for (const line of lines) {
      if (/^\s*=+\s*PHAN_?\d+/i.test(line)) break;
      const match = line.match(/^\s*(Ma_Khung|Ma_Phan|Diem)\s*:\s*(.*?)\s*$/i);
      if (match) {
        const key = match[1].toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
        metadata[key] = match[2];
      } else {
        const field = line.match(/^\s*(Loai|Muc_Do|De_Bai|Dap_An|Loi_Giai|So_Dong_Nhap)\s*:/i);
        if (field) {
          const key = field[1].toLowerCase();
          fieldCounts[key] = (fieldCounts[key] || 0) + 1;
          fieldValues[key] = line.slice(field[0].length).trim();
        }
        body.push(line);
      }
    }
    const cleaned = `[CAU_HOI]\n${body.join('\n')}`;
    let question;
    try { question = parser.parse(`=PHAN_1=\n${cleaned}`)[0].questions[0]; }
    catch (error) { throw new Error(`Câu ${i}: ${error.message}`); }
    parsed.push({ metadata, counts, fieldCounts, fieldValues, question, sectionNumber, index: i, raw: cleaned });
  }
  return parsed;
}

async function prepareTemplateApply({ template, rawText, selectedSlotIds = [], promptGroup = 'FULL_EXAM', currentContent = {}, repairIntent = 'rewrite-one' }) {
  checkRepairIntent(promptGroup, repairIntent);
  const targets = selection(template, promptGroup, selectedSlotIds);
  const targetById = new Map(targets.map(item => [item.slot.slot_id, item]));
  const entries = await parseTemplateResponse(rawText);
  const issues = [];
  const assignments = [];
  const used = new Set();
  for (const entry of entries) {
    let item = targetById.get(entry.metadata.ma_khung);
    if (entry.metadata.ma_khung && !item) {
      issues.push(issue('UNEXPECTED_SLOT', 'error', `Câu ${entry.index}: Ma_Khung không thuộc phạm vi được chọn.`, {}, 'Ma_Khung', targets.map(x => x.slot.slot_id), entry.metadata.ma_khung));
      continue;
    }
    if (!item) {
      const candidates = targets.filter(x => !used.has(x.slot.slot_id) && x.slot.question_type === entry.question.question_type && (!entry.sectionNumber || x.sectionIndex + 1 === entry.sectionNumber));
      if (candidates.length === 1) {
        item = candidates[0];
        issues.push(issue('INFERRED_SLOT', 'warning', `Câu ${entry.index}: thiếu Ma_Khung; đã gợi ý slot duy nhất, cần giáo viên duyệt.`, item, 'Ma_Khung', item.slot.slot_id, null));
      } else {
        issues.push(issue('AMBIGUOUS_SLOT', 'error', `Câu ${entry.index}: thiếu Ma_Khung và không thể ghép chắc chắn.`, {}, 'Ma_Khung', null, null));
        continue;
      }
    }
    if (used.has(item.slot.slot_id)) { issues.push(issue('DUPLICATE_SLOT', 'error', `Slot ${item.slot.slot_id} xuất hiện nhiều lần.`, item, 'Ma_Khung')); continue; }
    used.add(item.slot.slot_id);
    if (entry.counts.ma_khung > 1 || entry.counts.ma_phan > 1 || entry.counts.diem > 1) issues.push(issue('DUPLICATE_METADATA', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: metadata bị lặp.`, item));
    if (Object.values(entry.fieldCounts).some(count => count > 1)) issues.push(issue('DUPLICATE_FIELD', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: trường câu hỏi bị lặp.`, item));
    if (/<\s*\/?\s*(script|iframe|object|embed|svg|img|style)\b/i.test(entry.raw)) issues.push(issue('UNSAFE_MARKUP', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: nội dung có thẻ HTML không an toàn.`, item));
    if (entry.metadata.ma_phan && entry.metadata.ma_phan !== item.section.section_id) issues.push(issue('SECTION_MISMATCH', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: Ma_Phan không khớp.`, item, 'Ma_Phan', item.section.section_id, entry.metadata.ma_phan));
    if (entry.sectionNumber && entry.sectionNumber !== item.sectionIndex + 1) issues.push(issue('SECTION_ORDER', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: header phần không khớp.`, item));
    if (entry.question.question_type !== item.slot.question_type) issues.push(issue('TYPE_MISMATCH', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: loại câu không khớp.`, item, 'Loai', item.slot.question_type, entry.question.question_type));
    const level = expectedDifficulty(item.slot, promptGroup, repairIntent);
    // P1/P2: giao vien thuong ghi phan bo muc do trong "Yeu cau them" khac voi
    // muc mac dinh cua slot -> chi canh bao, ap dung thi slot nhan muc AI tra.
    // P3 (sua/tang/giam do kho) van bat buoc dung muc.
    if (level && entry.question.difficulty_level !== level) {
      const strict = promptGroup === 'REVIEW_REPAIR';
      issues.push(issue('DIFFICULTY_MISMATCH', strict ? 'error' : 'warning', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: mức độ ${strict ? 'không khớp' : `AI trả (${entry.question.difficulty_level}) khác mức của slot (${level}); áp dụng sẽ đổi mức của slot`}.`, item, 'Muc_Do', level, entry.question.difficulty_level));
    }
    const before = currentContent[item.slot.slot_id] ?? item.slot.content ?? null;
    if (promptGroup === 'REVIEW_REPAIR' && ['improve-solution', 'restyle-keep-answer'].includes(repairIntent) && before?.correct_answer && String(before.correct_answer).trim() !== String(entry.question.correct_answer ?? '').trim()) issues.push(issue('ANSWER_CHANGED', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: hành động này phải giữ nguyên đáp án.`, item, 'Dap_An', before.correct_answer, entry.question.correct_answer));
    if (entry.metadata.diem == null) issues.push(issue('LEGACY_POINTS', 'warning', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: văn bản cũ không có Diem; giữ điểm của template.`, item, 'Diem', item.slot.points, null));
    else if (points(entry.metadata.diem) !== points(item.slot.points)) issues.push(issue('POINTS_MISMATCH', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: điểm không khớp.`, item, 'Diem', item.slot.points, entry.metadata.diem));
    if (!entry.question.correct_answer || !entry.question.explanation) issues.push(issue('INCOMPLETE_ANSWER', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: thiếu đáp án hoặc lời giải.`, item, 'Dap_An/Loi_Giai'));
    if (entry.question.question_type === 'MCQ' && entry.question.options.length !== 4) issues.push(issue('OPTION_COUNT', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: TN phải có 4 lựa chọn.`, item, 'options', 4, entry.question.options.length));
    const expectedLines = Number(item.slot.answer_space?.lines || 0);
    if (entry.fieldValues.so_dong_nhap == null && expectedLines === 0) issues.push(issue('LEGACY_LINES', 'warning', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: văn bản cũ không có So_Dong_Nhap; giữ 0 dòng.`, item, 'So_Dong_Nhap', 0, null));
    else if (entry.fieldValues.so_dong_nhap == null || !/^\d+$/.test(entry.fieldValues.so_dong_nhap) || expectedLines !== Number(entry.fieldValues.so_dong_nhap)) issues.push(issue('LINES_MISMATCH', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: số dòng không khớp.`, item, 'So_Dong_Nhap', expectedLines, entry.fieldValues.so_dong_nhap ?? null));
    assignments.push({ slot_id: item.slot.slot_id, section_id: item.section.section_id, before, after: entry.question });
  }
  for (const item of targets) if (!used.has(item.slot.slot_id)) issues.push(issue('MISSING_SLOT', 'error', `Phần ${item.sectionIndex + 1} – Câu ${item.slotIndex + 1}: thiếu nội dung slot.`, item));
  return { rulesetVersion: RULESET_VERSION, valid: !issues.some(x => x.severity === 'error'), requiresReview: true, issues, assignments, targetSlotIds: targets.map(x => x.slot.slot_id), receivedCount: entries.length };
}

function applyTemplateDraft({ currentContent = {}, draft, confirmed = false }) {
  if (!confirmed) throw new Error('Cần xác nhận trước khi áp dụng nội dung AI.');
  if (!draft || !draft.valid || draft.rulesetVersion !== RULESET_VERSION) throw new Error('Bản nháp không hợp lệ hoặc khác phiên bản quy tắc.');
  const content = { ...currentContent };
  const undo = {};
  for (const assignment of draft.assignments) {
    undo[assignment.slot_id] = Object.hasOwn(content, assignment.slot_id) ? content[assignment.slot_id] : null;
    content[assignment.slot_id] = structuredClone(assignment.after);
  }
  return { content, undo };
}

module.exports = { RULESET_VERSION, GROUPS, VARIANTS, buildTemplatePrompt, parseTemplateResponse, parseTemplateReviewReport, prepareTemplateApply, applyTemplateDraft, flatten };
