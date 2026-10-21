// Ham dung chung giua trinh soan de (script.js) va thu vien mau (templateSystem.js):
// chuyen mau <-> blocks cua trinh soan de, snapshot template_binding va du lieu
// xuat DOCX theo mau. Khong cham DOM.

// Prompt mau co bien the theo AI; model API cua du an chon bien the theo hang.
export const VARIANT_BY_PROVIDER = { openai: 'ChatGPT', anthropic: 'Claude', gemini: 'Gemini', deepseek: 'DeepSeek' };

const TYPE_SHORT = { MCQ: 'TN', TRUE_FALSE: 'Đ/S', FILL_BLANK: 'điền', ESSAY: 'TL' };

// is_correct phai luon suy ra tu correct_answer: bo xao lua chon cua trinh soan
// de cu dua vao is_correct de tinh lai chu cai dap an sau khi xao.
export function syncCorrectOption(content) {
  if (!content || !Array.isArray(content.options)) return content;
  const key = String(content.correct_answer || '').trim().toUpperCase();
  content.options.forEach(option => { option.is_correct = option.option_key === key; });
  return content;
}

export function templateSlots(template) {
  return (template?.sections || []).flatMap(section => (section.slots || []).map(slot => ({ section, slot })));
}

// "8 TN + 3 TL · 10.00 điểm · 45 phút" - tom tat cau truc mau cho giao vien.
export function describeTemplate(template) {
  const counts = new Map();
  for (const { slot } of templateSlots(template)) counts.set(slot.question_type, (counts.get(slot.question_type) || 0) + 1);
  const parts = [...counts].map(([type, n]) => `${n} ${TYPE_SHORT[type] || type}`).join(' + ');
  const extra = [template?.defaults?.total_points ? `${template.defaults.total_points} điểm` : '', template?.defaults?.duration_minutes ? `${template.defaults.duration_minutes} phút` : ''].filter(Boolean);
  return [parts, ...extra].filter(Boolean).join(' · ');
}

// Blocks cho trinh soan de tu mau; contentOf(slot) tra noi dung cau (mac dinh
// slot.content). Moi cau giu template_slot_id + points de xuat lai theo mau.
export function templateToBlocks(template, contentOf = slot => slot.content) {
  return (template.sections || []).map(section => ({
    block_type: section.kind === 'ESSAY' ? 'ESSAY' : 'MULTIPLE_CHOICE',
    block_title: section.title,
    questions: (section.slots || []).map(slot => {
      const content = syncCorrectOption(structuredClone(contentOf(slot) || {}));
      return { question_type: slot.question_type, difficulty_level: content.difficulty_level || slot.difficulty_level,
        content: content.content || '', correct_answer: content.correct_answer || '',
        explanation: content.explanation || '', draft_lines_count: slot.answer_space?.lines || 0,
        options: content.options || [],
        template_slot_id: slot.slot_id, points: slot.points };
    })
  }));
}

export function buildAssetManifest(template) {
  const refs = new Map();
  const add = (assetId, role, pageNumber = null, metadata = {}) => {
    if (typeof assetId !== 'string' || !/^(?:image|document)-[0-9a-f]{64}$/.test(assetId)) return;
    refs.set(assetId, {
      ...metadata, asset_id: assetId, sha256: assetId.slice(assetId.indexOf('-') + 1), role,
      ...(pageNumber == null ? {} : { page_number: Number(pageNumber) }), transfer: 'reference_only',
      fallback: 'keep_exam_content_and_use_basic_layout_when_asset_is_missing'
    });
  };
  const background = template.appearance?.background || {};
  const storedAsset = assetId => (background.asset_manifest || []).find(asset => asset.asset_id === assetId) || {};
  const source = storedAsset(background.source_asset_id);
  add(background.source_asset_id, 'source_document', null, source || {});
  add(background.asset_id, 'page_background', null, storedAsset(background.asset_id));
  (background.pages || []).forEach(page => add(page.asset_id, 'page_background', page.page_number, { ...page, mime: page.mime || 'image/png' }));
  for (const section of template.sections || []) for (const slot of section.slots || []) {
    for (const ref of slot.assets || []) add(typeof ref === 'string' ? ref : ref?.asset_id, 'question_illustration', null, typeof ref === 'object' ? ref : {});
  }
  return [...refs.values()].sort((a, b) => a.asset_id.localeCompare(b.asset_id));
}

export function templateBinding(template) {
  return { schema_version: 1, template_id: template.template_id, template_version: template.template_version,
    template_snapshot: structuredClone(template), asset_manifest: buildAssetManifest(template) };
}

// Nguoc lai: dien noi dung cac cau trong trinh soan de vao ban sao snapshot mau
// (ghep theo template_slot_id). ok=false khi de da them/bot cau so voi mau -
// luc do khong xuat theo mau duoc nua.
export function fillTemplateFromBlocks(template, blocks) {
  const filled = structuredClone(template);
  const bySlot = new Map();
  let unmatched = 0;
  for (const block of blocks || []) for (const q of block.questions || []) {
    if (q.template_slot_id) bySlot.set(q.template_slot_id, q); else unmatched++;
  }
  let missing = 0;
  for (const { slot } of templateSlots(filled)) {
    const q = bySlot.get(slot.slot_id);
    if (!q) { missing++; continue; }
    bySlot.delete(slot.slot_id);
    slot.content = syncCorrectOption({ question_type: slot.question_type, difficulty_level: q.difficulty_level,
      content: q.content || '', options: structuredClone(q.options || []), correct_answer: q.correct_answer || '',
      explanation: q.explanation || '' });
  }
  unmatched += bySlot.size;
  return { template: filled, ok: missing === 0 && unmatched === 0, missing, unmatched };
}

// Du lieu gui /api/template-export/analyze va /docx.
export function templateExportInput(template, mode, metadata = {}) {
  const t = template;
  return { template: t, mode, paper: {
    size: t.appearance.paper, orientation: t.appearance.orientation,
    margins: { ...t.appearance.margins_mm }
  }, columns: t.appearance.columns,
  maxPages: t.pagination?.mode === 'max_pages' ? t.pagination.max_pages : null,
  metadata: { exam_title: t.defaults.exam_title || t.display_name, subject: t.defaults.subject, grade: t.defaults.grade,
    duration_minutes: t.defaults.duration_minutes, school: t.defaults.school_header,
    ...Object.fromEntries(Object.entries(metadata).filter(([, v]) => v != null && v !== '')) } };
}
